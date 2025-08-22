/**
 * Configuration interfaces for the robust retry mechanism system
 * Provides comprehensive settings for exponential backoff, circuit breaker,
 * and error-specific retry strategies
 */

/**
 * Error types that can be retried with different strategies
 */
export enum RetryableErrorType {
  NETWORK_ERROR = 'NETWORK_ERROR',
  TIMEOUT_ERROR = 'TIMEOUT_ERROR',  
  RATE_LIMIT_ERROR = 'RATE_LIMIT_ERROR',
  SERVER_ERROR = 'SERVER_ERROR',
  AUTHENTICATION_ERROR = 'AUTHENTICATION_ERROR',
  NAVIGATION_ERROR = 'NAVIGATION_ERROR',
  BOOKING_ERROR = 'BOOKING_ERROR',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR'
}

/**
 * Circuit breaker states
 */
export enum CircuitBreakerState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN', 
  HALF_OPEN = 'HALF_OPEN'
}

/**
 * Error-specific retry strategy configuration
 */
export interface ErrorRetryStrategy {
  /** Whether to retry this error type */
  enabled: boolean;
  /** Maximum number of retry attempts */
  maxAttempts: number;
  /** Initial delay in milliseconds */
  initialDelay: number;
  /** Maximum delay in milliseconds */
  maxDelay: number;
  /** Backoff multiplier for exponential backoff */
  backoffMultiplier: number;
  /** Maximum jitter as percentage (0-1) */
  maxJitter: number;
  /** Whether to use circuit breaker for this error type */
  useCircuitBreaker: boolean;
}

/**
 * Circuit breaker configuration
 */
export interface CircuitBreakerConfig {
  /** Enable/disable circuit breaker */
  enabled: boolean;
  /** Number of failures before opening circuit */
  failureThreshold: number;
  /** Time in milliseconds to keep circuit open */
  openTimeoutMs: number;
  /** Number of successful requests to close circuit from half-open */
  successThreshold: number;
  /** Time in milliseconds for half-open state timeout */
  halfOpenTimeoutMs: number;
  /** Whether to reset failure count on success */
  resetOnSuccess: boolean;
}

/**
 * Overall retry configuration combining all strategies
 */
export interface RetryConfig {
  /** Global retry settings */
  global: {
    /** Whether retry system is enabled */
    enabled: boolean;
    /** Default maximum attempts for any operation */
    defaultMaxAttempts: number;
    /** Default initial delay in milliseconds */
    defaultInitialDelay: number;
    /** Default maximum delay in milliseconds */
    defaultMaxDelay: number;
    /** Default backoff multiplier */
    defaultBackoffMultiplier: number;
    /** Default maximum jitter */
    defaultMaxJitter: number;
    /** Whether to enable detailed retry logging */
    enableDetailedLogging: boolean;
  };

  /** Circuit breaker settings */
  circuitBreaker: CircuitBreakerConfig;

  /** Error-specific retry strategies */
  errorStrategies: Record<RetryableErrorType, ErrorRetryStrategy>;

  /** Operation-specific overrides */
  operationOverrides: {
    /** Retry settings for page navigation */
    navigation: Partial<ErrorRetryStrategy>;
    /** Retry settings for slot searches */
    slotSearch: Partial<ErrorRetryStrategy>;
    /** Retry settings for booking execution */
    bookingExecution: Partial<ErrorRetryStrategy>;
    /** Retry settings for checkout process */
    checkout: Partial<ErrorRetryStrategy>;
  };
}

/**
 * Retry attempt information for logging and monitoring
 */
export interface RetryAttemptInfo {
  /** Current attempt number (1-based) */
  attemptNumber: number;
  /** Total maximum attempts allowed */
  maxAttempts: number;
  /** Error that triggered the retry */
  error: Error;
  /** Classified error type */
  errorType: RetryableErrorType;
  /** Delay before this attempt in milliseconds */
  delayMs: number;
  /** Total elapsed time since first attempt */
  elapsedMs: number;
  /** Strategy used for this retry */
  strategy: ErrorRetryStrategy;
  /** Operation being retried */
  operation: string;
  /** Circuit breaker state during this attempt */
  circuitBreakerState: CircuitBreakerState;
}

/**
 * Result of a retry operation
 */
export interface RetryResult<T> {
  /** Whether the operation succeeded */
  success: boolean;
  /** Result data if successful */
  result?: T;
  /** Final error if all retries failed */
  error?: Error;
  /** Total number of attempts made */
  totalAttempts: number;
  /** Total time spent retrying */
  totalTimeMs: number;
  /** Retry attempts information */
  attempts: RetryAttemptInfo[];
  /** Whether circuit breaker tripped */
  circuitBreakerTripped: boolean;
}

/**
 * Default retry configuration factory
 */
export class RetryConfigFactory {
  /**
   * Create default retry configuration from environment variables
   */
  static createFromEnvironment(): RetryConfig {
    return {
      global: {
        enabled: process.env['RETRY_ENABLED'] !== 'false',
        defaultMaxAttempts: parseInt(process.env['RETRY_MAX_ATTEMPTS'] || '5'),
        defaultInitialDelay: parseInt(process.env['RETRY_INITIAL_DELAY'] || '1000'),
        defaultMaxDelay: parseInt(process.env['RETRY_MAX_DELAY'] || '30000'),
        defaultBackoffMultiplier: parseFloat(process.env['RETRY_BACKOFF_MULTIPLIER'] || '2'),
        defaultMaxJitter: parseFloat(process.env['RETRY_MAX_JITTER'] || '0.1'),
        enableDetailedLogging: process.env['RETRY_DETAILED_LOGGING'] === 'true'
      },

      circuitBreaker: {
        enabled: process.env['CIRCUIT_BREAKER_ENABLED'] !== 'false',
        failureThreshold: parseInt(process.env['CIRCUIT_BREAKER_THRESHOLD'] || '5'),
        openTimeoutMs: parseInt(process.env['CIRCUIT_BREAKER_TIMEOUT'] || '300000'),
        successThreshold: parseInt(process.env['CIRCUIT_BREAKER_SUCCESS_THRESHOLD'] || '3'),
        halfOpenTimeoutMs: parseInt(process.env['CIRCUIT_BREAKER_HALF_OPEN_TIMEOUT'] || '60000'),
        resetOnSuccess: process.env['CIRCUIT_BREAKER_RESET_ON_SUCCESS'] !== 'false'
      },

      errorStrategies: {
        [RetryableErrorType.NETWORK_ERROR]: {
          enabled: process.env['RETRY_ON_NETWORK_ERROR'] !== 'false',
          maxAttempts: parseInt(process.env['RETRY_NETWORK_MAX_ATTEMPTS'] || '5'),
          initialDelay: parseInt(process.env['RETRY_NETWORK_INITIAL_DELAY'] || '1000'),
          maxDelay: parseInt(process.env['RETRY_NETWORK_MAX_DELAY'] || '16000'),
          backoffMultiplier: parseFloat(process.env['RETRY_NETWORK_BACKOFF_MULTIPLIER'] || '2'),
          maxJitter: parseFloat(process.env['RETRY_NETWORK_MAX_JITTER'] || '0.1'),
          useCircuitBreaker: process.env['RETRY_NETWORK_USE_CIRCUIT_BREAKER'] === 'true'
        },

        [RetryableErrorType.TIMEOUT_ERROR]: {
          enabled: process.env['RETRY_ON_TIMEOUT'] !== 'false',
          maxAttempts: parseInt(process.env['RETRY_TIMEOUT_MAX_ATTEMPTS'] || '3'),
          initialDelay: parseInt(process.env['RETRY_TIMEOUT_INITIAL_DELAY'] || '2000'),
          maxDelay: parseInt(process.env['RETRY_TIMEOUT_MAX_DELAY'] || '10000'),
          backoffMultiplier: parseFloat(process.env['RETRY_TIMEOUT_BACKOFF_MULTIPLIER'] || '2.5'),
          maxJitter: parseFloat(process.env['RETRY_TIMEOUT_MAX_JITTER'] || '0.15'),
          useCircuitBreaker: process.env['RETRY_TIMEOUT_USE_CIRCUIT_BREAKER'] === 'true'
        },

        [RetryableErrorType.RATE_LIMIT_ERROR]: {
          enabled: process.env['RETRY_ON_RATE_LIMIT'] !== 'false',
          maxAttempts: parseInt(process.env['RETRY_RATE_LIMIT_MAX_ATTEMPTS'] || '3'),
          initialDelay: parseInt(process.env['RETRY_RATE_LIMIT_INITIAL_DELAY'] || '5000'),
          maxDelay: parseInt(process.env['RETRY_RATE_LIMIT_MAX_DELAY'] || '45000'),
          backoffMultiplier: parseFloat(process.env['RETRY_RATE_LIMIT_BACKOFF_MULTIPLIER'] || '3'),
          maxJitter: parseFloat(process.env['RETRY_RATE_LIMIT_MAX_JITTER'] || '0.2'),
          useCircuitBreaker: process.env['RETRY_RATE_LIMIT_USE_CIRCUIT_BREAKER'] === 'true'
        },

        [RetryableErrorType.SERVER_ERROR]: {
          enabled: process.env['RETRY_ON_SERVER_ERROR'] !== 'false',
          maxAttempts: parseInt(process.env['RETRY_SERVER_MAX_ATTEMPTS'] || '3'),
          initialDelay: parseInt(process.env['RETRY_SERVER_INITIAL_DELAY'] || '3000'),
          maxDelay: parseInt(process.env['RETRY_SERVER_MAX_DELAY'] || '27000'),
          backoffMultiplier: parseFloat(process.env['RETRY_SERVER_BACKOFF_MULTIPLIER'] || '3'),
          maxJitter: parseFloat(process.env['RETRY_SERVER_MAX_JITTER'] || '0.1'),
          useCircuitBreaker: process.env['RETRY_SERVER_USE_CIRCUIT_BREAKER'] !== 'false'
        },

        [RetryableErrorType.AUTHENTICATION_ERROR]: {
          enabled: process.env['RETRY_ON_AUTH_ERROR'] !== 'false',
          maxAttempts: parseInt(process.env['RETRY_AUTH_MAX_ATTEMPTS'] || '2'),
          initialDelay: parseInt(process.env['RETRY_AUTH_INITIAL_DELAY'] || '2000'),
          maxDelay: parseInt(process.env['RETRY_AUTH_MAX_DELAY'] || '5000'),
          backoffMultiplier: parseFloat(process.env['RETRY_AUTH_BACKOFF_MULTIPLIER'] || '2.5'),
          maxJitter: parseFloat(process.env['RETRY_AUTH_MAX_JITTER'] || '0.05'),
          useCircuitBreaker: process.env['RETRY_AUTH_USE_CIRCUIT_BREAKER'] === 'true'
        },

        [RetryableErrorType.NAVIGATION_ERROR]: {
          enabled: process.env['RETRY_ON_NAVIGATION_ERROR'] !== 'false',
          maxAttempts: parseInt(process.env['RETRY_NAVIGATION_MAX_ATTEMPTS'] || '3'),
          initialDelay: parseInt(process.env['RETRY_NAVIGATION_INITIAL_DELAY'] || '2000'),
          maxDelay: parseInt(process.env['RETRY_NAVIGATION_MAX_DELAY'] || '8000'),
          backoffMultiplier: parseFloat(process.env['RETRY_NAVIGATION_BACKOFF_MULTIPLIER'] || '2'),
          maxJitter: parseFloat(process.env['RETRY_NAVIGATION_MAX_JITTER'] || '0.1'),
          useCircuitBreaker: process.env['RETRY_NAVIGATION_USE_CIRCUIT_BREAKER'] === 'true'
        },

        [RetryableErrorType.BOOKING_ERROR]: {
          enabled: process.env['RETRY_ON_BOOKING_ERROR'] !== 'false',
          maxAttempts: parseInt(process.env['RETRY_BOOKING_MAX_ATTEMPTS'] || '2'),
          initialDelay: parseInt(process.env['RETRY_BOOKING_INITIAL_DELAY'] || '3000'),
          maxDelay: parseInt(process.env['RETRY_BOOKING_MAX_DELAY'] || '12000'),
          backoffMultiplier: parseFloat(process.env['RETRY_BOOKING_BACKOFF_MULTIPLIER'] || '2'),
          maxJitter: parseFloat(process.env['RETRY_BOOKING_MAX_JITTER'] || '0.1'),
          useCircuitBreaker: process.env['RETRY_BOOKING_USE_CIRCUIT_BREAKER'] === 'true'
        },

        [RetryableErrorType.UNKNOWN_ERROR]: {
          enabled: process.env['RETRY_ON_UNKNOWN_ERROR'] !== 'false',
          maxAttempts: parseInt(process.env['RETRY_UNKNOWN_MAX_ATTEMPTS'] || '2'),
          initialDelay: parseInt(process.env['RETRY_UNKNOWN_INITIAL_DELAY'] || '2000'),
          maxDelay: parseInt(process.env['RETRY_UNKNOWN_MAX_DELAY'] || '8000'),
          backoffMultiplier: parseFloat(process.env['RETRY_UNKNOWN_BACKOFF_MULTIPLIER'] || '2'),
          maxJitter: parseFloat(process.env['RETRY_UNKNOWN_MAX_JITTER'] || '0.1'),
          useCircuitBreaker: process.env['RETRY_UNKNOWN_USE_CIRCUIT_BREAKER'] === 'true'
        }
      },

      operationOverrides: {
        navigation: {
          maxAttempts: parseInt(process.env['RETRY_NAVIGATION_OPERATION_MAX_ATTEMPTS'] || '4')
        },
        slotSearch: {
          maxAttempts: parseInt(process.env['RETRY_SLOT_SEARCH_MAX_ATTEMPTS'] || '3'),
          initialDelay: parseInt(process.env['RETRY_SLOT_SEARCH_INITIAL_DELAY'] || '1500')
        },
        bookingExecution: {
          maxAttempts: parseInt(process.env['RETRY_BOOKING_EXECUTION_MAX_ATTEMPTS'] || '2'),
          initialDelay: parseInt(process.env['RETRY_BOOKING_EXECUTION_INITIAL_DELAY'] || '2000')
        },
        checkout: {
          maxAttempts: parseInt(process.env['RETRY_CHECKOUT_MAX_ATTEMPTS'] || '2'),
          initialDelay: parseInt(process.env['RETRY_CHECKOUT_INITIAL_DELAY'] || '3000')
        }
      }
    };
  }

  /**
   * Create a minimal retry configuration for testing
   */
  static createForTesting(): RetryConfig {
    const config = this.createFromEnvironment();
    
    // Reduce delays and attempts for faster testing
    config.global.defaultMaxAttempts = 2;
    config.global.defaultInitialDelay = 100;
    config.global.defaultMaxDelay = 1000;
    
    // Reduce all error strategy attempts and delays
    Object.values(config.errorStrategies).forEach(strategy => {
      strategy.maxAttempts = Math.min(strategy.maxAttempts, 2);
      strategy.initialDelay = Math.min(strategy.initialDelay, 100);
      strategy.maxDelay = Math.min(strategy.maxDelay, 500);
    });
    
    // Reduce circuit breaker thresholds
    config.circuitBreaker.failureThreshold = 2;
    config.circuitBreaker.openTimeoutMs = 1000;
    config.circuitBreaker.halfOpenTimeoutMs = 500;
    
    return config;
  }

  /**
   * Validate retry configuration
   */
  static validate(config: RetryConfig): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Validate global config
    if (config.global.defaultMaxAttempts < 1) {
      errors.push('defaultMaxAttempts must be at least 1');
    }
    if (config.global.defaultInitialDelay < 0) {
      errors.push('defaultInitialDelay must be non-negative');
    }
    if (config.global.defaultMaxDelay < config.global.defaultInitialDelay) {
      errors.push('defaultMaxDelay must be >= defaultInitialDelay');
    }
    if (config.global.defaultBackoffMultiplier < 1) {
      errors.push('defaultBackoffMultiplier must be >= 1');
    }
    if (config.global.defaultMaxJitter < 0 || config.global.defaultMaxJitter > 1) {
      errors.push('defaultMaxJitter must be between 0 and 1');
    }

    // Validate circuit breaker config
    if (config.circuitBreaker.failureThreshold < 1) {
      errors.push('circuitBreaker.failureThreshold must be at least 1');
    }
    if (config.circuitBreaker.openTimeoutMs < 0) {
      errors.push('circuitBreaker.openTimeoutMs must be non-negative');
    }
    if (config.circuitBreaker.successThreshold < 1) {
      errors.push('circuitBreaker.successThreshold must be at least 1');
    }

    // Validate error strategies
    Object.entries(config.errorStrategies).forEach(([errorType, strategy]) => {
      if (strategy.maxAttempts < 1) {
        errors.push(`${errorType}.maxAttempts must be at least 1`);
      }
      if (strategy.initialDelay < 0) {
        errors.push(`${errorType}.initialDelay must be non-negative`);
      }
      if (strategy.maxDelay < strategy.initialDelay) {
        errors.push(`${errorType}.maxDelay must be >= initialDelay`);
      }
      if (strategy.backoffMultiplier < 1) {
        errors.push(`${errorType}.backoffMultiplier must be >= 1`);
      }
      if (strategy.maxJitter < 0 || strategy.maxJitter > 1) {
        errors.push(`${errorType}.maxJitter must be between 0 and 1`);
      }
    });

    return {
      isValid: errors.length === 0,
      errors
    };
  }
}