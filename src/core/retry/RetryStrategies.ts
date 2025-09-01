/**
 * Error-specific retry strategies for different failure scenarios
 * Provides intelligent retry logic based on error types
 */

import { backOff } from 'exponential-backoff';
import {
  ErrorCategory,
  ErrorClassification,
  RetryOptions
} from '../../types/retry.types';
import { logger } from '../../utils/logger';

/**
 * Predefined retry strategies for different error types
 */
export const RETRY_STRATEGIES: Record<ErrorCategory, RetryOptions> = {
  [ErrorCategory.NETWORK]: {
    retries: 5,
    factor: 2,
    minTimeout: 1000,
    maxTimeout: 10000,
    randomize: true, // Add jitter to prevent thundering herd
  },
  
  [ErrorCategory.RATE_LIMIT]: {
    retries: 3,
    factor: 3,
    minTimeout: 5000,
    maxTimeout: 30000,
    randomize: true, // Important for rate limiting
  },
  
  [ErrorCategory.SERVER_ERROR]: {
    retries: 2,
    factor: 2,
    minTimeout: 2000,
    maxTimeout: 8000,
    randomize: false, // Deterministic for server errors
  },
  
  [ErrorCategory.TIMEOUT]: {
    retries: 4,
    factor: 1.5,
    minTimeout: 500,
    maxTimeout: 5000,
    randomize: true,
  },
  
  [ErrorCategory.CLIENT_ERROR]: {
    retries: 0, // Don't retry client errors (4xx)
    factor: 1,
    minTimeout: 0,
    maxTimeout: 0,
    randomize: false,
  },
  
  [ErrorCategory.AUTHENTICATION]: {
    retries: 1, // Try once more for auth errors
    factor: 1,
    minTimeout: 1000,
    maxTimeout: 2000,
    randomize: false,
  },
  
  [ErrorCategory.VALIDATION]: {
    retries: 0, // Don't retry validation errors
    factor: 1,
    minTimeout: 0,
    maxTimeout: 0,
    randomize: false,
  },
  
  [ErrorCategory.UNKNOWN]: {
    retries: 2, // Conservative approach for unknown errors
    factor: 2,
    minTimeout: 1000,
    maxTimeout: 5000,
    randomize: true,
  }
};

/**
 * Error classifier that determines retry strategy based on error type
 */
export class ErrorClassifier {
  private component = 'ErrorClassifier';

  /**
   * Classify an error and determine appropriate retry strategy
   */
  classify(error: any): ErrorClassification {
    const errorMessage = this.getErrorMessage(error);
    const httpStatus = this.getHttpStatus(error);
    
    logger.debug('Classifying error for retry strategy', this.component, {
      errorMessage,
      httpStatus,
      errorType: typeof error,
      errorName: error?.name
    });

    // HTTP Status Code based classification
    if (httpStatus) {
      return this.classifyByHttpStatus(httpStatus, error);
    }

    // Timeout errors (check before network to catch ETIMEDOUT)
    if (this.isTimeoutError(error)) {
      return this.createClassification(
        ErrorCategory.TIMEOUT,
        true,
        false,
        'Request timeout',
        error
      );
    }

    // Network and connection errors
    if (this.isNetworkError(error)) {
      return this.createClassification(
        ErrorCategory.NETWORK,
        true,
        false,
        'Network connectivity issue',
        error
      );
    }

    // Authentication errors
    if (this.isAuthError(error)) {
      return this.createClassification(
        ErrorCategory.AUTHENTICATION,
        true,
        false,
        'Authentication error',
        error
      );
    }

    // Default to unknown category
    return this.createClassification(
      ErrorCategory.UNKNOWN,
      true,
      false,
      'Unknown error type',
      error
    );
  }

  /**
   * Classify error based on HTTP status code
   */
  private classifyByHttpStatus(
    status: number,
    error: any
  ): ErrorClassification {
    // Rate limiting (429 Too Many Requests)
    if (status === 429) {
      return this.createClassification(
        ErrorCategory.RATE_LIMIT,
        true,
        false,
        'Rate limit exceeded',
        error,
        status
      );
    }

    // Client errors (4xx) - usually not retryable
    if (status >= 400 && status < 500) {
      // Special cases that might be retryable
      if (status === 408 || status === 409) { // Request Timeout, Conflict
        return this.createClassification(
          ErrorCategory.TIMEOUT,
          true,
          false,
          `HTTP ${status} - potentially temporary`,
          error,
          status
        );
      }
      
      // Authentication errors
      if (status === 401 || status === 403) {
        return this.createClassification(
          ErrorCategory.AUTHENTICATION,
          true,
          false,
          `HTTP ${status} - authentication issue`,
          error,
          status
        );
      }
      
      // Most 4xx errors should not be retried
      return this.createClassification(
        ErrorCategory.CLIENT_ERROR,
        false,
        true,
        `HTTP ${status} - client error`,
        error,
        status
      );
    }

    // Server errors (5xx) - usually retryable
    if (status >= 500) {
      return this.createClassification(
        ErrorCategory.SERVER_ERROR,
        true,
        false,
        `HTTP ${status} - server error`,
        error,
        status
      );
    }

    // Other status codes
    return this.createClassification(
      ErrorCategory.UNKNOWN,
      true,
      false,
      `HTTP ${status} - unknown status`,
      error,
      status
    );
  }

  /**
   * Create error classification object
   */
  private createClassification(
    category: ErrorCategory,
    shouldRetry: boolean,
    shouldAbort: boolean,
    reason: string,
    error: any,
    httpStatus?: number
  ): ErrorClassification {
    const classification: ErrorClassification = {
      category,
      shouldRetry,
      shouldAbort,
      strategy: RETRY_STRATEGIES[category],
      reason,
      ...(httpStatus !== undefined && { httpStatus })
    };

    logger.debug('Error classified for retry', this.component, {
      classification,
      errorMessage: this.getErrorMessage(error)
    });

    return classification;
  }

  /**
   * Check if error is a network connectivity issue
   */
  private isNetworkError(error: any): boolean {
    const message = this.getErrorMessage(error).toLowerCase();
    const networkKeywords = [
      'network',
      'connection',
      'enotfound',
      'econnreset',
      'econnrefused',
      'ehostunreach',
      'enetunreach',
      'dns'
    ];
    
    // Socket-specific keywords that aren't timeouts
    const socketKeywords = [
      'socket hang up',
      'socket disconnected',
      'socket closed'
    ];

    // Specific network error codes (exclude ETIMEDOUT which is a timeout)
    const networkCodes = ['ENOTFOUND', 'ECONNRESET', 'ECONNREFUSED', 'EHOSTUNREACH', 'ENETUNREACH', 'ECONNABORTED'];
    const isNetworkCode = error?.code && networkCodes.includes(error.code.toUpperCase());

    return networkKeywords.some(keyword => message.includes(keyword)) ||
           socketKeywords.some(keyword => message.includes(keyword)) ||
           isNetworkCode ||
           error?.name === 'NetworkError';
  }

  /**
   * Check if error code is specifically a network error (not timeout)
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private isSpecificNetworkCode(code: string): boolean {
    if (!code) return false;
    
    const networkCodes = [
      'ENOTFOUND',
      'ECONNRESET',
      'ECONNREFUSED', 
      'EHOSTUNREACH',
      'ENETUNREACH',
      'ECONNABORTED'
    ];
    
    return networkCodes.includes(code.toUpperCase());
  }

  /**
   * Check if error is a timeout
   */
  private isTimeoutError(error: any): boolean {
    const message = this.getErrorMessage(error).toLowerCase();
    const timeoutKeywords = [
      'timeout',
      'timed out',
      'etimedout',
      'request timeout',
      'navigation timeout'
    ];

    // Check for specific timeout error codes
    if (error?.code === 'ETIMEDOUT') {
      return true;
    }

    return timeoutKeywords.some(keyword => message.includes(keyword)) ||
           error?.name === 'TimeoutError' ||
           error?.code === 'ETIMEDOUT';
  }

  /**
   * Check if error is authentication related
   */
  private isAuthError(error: any): boolean {
    const message = this.getErrorMessage(error).toLowerCase();
    const authKeywords = [
      'unauthorized',
      'forbidden',
      'authentication',
      'authenticated',
      'login',
      'credentials',
      'token'
    ];

    return authKeywords.some(keyword => message.includes(keyword)) ||
           error?.name === 'AuthenticationError';
  }

  /**
   * Extract HTTP status code from error
   */
  private getHttpStatus(error: any): number | undefined {
    return error?.status || 
           error?.response?.status || 
           error?.statusCode ||
           error?.httpStatus;
  }

  /**
   * Get error message from various error formats
   */
  private getErrorMessage(error: any): string {
    if (typeof error === 'string') {
      return error;
    }
    
    return error?.message || 
           error?.response?.statusText ||
           error?.statusText ||
           String(error);
  }

  /**
   * Get retry strategy for specific error category
   */
  getStrategyForCategory(category: ErrorCategory): RetryOptions {
    return { ...RETRY_STRATEGIES[category] };
  }

  /**
   * Update retry strategy for a category (useful for testing)
   */
  updateStrategy(category: ErrorCategory, options: Partial<RetryOptions>): void {
    RETRY_STRATEGIES[category] = {
      ...RETRY_STRATEGIES[category],
      ...options
    };
    
    logger.info('Retry strategy updated', this.component, {
      category,
      newStrategy: RETRY_STRATEGIES[category]
    });
  }
}

/**
 * Exponential backoff utility with jitter
 */
export class BackoffCalculator {
  /**
   * Calculate delay for retry attempt with exponential backoff and optional jitter
   */
  static calculateDelay(
    attempt: number,
    options: RetryOptions
  ): number {
    const { factor, minTimeout, maxTimeout, randomize } = options;
    
    // Calculate exponential delay
    let delay = Math.min(
      minTimeout * Math.pow(factor, attempt - 1),
      maxTimeout
    );
    
    // Add jitter if enabled
    if (randomize) {
      delay = this.addJitter(delay);
    }
    
    return Math.floor(delay);
  }

  /**
   * Add jitter to delay to prevent thundering herd effect
   */
  private static addJitter(delay: number): number {
    // Add ±25% jitter
    const jitter = delay * 0.25;
    return delay + (Math.random() * 2 * jitter - jitter);
  }
}

/**
 * Utility function to create custom retry operations with exponential backoff
 */
export async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  options: RetryOptions
): Promise<T> {
  return backOff(operation, {
    numOfAttempts: options.retries + 1, // backOff counts first attempt
    startingDelay: options.minTimeout,
    timeMultiple: options.factor,
    maxDelay: options.maxTimeout,
    jitter: options.randomize ? 'full' : 'none',
    retry: (error: any, attemptNumber: number) => {
      if (options.onFailedAttempt) {
        options.onFailedAttempt(error);
      }
      
      logger.debug('Retry attempt with exponential backoff', 'RetryWithBackoff', {
        attemptNumber,
        error: error instanceof Error ? error.message : String(error),
        nextDelay: BackoffCalculator.calculateDelay(attemptNumber + 1, options)
      });
      
      return true; // Always retry up to numOfAttempts
    }
  });
}

/**
 * Global error classifier instance
 */
export const errorClassifier = new ErrorClassifier();