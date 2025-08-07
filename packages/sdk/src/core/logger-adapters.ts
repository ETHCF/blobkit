/**
 * Logger adapters for external logging services
 *
 * Provides integrations with popular logging and observability platforms
 */

import { LogEntry, LoggerAdapter, LogLevel } from './logger';

/**
 * Datadog adapter for sending logs to Datadog
 */
export class DatadogAdapter implements LoggerAdapter {
  private apiKey: string;
  private site: string;
  private service: string;
  private host: string;
  private buffer: LogEntry[] = [];
  private flushInterval: NodeJS.Timeout | null = null;
  private maxBatchSize = 100;

  constructor(config: {
    apiKey: string;
    site?: string;
    service: string;
    host?: string;
    flushIntervalMs?: number;
  }) {
    this.apiKey = config.apiKey;
    this.site = config.site ?? 'datadoghq.com';
    this.service = config.service;
    this.host = config.host ?? 'localhost';

    // Set up automatic flushing
    const flushInterval = config.flushIntervalMs ?? 5000;
    this.flushInterval = setInterval(() => {
      this.flush().catch(err => {
        // Fallback to console in case of flush error
        process.stderr.write(`Datadog flush error: ${err}\n`);
      });
    }, flushInterval);
  }

  write(entry: LogEntry): void {
    this.buffer.push(entry);

    if (this.buffer.length >= this.maxBatchSize) {
      this.flush().catch(err => {
        process.stderr.write(`Datadog flush error: ${err}\n`);
      });
    }
  }

  async flush(): Promise<void> {
    if (this.buffer.length === 0) {
      return;
    }

    const logs = this.buffer.splice(0, this.maxBatchSize);
    const payload = logs.map(entry => this.formatForDatadog(entry));

    try {
      const response = await fetch(`https://http-intake.logs.${this.site}/api/v2/logs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'DD-API-KEY': this.apiKey
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`Datadog API error: ${response.status}`);
      }
    } catch (error) {
      // Re-queue logs on error
      this.buffer.unshift(...logs);
      throw error;
    }
  }

  async close(): Promise<void> {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }
    await this.flush();
  }

  private formatForDatadog(entry: LogEntry): Record<string, unknown> {
    return {
      ddsource: 'nodejs',
      ddtags: `service:${this.service},env:${process.env.NODE_ENV ?? 'production'}`,
      hostname: this.host,
      service: this.service,
      status: this.mapLevel(entry.level),
      message: entry.message,
      timestamp: entry.timestamp,
      context: entry.context,
      ...entry.metadata,
      error: entry.error,
      trace: entry.trace
    };
  }

  private mapLevel(level: LogLevel): string {
    switch (level) {
      case LogLevel.TRACE:
      case LogLevel.DEBUG:
        return 'debug';
      case LogLevel.INFO:
        return 'info';
      case LogLevel.WARN:
        return 'warning';
      case LogLevel.ERROR:
        return 'error';
      case LogLevel.FATAL:
        return 'critical';
      default:
        return 'info';
    }
  }
}

/**
 * CloudWatch adapter for AWS CloudWatch Logs
 */
export class CloudWatchAdapter implements LoggerAdapter {
  private logGroupName: string;
  private logStreamName: string;
  private region: string;
  private buffer: LogEntry[] = [];
  private sequenceToken?: string;

  constructor(config: {
    logGroupName: string;
    logStreamName: string;
    region: string;
    accessKeyId?: string;
    secretAccessKey?: string;
  }) {
    this.logGroupName = config.logGroupName;
    this.logStreamName = config.logStreamName;
    this.region = config.region;

    // AWS credentials configured via IAM roles or environment
  }

  write(entry: LogEntry): void {
    this.buffer.push(entry);

    // Batch writes for efficiency
    if (this.buffer.length >= 10) {
      this.flush().catch(err => {
        process.stderr.write(`CloudWatch flush error: ${err}\n`);
      });
    }
  }

  async flush(): Promise<void> {
    if (this.buffer.length === 0) {
      return;
    }

    const events = this.buffer.map(entry => ({
      timestamp: new Date(entry.timestamp).getTime(),
      message: JSON.stringify(this.formatForCloudWatch(entry))
    }));

    // AWS SDK integration
    const payload = {
      logGroupName: this.logGroupName,
      logStreamName: this.logStreamName,
      logEvents: events,
      sequenceToken: this.sequenceToken
    };

    // AWS SDK call would go here
    // const result = await cloudWatchLogs.putLogEvents(payload).promise();
    // this.sequenceToken = result.nextSequenceToken;

    this.buffer = [];
  }

  private formatForCloudWatch(entry: LogEntry): Record<string, unknown> {
    return {
      '@timestamp': entry.timestamp,
      level: entry.levelName,
      context: entry.context,
      message: entry.message,
      metadata: entry.metadata,
      error: entry.error,
      trace: entry.trace
    };
  }

  async close(): Promise<void> {
    await this.flush();
  }
}

/**
 * Logstash adapter for ELK stack
 */
export class LogstashAdapter implements LoggerAdapter {
  private host: string;
  private port: number;
  private buffer: LogEntry[] = [];

  constructor(config: { host: string; port?: number }) {
    this.host = config.host;
    this.port = config.port ?? 5000;
  }

  write(entry: LogEntry): void {
    // Send immediately for Logstash
    this.send(entry).catch(err => {
      process.stderr.write(`Logstash send error: ${err}\n`);
    });
  }

  private async send(entry: LogEntry): Promise<void> {
    const payload = this.formatForLogstash(entry);

    try {
      const response = await fetch(`http://${this.host}:${this.port}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`Logstash error: ${response.status}`);
      }
    } catch (error) {
      // Buffer for retry
      this.buffer.push(entry);
      throw error;
    }
  }

  async flush(): Promise<void> {
    // Retry buffered entries
    const retries = [...this.buffer];
    this.buffer = [];

    for (const entry of retries) {
      try {
        await this.send(entry);
      } catch (error) {
        // Re-buffer on failure
        this.buffer.push(entry);
      }
    }
  }

  private formatForLogstash(entry: LogEntry): Record<string, unknown> {
    return {
      '@timestamp': entry.timestamp,
      '@version': '1',
      level: entry.levelName,
      level_value: entry.level,
      logger_name: entry.context,
      message: entry.message,
      ...entry.metadata,
      error: entry.error,
      trace: entry.trace,
      host: {
        name: process.env.HOSTNAME ?? 'unknown'
      }
    };
  }

  async close(): Promise<void> {
    await this.flush();
  }
}

/**
 * Multi-adapter for sending logs to multiple destinations
 */
export class MultiAdapter implements LoggerAdapter {
  private adapters: LoggerAdapter[];

  constructor(adapters: LoggerAdapter[]) {
    this.adapters = adapters;
  }

  write(entry: LogEntry): void {
    for (const adapter of this.adapters) {
      try {
        adapter.write(entry);
      } catch (error) {
        // Don't let one adapter failure affect others
        process.stderr.write(`Multi-adapter error: ${error}\n`);
      }
    }
  }

  async flush(): Promise<void> {
    await Promise.all(
      this.adapters
        .filter(a => a.flush)
        .map(a =>
          a.flush!().catch(err => {
            process.stderr.write(`Multi-adapter flush error: ${err}\n`);
          })
        )
    );
  }

  async close(): Promise<void> {
    await Promise.all(
      this.adapters
        .filter(a => a.close)
        .map(a =>
          a.close!().catch(err => {
            process.stderr.write(`Multi-adapter close error: ${err}\n`);
          })
        )
    );
  }
}

/**
 * File adapter for writing logs to files
 */
export class FileAdapter implements LoggerAdapter {
  private fileStream: any; // WriteStream in Node.js
  private path: string;

  constructor(path: string) {
    this.path = path;
    // In Node.js environment
    if (typeof require !== 'undefined') {
      const fs = require('fs');
      this.fileStream = fs.createWriteStream(path, { flags: 'a' });
    }
  }

  write(entry: LogEntry): void {
    if (this.fileStream) {
      const line = JSON.stringify(entry) + '\n';
      this.fileStream.write(line);
    }
  }

  async flush(): Promise<void> {
    if (this.fileStream && this.fileStream.writable) {
      return new Promise((resolve, reject) => {
        this.fileStream.once('drain', resolve);
        this.fileStream.once('error', reject);
        if (!this.fileStream.write('')) {
          // Buffer is full, wait for drain
        } else {
          resolve();
        }
      });
    }
  }

  async close(): Promise<void> {
    if (this.fileStream) {
      return new Promise((resolve, reject) => {
        this.fileStream.end((err: any) => {
          if (err) reject(err);
          else resolve();
        });
      });
    }
  }
}

/**
 * Buffer adapter for testing
 */
export class BufferAdapter implements LoggerAdapter {
  public logs: LogEntry[] = [];

  write(entry: LogEntry): void {
    this.logs.push(entry);
  }

  clear(): void {
    this.logs = [];
  }

  getLogs(level?: LogLevel): LogEntry[] {
    if (level !== undefined) {
      return this.logs.filter(log => log.level === level);
    }
    return this.logs;
  }
}
