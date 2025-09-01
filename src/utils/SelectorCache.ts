/**
 * Selector Caching System for DOM Query Optimization
 * Integrates with existing SelectorFallbackManager for multi-tier caching
 */

import type { Page } from '@playwright/test';
import { logger } from './logger';
import type { SelectorFallbackManager, SelectorConfig, FallbackResult } from './SelectorFallbackManager';
import { createHash } from 'crypto';

export interface SelectorCacheEntry {
  selector: string;
  lastUsed: Date;
  hitCount: number;
  pageUrlHash: string;
  tier: string;
  elementsFound: number;
  avgResponseTime: number;
}

export interface CacheKey {
  pageUrlHash: string;
  selectorCategory: string;
  specificId?: string | undefined;
}

export interface CacheMetrics {
  totalQueries: number;
  cacheHits: number;
  cacheMisses: number;
  hitRate: number;
  avgQueryTimeMs: number;
  cacheSize: number;
  pageInvalidations: number;
  categoriesTracked: string[];
  memoryUsageMB: number;
}

export interface SelectorCacheConfig {
  enabled: boolean;
  maxSize: number;
  ttlMs: number;
  debugMode: boolean;
}

/**
 * LRU-based selector cache with performance tracking and invalidation strategies
 */
export class SelectorCache {
  private cache = new Map<string, SelectorCacheEntry>();
  private accessOrder = new Map<string, number>(); // For LRU tracking
  private metrics: {
    totalQueries: number;
    cacheHits: number;
    cacheMisses: number;
    queryTimes: number[];
    pageInvalidations: number;
  } = {
    totalQueries: 0,
    cacheHits: 0,
    cacheMisses: 0,
    queryTimes: [],
    pageInvalidations: 0
  };
  
  private currentAccessCounter = 0;
  private readonly config: SelectorCacheConfig;

  constructor(config: SelectorCacheConfig) {
    this.config = config;
    
    if (this.config.enabled) {
      logger.info('SelectorCache initialized', 'SelectorCache', {
        maxSize: this.config.maxSize,
        ttlMs: this.config.ttlMs,
        debugMode: this.config.debugMode
      });
    }
  }

  /**
   * Generate cache key from CacheKey object
   */
  private generateCacheKey(cacheKey: CacheKey): string {
    const keyParts = [cacheKey.pageUrlHash, cacheKey.selectorCategory];
    if (cacheKey.specificId) {
      keyParts.push(cacheKey.specificId);
    }
    return keyParts.join('::');
  }

  /**
   * Generate page URL hash for cache namespacing
   */
  private generatePageUrlHash(page: Page): string {
    const url = page.url();
    if (!url) {
      return 'unknown-page';
    }
    // Remove query parameters and fragments for consistent caching
    const baseUrl = url.split('?')[0]?.split('#')[0] || 'unknown-url';
    return createHash('sha256').update(baseUrl).digest('hex').substring(0, 16);
  }

  /**
   * Create cache key from page and category
   */
  private createCacheKey(page: Page, category: string, specificId?: string | undefined): CacheKey {
    return {
      pageUrlHash: this.generatePageUrlHash(page),
      selectorCategory: category,
      specificId: specificId || undefined
    };
  }

  /**
   * Get cached selector entry
   */
  get(cacheKey: CacheKey): SelectorCacheEntry | null {
    if (!this.config.enabled) {
      return null;
    }

    const key = this.generateCacheKey(cacheKey);
    const entry = this.cache.get(key);

    if (!entry) {
      return null;
    }

    // Check TTL expiration
    const now = new Date();
    const ageMs = now.getTime() - entry.lastUsed.getTime();
    if (ageMs > this.config.ttlMs) {
      this.cache.delete(key);
      this.accessOrder.delete(key);
      
      if (this.config.debugMode) {
        logger.debug('Cache entry expired', 'SelectorCache.get', {
          key,
          ageMs,
          ttlMs: this.config.ttlMs
        });
      }
      return null;
    }

    // Update access tracking for LRU
    this.currentAccessCounter++;
    this.accessOrder.set(key, this.currentAccessCounter);

    // Update hit count and last used time
    entry.hitCount++;
    entry.lastUsed = now;

    if (this.config.debugMode) {
      logger.debug('Cache hit', 'SelectorCache.get', {
        key,
        hitCount: entry.hitCount,
        selector: entry.selector,
        tier: entry.tier
      });
    }

    return entry;
  }

  /**
   * Set cached selector entry
   */
  set(cacheKey: CacheKey, entry: SelectorCacheEntry): void {
    if (!this.config.enabled) {
      return;
    }

    const key = this.generateCacheKey(cacheKey);

    // Check if we need to evict entries (LRU)
    if (this.cache.size >= this.config.maxSize && !this.cache.has(key)) {
      this.evictLRU();
    }

    // Update access tracking
    this.currentAccessCounter++;
    this.accessOrder.set(key, this.currentAccessCounter);

    // Store entry
    this.cache.set(key, entry);

    if (this.config.debugMode) {
      logger.debug('Cache entry set', 'SelectorCache.set', {
        key,
        selector: entry.selector,
        tier: entry.tier,
        cacheSize: this.cache.size
      });
    }
  }

  /**
   * Cache-integrated selector finding with fallback
   */
  async findWithCache(
    page: Page,
    fallbackManager: SelectorFallbackManager,
    config: SelectorConfig,
    category: string,
    specificId?: string
  ): Promise<FallbackResult & { fromCache: boolean }> {
    if (!this.config.enabled) {
      const result = await fallbackManager.findWithFallback(config);
      return { ...result, fromCache: false };
    }

    const component = 'SelectorCache.findWithCache';
    const startTime = Date.now();
    this.metrics.totalQueries++;

    const cacheKey = this.createCacheKey(page, category, specificId);
    const cachedEntry = this.get(cacheKey);

    // Try cached selector first
    if (cachedEntry) {
      try {
        const elements = await page.locator(cachedEntry.selector).all();
        const queryTime = Date.now() - startTime;
        this.metrics.queryTimes.push(queryTime);
        
        if (elements.length > 0) {
          this.metrics.cacheHits++;
          
          // Update cache entry with fresh data
          const updatedEntry: SelectorCacheEntry = {
            ...cachedEntry,
            lastUsed: new Date(),
            hitCount: cachedEntry.hitCount + 1,
            elementsFound: elements.length,
            avgResponseTime: (cachedEntry.avgResponseTime * cachedEntry.hitCount + queryTime) / (cachedEntry.hitCount + 1)
          };
          this.set(cacheKey, updatedEntry);

          const result: FallbackResult & { fromCache: boolean } = {
            success: true,
            tier: cachedEntry.tier,
            selector: cachedEntry.selector,
            element: page.locator(cachedEntry.selector).first(),
            elementsFound: elements.length,
            timeToFind: queryTime,
            fromCache: true
          };

          logger.info('Cached selector succeeded', component, {
            category,
            selector: cachedEntry.selector,
            elementsFound: elements.length,
            timeToFind: queryTime,
            hitCount: updatedEntry.hitCount
          });

          return result;
        } else {
          // Cached selector no longer works, remove from cache
          this.invalidateEntry(cacheKey);
          
          if (this.config.debugMode) {
            logger.debug('Cached selector failed, invalidating', component, {
              category,
              selector: cachedEntry.selector
            });
          }
        }
      } catch (error) {
        // Cached selector failed, remove from cache
        this.invalidateEntry(cacheKey);
        
        logger.debug('Cached selector threw error, invalidating', component, {
          category,
          selector: cachedEntry.selector,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    // Cache miss or cached selector failed - use fallback manager
    this.metrics.cacheMisses++;
    const fallbackResult = await fallbackManager.findWithFallback(config);
    const queryTime = Date.now() - startTime;
    this.metrics.queryTimes.push(queryTime);

    // Cache successful result
    if (fallbackResult.success && fallbackResult.selector) {
      const cacheEntry: SelectorCacheEntry = {
        selector: fallbackResult.selector,
        lastUsed: new Date(),
        hitCount: 1,
        pageUrlHash: this.generatePageUrlHash(page),
        tier: fallbackResult.tier,
        elementsFound: fallbackResult.elementsFound,
        avgResponseTime: fallbackResult.timeToFind
      };
      
      this.set(cacheKey, cacheEntry);
      
      if (this.config.debugMode) {
        logger.debug('Fallback result cached', component, {
          category,
          selector: fallbackResult.selector,
          tier: fallbackResult.tier
        });
      }
    }

    return { ...fallbackResult, fromCache: false };
  }

  /**
   * Invalidate cache entry
   */
  private invalidateEntry(cacheKey: CacheKey): void {
    const key = this.generateCacheKey(cacheKey);
    this.cache.delete(key);
    this.accessOrder.delete(key);
  }

  /**
   * Invalidate all cache entries for a specific page
   */
  invalidateForPage(pageUrlHash: string): void {
    const keysToDelete: string[] = [];
    
    for (const [key, entry] of this.cache.entries()) {
      if (entry.pageUrlHash === pageUrlHash) {
        keysToDelete.push(key);
      }
    }

    keysToDelete.forEach(key => {
      this.cache.delete(key);
      this.accessOrder.delete(key);
    });

    this.metrics.pageInvalidations++;

    if (this.config.debugMode && keysToDelete.length > 0) {
      logger.debug('Page cache invalidated', 'SelectorCache.invalidateForPage', {
        pageUrlHash,
        entriesRemoved: keysToDelete.length
      });
    }
  }

  /**
   * Invalidate all cache entries for a specific category
   */
  invalidateCategory(category: string): void {
    const keysToDelete: string[] = [];
    
    for (const key of this.cache.keys()) {
      if (key.includes(`::${category}`)) {
        keysToDelete.push(key);
      }
    }

    keysToDelete.forEach(key => {
      this.cache.delete(key);
      this.accessOrder.delete(key);
    });

    if (this.config.debugMode && keysToDelete.length > 0) {
      logger.debug('Category cache invalidated', 'SelectorCache.invalidateCategory', {
        category,
        entriesRemoved: keysToDelete.length
      });
    }
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
      
      if (this.config.debugMode) {
        logger.debug('LRU eviction performed', 'SelectorCache.evictLRU', {
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
      const ageMs = now.getTime() - entry.lastUsed.getTime();
      if (ageMs > this.config.ttlMs) {
        keysToDelete.push(key);
      }
    }

    keysToDelete.forEach(key => {
      this.cache.delete(key);
      this.accessOrder.delete(key);
    });

    if (this.config.debugMode && keysToDelete.length > 0) {
      logger.debug('Cleanup completed', 'SelectorCache.cleanup', {
        expiredEntries: keysToDelete.length,
        remainingEntries: this.cache.size
      });
    }
  }

  /**
   * Get cache performance metrics
   */
  getMetrics(): CacheMetrics {
    const avgQueryTime = this.metrics.queryTimes.length > 0 
      ? this.metrics.queryTimes.reduce((sum, time) => sum + time, 0) / this.metrics.queryTimes.length 
      : 0;

    const hitRate = this.metrics.totalQueries > 0 
      ? this.metrics.cacheHits / this.metrics.totalQueries 
      : 0;

    const categoriesTracked = Array.from(new Set(
      Array.from(this.cache.keys())
        .map(key => key.split('::')[1])
        .filter((category): category is string => Boolean(category))
    ));

    // Estimate memory usage (rough calculation)
    let memoryBytes = 0;
    for (const [key, entry] of this.cache.entries()) {
      memoryBytes += key.length * 2; // UTF-16 characters
      memoryBytes += entry.selector.length * 2;
      memoryBytes += entry.tier.length * 2;
      memoryBytes += entry.pageUrlHash.length * 2;
      memoryBytes += 64; // Estimated overhead per entry
    }

    return {
      totalQueries: this.metrics.totalQueries,
      cacheHits: this.metrics.cacheHits,
      cacheMisses: this.metrics.cacheMisses,
      hitRate,
      avgQueryTimeMs: avgQueryTime,
      cacheSize: this.cache.size,
      pageInvalidations: this.metrics.pageInvalidations,
      categoriesTracked,
      memoryUsageMB: memoryBytes / (1024 * 1024)
    };
  }

  /**
   * Log current cache status
   */
  logCacheStatus(): void {
    const metrics = this.getMetrics();
    
    logger.info('Selector cache status', 'SelectorCache', {
      enabled: this.config.enabled,
      hitRate: `${(metrics.hitRate * 100).toFixed(1)}%`,
      cacheSize: `${metrics.cacheSize}/${this.config.maxSize}`,
      avgQueryTime: `${metrics.avgQueryTimeMs.toFixed(1)}ms`,
      totalQueries: metrics.totalQueries,
      memoryUsage: `${metrics.memoryUsageMB.toFixed(2)}MB`,
      categoriesTracked: metrics.categoriesTracked.length
    });

    // Alert if hit rate is unexpectedly low
    if (metrics.hitRate < 0.3 && metrics.totalQueries > 20) {
      logger.warn('Low cache hit rate detected', 'SelectorCache', {
        hitRate: metrics.hitRate,
        totalQueries: metrics.totalQueries,
        cacheSize: metrics.cacheSize
      });
    }
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache.clear();
    this.accessOrder.clear();
    
    logger.info('Cache cleared', 'SelectorCache', {
      previousSize: this.cache.size
    });
  }

  /**
   * Get cache configuration
   */
  getConfig(): SelectorCacheConfig {
    return { ...this.config };
  }
}

/**
 * Global selector cache instance
 */
let globalSelectorCache: SelectorCache | undefined;

/**
 * Get or create global selector cache instance
 */
export function getGlobalSelectorCache(config?: SelectorCacheConfig): SelectorCache {
  if (!globalSelectorCache && config) {
    globalSelectorCache = new SelectorCache(config);
  } else if (!globalSelectorCache) {
    throw new Error('SelectorCache not initialized. Provide config on first call.');
  }
  return globalSelectorCache;
}

/**
 * Reset global selector cache instance (mainly for testing)
 */
export function resetGlobalSelectorCache(): void {
  globalSelectorCache = undefined;
}