/**
 * Unit tests for RetryStrategies
 * Tests delay calculations, retry decisions, and strategy validation
 */

import { RetryStrategies } from '@/core/retry/RetryStrategies';
import { RetryableErrorType, ErrorRetryStrategy } from '@/core/retry/RetryConfig';

describe('RetryStrategies', () => {
  const defaultStrategy: ErrorRetryStrategy = {
    enabled: true,
    maxAttempts: 3,
    initialDelay: 1000,
    maxDelay: 8000,
    backoffMultiplier: 2,
    maxJitter: 0.1,
    useCircuitBreaker: true
  };

  describe('calculateDelay', () => {
    test('should calculate exponential backoff correctly', () => {
      const delay1 = RetryStrategies.calculateDelay(defaultStrategy, 1, { includeJitter: false });
      const delay2 = RetryStrategies.calculateDelay(defaultStrategy, 2, { includeJitter: false });
      const delay3 = RetryStrategies.calculateDelay(defaultStrategy, 3, { includeJitter: false });

      expect(delay1.baseDelayMs).toBe(1000); // 1000 * 2^0
      expect(delay2.baseDelayMs).toBe(2000); // 1000 * 2^1
      expect(delay3.baseDelayMs).toBe(4000); // 1000 * 2^2
      
      expect(delay1.jitterMs).toBe(0);
      expect(delay2.jitterMs).toBe(0);
      expect(delay3.jitterMs).toBe(0);
    });

    test('should respect maximum delay limit', () => {
      const delay = RetryStrategies.calculateDelay(defaultStrategy, 10, { includeJitter: false });
      
      expect(delay.baseDelayMs).toBe(defaultStrategy.maxDelay);
      expect(delay.delayMs).toBeLessThanOrEqual(defaultStrategy.maxDelay);
    });

    test('should apply jitter when enabled', () => {
      const delay1 = RetryStrategies.calculateDelay(defaultStrategy, 1, { includeJitter: true });
      const delay2 = RetryStrategies.calculateDelay(defaultStrategy, 1, { includeJitter: true });

      // With jitter, delays should vary
      expect(delay1.jitterMs).not.toBe(0);
      expect(delay2.jitterMs).not.toBe(0);
      
      // But should be within bounds
      const maxJitterMs = delay1.baseDelayMs * defaultStrategy.maxJitter;
      expect(Math.abs(delay1.jitterMs)).toBeLessThanOrEqual(maxJitterMs);
    });

    test('should respect minimum delay constraint', () => {
      const minDelay = 2000;
      const delay = RetryStrategies.calculateDelay(
        defaultStrategy, 
        1, 
        { includeJitter: false, minDelayMs: minDelay }
      );

      expect(delay.delayMs).toBeGreaterThanOrEqual(minDelay);
    });

    test('should respect maximum delay constraint override', () => {
      const maxDelay = 500;
      const delay = RetryStrategies.calculateDelay(
        defaultStrategy, 
        5, 
        { includeJitter: false, maxDelayMs: maxDelay }
      );

      expect(delay.delayMs).toBeLessThanOrEqual(maxDelay);
    });

    test('should apply custom jitter factor', () => {
      const customJitter = 0.5;
      const delay = RetryStrategies.calculateDelay(
        defaultStrategy, 
        1, 
        { includeJitter: true, customJitter }
      );

      const maxJitterMs = delay.baseDelayMs * customJitter;
      expect(Math.abs(delay.jitterMs)).toBeLessThanOrEqual(maxJitterMs);
    });
  });

  describe('shouldRetry', () => {
    test('should not retry when strategy is disabled', () => {
      const disabledStrategy = { ...defaultStrategy, enabled: false };
      const decision = RetryStrategies.shouldRetry(
        RetryableErrorType.NETWORK_ERROR,
        disabledStrategy,
        1
      );

      expect(decision.shouldRetry).toBe(false);
      expect(decision.reason).toContain('disabled');
    });

    test('should not retry when max attempts reached', () => {
      const decision = RetryStrategies.shouldRetry(
        RetryableErrorType.NETWORK_ERROR,
        defaultStrategy,
        defaultStrategy.maxAttempts
      );

      expect(decision.shouldRetry).toBe(false);
      expect(decision.reason).toContain('Maximum attempts');
    });

    test('should retry for retryable errors within limits', () => {
      const decision = RetryStrategies.shouldRetry(
        RetryableErrorType.NETWORK_ERROR,
        defaultStrategy,
        1
      );

      expect(decision.shouldRetry).toBe(true);
      expect(decision.reason).toContain('Retry attempt');
      expect(decision.delayMs).toBeDefined();
    });

    test('should apply error-specific logic for network errors', () => {
      // DNS errors should not retry
      const dnsDecision = RetryStrategies.shouldRetry(
        RetryableErrorType.NETWORK_ERROR,
        defaultStrategy,
        1,
        new Error('ENOTFOUND dns resolution failed')
      );

      expect(dnsDecision.shouldRetry).toBe(false);
      expect(dnsDecision.reason).toContain('DNS resolution');

      // Certificate errors should not retry
      const certDecision = RetryStrategies.shouldRetry(
        RetryableErrorType.NETWORK_ERROR,
        defaultStrategy,
        1,
        new Error('SSL certificate error')
      );

      expect(certDecision.shouldRetry).toBe(false);
      expect(certDecision.reason).toContain('Certificate');
    });

    test('should apply error-specific logic for server errors', () => {
      // Maintenance mode should not retry
      const maintenanceDecision = RetryStrategies.shouldRetry(
        RetryableErrorType.SERVER_ERROR,
        defaultStrategy,
        1,
        new Error('503 Service temporarily in maintenance mode')
      );

      expect(maintenanceDecision.shouldRetry).toBe(false);
      expect(maintenanceDecision.reason).toContain('maintenance');
    });

    test('should apply error-specific logic for authentication errors', () => {
      // Invalid credentials should not retry
      const credentialsDecision = RetryStrategies.shouldRetry(
        RetryableErrorType.AUTHENTICATION_ERROR,
        defaultStrategy,
        1,
        new Error('invalid credentials provided')
      );

      expect(credentialsDecision.shouldRetry).toBe(false);
      expect(credentialsDecision.reason).toContain('credentials');

      // Session expiration should retry
      const sessionDecision = RetryStrategies.shouldRetry(
        RetryableErrorType.AUTHENTICATION_ERROR,
        defaultStrategy,
        1,
        new Error('session expired')
      );

      expect(sessionDecision.shouldRetry).toBe(true);
      expect(sessionDecision.reason).toContain('Session');
    });

    test('should apply error-specific logic for booking errors', () => {
      // Payment failures should not retry
      const paymentDecision = RetryStrategies.shouldRetry(
        RetryableErrorType.BOOKING_ERROR,
        defaultStrategy,
        1,
        new Error('payment failed')
      );

      expect(paymentDecision.shouldRetry).toBe(false);
      expect(paymentDecision.reason).toContain('Payment');

      // Slot unavailable should not retry
      const slotDecision = RetryStrategies.shouldRetry(
        RetryableErrorType.BOOKING_ERROR,
        defaultStrategy,
        1,
        new Error('slot not available')
      );

      expect(slotDecision.shouldRetry).toBe(false);
      expect(slotDecision.reason).toContain('Slot unavailable');
    });
  });

  describe('calculateTotalRetryTime', () => {
    test('should calculate total time for all attempts', () => {
      const totalTime = RetryStrategies.calculateTotalRetryTime(defaultStrategy);
      
      // Should be sum of: 1000 + 2000 + 4000 = 7000ms (without jitter)
      expect(totalTime).toBe(7000);
    });

    test('should handle different strategy configurations', () => {
      const fastStrategy: ErrorRetryStrategy = {
        ...defaultStrategy,
        maxAttempts: 2,
        initialDelay: 500,
        backoffMultiplier: 1.5
      };

      const totalTime = RetryStrategies.calculateTotalRetryTime(fastStrategy);
      
      // Should be: 500 + 750 = 1250ms
      expect(totalTime).toBe(1250);
    });
  });

  describe('getRecommendedStrategy', () => {
    test('should return appropriate strategy for each error type', () => {
      const errorTypes = Object.values(RetryableErrorType);
      
      errorTypes.forEach(errorType => {
        const strategy = RetryStrategies.getRecommendedStrategy(errorType);
        
        expect(strategy).toBeDefined();
        expect(strategy.enabled).toBe(true);
        expect(strategy.maxAttempts).toBeGreaterThan(0);
        expect(strategy.initialDelay).toBeGreaterThan(0);
        expect(strategy.maxDelay).toBeGreaterThanOrEqual(strategy.initialDelay);
        expect(strategy.backoffMultiplier).toBeGreaterThanOrEqual(1);
        expect(strategy.maxJitter).toBeGreaterThanOrEqual(0);
        expect(strategy.maxJitter).toBeLessThanOrEqual(1);
      });
    });

    test('should return different strategies for different error types', () => {
      const networkStrategy = RetryStrategies.getRecommendedStrategy(RetryableErrorType.NETWORK_ERROR);
      const rateLimitStrategy = RetryStrategies.getRecommendedStrategy(RetryableErrorType.RATE_LIMIT_ERROR);
      
      // Rate limit should have longer delays
      expect(rateLimitStrategy.initialDelay).toBeGreaterThan(networkStrategy.initialDelay);
      expect(rateLimitStrategy.maxJitter).toBeGreaterThan(networkStrategy.maxJitter);
    });
  });

  describe('createAttemptInfo', () => {
    test('should create properly formatted attempt info', () => {
      const error = new Error('Test error');
      const attemptInfo = RetryStrategies.createAttemptInfo(
        2, // attemptNumber
        3, // maxAttempts
        error,
        RetryableErrorType.NETWORK_ERROR,
        1500, // delayMs
        3000, // elapsedMs
        defaultStrategy,
        'test-operation',
        'CLOSED'
      );

      expect(attemptInfo.attemptNumber).toBe(2);
      expect(attemptInfo.maxAttempts).toBe(3);
      expect(attemptInfo.error).toBe(error);
      expect(attemptInfo.errorType).toBe(RetryableErrorType.NETWORK_ERROR);
      expect(attemptInfo.delayMs).toBe(1500);
      expect(attemptInfo.elapsedMs).toBe(3000);
      expect(attemptInfo.strategy).toBe(defaultStrategy);
      expect(attemptInfo.operation).toBe('test-operation');
      expect(attemptInfo.circuitBreakerState).toBe('CLOSED');
    });
  });

  describe('validateStrategy', () => {
    test('should validate correct strategy configuration', () => {
      const validation = RetryStrategies.validateStrategy(defaultStrategy);
      
      expect(validation.isValid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    test('should detect invalid maxAttempts', () => {
      const invalidStrategy = { ...defaultStrategy, maxAttempts: 0 };
      const validation = RetryStrategies.validateStrategy(invalidStrategy);
      
      expect(validation.isValid).toBe(false);
      expect(validation.errors).toContain('maxAttempts must be at least 1');
    });

    test('should detect invalid delay configuration', () => {
      const invalidStrategy = { ...defaultStrategy, initialDelay: -1 };
      const validation = RetryStrategies.validateStrategy(invalidStrategy);
      
      expect(validation.isValid).toBe(false);
      expect(validation.errors).toContain('initialDelay must be non-negative');
    });

    test('should detect maxDelay less than initialDelay', () => {
      const invalidStrategy = { ...defaultStrategy, maxDelay: 500, initialDelay: 1000 };
      const validation = RetryStrategies.validateStrategy(invalidStrategy);
      
      expect(validation.isValid).toBe(false);
      expect(validation.errors).toContain('maxDelay must be >= initialDelay');
    });

    test('should detect invalid backoff multiplier', () => {
      const invalidStrategy = { ...defaultStrategy, backoffMultiplier: 0.5 };
      const validation = RetryStrategies.validateStrategy(invalidStrategy);
      
      expect(validation.isValid).toBe(false);
      expect(validation.errors).toContain('backoffMultiplier must be >= 1');
    });

    test('should detect invalid jitter configuration', () => {
      const invalidStrategy = { ...defaultStrategy, maxJitter: 1.5 };
      const validation = RetryStrategies.validateStrategy(invalidStrategy);
      
      expect(validation.isValid).toBe(false);
      expect(validation.errors).toContain('maxJitter must be between 0 and 1');
    });

    test('should detect multiple validation errors', () => {
      const invalidStrategy: ErrorRetryStrategy = {
        enabled: true,
        maxAttempts: 0,
        initialDelay: -100,
        maxDelay: 50,
        backoffMultiplier: 0.5,
        maxJitter: 2.0,
        useCircuitBreaker: true
      };
      
      const validation = RetryStrategies.validateStrategy(invalidStrategy);
      
      expect(validation.isValid).toBe(false);
      expect(validation.errors.length).toBeGreaterThan(1);
    });
  });

  describe('edge cases', () => {
    test('should handle zero initial delay', () => {
      const zeroDelayStrategy = { ...defaultStrategy, initialDelay: 0 };
      const delay = RetryStrategies.calculateDelay(zeroDelayStrategy, 1, { includeJitter: false });
      
      expect(delay.delayMs).toBe(0);
    });

    test('should handle very high attempt numbers', () => {
      const delay = RetryStrategies.calculateDelay(defaultStrategy, 100, { includeJitter: false });
      
      expect(delay.delayMs).toBe(defaultStrategy.maxDelay);
    });

    test('should handle strategy with multiplier of 1', () => {
      const linearStrategy = { ...defaultStrategy, backoffMultiplier: 1 };
      const delay1 = RetryStrategies.calculateDelay(linearStrategy, 1, { includeJitter: false });
      const delay2 = RetryStrategies.calculateDelay(linearStrategy, 2, { includeJitter: false });
      
      expect(delay1.delayMs).toBe(delay2.delayMs); // No exponential growth
    });
  });
});