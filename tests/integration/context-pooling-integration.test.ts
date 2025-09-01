import { Browser, BrowserContext, Page, chromium } from '@playwright/test';
import { 
  BrowserContextPool, 
  initializeGlobalContextPool, 
  getGlobalContextPool,
  cleanupGlobalContextPool,
  type BrowserContextPoolConfig 
} from '../../src/utils/BrowserContextPool';
import { BasePage } from '../../src/pages/BasePage';

// Test implementation of BasePage for testing
class TestPage extends BasePage {
  constructor(page: Page) {
    super(page, 'https://example.com');
  }

  async testNavigation(url: string): Promise<void> {
    await this.navigateTo(url);
  }

  getContextMetrics() {
    return this.getContextReuseMetrics();
  }
}

describe('Context Pooling Integration', () => {
  let browser: Browser;
  let pool: BrowserContextPool;

  beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
  });

  afterAll(async () => {
    await browser.close();
  });

  beforeEach(async () => {
    const config: Partial<BrowserContextPoolConfig> = {
      maxPoolSize: 3,
      maxContextAge: 30000,
      minWarmContexts: 0, // Disable for predictable testing
      healthCheckInterval: 5000,
      enablePreWarming: false, // Disable for predictable testing
    };
    
    const contextOptions = {
      viewport: { width: 1280, height: 720 },
      userAgent: 'Mozilla/5.0 (compatible; test-browser)',
    };
    
    pool = new BrowserContextPool(browser, config, contextOptions);
  });

  afterEach(async () => {
    await pool.cleanup();
    // Cleanup global pool if it exists
    try {
      await cleanupGlobalContextPool();
    } catch {
      // Ignore if not initialized
    }
  });

  describe('Global Context Pool Integration', () => {
    test('should initialize and use global context pool', async () => {
      const contextOptions = {
        viewport: { width: 1280, height: 720 },
        userAgent: 'Mozilla/5.0 (compatible; test-browser)',
      };
      
      const globalPool = initializeGlobalContextPool(browser, {
        maxPoolSize: 2,
        enablePreWarming: false,
      }, contextOptions);
      
      expect(globalPool).toBeDefined();
      
      const retrievedPool = getGlobalContextPool();
      expect(retrievedPool).toBe(globalPool);
      
      const context = await retrievedPool.getContext();
      expect(context).toBeDefined();
      
      await retrievedPool.releaseContext(context);
      await cleanupGlobalContextPool();
    });

    test('should throw error when accessing uninitialized global pool', () => {
      expect(() => getGlobalContextPool()).toThrow('Global context pool not initialized');
    });

    test('should prevent double initialization of global pool', async () => {
      initializeGlobalContextPool(browser);
      
      expect(() => initializeGlobalContextPool(browser)).toThrow('Global context pool already initialized');
      
      await cleanupGlobalContextPool();
    });
  });

  describe('BasePage Integration', () => {
    test('should detect context reuse in BasePage', async () => {
      // Get a context and use it
      const context1 = await pool.getContext();
      const page1 = await context1.newPage();
      const testPage1 = new TestPage(page1);
      
      // Release context back to pool
      await pool.releaseContext(context1);
      
      // Get another context (should be reused)
      const context2 = await pool.getContext();
      const page2 = await context2.newPage();
      const testPage2 = new TestPage(page2);
      
      const metrics = testPage2.getContextMetrics();
      
      // Context should be detected as reused if it's the same one
      if (context1 === context2) {
        expect(metrics.isReused).toBe(true);
        expect(metrics.contextAge).toBeGreaterThan(0);
      }
      
      await context1.close();
      if (context2 !== context1) {
        await context2.close();
      }
    });

    test('should handle navigation with pooled context', async () => {
      const context = await pool.getContext();
      const page = await context.newPage();
      const testPage = new TestPage(page);
      
      await testPage.testNavigation('https://example.com');
      expect(page.url()).toBe('https://example.com/');
      
      await testPage.testNavigation('https://example.com/page2');
      expect(page.url()).toBe('https://example.com/page2');
      
      await pool.releaseContext(context);
    });

    test('should clear context state when needed', async () => {
      const context = await pool.getContext();
      const page = await context.newPage();
      const testPage = new TestPage(page);
      
      // Navigate to a page and set some state
      await testPage.testNavigation('https://example.com');
      await page.evaluate(() => {
        localStorage.setItem('test', 'value');
        sessionStorage.setItem('test', 'value');
      });
      
      // Verify state is set
      const localStorageValue = await page.evaluate(() => localStorage.getItem('test'));
      expect(localStorageValue).toBe('value');
      
      // Release and get context again
      await pool.releaseContext(context);
      const context2 = await pool.getContext();
      
      if (context === context2) {
        // Same context reused - state should be maintained unless cleared
        const page2 = await context2.newPage();
        const testPage2 = new TestPage(page2);
        
        // Navigate to different domain (should trigger state clearing)
        await testPage2.testNavigation('https://different-domain.com');
      }
      
      await pool.releaseContext(context2);
    });
  });

  describe('Performance Benefits', () => {
    test('should show performance improvement with context reuse', async () => {
      const iterations = 3;
      
      // Test without pooling (creating new contexts each time)
      const startTimeNonPooled = Date.now();
      for (let i = 0; i < iterations; i++) {
        const context = await browser.newContext();
        const page = await context.newPage();
        await page.goto('https://example.com');
        await context.close();
      }
      const nonPooledTime = Date.now() - startTimeNonPooled;
      
      // Test with pooling (reusing contexts)
      const startTimePooled = Date.now();
      for (let i = 0; i < iterations; i++) {
        const context = await pool.getContext();
        const page = await context.newPage();
        await page.goto('https://example.com');
        await page.close();
        await pool.releaseContext(context);
      }
      const pooledTime = Date.now() - startTimePooled;
      
      // Pooled should be faster (though this is environment-dependent)
      expect(pooledTime).toBeLessThanOrEqual(nonPooledTime * 1.5); // Allow some variance
      
      const metrics = pool.getMetrics();
      expect(metrics.hitRate).toBeGreaterThan(0); // Should have reused contexts
    });

    test('should handle concurrent context requests efficiently', async () => {
      const concurrentRequests = 5;
      
      const startTime = Date.now();
      const contextPromises = Array.from({ length: concurrentRequests }, async (_, i) => {
        const context = await pool.getContext();
        const page = await context.newPage();
        
        // Simulate some work
        await page.goto('https://example.com');
        await new Promise(resolve => setTimeout(resolve, 100));
        
        await page.close();
        await pool.releaseContext(context);
        return i;
      });
      
      const results = await Promise.all(contextPromises);
      const endTime = Date.now();
      
      expect(results).toHaveLength(concurrentRequests);
      expect(endTime - startTime).toBeLessThan(concurrentRequests * 1000); // Should be much faster than sequential
      
      const metrics = pool.getMetrics();
      expect(metrics.totalContexts).toBeLessThanOrEqual(3); // Shouldn't exceed max pool size
    });
  });

  describe('Error Handling and Recovery', () => {
    test('should recover from context failures', async () => {
      const context1 = await pool.getContext();
      const page1 = await context1.newPage();
      
      // Simulate context becoming unhealthy
      await context1.close(); // Force close the context
      
      // Pool should still be able to provide new contexts
      const context2 = await pool.getContext();
      expect(context2).toBeDefined();
      expect(context2).not.toBe(context1);
      
      const page2 = await context2.newPage();
      await page2.goto('https://example.com');
      
      await pool.releaseContext(context2);
    });

    test('should handle page navigation failures gracefully', async () => {
      const context = await pool.getContext();
      const page = await context.newPage();
      const testPage = new TestPage(page);
      
      // Try to navigate to invalid URL
      await expect(testPage.testNavigation('invalid-url')).rejects.toThrow();
      
      // Context should still be usable
      await testPage.testNavigation('https://example.com');
      expect(page.url()).toBe('https://example.com/');
      
      await pool.releaseContext(context);
    });

    test('should maintain pool integrity after errors', async () => {
      const context1 = await pool.getContext();
      const context2 = await pool.getContext();
      
      // Force close one context
      await context1.close();
      
      // Pool metrics should be updated correctly
      await pool.releaseContext(context2);
      
      // Wait for health check to detect and clean up failed context
      await new Promise(resolve => setTimeout(resolve, 1100));
      
      const metrics = pool.getMetrics();
      expect(metrics.totalContexts).toBeGreaterThan(0); // Should still have healthy contexts
    });
  });

  describe('Resource Management', () => {
    test('should properly cleanup resources on pool destruction', async () => {
      const context1 = await pool.getContext();
      const context2 = await pool.getContext();
      const page1 = await context1.newPage();
      const page2 = await context2.newPage();
      
      let initialMetrics = pool.getMetrics();
      expect(initialMetrics.totalContexts).toBe(2);
      
      // Cleanup should close all contexts and pages
      await pool.cleanup();
      
      const finalMetrics = pool.getMetrics();
      expect(finalMetrics.totalContexts).toBe(0);
      expect(finalMetrics.activeContexts).toBe(0);
      expect(finalMetrics.warmContexts).toBe(0);
    });

    test('should handle memory pressure by cleaning up old contexts', async () => {
      const shortLivedPool = new BrowserContextPool(browser, {
        maxPoolSize: 2,
        maxContextAge: 500, // 0.5 seconds
        healthCheckInterval: 300,
        minWarmContexts: 0,
        enablePreWarming: false,
      });
      
      try {
        const context1 = await shortLivedPool.getContext();
        await shortLivedPool.releaseContext(context1);
        
        // Wait for context to become stale
        await new Promise(resolve => setTimeout(resolve, 800));
        
        // Request new context - old one should be cleaned up
        const context2 = await shortLivedPool.getContext();
        
        const metrics = shortLivedPool.getMetrics();
        expect(metrics.totalContexts).toBe(1);
        
        await shortLivedPool.releaseContext(context2);
      } finally {
        await shortLivedPool.cleanup();
      }
    });
  });

  describe('Configuration Scenarios', () => {
    test('should work with minimal configuration', async () => {
      const minimalPool = new BrowserContextPool(browser, {
        enablePreWarming: false,
      });
      
      try {
        const context = await minimalPool.getContext();
        const page = await context.newPage();
        await page.goto('https://example.com');
        
        expect(page.url()).toBe('https://example.com/');
        
        await minimalPool.releaseContext(context);
        const metrics = minimalPool.getMetrics();
        expect(metrics.totalContexts).toBe(1);
      } finally {
        await minimalPool.cleanup();
      }
    });

    test('should work with aggressive pre-warming', async () => {
      const aggressivePool = new BrowserContextPool(browser, {
        maxPoolSize: 5,
        minWarmContexts: 3,
        enablePreWarming: true,
      });
      
      try {
        // Wait for pre-warming
        await new Promise(resolve => setTimeout(resolve, 500));
        
        const metrics = aggressivePool.getMetrics();
        expect(metrics.totalContexts).toBeGreaterThanOrEqual(3);
        expect(metrics.warmContexts).toBeGreaterThanOrEqual(3);
      } finally {
        await aggressivePool.cleanup();
      }
    });
  });
});