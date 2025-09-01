/**
 * Unit tests for SelectorCache
 */

import { SelectorCache, type SelectorCacheConfig, type SelectorCacheEntry, type CacheKey } from '../../src/utils/SelectorCache';
import { SelectorFallbackManager } from '../../src/utils/SelectorFallbackManager';
import type { Page } from '@playwright/test';

// Mock dependencies
jest.mock('../../src/utils/logger');
jest.mock('crypto', () => ({
  createHash: jest.fn(() => ({
    update: jest.fn(() => ({
      digest: jest.fn(() => ({
        substring: jest.fn(() => 'mock-hash-123')
      }))
    }))
  }))
}));

describe('SelectorCache', () => {
  let cache: SelectorCache;
  let mockConfig: SelectorCacheConfig;
  let mockPage: jest.Mocked<Page>;
  let mockFallbackManager: jest.Mocked<SelectorFallbackManager>;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockConfig = {
      enabled: true,
      maxSize: 5, // Small size for testing LRU
      ttlMs: 60000, // 1 minute
      debugMode: false
    };

    cache = new SelectorCache(mockConfig);

    mockPage = {
      url: jest.fn(() => 'https://example.com/test'),
      locator: jest.fn(() => ({
        all: jest.fn(() => Promise.resolve([{}, {}])), // Mock 2 elements found
        first: jest.fn(() => ({}))
      }))
    } as any;

    mockFallbackManager = {
      findWithFallback: jest.fn(() => Promise.resolve({
        success: true,
        tier: 'test-tier',
        selector: '#test-selector',
        element: {},
        elementsFound: 2,
        timeToFind: 100
      }))
    } as any;
  });

  describe('cache operations', () => {
    it('should cache and retrieve successful selector entries', async () => {
      const cacheKey: CacheKey = {
        pageUrlHash: 'page-hash',
        selectorCategory: 'test-category'
      };

      const entry: SelectorCacheEntry = {
        selector: '#test-selector',
        lastUsed: new Date(),
        hitCount: 1,
        pageUrlHash: 'page-hash',
        tier: 'test-tier',
        elementsFound: 2,
        avgResponseTime: 100
      };

      // Set entry
      cache.set(cacheKey, entry);

      // Get entry
      const retrieved = cache.get(cacheKey);
      expect(retrieved).toBeTruthy();
      expect(retrieved?.selector).toBe('#test-selector');
      expect(retrieved?.tier).toBe('test-tier');
    });

    it('should return null for non-existent cache entries', () => {
      const cacheKey: CacheKey = {
        pageUrlHash: 'nonexistent',
        selectorCategory: 'test-category'
      };

      const retrieved = cache.get(cacheKey);
      expect(retrieved).toBeNull();
    });

    it('should handle TTL expiration', async () => {
      // Create cache with very short TTL
      const shortTtlConfig: SelectorCacheConfig = {
        ...mockConfig,
        ttlMs: 1 // 1ms TTL
      };
      const shortTtlCache = new SelectorCache(shortTtlConfig);

      const cacheKey: CacheKey = {
        pageUrlHash: 'page-hash',
        selectorCategory: 'test-category'
      };

      const entry: SelectorCacheEntry = {
        selector: '#test-selector',
        lastUsed: new Date(Date.now() - 100), // 100ms ago
        hitCount: 1,
        pageUrlHash: 'page-hash',
        tier: 'test-tier',
        elementsFound: 2,
        avgResponseTime: 100
      };

      shortTtlCache.set(cacheKey, entry);

      // Entry should be expired and return null
      const retrieved = shortTtlCache.get(cacheKey);
      expect(retrieved).toBeNull();
    });
  });

  describe('LRU eviction', () => {
    it('should evict least recently used entries when cache is full', () => {
      // Fill cache to capacity
      for (let i = 0; i < 5; i++) {
        const cacheKey: CacheKey = {
          pageUrlHash: 'page-hash',
          selectorCategory: `category-${i}`
        };
        
        const entry: SelectorCacheEntry = {
          selector: `#selector-${i}`,
          lastUsed: new Date(),
          hitCount: 1,
          pageUrlHash: 'page-hash',
          tier: 'test-tier',
          elementsFound: 1,
          avgResponseTime: 100
        };

        cache.set(cacheKey, entry);
      }

      // Add one more entry (should evict oldest)
      const newCacheKey: CacheKey = {
        pageUrlHash: 'page-hash',
        selectorCategory: 'new-category'
      };
      
      const newEntry: SelectorCacheEntry = {
        selector: '#new-selector',
        lastUsed: new Date(),
        hitCount: 1,
        pageUrlHash: 'page-hash',
        tier: 'test-tier',
        elementsFound: 1,
        avgResponseTime: 100
      };

      cache.set(newCacheKey, newEntry);

      // Check that oldest entry was evicted
      const oldestKey: CacheKey = {
        pageUrlHash: 'page-hash',
        selectorCategory: 'category-0'
      };
      
      const evictedEntry = cache.get(oldestKey);
      expect(evictedEntry).toBeNull();

      // Check that newest entry exists
      const newRetrieved = cache.get(newCacheKey);
      expect(newRetrieved).toBeTruthy();
    });
  });

  describe('cache invalidation', () => {
    it('should invalidate cache entries for a specific page', () => {
      const cacheKey1: CacheKey = {
        pageUrlHash: 'page1-hash',
        selectorCategory: 'category1'
      };
      
      const cacheKey2: CacheKey = {
        pageUrlHash: 'page2-hash',
        selectorCategory: 'category2'
      };

      const entry: SelectorCacheEntry = {
        selector: '#test-selector',
        lastUsed: new Date(),
        hitCount: 1,
        pageUrlHash: 'page1-hash',
        tier: 'test-tier',
        elementsFound: 1,
        avgResponseTime: 100
      };

      cache.set(cacheKey1, { ...entry, pageUrlHash: 'page1-hash' });
      cache.set(cacheKey2, { ...entry, pageUrlHash: 'page2-hash' });

      // Invalidate page1
      cache.invalidateForPage('page1-hash');

      // Page1 entry should be gone, page2 entry should remain
      expect(cache.get(cacheKey1)).toBeNull();
      expect(cache.get(cacheKey2)).toBeTruthy();
    });

    it('should invalidate cache entries for a specific category', () => {
      const cacheKey1: CacheKey = {
        pageUrlHash: 'page-hash',
        selectorCategory: 'category1'
      };
      
      const cacheKey2: CacheKey = {
        pageUrlHash: 'page-hash',
        selectorCategory: 'category2'
      };

      const entry: SelectorCacheEntry = {
        selector: '#test-selector',
        lastUsed: new Date(),
        hitCount: 1,
        pageUrlHash: 'page-hash',
        tier: 'test-tier',
        elementsFound: 1,
        avgResponseTime: 100
      };

      cache.set(cacheKey1, entry);
      cache.set(cacheKey2, entry);

      // Invalidate category1
      cache.invalidateCategory('category1');

      // Category1 entry should be gone, category2 entry should remain
      expect(cache.get(cacheKey1)).toBeNull();
      expect(cache.get(cacheKey2)).toBeTruthy();
    });
  });

  describe('findWithCache integration', () => {
    it('should return cached result on cache hit', async () => {
      const config = {
        tiers: [{
          name: 'test-tier',
          selectors: ['#test-selector'],
          priority: 1,
          description: 'Test selectors'
        }],
        timeout: 5000,
        maxAttempts: 1
      };

      // Pre-populate cache
      const cacheKey: CacheKey = {
        pageUrlHash: 'mock-hash-123',
        selectorCategory: 'test-category'
      };

      const cachedEntry: SelectorCacheEntry = {
        selector: '#cached-selector',
        lastUsed: new Date(),
        hitCount: 1,
        pageUrlHash: 'mock-hash-123',
        tier: 'cached-tier',
        elementsFound: 2,
        avgResponseTime: 50
      };

      cache.set(cacheKey, cachedEntry);

      // Mock page.locator to return elements for cached selector
      const mockLocator = {
        all: jest.fn(() => Promise.resolve([{}, {}])),
        first: jest.fn(() => ({}))
      };
      mockPage.locator.mockReturnValue(mockLocator as any);

      const result = await cache.findWithCache(
        mockPage,
        mockFallbackManager,
        config,
        'test-category'
      );

      expect(result.success).toBe(true);
      expect(result.fromCache).toBe(true);
      expect(result.selector).toBe('#cached-selector');
      expect(result.tier).toBe('cached-tier');
      expect(mockFallbackManager.findWithFallback).not.toHaveBeenCalled();
    });

    it('should fall back to SelectorFallbackManager on cache miss', async () => {
      const config = {
        tiers: [{
          name: 'test-tier',
          selectors: ['#test-selector'],
          priority: 1,
          description: 'Test selectors'
        }],
        timeout: 5000,
        maxAttempts: 1
      };

      const result = await cache.findWithCache(
        mockPage,
        mockFallbackManager,
        config,
        'test-category'
      );

      expect(result.success).toBe(true);
      expect(result.fromCache).toBe(false);
      expect(mockFallbackManager.findWithFallback).toHaveBeenCalledWith(config);
    });

    it('should cache successful fallback results', async () => {
      const config = {
        tiers: [{
          name: 'test-tier',
          selectors: ['#test-selector'],
          priority: 1,
          description: 'Test selectors'
        }],
        timeout: 5000,
        maxAttempts: 1
      };

      await cache.findWithCache(
        mockPage,
        mockFallbackManager,
        config,
        'test-category'
      );

      // Check that result was cached
      const cacheKey: CacheKey = {
        pageUrlHash: 'mock-hash-123',
        selectorCategory: 'test-category'
      };

      const cached = cache.get(cacheKey);
      expect(cached).toBeTruthy();
      expect(cached?.selector).toBe('#test-selector');
      expect(cached?.tier).toBe('test-tier');
    });
  });

  describe('metrics', () => {
    it('should track cache metrics correctly', async () => {
      // Perform some cache operations
      const config = {
        tiers: [{
          name: 'test-tier',
          selectors: ['#test-selector'],
          priority: 1,
          description: 'Test selectors'
        }],
        timeout: 5000,
        maxAttempts: 1
      };

      // Cache miss (should increment misses)
      await cache.findWithCache(
        mockPage,
        mockFallbackManager,
        config,
        'category1'
      );

      // Cache hit (should increment hits)
      await cache.findWithCache(
        mockPage,
        mockFallbackManager,
        config,
        'category1'
      );

      const metrics = cache.getMetrics();
      
      expect(metrics.totalQueries).toBe(2);
      expect(metrics.cacheHits).toBe(1);
      expect(metrics.cacheMisses).toBe(1);
      expect(metrics.hitRate).toBe(0.5);
      expect(metrics.cacheSize).toBe(1);
      expect(metrics.categoriesTracked).toContain('category1');
    });
  });

  describe('disabled cache', () => {
    it('should bypass cache when disabled', async () => {
      const disabledConfig: SelectorCacheConfig = {
        ...mockConfig,
        enabled: false
      };

      const disabledCache = new SelectorCache(disabledConfig);
      
      const config = {
        tiers: [{
          name: 'test-tier',
          selectors: ['#test-selector'],
          priority: 1,
          description: 'Test selectors'
        }],
        timeout: 5000,
        maxAttempts: 1
      };

      const result = await disabledCache.findWithCache(
        mockPage,
        mockFallbackManager,
        config,
        'test-category'
      );

      expect(result.fromCache).toBe(false);
      expect(mockFallbackManager.findWithFallback).toHaveBeenCalled();
    });
  });
});