import { createLogger } from '../utils/logger.js';

const logger = createLogger('Metrics');

export interface ProxyMetrics {
  jobsProcessed: number;
  jobsFailed: number;
  jobsRetried: number;
  blobsSubmitted: number;
  totalFeesCollected: bigint;
  averageJobDuration: number;
  lastError?: { timestamp: Date; message: string; jobId?: string };
}

export class MetricsCollector {
  private metrics: ProxyMetrics = {
    jobsProcessed: 0,
    jobsFailed: 0,
    jobsRetried: 0,
    blobsSubmitted: 0,
    totalFeesCollected: 0n,
    averageJobDuration: 0
  };

  private jobStartTimes = new Map<string, number>();

  /**
   * Record job start
   */
  jobStarted(jobId: string): void {
    this.jobStartTimes.set(jobId, Date.now());
    logger.debug(`Job ${jobId} started`);
  }

  /**
   * Record successful job completion
   */
  jobCompleted(jobId: string, feeCollected: bigint): void {
    const startTime = this.jobStartTimes.get(jobId);
    if (startTime) {
      const duration = Date.now() - startTime;
      this.updateAverageDuration(duration);
      this.jobStartTimes.delete(jobId);
    }

    this.metrics.jobsProcessed++;
    this.metrics.totalFeesCollected += feeCollected;

    logger.info(`Job ${jobId} completed successfully`, {
      totalJobs: this.metrics.jobsProcessed,
      totalFees: this.metrics.totalFeesCollected.toString()
    });
  }

  /**
   * Record job failure
   */
  jobFailed(jobId: string, error: string): void {
    this.jobStartTimes.delete(jobId);
    this.metrics.jobsFailed++;
    this.metrics.lastError = {
      timestamp: new Date(),
      message: error,
      jobId
    };

    logger.error(`Job ${jobId} failed`, {
      error,
      totalFailed: this.metrics.jobsFailed
    });

    // Alert if failure rate is high
    const failureRate =
      this.metrics.jobsFailed / (this.metrics.jobsProcessed + this.metrics.jobsFailed);
    if (failureRate > 0.1 && this.metrics.jobsProcessed > 10) {
      logger.error(`⚠️  HIGH FAILURE RATE: ${(failureRate * 100).toFixed(2)}%`);
    }
  }

  /**
   * Record job retry
   */
  jobRetried(jobId: string): void {
    this.metrics.jobsRetried++;
    logger.info(`Job ${jobId} added to retry queue`, {
      totalRetries: this.metrics.jobsRetried
    });
  }

  /**
   * Record blob submission
   */
  blobSubmitted(size: number): void {
    this.metrics.blobsSubmitted++;
    logger.debug(`Blob submitted`, {
      size,
      totalBlobs: this.metrics.blobsSubmitted
    });
  }

  /**
   * Get current metrics
   */
  getMetrics(): ProxyMetrics {
    return { ...this.metrics };
  }

  /**
   * Get health status based on metrics
   */
  getHealthStatus(): {
    healthy: boolean;
    warnings: string[];
  } {
    const warnings: string[] = [];
    let healthy = true;

    // Check failure rate
    const totalJobs = this.metrics.jobsProcessed + this.metrics.jobsFailed;
    if (totalJobs > 0) {
      const failureRate = this.metrics.jobsFailed / totalJobs;
      if (failureRate > 0.1) {
        warnings.push(`High failure rate: ${(failureRate * 100).toFixed(2)}%`);
        healthy = false;
      }
    }

    // Check recent errors
    if (this.metrics.lastError) {
      const errorAge = Date.now() - this.metrics.lastError.timestamp.getTime();
      if (errorAge < 300000) {
        // 5 minutes
        warnings.push(`Recent error: ${this.metrics.lastError.message}`);
      }
    }

    // Check job duration
    if (this.metrics.averageJobDuration > 30000) {
      // 30 seconds
      warnings.push(
        `Slow job processing: ${(this.metrics.averageJobDuration / 1000).toFixed(2)}s average`
      );
    }

    return { healthy, warnings };
  }

  /**
   * Reset metrics (for testing)
   */
  reset(): void {
    this.metrics = {
      jobsProcessed: 0,
      jobsFailed: 0,
      jobsRetried: 0,
      blobsSubmitted: 0,
      totalFeesCollected: 0n,
      averageJobDuration: 0
    };
    this.jobStartTimes.clear();
  }

  private updateAverageDuration(newDuration: number): void {
    const total = this.metrics.jobsProcessed;
    if (total === 0) {
      this.metrics.averageJobDuration = newDuration;
    } else {
      this.metrics.averageJobDuration =
        (this.metrics.averageJobDuration * total + newDuration) / (total + 1);
    }
  }
}
