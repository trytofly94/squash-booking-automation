/**
 * TimeSlot Caching System for Time Slot Generation Optimization
 * Reduces repeated computation overhead during booking retry attempts
 */

import { createHash } from 'crypto';
import { logger } from './logger';
import type { TimeSlot, TimePreference } from '../types/booking.types';

export interface TimeSlotCacheKey {
  /** Target start time in HH:MM format */
  targetStartTime: string;
  /** SHA-256 hash of time preferences array for consistent cache keys */
  timePreferencesHash: string;
  /** Fallback time range in minutes */
  fallbackTimeRange: number;
  /** Slot interval in minutes */
  slotInterval: number;
}

export interface TimeSlotCacheEntry {
  /** Generated time slots */
  slots: TimeSlot[];
  /** Entry creation timestamp */
  createdAt: Date;
  /** Last access timestamp */
  lastUsed: Date;
  /** Number of cache hits for this entry */
  hitCount: number;
  /** Original computation time in milliseconds */
  computationTimeMs: number;
  /** Average response time across all hits */
  avgResponseTime: number;
}

export interface TimeSlotCacheMetrics {
  /** Total cache queries made */
  totalQueries: number;
  /** Number of cache hits */
  cacheHits: number;
  /** Number of cache misses */
  cacheMisses: number;
  /** Cache hit rate (0.0-1.0) */
  hitRate: number;
  /** Average query time in milliseconds */
  avgQueryTimeMs: number;
  /** Current cache size */
  cacheSize: number;
  /** Total entries evicted due to LRU */
  lruEvictions: number;
  /** Total entries evicted due to TTL expiration */
  ttlEvictions: number;
  /** Memory usage estimation in MB */
  memoryUsageMB: number;
  /** Most frequently accessed cache keys */
  topHitKeys: string[];
}

export interface TimeSlotCacheConfig {
  /** Whether caching is enabled */
  enabled: boolean;
  /** Maximum number of cache entries */
  maxSize: number;
  /** Time-to-live in milliseconds for cache entries */
  ttlMs: number;
  /** Enable debug logging */
  debugMode: boolean;
  /** Enable cache warming on initialization */
  enableCacheWarming: boolean;
}

/**
 * LRU-based time slot cache with TTL expiration and performance tracking
 * Optimizes repeated time slot generation during booking retry attempts
 */
export class TimeSlotCache {
  private cache = new Map<string, TimeSlotCacheEntry>();
  private accessOrder = new Map<string, number>(); // For LRU tracking
  private metrics: {
    totalQueries: number;
    cacheHits: number;
    cacheMisses: number;
    queryTimes: number[];
    lruEvictions: number;
    ttlEvictions: number;
  } = {
    totalQueries: 0,
    cacheHits: 0,
    cacheMisses: 0,
    queryTimes: [],
    lruEvictions: 0,
    ttlEvictions: 0
  };

  private currentAccessCounter = 0;
  private readonly config: TimeSlotCacheConfig;
  private cleanupIntervalId?: NodeJS.Timeout;

  constructor(config: TimeSlotCacheConfig) {
    this.config = config;

    if (this.config.enabled) {
      logger.info('TimeSlotCache initialized', 'TimeSlotCache', {
        maxSize: this.config.maxSize,
        ttlMs: this.config.ttlMs,
        debugMode: this.config.debugMode,
        cacheWarming: this.config.enableCacheWarming
      });

      // Start periodic cleanup to handle TTL expiration
      this.startPeriodicCleanup();
    }
  }

  /**
   * Generate consistent cache key from time slot generation parameters
   */
  generateCacheKey(
    targetStartTime: string,
    preferences: TimePreference[] = [],
    fallbackTimeRange: number = 120,
    slotInterval: number = 30
  ): string {
    const timePreferencesHash = this.hashTimePreferences(preferences);

    const keyObject: TimeSlotCacheKey = {
      targetStartTime,
      timePreferencesHash,
      fallbackTimeRange,
      slotInterval
    };

    // Create deterministic string representation
    const keyString = `${keyObject.targetStartTime}:${keyObject.timePreferencesHash}:${keyObject.fallbackTimeRange}:${keyObject.slotInterval}`;

    // Generate SHA-256 hash for consistent key length and collision avoidance
    return createHash('sha256').update(keyString).digest('hex').substring(0, 16);
  }

  /**
   * Hash time preferences array for consistent cache key generation
   */
  private hashTimePreferences(preferences: TimePreference[]): string {
    if (!preferences || preferences.length === 0) {
      return 'empty';
    }

    // Sort preferences to ensure consistent hashing regardless of order
    const sortedPrefs = [...preferences].sort((a, b) => {
      if (a.startTime !== b.startTime) return a.startTime.localeCompare(b.startTime);
      if (a.priority !== b.priority) return a.priority - b.priority;
      return a.flexibility - b.flexibility;
    });

    // Create deterministic string representation
    const prefString = sortedPrefs
      .map(pref => `${pref.startTime}-${pref.priority}-${pref.flexibility}`)
      .join('|');

    return createHash('sha256').update(prefString).digest('hex').substring(0, 8);
  }

  /**
   * Get cached time slots entry
   */
  get(
    targetStartTime: string,
    preferences: TimePreference[] = [],
    fallbackTimeRange: number = 120,
    slotInterval: number = 30
  ): TimeSlotCacheEntry | null {
    if (!this.config.enabled) {
      return null;
    }

    const key = this.generateCacheKey(targetStartTime, preferences, fallbackTimeRange, slotInterval);
    const entry = this.cache.get(key);

    if (!entry) {
      this.metrics.cacheMisses++;
      return null;
    }

    // Check TTL expiration
    const now = new Date();
    const ageMs = now.getTime() - entry.createdAt.getTime();
    if (ageMs > this.config.ttlMs) {
      this.cache.delete(key);
      this.accessOrder.delete(key);
      this.metrics.ttlEvictions++;

      if (this.config.debugMode) {
        logger.debug('Cache entry expired', 'TimeSlotCache.get', {
          key,
          ageMs,
          ttlMs: this.config.ttlMs
        });
      }

      this.metrics.cacheMisses++;
      return null;
    }

    // Update access tracking for LRU
    this.currentAccessCounter++;
    this.accessOrder.set(key, this.currentAccessCounter);

    // Update hit metrics
    this.metrics.cacheHits++;
    entry.hitCount++;
    entry.lastUsed = now;

    if (this.config.debugMode) {
      logger.debug('Cache hit', 'TimeSlotCache.get', {
        key,
        hitCount: entry.hitCount,
        slotsCount: entry.slots.length,
        originalComputationTime: entry.computationTimeMs
      });
    }

    return entry;
  }

  /**
   * Set cached time slots entry
   */
  set(
    targetStartTime: string,
    preferences: TimePreference[] = [],
    fallbackTimeRange: number = 120,
    slotInterval: number = 30,
    slots: TimeSlot[],
    computationTimeMs: number
  ): void {
    if (!this.config.enabled) {
      return;
    }

    const key = this.generateCacheKey(targetStartTime, preferences, fallbackTimeRange, slotInterval);

    // Check if we need to evict entries (LRU)
    if (this.cache.size >= this.config.maxSize && !this.cache.has(key)) {
      this.evictLRU();
    }

    // Update access tracking
    this.currentAccessCounter++;
    this.accessOrder.set(key, this.currentAccessCounter);

    // Create cache entry
    const entry: TimeSlotCacheEntry = {
      slots: [...slots], // Deep copy to avoid mutation issues
      createdAt: new Date(),
      lastUsed: new Date(),
      hitCount: 0,
      computationTimeMs,
      avgResponseTime: computationTimeMs
    };

    // Store entry
    this.cache.set(key, entry);

    if (this.config.debugMode) {
      logger.debug('Cache entry set', 'TimeSlotCache.set', {
        key,
        slotsCount: slots.length,
        computationTimeMs,
        cacheSize: this.cache.size
      });
    }
  }

  /**
   * Cache-integrated time slot generation with transparent fallback
   */
  generateWithCache(
    targetStartTime: string,
    preferences: TimePreference[] = [],
    fallbackTimeRange: number = 120,
    slotInterval: number = 30,
    computeFn: () => TimeSlot[]
  ): TimeSlot[] {
    if (!this.config.enabled) {
      return computeFn();
    }

    const startTime = Date.now();
    this.metrics.totalQueries++;

    // Try cache first
    const cachedEntry = this.get(targetStartTime, preferences, fallbackTimeRange, slotInterval);
    if (cachedEntry) {
      const queryTime = Date.now() - startTime;
      this.metrics.queryTimes.push(queryTime);

      // Update average response time
      cachedEntry.avgResponseTime = 
        (cachedEntry.avgResponseTime * (cachedEntry.hitCount - 1) + queryTime) / cachedEntry.hitCount;

      return [...cachedEntry.slots]; // Return copy to avoid mutation
    }

    // Cache miss - compute and cache result
    const computationStartTime = Date.now();
    const slots = computeFn();
    const computationTime = Date.now() - computationStartTime;
    const totalQueryTime = Date.now() - startTime;

    this.metrics.queryTimes.push(totalQueryTime);

    // Cache the result
    this.set(targetStartTime, preferences, fallbackTimeRange, slotInterval, slots, computationTime);

    if (this.config.debugMode) {
      logger.debug('Time slots computed and cached', 'TimeSlotCache.generateWithCache', {
        targetStartTime,
        fallbackTimeRange,
        slotInterval,
        slotsGenerated: slots.length,
        computationTimeMs: computationTime,
        totalQueryTimeMs: totalQueryTime
      });
    }

    return slots;
  }

  /**
   * Evict least recently used entry
   */
  private evictLRU(): void {
    let oldestKey = '';
    let oldestAccess = Infinity;

    for (const [key, accessTime] of this.accessOrder.entries()) {
      if (accessTime < oldestAccess) {
        oldestAccess = accessTime;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
      this.accessOrder.delete(oldestKey);
      this.metrics.lruEvictions++;

      if (this.config.debugMode) {
        logger.debug('LRU eviction performed', 'TimeSlotCache.evictLRU', {
          evictedKey: oldestKey,
          newSize: this.cache.size
        });
      }
    }
  }

  /**
   * Cleanup expired entries
   */
  cleanup(): void {
    const now = new Date();
    const keysToDelete: string[] = [];

    for (const [key, entry] of this.cache.entries()) {
      const ageMs = now.getTime() - entry.createdAt.getTime();
      if (ageMs > this.config.ttlMs) {
        keysToDelete.push(key);
      }
    }

    keysToDelete.forEach(key => {
      this.cache.delete(key);
      this.accessOrder.delete(key);
      this.metrics.ttlEvictions++;
    });

    if (this.config.debugMode && keysToDelete.length > 0) {
      logger.debug('Cleanup completed', 'TimeSlotCache.cleanup', {
        expiredEntries: keysToDelete.length,
        remainingEntries: this.cache.size
      });
    }
  }

  /**
   * Start periodic cleanup to handle TTL expiration
   */
  private startPeriodicCleanup(): void {
    // Run cleanup every 5 minutes
    this.cleanupIntervalId = setInterval(() => {
      this.cleanup();
    }, 5 * 60 * 1000);
  }

  /**
   * Get cache performance metrics
   */
  getMetrics(): TimeSlotCacheMetrics {
    const avgQueryTime = this.metrics.queryTimes.length > 0
      ? this.metrics.queryTimes.reduce((sum, time) => sum + time, 0) / this.metrics.queryTimes.length
      : 0;

    const hitRate = this.metrics.totalQueries > 0
      ? this.metrics.cacheHits / this.metrics.totalQueries
      : 0;

    // Get top hit keys
    const keyHitCounts = Array.from(this.cache.entries())
      .map(([key, entry]) => ({ key, hitCount: entry.hitCount }))
      .sort((a, b) => b.hitCount - a.hitCount)
      .slice(0, 5)
      .map(item => item.key);

    // Estimate memory usage
    let memoryBytes = 0;
    for (const [key, entry] of this.cache.entries()) {
      memoryBytes += key.length * 2; // UTF-16 characters
      memoryBytes += entry.slots.length * 128; // Estimated TimeSlot object size
      memoryBytes += 200; // Estimated overhead per entry
    }

    return {
      totalQueries: this.metrics.totalQueries,
      cacheHits: this.metrics.cacheHits,
      cacheMisses: this.metrics.cacheMisses,
      hitRate,
      avgQueryTimeMs: avgQueryTime,
      cacheSize: this.cache.size,
      lruEvictions: this.metrics.lruEvictions,
      ttlEvictions: this.metrics.ttlEvictions,
      memoryUsageMB: memoryBytes / (1024 * 1024),
      topHitKeys: keyHitCounts
    };
  }

  /**
   * Log current cache status
   */
  logCacheStatus(): void {
    const metrics = this.getMetrics();

    logger.info('TimeSlot cache status', 'TimeSlotCache', {
      enabled: this.config.enabled,
      hitRate: `${(metrics.hitRate * 100).toFixed(1)}%`,
      cacheSize: `${metrics.cacheSize}/${this.config.maxSize}`,
      avgQueryTime: `${metrics.avgQueryTimeMs.toFixed(1)}ms`,
      totalQueries: metrics.totalQueries,
      memoryUsage: `${metrics.memoryUsageMB.toFixed(2)}MB`,
      lruEvictions: metrics.lruEvictions,
      ttlEvictions: metrics.ttlEvictions
    });

    // Alert if hit rate is unexpectedly low
    if (metrics.hitRate < 0.5 && metrics.totalQueries > 10) {
      logger.warn('Low cache hit rate detected', 'TimeSlotCache', {
        hitRate: metrics.hitRate,
        totalQueries: metrics.totalQueries,
        cacheSize: metrics.cacheSize,
        suggestion: 'Consider increasing cache size or TTL'
      });
    }
  }

  /**
   * Pre-compute and cache common time slot configurations
   */
  async warmCache(computeFn: (targetStartTime: string, preferences: TimePreference[], fallbackTimeRange: number, slotInterval: number) => TimeSlot[]): Promise<void> {
    if (!this.config.enabled || !this.config.enableCacheWarming) {
      return;
    }

    logger.info('Starting cache warming', 'TimeSlotCache.warmCache');

    const commonConfigurations = [
      // Popular target start times with standard fallback ranges
      { targetTime: '14:00', fallbackRange: 120, slotInterval: 30 },
      { targetTime: '15:00', fallbackRange: 120, slotInterval: 30 },
      { targetTime: '16:00', fallbackRange: 90, slotInterval: 30 },
      { targetTime: '17:00', fallbackRange: 90, slotInterval: 30 },
      { targetTime: '18:00', fallbackRange: 120, slotInterval: 30 },
      { targetTime: '19:00', fallbackRange: 90, slotInterval: 30 },
      { targetTime: '20:00', fallbackRange: 60, slotInterval: 30 },
      
      // Some with different intervals
      { targetTime: '14:00', fallbackRange: 120, slotInterval: 15 },
      { targetTime: '16:00', fallbackRange: 120, slotInterval: 15 }
    ];

    let warmedCount = 0;
    for (const config of commonConfigurations) {
      try {
        this.generateWithCache(
          config.targetTime,
          [], // Empty preferences for common patterns
          config.fallbackRange,
          config.slotInterval,
          () => computeFn(config.targetTime, [], config.fallbackRange, config.slotInterval)
        );
        warmedCount++;
      } catch (error) {
        logger.warn('Cache warming failed for configuration', 'TimeSlotCache.warmCache', {
          config,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    logger.info('Cache warming completed', 'TimeSlotCache.warmCache', {
      warmedEntries: warmedCount,
      totalConfigurations: commonConfigurations.length,
      cacheSize: this.cache.size
    });
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    const previousSize = this.cache.size;
    this.cache.clear();
    this.accessOrder.clear();

    // Reset metrics except for cumulative counters
    this.currentAccessCounter = 0;

    logger.info('Cache cleared', 'TimeSlotCache', {
      previousSize
    });
  }

  /**
   * Destroy cache and cleanup resources (for testing and graceful shutdown)
   */
  destroy(): void {
    if (this.cleanupIntervalId) {
      clearInterval(this.cleanupIntervalId);
      delete this.cleanupIntervalId;
    }
    this.clear();
    
    logger.info('Cache destroyed', 'TimeSlotCache');
  }

  /**
   * Get cache configuration
   */
  getConfig(): TimeSlotCacheConfig {
    return { ...this.config };
  }

  /**
   * Check if cache is enabled
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }
}

/**
 * Global time slot cache instance
 */
let globalTimeSlotCache: TimeSlotCache | undefined;

/**
 * Get or create global time slot cache instance
 */
export function getGlobalTimeSlotCache(config?: TimeSlotCacheConfig): TimeSlotCache {
  if (!globalTimeSlotCache && config) {
    globalTimeSlotCache = new TimeSlotCache(config);
  } else if (!globalTimeSlotCache) {
    throw new Error('TimeSlotCache not initialized. Provide config on first call.');
  }
  return globalTimeSlotCache;
}

/**
 * Reset global time slot cache instance (mainly for testing)
 */
export function resetGlobalTimeSlotCache(): void {
  globalTimeSlotCache = undefined;
}