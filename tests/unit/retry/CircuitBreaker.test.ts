/**
 * Unit tests for CircuitBreaker
 * Tests circuit breaker states, thresholds, and behavior
 */

import { CircuitBreaker, CircuitBreakerEvent } from '@/core/retry/CircuitBreaker';
import { CircuitBreakerState } from '@/core/retry/RetryConfig';

describe('CircuitBreaker', () => {
  let circuitBreaker: CircuitBreaker;
  const defaultConfig = {
    enabled: true,
    failureThreshold: 3,
    openTimeoutMs: 1000,
    successThreshold: 2,
    halfOpenTimeoutMs: 500,
    resetOnSuccess: true
  };

  beforeEach(() => {
    circuitBreaker = new CircuitBreaker(defaultConfig);
  });

  describe('initialization', () => {
    test('should start in CLOSED state', () => {
      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.CLOSED);
      expect(circuitBreaker.canExecute()).toBe(true);
    });

    test('should respect enabled/disabled configuration', () => {
      const disabledBreaker = new CircuitBreaker({ ...defaultConfig, enabled: false });
      expect(disabledBreaker.canExecute()).toBe(true); // Always allows when disabled
    });
  });

  describe('failure tracking', () => {
    test('should remain closed under failure threshold', () => {
      circuitBreaker.recordFailure(new Error('Test error 1'));
      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.CLOSED);
      expect(circuitBreaker.canExecute()).toBe(true);

      circuitBreaker.recordFailure(new Error('Test error 2'));
      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.CLOSED);
      expect(circuitBreaker.canExecute()).toBe(true);
    });

    test('should open when failure threshold is reached', () => {
      // Record failures up to threshold
      for (let i = 0; i < defaultConfig.failureThreshold; i++) {
        circuitBreaker.recordFailure(new Error(`Test error ${i + 1}`));
      }

      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.OPEN);
      expect(circuitBreaker.canExecute()).toBe(false);
    });

    test('should reset failure count on success when configured', () => {
      circuitBreaker.recordFailure(new Error('Test error 1'));
      circuitBreaker.recordFailure(new Error('Test error 2'));
      
      const stats = circuitBreaker.getStats();
      expect(stats.failureCount).toBe(2);

      circuitBreaker.recordSuccess();
      
      const statsAfterSuccess = circuitBreaker.getStats();
      expect(statsAfterSuccess.failureCount).toBe(0); // Reset on success
    });
  });

  describe('state transitions', () => {
    test('should transition from OPEN to HALF_OPEN after timeout', async () => {
      // Force circuit to open
      for (let i = 0; i < defaultConfig.failureThreshold; i++) {
        circuitBreaker.recordFailure(new Error(`Test error ${i + 1}`));
      }
      
      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.OPEN);
      expect(circuitBreaker.canExecute()).toBe(false);

      // Wait for timeout + buffer
      await new Promise(resolve => setTimeout(resolve, defaultConfig.openTimeoutMs + 100));

      // Should transition to half-open on next canExecute call
      expect(circuitBreaker.canExecute()).toBe(true);
      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.HALF_OPEN);
    });

    test('should transition from HALF_OPEN to CLOSED on success threshold', () => {
      // Get to half-open state
      for (let i = 0; i < defaultConfig.failureThreshold; i++) {
        circuitBreaker.recordFailure(new Error(`Test error ${i + 1}`));
      }
      circuitBreaker.transitionToHalfOpen(); // Force transition for testing

      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.HALF_OPEN);

      // Record successes up to threshold
      for (let i = 0; i < defaultConfig.successThreshold; i++) {
        circuitBreaker.recordSuccess();
      }

      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.CLOSED);
    });

    test('should transition from HALF_OPEN back to OPEN on failure', () => {
      // Get to half-open state
      for (let i = 0; i < defaultConfig.failureThreshold; i++) {
        circuitBreaker.recordFailure(new Error(`Test error ${i + 1}`));
      }
      circuitBreaker.transitionToHalfOpen(); // Force transition for testing

      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.HALF_OPEN);

      // Record a failure - should go back to open
      circuitBreaker.recordFailure(new Error('Half-open failure'));

      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.OPEN);
    });
  });

  describe('statistics', () => {
    test('should track accurate statistics', () => {
      circuitBreaker.recordSuccess();
      circuitBreaker.recordFailure(new Error('Test error'));
      circuitBreaker.recordSuccess();

      const stats = circuitBreaker.getStats();
      
      expect(stats.totalRequests).toBe(3);
      expect(stats.totalSuccesses).toBe(2);
      expect(stats.totalFailures).toBe(1);
      expect(stats.successCount).toBe(1); // Current window
      expect(stats.failureCount).toBe(1); // Current window
      expect(stats.state).toBe(CircuitBreakerState.CLOSED);
    });

    test('should include timing information', () => {
      const stats = circuitBreaker.getStats();
      
      expect(stats.lastClosedAt).toBeDefined();
      expect(stats.lastOpenedAt).toBeUndefined();
      expect(stats.lastHalfOpenAt).toBeUndefined();
    });
  });

  describe('events', () => {
    test('should emit state change events', () => {
      const events: any[] = [];
      
      circuitBreaker.addEventListener((event) => {
        events.push(event);
      });

      // Force state change
      for (let i = 0; i < defaultConfig.failureThreshold; i++) {
        circuitBreaker.recordFailure(new Error(`Test error ${i + 1}`));
      }

      const stateChangeEvents = events.filter(e => e.event === CircuitBreakerEvent.STATE_CHANGE);
      expect(stateChangeEvents).toHaveLength(1);
      expect(stateChangeEvents[0].state).toBe(CircuitBreakerState.OPEN);
    });

    test('should emit failure and success events', () => {
      const events: any[] = [];
      
      circuitBreaker.addEventListener((event) => {
        events.push(event);
      });

      circuitBreaker.recordSuccess();
      circuitBreaker.recordFailure(new Error('Test'));

      const successEvents = events.filter(e => e.event === CircuitBreakerEvent.SUCCESS_RECORDED);
      const failureEvents = events.filter(e => e.event === CircuitBreakerEvent.FAILURE_RECORDED);
      
      expect(successEvents).toHaveLength(1);
      expect(failureEvents).toHaveLength(1);
    });

    test('should emit request allowed/rejected events', () => {
      const events: any[] = [];
      
      circuitBreaker.addEventListener((event) => {
        events.push(event);
      });

      // Allow request in closed state
      circuitBreaker.canExecute();

      // Force open and try again
      for (let i = 0; i < defaultConfig.failureThreshold; i++) {
        circuitBreaker.recordFailure(new Error(`Test error ${i + 1}`));
      }
      circuitBreaker.canExecute();

      const allowedEvents = events.filter(e => e.event === CircuitBreakerEvent.REQUEST_ALLOWED);
      const rejectedEvents = events.filter(e => e.event === CircuitBreakerEvent.REQUEST_REJECTED);
      
      expect(allowedEvents).toHaveLength(1);
      expect(rejectedEvents).toHaveLength(1);
    });
  });

  describe('manual controls', () => {
    test('should allow manual reset', () => {
      // Force circuit to open
      for (let i = 0; i < defaultConfig.failureThreshold; i++) {
        circuitBreaker.recordFailure(new Error(`Test error ${i + 1}`));
      }
      
      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.OPEN);

      circuitBreaker.reset();
      
      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.CLOSED);
      expect(circuitBreaker.canExecute()).toBe(true);
      
      const stats = circuitBreaker.getStats();
      expect(stats.failureCount).toBe(0);
      expect(stats.successCount).toBe(0);
    });

    test('should allow manual force open', () => {
      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.CLOSED);

      circuitBreaker.forceOpen();
      
      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.OPEN);
      expect(circuitBreaker.canExecute()).toBe(false);
    });
  });

  describe('configuration updates', () => {
    test('should allow configuration updates', () => {
      const newConfig = {
        failureThreshold: 5,
        openTimeoutMs: 2000
      };

      circuitBreaker.updateConfig(newConfig);
      
      const stats = circuitBreaker.getStats();
      expect(stats.config.failureThreshold).toBe(5);
      expect(stats.config.openTimeoutMs).toBe(2000);
    });
  });

  describe('disabled circuit breaker', () => {
    test('should always allow requests when disabled', () => {
      const disabledBreaker = new CircuitBreaker({ ...defaultConfig, enabled: false });

      // Record many failures
      for (let i = 0; i < 10; i++) {
        disabledBreaker.recordFailure(new Error(`Test error ${i + 1}`));
      }

      // Should still allow requests
      expect(disabledBreaker.canExecute()).toBe(true);
      expect(disabledBreaker.isRequestAllowed()).toBe(true);
    });
  });

  describe('edge cases', () => {
    test('should handle zero thresholds gracefully', () => {
      const zeroThresholdBreaker = new CircuitBreaker({
        ...defaultConfig,
        failureThreshold: 0
      });

      // Should open immediately on any failure
      zeroThresholdBreaker.recordFailure(new Error('Test'));
      expect(zeroThresholdBreaker.getState()).toBe(CircuitBreakerState.OPEN);
    });

    test('should handle missing error object', () => {
      expect(() => {
        circuitBreaker.recordFailure(); // No error object
      }).not.toThrow();
    });

    test('should handle rapid state transitions', () => {
      // Rapid failure recording
      for (let i = 0; i < defaultConfig.failureThreshold * 2; i++) {
        circuitBreaker.recordFailure(new Error(`Rapid error ${i + 1}`));
      }

      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.OPEN);
    });
  });

  // Helper method for testing (accessing private method)
  describe('private method access for testing', () => {
    test('should provide access to transitionToHalfOpen for testing', () => {
      // This is a bit of a hack for testing, but necessary for state manipulation
      (circuitBreaker as any).transitionToHalfOpen();
      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.HALF_OPEN);
    });
  });
});