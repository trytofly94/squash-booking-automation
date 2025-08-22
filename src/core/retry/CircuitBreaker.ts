/**
 * Circuit Breaker implementation to prevent cascading failures
 * Implements the Circuit Breaker pattern with CLOSED, OPEN, and HALF_OPEN states
 */

import { CircuitBreakerConfig, CircuitBreakerState } from './RetryConfig';
import { logger } from '../../utils/logger';

/**
 * Circuit breaker statistics
 */
export interface CircuitBreakerStats {
  /** Current state of the circuit breaker */
  state: CircuitBreakerState;
  /** Number of failures in current window */
  failureCount: number;
  /** Number of successes in current window */
  successCount: number;
  /** Total number of requests attempted */
  totalRequests: number;
  /** Total number of requests that failed */
  totalFailures: number;
  /** Total number of requests that succeeded */
  totalSuccesses: number;
  /** Timestamp when circuit last opened */
  lastOpenedAt?: number;
  /** Timestamp when circuit last closed */
  lastClosedAt?: number;
  /** Timestamp when circuit last transitioned to half-open */
  lastHalfOpenAt?: number;
  /** Time remaining until circuit can transition from OPEN to HALF_OPEN */
  timeToHalfOpen?: number;
  /** Configuration being used */
  config: CircuitBreakerConfig;
}

/**
 * Circuit breaker event types
 */
export enum CircuitBreakerEvent {
  STATE_CHANGE = 'STATE_CHANGE',
  FAILURE_RECORDED = 'FAILURE_RECORDED',
  SUCCESS_RECORDED = 'SUCCESS_RECORDED',
  REQUEST_REJECTED = 'REQUEST_REJECTED',
  REQUEST_ALLOWED = 'REQUEST_ALLOWED'
}

/**
 * Circuit breaker event data
 */
export interface CircuitBreakerEventData {
  event: CircuitBreakerEvent;
  timestamp: number;
  state: CircuitBreakerState;
  previousState?: CircuitBreakerState;
  context?: Record<string, unknown>;
}

/**
 * Circuit breaker that protects against cascading failures
 * by monitoring failure rates and temporarily blocking requests
 */
export class CircuitBreaker {
  private config: CircuitBreakerConfig;
  private state: CircuitBreakerState = CircuitBreakerState.CLOSED;
  private failureCount = 0;
  private successCount = 0;
  private totalRequests = 0;
  private totalFailures = 0;
  private totalSuccesses = 0;
  private lastOpenedAt?: number;
  private lastClosedAt?: number;
  private lastHalfOpenAt?: number;
  private readonly eventListeners: ((event: CircuitBreakerEventData) => void)[] = [];
  private readonly component = 'CircuitBreaker';

  constructor(config: CircuitBreakerConfig) {
    this.config = { ...config };
    this.lastClosedAt = Date.now();

    logger.info('Circuit breaker initialized', this.component, {
      enabled: config.enabled,
      failureThreshold: config.failureThreshold,
      openTimeoutMs: config.openTimeoutMs,
      successThreshold: config.successThreshold
    });
  }

  /**
   * Check if a request should be allowed through the circuit breaker
   */
  canExecute(): boolean {
    if (!this.config.enabled) {
      return true;
    }

    this.totalRequests++;

    switch (this.state) {
      case CircuitBreakerState.CLOSED:
        this.emitEvent(CircuitBreakerEvent.REQUEST_ALLOWED, {
          state: this.state,
          reason: 'Circuit is closed'
        });
        return true;

      case CircuitBreakerState.OPEN:
        if (this.shouldTransitionToHalfOpen()) {
          this.transitionToHalfOpen();
          this.emitEvent(CircuitBreakerEvent.REQUEST_ALLOWED, {
            state: this.state,
            reason: 'Circuit transitioned to half-open'
          });
          return true;
        }
        
        this.emitEvent(CircuitBreakerEvent.REQUEST_REJECTED, {
          state: this.state,
          reason: 'Circuit is open',
          timeToHalfOpen: this.getTimeToHalfOpen()
        });
        return false;

      case CircuitBreakerState.HALF_OPEN:
        this.emitEvent(CircuitBreakerEvent.REQUEST_ALLOWED, {
          state: this.state,
          reason: 'Circuit is half-open - testing request'
        });
        return true;

      default:
        logger.warn('Unknown circuit breaker state', this.component, { state: this.state });
        return true;
    }
  }

  /**
   * Record a successful execution
   */
  recordSuccess(): void {
    if (!this.config.enabled) {
      return;
    }

    this.totalSuccesses++;
    this.successCount++;

    if (this.config.resetOnSuccess && this.state === CircuitBreakerState.CLOSED) {
      this.failureCount = 0;
    }

    this.emitEvent(CircuitBreakerEvent.SUCCESS_RECORDED, {
      state: this.state,
      successCount: this.successCount,
      failureCount: this.failureCount
    });

    if (this.state === CircuitBreakerState.HALF_OPEN) {
      if (this.successCount >= this.config.successThreshold) {
        this.transitionToClosed();
      }
    }

    logger.debug('Success recorded', this.component, {
      state: this.state,
      successCount: this.successCount,
      failureCount: this.failureCount
    });
  }

  /**
   * Record a failed execution
   */
  recordFailure(error?: Error | string): void {
    if (!this.config.enabled) {
      return;
    }

    this.totalFailures++;
    this.failureCount++;
    this.successCount = 0; // Reset success count on failure

    this.emitEvent(CircuitBreakerEvent.FAILURE_RECORDED, {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      error: typeof error === 'string' ? error : error?.message
    });

    if (this.state === CircuitBreakerState.CLOSED || this.state === CircuitBreakerState.HALF_OPEN) {
      if (this.failureCount >= this.config.failureThreshold) {
        this.transitionToOpen();
      }
    }

    logger.debug('Failure recorded', this.component, {
      state: this.state,
      failureCount: this.failureCount,
      threshold: this.config.failureThreshold,
      error: typeof error === 'string' ? error : error?.message
    });
  }

  /**
   * Get current circuit breaker statistics
   */
  getStats(): CircuitBreakerStats {
    const stats: CircuitBreakerStats = {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      totalRequests: this.totalRequests,
      totalFailures: this.totalFailures,
      totalSuccesses: this.totalSuccesses,
      config: { ...this.config }
    };
    
    if (this.lastOpenedAt !== undefined) {
      stats.lastOpenedAt = this.lastOpenedAt;
    }
    if (this.lastClosedAt !== undefined) {
      stats.lastClosedAt = this.lastClosedAt;
    }
    if (this.lastHalfOpenAt !== undefined) {
      stats.lastHalfOpenAt = this.lastHalfOpenAt;
    }
    
    const timeToHalfOpen = this.getTimeToHalfOpen();
    if (timeToHalfOpen !== undefined) {
      stats.timeToHalfOpen = timeToHalfOpen;
    }
    
    return stats;
  }

  /**
   * Reset the circuit breaker to closed state
   */
  reset(): void {
    const previousState = this.state;
    this.state = CircuitBreakerState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.lastClosedAt = Date.now();

    logger.info('Circuit breaker reset', this.component, {
      previousState,
      newState: this.state
    });

    this.emitEvent(CircuitBreakerEvent.STATE_CHANGE, {
      state: this.state,
      previousState,
      reason: 'Manual reset'
    });
  }

  /**
   * Force circuit breaker to open state (useful for testing/maintenance)
   */
  forceOpen(): void {
    const previousState = this.state;
    this.state = CircuitBreakerState.OPEN;
    this.lastOpenedAt = Date.now();

    logger.info('Circuit breaker forced open', this.component, {
      previousState,
      newState: this.state
    });

    this.emitEvent(CircuitBreakerEvent.STATE_CHANGE, {
      state: this.state,
      previousState,
      reason: 'Forced open'
    });
  }

  /**
   * Add event listener for circuit breaker events
   */
  addEventListener(listener: (event: CircuitBreakerEventData) => void): void {
    this.eventListeners.push(listener);
  }

  /**
   * Remove event listener
   */
  removeEventListener(listener: (event: CircuitBreakerEventData) => void): void {
    const index = this.eventListeners.indexOf(listener);
    if (index > -1) {
      this.eventListeners.splice(index, 1);
    }
  }

  /**
   * Update circuit breaker configuration
   */
  updateConfig(newConfig: Partial<CircuitBreakerConfig>): void {
    const oldConfig = { ...this.config };
    this.config = { ...this.config, ...newConfig };

    logger.info('Circuit breaker configuration updated', this.component, {
      oldConfig,
      newConfig: this.config,
      changes: Object.keys(newConfig)
    });
  }

  /**
   * Check if circuit breaker is currently enabled
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Get current state
   */
  getState(): CircuitBreakerState {
    return this.state;
  }

  /**
   * Check if requests are currently being allowed
   */
  isRequestAllowed(): boolean {
    return this.canExecute();
  }

  /**
   * Private method to check if circuit should transition to half-open
   */
  private shouldTransitionToHalfOpen(): boolean {
    if (!this.lastOpenedAt) {
      return false;
    }

    const timeSinceOpened = Date.now() - this.lastOpenedAt;
    return timeSinceOpened >= this.config.openTimeoutMs;
  }

  /**
   * Private method to get time remaining until half-open transition
   */
  private getTimeToHalfOpen(): number | undefined {
    if (this.state !== CircuitBreakerState.OPEN || !this.lastOpenedAt) {
      return undefined;
    }

    const timeSinceOpened = Date.now() - this.lastOpenedAt;
    const timeRemaining = this.config.openTimeoutMs - timeSinceOpened;
    return Math.max(0, timeRemaining);
  }

  /**
   * Transition to OPEN state
   */
  private transitionToOpen(): void {
    const previousState = this.state;
    this.state = CircuitBreakerState.OPEN;
    this.lastOpenedAt = Date.now();
    this.successCount = 0; // Reset success count

    logger.warn('Circuit breaker opened', this.component, {
      previousState,
      newState: this.state,
      failureCount: this.failureCount,
      threshold: this.config.failureThreshold,
      timeoutMs: this.config.openTimeoutMs
    });

    this.emitEvent(CircuitBreakerEvent.STATE_CHANGE, {
      state: this.state,
      previousState,
      reason: `Failure threshold exceeded (${this.failureCount}/${this.config.failureThreshold})`
    });
  }

  /**
   * Transition to HALF_OPEN state
   */
  private transitionToHalfOpen(): void {
    const previousState = this.state;
    this.state = CircuitBreakerState.HALF_OPEN;
    this.lastHalfOpenAt = Date.now();
    this.failureCount = 0; // Reset failure count
    this.successCount = 0; // Reset success count

    logger.info('Circuit breaker transitioned to half-open', this.component, {
      previousState,
      newState: this.state,
      successThreshold: this.config.successThreshold
    });

    this.emitEvent(CircuitBreakerEvent.STATE_CHANGE, {
      state: this.state,
      previousState,
      reason: 'Open timeout elapsed - testing recovery'
    });
  }

  /**
   * Transition to CLOSED state
   */
  private transitionToClosed(): void {
    const previousState = this.state;
    this.state = CircuitBreakerState.CLOSED;
    this.lastClosedAt = Date.now();
    this.failureCount = 0; // Reset failure count
    this.successCount = 0; // Reset success count

    logger.info('Circuit breaker closed', this.component, {
      previousState,
      newState: this.state,
      successCount: this.successCount,
      threshold: this.config.successThreshold
    });

    this.emitEvent(CircuitBreakerEvent.STATE_CHANGE, {
      state: this.state,
      previousState,
      reason: `Success threshold reached (${this.successCount}/${this.config.successThreshold})`
    });
  }

  /**
   * Emit circuit breaker event to all listeners
   */
  private emitEvent(event: CircuitBreakerEvent, context: Record<string, unknown> = {}): void {
    const eventData: CircuitBreakerEventData = {
      event,
      timestamp: Date.now(),
      state: this.state,
      context
    };

    this.eventListeners.forEach(listener => {
      try {
        listener(eventData);
      } catch (error) {
        logger.error('Error in circuit breaker event listener', this.component, {
          error: error instanceof Error ? error.message : String(error),
          event: eventData.event
        });
      }
    });
  }
}