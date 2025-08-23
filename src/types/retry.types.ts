/**
 * Type definitions for the robust retry system
 * Supports p-retry integration with error-specific strategies
 */

/**
 * Retry strategy configuration for different error types
 */
export interface RetryOptions {
  /** Number of retry attempts */
  retries: number;
  /** Exponential backoff factor */
  factor: number;
  /** Minimum timeout between attempts (ms) */
  minTimeout: number;
  /** Maximum timeout between attempts (ms) */
  maxTimeout: number;
  /** Add randomization to prevent thundering herd */
  randomize: boolean;
  /** Function to determine if error should be retried */
  onFailedAttempt?: (error: any) => void;
}

/**
 * Error categories for retry strategy selection
 */
export enum ErrorCategory {
  NETWORK = 'network',
  RATE_LIMIT = 'rate_limit',
  SERVER_ERROR = 'server_error',
  TIMEOUT = 'timeout',
  CLIENT_ERROR = 'client_error',
  AUTHENTICATION = 'authentication',
  VALIDATION = 'validation',
  UNKNOWN = 'unknown'
}

/**
 * Error classification result
 */
export interface ErrorClassification {
  category: ErrorCategory;
  shouldRetry: boolean;
  shouldAbort: boolean;
  strategy: RetryOptions;
  reason?: string | undefined;
  httpStatus?: number | undefined;
}

/**
 * Circuit breaker states
 */
export enum CircuitState {
  CLOSED = 'closed',
  OPEN = 'open', 
  HALF_OPEN = 'half_open'
}

/**
 * Circuit breaker configuration
 */
export interface CircuitBreakerConfig {
  /** Failure threshold before opening circuit */
  failureThreshold: number;
  /** Recovery timeout when circuit is open (ms) */
  recoveryTimeout: number;
  /** Request volume threshold for statistics */
  requestVolumeThreshold: number;
  /** Rolling window duration for statistics (ms) */
  rollingWindow: number;
  /** Success threshold to close circuit from half-open */
  successThreshold: number;
}

/**
 * Circuit breaker statistics
 */
export interface CircuitBreakerStats {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  failureRate: number;
  currentState: CircuitState;
  lastFailureTime: number;
  consecutiveFailures: number;
}

/**
 * Retry operation result with metadata
 */
export interface RetryResult<T> {
  /** Operation result */
  result: T;
  /** Number of attempts made */
  attempts: number;
  /** Total time taken (ms) */
  duration: number;
  /** Last error encountered (if any) */
  lastError?: Error | undefined;
  /** Circuit breaker was triggered */
  circuitBreakerTriggered: boolean;
}

/**
 * Retry configuration for the system
 */
export interface RetryConfig {
  /** Enable/disable retry functionality */
  enabled: boolean;
  /** Global maximum attempts */
  maxAttempts: number;
  /** Global minimum delay */
  minDelay: number;
  /** Global maximum delay */
  maxDelay: number;
  /** Enable jitter */
  jitterEnabled: boolean;
  
  /** Circuit breaker configuration */
  circuitBreaker: CircuitBreakerConfig;
  
  /** Error-specific retry attempts */
  errorSpecific: {
    networkAttempts: number;
    rateLimitAttempts: number;
    serverErrorAttempts: number;
    timeoutAttempts: number;
  };
  
  /** Exponential backoff configuration */
  exponentialBackoff: {
    enabled: boolean;
    base: number;
  };
  
  /** Abort on client errors */
  abortOnClientErrors: boolean;
}

/**
 * Retry operation function type
 */
export type RetryableOperation<T> = () => Promise<T>;

/**
 * Error classifier function type
 */
export type ErrorClassifierFunction = (error: any) => ErrorClassification;

/**
 * Retry event listener types
 */
export interface RetryEventHandlers {
  onRetry?: (error: any, attempt: number) => void;
  onFailedAttempt?: (error: any, attempt: number) => void;
  onSuccess?: (result: any, attempts: number) => void;
  onAbort?: (error: any, reason: string) => void;
  onCircuitBreakerOpen?: () => void;
  onCircuitBreakerClose?: () => void;
}