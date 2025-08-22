/**
 * Error-specific retry strategies with exponential backoff and jitter
 * Implements different retry approaches for different types of errors
 */

import { RetryableErrorType, ErrorRetryStrategy, RetryAttemptInfo } from './RetryConfig';
import { logger } from '../../utils/logger';

/**
 * Delay calculation result
 */
export interface DelayCalculation {
  /** Calculated delay in milliseconds */
  delayMs: number;
  /** Base delay before jitter */
  baseDelayMs: number;
  /** Applied jitter amount */
  jitterMs: number;
  /** Strategy used for calculation */
  strategy: ErrorRetryStrategy;
  /** Attempt number this delay is for */
  attemptNumber: number;
}

/**
 * Retry decision result
 */
export interface RetryDecision {
  /** Whether to retry */
  shouldRetry: boolean;
  /** Reason for the decision */
  reason: string;
  /** Delay before retry (if retrying) */
  delayMs?: number;
  /** Strategy applied */
  strategy: ErrorRetryStrategy;
}

/**
 * Backoff calculation options
 */
export interface BackoffOptions {
  /** Whether to include jitter */
  includeJitter: boolean;
  /** Custom jitter factor (overrides strategy) */
  customJitter?: number;
  /** Minimum delay to enforce */
  minDelayMs?: number;
  /** Maximum delay to enforce */
  maxDelayMs?: number;
}

/**
 * Retry strategies implementation for different error types
 * Provides intelligent delay calculation and retry decisions
 */
export class RetryStrategies {
  private static readonly component = 'RetryStrategies';

  /**
   * Calculate delay for next retry attempt using exponential backoff with jitter
   */
  static calculateDelay(
    strategy: ErrorRetryStrategy,
    attemptNumber: number,
    options: Partial<BackoffOptions> = {}
  ): DelayCalculation {
    const opts: BackoffOptions = {
      includeJitter: true,
      ...options
    };

    // Calculate base exponential backoff: initialDelay * multiplier^(attempt-1)
    const baseDelayMs = Math.min(
      strategy.initialDelay * Math.pow(strategy.backoffMultiplier, attemptNumber - 1),
      strategy.maxDelay
    );

    // Apply minimum delay constraint
    const constrainedBaseDelay = Math.max(
      baseDelayMs,
      opts.minDelayMs || 0
    );

    // Apply maximum delay constraint
    const finalBaseDelay = Math.min(
      constrainedBaseDelay,
      opts.maxDelayMs || strategy.maxDelay
    );

    // Calculate jitter
    let jitterMs = 0;
    if (opts.includeJitter) {
      const jitterFactor = opts.customJitter !== undefined ? opts.customJitter : strategy.maxJitter;
      const maxJitterMs = finalBaseDelay * jitterFactor;
      // Random jitter between -maxJitter and +maxJitter
      jitterMs = (Math.random() * 2 - 1) * maxJitterMs;
    }

    // Final delay with jitter applied
    const delayMs = Math.max(0, Math.round(finalBaseDelay + jitterMs));

    const calculation: DelayCalculation = {
      delayMs,
      baseDelayMs: finalBaseDelay,
      jitterMs,
      strategy,
      attemptNumber
    };

    logger.debug('Calculated retry delay', this.component, {
      attemptNumber,
      baseDelayMs: finalBaseDelay,
      jitterMs,
      finalDelayMs: delayMs,
      jitterEnabled: opts.includeJitter,
      strategy: {
        initialDelay: strategy.initialDelay,
        maxDelay: strategy.maxDelay,
        backoffMultiplier: strategy.backoffMultiplier,
        maxJitter: strategy.maxJitter
      }
    });

    return calculation;
  }

  /**
   * Decide whether to retry based on error type, attempt number, and strategy
   */
  static shouldRetry(
    errorType: RetryableErrorType,
    strategy: ErrorRetryStrategy,
    attemptNumber: number,
    error?: Error | string
  ): RetryDecision {
    // Check if strategy is enabled
    if (!strategy.enabled) {
      return {
        shouldRetry: false,
        reason: `Retry strategy disabled for ${errorType}`,
        strategy
      };
    }

    // Check attempt count
    if (attemptNumber >= strategy.maxAttempts) {
      return {
        shouldRetry: false,
        reason: `Maximum attempts reached (${attemptNumber}/${strategy.maxAttempts})`,
        strategy
      };
    }

    // Apply error-specific logic
    const errorSpecificDecision = this.applyErrorSpecificLogic(errorType, error, strategy);
    if (!errorSpecificDecision.shouldRetry) {
      return errorSpecificDecision;
    }

    // Calculate delay for next attempt
    const delayCalculation = this.calculateDelay(strategy, attemptNumber + 1);

    const decision: RetryDecision = {
      shouldRetry: true,
      reason: `Retry attempt ${attemptNumber + 1}/${strategy.maxAttempts} for ${errorType}`,
      delayMs: delayCalculation.delayMs,
      strategy
    };

    logger.debug('Retry decision made', this.component, {
      errorType,
      attemptNumber,
      shouldRetry: decision.shouldRetry,
      reason: decision.reason,
      delayMs: decision.delayMs
    });

    return decision;
  }

  /**
   * Apply error-specific retry logic
   */
  private static applyErrorSpecificLogic(
    errorType: RetryableErrorType,
    error: Error | string | undefined,
    strategy: ErrorRetryStrategy
  ): RetryDecision {
    const errorMessage = typeof error === 'string' ? error : error?.message || '';
    const lowerErrorMessage = errorMessage.toLowerCase();

    switch (errorType) {
      case RetryableErrorType.NETWORK_ERROR:
        return this.handleNetworkError(lowerErrorMessage, strategy);

      case RetryableErrorType.TIMEOUT_ERROR:
        return this.handleTimeoutError(lowerErrorMessage, strategy);

      case RetryableErrorType.RATE_LIMIT_ERROR:
        return this.handleRateLimitError(lowerErrorMessage, strategy);

      case RetryableErrorType.SERVER_ERROR:
        return this.handleServerError(lowerErrorMessage, strategy);

      case RetryableErrorType.AUTHENTICATION_ERROR:
        return this.handleAuthenticationError(lowerErrorMessage, strategy);

      case RetryableErrorType.NAVIGATION_ERROR:
        return this.handleNavigationError(lowerErrorMessage, strategy);

      case RetryableErrorType.BOOKING_ERROR:
        return this.handleBookingError(lowerErrorMessage, strategy);

      default:
        return {
          shouldRetry: true,
          reason: `Default retry logic for ${errorType}`,
          strategy
        };
    }
  }

  /**
   * Handle network error specific logic
   */
  private static handleNetworkError(errorMessage: string, strategy: ErrorRetryStrategy): RetryDecision {
    // Don't retry on DNS resolution failures after initial attempts
    if (errorMessage.includes('enotfound') || errorMessage.includes('dns')) {
      return {
        shouldRetry: false,
        reason: 'DNS resolution failure - likely persistent issue',
        strategy
      };
    }

    // Don't retry on certificate errors
    if (errorMessage.includes('cert') || errorMessage.includes('ssl') || errorMessage.includes('tls')) {
      return {
        shouldRetry: false,
        reason: 'Certificate/SSL error - unlikely to resolve with retry',
        strategy
      };
    }

    return {
      shouldRetry: true,
      reason: 'Network error - may be transient',
      strategy
    };
  }

  /**
   * Handle timeout error specific logic
   */
  private static handleTimeoutError(errorMessage: string, strategy: ErrorRetryStrategy): RetryDecision {
    // Page load timeouts might need more aggressive retry
    if (errorMessage.includes('page') && errorMessage.includes('load')) {
      return {
        shouldRetry: true,
        reason: 'Page load timeout - may succeed with retry',
        strategy
      };
    }

    return {
      shouldRetry: true,
      reason: 'Timeout error - may resolve with retry',
      strategy
    };
  }

  /**
   * Handle rate limiting error specific logic
   */
  private static handleRateLimitError(_errorMessage: string, strategy: ErrorRetryStrategy): RetryDecision {
    // Always retry rate limiting with longer delays
    return {
      shouldRetry: true,
      reason: 'Rate limiting - retry with backoff',
      strategy
    };
  }

  /**
   * Handle server error specific logic
   */
  private static handleServerError(errorMessage: string, strategy: ErrorRetryStrategy): RetryDecision {
    // Don't retry on maintenance mode
    if (errorMessage.includes('maintenance') || errorMessage.includes('503')) {
      return {
        shouldRetry: false,
        reason: 'Server in maintenance mode - retry unlikely to succeed',
        strategy
      };
    }

    // Retry other server errors
    return {
      shouldRetry: true,
      reason: 'Server error - may be transient',
      strategy
    };
  }

  /**
   * Handle authentication error specific logic
   */
  private static handleAuthenticationError(errorMessage: string, strategy: ErrorRetryStrategy): RetryDecision {
    // Don't retry on invalid credentials
    if ((errorMessage.includes('invalid') && (errorMessage.includes('credential') || errorMessage.includes('credentials'))) ||
        errorMessage.includes('401') ||
        errorMessage.includes('unauthorized')) {
      return {
        shouldRetry: false,
        reason: 'Invalid credentials - retry will not resolve',
        strategy
      };
    }

    // Retry on session expiration
    if (errorMessage.includes('session') || errorMessage.includes('token')) {
      return {
        shouldRetry: true,
        reason: 'Session/token issue - may resolve with retry',
        strategy
      };
    }

    return {
      shouldRetry: true,
      reason: 'Authentication error - may be transient',
      strategy
    };
  }

  /**
   * Handle navigation error specific logic
   */
  private static handleNavigationError(_errorMessage: string, strategy: ErrorRetryStrategy): RetryDecision {
    // Always retry navigation errors as they're often transient
    return {
      shouldRetry: true,
      reason: 'Navigation error - often transient',
      strategy
    };
  }

  /**
   * Handle booking error specific logic
   */
  private static handleBookingError(errorMessage: string, strategy: ErrorRetryStrategy): RetryDecision {
    // Don't retry payment failures
    if (errorMessage.includes('payment') || errorMessage.includes('transaction')) {
      return {
        shouldRetry: false,
        reason: 'Payment error - manual intervention required',
        strategy
      };
    }

    // Don't retry if slot is no longer available
    if (errorMessage.includes('not available') || errorMessage.includes('already booked')) {
      return {
        shouldRetry: false,
        reason: 'Slot unavailable - retry will not succeed',
        strategy
      };
    }

    return {
      shouldRetry: true,
      reason: 'Booking error - may be transient',
      strategy
    };
  }

  /**
   * Calculate total time for all retry attempts with given strategy
   */
  static calculateTotalRetryTime(strategy: ErrorRetryStrategy): number {
    let totalTime = 0;
    
    for (let attempt = 1; attempt <= strategy.maxAttempts; attempt++) {
      const delay = this.calculateDelay(strategy, attempt, { includeJitter: false });
      totalTime += delay.delayMs;
    }

    return totalTime;
  }

  /**
   * Get recommended strategy for error type
   */
  static getRecommendedStrategy(errorType: RetryableErrorType): ErrorRetryStrategy {
    const strategies: Record<RetryableErrorType, ErrorRetryStrategy> = {
      [RetryableErrorType.NETWORK_ERROR]: {
        enabled: true,
        maxAttempts: 5,
        initialDelay: 1000,
        maxDelay: 16000,
        backoffMultiplier: 2,
        maxJitter: 0.1,
        useCircuitBreaker: true
      },
      [RetryableErrorType.TIMEOUT_ERROR]: {
        enabled: true,
        maxAttempts: 3,
        initialDelay: 2000,
        maxDelay: 10000,
        backoffMultiplier: 2.5,
        maxJitter: 0.15,
        useCircuitBreaker: true
      },
      [RetryableErrorType.RATE_LIMIT_ERROR]: {
        enabled: true,
        maxAttempts: 3,
        initialDelay: 5000,
        maxDelay: 45000,
        backoffMultiplier: 3,
        maxJitter: 0.2,
        useCircuitBreaker: true
      },
      [RetryableErrorType.SERVER_ERROR]: {
        enabled: true,
        maxAttempts: 3,
        initialDelay: 3000,
        maxDelay: 27000,
        backoffMultiplier: 3,
        maxJitter: 0.1,
        useCircuitBreaker: true
      },
      [RetryableErrorType.AUTHENTICATION_ERROR]: {
        enabled: true,
        maxAttempts: 2,
        initialDelay: 2000,
        maxDelay: 5000,
        backoffMultiplier: 2.5,
        maxJitter: 0.05,
        useCircuitBreaker: false
      },
      [RetryableErrorType.NAVIGATION_ERROR]: {
        enabled: true,
        maxAttempts: 3,
        initialDelay: 2000,
        maxDelay: 8000,
        backoffMultiplier: 2,
        maxJitter: 0.1,
        useCircuitBreaker: true
      },
      [RetryableErrorType.BOOKING_ERROR]: {
        enabled: true,
        maxAttempts: 2,
        initialDelay: 3000,
        maxDelay: 12000,
        backoffMultiplier: 2,
        maxJitter: 0.1,
        useCircuitBreaker: true
      },
      [RetryableErrorType.UNKNOWN_ERROR]: {
        enabled: true,
        maxAttempts: 2,
        initialDelay: 2000,
        maxDelay: 8000,
        backoffMultiplier: 2,
        maxJitter: 0.1,
        useCircuitBreaker: true
      }
    };

    return strategies[errorType];
  }

  /**
   * Create attempt info for logging
   */
  static createAttemptInfo(
    attemptNumber: number,
    maxAttempts: number,
    error: Error,
    errorType: RetryableErrorType,
    delayMs: number,
    elapsedMs: number,
    strategy: ErrorRetryStrategy,
    operation: string,
    circuitBreakerState: string
  ): RetryAttemptInfo {
    return {
      attemptNumber,
      maxAttempts,
      error,
      errorType,
      delayMs,
      elapsedMs,
      strategy,
      operation,
      circuitBreakerState: circuitBreakerState as any
    };
  }

  /**
   * Validate retry strategy configuration
   */
  static validateStrategy(strategy: ErrorRetryStrategy): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (strategy.maxAttempts < 1) {
      errors.push('maxAttempts must be at least 1');
    }

    if (strategy.initialDelay < 0) {
      errors.push('initialDelay must be non-negative');
    }

    if (strategy.maxDelay < strategy.initialDelay) {
      errors.push('maxDelay must be >= initialDelay');
    }

    if (strategy.backoffMultiplier < 1) {
      errors.push('backoffMultiplier must be >= 1');
    }

    if (strategy.maxJitter < 0 || strategy.maxJitter > 1) {
      errors.push('maxJitter must be between 0 and 1');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }
}