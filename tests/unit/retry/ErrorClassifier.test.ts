/**
 * Unit tests for ErrorClassifier
 * Tests error classification, pattern matching, and retry decisions
 */

import { ErrorClassifier } from '@/core/retry/ErrorClassifier';
import { RetryableErrorType } from '@/core/retry/RetryConfig';

describe('ErrorClassifier', () => {
  describe('classifyError', () => {
    test('should classify network errors correctly', () => {
      const testCases = [
        'net::ERR_CONNECTION_REFUSED',
        'ECONNREFUSED',
        'ENOTFOUND',
        'failed to fetch',
        'network error occurred'
      ];

      testCases.forEach(error => {
        const classification = ErrorClassifier.classifyError(new Error(error));
        expect(classification.errorType).toBe(RetryableErrorType.NETWORK_ERROR);
        expect(classification.shouldRetry).toBe(true);
        expect(classification.confidence).toBeGreaterThan(0.8);
      });
    });

    test('should classify timeout errors correctly', () => {
      const testCases = [
        'timeout exceeded',
        'request timed out',
        'page timeout occurred',
        'waiting for page to load failed'
      ];

      testCases.forEach(error => {
        const classification = ErrorClassifier.classifyError(new Error(error));
        expect(classification.errorType).toBe(RetryableErrorType.TIMEOUT_ERROR);
        expect(classification.shouldRetry).toBe(true);
        expect(classification.confidence).toBeGreaterThan(0.8);
      });
    });

    test('should classify rate limiting errors correctly', () => {
      const testCases = [
        '429 Too Many Requests',
        'rate limit exceeded',
        'throttled request',
        'quota exceeded'
      ];

      testCases.forEach(error => {
        const classification = ErrorClassifier.classifyError(new Error(error));
        expect(classification.errorType).toBe(RetryableErrorType.RATE_LIMIT_ERROR);
        expect(classification.shouldRetry).toBe(true);
        expect(classification.confidence).toBeGreaterThan(0.8);
      });
    });

    test('should classify server errors correctly', () => {
      const testCases = [
        '500 Internal Server Error',
        '502 Bad Gateway',
        '503 Service Unavailable',
        'server unavailable'
      ];

      testCases.forEach(error => {
        const classification = ErrorClassifier.classifyError(new Error(error));
        expect(classification.errorType).toBe(RetryableErrorType.SERVER_ERROR);
        expect(classification.shouldRetry).toBe(true);
        expect(classification.confidence).toBeGreaterThan(0.8);
      });
    });

    test('should classify authentication errors correctly', () => {
      const testCases = [
        '401 Unauthorized',
        'authentication failed',
        'session expired',
        'invalid credentials'
      ];

      testCases.forEach(error => {
        const classification = ErrorClassifier.classifyError(new Error(error));
        expect(classification.errorType).toBe(RetryableErrorType.AUTHENTICATION_ERROR);
        expect(classification.reason).toContain('Authentication');
      });
    });

    test('should classify navigation errors correctly', () => {
      const testCases = [
        'navigation failed',
        '404 Not Found',
        'element not found',
        'selector not found'
      ];

      testCases.forEach(error => {
        const classification = ErrorClassifier.classifyError(new Error(error));
        expect(classification.errorType).toBe(RetryableErrorType.NAVIGATION_ERROR);
        expect(classification.shouldRetry).toBe(true);
      });
    });

    test('should classify booking errors correctly', () => {
      const testCases = [
        'booking failed',
        'slot not available',
        'court not available',
        'reservation failed'
      ];

      testCases.forEach(error => {
        const classification = ErrorClassifier.classifyError(new Error(error));
        expect(classification.errorType).toBe(RetryableErrorType.BOOKING_ERROR);
        expect(classification.shouldRetry).toBe(true);
      });
    });

    test('should handle non-retryable errors', () => {
      const nonRetryableErrors = [
        '403 Forbidden',
        '400 Bad Request',
        'payment failed'
      ];

      nonRetryableErrors.forEach(error => {
        const classification = ErrorClassifier.classifyError(new Error(error));
        expect(classification.shouldRetry).toBe(false);
      });
    });

    test('should classify unknown errors with default behavior', () => {
      const unknownError = new Error('completely unknown error message');
      const classification = ErrorClassifier.classifyError(unknownError);
      
      expect(classification.errorType).toBe(RetryableErrorType.UNKNOWN_ERROR);
      expect(classification.shouldRetry).toBe(true); // Conservative approach
      expect(classification.confidence).toBeLessThan(0.5);
    });
  });

  describe('classifyByContext', () => {
    test('should classify by error constructor type', () => {
      class TimeoutError extends Error {
        constructor(message: string) {
          super(message);
          this.name = 'TimeoutError';
        }
      }

      const timeoutError = new TimeoutError('Custom timeout');
      const classification = ErrorClassifier.classifyError(timeoutError);
      
      expect(classification.errorType).toBe(RetryableErrorType.TIMEOUT_ERROR);
      expect(classification.confidence).toBeGreaterThan(0.9);
    });

    test('should handle string errors', () => {
      const stringError = 'network connection failed';
      const classification = ErrorClassifier.classifyError(stringError);
      
      expect(classification.errorType).toBe(RetryableErrorType.NETWORK_ERROR);
      expect(classification.shouldRetry).toBe(true);
    });
  });

  describe('convenience methods', () => {
    test('shouldRetryError should work correctly', () => {
      expect(ErrorClassifier.shouldRetryError(new Error('timeout'))).toBe(true);
      expect(ErrorClassifier.shouldRetryError(new Error('403 Forbidden'))).toBe(false);
    });

    test('getErrorType should return correct type', () => {
      expect(ErrorClassifier.getErrorType(new Error('network failed')))
        .toBe(RetryableErrorType.NETWORK_ERROR);
      expect(ErrorClassifier.getErrorType(new Error('429 rate limited')))
        .toBe(RetryableErrorType.RATE_LIMIT_ERROR);
    });

    test('isErrorType should match correctly', () => {
      const networkError = new Error('connection failed');
      expect(ErrorClassifier.isErrorType(networkError, RetryableErrorType.NETWORK_ERROR))
        .toBe(true);
      expect(ErrorClassifier.isErrorType(networkError, RetryableErrorType.TIMEOUT_ERROR))
        .toBe(false);
    });

    test('getClassificationConfidence should return valid confidence', () => {
      const error = new Error('timeout occurred');
      const confidence = ErrorClassifier.getClassificationConfidence(error);
      expect(confidence).toBeGreaterThan(0);
      expect(confidence).toBeLessThanOrEqual(1);
    });
  });

  describe('addCustomPattern', () => {
    test('should allow adding custom error patterns', () => {
      const customPattern = {
        messagePattern: /custom.*error/i,
        errorType: RetryableErrorType.BOOKING_ERROR,
        shouldRetry: false,
        confidence: 0.95,
        description: 'Custom booking error'
      };

      ErrorClassifier.addCustomPattern(customPattern);
      
      const customError = new Error('Custom booking error occurred');
      const classification = ErrorClassifier.classifyError(customError);
      
      expect(classification.errorType).toBe(RetryableErrorType.BOOKING_ERROR);
      expect(classification.shouldRetry).toBe(false);
      expect(classification.confidence).toBe(0.95);
    });
  });

  describe('analyzeErrorTrends', () => {
    test('should analyze multiple errors correctly', () => {
      const errors = [
        new Error('network failed'),
        new Error('timeout occurred'),
        new Error('network failed'),
        new Error('403 forbidden'),
        new Error('timeout occurred'),
        new Error('timeout occurred')
      ];

      const trends = ErrorClassifier.analyzeErrorTrends(errors);
      
      expect(trends.errorTypes[RetryableErrorType.NETWORK_ERROR]).toBe(2);
      expect(trends.errorTypes[RetryableErrorType.TIMEOUT_ERROR]).toBe(3);
      expect(trends.retryableCount).toBe(5); // All except 403
      expect(trends.nonRetryableCount).toBe(1); // Just 403
      expect(trends.mostCommonType).toBe(RetryableErrorType.TIMEOUT_ERROR);
      expect(trends.averageConfidence).toBeGreaterThan(0);
    });

    test('should handle empty error list', () => {
      const trends = ErrorClassifier.analyzeErrorTrends([]);
      
      expect(trends.retryableCount).toBe(0);
      expect(trends.nonRetryableCount).toBe(0);
      expect(trends.averageConfidence).toBe(0);
    });
  });

  describe('error pattern priorities', () => {
    test('should prioritize more specific patterns first', () => {
      // Add a very specific pattern
      ErrorClassifier.addCustomPattern({
        messagePattern: /very.*specific.*error/i,
        errorType: RetryableErrorType.BOOKING_ERROR,
        shouldRetry: false,
        confidence: 0.99,
        description: 'Very specific error'
      });

      const specificError = new Error('Very specific error occurred');
      const classification = ErrorClassifier.classifyError(specificError);
      
      // Should match the custom pattern, not a more generic one
      expect(classification.errorType).toBe(RetryableErrorType.BOOKING_ERROR);
      expect(classification.confidence).toBe(0.99);
    });
  });
});