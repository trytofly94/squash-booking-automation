/**
 * Unit tests for RetryManager with p-retry integration
 */

import { RetryManager } from '../../../src/core/retry/RetryManager';
import { CircuitBreaker } from '../../../src/core/retry/CircuitBreaker';
import { RetryConfig, CircuitState } from '../../../src/types/retry.types';

// Mock p-retry module
jest.mock('p-retry', () => {
  const originalPRetry = jest.requireActual('p-retry');
  return {
    ...originalPRetry,
    default: jest.fn(),
    AbortError: originalPRetry.AbortError
  };
});

// Mock dependencies
jest.mock('../../../src/core/retry/CircuitBreaker');
jest.mock('../../../src/utils/logger');
jest.mock('../../../src/utils/PerformanceMonitor');
jest.mock('../../../src/utils/CorrelationManager');

describe('RetryManager', () => {
  let retryManager: RetryManager;
  let mockCircuitBreaker: jest.Mocked<CircuitBreaker>;
  
  const defaultConfig: RetryConfig = {
    enabled: true,
    maxAttempts: 3,
    minDelay: 1000,
    maxDelay: 10000,
    jitterEnabled: true,
    circuitBreaker: {
      failureThreshold: 5,
      recoveryTimeout: 60000,
      requestVolumeThreshold: 10,
      rollingWindow: 60000,
      successThreshold: 3
    },
    errorSpecific: {
      networkAttempts: 5,
      rateLimitAttempts: 3,
      serverErrorAttempts: 2,
      timeoutAttempts: 4
    },
    exponentialBackoff: {
      enabled: true,
      base: 2
    },
    abortOnClientErrors: true
  };

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    
    // Mock CircuitBreaker
    mockCircuitBreaker = {
      execute: jest.fn(),
      getState: jest.fn().mockReturnValue(CircuitState.CLOSED),
      getStats: jest.fn().mockReturnValue({
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        failureRate: 0,
        currentState: CircuitState.CLOSED,
        lastFailureTime: 0,
        consecutiveFailures: 0
      }),
      reset: jest.fn(),
      setState: jest.fn(),
      isHealthy: jest.fn().mockReturnValue(true),
      getConfig: jest.fn().mockReturnValue(defaultConfig.circuitBreaker)
    } as any;

    (CircuitBreaker as jest.MockedClass<typeof CircuitBreaker>).mockImplementation(() => mockCircuitBreaker);
    
    retryManager = new RetryManager(defaultConfig);
  });

  describe('Initialization', () => {
    test('should initialize with correct configuration', () => {
      expect(retryManager.getConfig()).toEqual(defaultConfig);
      expect(CircuitBreaker).toHaveBeenCalledWith(defaultConfig.circuitBreaker);
    });

    test('should initialize circuit breaker', () => {
      expect(retryManager.getCircuitBreakerState()).toBe(CircuitState.CLOSED);
      expect(retryManager.isHealthy()).toBe(true);
    });
  });

  describe('Successful Operations', () => {
    test('should execute operation successfully without retries', async () => {
      const operation = jest.fn().mockResolvedValue('success');
      mockCircuitBreaker.execute.mockResolvedValue('success');

      const result = await retryManager.execute(operation, 'test-operation');

      expect(result.result).toBe('success');
      expect(result.attempts).toBe(1);
      expect(result.circuitBreakerTriggered).toBe(false);
      expect(mockCircuitBreaker.execute).toHaveBeenCalledWith(expect.any(Function), 'test-operation');
    });

    test('should return result with executeWithBackoff', async () => {
      const operation = jest.fn().mockResolvedValue('success');
      mockCircuitBreaker.execute.mockResolvedValue('success');

      const result = await retryManager.executeWithBackoff(operation, 'test-operation');

      expect(result).toBe('success');
    });
  });

  describe('Retry Disabled', () => {
    test('should execute once when retry is disabled', async () => {
      const disabledConfig = { ...defaultConfig, enabled: false };
      const disabledRetryManager = new RetryManager(disabledConfig);
      
      const operation = jest.fn().mockResolvedValue('success');

      const result = await disabledRetryManager.execute(operation, 'test-operation');

      expect(result.result).toBe('success');
      expect(result.attempts).toBe(1);
      expect(operation).toHaveBeenCalledTimes(1);
    });

    test('should throw error immediately when retry disabled and operation fails', async () => {
      const disabledConfig = { ...defaultConfig, enabled: false };
      const disabledRetryManager = new RetryManager(disabledConfig);
      
      const operation = jest.fn().mockRejectedValue(new Error('Operation failed'));

      await expect(disabledRetryManager.execute(operation, 'test-operation'))
        .rejects.toThrow('Operation failed');
      
      expect(operation).toHaveBeenCalledTimes(1);
    });
  });

  describe('Circuit Breaker Integration', () => {
    test('should handle circuit breaker open state', async () => {
      const operation = jest.fn().mockResolvedValue('success');
      mockCircuitBreaker.execute.mockRejectedValue(new Error('Circuit breaker is OPEN'));

      await expect(retryManager.execute(operation, 'test-operation'))
        .rejects.toThrow('Circuit breaker is OPEN');

      expect(mockCircuitBreaker.execute).toHaveBeenCalledTimes(1);
    });

    test('should report circuit breaker triggered in result', async () => {
      const operation = jest.fn().mockResolvedValue('success');
      mockCircuitBreaker.execute.mockRejectedValue(new Error('Circuit breaker is OPEN'));

      try {
        await retryManager.execute(operation, 'test-operation');
      } catch (error) {
        // Expected error
      }

      // Should have attempted to call circuit breaker
      expect(mockCircuitBreaker.execute).toHaveBeenCalled();
    });

    test('should reset circuit breaker', () => {
      retryManager.resetCircuitBreaker();
      expect(mockCircuitBreaker.reset).toHaveBeenCalled();
    });

    test('should get circuit breaker statistics', () => {
      const stats = retryManager.getCircuitBreakerStats();
      expect(mockCircuitBreaker.getStats).toHaveBeenCalled();
      expect(stats).toBeDefined();
    });
  });

  describe('Configuration Management', () => {
    test('should update configuration', () => {
      const updates = { maxAttempts: 5, minDelay: 2000 };
      
      retryManager.updateConfig(updates);
      
      const config = retryManager.getConfig();
      expect(config.maxAttempts).toBe(5);
      expect(config.minDelay).toBe(2000);
      expect(config.maxDelay).toBe(defaultConfig.maxDelay); // Unchanged
    });

    test('should preserve original config when updating', () => {
      const originalConfig = retryManager.getConfig();
      const updates = { maxAttempts: 10 };
      
      retryManager.updateConfig(updates);
      
      // Original config should be unchanged
      expect(originalConfig.maxAttempts).toBe(3);
      
      // New config should have updates
      const newConfig = retryManager.getConfig();
      expect(newConfig.maxAttempts).toBe(10);
    });
  });

  describe('Event Handlers', () => {
    test('should set event handlers', () => {
      const onRetry = jest.fn();
      const onSuccess = jest.fn();
      const onAbort = jest.fn();

      retryManager.setEventHandlers({
        onRetry,
        onSuccess,
        onAbort
      });

      // This test verifies the method doesn't throw
      expect(() => retryManager.setEventHandlers({})).not.toThrow();
    });

    test('should handle partial event handlers', () => {
      const onRetry = jest.fn();

      expect(() => retryManager.setEventHandlers({ onRetry })).not.toThrow();
    });
  });

  describe('Operation Wrapping', () => {
    test('should wrap operation for reuse', async () => {
      const operation = jest.fn().mockResolvedValue('success');
      mockCircuitBreaker.execute.mockResolvedValue('success');
      
      const wrappedOperation = retryManager.wrap(operation, 'wrapped-operation');
      
      const result1 = await wrappedOperation();
      const result2 = await wrappedOperation();
      
      expect(result1).toBe('success');
      expect(result2).toBe('success');
      expect(operation).toHaveBeenCalledTimes(2);
    });
  });

  describe('Multiple Operations', () => {
    test('should execute multiple operations successfully', async () => {
      const operations = [
        { operation: jest.fn().mockResolvedValue('result1'), name: 'op1' },
        { operation: jest.fn().mockResolvedValue('result2'), name: 'op2' },
        { operation: jest.fn().mockResolvedValue('result3'), name: 'op3' }
      ];

      mockCircuitBreaker.execute
        .mockResolvedValueOnce('result1')
        .mockResolvedValueOnce('result2')
        .mockResolvedValueOnce('result3');

      const results = await retryManager.executeAll(operations);

      expect(results).toHaveLength(3);
      expect(results[0]?.result).toBe('result1');
      expect(results[1]?.result).toBe('result2');
      expect(results[2]?.result).toBe('result3');
    });

    test('should stop on first failure with failFast option', async () => {
      const operations = [
        { operation: jest.fn().mockResolvedValue('result1'), name: 'op1' },
        { operation: jest.fn().mockRejectedValue(new Error('Failed')), name: 'op2' },
        { operation: jest.fn().mockResolvedValue('result3'), name: 'op3' }
      ];

      mockCircuitBreaker.execute
        .mockResolvedValueOnce('result1')
        .mockRejectedValueOnce(new Error('Failed'));

      await expect(retryManager.executeAll(operations, { failFast: true }))
        .rejects.toThrow('Failed');

      // Third operation should not be called
      expect(operations[2]?.operation).not.toHaveBeenCalled();
    });

    test('should handle concurrency limit', async () => {
      const operations = Array.from({ length: 5 }, (_, i) => ({
        operation: jest.fn().mockResolvedValue(`result${i}`),
        name: `op${i}`
      }));

      // Mock all operations to succeed
      operations.forEach((_, i) => {
        mockCircuitBreaker.execute.mockResolvedValueOnce(`result${i}`);
      });

      const results = await retryManager.executeAll(operations, { maxConcurrent: 2 });

      expect(results).toHaveLength(5);
      operations.forEach((_, i) => {
        expect(results[i]?.result).toBe(`result${i}`);
      });
    });
  });

  describe('Health Status', () => {
    test('should report healthy status when circuit breaker is healthy', () => {
      mockCircuitBreaker.isHealthy.mockReturnValue(true);
      
      expect(retryManager.isHealthy()).toBe(true);
    });

    test('should report unhealthy status when circuit breaker is unhealthy', () => {
      mockCircuitBreaker.isHealthy.mockReturnValue(false);
      
      expect(retryManager.isHealthy()).toBe(false);
    });
  });

  describe('Error Handling', () => {
    test('should handle synchronous errors in operations', async () => {
      const operation = () => {
        throw new Error('Sync error');
      };
      
      mockCircuitBreaker.execute.mockRejectedValue(new Error('Sync error'));

      await expect(retryManager.execute(operation, 'sync-error-operation'))
        .rejects.toThrow('Sync error');
    });

    test('should handle async errors in operations', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('Async error'));
      mockCircuitBreaker.execute.mockRejectedValue(new Error('Async error'));

      await expect(retryManager.execute(operation, 'async-error-operation'))
        .rejects.toThrow('Async error');
    });

    test('should handle null/undefined operation results', async () => {
      const operation = jest.fn().mockResolvedValue(null);
      mockCircuitBreaker.execute.mockResolvedValue(null);

      const result = await retryManager.execute(operation, 'null-result-operation');
      
      expect(result.result).toBeNull();
      expect(result.attempts).toBe(1);
    });
  });

  describe('Performance Considerations', () => {
    test('should handle many concurrent operations', async () => {
      const operations = Array.from({ length: 100 }, (_, i) => 
        jest.fn().mockResolvedValue(`result${i}`)
      );

      // Mock circuit breaker to resolve all operations
      operations.forEach((_, i) => {
        mockCircuitBreaker.execute.mockResolvedValueOnce(`result${i}`);
      });

      const startTime = Date.now();
      
      const promises = operations.map((op, i) => 
        retryManager.execute(op, `operation-${i}`)
      );
      
      const results = await Promise.all(promises);
      
      const duration = Date.now() - startTime;
      
      expect(results).toHaveLength(100);
      expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
      
      // All operations should have been called
      operations.forEach(op => {
        expect(op).toHaveBeenCalledTimes(1);
      });
    });
  });
});