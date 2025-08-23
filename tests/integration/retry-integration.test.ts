/**
 * Integration tests for the complete retry system
 */

import { RetryManager } from '../../src/core/retry/RetryManager';
import { ConfigurationManager } from '../../src/utils/ConfigurationManager';
import { getGlobalRetryManager, resetGlobalRetryManager } from '../../src/core/retry';
import { CircuitState, ErrorCategory, RetryConfig } from '../../src/types/retry.types';

describe('Retry System Integration', () => {
  let retryManager: RetryManager;
  
  const testConfig: RetryConfig = {
    enabled: true,
    maxAttempts: 3,
    minDelay: 50, // Short delays for faster tests
    maxDelay: 500,
    jitterEnabled: false, // Disable for predictable test timing
    circuitBreaker: {
      failureThreshold: 2,
      recoveryTimeout: 1000, // Short recovery for tests
      requestVolumeThreshold: 3,
      rollingWindow: 5000,
      successThreshold: 1
    },
    errorSpecific: {
      networkAttempts: 3,
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

  beforeEach(() => {
    retryManager = new RetryManager(testConfig);
  });

  afterEach(() => {
    resetGlobalRetryManager();
  });

  describe('End-to-End Retry Scenarios', () => {
    test('should retry network errors with exponential backoff', async () => {
      const operation = jest.fn()
        .mockRejectedValueOnce(new Error('ECONNRESET: Connection reset'))
        .mockRejectedValueOnce(new Error('ENOTFOUND: DNS resolution failed'))
        .mockResolvedValue('success');

      const startTime = Date.now();
      const result = await retryManager.execute(operation, 'network-retry-test');
      const duration = Date.now() - startTime;

      expect(result.result).toBe('success');
      expect(result.attempts).toBe(3);
      expect(operation).toHaveBeenCalledTimes(3);
      
      // Should have taken time due to backoff delays
      expect(duration).toBeGreaterThan(50 + 100); // ~150ms minimum with backoff
    });

    test('should handle rate limiting with appropriate delays', async () => {
      const rateLimitError = { status: 429, message: 'Too Many Requests' };
      const operation = jest.fn()
        .mockRejectedValueOnce(rateLimitError)
        .mockResolvedValue('success');

      const startTime = Date.now();
      const result = await retryManager.execute(operation, 'rate-limit-test');
      const duration = Date.now() - startTime;

      expect(result.result).toBe('success');
      expect(result.attempts).toBe(2);
      expect(operation).toHaveBeenCalledTimes(2);
      
      // Rate limit should have longer delays
      expect(duration).toBeGreaterThan(100);
    });

    test('should abort on client errors immediately', async () => {
      const clientError = { status: 404, message: 'Not Found' };
      const operation = jest.fn().mockRejectedValue(clientError);

      await expect(retryManager.execute(operation, 'client-error-test'))
        .rejects.toEqual(expect.objectContaining({
          message: expect.stringContaining('Non-retryable error')
        }));

      expect(operation).toHaveBeenCalledTimes(1); // Should not retry
    });

    test('should exhaust retries for server errors', async () => {
      const serverError = { status: 500, message: 'Internal Server Error' };
      const operation = jest.fn().mockRejectedValue(serverError);

      await expect(retryManager.execute(operation, 'server-error-test'))
        .rejects.toEqual(serverError);

      // Should retry according to server error strategy
      expect(operation).toHaveBeenCalledTimes(testConfig.errorSpecific.serverErrorAttempts + 1);
    });
  });

  describe('Circuit Breaker Integration', () => {
    test('should open circuit after consecutive failures', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('Persistent failure'));

      // Execute enough failing operations to open circuit
      for (let i = 0; i < testConfig.circuitBreaker.requestVolumeThreshold; i++) {
        try {
          await retryManager.execute(operation, 'circuit-breaker-test');
        } catch {
          // Expected failures
        }
      }

      expect(retryManager.getCircuitBreakerState()).toBe(CircuitState.OPEN);
      expect(retryManager.isHealthy()).toBe(false);

      // Next operation should be rejected immediately
      const quickOperation = jest.fn().mockResolvedValue('success');
      await expect(retryManager.execute(quickOperation, 'rejected-operation'))
        .rejects.toThrow('Circuit breaker is OPEN');
      
      expect(quickOperation).not.toHaveBeenCalled();
    });

    test('should recover from open circuit after timeout', async () => {
      // Open the circuit
      const failingOp = jest.fn().mockRejectedValue(new Error('Failure'));
      for (let i = 0; i < testConfig.circuitBreaker.requestVolumeThreshold; i++) {
        try {
          await retryManager.execute(failingOp, 'circuit-opener');
        } catch {
          // Expected
        }
      }

      expect(retryManager.getCircuitBreakerState()).toBe(CircuitState.OPEN);

      // Wait for recovery timeout
      await new Promise(resolve => setTimeout(resolve, testConfig.circuitBreaker.recoveryTimeout + 100));

      // Circuit should allow test operation and close on success
      const successOp = jest.fn().mockResolvedValue('recovered');
      const result = await retryManager.execute(successOp, 'recovery-test');

      expect(result.result).toBe('recovered');
      expect(retryManager.getCircuitBreakerState()).toBe(CircuitState.CLOSED);
    });

    test('should track statistics correctly', async () => {
      const successOp = jest.fn().mockResolvedValue('success');
      const failOp = jest.fn().mockRejectedValue(new Error('failure'));

      // Execute mix of operations
      await retryManager.execute(successOp, 'stats-success');
      try { await retryManager.execute(failOp, 'stats-fail'); } catch { }
      await retryManager.execute(successOp, 'stats-success');

      const stats = retryManager.getCircuitBreakerStats();
      expect(stats.totalRequests).toBeGreaterThan(0);
      expect(stats.successfulRequests).toBeGreaterThan(0);
      expect(stats.failedRequests).toBeGreaterThan(0);
      expect(stats.failureRate).toBeGreaterThan(0);
      expect(stats.failureRate).toBeLessThan(1);
    });
  });

  describe('Configuration Manager Integration', () => {
    test('should load retry configuration from environment', () => {
      // Mock environment variables
      process.env['RETRY_ENABLED'] = 'true';
      process.env['RETRY_MAX_ATTEMPTS'] = '5';
      process.env['CIRCUIT_BREAKER_FAILURE_THRESHOLD'] = '10';

      const configManager = ConfigurationManager.getInstance();
      const retryConfig = configManager.getRetryConfig();

      expect(retryConfig.enabled).toBe(true);
      expect(retryConfig.maxAttempts).toBe(5);
      expect(retryConfig.circuitBreaker.failureThreshold).toBe(10);

      // Clean up
      delete process.env['RETRY_ENABLED'];
      delete process.env['RETRY_MAX_ATTEMPTS'];
      delete process.env['CIRCUIT_BREAKER_FAILURE_THRESHOLD'];
    });

    test('should update retry configuration at runtime', () => {
      const configManager = ConfigurationManager.getInstance();
      const updates = {
        maxAttempts: 10,
        minDelay: 2000
      };

      configManager.updateRetryConfig(updates);
      const updatedConfig = configManager.getRetryConfig();

      expect(updatedConfig.maxAttempts).toBe(10);
      expect(updatedConfig.minDelay).toBe(2000);
    });
  });

  describe('Global Retry Manager', () => {
    test('should provide singleton instance', () => {
      const manager1 = getGlobalRetryManager();
      const manager2 = getGlobalRetryManager();

      expect(manager1).toBe(manager2); // Same instance
      expect(manager1).toBeInstanceOf(RetryManager);
    });

    test('should reset global instance', () => {
      const manager1 = getGlobalRetryManager();
      resetGlobalRetryManager();
      const manager2 = getGlobalRetryManager();

      expect(manager1).not.toBe(manager2); // Different instances
    });
  });

  describe('Real-world Scenarios', () => {
    test('should handle booking operation with various failure types', async () => {
      let attemptCount = 0;
      const bookingOperation = jest.fn().mockImplementation(async () => {
        attemptCount++;
        
        switch (attemptCount) {
          case 1:
            throw { status: 429, message: 'Rate limited' }; // Should retry with rate limit strategy
          case 2:
            throw new Error('ETIMEDOUT: Connection timeout'); // Network/timeout error
          case 3:
            return { success: true, bookingId: 'abc123' }; // Success
          default:
            throw new Error('Unexpected attempt');
        }
      });

      const result = await retryManager.execute(bookingOperation, 'booking-simulation');

      expect(result.result).toEqual({ success: true, bookingId: 'abc123' });
      expect(result.attempts).toBe(3);
      expect(bookingOperation).toHaveBeenCalledTimes(3);
    });

    test('should handle page navigation with retry logic', async () => {
      let navigationAttempts = 0;
      const navigateOperation = jest.fn().mockImplementation(async () => {
        navigationAttempts++;
        
        if (navigationAttempts === 1) {
          throw new Error('Navigation timeout of 30000ms exceeded');
        }
        if (navigationAttempts === 2) {
          throw new Error('ECONNRESET: Connection was reset');
        }
        
        return { navigated: true, url: 'https://example.com' };
      });

      const result = await retryManager.execute(navigateOperation, 'navigation-retry');

      expect(result.result).toEqual({ navigated: true, url: 'https://example.com' });
      expect(result.attempts).toBe(3);
      expect(navigationOperation).toHaveBeenCalledTimes(3);
    });

    test('should handle authentication errors appropriately', async () => {
      const authOperation = jest.fn()
        .mockRejectedValueOnce({ status: 401, message: 'Unauthorized' })
        .mockResolvedValue({ authenticated: true, token: 'jwt-token' });

      const result = await retryManager.execute(authOperation, 'auth-retry');

      expect(result.result).toEqual({ authenticated: true, token: 'jwt-token' });
      expect(result.attempts).toBe(2);
      expect(authOperation).toHaveBeenCalledTimes(2);
    });
  });

  describe('Performance and Load Testing', () => {
    test('should handle high concurrency without issues', async () => {
      const operations = Array.from({ length: 50 }, (_, i) => 
        jest.fn().mockResolvedValue(`result-${i}`)
      );

      const startTime = Date.now();
      
      const promises = operations.map((op, i) => 
        retryManager.execute(op, `concurrent-op-${i}`)
      );
      
      const results = await Promise.all(promises);
      const duration = Date.now() - startTime;

      expect(results).toHaveLength(50);
      expect(duration).toBeLessThan(5000); // Should complete reasonably quickly
      
      results.forEach((result, i) => {
        expect(result.result).toBe(`result-${i}`);
        expect(result.attempts).toBe(1);
      });
    });

    test('should maintain performance under mixed success/failure scenarios', async () => {
      const mixedOperations = Array.from({ length: 20 }, (_, i) => {
        if (i % 3 === 0) {
          // Every 3rd operation fails once then succeeds
          return jest.fn()
            .mockRejectedValueOnce(new Error('Temporary failure'))
            .mockResolvedValue(`recovered-${i}`);
        } else {
          // Other operations succeed immediately
          return jest.fn().mockResolvedValue(`success-${i}`);
        }
      });

      const startTime = Date.now();
      
      const promises = mixedOperations.map((op, i) => 
        retryManager.execute(op, `mixed-op-${i}`)
      );
      
      const results = await Promise.all(promises);
      const duration = Date.now() - startTime;

      expect(results).toHaveLength(20);
      expect(duration).toBeLessThan(10000); // Allow for retry delays
      
      // Verify all operations completed successfully
      results.forEach((result, i) => {
        expect(result.result).toMatch(/^(success|recovered)-${i}$/);
        expect(result.circuitBreakerTriggered).toBe(false);
      });
    });
  });

  describe('Error Classification Integration', () => {
    test('should apply correct strategies for different error types', async () => {
      const testCases = [
        {
          error: new Error('ECONNRESET'),
          expectedCategory: ErrorCategory.NETWORK,
          maxAttempts: testConfig.errorSpecific.networkAttempts + 1
        },
        {
          error: { status: 429, message: 'Too Many Requests' },
          expectedCategory: ErrorCategory.RATE_LIMIT,
          maxAttempts: testConfig.errorSpecific.rateLimitAttempts + 1
        },
        {
          error: { status: 500, message: 'Internal Server Error' },
          expectedCategory: ErrorCategory.SERVER_ERROR,
          maxAttempts: testConfig.errorSpecific.serverErrorAttempts + 1
        },
        {
          error: new Error('Request timeout'),
          expectedCategory: ErrorCategory.TIMEOUT,
          maxAttempts: testConfig.errorSpecific.timeoutAttempts + 1
        }
      ];

      for (const testCase of testCases) {
        const operation = jest.fn().mockRejectedValue(testCase.error);
        
        try {
          await retryManager.execute(operation, `error-classification-${testCase.expectedCategory}`);
        } catch {
          // Expected to fail eventually
        }

        expect(operation).toHaveBeenCalledTimes(testCase.maxAttempts);
        operation.mockClear();
      }
    });
  });
});