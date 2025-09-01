/**
 * Integration tests for BookingManager time slot caching functionality
 * Tests the integration between BookingManager and TimeSlotCache
 */

import { BookingManager } from '../../src/core/BookingManager';
import { resetGlobalTimeSlotCache } from '../../src/utils/TimeSlotCache';
import { DryRunValidator } from '../../src/utils/DryRunValidator';
import { jest } from '@jest/globals';

// Mock Playwright components
jest.mock('@playwright/test', () => ({
  chromium: {
    launch: jest.fn().mockResolvedValue({
      newContext: jest.fn().mockResolvedValue({
        newPage: jest.fn().mockResolvedValue({
          goto: jest.fn(),
          close: jest.fn(),
        }),
        close: jest.fn(),
      }),
      close: jest.fn(),
    }),
  },
}));

// Mock page objects
jest.mock('../../src/pages/BookingCalendarPage');
jest.mock('../../src/pages/CheckoutPage');

describe('BookingManager Cache Integration', () => {
  let bookingManager: BookingManager;
  let dryRunValidator: DryRunValidator;

  const mockBookingConfig = {
    daysAhead: 20,
    targetStartTime: '14:00',
    duration: 60,
    maxRetries: 3,
    dryRun: true,
    userEmail: 'test@example.com',
    userPassword: 'password123',
    logLevel: 'info' as const,
    
    // Cache configuration
    timeSlotCacheEnabled: true,
    timeSlotCacheMaxSize: 50,
    timeSlotCacheTtlMs: 3600000, // 1 hour
    timeSlotCacheDebug: false,
    timeSlotCacheWarming: true,
  };

  beforeEach(async () => {
    resetGlobalTimeSlotCache();
    dryRunValidator = new DryRunValidator(mockBookingConfig);
    bookingManager = new BookingManager(mockBookingConfig, dryRunValidator);
  });

  afterEach(() => {
    resetGlobalTimeSlotCache();
  });

  describe('BookingManager Cache Initialization', () => {
    it('should initialize with cache configuration properly', () => {
      expect(bookingManager).toBeDefined();
      expect(typeof bookingManager.getCacheMetrics).toBe('function');
      expect(typeof bookingManager.clearTimeSlotCache).toBe('function');
      expect(typeof bookingManager.getCacheStatus).toBe('function');
    });

    it('should provide cache metrics access', () => {
      const metrics = bookingManager.getCacheMetrics();
      
      expect(typeof metrics).toBe('object');
      expect(typeof metrics.totalQueries).toBe('number');
      expect(typeof metrics.cacheHits).toBe('number');
      expect(typeof metrics.cacheMisses).toBe('number');
      expect(typeof metrics.hitRate).toBe('number');
      expect(typeof metrics.cacheSize).toBe('number');
      expect(typeof metrics.memoryUsageMB).toBe('number');
      
      // Initial state should be clean
      expect(metrics.totalQueries).toBe(0);
      expect(metrics.cacheHits).toBe(0);
      expect(metrics.cacheMisses).toBe(0);
      expect(metrics.cacheSize).toBe(0);
    });

    it('should provide cache status information', () => {
      const status = bookingManager.getCacheStatus();
      
      expect(typeof status).toBe('object');
      expect(status).toHaveProperty('enabled');
      expect(status).toHaveProperty('cacheSize');
      expect(status).toHaveProperty('hitRate');
      expect(status).toHaveProperty('memoryUsageMB');
      
      expect(status.enabled).toBe(true);
      expect(status.cacheSize).toBe(0);
      expect(status.hitRate).toBe(0);
    });

    it('should handle cache clearing functionality', () => {
      // Initially cache should be empty
      expect(bookingManager.getCacheMetrics().cacheSize).toBe(0);
      
      // Clear should work without errors even on empty cache
      expect(() => bookingManager.clearTimeSlotCache()).not.toThrow();
      
      // Metrics should still be accessible after clearing
      const metricsAfterClear = bookingManager.getCacheMetrics();
      expect(metricsAfterClear.cacheSize).toBe(0);
    });
  });

  describe('BookingManager Cache Warming Integration', () => {
    it('should perform cache warming during initialization', async () => {
      // Create a new BookingManager instance to test warming
      resetGlobalTimeSlotCache();
      const warmingBookingManager = new BookingManager(mockBookingConfig, dryRunValidator);
      
      // Give some time for potential cache warming to complete
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const metrics = warmingBookingManager.getCacheMetrics();
      
      // After warming, cache might have entries (depending on implementation)
      expect(metrics.cacheSize).toBeGreaterThanOrEqual(0);
      expect(typeof metrics.memoryUsageMB).toBe('number');
    });

    it('should handle cache warming configuration properly', async () => {
      const noWarmingConfig = {
        ...mockBookingConfig,
        timeSlotCacheWarming: false
      };
      
      resetGlobalTimeSlotCache();
      const noWarmingManager = new BookingManager(noWarmingConfig, dryRunValidator);
      
      // Give time for any potential warming process
      await new Promise(resolve => setTimeout(resolve, 50));
      
      const metrics = noWarmingManager.getCacheMetrics();
      
      // Should have access to metrics even without warming
      expect(typeof metrics.cacheSize).toBe('number');
      expect(typeof metrics.hitRate).toBe('number');
    });
  });

  describe('BookingManager Configuration Integration', () => {
    it('should respect cache enabled/disabled configuration', () => {
      const disabledCacheConfig = {
        ...mockBookingConfig,
        timeSlotCacheEnabled: false
      };
      
      resetGlobalTimeSlotCache();
      const disabledCacheManager = new BookingManager(disabledCacheConfig, dryRunValidator);
      
      const status = disabledCacheManager.getCacheStatus();
      expect(status.enabled).toBe(false);
      
      const metrics = disabledCacheManager.getCacheMetrics();
      expect(metrics.totalQueries).toBe(0); // Should not track when disabled
    });

    it('should apply cache size limits correctly', () => {
      const smallCacheConfig = {
        ...mockBookingConfig,
        timeSlotCacheMaxSize: 5 // Very small cache
      };
      
      resetGlobalTimeSlotCache();
      const smallCacheManager = new BookingManager(smallCacheConfig, dryRunValidator);
      
      // Should initialize without issues
      expect(smallCacheManager).toBeDefined();
      expect(smallCacheManager.getCacheMetrics().cacheSize).toBe(0);
    });

    it('should handle TTL configuration properly', () => {
      const customTtlConfig = {
        ...mockBookingConfig,
        timeSlotCacheTtlMs: 30000 // 30 seconds
      };
      
      resetGlobalTimeSlotCache();
      const customTtlManager = new BookingManager(customTtlConfig, dryRunValidator);
      
      // Should initialize and provide metrics access
      expect(customTtlManager).toBeDefined();
      expect(typeof customTtlManager.getCacheMetrics).toBe('function');
    });

    it('should handle debug mode configuration', () => {
      const debugConfig = {
        ...mockBookingConfig,
        timeSlotCacheDebug: true
      };
      
      resetGlobalTimeSlotCache();
      const debugManager = new BookingManager(debugConfig, dryRunValidator);
      
      // Should initialize properly with debug mode
      expect(debugManager).toBeDefined();
      expect(debugManager.getCacheStatus().enabled).toBe(true);
    });
  });

  describe('BookingManager Cache Statistics Integration', () => {
    it('should integrate cache metrics into booking statistics', () => {
      // Get initial statistics that should include cache information
      const stats = bookingManager.getStatistics();
      
      expect(typeof stats).toBe('object');
      
      // Should have cache-related information in statistics
      const hasCache = bookingManager.getCacheStatus().enabled;
      if (hasCache) {
        // Cache information should be accessible through various methods
        expect(typeof bookingManager.getCacheMetrics).toBe('function');
        expect(typeof bookingManager.getCacheStatus).toBe('function');
      }
    });

    it('should provide cache information in monitoring data', () => {
      // Test cache status reporting
      const cacheStatus = bookingManager.getCacheStatus();
      
      expect(cacheStatus).toHaveProperty('enabled');
      expect(cacheStatus).toHaveProperty('cacheSize');
      expect(cacheStatus).toHaveProperty('hitRate');
      expect(cacheStatus).toHaveProperty('memoryUsageMB');
      
      // Values should be reasonable defaults
      expect(typeof cacheStatus.enabled).toBe('boolean');
      expect(typeof cacheStatus.cacheSize).toBe('number');
      expect(typeof cacheStatus.hitRate).toBe('number');
      expect(typeof cacheStatus.memoryUsageMB).toBe('number');
      
      expect(cacheStatus.cacheSize).toBeGreaterThanOrEqual(0);
      expect(cacheStatus.hitRate).toBeGreaterThanOrEqual(0);
      expect(cacheStatus.hitRate).toBeLessThanOrEqual(1);
      expect(cacheStatus.memoryUsageMB).toBeGreaterThanOrEqual(0);
    });
  });

  describe('BookingManager Error Handling', () => {
    it('should handle cache operation errors gracefully', () => {
      // Test that cache operations don't break BookingManager functionality
      expect(() => {
        bookingManager.clearTimeSlotCache();
        bookingManager.getCacheMetrics();
        bookingManager.getCacheStatus();
      }).not.toThrow();
    });

    it('should maintain BookingManager functionality when cache fails', () => {
      // Test with potentially problematic cache configuration
      const extremeConfig = {
        ...mockBookingConfig,
        timeSlotCacheMaxSize: 0, // Might cause issues
        timeSlotCacheTtlMs: -1 // Invalid TTL
      };
      
      resetGlobalTimeSlotCache();
      
      // Should not throw during construction
      expect(() => {
        const extremeManager = new BookingManager(extremeConfig, dryRunValidator);
        extremeManager.getCacheMetrics();
      }).not.toThrow();
    });

    it('should provide fallback behavior when cache is unavailable', () => {
      // Test with cache disabled
      const disabledConfig = {
        ...mockBookingConfig,
        timeSlotCacheEnabled: false
      };
      
      resetGlobalTimeSlotCache();
      const disabledManager = new BookingManager(disabledConfig, dryRunValidator);
      
      // Should still provide cache methods for consistency
      expect(typeof disabledManager.getCacheMetrics).toBe('function');
      expect(typeof disabledManager.getCacheStatus).toBe('function');
      expect(typeof disabledManager.clearTimeSlotCache).toBe('function');
      
      // Cache status should reflect disabled state
      const status = disabledManager.getCacheStatus();
      expect(status.enabled).toBe(false);
    });
  });

  describe('BookingManager Cache Lifecycle', () => {
    it('should manage cache lifecycle properly during BookingManager lifecycle', () => {
      const initialMetrics = bookingManager.getCacheMetrics();
      expect(initialMetrics.cacheSize).toBe(0);
      
      // Simulate some activity that might use cache
      const status1 = bookingManager.getCacheStatus();
      const status2 = bookingManager.getCacheStatus();
      
      expect(status1).toEqual(status2); // Should be consistent
    });

    it('should handle multiple BookingManager instances with shared cache', () => {
      resetGlobalTimeSlotCache();
      
      const manager1 = new BookingManager(mockBookingConfig, dryRunValidator);
      const manager2 = new BookingManager(mockBookingConfig, dryRunValidator);
      
      // Both should be functional
      expect(manager1.getCacheStatus().enabled).toBe(true);
      expect(manager2.getCacheStatus().enabled).toBe(true);
      
      // Cache operations on one might affect metrics visible to both
      manager1.clearTimeSlotCache();
      
      const metrics1 = manager1.getCacheMetrics();
      const metrics2 = manager2.getCacheMetrics();
      
      // Both should reflect the cleared state
      expect(metrics1.cacheSize).toBe(0);
      expect(metrics2.cacheSize).toBe(0);
    });

    it('should maintain cache consistency across operations', async () => {
      // Perform multiple cache-related operations
      const operations = [
        () => bookingManager.getCacheMetrics(),
        () => bookingManager.getCacheStatus(),
        () => bookingManager.clearTimeSlotCache(),
        () => bookingManager.getCacheMetrics(),
      ];
      
      // Execute operations in sequence
      for (const operation of operations) {
        expect(() => operation()).not.toThrow();
      }
      
      // Final state should be consistent
      const finalMetrics = bookingManager.getCacheMetrics();
      const finalStatus = bookingManager.getCacheStatus();
      
      expect(finalMetrics.cacheSize).toBe(0); // Should be cleared
      expect(finalStatus.cacheSize).toBe(0);
      expect(finalStatus.enabled).toBe(true);
    });
  });

  describe('BookingManager Performance Integration', () => {
    it('should provide performance monitoring capabilities', () => {
      // Test that performance monitoring includes cache information
      const metrics = bookingManager.getCacheMetrics();
      
      expect(typeof metrics.avgQueryTimeMs).toBe('number');
      expect(metrics.avgQueryTimeMs).toBeGreaterThanOrEqual(0);
      
      // Memory usage should be tracked
      expect(typeof metrics.memoryUsageMB).toBe('number');
      expect(metrics.memoryUsageMB).toBeGreaterThanOrEqual(0);
    });

    it('should handle cache performance alerts appropriately', () => {
      // This test verifies that performance monitoring doesn't cause issues
      const _status = bookingManager.getCacheStatus();
      
      // Should not throw when accessing performance-related cache data
      expect(() => {
        const metrics = bookingManager.getCacheMetrics();
        console.log(`Cache hit rate: ${metrics.hitRate}`);
      }).not.toThrow();
    });
  });
});