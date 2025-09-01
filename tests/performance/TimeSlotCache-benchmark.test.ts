/**
 * Performance benchmark tests for TimeSlotCache optimization
 * Measures actual performance improvements comparing cached vs uncached generation
 */

import { performance } from 'perf_hooks';
import { TimeSlotCache, TimeSlotCacheConfig, resetGlobalTimeSlotCache } from '../../src/utils/TimeSlotCache';
import { TimeSlotGenerator } from '../../src/core/TimeSlotGenerator';
import type { TimeSlot, TimePreference } from '../../src/types/booking.types';

describe('TimeSlotCache Performance Benchmarks', () => {
  let timeSlotGenerator: TimeSlotGenerator;
  let cacheConfig: TimeSlotCacheConfig;

  const commonTargetTimes = ['14:00', '15:00', '16:00', '17:00', '18:00', '19:00'];
  const commonTimePreferences: TimePreference[] = [
    { startTime: '14:00', priority: 10, flexibility: 30 },
    { startTime: '15:00', priority: 8, flexibility: 60 },
    { startTime: '16:00', priority: 6, flexibility: 90 }
  ];

  beforeAll(() => {
    resetGlobalTimeSlotCache();
    
    // Configure cache for performance testing
    cacheConfig = {
      enabled: true,
      maxSize: 100,
      ttlMs: 3600000, // 1 hour
      debugMode: false,
      enableCacheWarming: true
    };

    // Initialize generator with cache
    timeSlotGenerator = new TimeSlotGenerator(cacheConfig);
  });

  afterAll(() => {
    resetGlobalTimeSlotCache();
  });

  describe('Single Operation Performance', () => {
    it('should demonstrate performance improvement for repeated identical calls', async () => {
      const targetStartTime = '14:00';
      const preferences = commonTimePreferences;
      const fallbackRange = 120;
      const iterations = 100;

      // Measure uncached performance (first call)
      const uncachedStart = performance.now();
      const firstResult = timeSlotGenerator.generatePrioritizedTimeSlots(
        targetStartTime, 
        preferences, 
        fallbackRange
      );
      const uncachedEnd = performance.now();
      const uncachedTime = uncachedEnd - uncachedStart;

      // Measure cached performance (subsequent calls)
      const cachedTimes: number[] = [];
      for (let i = 0; i < iterations; i++) {
        const start = performance.now();
        const result = timeSlotGenerator.generatePrioritizedTimeSlots(
          targetStartTime, 
          preferences, 
          fallbackRange
        );
        const end = performance.now();
        cachedTimes.push(end - start);

        // Verify results are identical
        expect(result).toHaveLength(firstResult.length);
        expect(result[0].startTime).toBe(firstResult[0].startTime);
      }

      const avgCachedTime = cachedTimes.reduce((sum, time) => sum + time, 0) / cachedTimes.length;

      // Log performance results
      console.log('\n=== Single Operation Performance ===');
      console.log(`Uncached time: ${uncachedTime.toFixed(3)}ms`);
      console.log(`Average cached time: ${avgCachedTime.toFixed(3)}ms`);
      console.log(`Performance improvement: ${((uncachedTime / avgCachedTime) * 100 - 100).toFixed(1)}%`);
      console.log(`Cache speedup factor: ${(uncachedTime / avgCachedTime).toFixed(1)}x`);

      // Verify performance improvement
      expect(avgCachedTime).toBeLessThan(uncachedTime * 0.5); // At least 50% improvement
      
      // Verify cache hit rate
      const metrics = timeSlotGenerator.getCacheMetrics();
      expect(metrics.hitRate).toBeGreaterThan(0.95); // Should be >95% hit rate
    });

    it('should measure memory efficiency of caching', () => {
      const targetConfigurations = [
        { time: '14:00', range: 120 },
        { time: '15:00', range: 120 },
        { time: '16:00', range: 90 },
        { time: '17:00', range: 90 },
        { time: '18:00', range: 120 }
      ];

      // Generate time slots for different configurations
      targetConfigurations.forEach(config => {
        timeSlotGenerator.generatePrioritizedTimeSlots(
          config.time,
          commonTimePreferences,
          config.range
        );
      });

      const metrics = timeSlotGenerator.getCacheMetrics();
      
      console.log('\n=== Memory Efficiency ===');
      console.log(`Cache size: ${metrics.cacheSize} entries`);
      console.log(`Memory usage: ${metrics.memoryUsageMB.toFixed(2)} MB`);
      console.log(`Average memory per entry: ${(metrics.memoryUsageMB / metrics.cacheSize).toFixed(3)} MB`);

      // Verify memory usage is reasonable
      expect(metrics.memoryUsageMB).toBeLessThan(50); // Should stay under 50MB
      expect(metrics.memoryUsageMB / metrics.cacheSize).toBeLessThan(1); // <1MB per entry
    });
  });

  describe('Booking Retry Simulation', () => {
    it('should demonstrate consistent performance across retry attempts', async () => {
      const targetStartTime = '16:00';
      const preferences = commonTimePreferences;
      const fallbackRange = 120;
      const maxRetries = 5;
      const retryTimes: number[] = [];

      console.log('\n=== Booking Retry Performance ===');

      // Simulate booking retry scenario
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        const start = performance.now();
        
        const timeSlots = timeSlotGenerator.generatePrioritizedTimeSlots(
          targetStartTime,
          preferences,
          fallbackRange
        );
        
        const end = performance.now();
        const attemptTime = end - start;
        retryTimes.push(attemptTime);

        console.log(`Retry ${attempt}: ${attemptTime.toFixed(3)}ms (${timeSlots.length} slots)`);
      }

      const firstAttemptTime = retryTimes[0];
      const subsequentAttempts = retryTimes.slice(1);
      const avgSubsequentTime = subsequentAttempts.reduce((sum, time) => sum + time, 0) / subsequentAttempts.length;

      console.log(`First attempt (cache miss): ${firstAttemptTime.toFixed(3)}ms`);
      console.log(`Average subsequent attempts: ${avgSubsequentTime.toFixed(3)}ms`);
      console.log(`Consistency improvement: ${((firstAttemptTime / avgSubsequentTime) * 100 - 100).toFixed(1)}%`);

      // Verify consistent performance in retry scenarios
      expect(avgSubsequentTime).toBeLessThan(firstAttemptTime * 0.3); // Should be <30% of original time
      
      // Verify low variance in retry times
      const variance = subsequentAttempts.reduce((sum, time) => sum + Math.pow(time - avgSubsequentTime, 2), 0) / subsequentAttempts.length;
      const standardDeviation = Math.sqrt(variance);
      expect(standardDeviation / avgSubsequentTime).toBeLessThan(0.2); // CV < 20%
    });
  });

  describe('Bulk Operation Performance', () => {
    it('should measure performance with mixed cache hits and misses', async () => {
      const testConfigurations = [
        { time: '14:00', range: 120, preferences: [] as TimePreference[] },
        { time: '14:00', range: 90, preferences: [] as TimePreference[] }, // Different range
        { time: '15:00', range: 120, preferences: [] as TimePreference[] },
        { time: '14:00', range: 120, preferences: [] as TimePreference[] }, // Repeat - cache hit
        { time: '16:00', range: 120, preferences: commonTimePreferences },
        { time: '15:00', range: 120, preferences: [] as TimePreference[] }, // Repeat - cache hit
        { time: '17:00', range: 90, preferences: commonTimePreferences },
        { time: '14:00', range: 120, preferences: [] as TimePreference[] }, // Repeat - cache hit
        { time: '18:00', range: 120, preferences: [] as TimePreference[] },
        { time: '16:00', range: 120, preferences: commonTimePreferences }, // Repeat - cache hit
      ];

      const operationTimes: number[] = [];
      let totalSlots = 0;

      const bulkStart = performance.now();

      testConfigurations.forEach((config, index) => {
        const start = performance.now();
        const slots = timeSlotGenerator.generatePrioritizedTimeSlots(
          config.time,
          config.preferences,
          config.range
        );
        const end = performance.now();

        operationTimes.push(end - start);
        totalSlots += slots.length;
      });

      const bulkEnd = performance.now();
      const totalTime = bulkEnd - bulkStart;
      const avgOperationTime = operationTimes.reduce((sum, time) => sum + time, 0) / operationTimes.length;

      const metrics = timeSlotGenerator.getCacheMetrics();

      console.log('\n=== Bulk Operations Performance ===');
      console.log(`Total operations: ${testConfigurations.length}`);
      console.log(`Total time: ${totalTime.toFixed(3)}ms`);
      console.log(`Average time per operation: ${avgOperationTime.toFixed(3)}ms`);
      console.log(`Total slots generated: ${totalSlots}`);
      console.log(`Cache hit rate: ${(metrics.hitRate * 100).toFixed(1)}%`);
      console.log(`Total queries: ${metrics.totalQueries}`);
      console.log(`Cache hits: ${metrics.cacheHits}`);
      console.log(`Cache misses: ${metrics.cacheMisses}`);

      // Verify overall performance
      expect(metrics.hitRate).toBeGreaterThan(0.4); // Should have reasonable hit rate
      expect(avgOperationTime).toBeLessThan(10); // Average operation should be fast
    });
  });

  describe('Cache Warming Performance', () => {
    it('should measure cache warming effectiveness', async () => {
      // Create fresh generator for warming test
      resetGlobalTimeSlotCache();
      const warmingGenerator = new TimeSlotGenerator({
        ...cacheConfig,
        enableCacheWarming: true
      });

      // Measure warming time
      const warmingStart = performance.now();
      await warmingGenerator.warmCache();
      const warmingEnd = performance.now();
      const warmingTime = warmingEnd - warmingStart;

      const warmingMetrics = warmingGenerator.getCacheMetrics();

      console.log('\n=== Cache Warming Performance ===');
      console.log(`Warming time: ${warmingTime.toFixed(3)}ms`);
      console.log(`Warmed entries: ${warmingMetrics.cacheSize}`);
      console.log(`Time per warmed entry: ${(warmingTime / warmingMetrics.cacheSize).toFixed(3)}ms`);

      // Test performance of warmed cache
      const testCalls = [
        { time: '14:00', range: 120 },
        { time: '15:00', range: 120 },
        { time: '16:00', range: 90 },
        { time: '17:00', range: 90 }
      ];

      const warmedTimes: number[] = [];
      testCalls.forEach(call => {
        const start = performance.now();
        warmingGenerator.generatePrioritizedTimeSlots(call.time, [], call.range);
        const end = performance.now();
        warmedTimes.push(end - start);
      });

      const avgWarmedTime = warmedTimes.reduce((sum, time) => sum + time, 0) / warmedTimes.length;

      console.log(`Average warmed cache access time: ${avgWarmedTime.toFixed(3)}ms`);

      const finalMetrics = warmingGenerator.getCacheMetrics();
      console.log(`Post-warming hit rate: ${(finalMetrics.hitRate * 100).toFixed(1)}%`);

      // Verify warming effectiveness
      expect(warmingMetrics.cacheSize).toBeGreaterThan(0);
      expect(finalMetrics.hitRate).toBeGreaterThan(0.25); // Should achieve reasonable hit rate
      expect(avgWarmedTime).toBeLessThan(5); // Warmed cache should be very fast
    });
  });

  describe('Long-running Performance Analysis', () => {
    it('should measure performance stability over extended usage', async () => {
      const extendedConfigurations = [];
      const performanceSnapshots: Array<{
        iteration: number;
        avgTime: number;
        hitRate: number;
        cacheSize: number;
        memoryMB: number;
      }> = [];

      // Generate diverse test configurations
      for (let i = 0; i < 50; i++) {
        extendedConfigurations.push({
          time: `${14 + (i % 6)}:${String((i * 15) % 60).padStart(2, '0')}`,
          range: 90 + (i % 3) * 30,
          preferences: i % 3 === 0 ? commonTimePreferences : []
        });
      }

      const snapshotIntervals = [10, 25, 50];
      let currentSnapshot = 0;

      // Execute extended test
      const recentTimes: number[] = [];
      for (let i = 0; i < extendedConfigurations.length; i++) {
        const config = extendedConfigurations[i];
        
        const start = performance.now();
        timeSlotGenerator.generatePrioritizedTimeSlots(
          config.time,
          config.preferences,
          config.range
        );
        const end = performance.now();
        
        recentTimes.push(end - start);
        if (recentTimes.length > 10) {
          recentTimes.shift(); // Keep only last 10 measurements
        }

        // Take performance snapshots
        if (snapshotIntervals[currentSnapshot] && i + 1 === snapshotIntervals[currentSnapshot]) {
          const metrics = timeSlotGenerator.getCacheMetrics();
          const avgRecentTime = recentTimes.reduce((sum, time) => sum + time, 0) / recentTimes.length;
          
          performanceSnapshots.push({
            iteration: i + 1,
            avgTime: avgRecentTime,
            hitRate: metrics.hitRate,
            cacheSize: metrics.cacheSize,
            memoryMB: metrics.memoryUsageMB
          });
          
          currentSnapshot++;
        }
      }

      console.log('\n=== Long-running Performance Analysis ===');
      performanceSnapshots.forEach(snapshot => {
        console.log(`Iteration ${snapshot.iteration}: ${snapshot.avgTime.toFixed(3)}ms avg, ` +
                   `${(snapshot.hitRate * 100).toFixed(1)}% hit rate, ` +
                   `${snapshot.cacheSize} entries, ${snapshot.memoryMB.toFixed(2)}MB`);
      });

      // Verify performance stability
      const finalMetrics = timeSlotGenerator.getCacheMetrics();
      expect(finalMetrics.hitRate).toBeGreaterThan(0.6); // Maintain good hit rate
      expect(finalMetrics.memoryUsageMB).toBeLessThan(50); // Memory stays reasonable
      
      // Verify performance doesn't degrade significantly
      const firstSnapshot = performanceSnapshots[0];
      const lastSnapshot = performanceSnapshots[performanceSnapshots.length - 1];
      expect(lastSnapshot.avgTime).toBeLessThan(firstSnapshot.avgTime * 1.5); // <50% degradation
    });
  });

  describe('Comparative Baseline Performance', () => {
    it('should compare against uncached TimeSlotGenerator', () => {
      // Create generator without caching
      resetGlobalTimeSlotCache();
      const uncachedGenerator = new TimeSlotGenerator({
        enabled: false,
        maxSize: 0,
        ttlMs: 0,
        debugMode: false,
        enableCacheWarming: false
      });

      const testConfiguration = {
        time: '15:30',
        preferences: commonTimePreferences,
        range: 120
      };

      const iterations = 20;
      const uncachedTimes: number[] = [];
      const cachedTimes: number[] = [];

      // Measure uncached performance
      for (let i = 0; i < iterations; i++) {
        const start = performance.now();
        uncachedGenerator.generatePrioritizedTimeSlots(
          testConfiguration.time,
          testConfiguration.preferences,
          testConfiguration.range
        );
        const end = performance.now();
        uncachedTimes.push(end - start);
      }

      // Measure cached performance
      for (let i = 0; i < iterations; i++) {
        const start = performance.now();
        timeSlotGenerator.generatePrioritizedTimeSlots(
          testConfiguration.time,
          testConfiguration.preferences,
          testConfiguration.range
        );
        const end = performance.now();
        cachedTimes.push(end - start);
      }

      const avgUncachedTime = uncachedTimes.reduce((sum, time) => sum + time, 0) / uncachedTimes.length;
      const avgCachedTime = cachedTimes.reduce((sum, time) => sum + time, 0) / cachedTimes.length;
      const improvementPercentage = ((avgUncachedTime / avgCachedTime) * 100 - 100);

      console.log('\n=== Cached vs Uncached Comparison ===');
      console.log(`Uncached average: ${avgUncachedTime.toFixed(3)}ms`);
      console.log(`Cached average: ${avgCachedTime.toFixed(3)}ms`);
      console.log(`Performance improvement: ${improvementPercentage.toFixed(1)}%`);
      console.log(`Speedup factor: ${(avgUncachedTime / avgCachedTime).toFixed(1)}x`);

      const cachedMetrics = timeSlotGenerator.getCacheMetrics();
      console.log(`Cache hit rate: ${(cachedMetrics.hitRate * 100).toFixed(1)}%`);

      // Verify significant performance improvement
      expect(improvementPercentage).toBeGreaterThan(50); // At least 50% improvement
      expect(cachedMetrics.hitRate).toBeGreaterThan(0.8); // Good hit rate expected
    });
  });
});