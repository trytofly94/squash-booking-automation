/**
 * Selector Cache Initialization Utility
 * Handles global cache setup and configuration loading
 */

import { getGlobalSelectorCache, resetGlobalSelectorCache } from './SelectorCache';
import { ConfigurationManager } from './ConfigurationManager';
import { logger } from './logger';

/**
 * Initialize the global selector cache with configuration
 */
export function initializeGlobalSelectorCache(): void {
  const component = 'CacheInitializer.initializeGlobalSelectorCache';
  
  try {
    // Reset any existing cache first
    resetGlobalSelectorCache();
    
    // Get cache configuration from ConfigurationManager
    const configManager = ConfigurationManager.getInstance();
    const cacheConfig = configManager.getSelectorCacheConfig();
    
    // Initialize global cache with configuration
    const cache = getGlobalSelectorCache(cacheConfig);
    
    logger.info('Global selector cache initialized', component, {
      enabled: cacheConfig.enabled,
      maxSize: cacheConfig.maxSize,
      ttlMs: cacheConfig.ttlMs,
      debugMode: cacheConfig.debugMode
    });
    
    // Log performance report every 5 minutes if debug mode is enabled
    if (cacheConfig.debugMode && cacheConfig.enabled) {
      const interval = setInterval(() => {
        try {
          cache.logCacheStatus();
        } catch (error) {
          logger.warn('Error logging cache status', component, {
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }, 300000); // 5 minutes
      
      // Clean up interval on process exit
      process.on('exit', () => {
        clearInterval(interval);
      });
    }
    
  } catch (error) {
    logger.error('Failed to initialize global selector cache', component, {
      error: error instanceof Error ? error.message : String(error)
    });
    
    // Cache initialization failure should not crash the application
    // The system will work without caching
  }
}

/**
 * Get cache initialization status
 */
export function isCacheInitialized(): boolean {
  try {
    getGlobalSelectorCache();
    return true;
  } catch {
    return false;
  }
}

/**
 * Cleanup and reset global cache (for testing or restart scenarios)
 */
export function cleanupGlobalCache(): void {
  const component = 'CacheInitializer.cleanupGlobalCache';
  
  try {
    if (isCacheInitialized()) {
      const cache = getGlobalSelectorCache();
      cache.clear();
      logger.info('Global cache cleared', component);
    }
    
    resetGlobalSelectorCache();
    logger.info('Global cache reset', component);
  } catch (error) {
    logger.warn('Error during cache cleanup', component, {
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

/**
 * Get cache performance metrics if available
 */
export function getCacheMetrics() {
  try {
    if (isCacheInitialized()) {
      const cache = getGlobalSelectorCache();
      return cache.getMetrics();
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Force cache status logging
 */
export function logCacheStatus(): void {
  const component = 'CacheInitializer.logCacheStatus';
  
  try {
    if (isCacheInitialized()) {
      const cache = getGlobalSelectorCache();
      cache.logCacheStatus();
    } else {
      logger.info('Selector cache not initialized', component);
    }
  } catch (error) {
    logger.warn('Error logging cache status', component, {
      error: error instanceof Error ? error.message : String(error)
    });
  }
}