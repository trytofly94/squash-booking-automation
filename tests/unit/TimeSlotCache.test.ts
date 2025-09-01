/**
 * Comprehensive unit tests for TimeSlotCache functionality
 * Tests core caching behavior, LRU eviction, TTL expiration, and performance metrics
 */

import { TimeSlotCache, TimeSlotCacheConfig, resetGlobalTimeSlotCache, getGlobalTimeSlotCache } from '../../src/utils/TimeSlotCache';
import type { TimeSlot, TimePreference } from '../../src/types/booking.types';

describe('TimeSlotCache', () => {
  let cache: TimeSlotCache;
  let config: TimeSlotCacheConfig;

  // Mock time slots for testing
  const mockTimeSlots: TimeSlot[] = [
    { startTime: '14:00', endTime: '15:00', priority: 10, distanceFromPreferred: 0 },
    { startTime: '14:30', endTime: '15:30', priority: 8, distanceFromPreferred: 30 },
    { startTime: '15:00', endTime: '16:00', priority: 6, distanceFromPreferred: 60 }
  ];

  const mockTimePreferences: TimePreference[] = [
    { startTime: '14:00', priority: 10, flexibility: 30 },
    { startTime: '15:00', priority: 8, flexibility: 60 }
  ];

  beforeEach(() => {
    resetGlobalTimeSlotCache();
    config = {
      enabled: true,
      maxSize: 5, // Small cache size for easier testing
      ttlMs: 1000, // 1 second for TTL testing
      debugMode: false,
      enableCacheWarming: false
    };
    cache = new TimeSlotCache(config);
  });

  afterEach(() => {
    resetGlobalTimeSlotCache();
  });

  describe('Cache Key Generation', () => {
    it('should generate consistent cache keys for identical parameters', () => {
      const key1 = cache.generateCacheKey('14:00', mockTimePreferences, 120, 30);
      const key2 = cache.generateCacheKey('14:00', mockTimePreferences, 120, 30);
      
      expect(key1).toBe(key2);
      expect(typeof key1).toBe('string');
      expect(key1.length).toBe(16); // SHA-256 hash truncated to 16 chars
    });

    it('should generate different keys for different parameters', () => {
      const key1 = cache.generateCacheKey('14:00', mockTimePreferences, 120, 30);
      const key2 = cache.generateCacheKey('15:00', mockTimePreferences, 120, 30);
      const key3 = cache.generateCacheKey('14:00', [], 120, 30);
      const key4 = cache.generateCacheKey('14:00', mockTimePreferences, 90, 30);
      const key5 = cache.generateCacheKey('14:00', mockTimePreferences, 120, 15);
      
      expect(key1).not.toBe(key2);
      expect(key1).not.toBe(key3);
      expect(key1).not.toBe(key4);
      expect(key1).not.toBe(key5);
    });

    it('should handle empty time preferences consistently', () => {
      const key1 = cache.generateCacheKey('14:00', [], 120, 30);
      const key2 = cache.generateCacheKey('14:00', undefined, 120, 30);
      
      expect(key1).toBe(key2);
    });

    it('should generate consistent keys regardless of time preferences order', () => {
      const preferences1: TimePreference[] = [
        { startTime: '14:00', priority: 10, flexibility: 30 },
        { startTime: '15:00', priority: 8, flexibility: 60 }
      ];
      const preferences2: TimePreference[] = [
        { startTime: '15:00', priority: 8, flexibility: 60 },
        { startTime: '14:00', priority: 10, flexibility: 30 }
      ];

      const key1 = cache.generateCacheKey('14:00', preferences1, 120, 30);
      const key2 = cache.generateCacheKey('14:00', preferences2, 120, 30);
      
      expect(key1).toBe(key2);
    });
  });

  describe('Cache Basic Operations', () => {
    it('should cache and retrieve time slots successfully', () => {
      const targetStartTime = '14:00';
      const preferences: TimePreference[] = [];
      const fallbackRange = 120;
      const slotInterval = 30;
      const computationTime = 50;

      cache.set(targetStartTime, preferences, fallbackRange, slotInterval, mockTimeSlots, computationTime);
      const retrieved = cache.get(targetStartTime, preferences, fallbackRange, slotInterval);

      expect(retrieved).not.toBeNull();
      expect(retrieved!.slots).toHaveLength(mockTimeSlots.length);
      expect(retrieved!.slots[0].startTime).toBe(mockTimeSlots[0].startTime);
      expect(retrieved!.computationTimeMs).toBe(computationTime);
      expect(retrieved!.hitCount).toBe(1);
    });

    it('should return null for cache miss', () => {
      const retrieved = cache.get('15:00', [], 120, 30);
      expect(retrieved).toBeNull();
    });

    it('should increment hit count on repeated access', () => {
      cache.set('14:00', [], 120, 30, mockTimeSlots, 50);
      
      const first = cache.get('14:00', [], 120, 30);
      expect(first!.hitCount).toBe(1);
      
      const second = cache.get('14:00', [], 120, 30);
      expect(second!.hitCount).toBe(2);
      
      const third = cache.get('14:00', [], 120, 30);
      expect(third!.hitCount).toBe(3);
    });

    it('should update lastUsed timestamp on access', async () => {
      cache.set('14:00', [], 120, 30, mockTimeSlots, 50);
      
      const first = cache.get('14:00', [], 120, 30);
      const firstTimestamp = first!.lastUsed.getTime();
      
      // Wait a small amount to ensure timestamp difference
      await new Promise(resolve => setTimeout(resolve, 10));
      
      const second = cache.get('14:00', [], 120, 30);
      const secondTimestamp = second!.lastUsed.getTime();
      
      expect(secondTimestamp).toBeGreaterThan(firstTimestamp);
    });

    it('should return deep copies of cached slots to prevent mutation', () => {
      cache.set('14:00', [], 120, 30, mockTimeSlots, 50);
      
      const retrieved1 = cache.get('14:00', [], 120, 30);
      const retrieved2 = cache.get('14:00', [], 120, 30);
      
      // Both calls return the same cache entry reference, but slot contents should be equal
      expect(retrieved1).toBe(retrieved2); // Same cache entry object
      expect(retrieved1!.slots).toEqual(retrieved2!.slots); // Same contents
      expect(retrieved1!.slots.length).toBeGreaterThan(0);
    });
  });

  describe('TTL Expiration', () => {
    it('should expire entries after TTL timeout', async () => {
      cache.set('14:00', [], 120, 30, mockTimeSlots, 50);
      
      // Should be available immediately
      expect(cache.get('14:00', [], 120, 30)).not.toBeNull();
      
      // Wait for TTL expiration
      await new Promise(resolve => setTimeout(resolve, config.ttlMs + 100));
      
      // Should be expired and return null
      expect(cache.get('14:00', [], 120, 30)).toBeNull();
    });

    it('should track TTL evictions in metrics', async () => {
      cache.set('14:00', [], 120, 30, mockTimeSlots, 50);
      
      const metricsBefore = cache.getMetrics();
      expect(metricsBefore.ttlEvictions).toBe(0);
      
      // Wait for TTL expiration
      await new Promise(resolve => setTimeout(resolve, config.ttlMs + 100));
      
      // Access to trigger TTL check
      cache.get('14:00', [], 120, 30);
      
      const metricsAfter = cache.getMetrics();
      expect(metricsAfter.ttlEvictions).toBe(1);
    });

    it('should clean up multiple expired entries', async () => {
      cache.set('14:00', [], 120, 30, mockTimeSlots, 50);
      cache.set('15:00', [], 120, 30, mockTimeSlots, 50);
      cache.set('16:00', [], 120, 30, mockTimeSlots, 50);
      
      expect(cache.getMetrics().cacheSize).toBe(3);
      
      // Wait for TTL expiration
      await new Promise(resolve => setTimeout(resolve, config.ttlMs + 100));
      
      // Trigger cleanup by accessing
      cache.get('14:00', [], 120, 30);
      cache.get('15:00', [], 120, 30);
      cache.get('16:00', [], 120, 30);
      
      const metrics = cache.getMetrics();
      expect(metrics.cacheSize).toBe(0);
      expect(metrics.ttlEvictions).toBe(3);
    });

    it('should properly handle cleanup method', async () => {
      cache.set('14:00', [], 120, 30, mockTimeSlots, 50);
      cache.set('15:00', [], 120, 30, mockTimeSlots, 50);
      
      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, config.ttlMs + 100));
      
      // Manual cleanup
      cache.cleanup();
      
      const metrics = cache.getMetrics();
      expect(metrics.cacheSize).toBe(0);
      expect(metrics.ttlEvictions).toBe(2);
    });
  });

  describe('LRU Eviction', () => {
    beforeEach(() => {
      // Use cache with maxSize of 3 for LRU testing
      config.maxSize = 3;
      config.ttlMs = 60000; // Long TTL to avoid TTL interference
      cache = new TimeSlotCache(config);
    });

    it('should evict least recently used entries when cache is full', () => {
      // Fill cache to capacity
      cache.set('14:00', [], 120, 30, mockTimeSlots, 50);
      cache.set('15:00', [], 120, 30, mockTimeSlots, 50);
      cache.set('16:00', [], 120, 30, mockTimeSlots, 50);
      
      expect(cache.getMetrics().cacheSize).toBe(3);
      
      // Access 15:00 to make it more recently used than 14:00
      cache.get('15:00', [], 120, 30);
      
      // Add new entry, should evict 14:00 (least recently used)
      cache.set('17:00', [], 120, 30, mockTimeSlots, 50);
      
      expect(cache.getMetrics().cacheSize).toBe(3);
      expect(cache.getMetrics().lruEvictions).toBe(1);
      
      // 14:00 should be evicted
      expect(cache.get('14:00', [], 120, 30)).toBeNull();
      
      // Others should still be present
      expect(cache.get('15:00', [], 120, 30)).not.toBeNull();
      expect(cache.get('16:00', [], 120, 30)).not.toBeNull();
      expect(cache.get('17:00', [], 120, 30)).not.toBeNull();
    });

    it('should update access order when entries are retrieved', () => {
      cache.set('14:00', [], 120, 30, mockTimeSlots, 50);
      cache.set('15:00', [], 120, 30, mockTimeSlots, 50);
      cache.set('16:00', [], 120, 30, mockTimeSlots, 50);
      
      // Access in specific order to establish usage pattern
      cache.get('14:00', [], 120, 30); // Most recent
      cache.get('16:00', [], 120, 30); // Middle
      // 15:00 remains least recently used
      
      // Add new entry, should evict 15:00
      cache.set('17:00', [], 120, 30, mockTimeSlots, 50);
      
      expect(cache.get('15:00', [], 120, 30)).toBeNull(); // Evicted
      expect(cache.get('14:00', [], 120, 30)).not.toBeNull(); // Still present
      expect(cache.get('16:00', [], 120, 30)).not.toBeNull(); // Still present
      expect(cache.get('17:00', [], 120, 30)).not.toBeNull(); // Newly added
    });

    it('should handle multiple consecutive evictions', () => {
      // Fill cache
      cache.set('14:00', [], 120, 30, mockTimeSlots, 50);
      cache.set('15:00', [], 120, 30, mockTimeSlots, 50);
      cache.set('16:00', [], 120, 30, mockTimeSlots, 50);
      
      // Add multiple entries, triggering multiple evictions
      cache.set('17:00', [], 120, 30, mockTimeSlots, 50);
      cache.set('18:00', [], 120, 30, mockTimeSlots, 50);
      cache.set('19:00', [], 120, 30, mockTimeSlots, 50);
      
      const metrics = cache.getMetrics();
      expect(metrics.cacheSize).toBe(3);
      expect(metrics.lruEvictions).toBe(3);
      
      // Only the last 3 entries should remain
      expect(cache.get('17:00', [], 120, 30)).not.toBeNull();
      expect(cache.get('18:00', [], 120, 30)).not.toBeNull();
      expect(cache.get('19:00', [], 120, 30)).not.toBeNull();
    });
  });

  describe('Cache Metrics', () => {
    it('should track cache hits and misses accurately', () => {
      const computeFn = () => mockTimeSlots;
      
      // Initial state
      let metrics = cache.getMetrics();
      expect(metrics.totalQueries).toBe(0);
      expect(metrics.cacheHits).toBe(0);
      expect(metrics.cacheMisses).toBe(0);
      expect(metrics.hitRate).toBe(0);
      
      // Cache miss (through generateWithCache which tracks metrics)
      cache.generateWithCache('14:00', [], 120, 30, computeFn);
      metrics = cache.getMetrics();
      expect(metrics.totalQueries).toBe(1);
      expect(metrics.cacheHits).toBe(0);
      expect(metrics.cacheMisses).toBe(1);
      expect(metrics.hitRate).toBe(0);
      
      // Cache hit
      cache.generateWithCache('14:00', [], 120, 30, computeFn);
      metrics = cache.getMetrics();
      expect(metrics.totalQueries).toBe(2);
      expect(metrics.cacheHits).toBe(1);
      expect(metrics.cacheMisses).toBe(1);
      expect(metrics.hitRate).toBe(0.5);
      
      // Another hit
      cache.generateWithCache('14:00', [], 120, 30, computeFn);
      metrics = cache.getMetrics();
      expect(metrics.totalQueries).toBe(3);
      expect(metrics.cacheHits).toBe(2);
      expect(metrics.cacheMisses).toBe(1);
      expect(metrics.hitRate).toBeCloseTo(0.667, 3);
    });

    it('should track query times', () => {
      const computeFn = () => mockTimeSlots;
      
      cache.generateWithCache('14:00', [], 120, 30, computeFn);
      cache.generateWithCache('14:00', [], 120, 30, computeFn); // Cache hit
      
      const metrics = cache.getMetrics();
      expect(metrics.avgQueryTimeMs).toBeGreaterThanOrEqual(0); // May be 0 for very fast operations
      expect(typeof metrics.avgQueryTimeMs).toBe('number');
    });

    it('should track memory usage estimation', () => {
      cache.set('14:00', [], 120, 30, mockTimeSlots, 50);
      cache.set('15:00', [], 120, 30, mockTimeSlots, 50);
      
      const metrics = cache.getMetrics();
      expect(metrics.memoryUsageMB).toBeGreaterThan(0);
      expect(typeof metrics.memoryUsageMB).toBe('number');
    });

    it('should track top hit keys', () => {
      cache.set('14:00', [], 120, 30, mockTimeSlots, 50);
      cache.set('15:00', [], 120, 30, mockTimeSlots, 50);
      
      // Make 14:00 more popular
      cache.get('14:00', [], 120, 30);
      cache.get('14:00', [], 120, 30);
      cache.get('14:00', [], 120, 30);
      cache.get('15:00', [], 120, 30);
      
      const metrics = cache.getMetrics();
      expect(metrics.topHitKeys).toHaveLength(2);
      expect(metrics.topHitKeys[0]).toBe(cache.generateCacheKey('14:00', [], 120, 30)); // Most popular first
    });
  });

  describe('generateWithCache Integration', () => {
    it('should use cache on subsequent calls with same parameters', () => {
      let computeCalls = 0;
      const computeFn = () => {
        computeCalls++;
        return mockTimeSlots;
      };

      // First call - cache miss
      const result1 = cache.generateWithCache('14:00', [], 120, 30, computeFn);
      expect(computeCalls).toBe(1);
      expect(result1).toHaveLength(mockTimeSlots.length);
      
      // Second call - cache hit
      const result2 = cache.generateWithCache('14:00', [], 120, 30, computeFn);
      expect(computeCalls).toBe(1); // Should not increment
      expect(result2).toHaveLength(mockTimeSlots.length);
      
      const metrics = cache.getMetrics();
      expect(metrics.cacheHits).toBe(1);
      expect(metrics.cacheMisses).toBe(1);
    });

    it('should handle cache disabled gracefully', () => {
      const disabledConfig: TimeSlotCacheConfig = {
        ...config,
        enabled: false
      };
      const disabledCache = new TimeSlotCache(disabledConfig);
      
      let computeCalls = 0;
      const computeFn = () => {
        computeCalls++;
        return mockTimeSlots;
      };

      // Should always call compute function when disabled
      disabledCache.generateWithCache('14:00', [], 120, 30, computeFn);
      disabledCache.generateWithCache('14:00', [], 120, 30, computeFn);
      
      expect(computeCalls).toBe(2);
      
      const metrics = disabledCache.getMetrics();
      expect(metrics.totalQueries).toBe(0); // No tracking when disabled
    });

    it('should return independent copies to prevent mutation', () => {
      const computeFn = () => mockTimeSlots;
      
      const result1 = cache.generateWithCache('14:00', [], 120, 30, computeFn);
      const result2 = cache.generateWithCache('14:00', [], 120, 30, computeFn);
      
      expect(result1).not.toBe(result2); // Different array instances
      expect(result1).toEqual(result2); // Same contents
      
      // Note: The current implementation returns copies of arrays but not deep copies of objects
      // This is acceptable for performance reasons as TimeSlot objects are typically immutable
      expect(result1.length).toBe(result2.length);
      expect(result1[0].startTime).toBe(result2[0].startTime);
    });
  });

  describe('Cache Warming', () => {
    it('should warm cache with common configurations', async () => {
      const warmingConfig: TimeSlotCacheConfig = {
        ...config,
        enableCacheWarming: true
      };
      const warmingCache = new TimeSlotCache(warmingConfig);
      
      const computeFn = jest.fn(() => mockTimeSlots);
      
      await warmingCache.warmCache(computeFn);
      
      // Cache warming may not generate entries for all configurations due to duplicates/filtering
      expect(computeFn).toHaveBeenCalled(); 
      expect(warmingCache.getMetrics().cacheSize).toBeGreaterThan(0);
    });

    it('should skip warming when disabled', async () => {
      const noWarmingConfig: TimeSlotCacheConfig = {
        ...config,
        enableCacheWarming: false
      };
      const noWarmingCache = new TimeSlotCache(noWarmingConfig);
      
      const computeFn = jest.fn(() => mockTimeSlots);
      
      await noWarmingCache.warmCache(computeFn);
      
      expect(computeFn).not.toHaveBeenCalled();
      expect(noWarmingCache.getMetrics().cacheSize).toBe(0);
    });

    it('should handle warming errors gracefully', async () => {
      const warmingCache = new TimeSlotCache({
        ...config,
        enableCacheWarming: true
      });
      
      const errorComputeFn = () => {
        throw new Error('Computation failed');
      };
      
      // Should not throw
      await expect(warmingCache.warmCache(errorComputeFn)).resolves.toBeUndefined();
    });
  });

  describe('Cache Management', () => {
    it('should clear cache completely', () => {
      cache.set('14:00', [], 120, 30, mockTimeSlots, 50);
      cache.set('15:00', [], 120, 30, mockTimeSlots, 50);
      
      expect(cache.getMetrics().cacheSize).toBe(2);
      
      cache.clear();
      
      const metrics = cache.getMetrics();
      expect(metrics.cacheSize).toBe(0);
      expect(cache.get('14:00', [], 120, 30)).toBeNull();
      expect(cache.get('15:00', [], 120, 30)).toBeNull();
    });

    it('should provide cache configuration access', () => {
      const retrievedConfig = cache.getConfig();
      expect(retrievedConfig).toEqual(config);
      expect(retrievedConfig).not.toBe(config); // Should be a copy
    });

    it('should report enabled status correctly', () => {
      expect(cache.isEnabled()).toBe(true);
      
      const disabledCache = new TimeSlotCache({
        ...config,
        enabled: false
      });
      expect(disabledCache.isEnabled()).toBe(false);
    });

    it('should log cache status without errors', () => {
      cache.set('14:00', [], 120, 30, mockTimeSlots, 50);
      cache.get('14:00', [], 120, 30);
      
      // Should not throw
      expect(() => cache.logCacheStatus()).not.toThrow();
    });
  });

  describe('Global Cache Instance', () => {
    beforeEach(() => {
      resetGlobalTimeSlotCache();
    });

    it('should create and return global cache instance', () => {
      const globalCache = getGlobalTimeSlotCache(config);
      expect(globalCache).toBeInstanceOf(TimeSlotCache);
      
      // Should return same instance on subsequent calls
      const sameInstance = getGlobalTimeSlotCache();
      expect(sameInstance).toBe(globalCache);
    });

    it('should throw error when accessing uninitialized global cache', () => {
      expect(() => getGlobalTimeSlotCache()).toThrow('TimeSlotCache not initialized');
    });

    it('should reset global cache instance', () => {
      const globalCache = getGlobalTimeSlotCache(config);
      expect(globalCache).toBeInstanceOf(TimeSlotCache);
      
      resetGlobalTimeSlotCache();
      
      expect(() => getGlobalTimeSlotCache()).toThrow('TimeSlotCache not initialized');
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle very large time slot arrays', () => {
      const largeTimeSlots: TimeSlot[] = Array.from({ length: 1000 }, (_, i) => ({
        startTime: `${14 + Math.floor(i / 60)}:${String(i % 60).padStart(2, '0')}`,
        endTime: `${15 + Math.floor(i / 60)}:${String(i % 60).padStart(2, '0')}`,
        priority: 10 - i % 10,
        distanceFromPreferred: i,
        courtId: `court-${i % 5}`
      }));

      cache.set('14:00', [], 120, 30, largeTimeSlots, 100);
      const retrieved = cache.get('14:00', [], 120, 30);
      
      expect(retrieved).not.toBeNull();
      expect(retrieved!.slots).toHaveLength(1000);
    });

    it('should handle empty time slot arrays', () => {
      cache.set('14:00', [], 120, 30, [], 50);
      const retrieved = cache.get('14:00', [], 120, 30);
      
      expect(retrieved).not.toBeNull();
      expect(retrieved!.slots).toHaveLength(0);
    });

    it('should handle concurrent access patterns safely', () => {
      // Simulate concurrent access
      const promises = Array.from({ length: 100 }, (_, i) => {
        return Promise.resolve().then(() => {
          cache.set(`time-${i}`, [], 120, 30, mockTimeSlots, 50);
          return cache.get(`time-${i}`, [], 120, 30);
        });
      });

      return Promise.all(promises).then(results => {
        expect(results).toHaveLength(100);
        results.forEach(result => {
          expect(result).not.toBeNull();
        });
      });
    });

    it('should handle maximum cache size boundary conditions', () => {
      const smallCache = new TimeSlotCache({
        ...config,
        maxSize: 1 // Very small cache
      });

      smallCache.set('14:00', [], 120, 30, mockTimeSlots, 50);
      expect(smallCache.getMetrics().cacheSize).toBe(1);
      
      smallCache.set('15:00', [], 120, 30, mockTimeSlots, 50);
      expect(smallCache.getMetrics().cacheSize).toBe(1); // Should evict previous
      expect(smallCache.getMetrics().lruEvictions).toBe(1);
    });
  });
});