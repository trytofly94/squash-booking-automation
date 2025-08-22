/**
 * Integration tests for BookingManager with RetryManager
 * Tests the complete retry functionality in the booking workflow
 */

import { test, expect, Page } from '@playwright/test';
import { BookingManager } from '@/core/BookingManager';
import { RetryConfigFactory } from '@/core/retry/RetryConfig';

// Mock the retry system for controlled testing
jest.mock('@/core/retry/RetryManager');

describe('BookingManager Retry Integration', () => {
  let page: Page;
  let bookingManager: BookingManager;

  beforeEach(async () => {
    // Create a mock page object for testing
    page = {
      goto: jest.fn(),
      waitForLoadState: jest.fn(),
      $: jest.fn(),
      click: jest.fn(),
      fill: jest.fn(),
      keyboard: { press: jest.fn() },
      waitForTimeout: jest.fn()
    } as any;

    // Create BookingManager with test configuration
    const testConfig = {
      daysAhead: 1,
      targetStartTime: '14:00',
      duration: 60,
      maxRetries: 3,
      dryRun: true,
      timezone: 'Europe/Berlin',
      preferredCourts: ['1', '2', '3'],
      enablePatternLearning: false,
      fallbackTimeRange: 60,
      courtScoringWeights: {
        availability: 0.4,
        historical: 0.3,
        preference: 0.2,
        position: 0.1
      },
      timePreferences: [
        { startTime: '14:00', priority: 10, flexibility: 30 }
      ]
    };

    bookingManager = new BookingManager(page, testConfig);
  });

  describe('retry integration in booking flow', () => {
    test('should retry navigation failures with RetryManager', async () => {
      // Mock navigation to fail twice, then succeed
      (page.goto as jest.Mock)
        .mockRejectedValueOnce(new Error('Network timeout'))
        .mockRejectedValueOnce(new Error('Connection reset'))
        .mockResolvedValueOnce(undefined);

      (page.waitForLoadState as jest.Mock).mockResolvedValue(undefined);
      (page.$$ as jest.Mock) = jest.fn().mockResolvedValue([]);

      // Should succeed after retries
      const result = await bookingManager.executeBooking();
      
      expect(result.success).toBe(true);
      expect(result.retryAttempts).toBeGreaterThan(1);
      expect(page.goto).toHaveBeenCalledTimes(3); // Two failures + one success
    });

    test('should handle circuit breaker activation', async () => {
      // Get the retry manager instance
      const retryManager = bookingManager.getRetryManager();
      
      // Force circuit breaker to open
      retryManager.forceCircuitBreakerOpen();
      
      expect(retryManager.getCircuitBreakerState()).toBe('OPEN');
      expect(bookingManager.isRetrySystemHealthy()).toBe(false);

      // Booking should fail fast due to circuit breaker
      const result = await bookingManager.executeBooking();
      
      expect(result.success).toBe(false);
      expect(result.circuitBreakerTripped).toBe(true);
    });

    test('should reset circuit breaker manually', async () => {
      const retryManager = bookingManager.getRetryManager();
      
      // Open circuit breaker
      retryManager.forceCircuitBreakerOpen();
      expect(retryManager.getCircuitBreakerState()).toBe('OPEN');
      
      // Reset via BookingManager
      bookingManager.resetCircuitBreaker();
      expect(retryManager.getCircuitBreakerState()).toBe('CLOSED');
      expect(bookingManager.isRetrySystemHealthy()).toBe(true);
    });

    test('should provide detailed retry statistics', async () => {
      const stats = bookingManager.getBookingStats();
      
      expect(stats.retryStats).toBeDefined();
      expect(stats.retryStats.config).toBeDefined();
      expect(stats.retryStats.circuitBreaker).toBeDefined();
      expect(stats.retryStats.isEnabled).toBeDefined();
    });

    test('should handle slot search retries', async () => {
      // Mock slot search to fail initially
      const mockSlotSearcher = {
        searchAvailableSlots: jest.fn()
          .mockRejectedValueOnce(new Error('Slot search timeout'))
          .mockResolvedValueOnce({
            availableCourts: ['1'],
            availablePairs: [
              {
                courtId: '1',
                slot1: { date: '2025-08-23', startTime: '14:00', courtId: '1', isAvailable: true },
                slot2: { date: '2025-08-23', startTime: '14:30', courtId: '1', isAvailable: true }
              }
            ]
          })
      };

      // Mock the SlotSearcher constructor
      jest.doMock('@/core/SlotSearcher', () => {
        return {
          SlotSearcher: jest.fn().mockImplementation(() => mockSlotSearcher)
        };
      });

      (page.goto as jest.Mock).mockResolvedValue(undefined);
      (page.waitForLoadState as jest.Mock).mockResolvedValue(undefined);
      (page.$) = jest.fn().mockResolvedValue(null);

      const result = await bookingManager.executeBooking();
      
      expect(result.success).toBe(true);
      expect(mockSlotSearcher.searchAvailableSlots).toHaveBeenCalledTimes(2);
    });

    test('should handle booking execution retries', async () => {
      // Mock successful navigation and slot search
      (page.goto as jest.Mock).mockResolvedValue(undefined);
      (page.waitForLoadState as jest.Mock).mockResolvedValue(undefined);
      (page.$) = jest.fn().mockResolvedValue(null);

      // Mock slot search success
      jest.doMock('@/core/SlotSearcher', () => {
        return {
          SlotSearcher: jest.fn().mockImplementation(() => ({
            searchAvailableSlots: jest.fn().mockResolvedValue({
              availableCourts: ['1'],
              availablePairs: [
                {
                  courtId: '1',
                  slot1: { 
                    date: '2025-08-23', 
                    startTime: '14:00', 
                    courtId: '1', 
                    isAvailable: true,
                    elementSelector: '.slot-1'
                  },
                  slot2: { 
                    date: '2025-08-23', 
                    startTime: '14:30', 
                    courtId: '1', 
                    isAvailable: true,
                    elementSelector: '.slot-2'
                  }
                }
              ]
            })
          }))
        };
      });

      // Mock booking execution to fail once then succeed
      (page.click as jest.Mock)
        .mockRejectedValueOnce(new Error('Element not clickable'))
        .mockResolvedValue(undefined);

      const result = await bookingManager.executeBooking();
      
      expect(result.success).toBe(true);
      expect(result.retryAttempts).toBeGreaterThan(1);
    });

    test('should handle different error types with appropriate strategies', async () => {
      const retryManager = bookingManager.getRetryManager();
      
      // Test that different operations get different retry behavior
      const networkErrorOperation = async () => {
        throw new Error('ECONNREFUSED - network error');
      };
      
      const timeoutErrorOperation = async () => {
        throw new Error('timeout exceeded');
      };
      
      const rateLimitErrorOperation = async () => {
        throw new Error('429 Too Many Requests');
      };

      // Each should use different strategies with different delays
      const networkResult = await retryManager.execute(networkErrorOperation, {
        operation: 'network-test'
      });
      
      const timeoutResult = await retryManager.execute(timeoutErrorOperation, {
        operation: 'timeout-test'
      });
      
      const rateLimitResult = await retryManager.execute(rateLimitErrorOperation, {
        operation: 'rate-limit-test'
      });

      expect(networkResult.success).toBe(false);
      expect(timeoutResult.success).toBe(false);
      expect(rateLimitResult.success).toBe(false);

      // Rate limit errors should have longer total time due to longer delays
      expect(rateLimitResult.totalTimeMs).toBeGreaterThan(networkResult.totalTimeMs);
    });
  });

  describe('retry system configuration', () => {
    test('should respect disabled retry system', async () => {
      // Create BookingManager with disabled retry system
      process.env['RETRY_ENABLED'] = 'false';
      
      const disabledRetryManager = new BookingManager(page, {
        dryRun: true,
        daysAhead: 1,
        targetStartTime: '14:00',
        duration: 60,
        maxRetries: 3
      });

      // Mock operation that would normally be retried
      (page.goto as jest.Mock).mockRejectedValue(new Error('Network failure'));

      const result = await disabledRetryManager.executeBooking();
      
      expect(result.success).toBe(false);
      expect(result.retryAttempts).toBe(1); // No retries when disabled
      expect(page.goto).toHaveBeenCalledTimes(1);

      // Clean up
      delete process.env['RETRY_ENABLED'];
    });

    test('should use custom retry configuration from environment', () => {
      // Set custom environment variables
      process.env['RETRY_MAX_ATTEMPTS'] = '5';
      process.env['RETRY_INITIAL_DELAY'] = '2000';
      process.env['CIRCUIT_BREAKER_THRESHOLD'] = '2';

      const customConfigManager = new BookingManager(page, { dryRun: true });
      const stats = customConfigManager.getBookingStats();
      
      expect(stats.retryStats.config.global.defaultMaxAttempts).toBe(5);
      expect(stats.retryStats.config.global.defaultInitialDelay).toBe(2000);
      expect(stats.retryStats.config.circuitBreaker.failureThreshold).toBe(2);

      // Clean up
      delete process.env['RETRY_MAX_ATTEMPTS'];
      delete process.env['RETRY_INITIAL_DELAY'];
      delete process.env['CIRCUIT_BREAKER_THRESHOLD'];
    });
  });

  describe('error scenarios and edge cases', () => {
    test('should handle retry system internal errors gracefully', async () => {
      // Mock RetryManager to throw an internal error
      const retryManager = bookingManager.getRetryManager();
      const originalExecute = retryManager.execute;
      
      retryManager.execute = jest.fn().mockRejectedValue(
        new Error('RetryManager internal error')
      );

      const result = await bookingManager.executeBooking();
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('RetryManager internal error');

      // Restore original method
      retryManager.execute = originalExecute;
    });

    test('should provide retry details in booking result', async () => {
      // Mock operations to fail and require retries
      (page.goto as jest.Mock)
        .mockRejectedValueOnce(new Error('First failure'))
        .mockRejectedValueOnce(new Error('Second failure'))
        .mockResolvedValueOnce(undefined);

      (page.waitForLoadState as jest.Mock).mockResolvedValue(undefined);
      (page.$) = jest.fn().mockResolvedValue(null);

      const result = await bookingManager.executeBooking();
      
      expect(result.success).toBe(true);
      expect(result.retryDetails).toBeDefined();
      expect(result.retryDetails).toHaveLength(2); // Two failed attempts
      
      if (result.retryDetails) {
        expect(result.retryDetails[0].error).toContain('First failure');
        expect(result.retryDetails[1].error).toContain('Second failure');
        expect(result.retryDetails[0].attemptNumber).toBe(1);
        expect(result.retryDetails[1].attemptNumber).toBe(2);
      }
    });

    test('should handle concurrent booking attempts safely', async () => {
      // Simulate multiple concurrent booking attempts
      const bookingPromises = [];
      
      for (let i = 0; i < 3; i++) {
        const promise = bookingManager.executeBooking();
        bookingPromises.push(promise);
      }

      const results = await Promise.allSettled(bookingPromises);
      
      // All should complete without throwing unhandled errors
      results.forEach(result => {
        expect(result.status).toBe('fulfilled');
      });
    });
  });

  describe('performance and monitoring', () => {
    test('should track retry performance metrics', async () => {
      const initialStats = bookingManager.getBookingStats();
      const initialCircuitBreakerStats = initialStats.retryStats.circuitBreaker;
      
      // Perform some operations
      await bookingManager.executeBooking();
      
      const finalStats = bookingManager.getBookingStats();
      const finalCircuitBreakerStats = finalStats.retryStats.circuitBreaker;
      
      // Should track requests
      expect(finalCircuitBreakerStats.totalRequests)
        .toBeGreaterThanOrEqual(initialCircuitBreakerStats.totalRequests);
    });

    test('should provide circuit breaker health status', () => {
      expect(bookingManager.isRetrySystemHealthy()).toBe(true);
      
      // Force unhealthy state
      bookingManager.getRetryManager().forceCircuitBreakerOpen();
      expect(bookingManager.isRetrySystemHealthy()).toBe(false);
      
      // Reset to healthy
      bookingManager.resetCircuitBreaker();
      expect(bookingManager.isRetrySystemHealthy()).toBe(true);
    });
  });
});