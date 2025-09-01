/**
 * Main retry manager with p-retry integration
 * Orchestrates retry operations with circuit breaker and error-specific strategies
 */

// Dynamic import for ESM-only p-retry module with test compatibility
let pRetry: any;
let AbortError: any;

// Initialize p-retry using dynamic import with fallback for tests
const initPRetry = async () => {
  if (!pRetry) {
    try {
      // Try dynamic import first (production)
      const pRetryModule: any = await import('p-retry');
      // p-retry v6+ exports the function as 'pRetry' and 'default' is an object
      pRetry = pRetryModule.pRetry || pRetryModule.default;
      AbortError = pRetryModule.AbortError || pRetryModule.default?.AbortError;
    } catch (error) {
      // Fallback for test environment - try require for mocked module
      try {
        const pRetryModule = require('p-retry');
        pRetry = pRetryModule.default || pRetryModule;
        AbortError = pRetryModule.AbortError;
      } catch (requireError) {
        throw new Error(`Failed to load p-retry module: ${error}`);
      }
    }
  }
};
import {
  RetryableOperation,
  RetryResult,
  RetryConfig,
  RetryEventHandlers,
  ErrorClassification,
  CircuitState
} from '../../types/retry.types';
import { CircuitBreaker } from './CircuitBreaker';
import { errorClassifier } from './RetryStrategies';
import { logger } from '../../utils/logger';
import { performanceMonitor } from '../../utils/PerformanceMonitor';
import { correlationManager } from '../../utils/CorrelationManager';

/**
 * Main retry manager class providing robust retry capabilities
 */
export class RetryManager {
  private circuitBreaker: CircuitBreaker;
  private eventHandlers: RetryEventHandlers = {};
  private component = 'RetryManager';

  constructor(private config: RetryConfig) {
    this.circuitBreaker = new CircuitBreaker(config.circuitBreaker);
    
    logger.info('Retry manager initialized', this.component, {
      enabled: config.enabled,
      maxAttempts: config.maxAttempts,
      circuitBreakerEnabled: config.circuitBreaker.failureThreshold > 0
    });
  }

  /**
   * Execute operation with retry logic and circuit breaker protection
   */
  async execute<T>(
    operation: RetryableOperation<T>,
    operationName = 'unknown-operation'
  ): Promise<RetryResult<T>> {
    const correlationId = correlationManager.getCurrentCorrelationId() || correlationManager.generateCorrelationId();
    const startTime = Date.now();
    let circuitBreakerTriggered = false;

    // Check if retry is disabled
    if (!this.config.enabled) {
      logger.debug('Retry disabled, executing operation once', this.component, {
        operationName,
        correlationId
      });
      
      const result = await operation();
      return {
        result,
        attempts: 1,
        duration: Date.now() - startTime,
        lastError: undefined,
        circuitBreakerTriggered: false
      };
    }

    logger.info('Starting retry operation', this.component, {
      operationName,
      correlationId,
      maxAttempts: this.config.maxAttempts,
      circuitBreakerState: this.circuitBreaker.getState()
    });

    try {
      // Execute with circuit breaker protection
      const result = await this.circuitBreaker.execute(async () => {
        return await this.executeWithPRetry(operation, operationName, correlationId);
      }, operationName);

      const duration = Date.now() - startTime;
      
      logger.info('Retry operation completed successfully', this.component, {
        operationName,
        correlationId,
        duration,
        circuitBreakerState: this.circuitBreaker.getState()
      });

      return {
        result,
        attempts: 1, // Will be updated by p-retry callback
        duration,
        lastError: undefined,
        circuitBreakerTriggered
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      const isCircuitBreakerError = error instanceof Error && 
                                   error.message.includes('Circuit breaker is OPEN');
      
      if (isCircuitBreakerError) {
        circuitBreakerTriggered = true;
      }

      logger.error('Retry operation failed permanently', this.component, {
        operationName,
        correlationId,
        duration,
        finalError: error instanceof Error ? error.message : String(error),
        circuitBreakerTriggered,
        circuitBreakerState: this.circuitBreaker.getState()
      });

      // Call abort handler if configured
      if (this.eventHandlers.onAbort) {
        this.eventHandlers.onAbort(error, 'All retry attempts exhausted');
      }

      throw error;
    }
  }

  /**
   * Execute operation with p-retry
   */
  private async executeWithPRetry<T>(
    operation: RetryableOperation<T>,
    operationName: string,
    correlationId: string
  ): Promise<T> {

    // Initialize p-retry if not already done
    await initPRetry();

    return await pRetry(async (attemptNumber: number) => {
      
      const attemptStartTime = Date.now();
      
      logger.debug('Executing retry attempt', this.component, {
        operationName,
        correlationId,
        attempt: attemptNumber,
        maxAttempts: this.config.maxAttempts
      });

      try {
        // Execute the operation with performance tracking
        const measureResult = await performanceMonitor.measureAsyncFunction(
          `retry-attempt-${operationName}-${attemptNumber}`,
          'RetryManager',
          operation
        );
        const result = measureResult.result;

        const attemptDuration = Date.now() - attemptStartTime;
        
        logger.info('Retry attempt succeeded', this.component, {
          operationName,
          correlationId,
          attempt: attemptNumber,
          duration: attemptDuration
        });

        // Call success handler if configured
        if (this.eventHandlers.onSuccess) {
          this.eventHandlers.onSuccess(result, attemptNumber);
        }

        return result;
        
      } catch (error) {
        const attemptDuration = Date.now() - attemptStartTime;
        const classification = this.classifyAndHandleError(
          error,
          operationName,
          attemptNumber,
          attemptDuration,
          correlationId
        );

        // If error should not be retried, abort immediately
        if (classification.shouldAbort) {
          logger.warn('Aborting retry due to non-retryable error', this.component, {
            operationName,
            correlationId,
            attempt: attemptNumber,
            errorCategory: classification.category,
            reason: classification.reason
          });
          
          throw new AbortError(classification.reason || 'Non-retryable error');
        }

        // Re-throw error for p-retry to handle
        throw error;
      }
    }, {
      retries: this.config.maxAttempts - 1, // p-retry counts retries, not total attempts
      factor: 2, // Will be overridden by error-specific strategy
      minTimeout: this.config.minDelay,
      maxTimeout: this.config.maxDelay,
      randomize: this.config.jitterEnabled,
      
      onFailedAttempt: (error: any) => {
        const classification = errorClassifier.classify(error);
        
        // Use error-specific strategy
        const strategy = classification.strategy;
        
        logger.warn('Retry attempt failed, will retry with strategy', this.component, {
          operationName,
          correlationId,
          attempt: error.attemptNumber,
          errorCategory: classification.category,
          nextRetryIn: strategy.minTimeout,
          retriesLeft: error.retriesLeft
        });

        // Call retry event handler
        if (this.eventHandlers.onRetry) {
          this.eventHandlers.onRetry(error, error.attemptNumber);
        }

        // Call failed attempt handler
        if (this.eventHandlers.onFailedAttempt) {
          this.eventHandlers.onFailedAttempt(error, error.attemptNumber);
        }
      }
    });
  }

  /**
   * Classify error and handle retry decision
   */
  private classifyAndHandleError(
    error: any,
    operationName: string,
    attempt: number,
    duration: number,
    correlationId: string
  ): ErrorClassification {
    const classification = errorClassifier.classify(error);
    
    logger.debug('Error classified for retry decision', this.component, {
      operationName,
      correlationId,
      attempt,
      duration,
      errorCategory: classification.category,
      shouldRetry: classification.shouldRetry,
      shouldAbort: classification.shouldAbort,
      httpStatus: classification.httpStatus
    });

    // Check if this error type should abort retries
    if (this.config.abortOnClientErrors && 
        classification.category === 'client_error') {
      return {
        ...classification,
        shouldAbort: true,
        reason: 'Client error - aborting retries'
      };
    }

    return classification;
  }

  /**
   * Execute operation with exponential backoff (simpler interface)
   */
  async executeWithBackoff<T>(
    operation: RetryableOperation<T>,
    operationName?: string
  ): Promise<T> {
    const result = await this.execute(operation, operationName);
    return result.result;
  }

  /**
   * Set event handlers for retry operations
   */
  setEventHandlers(handlers: Partial<RetryEventHandlers>): void {
    this.eventHandlers = { ...this.eventHandlers, ...handlers };
    
    logger.debug('Event handlers updated', this.component, {
      handlerTypes: Object.keys(handlers)
    });
  }

  /**
   * Get circuit breaker statistics
   */
  getCircuitBreakerStats() {
    return this.circuitBreaker.getStats();
  }

  /**
   * Get circuit breaker state
   */
  getCircuitBreakerState(): CircuitState {
    return this.circuitBreaker.getState();
  }

  /**
   * Reset circuit breaker (useful for testing)
   */
  resetCircuitBreaker(): void {
    this.circuitBreaker.reset();
    logger.info('Circuit breaker reset', this.component);
  }

  /**
   * Check if retry manager is healthy
   */
  isHealthy(): boolean {
    return this.circuitBreaker.isHealthy();
  }

  /**
   * Get current configuration
   */
  getConfig(): RetryConfig {
    return { ...this.config };
  }

  /**
   * Update configuration (useful for runtime adjustments)
   */
  updateConfig(updates: Partial<RetryConfig>): void {
    this.config = { ...this.config, ...updates };
    
    logger.info('Retry configuration updated', this.component, {
      updates: Object.keys(updates)
    });
  }

  /**
   * Create a retry-wrapped version of an operation
   */
  wrap<T>(
    operation: RetryableOperation<T>,
    operationName?: string
  ): () => Promise<T> {
    return async () => {
      return await this.executeWithBackoff(operation, operationName);
    };
  }

  /**
   * Execute multiple operations with shared circuit breaker
   */
  async executeAll<T>(
    operations: Array<{ operation: RetryableOperation<T>; name: string }>,
    options: { failFast?: boolean; maxConcurrent?: number } = {}
  ): Promise<Array<RetryResult<T>>> {
    const { failFast = false, maxConcurrent = operations.length } = options;
    
    logger.info('Executing multiple retry operations', this.component, {
      operationCount: operations.length,
      failFast,
      maxConcurrent
    });

    if (failFast) {
      // Execute sequentially, stop on first failure
      const results: Array<RetryResult<T>> = [];
      
      for (const { operation, name } of operations) {
        try {
          const result = await this.execute(operation, name);
          results.push(result);
        } catch (error) {
          logger.error('Fast-fail execution stopped', this.component, {
            completedOperations: results.length,
            failedOperation: name,
            error: error instanceof Error ? error.message : String(error)
          });
          throw error;
        }
      }
      
      return results;
    } else {
      // Execute with concurrency limit
      const executeOperation = async ({ operation, name }: typeof operations[0]) => {
        return await this.execute(operation, name);
      };

      // Simple concurrency control
      const results: Array<RetryResult<T>> = [];
      for (let i = 0; i < operations.length; i += maxConcurrent) {
        const batch = operations.slice(i, i + maxConcurrent);
        const batchResults = await Promise.all(
          batch.map(executeOperation)
        );
        results.push(...batchResults);
      }

      return results;
    }
  }
}