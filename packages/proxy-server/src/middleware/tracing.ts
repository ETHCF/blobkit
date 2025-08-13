import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { createLogger, Logger, TraceContext } from '../utils/logger.js';
import { trace, SpanStatusCode, SpanKind } from '@opentelemetry/api';

const logger = createLogger('TracingMiddleware');

// Extend Express Request to include trace context
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      traceId: string;
      spanId?: string;
      traceContext?: Record<string, unknown>;
    }
  }
}

export type { TraceContext };

export interface ExtendedTraceContext extends TraceContext {
  timestamp: number;
  service: string;
  operation: string;
  attributes?: Record<string, string | number | boolean>;
}

/**
 * Distributed tracing middleware
 * Adds trace ID propagation and context to all requests
 */
export function tracingMiddleware(serviceName: string = 'blobkit-proxy') {
  return (req: Request, res: Response, next: NextFunction) => {
    // Extract or generate trace ID
    const traceId =
      (req.headers['x-trace-id'] as string) || (req.headers['x-request-id'] as string) || uuidv4();

    // Extract parent span ID if present
    const parentSpanId = req.headers['x-span-id'] as string;

    // Generate new span ID for this request
    const spanId = uuidv4();

    // Attach to request
    req.traceId = traceId;
    req.spanId = spanId;
    req.traceContext = {
      traceId,
      spanId,
      parentSpanId,
      service: serviceName,
      operation: `${req.method} ${req.path}`,
      timestamp: Date.now(),
      attributes: {
        'http.method': req.method,
        'http.path': req.path,
        'http.url': req.url,
        'http.target': req.originalUrl,
        'http.host': req.headers.host,
        'http.scheme': req.protocol,
        'http.user_agent': req.headers['user-agent'],
        'net.peer.ip': req.ip,
        'blobkit.proxy.version': process.env.npm_package_version || '0.0.1'
      }
    };

    // Set response headers for trace propagation
    const resHeaders = res as Response & { setHeader: (name: string, value: string) => void };
    resHeaders.setHeader('X-Trace-Id', traceId);
    resHeaders.setHeader('X-Span-Id', spanId);

    // Log request with trace context
    const { method, path: reqPath, headers } = req;
    if(!reqPath.startsWith('/api/v1/health') && !reqPath.startsWith('/health')) {
      logger.info('Request received', {
        traceId,
        spanId,
        parentSpanId,
        method,
        path: reqPath,
        headers
      });
    }
    // Track response time
    const startTime = Date.now();

    // Intercept response to log completion
    const { send } = res;
    const originalSend = send.bind(res);
    res.send = function (data: unknown) {
      const duration = Date.now() - startTime;

      // Log response with trace context
      logger.info('Request completed', {
        traceId,
        spanId,
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        duration,
        contentLength: res.get('content-length')
      });

      // Add trace metadata to response headers
      res.setHeader('X-Response-Time', `${duration}ms`);

      return originalSend.call(this, data);
    };

    next();
  };
}

/**
 * OpenTelemetry integration for distributed tracing
 */
export class TracingService {
  private tracer;

  constructor(serviceName: string = 'blobkit-proxy') {
    this.tracer = trace.getTracer(serviceName, process.env.npm_package_version || '0.0.1');
  }

  /**
   * Start a new span for an operation
   */
  startSpan(name: string, traceContext?: ExtendedTraceContext) {
    const span = this.tracer.startSpan(name, {
      kind: SpanKind.SERVER,
      attributes: traceContext?.attributes as Record<string, string | number | boolean> | undefined
    });

    if (traceContext) {
      span.setAttribute('trace.id', traceContext.traceId);
      span.setAttribute('span.parent_id', traceContext.parentSpanId || '');
    }

    return span;
  }

  /**
   * Create a traced function wrapper
   */
  traced<T extends (...args: never[]) => unknown>(
    fn: T,
    spanName: string,
    attributes?: Record<string, string | number | boolean>
  ): T {
    const tracer = this.tracer;

    return async function tracedFunction(...args: Parameters<T>) {
      const span = tracer.startSpan(spanName, {
        kind: SpanKind.INTERNAL,
        attributes
      });

      try {
        const result = await (fn as unknown as (...a: unknown[]) => Promise<unknown>)(
          ...args
        );
        span.setStatus({ code: SpanStatusCode.OK });
        return result;
      } catch (error) {
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: error instanceof Error ? error.message : 'Unknown error'
        });
        span.recordException(error as Error);
        throw error;
      } finally {
        span.end();
      }
    } as T;
  }

  /**
   * Add trace context to logger
   */
  getLoggerWithTrace(baseLogger: Logger, traceContext: TraceContext): Logger {
    const childLogger = baseLogger.child('traced', traceContext as Record<string, unknown>);
    return childLogger;
  }
}

/**
 * Extract trace context from request
 */
export function getTraceContext(req: Request): ExtendedTraceContext {
  return {
    traceId: req.traceId,
    spanId: req.spanId || uuidv4(),
    parentSpanId: req.headers['x-span-id'] as string,
    timestamp: Date.now(),
    service: 'blobkit-proxy',
    operation: `${req.method} ${req.path}`,
    attributes: req.traceContext?.attributes as Record<string, string | number | boolean> | undefined
  };
}

/**
 * Propagate trace context to downstream services
 */
export function propagateTraceContext(traceContext: ExtendedTraceContext): Record<string, string> {
  return {
    'X-Trace-Id': traceContext.traceId,
    'X-Parent-Span-Id': traceContext.spanId || '',
    'X-Span-Id': uuidv4() // Generate new span ID for downstream
  };
}
