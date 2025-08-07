import { createClient, RedisClientType } from 'redis';
import { ethers } from 'ethers';
import { createLogger } from '../utils/logger.js';
import { PaymentVerifier } from './payment-verifier.js';
import { CircuitBreaker, DEFAULT_CONFIGS, circuitBreakerManager } from './circuit-breaker.js';

const logger = createLogger('PersistentJobQueue');

export interface PendingCompletion {
  jobId: string;
  blobTxHash: string;
  timestamp: number;
  retryCount: number;
  lastError?: string;
}

const QUEUE_KEY = 'blobkit:pending_completions';
const JOB_PREFIX = 'blobkit:job:';

/**
 * Redis-backed persistent job completion queue
 * Ensures jobs survive proxy restarts
 */
export class PersistentJobQueue {
  private redis: RedisClientType;
  private retryInterval: NodeJS.Timeout | null = null;
  private readonly maxRetries = 10;
  private readonly retryDelayMs = 30000; // 30 seconds
  private isConnected = false;
  private circuitBreaker: CircuitBreaker;

  constructor(
    private paymentVerifier: PaymentVerifier,
    private signer: ethers.Signer,
    private redisUrl: string = process.env.REDIS_URL || 'redis://localhost:6379'
  ) {
    this.redis = createClient({ url: this.redisUrl });

    // Initialize circuit breaker
    this.circuitBreaker = new CircuitBreaker(DEFAULT_CONFIGS.redisConnection);
    circuitBreakerManager.register(this.circuitBreaker, DEFAULT_CONFIGS.redisConnection);

    this.redis.on('error', (err: Error) => {
      logger.error('Redis connection error:', err);
      this.isConnected = false;
    });

    this.redis.on('connect', () => {
      logger.info('Redis connected');
      this.isConnected = true;
    });
  }

  /**
   * Connect to Redis and recover pending jobs
   */
  async connect(): Promise<void> {
    await this.redis.connect();
    await this.recoverPendingJobs();
  }

  /**
   * Disconnect from Redis
   */
  async disconnect(): Promise<void> {
    this.stop();
    await this.redis.quit();
    this.isConnected = false;
  }

  /**
   * Start the retry processing loop
   */
  start(): void {
    if (this.retryInterval) {
      return;
    }

    this.retryInterval = setInterval(() => {
      this.processRetries().catch(error => {
        logger.error('Error processing retries:', error);
      });
    }, this.retryDelayMs);

    logger.info('Persistent job completion retry queue started');
  }

  /**
   * Stop the retry processing loop
   */
  stop(): void {
    if (this.retryInterval) {
      clearInterval(this.retryInterval);
      this.retryInterval = null;
    }

    logger.info('Job completion retry queue stopped');
  }

  /**
   * Add a job completion to the retry queue (persisted in Redis)
   */
  async addPendingCompletion(jobId: string, blobTxHash: string): Promise<void> {
    if (!this.isConnected) {
      throw new Error('Redis not connected');
    }

    const pending: PendingCompletion = {
      jobId,
      blobTxHash,
      timestamp: Date.now(),
      retryCount: 0
    };

    // Store in Redis with atomic operations
    const key = `${JOB_PREFIX}${jobId}`;

    await this.redis
      .multi()
      .hSet(key, {
        jobId,
        blobTxHash,
        timestamp: pending.timestamp.toString(),
        retryCount: '0'
      })
      .sAdd(QUEUE_KEY, jobId)
      .expire(key, 86400) // 24 hour TTL
      .exec();

    logger.info(`Added job ${jobId} to persistent completion retry queue`);
  }

  /**
   * Remove a job from the queue after successful completion
   */
  private async removeCompletion(jobId: string): Promise<void> {
    const key = `${JOB_PREFIX}${jobId}`;

    await this.redis.multi().del(key).sRem(QUEUE_KEY, jobId).exec();

    logger.info(`Removed completed job ${jobId} from queue`);
  }

  /**
   * Recover pending jobs from Redis on startup
   */
  private async recoverPendingJobs(): Promise<void> {
    try {
      const jobIds = await this.redis.sMembers(QUEUE_KEY);

      if (jobIds.length > 0) {
        logger.info(`Recovering ${jobIds.length} pending jobs from Redis`);

        for (const jobId of jobIds) {
          const key = `${JOB_PREFIX}${jobId}`;
          const jobData = await this.redis.hGetAll(key);

          if (!jobData || !jobData.jobId) {
            // Clean up orphaned entry
            await this.redis.sRem(QUEUE_KEY, jobId);
            continue;
          }

          logger.info(`Recovered pending job: ${jobId}`);
        }
      }
    } catch (error) {
      logger.error('Failed to recover pending jobs:', error);
    }
  }

  /**
   * Process all pending completions
   */
  private async processRetries(): Promise<void> {
    if (!this.isConnected) {
      logger.warn('Skipping retry processing - Redis not connected');
      return;
    }

    try {
      const jobIds = await this.redis.sMembers(QUEUE_KEY);
      const now = Date.now();

      for (const jobId of jobIds) {
        const key = `${JOB_PREFIX}${jobId}`;
        const jobData = await this.redis.hGetAll(key);

        if (!jobData || !jobData.jobId) {
          await this.redis.sRem(QUEUE_KEY, jobId);
          continue;
        }

        const completion: PendingCompletion = {
          jobId: jobData.jobId,
          blobTxHash: jobData.blobTxHash,
          timestamp: parseInt(jobData.timestamp || '0'),
          retryCount: parseInt(jobData.retryCount || '0'),
          lastError: jobData.lastError
        };

        const timeSinceLastAttempt = now - completion.timestamp;
        const backoffDelay = Math.min(
          this.retryDelayMs * Math.pow(2, completion.retryCount),
          300000 // Max 5 minutes
        );

        if (timeSinceLastAttempt >= backoffDelay) {
          await this.retryCompletion(completion);
        }
      }
    } catch (error) {
      logger.error('Error in processRetries:', error);
    }
  }

  /**
   * Retry a single job completion
   */
  private async retryCompletion(completion: PendingCompletion): Promise<void> {
    try {
      logger.info(
        `Retrying job completion for ${completion.jobId} (attempt ${completion.retryCount + 1})`
      );

      // Attempt to complete the job
      await this.paymentVerifier.completeJob(completion.jobId, completion.blobTxHash, this.signer);

      // Success - remove from queue
      await this.removeCompletion(completion.jobId);
      logger.info(
        `Successfully completed job ${completion.jobId} after ${completion.retryCount + 1} attempts`
      );
    } catch (error) {
      completion.retryCount++;
      completion.timestamp = Date.now();
      completion.lastError = error instanceof Error ? error.message : 'Unknown error';

      if (completion.retryCount >= this.maxRetries) {
        logger.error(
          `Job ${completion.jobId} failed after ${this.maxRetries} attempts, removing from queue`
        );
        await this.removeCompletion(completion.jobId);
      } else {
        // Update retry info in Redis
        const key = `${JOB_PREFIX}${completion.jobId}`;
        await this.redis.hSet(key, {
          timestamp: completion.timestamp.toString(),
          retryCount: completion.retryCount.toString(),
          lastError: completion.lastError
        });

        logger.warn(
          `Job ${completion.jobId} completion failed, will retry (${completion.retryCount}/${this.maxRetries})`
        );
      }
    }
  }

  /**
   * Get current queue status
   */
  async getQueueStatus(): Promise<{
    pendingCount: number;
    completions: PendingCompletion[];
  }> {
    if (!this.isConnected) {
      return { pendingCount: 0, completions: [] };
    }

    const jobIds = await this.redis.sMembers(QUEUE_KEY);
    const completions: PendingCompletion[] = [];

    for (const jobId of jobIds) {
      const key = `${JOB_PREFIX}${jobId}`;
      const jobData = await this.redis.hGetAll(key);

      if (jobData && jobData.jobId) {
        completions.push({
          jobId: jobData.jobId,
          blobTxHash: jobData.blobTxHash,
          timestamp: parseInt(jobData.timestamp || '0'),
          retryCount: parseInt(jobData.retryCount || '0'),
          lastError: jobData.lastError
        });
      }
    }

    return {
      pendingCount: completions.length,
      completions
    };
  }
}
