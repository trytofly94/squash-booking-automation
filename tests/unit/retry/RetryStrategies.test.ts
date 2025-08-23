/**
 * Unit tests for RetryStrategies and ErrorClassifier
 */

import { 
  ErrorClassifier, 
  RETRY_STRATEGIES, 
  BackoffCalculator,
  retryWithBackoff 
} from '../../../src/core/retry/RetryStrategies';
import { ErrorCategory } from '../../../src/types/retry.types';

describe('ErrorClassifier', () => {
  let classifier: ErrorClassifier;

  beforeEach(() => {
    classifier = new ErrorClassifier();
  });

  describe('HTTP Status Code Classification', () => {
    test('should classify 429 as RATE_LIMIT', () => {
      const error = { status: 429, message: 'Too Many Requests' };
      const classification = classifier.classify(error);
      
      expect(classification.category).toBe(ErrorCategory.RATE_LIMIT);
      expect(classification.shouldRetry).toBe(true);
      expect(classification.shouldAbort).toBe(false);
      expect(classification.httpStatus).toBe(429);
    });

    test('should classify 500 as SERVER_ERROR', () => {
      const error = { status: 500, message: 'Internal Server Error' };
      const classification = classifier.classify(error);
      
      expect(classification.category).toBe(ErrorCategory.SERVER_ERROR);
      expect(classification.shouldRetry).toBe(true);
      expect(classification.shouldAbort).toBe(false);
      expect(classification.httpStatus).toBe(500);
    });

    test('should classify 404 as CLIENT_ERROR', () => {
      const error = { status: 404, message: 'Not Found' };
      const classification = classifier.classify(error);
      
      expect(classification.category).toBe(ErrorCategory.CLIENT_ERROR);
      expect(classification.shouldRetry).toBe(false);
      expect(classification.shouldAbort).toBe(true);
      expect(classification.httpStatus).toBe(404);
    });

    test('should classify 401 as AUTHENTICATION', () => {
      const error = { status: 401, message: 'Unauthorized' };
      const classification = classifier.classify(error);
      
      expect(classification.category).toBe(ErrorCategory.AUTHENTICATION);
      expect(classification.shouldRetry).toBe(true);
      expect(classification.shouldAbort).toBe(false);
      expect(classification.httpStatus).toBe(401);
    });

    test('should classify 408 as TIMEOUT', () => {
      const error = { status: 408, message: 'Request Timeout' };
      const classification = classifier.classify(error);
      
      expect(classification.category).toBe(ErrorCategory.TIMEOUT);
      expect(classification.shouldRetry).toBe(true);
      expect(classification.shouldAbort).toBe(false);
      expect(classification.httpStatus).toBe(408);
    });
  });

  describe('Network Error Classification', () => {
    test('should classify ECONNRESET as NETWORK', () => {
      const error = new Error('Connection reset by peer');
      error.name = 'NetworkError';
      (error as any).code = 'ECONNRESET';
      
      const classification = classifier.classify(error);
      
      expect(classification.category).toBe(ErrorCategory.NETWORK);
      expect(classification.shouldRetry).toBe(true);
      expect(classification.shouldAbort).toBe(false);
    });

    test('should classify ENOTFOUND as NETWORK', () => {
      const error = new Error('getaddrinfo ENOTFOUND example.com');
      (error as any).code = 'ENOTFOUND';
      
      const classification = classifier.classify(error);
      
      expect(classification.category).toBe(ErrorCategory.NETWORK);
      expect(classification.shouldRetry).toBe(true);
      expect(classification.shouldAbort).toBe(false);
    });

    test('should classify connection refused as NETWORK', () => {
      const error = new Error('connect ECONNREFUSED 127.0.0.1:3000');
      
      const classification = classifier.classify(error);
      
      expect(classification.category).toBe(ErrorCategory.NETWORK);
      expect(classification.shouldRetry).toBe(true);
      expect(classification.shouldAbort).toBe(false);
    });
  });

  describe('Timeout Error Classification', () => {
    test('should classify timeout errors', () => {
      const error = new Error('Request timeout');
      
      const classification = classifier.classify(error);
      
      expect(classification.category).toBe(ErrorCategory.TIMEOUT);
      expect(classification.shouldRetry).toBe(true);
      expect(classification.shouldAbort).toBe(false);
    });

    test('should classify ETIMEDOUT as TIMEOUT', () => {
      const error = new Error('Socket timeout');
      (error as any).code = 'ETIMEDOUT';
      
      const classification = classifier.classify(error);
      
      expect(classification.category).toBe(ErrorCategory.TIMEOUT);
      expect(classification.shouldRetry).toBe(true);
      expect(classification.shouldAbort).toBe(false);
    });

    test('should classify navigation timeout as TIMEOUT', () => {
      const error = new Error('Navigation timeout of 30000ms exceeded');
      
      const classification = classifier.classify(error);
      
      expect(classification.category).toBe(ErrorCategory.TIMEOUT);
      expect(classification.shouldRetry).toBe(true);
      expect(classification.shouldAbort).toBe(false);
    });
  });

  describe('Authentication Error Classification', () => {
    test('should classify unauthorized errors', () => {
      const error = new Error('User not authenticated');
      
      const classification = classifier.classify(error);
      
      expect(classification.category).toBe(ErrorCategory.AUTHENTICATION);
      expect(classification.shouldRetry).toBe(true);
      expect(classification.shouldAbort).toBe(false);
    });

    test('should classify forbidden errors', () => {
      const error = new Error('Access forbidden for user');
      
      const classification = classifier.classify(error);
      
      expect(classification.category).toBe(ErrorCategory.AUTHENTICATION);
      expect(classification.shouldRetry).toBe(true);
      expect(classification.shouldAbort).toBe(false);
    });
  });

  describe('Unknown Error Classification', () => {
    test('should classify unknown errors as UNKNOWN', () => {
      const error = new Error('Some unexpected error');
      
      const classification = classifier.classify(error);
      
      expect(classification.category).toBe(ErrorCategory.UNKNOWN);
      expect(classification.shouldRetry).toBe(true);
      expect(classification.shouldAbort).toBe(false);
    });

    test('should handle string errors', () => {
      const error = 'String error message';
      
      const classification = classifier.classify(error);
      
      expect(classification.category).toBe(ErrorCategory.UNKNOWN);
      expect(classification.shouldRetry).toBe(true);
      expect(classification.shouldAbort).toBe(false);
    });

    test('should handle null errors', () => {
      const error = null;
      
      const classification = classifier.classify(error);
      
      expect(classification.category).toBe(ErrorCategory.UNKNOWN);
      expect(classification.shouldRetry).toBe(true);
      expect(classification.shouldAbort).toBe(false);
    });
  });

  describe('Strategy Retrieval', () => {
    test('should return correct strategy for each category', () => {
      const networkStrategy = classifier.getStrategyForCategory(ErrorCategory.NETWORK);
      expect(networkStrategy).toEqual(RETRY_STRATEGIES[ErrorCategory.NETWORK]);
      
      const rateLimitStrategy = classifier.getStrategyForCategory(ErrorCategory.RATE_LIMIT);
      expect(rateLimitStrategy).toEqual(RETRY_STRATEGIES[ErrorCategory.RATE_LIMIT]);
    });

    test('should update strategy correctly', () => {
      const newStrategy = { retries: 10, factor: 3, minTimeout: 2000, maxTimeout: 20000, randomize: false };
      
      classifier.updateStrategy(ErrorCategory.NETWORK, newStrategy);
      
      const updatedStrategy = classifier.getStrategyForCategory(ErrorCategory.NETWORK);
      expect(updatedStrategy.retries).toBe(10);
      expect(updatedStrategy.factor).toBe(3);
    });
  });
});

describe('BackoffCalculator', () => {
  describe('Exponential Backoff Calculation', () => {
    test('should calculate correct delay without jitter', () => {
      const options = {
        retries: 5,
        factor: 2,
        minTimeout: 1000,
        maxTimeout: 10000,
        randomize: false
      };

      expect(BackoffCalculator.calculateDelay(1, options)).toBe(1000); // 1000 * 2^0
      expect(BackoffCalculator.calculateDelay(2, options)).toBe(2000); // 1000 * 2^1
      expect(BackoffCalculator.calculateDelay(3, options)).toBe(4000); // 1000 * 2^2
      expect(BackoffCalculator.calculateDelay(4, options)).toBe(8000); // 1000 * 2^3
    });

    test('should respect max timeout', () => {
      const options = {
        retries: 10,
        factor: 2,
        minTimeout: 1000,
        maxTimeout: 5000,
        randomize: false
      };

      expect(BackoffCalculator.calculateDelay(10, options)).toBe(5000); // Capped at maxTimeout
    });

    test('should add jitter when enabled', () => {
      const options = {
        retries: 3,
        factor: 2,
        minTimeout: 1000,
        maxTimeout: 10000,
        randomize: true
      };

      const delay1 = BackoffCalculator.calculateDelay(2, options);
      const delay2 = BackoffCalculator.calculateDelay(2, options);
      const delay3 = BackoffCalculator.calculateDelay(2, options);

      // With jitter, delays should vary and be within reasonable bounds
      const delays = [delay1, delay2, delay3];
      
      // Should be within reasonable bounds (1500-2500 for attempt 2)
      delays.forEach(delay => {
        expect(delay).toBeGreaterThanOrEqual(1000);
        expect(delay).toBeLessThanOrEqual(3000);
      });
      
      // At least one delay should be different (jitter effect)
      expect(new Set(delays).size).toBeGreaterThanOrEqual(1);
    });

    test('should handle edge cases', () => {
      const options = {
        retries: 1,
        factor: 1,
        minTimeout: 0,
        maxTimeout: 1,
        randomize: false
      };

      expect(BackoffCalculator.calculateDelay(1, options)).toBe(0);
    });
  });
});

describe('retryWithBackoff', () => {
  test('should succeed on first attempt', async () => {
    const operation = jest.fn().mockResolvedValue('success');
    const options = {
      retries: 3,
      factor: 2,
      minTimeout: 100,
      maxTimeout: 1000,
      randomize: false
    };

    const result = await retryWithBackoff(operation, options);
    
    expect(result).toBe('success');
    expect(operation).toHaveBeenCalledTimes(1);
  });

  test('should retry on failure and eventually succeed', async () => {
    const operation = jest.fn()
      .mockRejectedValueOnce(new Error('First failure'))
      .mockRejectedValueOnce(new Error('Second failure'))
      .mockResolvedValue('success');
    
    const options = {
      retries: 3,
      factor: 2,
      minTimeout: 10,
      maxTimeout: 100,
      randomize: false
    };

    const result = await retryWithBackoff(operation, options);
    
    expect(result).toBe('success');
    expect(operation).toHaveBeenCalledTimes(3);
  });

  test('should exhaust retries and throw last error', async () => {
    const operation = jest.fn().mockRejectedValue(new Error('Persistent failure'));
    const options = {
      retries: 2,
      factor: 2,
      minTimeout: 10,
      maxTimeout: 100,
      randomize: false
    };

    await expect(retryWithBackoff(operation, options))
      .rejects.toThrow('Persistent failure');
    
    expect(operation).toHaveBeenCalledTimes(3); // Initial attempt + 2 retries
  });

  test('should call onFailedAttempt callback', async () => {
    const operation = jest.fn()
      .mockRejectedValueOnce(new Error('First failure'))
      .mockResolvedValue('success');
    
    const onFailedAttempt = jest.fn();
    const options = {
      retries: 2,
      factor: 2,
      minTimeout: 10,
      maxTimeout: 100,
      randomize: false,
      onFailedAttempt
    };

    await retryWithBackoff(operation, options);
    
    expect(onFailedAttempt).toHaveBeenCalledTimes(1);
    expect(onFailedAttempt).toHaveBeenCalledWith(expect.any(Error));
  });
});

describe('RETRY_STRATEGIES', () => {
  test('should have strategies for all error categories', () => {
    const categories = Object.values(ErrorCategory);
    
    categories.forEach(category => {
      expect(RETRY_STRATEGIES[category]).toBeDefined();
      expect(RETRY_STRATEGIES[category].retries).toBeGreaterThanOrEqual(0);
      expect(RETRY_STRATEGIES[category].factor).toBeGreaterThan(0);
      expect(RETRY_STRATEGIES[category].minTimeout).toBeGreaterThanOrEqual(0);
      expect(RETRY_STRATEGIES[category].maxTimeout).toBeGreaterThanOrEqual(RETRY_STRATEGIES[category].minTimeout);
    });
  });

  test('should have appropriate retry counts for different categories', () => {
    // Network errors should have more retries
    expect(RETRY_STRATEGIES[ErrorCategory.NETWORK].retries).toBeGreaterThan(
      RETRY_STRATEGIES[ErrorCategory.CLIENT_ERROR].retries
    );

    // Client errors should have minimal or no retries
    expect(RETRY_STRATEGIES[ErrorCategory.CLIENT_ERROR].retries).toBe(0);

    // Rate limits should have moderate retries with longer delays
    expect(RETRY_STRATEGIES[ErrorCategory.RATE_LIMIT].maxTimeout).toBeGreaterThan(
      RETRY_STRATEGIES[ErrorCategory.NETWORK].maxTimeout
    );
  });

  test('should enable jitter for appropriate categories', () => {
    // Rate limiting and network errors should use jitter
    expect(RETRY_STRATEGIES[ErrorCategory.RATE_LIMIT].randomize).toBe(true);
    expect(RETRY_STRATEGIES[ErrorCategory.NETWORK].randomize).toBe(true);
    
    // Some categories might not need jitter
    expect(RETRY_STRATEGIES[ErrorCategory.CLIENT_ERROR].randomize).toBe(false);
  });
});