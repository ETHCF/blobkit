/**
 * Metrics collection for BlobKit SDK
 * Provides hooks for monitoring and observability
 */

export interface BlobKitMetrics {
  blobWriteCount: number;
  blobWriteErrors: number;
  totalBytesWritten: number;
  averageWriteDuration: number;
  blobReadCount: number;
  blobReadErrors: number;
  totalBytesRead: number;
  averageReadDuration: number;
  proxyRequestCount: number;
  proxyRequestErrors: number;
  kzgOperationCount: number;
  kzgOperationErrors: number;
}

export interface MetricsHooks {
  onBlobWrite?: (size: number, duration: number, success: boolean) => void;
  onBlobRead?: (size: number, duration: number, success: boolean, source: string) => void;
  onProxyRequest?: (url: string, duration: number, success: boolean) => void;
  onKzgOperation?: (operation: string, duration: number, success: boolean) => void;
  onError?: (error: Error, context: string) => void;
}

/**
 * Default metrics collector
 */
export class MetricsCollector {
  private metrics: BlobKitMetrics = {
    blobWriteCount: 0,
    blobWriteErrors: 0,
    totalBytesWritten: 0,
    averageWriteDuration: 0,
    blobReadCount: 0,
    blobReadErrors: 0,
    totalBytesRead: 0,
    averageReadDuration: 0,
    proxyRequestCount: 0,
    proxyRequestErrors: 0,
    kzgOperationCount: 0,
    kzgOperationErrors: 0
  };

  private writeDurations: number[] = [];
  private readDurations: number[] = [];
  private hooks: MetricsHooks;

  constructor(hooks: MetricsHooks = {}) {
    this.hooks = hooks;
  }

  recordBlobWrite(size: number, duration: number, success: boolean): void {
    if (success) {
      this.metrics.blobWriteCount++;
      this.metrics.totalBytesWritten += size;
      this.writeDurations.push(duration);

      // Update average
      const sum = this.writeDurations.reduce((a, b) => a + b, 0);
      this.metrics.averageWriteDuration = sum / this.writeDurations.length;
    } else {
      this.metrics.blobWriteErrors++;
    }

    this.hooks.onBlobWrite?.(size, duration, success);
  }

  recordBlobRead(size: number, duration: number, success: boolean, source: string): void {
    if (success) {
      this.metrics.blobReadCount++;
      this.metrics.totalBytesRead += size;
      this.readDurations.push(duration);

      // Update average
      const sum = this.readDurations.reduce((a, b) => a + b, 0);
      this.metrics.averageReadDuration = sum / this.readDurations.length;
    } else {
      this.metrics.blobReadErrors++;
    }

    this.hooks.onBlobRead?.(size, duration, success, source);
  }

  recordProxyRequest(url: string, duration: number, success: boolean): void {
    if (success) {
      this.metrics.proxyRequestCount++;
    } else {
      this.metrics.proxyRequestErrors++;
    }

    this.hooks.onProxyRequest?.(url, duration, success);
  }

  recordKzgOperation(operation: string, duration: number, success: boolean): void {
    if (success) {
      this.metrics.kzgOperationCount++;
    } else {
      this.metrics.kzgOperationErrors++;
    }

    this.hooks.onKzgOperation?.(operation, duration, success);
  }

  recordError(error: Error, context: string): void {
    this.hooks.onError?.(error, context);
  }

  trackOperation(
    operation: string,
    phase: 'start' | 'complete' | 'error',
    duration?: number
  ): void {
    // Simple operation tracking
    if (phase === 'complete' && duration !== undefined) {
      this.recordKzgOperation(operation, duration, true);
    } else if (phase === 'error') {
      this.recordKzgOperation(operation, 0, false);
    }
  }

  getMetrics(): BlobKitMetrics {
    return { ...this.metrics };
  }

  reset(): void {
    this.metrics = {
      blobWriteCount: 0,
      blobWriteErrors: 0,
      totalBytesWritten: 0,
      averageWriteDuration: 0,
      blobReadCount: 0,
      blobReadErrors: 0,
      totalBytesRead: 0,
      averageReadDuration: 0,
      proxyRequestCount: 0,
      proxyRequestErrors: 0,
      kzgOperationCount: 0,
      kzgOperationErrors: 0
    };
    this.writeDurations = [];
    this.readDurations = [];
  }
}
