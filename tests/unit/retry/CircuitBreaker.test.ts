/**
 * Unit tests for CircuitBreaker implementation
 */

import { CircuitBreaker } from '../../../src/core/retry/CircuitBreaker';
import { CircuitState, CircuitBreakerConfig } from '../../../src/types/retry.types';

describe('CircuitBreaker', () => {
  let circuitBreaker: CircuitBreaker;
  
  const defaultConfig: CircuitBreakerConfig = {
    failureThreshold: 3,
    recoveryTimeout: 5000,
    requestVolumeThreshold: 5,
    rollingWindow: 10000,
    successThreshold: 2
  };

  beforeEach(() => {
    circuitBreaker = new CircuitBreaker(defaultConfig);
  });

  describe('Initial State', () => {
    test('should start in CLOSED state', () => {
      expect(circuitBreaker.getState()).toBe(CircuitState.CLOSED);
    });

    test('should be healthy initially', () => {
      expect(circuitBreaker.isHealthy()).toBe(true);
    });

    test('should return correct configuration', () => {
      expect(circuitBreaker.getConfig()).toEqual(defaultConfig);
    });

    test('should have empty statistics initially', () => {
      const stats = circuitBreaker.getStats();
      expect(stats.totalRequests).toBe(0);
      expect(stats.successfulRequests).toBe(0);
      expect(stats.failedRequests).toBe(0);
      expect(stats.failureRate).toBe(0);
      expect(stats.currentState).toBe(CircuitState.CLOSED);
      expect(stats.consecutiveFailures).toBe(0);
    });
  });

  describe('Successful Operations', () => {
    test('should execute successful operation', async () => {
      const operation = jest.fn().mockResolvedValue('success');
      const result = await circuitBreaker.execute(operation, 'test-operation');
      
      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(1);
      expect(circuitBreaker.getState()).toBe(CircuitState.CLOSED);
    });

    test('should track successful requests in statistics', async () => {
      const operation = jest.fn().mockResolvedValue('success');
      
      await circuitBreaker.execute(operation, 'test-operation');
      await circuitBreaker.execute(operation, 'test-operation');
      
      const stats = circuitBreaker.getStats();
      expect(stats.totalRequests).toBe(2);
      expect(stats.successfulRequests).toBe(2);
      expect(stats.failedRequests).toBe(0);
      expect(stats.failureRate).toBe(0);
    });
  });

  describe('Failed Operations', () => {
    test('should handle single failure', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('Test error'));
      
      await expect(circuitBreaker.execute(operation, 'test-operation'))
        .rejects.toThrow('Test error');
      
      expect(circuitBreaker.getState()).toBe(CircuitState.CLOSED);
      
      const stats = circuitBreaker.getStats();
      expect(stats.totalRequests).toBe(1);
      expect(stats.failedRequests).toBe(1);
      expect(stats.consecutiveFailures).toBe(1);
    });

    test('should open circuit after exceeding failure threshold', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('Test error'));
      
      // Execute enough requests to meet volume threshold
      for (let i = 0; i < defaultConfig.requestVolumeThreshold; i++) {
        try {
          await circuitBreaker.execute(operation, 'test-operation');
        } catch {
          // Expected failures
        }
      }
      
      expect(circuitBreaker.getState()).toBe(CircuitState.OPEN);
      expect(circuitBreaker.isHealthy()).toBe(false);
    });

    test('should reject requests when circuit is open', async () => {
      // Force circuit to open state
      circuitBreaker.setState(CircuitState.OPEN);
      
      const operation = jest.fn().mockResolvedValue('success');
      
      await expect(circuitBreaker.execute(operation, 'test-operation'))
        .rejects.toThrow('Circuit breaker is OPEN');
      
      expect(operation).not.toHaveBeenCalled();
    });
  });

  describe('Recovery Logic', () => {
    test('should transition to HALF_OPEN after recovery timeout', async () => {
      // Open the circuit
      circuitBreaker.setState(CircuitState.OPEN);
      
      // Mock time passage
      const originalNow = Date.now;
      const baseTime = 1000000000;
      Date.now = jest.fn().mockReturnValue(baseTime);
      
      // Set last failure time to allow recovery
      const operation = jest.fn().mockResolvedValue('success');
      Date.now = jest.fn().mockReturnValue(baseTime + defaultConfig.recoveryTimeout + 1000);
      
      await circuitBreaker.execute(operation, 'test-operation');
      
      expect(circuitBreaker.getState()).toBe(CircuitState.CLOSED);
      expect(operation).toHaveBeenCalledTimes(1);
      
      // Restore original Date.now
      Date.now = originalNow;
    });

    test('should close circuit after successful requests in HALF_OPEN state', async () => {
      circuitBreaker.setState(CircuitState.HALF_OPEN);
      
      const operation = jest.fn().mockResolvedValue('success');
      
      // Execute success threshold number of requests
      for (let i = 0; i < defaultConfig.successThreshold; i++) {
        await circuitBreaker.execute(operation, 'test-operation');
      }
      
      expect(circuitBreaker.getState()).toBe(CircuitState.CLOSED);
      expect(operation).toHaveBeenCalledTimes(defaultConfig.successThreshold);
    });

    test('should reopen circuit on failure in HALF_OPEN state', async () => {
      circuitBreaker.setState(CircuitState.HALF_OPEN);
      
      const operation = jest.fn().mockRejectedValue(new Error('Test error'));
      
      await expect(circuitBreaker.execute(operation, 'test-operation'))
        .rejects.toThrow('Test error');
      
      expect(circuitBreaker.getState()).toBe(CircuitState.OPEN);
    });
  });

  describe('Rolling Window Statistics', () => {
    test('should maintain rolling window of requests', async () => {
      const originalNow = Date.now;
      let currentTime = 1000000000;
      Date.now = jest.fn(() => currentTime);
      
      const operation = jest.fn().mockResolvedValue('success');
      
      // Add some successful requests
      await circuitBreaker.execute(operation, 'test-operation');
      currentTime += 1000;
      await circuitBreaker.execute(operation, 'test-operation');
      
      let stats = circuitBreaker.getStats();
      expect(stats.totalRequests).toBe(2);
      
      // Move beyond rolling window
      currentTime += defaultConfig.rollingWindow + 1000;
      
      // Add another request - old ones should be excluded
      await circuitBreaker.execute(operation, 'test-operation');
      
      stats = circuitBreaker.getStats();
      expect(stats.totalRequests).toBe(1); // Only the latest request within window
      
      Date.now = originalNow;
    });

    test('should calculate failure rate correctly within rolling window', async () => {
      const successOp = jest.fn().mockResolvedValue('success');
      const failOp = jest.fn().mockRejectedValue(new Error('Test error'));
      
      // 3 successes, 2 failures = 40% failure rate
      await circuitBreaker.execute(successOp, 'test-operation');
      await circuitBreaker.execute(successOp, 'test-operation');
      await circuitBreaker.execute(successOp, 'test-operation');
      
      try {
        await circuitBreaker.execute(failOp, 'test-operation');
      } catch {
        // Expected
      }
      
      try {
        await circuitBreaker.execute(failOp, 'test-operation');
      } catch {
        // Expected
      }
      
      const stats = circuitBreaker.getStats();
      expect(stats.totalRequests).toBe(5);
      expect(stats.successfulRequests).toBe(3);
      expect(stats.failedRequests).toBe(2);
      expect(stats.failureRate).toBe(0.4);
    });
  });

  describe('Circuit Breaker Reset', () => {
    test('should reset to initial state', async () => {
      // Execute some operations and open circuit
      circuitBreaker.setState(CircuitState.OPEN);
      
      const operation = jest.fn().mockRejectedValue(new Error('Test error'));
      try {
        await circuitBreaker.execute(operation, 'test-operation');
      } catch {
        // Expected
      }
      
      // Reset circuit breaker
      circuitBreaker.reset();
      
      expect(circuitBreaker.getState()).toBe(CircuitState.CLOSED);
      expect(circuitBreaker.isHealthy()).toBe(true);
      
      const stats = circuitBreaker.getStats();
      expect(stats.totalRequests).toBe(0);
      expect(stats.consecutiveFailures).toBe(0);
    });
  });

  describe('Error Scenarios', () => {
    test('should handle operation timeout', async () => {
      const timeoutOperation = () => new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Operation timeout')), 100);
      });
      
      await expect(circuitBreaker.execute(timeoutOperation, 'timeout-operation'))
        .rejects.toThrow('Operation timeout');
    });

    test('should handle synchronous operation errors', async () => {
      const syncErrorOperation = () => {
        throw new Error('Synchronous error');
      };
      
      await expect(circuitBreaker.execute(syncErrorOperation, 'sync-error'))
        .rejects.toThrow('Synchronous error');
    });
  });

  describe('Configuration Validation', () => {
    test('should work with minimal configuration', () => {
      const minimalConfig: CircuitBreakerConfig = {
        failureThreshold: 1,
        recoveryTimeout: 1000,
        requestVolumeThreshold: 1,
        rollingWindow: 1000,
        successThreshold: 1
      };
      
      const cb = new CircuitBreaker(minimalConfig);
      expect(cb.getConfig()).toEqual(minimalConfig);
    });

    test('should work with high thresholds', () => {
      const highConfig: CircuitBreakerConfig = {
        failureThreshold: 100,
        recoveryTimeout: 300000,
        requestVolumeThreshold: 1000,
        rollingWindow: 600000,
        successThreshold: 10
      };
      
      const cb = new CircuitBreaker(highConfig);
      expect(cb.getState()).toBe(CircuitState.CLOSED);
    });
  });

  describe('Performance Considerations', () => {
    test('should handle many operations efficiently', async () => {
      const operation = jest.fn().mockResolvedValue('success');
      
      const start = Date.now();
      
      // Execute 1000 successful operations
      const promises = [];
      for (let i = 0; i < 1000; i++) {
        promises.push(circuitBreaker.execute(operation, 'perf-test'));
      }
      
      await Promise.all(promises);
      
      const duration = Date.now() - start;
      expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
      expect(operation).toHaveBeenCalledTimes(1000);
      
      const stats = circuitBreaker.getStats();
      expect(stats.successfulRequests).toBe(1000);
    });
  });
});