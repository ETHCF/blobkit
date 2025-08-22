/**
 * SDK Logger - Re-exports the core logger with SDK-specific configuration
 */

export { Logger, LogLevel, ConsoleAdapter, OpenTelemetryAdapter, logger } from './core/logger';

export type { LogEntry, LoggerAdapter, LoggerConfig } from './core/logger';

export {
  DatadogAdapter,
  CloudWatchAdapter,
  LogstashAdapter,
  MultiAdapter,
  FileAdapter,
  BufferAdapter
} from './core/logger-adapters';
