/**
 * Prometheus metrics for production monitoring
 *
 * Provides comprehensive metrics for:
 * - HTTP request performance
 * - Business metrics (blob submissions, payments)
 * - System health indicators
 * - Error tracking
 */

import { Counter, Histogram, Gauge, Registry, collectDefaultMetrics } from 'prom-client';
import { Request, Response, NextFunction } from 'express';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('PrometheusMetrics');

export class PrometheusMetrics {
  private readonly registry: Registry;

  // HTTP metrics
  public readonly httpRequestDuration: Histogram<string>;
  public readonly httpRequestsTotal: Counter<string>;
  public readonly httpRequestsInFlight: Gauge<string>;

  // Business metrics
  public readonly blobSubmissions: Counter<string>;
  public readonly blobSizeBytes: Histogram<string>;
  public readonly paymentVerifications: Counter<string>;
  public readonly jobProcessingDuration: Histogram<string>;
  public readonly feesCollected: Counter<string>;

  // System metrics
  public readonly errors: Counter<string>;
  public readonly circuitBreakerState: Gauge<string>;
  public readonly queueSize: Gauge<string>;

  constructor() {
    this.registry = new Registry();

    // Collect default metrics (CPU, memory, etc.)
    collectDefaultMetrics({
      register: this.registry,
      prefix: 'blobkit_proxy_'
    });

    // HTTP metrics
    this.httpRequestDuration = new Histogram({
      name: 'blobkit_http_request_duration_seconds',
      help: 'Duration of HTTP requests in seconds',
      labelNames: ['method', 'route', 'status_code'],
      buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
      registers: [this.registry]
    });

    this.httpRequestsTotal = new Counter({
      name: 'blobkit_http_requests_total',
      help: 'Total number of HTTP requests',
      labelNames: ['method', 'route', 'status_code'],
      registers: [this.registry]
    });

    this.httpRequestsInFlight = new Gauge({
      name: 'blobkit_http_requests_in_flight',
      help: 'Number of HTTP requests currently being processed',
      labelNames: ['method', 'route'],
      registers: [this.registry]
    });

    // Business metrics
    this.blobSubmissions = new Counter({
      name: 'blobkit_blob_submissions_total',
      help: 'Total number of blob submissions',
      labelNames: ['status', 'error_type'],
      registers: [this.registry]
    });

    this.blobSizeBytes = new Histogram({
      name: 'blobkit_blob_size_bytes',
      help: 'Size of submitted blobs in bytes',
      labelNames: ['codec'],
      buckets: [1024, 4096, 16384, 65536, 131072],
      registers: [this.registry]
    });

    this.paymentVerifications = new Counter({
      name: 'blobkit_payment_verifications_total',
      help: 'Total number of payment verifications',
      labelNames: ['result', 'reason'],
      registers: [this.registry]
    });

    this.jobProcessingDuration = new Histogram({
      name: 'blobkit_job_processing_duration_seconds',
      help: 'Time taken to process blob submission jobs',
      labelNames: ['status'],
      buckets: [1, 5, 10, 30, 60, 120, 300],
      registers: [this.registry]
    });

    this.feesCollected = new Counter({
      name: 'blobkit_fees_collected_wei',
      help: 'Total fees collected in wei',
      registers: [this.registry]
    });

    // System metrics
    this.errors = new Counter({
      name: 'blobkit_errors_total',
      help: 'Total number of errors',
      labelNames: ['type', 'code', 'operation'],
      registers: [this.registry]
    });

    this.circuitBreakerState = new Gauge({
      name: 'blobkit_circuit_breaker_state',
      help: 'Circuit breaker state (0=closed, 1=open, 2=half-open)',
      labelNames: ['service'],
      registers: [this.registry]
    });

    this.queueSize = new Gauge({
      name: 'blobkit_job_queue_size',
      help: 'Number of jobs in the queue',
      labelNames: ['status'],
      registers: [this.registry]
    });

    logger.info('Prometheus metrics initialized');
  }

  /**
   * Get metrics in Prometheus format
   */
  async getMetrics(): Promise<string> {
    return this.registry.metrics();
  }

  /**
   * Get content type for metrics endpoint
   */
  getContentType(): string {
    return this.registry.contentType;
  }

  /**
   * Reset all metrics (for testing)
   */
  reset(): void {
    this.registry.clear();
  }
}

// Singleton instance
let instance: PrometheusMetrics | null = null;

/**
 * Get or create metrics instance
 */
export function getPrometheusMetrics(): PrometheusMetrics {
  if (!instance) {
    instance = new PrometheusMetrics();
  }
  return instance;
}

/**
 * Middleware to track HTTP metrics
 */
export function metricsMiddleware() {
  const metrics = getPrometheusMetrics();

  return (req: Request, res: Response, next: NextFunction) => {
    const start = Date.now();
    const route = req.route?.path || req.path;

    // Track in-flight requests
    metrics.httpRequestsInFlight.inc({ method: req.method, route });

    // Intercept response finish
    const originalEnd = res.end.bind(res);
    const recordMetrics = () => {
      const duration = Date.now() - start;

      // Record metrics
      metrics.httpRequestDuration.observe(
        { method: req.method, route, status_code: res.statusCode.toString() },
        duration / 1000
      );

      metrics.httpRequestsTotal.inc({
        method: req.method,
        route,
        status_code: res.statusCode.toString()
      });

      metrics.httpRequestsInFlight.dec({ method: req.method, route });
    };

    // Override all overloads of res.end
    res.end = function (chunk?: unknown, encoding?: unknown) {
      recordMetrics();

      // Handle different overloads
      if (arguments.length === 0) {
        return originalEnd();
      } else if (arguments.length === 1) {
        return originalEnd(chunk);
      } else {
        return originalEnd(chunk, encoding as BufferEncoding);
      }
    } as typeof res.end;

    next();
  };
}
