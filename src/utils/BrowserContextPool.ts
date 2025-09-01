import type { Browser, BrowserContext, Page } from '@playwright/test';
import { logger } from './logger';

/**
 * Configuration constants
 */
export const CONTEXT_POOL_CONSTANTS = {
  DEFAULT_MAX_POOL_SIZE: 5,
  DEFAULT_MAX_CONTEXT_AGE: 30 * 60 * 1000, // 30 minutes
  DEFAULT_MIN_WARM_CONTEXTS: 2,
  DEFAULT_HEALTH_CHECK_INTERVAL: 5 * 60 * 1000, // 5 minutes
  DEFAULT_FAILURE_THRESHOLD: 3,
  HEALTH_CHECK_FAILURE_THRESHOLD: 5,
  CONTEXT_REUSE_DETECTION_THRESHOLD: 10000, // 10 seconds
  ESTIMATED_REUSED_CONTEXT_AGE: 5 * 60 * 1000, // 5 minutes
} as const;

/**
 * Browser context options interface for type safety
 */
export interface BrowserContextOptions {
  viewport?: { width: number; height: number };
  userAgent?: string;
  locale?: string;
  timezoneId?: string;
  permissions?: string[];
  geolocation?: { latitude: number; longitude: number };
  colorScheme?: 'light' | 'dark' | 'no-preference';
  extraHTTPHeaders?: Record<string, string>;
  httpCredentials?: { username: string; password: string };
  offline?: boolean;
  [key: string]: any;
}

/**
 * Configuration for browser context pooling
 */
export interface BrowserContextPoolConfig {
  /** Maximum number of contexts to maintain in the pool */
  maxPoolSize: number;
  /** Maximum age of a context in milliseconds before it's considered stale */
  maxContextAge: number;
  /** Minimum number of warm contexts to maintain */
  minWarmContexts: number;
  /** Context health check interval in milliseconds */
  healthCheckInterval: number;
  /** Enable/disable context pre-warming */
  enablePreWarming: boolean;
  /** Maximum failures before context is considered unhealthy */
  failureThreshold: number;
}

/**
 * Metadata for tracked browser contexts
 */
interface ContextMetadata {
  id: string;
  context: BrowserContext;
  createdAt: number;
  lastUsedAt: number;
  inUse: boolean;
  healthCheckCount: number;
  failureCount: number;
}

/**
 * Pool metrics for monitoring
 */
export interface PoolMetrics {
  totalContexts: number;
  activeContexts: number;
  warmContexts: number;
  averageAge: number;
  hitRate: number;
  totalHits: number;
  totalMisses: number;
}

/**
 * Browser context pool for efficient connection reuse
 * Provides warm context management with automatic lifecycle handling
 */
export class BrowserContextPool {
  private browser: Browser;
  private config: BrowserContextPoolConfig;
  private pool: Map<string, ContextMetadata> = new Map();
  private contextOptions: BrowserContextOptions;
  private healthCheckTimer: NodeJS.Timeout | undefined;
  private contextCounter: number = 0;
  private metrics: PoolMetrics = {
    totalContexts: 0,
    activeContexts: 0,
    warmContexts: 0,
    averageAge: 0,
    hitRate: 0,
    totalHits: 0,
    totalMisses: 0,
  };

  constructor(browser: Browser, config: Partial<BrowserContextPoolConfig> = {}, contextOptions: BrowserContextOptions = {}) {
    this.browser = browser;
    this.config = this.validateAndNormalizeConfig(config);
    this.contextOptions = contextOptions;

    logger.info('BrowserContextPool initialized', 'BrowserContextPool', {
      maxPoolSize: this.config.maxPoolSize,
      maxContextAge: this.config.maxContextAge,
      minWarmContexts: this.config.minWarmContexts,
    });

    // Start health check timer
    this.startHealthCheck();

    // Pre-warm contexts if enabled
    if (this.config.enablePreWarming) {
      this.preWarmContexts().catch(error => {
        logger.warn('Failed to pre-warm contexts', 'BrowserContextPool', { error: error.message });
      });
    }
  }

  /**
   * Get a browser context from the pool or create a new one
   */
  async getContext(): Promise<BrowserContext> {
    const availableContext = this.findAvailableContext();

    if (availableContext) {
      // Found reusable context
      availableContext.lastUsedAt = Date.now();
      availableContext.inUse = true;
      this.metrics.totalHits++;
      this.updateMetrics();

      logger.debug('Reusing context from pool', 'BrowserContextPool', {
        contextId: this.getContextId(availableContext.context),
        age: Date.now() - availableContext.createdAt,
        poolSize: this.pool.size,
      });

      return availableContext.context;
    }

    // Need to create new context
    this.metrics.totalMisses++;

    if (this.pool.size >= this.config.maxPoolSize) {
      // Pool is full, clean up oldest context
      await this.cleanupOldestContext();
    }

    const newContext = await this.createContext();
    this.updateMetrics();

    logger.debug('Created new context', 'BrowserContextPool', {
      contextId: this.getContextId(newContext),
      poolSize: this.pool.size,
    });

    return newContext;
  }

  /**
   * Release a context back to the pool
   */
  async releaseContext(context: BrowserContext): Promise<void> {
    const contextId = this.getContextId(context);
    const metadata = this.pool.get(contextId);

    if (metadata) {
      metadata.inUse = false;
      metadata.lastUsedAt = Date.now();
      this.updateMetrics();

      logger.debug('Released context back to pool', 'BrowserContextPool', {
        contextId,
        poolSize: this.pool.size,
      });
    }
  }

  /**
   * Get pool metrics for monitoring
   */
  getMetrics(): PoolMetrics {
    this.updateMetrics();
    return { ...this.metrics };
  }

  /**
   * Cleanup and close all contexts
   */
  async cleanup(): Promise<void> {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = undefined;
    }

    logger.info('Cleaning up context pool', 'BrowserContextPool', {
      poolSize: this.pool.size,
    });

    const cleanupPromises = Array.from(this.pool.values()).map(async metadata => {
      try {
        await metadata.context.close();
      } catch (error) {
        logger.warn('Failed to close context during cleanup', 'BrowserContextPool', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });

    await Promise.all(cleanupPromises);
    this.pool.clear();
    this.updateMetrics();
  }

  /**
   * Find an available context in the pool
   */
  private findAvailableContext(): ContextMetadata | null {
    const now = Date.now();

    for (const metadata of this.pool.values()) {
      if (
        !metadata.inUse &&
        now - metadata.createdAt < this.config.maxContextAge &&
        metadata.failureCount < this.config.failureThreshold // Skip contexts with too many failures
      ) {
        return metadata;
      }
    }

    return null;
  }

  /**
   * Create a new browser context and add to pool
   */
  private async createContext(): Promise<BrowserContext> {
    const context = await this.browser.newContext(this.contextOptions);
    const contextId = this.generateContextId();
    
    const metadata: ContextMetadata = {
      id: contextId,
      context,
      createdAt: Date.now(),
      lastUsedAt: Date.now(),
      inUse: true,
      healthCheckCount: 0,
      failureCount: 0,
    };

    this.pool.set(contextId, metadata);

    // Set up error handling for the context
    context.on('page', (page: Page) => {
      page.on('pageerror', error => {
        logger.warn('Page error in pooled context', 'BrowserContextPool', {
          contextId,
          error: error.message,
        });
        
        const meta = this.pool.get(contextId);
        if (meta && meta.failureCount < this.config.failureThreshold) {
          meta.failureCount++;
          
          if (meta.failureCount >= this.config.failureThreshold) {
            logger.warn('Context reached failure threshold, will be removed', 'BrowserContextPool', {
              contextId,
              failureCount: meta.failureCount,
              threshold: this.config.failureThreshold,
            });
          }
        }
      });
    });

    return context;
  }

  /**
   * Clean up the oldest context to make room for new ones
   */
  private async cleanupOldestContext(): Promise<void> {
    let oldestMetadata: ContextMetadata | null = null;
    let oldestContextId = '';

    for (const [contextId, metadata] of this.pool.entries()) {
      if (!metadata.inUse && (!oldestMetadata || metadata.createdAt < oldestMetadata.createdAt)) {
        oldestMetadata = metadata;
        oldestContextId = contextId;
      }
    }

    if (oldestMetadata) {
      try {
        await oldestMetadata.context.close();
        this.pool.delete(oldestContextId);

        logger.debug('Cleaned up oldest context', 'BrowserContextPool', {
          contextId: oldestContextId,
          age: Date.now() - oldestMetadata.createdAt,
        });
      } catch (error) {
        logger.warn('Failed to cleanup context', 'BrowserContextPool', {
          contextId: oldestContextId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  /**
   * Pre-warm contexts to reduce cold starts
   */
  private async preWarmContexts(): Promise<void> {
    const contextsToCreate = Math.max(0, this.config.minWarmContexts - this.pool.size);

    if (contextsToCreate > 0) {
      logger.debug('Pre-warming contexts', 'BrowserContextPool', {
        contextsToCreate,
        currentPoolSize: this.pool.size,
      });

      const warmingPromises = Array.from({ length: contextsToCreate }, async () => {
        try {
          const context = await this.createContext();
          const metadata = this.pool.get(this.getContextId(context));
          if (metadata) {
            metadata.inUse = false; // Mark as available immediately
          }
        } catch (error) {
          logger.warn('Failed to pre-warm context', 'BrowserContextPool', {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      });

      await Promise.all(warmingPromises);
    }
  }

  /**
   * Start periodic health checks
   */
  private startHealthCheck(): void {
    this.healthCheckTimer = setInterval(async () => {
      await this.performHealthCheck();
    }, this.config.healthCheckInterval);
  }

  /**
   * Perform health check on all contexts
   */
  private async performHealthCheck(): Promise<void> {
    const now = Date.now();
    const contextsToRemove: string[] = [];

    for (const [contextId, metadata] of this.pool.entries()) {
      metadata.healthCheckCount++;

      // Remove stale contexts
      if (now - metadata.createdAt > this.config.maxContextAge) {
        if (!metadata.inUse) {
          contextsToRemove.push(contextId);
        }
        continue;
      }

      // Remove contexts with too many failures
      if (metadata.failureCount > CONTEXT_POOL_CONSTANTS.HEALTH_CHECK_FAILURE_THRESHOLD) {
        if (!metadata.inUse) {
          contextsToRemove.push(contextId);
        }
        continue;
      }

      // Test context health by checking if it's still connected
      try {
        await metadata.context.pages(); // Simple health check
      } catch (error) {
        logger.warn('Context failed health check', 'BrowserContextPool', {
          contextId,
          error: error instanceof Error ? error.message : String(error),
        });
        metadata.failureCount++;
        
        if (!metadata.inUse) {
          contextsToRemove.push(contextId);
        }
      }
    }

    // Clean up unhealthy contexts
    for (const contextId of contextsToRemove) {
      const metadata = this.pool.get(contextId);
      if (metadata) {
        try {
          await metadata.context.close();
        } catch (error) {
          // Ignore errors during cleanup
        }
        this.pool.delete(contextId);
      }
    }

    if (contextsToRemove.length > 0) {
      logger.debug('Health check completed', 'BrowserContextPool', {
        removedContexts: contextsToRemove.length,
        currentPoolSize: this.pool.size,
      });
    }

    // Pre-warm contexts if needed
    if (this.config.enablePreWarming && this.pool.size < this.config.minWarmContexts) {
      await this.preWarmContexts();
    }

    this.updateMetrics();
  }

  /**
   * Generate a unique ID for a context
   */
  private generateContextId(): string {
    const timestamp = Date.now();
    const counter = ++this.contextCounter;
    const processId = process.pid || 0;
    return `ctx_${processId}_${timestamp}_${counter.toString(36)}`;
  }

  /**
   * Get context ID from metadata (for existing contexts)
   */
  private getContextId(context: BrowserContext): string {
    for (const [id, metadata] of this.pool.entries()) {
      if (metadata.context === context) {
        return id;
      }
    }
    // Fallback - this shouldn't happen in normal operation
    return this.generateContextId();
  }

  /**
   * Validate and normalize configuration with proper error handling
   */
  private validateAndNormalizeConfig(config: Partial<BrowserContextPoolConfig>): BrowserContextPoolConfig {
    const normalized: BrowserContextPoolConfig = {
      maxPoolSize: this.validatePositiveInteger(config.maxPoolSize, CONTEXT_POOL_CONSTANTS.DEFAULT_MAX_POOL_SIZE, 'maxPoolSize'),
      maxContextAge: this.validatePositiveInteger(config.maxContextAge, CONTEXT_POOL_CONSTANTS.DEFAULT_MAX_CONTEXT_AGE, 'maxContextAge'),
      minWarmContexts: this.validatePositiveInteger(config.minWarmContexts, CONTEXT_POOL_CONSTANTS.DEFAULT_MIN_WARM_CONTEXTS, 'minWarmContexts'),
      healthCheckInterval: this.validatePositiveInteger(config.healthCheckInterval, CONTEXT_POOL_CONSTANTS.DEFAULT_HEALTH_CHECK_INTERVAL, 'healthCheckInterval'),
      enablePreWarming: config.enablePreWarming ?? true,
      failureThreshold: this.validatePositiveInteger(config.failureThreshold, CONTEXT_POOL_CONSTANTS.DEFAULT_FAILURE_THRESHOLD, 'failureThreshold'),
    };

    // Validate logical constraints
    if (normalized.minWarmContexts > normalized.maxPoolSize) {
      logger.warn('minWarmContexts exceeds maxPoolSize, adjusting', 'BrowserContextPool', {
        minWarmContexts: normalized.minWarmContexts,
        maxPoolSize: normalized.maxPoolSize,
      });
      normalized.minWarmContexts = normalized.maxPoolSize;
    }

    return normalized;
  }

  /**
   * Validate positive integer configuration values
   */
  private validatePositiveInteger(value: number | undefined, defaultValue: number, name: string): number {
    if (value === undefined) {
      return defaultValue;
    }
    
    if (!Number.isInteger(value) || value <= 0) {
      logger.warn(`Invalid ${name} value, using default`, 'BrowserContextPool', {
        provided: value,
        default: defaultValue,
      });
      return defaultValue;
    }
    
    return value;
  }

  /**
   * Update pool metrics
   */
  private updateMetrics(): void {
    const now = Date.now();
    let totalAge = 0;
    let activeContexts = 0;
    let warmContexts = 0;

    for (const metadata of this.pool.values()) {
      totalAge += now - metadata.createdAt;
      
      if (metadata.inUse) {
        activeContexts++;
      } else {
        warmContexts++;
      }
    }

    this.metrics.totalContexts = this.pool.size;
    this.metrics.activeContexts = activeContexts;
    this.metrics.warmContexts = warmContexts;
    this.metrics.averageAge = this.pool.size > 0 ? totalAge / this.pool.size : 0;
    
    const totalRequests = this.metrics.totalHits + this.metrics.totalMisses;
    this.metrics.hitRate = totalRequests > 0 ? this.metrics.totalHits / totalRequests : 0;
  }
}

/**
 * Global context pool instance for singleton usage
 */
let globalContextPool: BrowserContextPool | null = null;

/**
 * Initialize the global context pool
 */
export function initializeGlobalContextPool(
  browser: Browser,
  config?: Partial<BrowserContextPoolConfig>,
  contextOptions?: any
): BrowserContextPool {
  if (globalContextPool) {
    throw new Error('Global context pool already initialized');
  }

  globalContextPool = new BrowserContextPool(browser, config, contextOptions);
  return globalContextPool;
}

/**
 * Get the global context pool instance
 */
export function getGlobalContextPool(): BrowserContextPool {
  if (!globalContextPool) {
    throw new Error('Global context pool not initialized. Call initializeGlobalContextPool first.');
  }

  return globalContextPool;
}

/**
 * Cleanup the global context pool
 */
export async function cleanupGlobalContextPool(): Promise<void> {
  if (globalContextPool) {
    await globalContextPool.cleanup();
    globalContextPool = null;
  }
}