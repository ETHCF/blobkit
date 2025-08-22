/**
 * Logging system with structured output and adapter pattern
 *
 * Features:
 * - Structured JSON logging
 * - Pretty-printed logs for development
 * - Pluggable adapters for external services
 * - OpenTelemetry compatibility
 * - Zero direct console usage
 */

/**
 * Log levels in order of severity
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
    cause?: unknown;
  };
  trace?: {
    traceId?: string;
    spanId?: string;
    parentSpanId?: string;
  };
}

/**
 * Logger adapter interface for pluggable implementations
 */
export interface LoggerAdapter {
  /**
   * Write a log entry
   */
  write(entry: LogEntry): void;

  /**
   * Flush any buffered logs (for async adapters)
   */
  flush?(): Promise<void>;

  /**
   * Close the adapter and release resources
   */
  close?(): Promise<void>;
}

/**
 * Logger configuration
 */
export interface LoggerConfig {
  level?: LogLevel;
  context?: string;
  adapter?: LoggerAdapter;
  metadata?: Record<string, unknown>;
  environment?: 'development' | 'production' | 'test';
}

/**
 * Console adapter that writes structured logs to stdout/stderr
 */
export class ConsoleAdapter implements LoggerAdapter {
  private environment: 'development' | 'production' | 'test';

  constructor(environment: 'development' | 'production' | 'test' = 'production') {
    this.environment = environment;
  }

  write(entry: LogEntry): void {
    if (this.environment === 'test') {
      // Silent in test environment unless explicitly configured
      return;
    }

    const output =
      this.environment === 'development'
        ? this.formatDevelopment(entry)
        : this.formatProduction(entry);

    // Use stdout for info and below, stderr for warnings and above
    const stream = entry.level >= LogLevel.WARN ? process.stderr : process.stdout;
    stream.write(output + '\n');
  }

  private formatProduction(entry: LogEntry): string {
    // Structured JSON for production
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
    // Pretty-printed for development
    const time = new Date(entry.timestamp).toLocaleTimeString();
    const levelColor = this.getLevelColor(entry.level);
    const resetColor = '\x1b[0m';

    let output = `${time} ${levelColor}[${entry.levelName}]${resetColor} [${entry.context}] ${entry.message}`;

    if (entry.metadata && Object.keys(entry.metadata).length > 0) {
      output += '\n  ' + JSON.stringify(entry.metadata, null, 2).replace(/\n/g, '\n  ');
    }

    if (entry.error) {
      output += `\n  Error: ${entry.error.message}`;
      if (entry.error.stack) {
        output += '\n  ' + entry.error.stack.replace(/\n/g, '\n  ');
      }
    }

    return output;
  }

  private getLevelColor(level: LogLevel): string {
    switch (level) {
      case LogLevel.TRACE:
        return '\x1b[90m'; // Gray
      case LogLevel.DEBUG:
        return '\x1b[36m'; // Cyan
      case LogLevel.INFO:
        return '\x1b[32m'; // Green
      case LogLevel.WARN:
        return '\x1b[33m'; // Yellow
      case LogLevel.ERROR:
        return '\x1b[31m'; // Red
      case LogLevel.FATAL:
        return '\x1b[35m'; // Magenta
      default:
        return '\x1b[0m';
    }
  }
}

/**
 * OpenTelemetry adapter for trace-aware logging
 */
export class OpenTelemetryAdapter implements LoggerAdapter {
  private baseAdapter: LoggerAdapter;

  constructor(baseAdapter: LoggerAdapter = new ConsoleAdapter()) {
    this.baseAdapter = baseAdapter;
  }

  write(entry: LogEntry): void {
    // Enhance with OpenTelemetry context if available
    const enhancedEntry = this.enhanceWithTrace(entry);
    this.baseAdapter.write(enhancedEntry);
  }

  private enhanceWithTrace(entry: LogEntry): LogEntry {
    // In a real implementation, this would get trace context from OpenTelemetry
    // For now, we'll check for ambient context
    if (typeof globalThis !== 'undefined' && (globalThis as any).__otel_context) {
      const context = (globalThis as any).__otel_context;
      return {
        ...entry,
        trace: {
          traceId: context.traceId,
          spanId: context.spanId,
          parentSpanId: context.parentSpanId,
          ...entry.trace
        }
      };
    }
    return entry;
  }

  async flush(): Promise<void> {
    if (this.baseAdapter.flush) {
      await this.baseAdapter.flush();
    }
  }

  async close(): Promise<void> {
    if (this.baseAdapter.close) {
      await this.baseAdapter.close();
    }
  }
}

/**
 * Main Logger class
 */
export class Logger {
  private level: LogLevel;
  private context: string;
  private adapter: LoggerAdapter;
  private metadata: Record<string, unknown>;
  private static globalAdapter: LoggerAdapter | null = null;

  constructor(config: LoggerConfig = {}) {
    this.level = config.level ?? this.getDefaultLevel();
    this.context = config.context ?? 'default';
    this.adapter = config.adapter ?? Logger.getGlobalAdapter();
    this.metadata = config.metadata ?? {};
  }

  /**
   * Set a global adapter for all loggers
   */
  static setGlobalAdapter(adapter: LoggerAdapter): void {
    Logger.globalAdapter = adapter;
  }

  /**
   * Get the global adapter or create a default one
   */
  static getGlobalAdapter(): LoggerAdapter {
    if (!Logger.globalAdapter) {
      const env = (process.env.NODE_ENV ?? 'production') as 'development' | 'production' | 'test';
      Logger.globalAdapter = new ConsoleAdapter(env);
    }
    return Logger.globalAdapter;
  }

  /**
   * Create a child logger with additional context
   */
  child(context: string, metadata?: Record<string, unknown>): Logger {
    return new Logger({
      level: this.level,
      context: `${this.context}:${context}`,
      adapter: this.adapter,
      metadata: { ...this.metadata, ...metadata }
    });
  }

  /**
   * Log methods
   */
  trace(message: string, metadata?: Record<string, unknown>): void {
    this.log(LogLevel.TRACE, message, metadata);
  }

  debug(message: string, metadata?: Record<string, unknown>): void {
    this.log(LogLevel.DEBUG, message, metadata);
  }

  info(message: string, metadata?: Record<string, unknown>): void {
    this.log(LogLevel.INFO, message, metadata);
  }

  warn(message: string, metadata?: Record<string, unknown>): void {
    this.log(LogLevel.WARN, message, metadata);
  }

  error(message: string, error?: Error | unknown, metadata?: Record<string, unknown>): void {
    const errorObj = this.serializeError(error);
    this.log(LogLevel.ERROR, message, { ...metadata, error: errorObj });
  }

  fatal(message: string, error?: Error | unknown, metadata?: Record<string, unknown>): void {
    const errorObj = this.serializeError(error);
    this.log(LogLevel.FATAL, message, { ...metadata, error: errorObj });
  }

  /**
   * Set the log level
   */
  setLevel(level: LogLevel): void {
    this.level = level;
  }

  /**
   * Add persistent metadata to all logs
   */
  addMetadata(metadata: Record<string, unknown>): void {
    Object.assign(this.metadata, metadata);
  }

  /**
   * Core logging method
   */
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

    // Extract error from metadata if present
    if (entry.metadata?.error) {
      entry.error = entry.metadata.error as LogEntry['error'];
      delete entry.metadata.error;
    }

    // Remove undefined values
    if (entry.metadata) {
      Object.keys(entry.metadata).forEach(key => {
        if (entry.metadata![key] === undefined) {
          delete entry.metadata![key];
        }
      });

      if (Object.keys(entry.metadata).length === 0) {
        delete entry.metadata;
      }
    }

    this.adapter.write(entry);
  }

  /**
   * Serialize an error object
   */
  private serializeError(error: unknown): LogEntry['error'] | undefined {
    if (!error) {
      return undefined;
    }

    if (error instanceof Error) {
      return {
        message: error.message,
        stack: error.stack,
        code: (error as any).code,
        cause: (error as any).cause
      };
    }

    return {
      message: String(error)
    };
  }

  /**
   * Get default log level from environment
   */
  private getDefaultLevel(): LogLevel {
    const envLevel = process.env.LOG_LEVEL?.toUpperCase();
    if (envLevel && envLevel in LogLevel) {
      return LogLevel[envLevel as keyof typeof LogLevel] as unknown as LogLevel;
    }

    // Default based on environment
    switch (process.env.NODE_ENV) {
      case 'development':
        return LogLevel.DEBUG;
      case 'test':
        return LogLevel.SILENT;
      default:
        return LogLevel.INFO;
    }
  }
}

/**
 * Default logger instance
 */
export const logger = new Logger({ context: 'blobkit' });
