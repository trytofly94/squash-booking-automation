import { Browser, BrowserContext, chromium } from '@playwright/test';
import { BrowserContextPool, type BrowserContextPoolConfig } from '../../src/utils/BrowserContextPool';

describe('BrowserContextPool', () => {
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
      maxContextAge: 5000, // 5 seconds for fast testing
      minWarmContexts: 1,
      healthCheckInterval: 1000, // 1 second for fast testing
      enablePreWarming: true,
    };
    
    pool = new BrowserContextPool(browser, config);
  });

  afterEach(async () => {
    await pool.cleanup();
  });

  describe('Basic Pool Operations', () => {
    test('should create and return a new context', async () => {
      const context = await pool.getContext();
      expect(context).toBeDefined();
      expect(context).toBeInstanceOf(Object);
      
      const metrics = pool.getMetrics();
      expect(metrics.totalContexts).toBe(1);
      expect(metrics.activeContexts).toBe(1);
    });

    test('should reuse existing context when available', async () => {
      // Get first context and release it
      const context1 = await pool.getContext();
      await pool.releaseContext(context1);
      
      // Get second context - should be the same one
      const context2 = await pool.getContext();
      
      const metrics = pool.getMetrics();
      expect(metrics.totalContexts).toBe(1); // Only one context created
      expect(metrics.activeContexts).toBe(1);
      expect(metrics.hitRate).toBeGreaterThan(0); // Should have reused context
    });

    test('should create new context when none available', async () => {
      const context1 = await pool.getContext();
      const context2 = await pool.getContext(); // Should create new since first is in use
      
      expect(context1).not.toBe(context2);
      
      const metrics = pool.getMetrics();
      expect(metrics.totalContexts).toBe(2);
      expect(metrics.activeContexts).toBe(2);
    });

    test('should release context back to pool', async () => {
      const context = await pool.getContext();
      
      let metrics = pool.getMetrics();
      expect(metrics.activeContexts).toBe(1);
      expect(metrics.warmContexts).toBe(0);
      
      await pool.releaseContext(context);
      
      metrics = pool.getMetrics();
      expect(metrics.activeContexts).toBe(0);
      expect(metrics.warmContexts).toBe(1);
    });
  });

  describe('Pool Size Management', () => {
    test('should respect maxPoolSize limit', async () => {
      const contexts = [];
      
      // Create more contexts than maxPoolSize (3)
      for (let i = 0; i < 5; i++) {
        const context = await pool.getContext();
        contexts.push(context);
      }
      
      const metrics = pool.getMetrics();
      expect(metrics.totalContexts).toBeLessThanOrEqual(3);
    });

    test('should cleanup oldest context when pool is full', async () => {
      const config: Partial<BrowserContextPoolConfig> = {
        maxPoolSize: 2,
        maxContextAge: 10000,
        minWarmContexts: 0,
        enablePreWarming: false,
      };
      
      const smallPool = new BrowserContextPool(browser, config);
      
      try {
        // Fill the pool
        const context1 = await smallPool.getContext();
        const context2 = await smallPool.getContext();
        
        // Release contexts
        await smallPool.releaseContext(context1);
        await smallPool.releaseContext(context2);
        
        // Add delay to make context1 older
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Create new context - should trigger cleanup of oldest
        const context3 = await smallPool.getContext();
        
        const metrics = smallPool.getMetrics();
        expect(metrics.totalContexts).toBeLessThanOrEqual(2);
      } finally {
        await smallPool.cleanup();
      }
    });
  });

  describe('Context Health and Lifecycle', () => {
    test('should pre-warm contexts when enabled', async () => {
      // Wait a bit for pre-warming
      await new Promise(resolve => setTimeout(resolve, 200));
      
      const metrics = pool.getMetrics();
      expect(metrics.totalContexts).toBeGreaterThan(0);
      expect(metrics.warmContexts).toBeGreaterThan(0);
    });

    test('should perform health checks', async () => {
      const context = await pool.getContext();
      
      // Wait for health check cycle
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Context should still be healthy
      const metrics = pool.getMetrics();
      expect(metrics.totalContexts).toBeGreaterThan(0);
    });

    test('should remove stale contexts', async () => {
      const config: Partial<BrowserContextPoolConfig> = {
        maxPoolSize: 3,
        maxContextAge: 100, // Very short age for testing
        healthCheckInterval: 200,
        minWarmContexts: 0,
        enablePreWarming: false,
      };
      
      const shortLivedPool = new BrowserContextPool(browser, config);
      
      try {
        const context = await shortLivedPool.getContext();
        await shortLivedPool.releaseContext(context);
        
        // Wait for context to become stale and health check to run
        await new Promise(resolve => setTimeout(resolve, 500));
        
        const metrics = shortLivedPool.getMetrics();
        expect(metrics.totalContexts).toBe(0); // Stale context should be removed
      } finally {
        await shortLivedPool.cleanup();
      }
    });
  });

  describe('Metrics and Monitoring', () => {
    test('should track hit rate correctly', async () => {
      // First request - miss
      const context1 = await pool.getContext();
      await pool.releaseContext(context1);
      
      // Second request - hit
      const context2 = await pool.getContext();
      
      const metrics = pool.getMetrics();
      expect(metrics.totalHits).toBe(1);
      expect(metrics.totalMisses).toBe(1);
      expect(metrics.hitRate).toBe(0.5);
    });

    test('should calculate average age correctly', async () => {
      const context = await pool.getContext();
      
      // Add some age
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const metrics = pool.getMetrics();
      expect(metrics.averageAge).toBeGreaterThan(0);
    });

    test('should track active vs warm contexts', async () => {
      const context1 = await pool.getContext();
      const context2 = await pool.getContext();
      
      let metrics = pool.getMetrics();
      expect(metrics.activeContexts).toBe(2);
      expect(metrics.warmContexts).toBeGreaterThanOrEqual(0);
      
      await pool.releaseContext(context1);
      
      metrics = pool.getMetrics();
      expect(metrics.activeContexts).toBe(1);
      expect(metrics.warmContexts).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Error Handling', () => {
    test('should handle context creation failures gracefully', async () => {
      // Create a pool with a mock browser that fails
      const failingBrowser = {
        newContext: jest.fn().mockRejectedValue(new Error('Browser failed')),
      } as unknown as Browser;
      
      const failingPool = new BrowserContextPool(failingBrowser);
      
      await expect(failingPool.getContext()).rejects.toThrow('Browser failed');
      
      await failingPool.cleanup();
    });

    test('should handle context cleanup failures gracefully', async () => {
      const context = await pool.getContext();
      
      // Mock the close method to fail
      jest.spyOn(context, 'close').mockRejectedValue(new Error('Close failed'));
      
      // Cleanup should not throw
      await expect(pool.cleanup()).resolves.not.toThrow();
    });

    test('should continue operating when individual contexts fail', async () => {
      const context1 = await pool.getContext();
      const context2 = await pool.getContext();
      
      // Mock one context to fail on operations
      (jest.spyOn(context1, 'pages') as jest.Mock).mockRejectedValue(new Error('Context failed'));
      
      // Pool should still work with remaining contexts
      await pool.releaseContext(context2);
      const context3 = await pool.getContext();
      
      expect(context3).toBeDefined();
    });
  });

  describe('Cleanup Operations', () => {
    test('should cleanup all contexts on pool cleanup', async () => {
      const context1 = await pool.getContext();
      const context2 = await pool.getContext();
      
      let metrics = pool.getMetrics();
      expect(metrics.totalContexts).toBe(2);
      
      await pool.cleanup();
      
      metrics = pool.getMetrics();
      expect(metrics.totalContexts).toBe(0);
    });

    test('should stop health checks on cleanup', async () => {
      const originalSetInterval = global.setInterval;
      const originalClearInterval = global.clearInterval;
      
      const clearIntervalSpy = jest.spyOn(global, 'clearInterval');
      
      await pool.cleanup();
      
      expect(clearIntervalSpy).toHaveBeenCalled();
      
      global.setInterval = originalSetInterval;
      global.clearInterval = originalClearInterval;
    });
  });

  describe('Configuration Options', () => {
    test('should respect custom configuration', async () => {
      const customConfig: Partial<BrowserContextPoolConfig> = {
        maxPoolSize: 5,
        maxContextAge: 60000,
        minWarmContexts: 2,
        healthCheckInterval: 10000,
        enablePreWarming: false,
      };
      
      const customPool = new BrowserContextPool(browser, customConfig);
      
      try {
        // Verify configuration is applied by checking behavior
        const contexts = [];
        for (let i = 0; i < 6; i++) {
          const context = await customPool.getContext();
          contexts.push(context);
        }
        
        const metrics = customPool.getMetrics();
        expect(metrics.totalContexts).toBeLessThanOrEqual(5); // Respects maxPoolSize
      } finally {
        await customPool.cleanup();
      }
    });

    test('should work with default configuration', async () => {
      const defaultPool = new BrowserContextPool(browser);
      
      try {
        const context = await defaultPool.getContext();
        expect(context).toBeDefined();
        
        const metrics = defaultPool.getMetrics();
        expect(metrics.totalContexts).toBe(1);
      } finally {
        await defaultPool.cleanup();
      }
    });
  });
});