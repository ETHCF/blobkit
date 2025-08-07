import { EventEmitter } from 'events';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('CircuitBreaker');

/**
 * Circuit breaker states
 */
export enum CircuitState {
  CLOSED = 'CLOSED', // Normal operation
  OPEN = 'OPEN', // Failing, reject all requests
  HALF_OPEN = 'HALF_OPEN' // Testing if service recovered
}

/**
 * Circuit breaker configuration
 */
export interface CircuitBreakerConfig {
  name: string;
  failureThreshold: number; // Number of failures before opening
  resetTimeout: number; // Time in ms before trying half-open
  monitoringPeriod: number; // Time window for counting failures
  minimumRequests: number; // Minimum requests before evaluating
  successThreshold: number; // Successes needed to close from half-open
}

/**
 * Circuit breaker metrics
 */
export interface CircuitBreakerMetrics {
  state: CircuitState;
  failures: number;
  successes: number;
  lastFailureTime: number;
  lastStateChange: number;
  totalRequests: number;
  rejectedRequests: number;
}

/**
 * Circuit breaker implementation
 */
export class CircuitBreaker extends EventEmitter {
  private state: CircuitState = CircuitState.CLOSED;
  private failures = 0;
  private successes = 0;
  private lastFailureTime = 0;
  private lastStateChange = Date.now();
  private totalRequests = 0;
  private rejectedRequests = 0;
  private resetTimer?: NodeJS.Timeout;
  private monitoringWindowStart = Date.now();

  constructor(private config: CircuitBreakerConfig) {
    super();
  }

  /**
   * Execute a function with circuit breaker protection
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    this.totalRequests++;

    // Check if circuit is open
    if (this.state === CircuitState.OPEN) {
      this.rejectedRequests++;
      this.emit('rejected', { name: this.config.name });
      throw new Error(`Circuit breaker ${this.config.name} is OPEN`);
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure(error);
      throw error;
    }
  }

  /**
   * Handle successful execution
   */
  private onSuccess(): void {
    this.successes++;

    // Reset monitoring window if needed
    this.checkMonitoringWindow();

    if (this.state === CircuitState.HALF_OPEN) {
      if (this.successes >= this.config.successThreshold) {
        this.close();
      }
    }
  }

  /**
   * Handle failed execution
   */
  private onFailure(error: unknown): void {
    this.failures++;
    this.lastFailureTime = Date.now();

    // Reset monitoring window if needed
    this.checkMonitoringWindow();

    logger.error(`Circuit breaker ${this.config.name} recorded failure:`, error);
    this.emit('failure', { name: this.config.name, error });

    if (this.state === CircuitState.HALF_OPEN) {
      this.open();
    } else if (this.state === CircuitState.CLOSED) {
      if (
        this.failures >= this.config.failureThreshold &&
        this.totalRequests >= this.config.minimumRequests
      ) {
        this.open();
      }
    }
  }

  /**
   * Open the circuit (reject all requests)
   */
  private open(): void {
    if (this.state === CircuitState.OPEN) return;

    this.state = CircuitState.OPEN;
    this.lastStateChange = Date.now();

    logger.warn(`Circuit breaker ${this.config.name} is now OPEN`);
    this.emit('open', { name: this.config.name });

    // Schedule reset attempt
    if (this.resetTimer) {
      clearTimeout(this.resetTimer);
    }

    this.resetTimer = setTimeout(() => {
      this.halfOpen();
    }, this.config.resetTimeout);
  }

  /**
   * Move to half-open state (testing recovery)
   */
  private halfOpen(): void {
    this.state = CircuitState.HALF_OPEN;
    this.lastStateChange = Date.now();
    this.successes = 0;
    this.failures = 0;

    logger.info(`Circuit breaker ${this.config.name} is now HALF_OPEN`);
    this.emit('half-open', { name: this.config.name });
  }

  /**
   * Close the circuit (normal operation)
   */
  private close(): void {
    this.state = CircuitState.CLOSED;
    this.lastStateChange = Date.now();
    this.failures = 0;
    this.successes = 0;

    logger.info(`Circuit breaker ${this.config.name} is now CLOSED`);
    this.emit('close', { name: this.config.name });
  }

  /**
   * Check if monitoring window should be reset
   */
  private checkMonitoringWindow(): void {
    const now = Date.now();
    if (now - this.monitoringWindowStart > this.config.monitoringPeriod) {
      this.monitoringWindowStart = now;
      this.failures = 0;
      this.successes = 0;
      this.totalRequests = 0;
    }
  }

  /**
   * Get current metrics
   */
  getMetrics(): CircuitBreakerMetrics {
    return {
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      lastFailureTime: this.lastFailureTime,
      lastStateChange: this.lastStateChange,
      totalRequests: this.totalRequests,
      rejectedRequests: this.rejectedRequests
    };
  }

  /**
   * Reset the circuit breaker
   */
  reset(): void {
    if (this.resetTimer) {
      clearTimeout(this.resetTimer);
    }

    this.state = CircuitState.CLOSED;
    this.failures = 0;
    this.successes = 0;
    this.lastFailureTime = 0;
    this.lastStateChange = Date.now();
    this.totalRequests = 0;
    this.rejectedRequests = 0;
    this.monitoringWindowStart = Date.now();

    logger.info(`Circuit breaker ${this.config.name} has been reset`);
    this.emit('reset', { name: this.config.name });
  }
}

/**
 * Default circuit breaker configurations
 */
export const DEFAULT_CONFIGS = {
  blobExecutor: {
    name: 'blob-executor',
    failureThreshold: 5,
    resetTimeout: 60000, // 1 minute
    monitoringPeriod: 300000, // 5 minutes
    minimumRequests: 10,
    successThreshold: 3
  },
  escrowContract: {
    name: 'escrow-contract',
    failureThreshold: 3,
    resetTimeout: 30000, // 30 seconds
    monitoringPeriod: 60000, // 1 minute
    minimumRequests: 5,
    successThreshold: 2
  },
  redisConnection: {
    name: 'redis-connection',
    failureThreshold: 5,
    resetTimeout: 10000, // 10 seconds
    monitoringPeriod: 60000, // 1 minute
    minimumRequests: 5,
    successThreshold: 1
  }
};

/**
 * Circuit breaker manager for centralized monitoring
 */
export class CircuitBreakerManager {
  private breakers = new Map<string, CircuitBreaker>();

  /**
   * Register a circuit breaker
   */
  register(breaker: CircuitBreaker, config: CircuitBreakerConfig): void {
    this.breakers.set(config.name, breaker);

    // Set up event logging
    breaker.on('open', data => {
      logger.warn('Circuit breaker opened:', data);
    });

    breaker.on('close', data => {
      logger.info('Circuit breaker closed:', data);
    });

    breaker.on('failure', data => {
      logger.error('Circuit breaker failure:', data);
    });
  }

  /**
   * Get all circuit breaker metrics
   */
  getAllMetrics(): Record<string, CircuitBreakerMetrics> {
    const metrics: Record<string, CircuitBreakerMetrics> = {};

    for (const [name, breaker] of this.breakers) {
      metrics[name] = breaker.getMetrics();
    }

    return metrics;
  }

  /**
   * Check if any circuit is open
   */
  hasOpenCircuits(): boolean {
    for (const breaker of this.breakers.values()) {
      if (breaker.getMetrics().state === CircuitState.OPEN) {
        return true;
      }
    }
    return false;
  }

  /**
   * Reset all circuit breakers
   */
  resetAll(): void {
    for (const breaker of this.breakers.values()) {
      breaker.reset();
    }
  }
}

// Global circuit breaker manager instance
export const circuitBreakerManager = new CircuitBreakerManager();
