/**
 * Test fixtures and scenarios for retry system testing
 */

import { RetryConfig, CircuitBreakerConfig, ErrorCategory } from '../../src/types/retry.types';

/**
 * Standard test configuration for retry system
 */
export const TEST_RETRY_CONFIG: RetryConfig = {
  enabled: true,
  maxAttempts: 3,
  minDelay: 10, // Very short for tests
  maxDelay: 100,
  jitterEnabled: false, // Disabled for predictable testing
  circuitBreaker: {
    failureThreshold: 3,
    recoveryTimeout: 500, // Short for tests
    requestVolumeThreshold: 5,
    rollingWindow: 2000,
    successThreshold: 2
  },
  errorSpecific: {
    networkAttempts: 4,
    rateLimitAttempts: 2,
    serverErrorAttempts: 1,
    timeoutAttempts: 3
  },
  exponentialBackoff: {
    enabled: true,
    base: 2
  },
  abortOnClientErrors: true
};

/**
 * Minimal circuit breaker configuration for fast tests
 */
export const FAST_CIRCUIT_BREAKER_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 2,
  recoveryTimeout: 100,
  requestVolumeThreshold: 3,
  rollingWindow: 1000,
  successThreshold: 1
};

/**
 * Disabled retry configuration
 */
export const DISABLED_RETRY_CONFIG: RetryConfig = {
  ...TEST_RETRY_CONFIG,
  enabled: false
};

/**
 * High-volume test configuration
 */
export const HIGH_VOLUME_CONFIG: RetryConfig = {
  ...TEST_RETRY_CONFIG,
  maxAttempts: 10,
  circuitBreaker: {
    ...TEST_RETRY_CONFIG.circuitBreaker,
    failureThreshold: 20,
    requestVolumeThreshold: 50
  }
};

/**
 * Mock error scenarios for testing
 */
export const ERROR_SCENARIOS = {
  // Network errors
  NETWORK_ECONNRESET: new Error('ECONNRESET: Connection reset by peer'),
  NETWORK_ENOTFOUND: new Error('ENOTFOUND: getaddrinfo ENOTFOUND example.com'),
  NETWORK_ECONNREFUSED: new Error('ECONNREFUSED: Connection refused'),
  NETWORK_EHOSTUNREACH: new Error('EHOSTUNREACH: Host unreachable'),
  NETWORK_GENERIC: new Error('Network error occurred'),

  // HTTP errors
  HTTP_429_RATE_LIMIT: { status: 429, message: 'Too Many Requests', headers: { 'retry-after': '60' } },
  HTTP_500_SERVER_ERROR: { status: 500, message: 'Internal Server Error' },
  HTTP_502_BAD_GATEWAY: { status: 502, message: 'Bad Gateway' },
  HTTP_503_SERVICE_UNAVAILABLE: { status: 503, message: 'Service Unavailable' },
  HTTP_404_NOT_FOUND: { status: 404, message: 'Not Found' },
  HTTP_400_BAD_REQUEST: { status: 400, message: 'Bad Request' },
  HTTP_401_UNAUTHORIZED: { status: 401, message: 'Unauthorized' },
  HTTP_403_FORBIDDEN: { status: 403, message: 'Forbidden' },

  // Timeout errors
  TIMEOUT_REQUEST: new Error('Request timeout of 30000ms exceeded'),
  TIMEOUT_NAVIGATION: new Error('Navigation timeout of 30000ms exceeded'),
  TIMEOUT_ETIMEDOUT: Object.assign(new Error('Socket timeout'), { code: 'ETIMEDOUT' }),

  // Authentication errors
  AUTH_INVALID_CREDENTIALS: new Error('Invalid username or password'),
  AUTH_TOKEN_EXPIRED: new Error('Authentication token has expired'),
  AUTH_SESSION_INVALID: new Error('Session is invalid or expired'),

  // Custom application errors
  BOOKING_SLOT_UNAVAILABLE: new Error('Booking slot is no longer available'),
  BOOKING_PAYMENT_FAILED: new Error('Payment processing failed'),
  BOOKING_VALIDATION_ERROR: new Error('Booking validation failed'),

  // Generic errors
  GENERIC_ERROR: new Error('Generic error message'),
  UNDEFINED_ERROR: undefined,
  NULL_ERROR: null,
  STRING_ERROR: 'String error message'
};

/**
 * Expected error classifications for test scenarios
 */
export const ERROR_CLASSIFICATIONS = {
  [ERROR_SCENARIOS.NETWORK_ECONNRESET.message]: ErrorCategory.NETWORK,
  [ERROR_SCENARIOS.NETWORK_ENOTFOUND.message]: ErrorCategory.NETWORK,
  [ERROR_SCENARIOS.HTTP_429_RATE_LIMIT.message]: ErrorCategory.RATE_LIMIT,
  [ERROR_SCENARIOS.HTTP_500_SERVER_ERROR.message]: ErrorCategory.SERVER_ERROR,
  [ERROR_SCENARIOS.HTTP_404_NOT_FOUND.message]: ErrorCategory.CLIENT_ERROR,
  [ERROR_SCENARIOS.HTTP_401_UNAUTHORIZED.message]: ErrorCategory.AUTHENTICATION,
  [ERROR_SCENARIOS.TIMEOUT_REQUEST.message]: ErrorCategory.TIMEOUT,
  [ERROR_SCENARIOS.AUTH_INVALID_CREDENTIALS.message]: ErrorCategory.AUTHENTICATION,
  [ERROR_SCENARIOS.GENERIC_ERROR.message]: ErrorCategory.UNKNOWN
};

/**
 * Test operation factories for common scenarios
 */
export const OPERATION_FACTORIES = {
  /**
   * Creates an operation that succeeds after N failures
   */
  succeedAfterFailures: (failures: number, successValue = 'success') => {
    let attemptCount = 0;
    return jest.fn().mockImplementation(async () => {
      attemptCount++;
      if (attemptCount <= failures) {
        throw new Error(`Attempt ${attemptCount} failed`);
      }
      return successValue;
    });
  },

  /**
   * Creates an operation that always fails with the specified error
   */
  alwaysFails: (error: any = new Error('Always fails')) => {
    return jest.fn().mockRejectedValue(error);
  },

  /**
   * Creates an operation that always succeeds
   */
  alwaysSucceeds: (value = 'success') => {
    return jest.fn().mockResolvedValue(value);
  },

  /**
   * Creates an operation that fails with different errors on each attempt
   */
  failsWithDifferentErrors: (errors: any[], successValue?: any) => {
    let attemptCount = 0;
    return jest.fn().mockImplementation(async () => {
      if (attemptCount < errors.length) {
        throw errors[attemptCount++];
      }
      return successValue || 'success';
    });
  },

  /**
   * Creates an operation that times out randomly
   */
  randomTimeout: (timeoutProbability = 0.3, timeoutMs = 100) => {
    return jest.fn().mockImplementation(async () => {
      if (Math.random() < timeoutProbability) {
        await new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Operation timeout')), timeoutMs)
        );
      }
      return 'success';
    });
  },

  /**
   * Creates an operation with variable execution time
   */
  variableExecutionTime: (minMs = 10, maxMs = 100, value = 'success') => {
    return jest.fn().mockImplementation(async () => {
      const delay = Math.random() * (maxMs - minMs) + minMs;
      await new Promise(resolve => setTimeout(resolve, delay));
      return value;
    });
  },

  /**
   * Creates a booking simulation operation
   */
  bookingSimulation: () => {
    let attemptCount = 0;
    return jest.fn().mockImplementation(async () => {
      attemptCount++;
      
      switch (attemptCount) {
        case 1:
          throw ERROR_SCENARIOS.HTTP_429_RATE_LIMIT; // Rate limited first
        case 2:
          throw ERROR_SCENARIOS.NETWORK_ECONNRESET; // Network issue
        case 3:
          throw ERROR_SCENARIOS.TIMEOUT_REQUEST; // Timeout
        case 4:
          return { success: true, bookingId: 'booking-123', courtId: 'court-1' };
        default:
          throw new Error('Too many attempts in simulation');
      }
    });
  }
};

/**
 * Common test scenarios with expected outcomes
 */
export const TEST_SCENARIOS = [
  {
    name: 'Network error retry with exponential backoff',
    operation: OPERATION_FACTORIES.failsWithDifferentErrors([
      ERROR_SCENARIOS.NETWORK_ECONNRESET,
      ERROR_SCENARIOS.NETWORK_ENOTFOUND
    ], 'network-recovery'),
    expectedAttempts: 3,
    expectedResult: 'network-recovery',
    shouldSucceed: true
  },
  {
    name: 'Rate limit error with longer delays',
    operation: OPERATION_FACTORIES.failsWithDifferentErrors([
      ERROR_SCENARIOS.HTTP_429_RATE_LIMIT
    ], 'rate-limit-recovery'),
    expectedAttempts: 2,
    expectedResult: 'rate-limit-recovery',
    shouldSucceed: true
  },
  {
    name: 'Client error abort immediately',
    operation: OPERATION_FACTORIES.alwaysFails(ERROR_SCENARIOS.HTTP_404_NOT_FOUND),
    expectedAttempts: 1,
    shouldSucceed: false,
    shouldAbort: true
  },
  {
    name: 'Server error with limited retries',
    operation: OPERATION_FACTORIES.alwaysFails(ERROR_SCENARIOS.HTTP_500_SERVER_ERROR),
    expectedAttempts: 2, // serverErrorAttempts + 1
    shouldSucceed: false,
    shouldAbort: false
  },
  {
    name: 'Authentication error with single retry',
    operation: OPERATION_FACTORIES.failsWithDifferentErrors([
      ERROR_SCENARIOS.HTTP_401_UNAUTHORIZED
    ], 'auth-recovery'),
    expectedAttempts: 2,
    expectedResult: 'auth-recovery',
    shouldSucceed: true
  },
  {
    name: 'Timeout error with multiple retries',
    operation: OPERATION_FACTORIES.failsWithDifferentErrors([
      ERROR_SCENARIOS.TIMEOUT_REQUEST,
      ERROR_SCENARIOS.TIMEOUT_ETIMEDOUT
    ], 'timeout-recovery'),
    expectedAttempts: 3,
    expectedResult: 'timeout-recovery',
    shouldSucceed: true
  }
];

/**
 * Circuit breaker test scenarios
 */
export const CIRCUIT_BREAKER_SCENARIOS = {
  /**
   * Scenario to open circuit breaker
   */
  openCircuit: {
    config: FAST_CIRCUIT_BREAKER_CONFIG,
    operations: Array.from({ length: 5 }, () => 
      OPERATION_FACTORIES.alwaysFails(new Error('Circuit breaker failure'))
    ),
    expectedState: 'OPEN'
  },

  /**
   * Scenario to test recovery
   */
  recovery: {
    config: FAST_CIRCUIT_BREAKER_CONFIG,
    failingOperations: Array.from({ length: 3 }, () =>
      OPERATION_FACTORIES.alwaysFails(new Error('Initial failure'))
    ),
    recoveryOperation: OPERATION_FACTORIES.alwaysSucceeds('recovered'),
    expectedRecovery: true
  }
};

/**
 * Performance test data
 */
export const PERFORMANCE_SCENARIOS = {
  /**
   * High concurrency test
   */
  highConcurrency: {
    operationCount: 100,
    concurrentLimit: 10,
    maxDurationMs: 5000,
    operationFactory: () => OPERATION_FACTORIES.variableExecutionTime(5, 50)
  },

  /**
   * Mixed success/failure scenario
   */
  mixedOutcomes: {
    operationCount: 50,
    failureRate: 0.3, // 30% of operations fail initially
    maxDurationMs: 10000,
    operationFactory: (shouldFail: boolean) => shouldFail
      ? OPERATION_FACTORIES.succeedAfterFailures(1, 'recovered')
      : OPERATION_FACTORIES.alwaysSucceeds('success')
  },

  /**
   * Load testing scenario
   */
  loadTest: {
    operationCount: 500,
    batchSize: 25,
    maxDurationMs: 30000,
    operationFactory: () => OPERATION_FACTORIES.randomTimeout(0.1, 10) // 10% timeout rate
  }
};

/**
 * Mock configuration for testing
 */
export const MOCK_ENV_CONFIG = {
  RETRY_ENABLED: 'true',
  RETRY_MAX_ATTEMPTS: '5',
  RETRY_MIN_DELAY: '100',
  RETRY_MAX_DELAY: '5000',
  RETRY_JITTER_ENABLED: 'false',
  CIRCUIT_BREAKER_FAILURE_THRESHOLD: '3',
  CIRCUIT_BREAKER_RECOVERY_TIMEOUT: '2000',
  CIRCUIT_BREAKER_REQUEST_VOLUME_THRESHOLD: '10',
  RETRY_NETWORK_ATTEMPTS: '4',
  RETRY_RATE_LIMIT_ATTEMPTS: '2',
  RETRY_SERVER_ERROR_ATTEMPTS: '1',
  RETRY_TIMEOUT_ATTEMPTS: '3',
  RETRY_EXPONENTIAL_BACKOFF: 'true',
  RETRY_ABORT_ON_CLIENT_ERRORS: 'true'
};

/**
 * Utility functions for test setup
 */
export const TEST_UTILS = {
  /**
   * Set up mock environment variables
   */
  setupMockEnv: (config = MOCK_ENV_CONFIG) => {
    Object.entries(config).forEach(([key, value]) => {
      process.env[key] = value;
    });
  },

  /**
   * Clean up mock environment variables
   */
  cleanupMockEnv: (config = MOCK_ENV_CONFIG) => {
    Object.keys(config).forEach(key => {
      delete process.env[key];
    });
  },

  /**
   * Create a mock timer for testing delays
   */
  createMockTimer: () => {
    jest.useFakeTimers();
    return {
      advance: (ms: number) => jest.advanceTimersByTime(ms),
      advanceToNext: () => jest.advanceTimersToNextTimer(),
      restore: () => jest.useRealTimers()
    };
  },

  /**
   * Wait for all pending promises (useful for async operations)
   */
  flushPromises: () => new Promise(resolve => setImmediate(resolve)),

  /**
   * Create a delay function for testing
   */
  delay: (ms: number) => new Promise(resolve => setTimeout(resolve, ms)),

  /**
   * Measure execution time
   */
  measureTime: async (fn: () => Promise<any>) => {
    const start = Date.now();
    const result = await fn();
    const duration = Date.now() - start;
    return { result, duration };
  }
};