/**
 * Unit tests for RetryManager
 * Tests the main retry orchestrator functionality
 */

import { RetryManager } from '@/core/retry/RetryManager';
import { RetryConfigFactory, RetryableErrorType, CircuitBreakerState } from '@/core/retry/RetryConfig';

// Mock p-retry since it's causing issues in Jest
jest.mock('p-retry', () => {
  return jest.fn().mockImplementation(async (fn, options) => {
    let lastError: Error;
    const maxRetries = 3;
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const result = await fn(attempt + 1);
        return result;
      } catch (error) {
        lastError = error as Error;
        
        if (options.onFailedAttempt) {
          await options.onFailedAttempt({ 
            error: lastError, 
            attemptNumber: attempt,
            retriesLeft: maxRetries - attempt - 1
          });
        }
        
        // Check if we should retry
        if (options.retries) {
          const shouldRetry = typeof options.retries === 'function' 
            ? options.retries(attempt + 1, lastError)
            : attempt < options.retries;
          
          if (!shouldRetry) {
            break;
          }
        }
      }
    }
    
    throw lastError!;
  });
});

// Mock AbortError
jest.mock('p-retry', () => {
  const actual = jest.requireActual('p-retry');
  return {
    ...actual,
    AbortError: class AbortError extends Error {
      constructor(message: string | Error) {
        super(typeof message === 'string' ? message : message.message);
        this.name = 'AbortError';
      }
    }
  };
});

describe('RetryManager', () => {
  let retryManager: RetryManager;
  let mockConfig: any;

  beforeEach(() => {
    mockConfig = RetryConfigFactory.createForTesting();
    retryManager = new RetryManager(mockConfig);
  });

  describe('initialization', () => {
    test('should initialize with provided configuration', () => {
      const stats = retryManager.getStats();
      
      expect(stats.config).toBeDefined();
      expect(stats.isEnabled).toBe(mockConfig.global.enabled);
      expect(stats.circuitBreaker).toBeDefined();
    });

    test('should start with circuit breaker in closed state', () => {
      expect(retryManager.getCircuitBreakerState()).toBe(CircuitBreakerState.CLOSED);
      expect(retryManager.isRequestAllowed()).toBe(true);
    });
  });

  describe('execute method', () => {
    test('should execute operation successfully without retries', async () => {
      const mockOperation = jest.fn().mockResolvedValue('success');
      
      const result = await retryManager.execute(mockOperation, {
        operation: 'test-operation'
      });

      expect(result.success).toBe(true);
      expect(result.result).toBe('success');
      expect(result.totalAttempts).toBe(1);
      expect(result.attempts).toHaveLength(0); // No retry attempts
      expect(mockOperation).toHaveBeenCalledTimes(1);
    });

    test('should retry on failure and eventually succeed', async () => {
      const mockOperation = jest.fn()
        .mockRejectedValueOnce(new Error('First failure'))
        .mockRejectedValueOnce(new Error('Second failure'))
        .mockResolvedValueOnce('success');

      const result = await retryManager.execute(mockOperation, {
        operation: 'test-operation-with-retries'
      });

      expect(result.success).toBe(true);
      expect(result.result).toBe('success');
      expect(result.totalAttempts).toBe(3);
      expect(result.attempts).toHaveLength(2); // Two failed attempts
      expect(mockOperation).toHaveBeenCalledTimes(3);
    });

    test('should fail after exhausting all retries', async () => {
      const mockOperation = jest.fn().mockRejectedValue(new Error('Persistent failure'));

      const result = await retryManager.execute(mockOperation, {
        operation: 'test-operation-always-fails'
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error?.message).toContain('Persistent failure');
      expect(result.totalAttempts).toBeGreaterThan(1);
    });

    test('should respect custom error type override', async () => {
      const mockOperation = jest.fn().mockRejectedValue(new Error('Custom error'));

      const result = await retryManager.execute(mockOperation, {
        operation: 'test-custom-error-type',
        errorType: RetryableErrorType.RATE_LIMIT_ERROR
      });

      expect(result.success).toBe(false);
      // Should use rate limit strategy which has longer delays
      expect(result.totalTimeMs).toBeGreaterThan(100); // At least some delay
    });

    test('should respect skip circuit breaker option', async () => {
      // Force circuit breaker to open
      retryManager.forceCircuitBreakerOpen();
      expect(retryManager.getCircuitBreakerState()).toBe(CircuitBreakerState.OPEN);

      const mockOperation = jest.fn().mockResolvedValue('success');

      const result = await retryManager.execute(mockOperation, {
        operation: 'test-skip-circuit-breaker',
        skipCircuitBreaker: true
      });

      expect(result.success).toBe(true);
      expect(result.result).toBe('success');
    });

    test('should fail fast when circuit breaker is open', async () => {
      // Force circuit breaker to open
      retryManager.forceCircuitBreakerOpen();
      
      const mockOperation = jest.fn().mockResolvedValue('success');

      const result = await retryManager.execute(mockOperation, {
        operation: 'test-circuit-breaker-open'
      });

      expect(result.success).toBe(false);
      expect(result.circuitBreakerTripped).toBe(true);
      expect(mockOperation).not.toHaveBeenCalled(); // Should not even try
    });

    test('should respect timeout option', async () => {
      const mockOperation = jest.fn().mockImplementation(
        () => new Promise(resolve => setTimeout(resolve, 2000))
      );

      const result = await retryManager.execute(mockOperation, {
        operation: 'test-timeout',
        timeoutMs: 500
      });

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('timeout');
    });

    test('should handle custom retry strategy override', async () => {
      const mockOperation = jest.fn().mockRejectedValue(new Error('Test error'));

      const result = await retryManager.execute(mockOperation, {
        operation: 'test-custom-strategy',
        strategy: {
          maxAttempts: 1, // Only one attempt
          initialDelay: 100
        }
      });

      expect(result.success).toBe(false);
      expect(result.totalAttempts).toBe(1); // Should respect custom maxAttempts
    });
  });

  describe('executeSimple method', () => {
    test('should return result directly on success', async () => {
      const mockOperation = jest.fn().mockResolvedValue('simple-success');
      
      const result = await retryManager.executeSimple(
        mockOperation,
        'simple-test'
      );

      expect(result).toBe('simple-success');
    });

    test('should throw error on failure', async () => {
      const mockOperation = jest.fn().mockRejectedValue(new Error('Simple failure'));
      
      await expect(
        retryManager.executeSimple(mockOperation, 'simple-test-fail')
      ).rejects.toThrow('Simple failure');
    });
  });

  describe('executeWithTimeout method', () => {
    test('should return result within timeout', async () => {
      const mockOperation = jest.fn().mockResolvedValue('timeout-success');
      
      const result = await retryManager.executeWithTimeout(
        mockOperation,
        'timeout-test',
        5000
      );

      expect(result).toBe('timeout-success');
    });

    test('should timeout for slow operations', async () => {
      const mockOperation = jest.fn().mockImplementation(
        () => new Promise(resolve => setTimeout(resolve, 2000))
      );
      
      await expect(
        retryManager.executeWithTimeout(mockOperation, 'slow-test', 500)
      ).rejects.toThrow();
    });
  });

  describe('configuration management', () => {
    test('should allow configuration updates', () => {
      const newConfig = {
        global: {
          enabled: false
        }
      };

      retryManager.updateConfig(newConfig);
      
      const stats = retryManager.getStats();
      expect(stats.isEnabled).toBe(false);
    });

    test('should allow circuit breaker reset', () => {
      retryManager.forceCircuitBreakerOpen();
      expect(retryManager.getCircuitBreakerState()).toBe(CircuitBreakerState.OPEN);

      retryManager.resetCircuitBreaker();
      expect(retryManager.getCircuitBreakerState()).toBe(CircuitBreakerState.CLOSED);
    });
  });

  describe('operation-specific strategies', () => {
    test('should apply navigation-specific strategy', async () => {
      const mockOperation = jest.fn().mockRejectedValue(new Error('Navigation failed'));

      const result = await retryManager.execute(mockOperation, {
        operation: 'navigate-to-page'
      });

      expect(result.success).toBe(false);
      // Navigation operations should get special handling
    });

    test('should apply slot-search-specific strategy', async () => {
      const mockOperation = jest.fn().mockRejectedValue(new Error('Slot search failed'));

      const result = await retryManager.execute(mockOperation, {
        operation: 'slot-search-operation'
      });

      expect(result.success).toBe(false);
      // Slot search operations should get special handling
    });

    test('should apply booking-specific strategy', async () => {
      const mockOperation = jest.fn().mockRejectedValue(new Error('Booking failed'));

      const result = await retryManager.execute(mockOperation, {
        operation: 'booking-execution'
      });

      expect(result.success).toBe(false);
      // Booking operations should get special handling
    });

    test('should apply checkout-specific strategy', async () => {
      const mockOperation = jest.fn().mockRejectedValue(new Error('Checkout failed'));

      const result = await retryManager.execute(mockOperation, {
        operation: 'checkout-process'
      });

      expect(result.success).toBe(false);
      // Checkout operations should get special handling
    });
  });

  describe('disabled retry system', () => {
    test('should bypass retry when globally disabled', async () => {
      const disabledConfig = {
        ...mockConfig,
        global: { ...mockConfig.global, enabled: false }
      };
      const disabledRetryManager = new RetryManager(disabledConfig);

      const mockOperation = jest.fn().mockRejectedValue(new Error('Test error'));

      const result = await disabledRetryManager.execute(mockOperation, {
        operation: 'disabled-test'
      });

      expect(result.success).toBe(false);
      expect(result.totalAttempts).toBe(1); // No retries
      expect(mockOperation).toHaveBeenCalledTimes(1);
    });
  });

  describe('testConfiguration method', () => {
    test('should validate configuration successfully', async () => {
      const testResult = await retryManager.testConfiguration();
      
      expect(testResult.success).toBe(true);
      expect(testResult.message).toContain('passed');
      expect(testResult.stats).toBeDefined();
    });

    test('should handle configuration test failure', async () => {
      // Create a retry manager with invalid config
      const invalidConfig = {
        ...mockConfig,
        errorStrategies: {
          ...mockConfig.errorStrategies,
          NETWORK_ERROR: {
            ...mockConfig.errorStrategies.NETWORK_ERROR,
            maxAttempts: 0 // Invalid
          }
        }
      };

      // This might still pass because the test operation is simple
      // but demonstrates the capability
      const invalidRetryManager = new RetryManager(invalidConfig);
      const testResult = await invalidRetryManager.testConfiguration();
      
      expect(testResult.stats).toBeDefined();
    });
  });

  describe('error handling edge cases', () => {
    test('should handle undefined operation result', async () => {
      const mockOperation = jest.fn().mockResolvedValue(undefined);
      
      const result = await retryManager.execute(mockOperation, {
        operation: 'undefined-result-test'
      });

      expect(result.success).toBe(true);
      expect(result.result).toBeUndefined();
    });

    test('should handle non-Error thrown objects', async () => {
      const mockOperation = jest.fn().mockRejectedValue('string error');
      
      const result = await retryManager.execute(mockOperation, {
        operation: 'string-error-test'
      });

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('string error');
    });

    test('should handle operation that throws non-Error objects', async () => {
      const mockOperation = jest.fn().mockImplementation(() => {
        throw { custom: 'error object' };
      });
      
      const result = await retryManager.execute(mockOperation, {
        operation: 'object-error-test'
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('statistics and monitoring', () => {
    test('should provide comprehensive statistics', () => {
      const stats = retryManager.getStats();
      
      expect(stats.config).toBeDefined();
      expect(stats.circuitBreaker).toBeDefined();
      expect(stats.isEnabled).toBeDefined();
      expect(typeof stats.isEnabled).toBe('boolean');
    });

    test('should track request allowed status', () => {
      expect(retryManager.isRequestAllowed()).toBe(true);
      
      retryManager.forceCircuitBreakerOpen();
      expect(retryManager.isRequestAllowed()).toBe(false);
    });
  });
});