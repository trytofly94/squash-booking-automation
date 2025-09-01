/**
 * Integration tests for SelectorCache with SelectorFallbackManager
 */

import type { Page, BrowserContext } from '@playwright/test';
import { test, expect } from '@playwright/test';
import { SelectorCache } from '../../src/utils/SelectorCache';
import { SelectorFallbackManager } from '../../src/utils/SelectorFallbackManager';
import { ConfigurationManager } from '../../src/utils/ConfigurationManager';

test.describe('SelectorCache Integration', () => {
  let page: Page;
  let context: BrowserContext;
  let cache: SelectorCache;
  let fallbackManager: SelectorFallbackManager;

  test.beforeEach(async ({ browser }) => {
    context = await browser.newContext();
    page = await context.newPage();
    
    // Initialize cache with test configuration
    const cacheConfig = {
      enabled: true,
      maxSize: 50,
      ttlMs: 300000, // 5 minutes
      debugMode: true
    };
    
    cache = new SelectorCache(cacheConfig);
    fallbackManager = new SelectorFallbackManager(page, cache);
    
    // Create a simple test HTML page
    await page.setContent(`
      <html>
        <body>
          <div id="test-container">
            <button id="test-button" class="btn">Click me</button>
            <input id="test-input" type="text" />
            <div class="loading" style="display: none;">Loading...</div>
            <ul class="list">
              <li data-testid="item-1">Item 1</li>
              <li data-testid="item-2">Item 2</li>
              <li data-testid="item-3">Item 3</li>
            </ul>
          </div>
        </body>
      </html>
    `);
  });

  test.afterEach(async () => {
    await context.close();
  });

  test('cache improves repeated selector queries', async () => {
    const config = SelectorFallbackManager.getCalendarSelectors();
    config.tiers[0].selectors = ['#test-container']; // Use our test selector
    
    // First query (cache miss)
    const startTime1 = Date.now();
    const result1 = await fallbackManager.findWithCachedFallback(config, 'calendar');
    const time1 = Date.now() - startTime1;
    
    expect(result1.success).toBe(true);
    expect(result1.fromCache).toBe(false);
    expect(result1.selector).toBe('#test-container');
    
    // Second query (should be cache hit)
    const startTime2 = Date.now();
    const result2 = await fallbackManager.findWithCachedFallback(config, 'calendar');
    const time2 = Date.now() - startTime2;
    
    expect(result2.success).toBe(true);
    expect(result2.fromCache).toBe(true);
    expect(result2.selector).toBe('#test-container');
    
    // Cache hit should be faster (allowing some variance for test environment)
    expect(time2).toBeLessThan(time1 + 100); // Allow 100ms variance
    
    // Verify cache metrics
    const metrics = cache.getMetrics();
    expect(metrics.totalQueries).toBe(2);
    expect(metrics.cacheHits).toBe(1);
    expect(metrics.cacheMisses).toBe(1);
    expect(metrics.hitRate).toBe(0.5);
  });

  test('cache handles multiple categories independently', async () => {
    // Set up different configurations for different categories
    const buttonConfig = {
      tiers: [{
        name: 'buttons',
        selectors: ['#test-button', '.btn'],
        priority: 1,
        description: 'Button selectors'
      }],
      timeout: 5000,
      maxAttempts: 1
    };

    const inputConfig = {
      tiers: [{
        name: 'inputs',
        selectors: ['#test-input', 'input[type="text"]'],
        priority: 1,
        description: 'Input selectors'
      }],
      timeout: 5000,
      maxAttempts: 1
    };

    // Query both categories
    const buttonResult = await fallbackManager.findWithCachedFallback(buttonConfig, 'buttons');
    const inputResult = await fallbackManager.findWithCachedFallback(inputConfig, 'inputs');

    expect(buttonResult.success).toBe(true);
    expect(buttonResult.selector).toBe('#test-button');
    
    expect(inputResult.success).toBe(true);
    expect(inputResult.selector).toBe('#test-input');

    // Both should be cached independently
    const buttonResult2 = await fallbackManager.findWithCachedFallback(buttonConfig, 'buttons');
    const inputResult2 = await fallbackManager.findWithCachedFallback(inputConfig, 'inputs');

    expect(buttonResult2.fromCache).toBe(true);
    expect(inputResult2.fromCache).toBe(true);

    // Verify metrics
    const metrics = cache.getMetrics();
    expect(metrics.totalQueries).toBe(4);
    expect(metrics.cacheHits).toBe(2);
    expect(metrics.categoriesTracked).toEqual(expect.arrayContaining(['buttons', 'inputs']));
  });

  test('cache invalidation works on page navigation', async () => {
    const config = {
      tiers: [{
        name: 'test',
        selectors: ['#test-container'],
        priority: 1,
        description: 'Test selectors'
      }],
      timeout: 5000,
      maxAttempts: 1
    };

    // Initial query and cache
    const result1 = await fallbackManager.findWithCachedFallback(config, 'navigation');
    expect(result1.success).toBe(true);
    expect(result1.fromCache).toBe(false);

    // Second query should hit cache
    const result2 = await fallbackManager.findWithCachedFallback(config, 'navigation');
    expect(result2.fromCache).toBe(true);

    // Navigate to different content (simulate page change)
    await page.setContent(`
      <html>
        <body>
          <div id="different-content">Different page</div>
        </body>
      </html>
    `);

    // Manually invalidate cache (simulating navigation detection)
    const pageUrlHash = require('crypto').createHash('sha256')
      .update(page.url().split('?')[0].split('#')[0])
      .digest('hex')
      .substring(0, 16);
    cache.invalidateForPage(pageUrlHash);

    // Update config for new page content
    config.tiers[0].selectors = ['#different-content'];

    // Query should be cache miss due to invalidation
    const result3 = await fallbackManager.findWithCachedFallback(config, 'navigation');
    expect(result3.success).toBe(true);
    expect(result3.fromCache).toBe(false);
    expect(result3.selector).toBe('#different-content');
  });

  test('cache handles fallback tiers correctly', async () => {
    const config = {
      tiers: [
        {
          name: 'primary',
          selectors: ['#nonexistent-element'], // This will fail
          priority: 1,
          description: 'Primary selectors that fail'
        },
        {
          name: 'fallback',
          selectors: ['#test-button'], // This will succeed
          priority: 2,
          description: 'Fallback selectors that work'
        }
      ],
      timeout: 5000,
      maxAttempts: 2
    };

    // First query - should fall back to working selector
    const result1 = await fallbackManager.findWithCachedFallback(config, 'fallback-test');
    expect(result1.success).toBe(true);
    expect(result1.selector).toBe('#test-button');
    expect(result1.tier).toBe('fallback');
    expect(result1.fromCache).toBe(false);

    // Second query - should hit cache with the working fallback selector
    const result2 = await fallbackManager.findWithCachedFallback(config, 'fallback-test');
    expect(result2.success).toBe(true);
    expect(result2.selector).toBe('#test-button');
    expect(result2.tier).toBe('fallback');
    expect(result2.fromCache).toBe(true);
  });

  test('findAllWithCachedFallback works correctly', async () => {
    const config = {
      tiers: [{
        name: 'list-items',
        selectors: ['[data-testid^="item"]'],
        priority: 1,
        description: 'List item selectors'
      }],
      timeout: 5000,
      maxAttempts: 1
    };

    // First query (cache miss)
    const result1 = await fallbackManager.findAllWithCachedFallback(config, 'list-items');
    expect(result1.success).toBe(true);
    expect(result1.fromCache).toBe(false);
    expect(result1.elements).toHaveLength(3); // Should find all 3 list items

    // Second query (cache hit)
    const result2 = await fallbackManager.findAllWithCachedFallback(config, 'list-items');
    expect(result2.success).toBe(true);
    expect(result2.fromCache).toBe(true);
    expect(result2.elements).toHaveLength(3);
  });

  test('cache performance under load', async () => {
    const config = {
      tiers: [{
        name: 'load-test',
        selectors: ['#test-container'],
        priority: 1,
        description: 'Load test selectors'
      }],
      timeout: 5000,
      maxAttempts: 1
    };

    const iterations = 50;
    const startTime = Date.now();

    // Perform many queries
    const results = await Promise.all(
      Array(iterations).fill(0).map(async (_, index) => {
        return await fallbackManager.findWithCachedFallback(config, `load-test-${index % 5}`);
      })
    );

    const totalTime = Date.now() - startTime;

    // All queries should succeed
    expect(results.every(r => r.success)).toBe(true);

    // Should have significant cache hits due to only 5 different categories
    const metrics = cache.getMetrics();
    expect(metrics.totalQueries).toBe(iterations);
    expect(metrics.cacheHits).toBeGreaterThan(iterations * 0.8); // At least 80% hit rate
    
    // Performance should be reasonable
    const avgTimePerQuery = totalTime / iterations;
    expect(avgTimePerQuery).toBeLessThan(50); // Less than 50ms per query on average

    console.log(`Cache performance test: ${iterations} queries in ${totalTime}ms (${avgTimePerQuery.toFixed(2)}ms avg), hit rate: ${(metrics.hitRate * 100).toFixed(1)}%`);
  });
});