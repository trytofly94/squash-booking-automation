import pRetry, { AbortError, Options as PRetryOptions, FailedAttemptError } from 'p-retry';
import { logger } from './logger';
import { RetryConfig } from '../types/booking.types';

export interface RetryContext {
  attempt: number;
  retriesLeft: number;
  error: Error;
}

export interface RetryOptions {
  /** Function name for logging */
  functionName?: string;
  /** Component name for logging */
  component?: string;
  /** Custom error classifier */
  shouldRetry?: (error: Error) => boolean;
  /** Number of retries (overrides config) */
  retries?: number;
  /** Custom retry options from p-retry */
  pRetryOptions?: Partial<PRetryOptions>;
}

export class RetryManager {
  private circuitBreakerState = new Map<string, {
    failures: number;
    lastFailure: number;
    isOpen: boolean;
  }>();

  constructor(private config: RetryConfig) {}

  /**
   * Execute a function with advanced retry logic
   */
  async executeWithRetry<T>(
    fn: () => Promise<T>,
    options: RetryOptions = {}
  ): Promise<T> {
    const {
      functionName = 'Unknown',
      component = 'RetryManager',
      shouldRetry,
      retries,
      pRetryOptions = {}
    } = options;

    // Circuit breaker check
    const circuitKey = `${component}.${functionName}`;
    if (this.isCircuitOpen(circuitKey)) {
      throw new AbortError(`Circuit breaker open for ${circuitKey}`);
    }

    const retryOptions: PRetryOptions = {
      retries: retries || this.config.circuitBreakerThreshold,
      factor: this.config.backoffMultiplier,
      minTimeout: this.config.initialDelay,
      maxTimeout: this.config.maxDelay,
      randomize: true,
      onFailedAttempt: (error) => this.handleFailedAttempt(error, functionName, component),
      ...pRetryOptions,
    };

    try {
      const result = await pRetry(async () => {
        try {
          const result = await fn();
          // Reset circuit breaker on success
          this.resetCircuitBreaker(circuitKey);
          return result;
        } catch (error) {
          const shouldRetryError = shouldRetry 
            ? shouldRetry(error as Error)
            : this.shouldRetryError(error as Error);
          
          if (!shouldRetryError) {
            throw new AbortError(error as Error);
          }
          
          throw error;
        }
      }, retryOptions);

      return result;
    } catch (error) {
      // Update circuit breaker on final failure
      this.updateCircuitBreaker(circuitKey);
      throw error;
    }
  }

  /**
   * Handle failed retry attempt with enhanced logging
   */
  private handleFailedAttempt(
    error: FailedAttemptError, 
    functionName: string, 
    component: string
  ): void {
    const delay = this.calculateDelayWithJitter(error.attemptNumber);
    
    logger.warn(`Retry attempt ${error.attemptNumber} failed`, component, {
      function: functionName,
      attempt: error.attemptNumber,
      retriesLeft: error.retriesLeft,
      error: error.message,
      nextDelay: delay,
      errorType: this.classifyError(error),
    });
  }

  /**
   * Determine if an error should trigger a retry
   */
  private shouldRetryError(error: Error): boolean {
    const errorMessage = error.message.toLowerCase();
    const errorName = error.name.toLowerCase();

    // Network errors
    if (this.config.retryOnNetworkError) {
      if (errorMessage.includes('network') || 
          errorMessage.includes('connection') ||
          errorMessage.includes('timeout') ||
          errorName.includes('networkerror')) {
        return true;
      }
    }

    // Timeout errors
    if (this.config.retryOnTimeout) {
      if (errorMessage.includes('timeout') || 
          errorMessage.includes('exceeded') ||
          errorName.includes('timeouterror')) {
        return true;
      }
    }

    // Playwright-specific errors
    if (errorMessage.includes('page.waitselector') ||
        errorMessage.includes('waitforselector') ||
        errorMessage.includes('locator')) {
      return this.config.retryOnTimeout;
    }

    // Rate limiting (would need HTTP status codes in a real scenario)
    if (this.config.retryOnRateLimit) {
      if (errorMessage.includes('429') || 
          errorMessage.includes('rate limit') ||
          errorMessage.includes('too many requests')) {
        return true;
      }
    }

    // Server errors (5xx)
    if (this.config.retryOnServerError) {
      if (errorMessage.includes('500') || 
          errorMessage.includes('502') ||
          errorMessage.includes('503') ||
          errorMessage.includes('504') ||
          errorMessage.includes('server error')) {
        return true;
      }
    }

    return false;
  }

  /**
   * Classify error for better logging and handling
   */
  private classifyError(error: Error): string {
    const errorMessage = error.message.toLowerCase();
    
    if (errorMessage.includes('timeout') || errorMessage.includes('exceeded')) {
      return 'TIMEOUT';
    }
    if (errorMessage.includes('network') || errorMessage.includes('connection')) {
      return 'NETWORK';
    }
    if (errorMessage.includes('429') || errorMessage.includes('rate limit')) {
      return 'RATE_LIMIT';
    }
    if (errorMessage.includes('5') && errorMessage.includes('error')) {
      return 'SERVER_ERROR';
    }
    if (errorMessage.includes('selector') || errorMessage.includes('locator')) {
      return 'ELEMENT_NOT_FOUND';
    }
    
    return 'UNKNOWN';
  }

  /**
   * Calculate delay with jitter
   */
  private calculateDelayWithJitter(attemptNumber: number): number {
    const baseDelay = Math.min(
      this.config.initialDelay * Math.pow(this.config.backoffMultiplier, attemptNumber - 1),
      this.config.maxDelay
    );
    
    const jitter = baseDelay * this.config.maxJitter * (Math.random() * 2 - 1);
    return Math.max(100, baseDelay + jitter); // Minimum 100ms
  }

  /**
   * Check if circuit breaker is open
   */
  private isCircuitOpen(circuitKey: string): boolean {
    const state = this.circuitBreakerState.get(circuitKey);
    if (!state) return false;

    if (state.isOpen) {
      const timeSinceLastFailure = Date.now() - state.lastFailure;
      if (timeSinceLastFailure > this.config.circuitBreakerTimeout) {
        // Reset circuit breaker after timeout
        state.isOpen = false;
        state.failures = 0;
        logger.info(`Circuit breaker reset for ${circuitKey}`, 'RetryManager');
        return false;
      }
      return true;
    }

    return false;
  }

  /**
   * Update circuit breaker on failure
   */
  private updateCircuitBreaker(circuitKey: string): void {
    const state = this.circuitBreakerState.get(circuitKey) || {
      failures: 0,
      lastFailure: 0,
      isOpen: false,
    };

    state.failures++;
    state.lastFailure = Date.now();

    if (state.failures >= this.config.circuitBreakerThreshold) {
      state.isOpen = true;
      logger.error(`Circuit breaker opened for ${circuitKey}`, 'RetryManager', {
        failures: state.failures,
        threshold: this.config.circuitBreakerThreshold,
      });
    }

    this.circuitBreakerState.set(circuitKey, state);
  }

  /**
   * Reset circuit breaker on success
   */
  private resetCircuitBreaker(circuitKey: string): void {
    const state = this.circuitBreakerState.get(circuitKey);
    if (state && (state.failures > 0 || state.isOpen)) {
      logger.info(`Circuit breaker reset for ${circuitKey}`, 'RetryManager', {
        previousFailures: state.failures,
      });
      this.circuitBreakerState.delete(circuitKey);
    }
  }

  /**
   * Get circuit breaker status for monitoring
   */
  getCircuitBreakerStatus(): Record<string, {
    failures: number;
    isOpen: boolean;
    lastFailure?: Date;
  }> {
    const status: Record<string, any> = {};
    
    for (const [key, state] of this.circuitBreakerState.entries()) {
      status[key] = {
        failures: state.failures,
        isOpen: state.isOpen,
        lastFailure: state.lastFailure ? new Date(state.lastFailure) : undefined,
      };
    }
    
    return status;
  }
}