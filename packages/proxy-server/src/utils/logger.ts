/**
 * Proxy Server Logger
 */

import { Request, Response } from 'express';

/**
 * Log levels
 */
export enum LogLevel {
  TRACE = 0,
  DEBUG = 1,
  INFO = 2,
  WARN = 3,
  ERROR = 4,
  FATAL = 5,
  SILENT = 99
}

/**
 * Trace context
 */
export interface TraceContext extends Record<string, unknown> {
  traceId: string;
  spanId?: string;
  parentSpanId?: string;
}

/**
 * Structured log entry
 */
export interface LogEntry {
  level: LogLevel;
  levelName: string;
  timestamp: string;
  message: string;
  context: string;
  metadata?: Record<string, unknown>;
  error?: {
    message: string;
    stack?: string;
    code?: string;
  };
  trace?: TraceContext;
}

/**
 * Logger adapter interface
 */
export interface LoggerAdapter {
  write(entry: LogEntry): void;
  flush?(): Promise<void>;
  close?(): Promise<void>;
}

/**
 * Console adapter for structured logging
 */
export class ConsoleAdapter implements LoggerAdapter {
  private environment: 'development' | 'production' | 'test';

  constructor(environment: 'development' | 'production' | 'test' = 'production') {
    this.environment = environment;
  }

  write(entry: LogEntry): void {
    if (this.environment === 'test') {
      return;
    }

    const output = this.environment === 'development'
      ? this.formatDevelopment(entry)
      : this.formatProduction(entry);

    const stream = entry.level >= LogLevel.WARN ? process.stderr : process.stdout;
    stream.write(`${output}\n`);
  }

  private formatProduction(entry: LogEntry): string {
    const logObject: Record<string, unknown> = {
      timestamp: entry.timestamp,
      level: entry.levelName,
      context: entry.context,
      message: entry.message,
      ...entry.metadata
    };

    if (entry.error) {
      logObject.error = entry.error;
    }

    if (entry.trace) {
      logObject.trace = entry.trace;
    }

    return JSON.stringify(logObject);
  }

  private formatDevelopment(entry: LogEntry): string {
    const time = new Date(entry.timestamp).toLocaleTimeString();
    const levelColor = this.getLevelColor(entry.level);
    const resetColor = '\x1b[0m';

    let output = `${time} ${levelColor}[${entry.levelName}]${resetColor} [${entry.context}] ${entry.message}`;

    if (entry.metadata && Object.keys(entry.metadata).length > 0) {
      output += `\n  ${JSON.stringify(entry.metadata, null, 2).replace(/\n/g, '\n  ')}`;
    }

    if (entry.error) {
      output += `\n  Error: ${entry.error.message}`;
      if (entry.error.stack) {
        output += `\n  ${entry.error.stack.replace(/\n/g, '\n  ')}`;
      }
    }

    return output;
  }

  private getLevelColor(level: LogLevel): string {
    switch (level) {
      case LogLevel.TRACE:
        return '\x1b[90m';
      case LogLevel.DEBUG:
        return '\x1b[36m';
      case LogLevel.INFO:
        return '\x1b[32m';
      case LogLevel.WARN:
        return '\x1b[33m';
      case LogLevel.ERROR:
        return '\x1b[31m';
      case LogLevel.FATAL:
        return '\x1b[35m';
      default:
        return '\x1b[0m';
    }
  }
}

/**
 * Logger configuration
 */
export interface LoggerConfig {
  level?: LogLevel;
  context?: string;
  adapter?: LoggerAdapter;
  metadata?: Record<string, unknown>;
}

/**
 * Logger class
 */
export class Logger {
  private level: LogLevel;
  private context: string;
  private adapter: LoggerAdapter;
  private metadata: Record<string, unknown>;

  constructor(config: LoggerConfig = {}) {
    this.level = config.level ?? this.getDefaultLevel();
    this.context = config.context ?? 'default';
    this.adapter = config.adapter ?? new ConsoleAdapter(this.getEnvironment());
    this.metadata = config.metadata ?? {};
  }

  child(context: string, metadata?: Record<string, unknown> | TraceContext): Logger {
    return new Logger({
      level: this.level,
      context: `${this.context}:${context}`,
      adapter: this.adapter,
      metadata: { ...this.metadata, ...metadata }
    });
  }

  trace(message: string, metadata?: Record<string, unknown>): void {
    this.log(LogLevel.TRACE, message, metadata);
  }

  debug(message: string, metadata?: Record<string, unknown>): void {
    this.log(LogLevel.DEBUG, message, metadata);
  }

  info(message: string, metadata?: Record<string, unknown>): void {
    this.log(LogLevel.INFO, message, metadata);
  }

  warn(
    message: string,
    errorOrMetadata?: Error | unknown | Record<string, unknown>,
    metadata?: Record<string, unknown>
  ): void {
    if (errorOrMetadata instanceof Error) {
      const errorObj = this.serializeError(errorOrMetadata);
      this.log(LogLevel.WARN, message, { ...metadata, error: errorObj });
    } else {
      this.log(LogLevel.WARN, message, errorOrMetadata as Record<string, unknown>);
    }
  }

  error(message: string, error?: Error | unknown, metadata?: Record<string, unknown>): void {
    const errorObj = this.serializeError(error);
    this.log(LogLevel.ERROR, message, { ...metadata, error: errorObj });
  }

  fatal(message: string, error?: Error | unknown, metadata?: Record<string, unknown>): void {
    const errorObj = this.serializeError(error);
    this.log(LogLevel.FATAL, message, { ...metadata, error: errorObj });
  }

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  addMetadata(metadata: Record<string, unknown>): void {
    Object.assign(this.metadata, metadata);
  }

  private log(level: LogLevel, message: string, metadata?: Record<string, unknown>): void {
    if (level < this.level) {
      return;
    }

    const entry: LogEntry = {
      level,
      levelName: LogLevel[level],
      timestamp: new Date().toISOString(),
      message,
      context: this.context,
      metadata: { ...this.metadata, ...metadata }
    };

    if (entry.metadata?.error) {
      entry.error = entry.metadata.error as LogEntry['error'];
      delete entry.metadata.error;
    }

    if (entry.metadata) {
      Object.keys(entry.metadata).forEach(key => {
        const m = entry.metadata as Record<string, unknown>;
        if (m[key] === undefined) {
          delete m[key];
        }
      });

      if (Object.keys(entry.metadata as Record<string, unknown>).length === 0) {
        delete (entry as { metadata?: Record<string, unknown> }).metadata;
      }
    }

    this.adapter.write(entry);
  }

  private serializeError(error: unknown): LogEntry['error'] | undefined {
    if (!error) {
      return undefined;
    }

    if (error instanceof Error) {
      return {
        message: error.message,
        stack: error.stack,
        code: (error as { code?: string }).code
      };
    }

    return {
      message: String(error)
    };
  }

  private getDefaultLevel(): LogLevel {
    const envLevel = process.env.LOG_LEVEL?.toUpperCase();
    if (envLevel && envLevel in LogLevel) {
      return LogLevel[envLevel as keyof typeof LogLevel] as unknown as LogLevel;
    }

    switch (process.env.NODE_ENV) {
      case 'development':
        return LogLevel.DEBUG;
      case 'test':
        return LogLevel.SILENT;
      default:
        return LogLevel.INFO;
    }
  }

  private getEnvironment(): 'development' | 'production' | 'test' {
    const env = process.env.NODE_ENV;
    if (env === 'development' || env === 'test') {
      return env;
    }
    return 'production';
  }
}

/**
 * HTTP request context for structured logging
 */
export interface HttpContext extends Record<string, unknown> {
  method: string;
  path: string;
  statusCode: number;
  duration: number;
  ip?: string;
  userAgent?: string;
  traceId?: string;
  spanId?: string;
  userId?: string;
  jobId?: string;
}

/**
 * Create proxy server logger
 */
export function createProxyLogger(): Logger {
  const logger = new Logger({
    context: 'proxy-server'
  });

  logger.addMetadata({
    service: 'blobkit-proxy',
    version: process.env.npm_package_version ?? 'unknown',
    environment: process.env.NODE_ENV ?? 'production',
    node_version: process.version
  });

  return logger;
}

/**
 * Create a logger for a specific component
 */
export function createLogger(component: string, metadata?: Record<string, unknown>): Logger {
  return proxyLogger.child(component, metadata);
}

/**
 * Express middleware for request logging
 */
export function requestLogger(logger: Logger) {
  return (req: Request, res: Response, next: (err?: unknown) => void) => {
    const start = Date.now();

    const originalEnd = res.end as unknown as (...args: unknown[]) => Response;

    res.end = function (...args: unknown[]) {
      const duration = Date.now() - start;

      const context: HttpContext = {
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        duration,
        ip: req.ip,
        userAgent: req.get('user-agent')
      };

      const reqWithTrace = req as Request & { traceId?: string; spanId?: string };
      if (reqWithTrace.traceId) {
        context.traceId = reqWithTrace.traceId;
        context.spanId = reqWithTrace.spanId;
      }

      const reqWithUser = req as Request & { user?: { id: string } };
      if (reqWithUser.user?.id) {
        context.userId = reqWithUser.user.id;
      }

      if (req.body?.jobId) {
        context.jobId = req.body.jobId;
      }

      const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';

      const logMethod = level as 'info' | 'warn' | 'error';
      logger[logMethod](`${req.method} ${req.path} ${res.statusCode}`, context as Record<string, unknown>);

      return originalEnd.apply(res, args as unknown as unknown[]);
    };

    next();
  };
}

/**
 * Log metrics for monitoring
 */
export function logMetric(
  logger: Logger,
  name: string,
  value: number,
  tags?: Record<string, string>
): void {
  logger.info('metric', {
    metric: name,
    value,
    tags,
    timestamp: Date.now()
  });
}

/**
 * Log job processing events
 */
export function logJobEvent(
  logger: Logger,
  event: 'created' | 'processing' | 'completed' | 'failed',
  jobId: string,
  metadata?: Record<string, unknown>
): void {
  const level = event === 'failed' ? 'error' : 'info';

  logger[level](`Job ${event}`, {
    jobId,
    event,
    ...metadata
  });
}

/**
 * Log blob operations
 */
export function logBlobOperation(
  logger: Logger,
  operation: 'write' | 'read' | 'verify',
  success: boolean,
  metadata: {
    blobHash?: string;
    blobSize?: number;
    duration?: number;
    error?: Error;
    [key: string]: unknown;
  }
): void {
  const level = success ? 'info' : 'error';
  const message = `Blob ${operation} ${success ? 'succeeded' : 'failed'}`;

  logger[level](message, metadata);
}

/**
 * Global proxy server logger instance
 */
export const proxyLogger = createProxyLogger();
