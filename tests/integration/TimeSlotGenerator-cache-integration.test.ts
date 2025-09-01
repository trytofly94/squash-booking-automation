/**
 * Integration tests for TimeSlotGenerator caching behavior
 * Tests the integration between TimeSlotGenerator and TimeSlotCache
 */

import { TimeSlotGenerator } from '../../src/core/TimeSlotGenerator';
import { TimeSlotCacheConfig, resetGlobalTimeSlotCache } from '../../src/utils/TimeSlotCache';
import type { TimePreference } from '../../src/types/booking.types';

describe('TimeSlotGenerator Cache Integration', () => {
  let generator: TimeSlotGenerator;
  let cacheConfig: TimeSlotCacheConfig;

  const testTimePreferences: TimePreference[] = [
    { startTime: '14:00', priority: 10, flexibility: 30 },
    { startTime: '15:00', priority: 8, flexibility: 60 },
    { startTime: '16:00', priority: 6, flexibility: 90 }
  ];

  beforeEach(() => {
    resetGlobalTimeSlotCache();
    cacheConfig = {
      enabled: true,
      maxSize: 50,
      ttlMs: 5000, // 5 seconds for testing
      debugMode: true,
      enableCacheWarming: true
    };
    generator = new TimeSlotGenerator(cacheConfig);
  });

  afterEach(() => {
    resetGlobalTimeSlotCache();
  });

  describe('Cache Integration Functionality', () => {
    it('should integrate cache seamlessly with time slot generation', () => {
      const targetTime = '14:00';
      const preferences = testTimePreferences;
      const fallbackRange = 120;

      // First call should populate cache
      const result1 = generator.generatePrioritizedTimeSlots(targetTime, preferences, fallbackRange);
      expect(result1.length).toBeGreaterThan(0);

      const metricsAfterFirst = generator.getCacheMetrics();
      expect(metricsAfterFirst.cacheSize).toBe(1);
      expect(metricsAfterFirst.cacheMisses).toBe(1);

      // Second call should use cache
      const result2 = generator.generatePrioritizedTimeSlots(targetTime, preferences, fallbackRange);
      expect(result2).toEqual(result1);

      const metricsAfterSecond = generator.getCacheMetrics();
      expect(metricsAfterSecond.cacheHits).toBe(1);
      expect(metricsAfterSecond.hitRate).toBe(0.5); // 1 hit out of 2 total queries
    });

    it('should maintain cache consistency across different parameter combinations', () => {
      const baseParams = {
        targetTime: '15:00',
        preferences: testTimePreferences,
        fallbackRange: 120
      };

      // Generate various combinations
      const combinations = [
        { ...baseParams },
        { ...baseParams, fallbackRange: 90 },
        { ...baseParams, preferences: [] },
        { ...baseParams, targetTime: '16:00' },
        { ...baseParams }, // Repeat first combination
      ];

      const results: any[] = [];
      combinations.forEach((combo, index) => {
        const result = generator.generatePrioritizedTimeSlots(
          combo.targetTime,
          combo.preferences,
          combo.fallbackRange
        );
        results.push({ index, result, combo });
      });

      const metrics = generator.getCacheMetrics();
      
      // Should have 4 unique cache entries (first combination repeated)
      expect(metrics.cacheSize).toBe(4);
      expect(metrics.cacheHits).toBe(1); // One repeat
      expect(metrics.cacheMisses).toBe(4); // Four unique combinations

      // Repeated combination should return identical results
      expect(results[4].result).toEqual(results[0].result);
    });

    it('should handle cache warming integration properly', async () => {
      const metricsBeforeWarming = generator.getCacheMetrics();
      expect(metricsBeforeWarming.cacheSize).toBe(0);

      // Perform cache warming
      await generator.warmCache();

      const metricsAfterWarming = generator.getCacheMetrics();
      expect(metricsAfterWarming.cacheSize).toBeGreaterThan(0);

      // Test that warmed entries are actually used
      const commonTime = '14:00';
      const result = generator.generatePrioritizedTimeSlots(commonTime, [], 120);
      
      expect(result.length).toBeGreaterThan(0);
      
      const finalMetrics = generator.getCacheMetrics();
      // Hit rate should be high if warming was effective
      expect(finalMetrics.hitRate).toBeGreaterThan(0);
    });

    it('should provide cache management interface', () => {
      // Generate some entries
      generator.generatePrioritizedTimeSlots('14:00', [], 120);
      generator.generatePrioritizedTimeSlots('15:00', [], 120);
      
      expect(generator.getCacheMetrics().cacheSize).toBe(2);

      // Test cache clearing
      generator.clearCache();
      expect(generator.getCacheMetrics().cacheSize).toBe(0);
    });

    it('should maintain backward compatibility when cache is disabled', () => {
      resetGlobalTimeSlotCache();
      const disabledCacheConfig: TimeSlotCacheConfig = {
        enabled: false,
        maxSize: 0,
        ttlMs: 0,
        debugMode: false,
        enableCacheWarming: false
      };

      const disabledGenerator = new TimeSlotGenerator(disabledCacheConfig);
      
      // Should work normally without caching
      const result1 = disabledGenerator.generatePrioritizedTimeSlots('14:00', testTimePreferences, 120);
      const result2 = disabledGenerator.generatePrioritizedTimeSlots('14:00', testTimePreferences, 120);

      expect(result1.length).toBeGreaterThan(0);
      expect(result2.length).toBeGreaterThan(0);
      expect(result1).toEqual(result2); // Should produce same results

      const metrics = disabledGenerator.getCacheMetrics();
      expect(metrics.totalQueries).toBe(0); // No cache tracking when disabled
    });
  });

  describe('Cache Performance Integration', () => {
    it('should demonstrate performance benefits in realistic scenarios', () => {
      const scenarios = [
        { time: '14:00', preferences: testTimePreferences, range: 120 },
        { time: '15:00', preferences: [], range: 90 },
        { time: '16:00', preferences: testTimePreferences, range: 120 },
        { time: '14:00', preferences: testTimePreferences, range: 120 }, // Repeat
        { time: '17:00', preferences: [], range: 60 },
        { time: '15:00', preferences: [], range: 90 }, // Repeat
      ];

      const executionTimes: number[] = [];

      scenarios.forEach((scenario, _index) => {
        const start = Date.now();
        const result = generator.generatePrioritizedTimeSlots(
          scenario.time,
          scenario.preferences,
          scenario.range
        );
        const end = Date.now();
        
        executionTimes.push(end - start);
        expect(result.length).toBeGreaterThan(0);
      });

      const metrics = generator.getCacheMetrics();
      
      // Should have cache hits for repeated scenarios
      expect(metrics.cacheHits).toBe(2);
      expect(metrics.cacheMisses).toBe(4);
      expect(metrics.hitRate).toBeCloseTo(0.33, 1); // 2/6 = 0.33

      // Cached calls should generally be faster
      const cachedCallTimes = [executionTimes[3], executionTimes[5]]; // Repeat calls
      const uncachedCallTimes = [executionTimes[0], executionTimes[1], executionTimes[2], executionTimes[4]];

      const avgCachedTime = cachedCallTimes.reduce((sum, time) => sum + time, 0) / cachedCallTimes.length;
      const avgUncachedTime = uncachedCallTimes.reduce((sum, time) => sum + time, 0) / uncachedCallTimes.length;

      // This is a performance indicator, not a strict requirement due to timing variability
      if (avgUncachedTime > 0) {
        const improvement = (avgUncachedTime / avgCachedTime);
        console.log(`Cache performance improvement: ${improvement.toFixed(2)}x`);
      }
    });

    it('should handle concurrent access patterns correctly', async () => {
      const concurrentCalls = Array.from({ length: 20 }, (_, i) => {
        const timeOffset = i % 4;
        const targetTime = `${14 + timeOffset}:00`;
        return Promise.resolve().then(() => {
          return generator.generatePrioritizedTimeSlots(targetTime, [], 120);
        });
      });

      const results = await Promise.all(concurrentCalls);
      
      // All calls should complete successfully
      results.forEach(result => {
        expect(result.length).toBeGreaterThan(0);
      });

      const metrics = generator.getCacheMetrics();
      expect(metrics.totalQueries).toBe(20);
      expect(metrics.cacheSize).toBeLessThanOrEqual(4); // Only 4 unique time targets
      expect(metrics.cacheHits).toBeGreaterThan(0); // Should have some cache hits
    });
  });

  describe('Cache Error Handling and Edge Cases', () => {
    it('should handle cache errors gracefully', () => {
      // Test with extreme parameters that might cause cache issues
      const extremePreferences: TimePreference[] = Array.from({ length: 100 }, (_, i) => ({
        startTime: `${10 + (i % 12)}:${String((i * 15) % 60).padStart(2, '0')}`,
        priority: i % 10,
        flexibility: i % 180
      }));

      // Should not throw errors even with extreme inputs
      expect(() => {
        generator.generatePrioritizedTimeSlots('14:00', extremePreferences, 480);
      }).not.toThrow();

      const metrics = generator.getCacheMetrics();
      expect(metrics.cacheSize).toBeGreaterThan(0);
    });

    it('should handle cache size limits correctly', () => {
      // Create generator with very small cache
      resetGlobalTimeSlotCache();
      const smallCacheConfig: TimeSlotCacheConfig = {
        enabled: true,
        maxSize: 3,
        ttlMs: 60000,
        debugMode: false,
        enableCacheWarming: false
      };
      const smallCacheGenerator = new TimeSlotGenerator(smallCacheConfig);

      // Generate more entries than cache can hold
      const times = ['14:00', '15:00', '16:00', '17:00', '18:00'];
      times.forEach(time => {
        smallCacheGenerator.generatePrioritizedTimeSlots(time, [], 120);
      });

      const metrics = smallCacheGenerator.getCacheMetrics();
      expect(metrics.cacheSize).toBe(3); // Should not exceed max size
      expect(metrics.lruEvictions).toBeGreaterThan(0); // Should have evicted some entries
    });

    it('should handle TTL expiration properly', async () => {
      // Use short TTL for testing
      resetGlobalTimeSlotCache();
      const shortTtlConfig: TimeSlotCacheConfig = {
        enabled: true,
        maxSize: 10,
        ttlMs: 100, // Very short TTL
        debugMode: false,
        enableCacheWarming: false
      };
      const shortTtlGenerator = new TimeSlotGenerator(shortTtlConfig);

      // Create cache entry
      shortTtlGenerator.generatePrioritizedTimeSlots('14:00', [], 120);
      expect(shortTtlGenerator.getCacheMetrics().cacheSize).toBe(1);

      // Wait for TTL expiration
      await new Promise(resolve => setTimeout(resolve, 150));

      // Access should trigger TTL cleanup
      shortTtlGenerator.generatePrioritizedTimeSlots('14:00', [], 120);

      const metrics = shortTtlGenerator.getCacheMetrics();
      expect(metrics.ttlEvictions).toBeGreaterThan(0);
    });

    it('should provide comprehensive cache status information', () => {
      // Generate diverse cache entries
      const testConfigurations = [
        { time: '14:00', prefs: [], range: 120 },
        { time: '15:00', prefs: testTimePreferences.slice(0, 1), range: 90 },
        { time: '16:00', prefs: testTimePreferences, range: 120 },
      ];

      testConfigurations.forEach(config => {
        generator.generatePrioritizedTimeSlots(config.time, config.prefs, config.range);
      });

      // Repeat some calls for cache hits
      generator.generatePrioritizedTimeSlots('14:00', [], 120);
      generator.generatePrioritizedTimeSlots('15:00', testTimePreferences.slice(0, 1), 90);

      const metrics = generator.getCacheMetrics();

      // Verify comprehensive metrics
      expect(typeof metrics.totalQueries).toBe('number');
      expect(typeof metrics.cacheHits).toBe('number');
      expect(typeof metrics.cacheMisses).toBe('number');
      expect(typeof metrics.hitRate).toBe('number');
      expect(typeof metrics.avgQueryTimeMs).toBe('number');
      expect(typeof metrics.cacheSize).toBe('number');
      expect(typeof metrics.memoryUsageMB).toBe('number');
      expect(Array.isArray(metrics.topHitKeys)).toBe(true);

      expect(metrics.totalQueries).toBe(5);
      expect(metrics.cacheHits).toBe(2);
      expect(metrics.cacheMisses).toBe(3);
      expect(metrics.hitRate).toBeCloseTo(0.4, 1);
      expect(metrics.cacheSize).toBe(3);

      // Test cache status logging (should not throw)
      expect(() => generator.logCacheStatus()).not.toThrow();
    });
  });

  describe('Environment Configuration Integration', () => {
    it('should respect environment variable configuration', () => {
      // Test with custom environment-style configuration
      const customConfig: TimeSlotCacheConfig = {
        enabled: true,
        maxSize: 25,
        ttlMs: 1800000, // 30 minutes
        debugMode: true,
        enableCacheWarming: false
      };

      resetGlobalTimeSlotCache();
      const customGenerator = new TimeSlotGenerator(customConfig);

      // Verify configuration was applied
      expect(customGenerator.isCacheEnabled()).toBe(true);

      // Generate some entries
      customGenerator.generatePrioritizedTimeSlots('14:00', [], 120);
      customGenerator.generatePrioritizedTimeSlots('15:00', [], 120);

      const metrics = customGenerator.getCacheMetrics();
      expect(metrics.cacheSize).toBe(2);

      // Test that debug mode doesn't interfere with functionality
      const result = customGenerator.generatePrioritizedTimeSlots('14:00', [], 120);
      expect(result.length).toBeGreaterThan(0);
      expect(metrics.cacheHits).toBe(0); // Should increment after this call
    });

    it('should handle configuration validation properly', () => {
      const invalidConfigs = [
        { ...cacheConfig, maxSize: -1 }, // Negative max size
        { ...cacheConfig, ttlMs: -1000 }, // Negative TTL
      ];

      invalidConfigs.forEach(invalidConfig => {
        resetGlobalTimeSlotCache();
        
        // Should not throw during construction, but may handle gracefully
        expect(() => new TimeSlotGenerator(invalidConfig)).not.toThrow();
      });
    });
  });
});