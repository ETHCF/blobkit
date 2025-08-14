import { createClient, RedisClientType } from 'redis';
import { BlobWriteResponse } from '../types.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('JobResultCache');

/**
 * Redis-based cache for BlobWriteResponse objects using jobId as key
 */
export class JobResultCache {
  private redis: RedisClientType;
  private isConnected = false;
  private readonly keyPrefix = 'blobkit:job_result:';
  private readonly defaultTtl: number = 86400; // 24 hours in seconds

  constructor(
    private redisUrl: string = process.env.REDIS_URL || 'redis://localhost:6379',
    private ttl: number = 86400
  ) {
    this.redis = createClient({ url: this.redisUrl });
    this.defaultTtl = ttl;

    this.redis.on('error', (err: Error) => {
      logger.error('Redis connection error:', err);
      this.isConnected = false;
    });

    this.redis.on('connect', () => {
      logger.info('JobResultCache Redis connected');
      this.isConnected = true;
    });
  }

  async connect(): Promise<void> {
    if (!this.isConnected) {
      await this.redis.connect();
    }
  }

  async disconnect(): Promise<void> {
    if (this.isConnected) {
      await this.redis.quit();
      this.isConnected = false;
    }
  }

  /**
   * Store a BlobWriteResponse in cache
   */
  async set(jobId: string, response: BlobWriteResponse): Promise<void> {
    try {
      const key = this.getKey(jobId);
      const value = JSON.stringify(response);
      await this.redis.setEx(key, this.defaultTtl, value);
      logger.debug(`Cached result for job ${jobId}`);
    } catch (error) {
      logger.error(`Failed to cache result for job ${jobId}:`, error);
      throw error;
    }
  }

  /**
   * Retrieve a BlobWriteResponse from cache
   */
  async get(jobId: string): Promise<BlobWriteResponse | null> {
    try {
      const key = this.getKey(jobId);
      const value = await this.redis.get(key);
      
      if (!value) {
        return null;
      }

      return JSON.parse(value) as BlobWriteResponse;
    } catch (error) {
      logger.error(`Failed to retrieve cached result for job ${jobId}:`, error);
      return null;
    }
  }


  /**
   * Check if a job result exists in cache
   */
  async exists(jobId: string): Promise<boolean> {
    try {
      const key = this.getKey(jobId);
      const exists = await this.redis.exists(key);
      return exists > 0;
    } catch (error) {
      logger.error(`Failed to check existence for job ${jobId}:`, error);
      return false;
    }
  }

  private getKey(jobId: string): string {
    return `${this.keyPrefix}${jobId}`;
  }
}