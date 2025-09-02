/**
 * Unit tests for CacheInitializer
 */

import { 
  initializeGlobalSelectorCache, 
  isCacheInitialized, 
  cleanupGlobalCache,
  getCacheMetrics,
  logCacheStatus
} from '../../src/utils/CacheInitializer';
import { resetGlobalSelectorCache, getGlobalSelectorCache } from '../../src/utils/SelectorCache';
import { ConfigurationManager } from '../../src/utils/ConfigurationManager';

// Mock dependencies
jest.mock('../../src/utils/logger');
jest.mock('../../src/utils/ConfigurationManager');
jest.mock('../../src/utils/SelectorCache');

describe('CacheInitializer', () => {
  let mockConfigManager: jest.Mocked<ConfigurationManager>;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock ConfigurationManager
    mockConfigManager = {
      getSelectorCacheConfig: jest.fn(() => ({
        enabled: true,
        maxSize: 100,
        ttlMs: 600000,
        debugMode: false
      }))
    } as any;

    jest.mocked(ConfigurationManager.getInstance).mockReturnValue(mockConfigManager);
  });

  describe('initializeGlobalSelectorCache', () => {
    it('should initialize global cache with configuration', () => {
      const mockCache = {
        logCacheStatus: jest.fn(),
        clear: jest.fn(),
        getMetrics: jest.fn(() => ({
          totalQueries: 0,
          cacheHits: 0,
          cacheMisses: 0,
          hitRate: 0,
          avgQueryTimeMs: 0,
          cacheSize: 0,
          pageInvalidations: 0,
          categoriesTracked: [],
          memoryUsageMB: 0
        }))
      };

      jest.mocked(getGlobalSelectorCache).mockReturnValue(mockCache as any);

      initializeGlobalSelectorCache();

      expect(resetGlobalSelectorCache).toHaveBeenCalled();
      expect(mockConfigManager.getSelectorCacheConfig).toHaveBeenCalled();
      expect(getGlobalSelectorCache).toHaveBeenCalledWith({
        enabled: true,
        maxSize: 100,
        ttlMs: 600000,
        debugMode: false
      });
    });

    it('should handle initialization errors gracefully', () => {
      jest.mocked(resetGlobalSelectorCache).mockImplementation(() => {
        throw new Error('Initialization failed');
      });

      // Should not throw
      expect(() => initializeGlobalSelectorCache()).not.toThrow();
    });

    it('should set up debug logging when debug mode is enabled', () => {
      const debugConfig = {
        enabled: true,
        maxSize: 100,
        ttlMs: 600000,
        debugMode: true
      };
      
      // Update the configuration to return debug config
      mockConfigManager.getSelectorCacheConfig.mockReturnValue(debugConfig);

      const mockCache = {
        logCacheStatus: jest.fn(),
        clear: jest.fn(),
        getMetrics: jest.fn(() => ({
          totalQueries: 0,
          cacheHits: 0,
          cacheMisses: 0,
          hitRate: 0,
          avgQueryTimeMs: 0,
          cacheSize: 0,
          pageInvalidations: 0,
          categoriesTracked: [],
          memoryUsageMB: 0
        }))
      };

      // Ensure resetGlobalSelectorCache doesn't throw an error
      jest.mocked(resetGlobalSelectorCache).mockImplementation(() => {});
      
      // Set up the mock to return the cache instance  
      jest.mocked(getGlobalSelectorCache).mockReturnValue(mockCache as any);

      // Call the function without throwing
      expect(() => initializeGlobalSelectorCache()).not.toThrow();

      // Verify the function was called
      expect(resetGlobalSelectorCache).toHaveBeenCalled();
      expect(mockConfigManager.getSelectorCacheConfig).toHaveBeenCalled();
      expect(getGlobalSelectorCache).toHaveBeenCalledWith(debugConfig);
    });
  });

  describe('isCacheInitialized', () => {
    it('should return true when cache is initialized', () => {
      const mockCache = { getMetrics: jest.fn() };
      jest.mocked(getGlobalSelectorCache).mockReturnValue(mockCache as any);

      const result = isCacheInitialized();
      expect(result).toBe(true);
    });

    it('should return false when cache is not initialized', () => {
      jest.mocked(getGlobalSelectorCache).mockImplementation(() => {
        throw new Error('Cache not initialized');
      });

      const result = isCacheInitialized();
      expect(result).toBe(false);
    });
  });

  describe('cleanupGlobalCache', () => {
    it('should cleanup initialized cache', () => {
      const mockCache = {
        clear: jest.fn(),
        getMetrics: jest.fn()
      };

      // First call (isCacheInitialized check) - return cache
      // Second call (actual cleanup) - return cache
      jest.mocked(getGlobalSelectorCache)
        .mockReturnValueOnce(mockCache as any)
        .mockReturnValueOnce(mockCache as any);

      cleanupGlobalCache();

      expect(mockCache.clear).toHaveBeenCalled();
      expect(resetGlobalSelectorCache).toHaveBeenCalled();
    });

    it('should handle cleanup when cache is not initialized', () => {
      jest.mocked(getGlobalSelectorCache).mockImplementation(() => {
        throw new Error('Cache not initialized');
      });

      // Should not throw
      expect(() => cleanupGlobalCache()).not.toThrow();
      expect(resetGlobalSelectorCache).toHaveBeenCalled();
    });

    it('should handle errors during cleanup gracefully', () => {
      const mockCache = {
        clear: jest.fn(() => { throw new Error('Clear failed'); }),
        getMetrics: jest.fn()
      };

      jest.mocked(getGlobalSelectorCache)
        .mockReturnValueOnce(mockCache as any)
        .mockReturnValueOnce(mockCache as any);

      // Should not throw
      expect(() => cleanupGlobalCache()).not.toThrow();
    });
  });

  describe('getCacheMetrics', () => {
    it('should return metrics when cache is initialized', () => {
      const mockMetrics = {
        totalQueries: 10,
        cacheHits: 7,
        cacheMisses: 3,
        hitRate: 0.7,
        avgQueryTimeMs: 50,
        cacheSize: 5,
        pageInvalidations: 1,
        categoriesTracked: ['test-category'],
        memoryUsageMB: 0.1
      };

      const mockCache = {
        getMetrics: jest.fn(() => mockMetrics)
      };

      jest.mocked(getGlobalSelectorCache).mockReturnValue(mockCache as any);

      const result = getCacheMetrics();
      expect(result).toEqual(mockMetrics);
      expect(mockCache.getMetrics).toHaveBeenCalled();
    });

    it('should return null when cache is not initialized', () => {
      jest.mocked(getGlobalSelectorCache).mockImplementation(() => {
        throw new Error('Cache not initialized');
      });

      const result = getCacheMetrics();
      expect(result).toBeNull();
    });
  });

  describe('logCacheStatus', () => {
    it('should log cache status when cache is initialized', () => {
      const mockCache = {
        logCacheStatus: jest.fn()
      };

      jest.mocked(getGlobalSelectorCache).mockReturnValue(mockCache as any);

      logCacheStatus();
      expect(mockCache.logCacheStatus).toHaveBeenCalled();
    });

    it('should handle case when cache is not initialized', () => {
      jest.mocked(getGlobalSelectorCache).mockImplementation(() => {
        throw new Error('Cache not initialized');
      });

      // Should not throw
      expect(() => logCacheStatus()).not.toThrow();
    });

    it('should handle errors during logging gracefully', () => {
      const mockCache = {
        logCacheStatus: jest.fn(() => { throw new Error('Logging failed'); })
      };

      jest.mocked(getGlobalSelectorCache).mockReturnValue(mockCache as any);

      // Should not throw
      expect(() => logCacheStatus()).not.toThrow();
    });
  });
});