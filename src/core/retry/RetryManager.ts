/**
 * Main retry manager that orchestrates the entire retry mechanism
 * Integrates p-retry with custom error classification, circuit breaker,
 * and intelligent retry strategies
 */

import pRetry, { AbortError } from 'p-retry';
import { 
  RetryConfig, 
  RetryResult, 
  RetryAttemptInfo, 
  RetryableErrorType, 
  CircuitBreakerState,
  ErrorRetryStrategy 
} from './RetryConfig';
import { ErrorClassifier } from './ErrorClassifier';
import { CircuitBreaker } from './CircuitBreaker';
import { RetryStrategies } from './RetryStrategies';
import { logger } from '../../utils/logger';


/**
 * Options for retry operation
 */
export interface RetryOptions {
  /** Operation name for logging */
  operation: string;
  /** Context information for logging */
  context?: Record<string, unknown>;
  /** Override error classification */
  errorType?: RetryableErrorType;
  /** Override retry strategy */
  strategy?: Partial<ErrorRetryStrategy>;
  /** Disable circuit breaker for this operation */
  skipCircuitBreaker?: boolean;
  /** Custom signal for aborting retry */
  signal?: AbortSignal;
  /** Timeout for entire retry operation */
  timeoutMs?: number;
}

/**
 * Retry operation execution function
 */
export type RetryableOperation<T> = () => Promise<T>;

/**
 * Main retry manager that orchestrates sophisticated retry mechanisms
 */
export class RetryManager {
  private config: RetryConfig;
  private circuitBreaker: CircuitBreaker;
  private readonly component = 'RetryManager';

  constructor(config: RetryConfig) {
    this.config = config;
    this.circuitBreaker = new CircuitBreaker(config.circuitBreaker);

    // Log circuit breaker events if detailed logging is enabled
    if (config.global.enableDetailedLogging) {
      this.circuitBreaker.addEventListener((event) => {
        logger.debug('Circuit breaker event', this.component, {
          event: event.event,
          state: event.state,
          previousState: event.previousState,
          context: event.context
        });
      });
    }

    logger.info('RetryManager initialized', this.component, {
      globalEnabled: config.global.enabled,
      circuitBreakerEnabled: config.circuitBreaker.enabled,
      detailedLogging: config.global.enableDetailedLogging
    });
  }

  /**
   * Execute an operation with intelligent retry mechanism
   */
  async execute<T>(
    operation: RetryableOperation<T>,
    options: RetryOptions
  ): Promise<RetryResult<T>> {
    const startTime = Date.now();
    const attempts: RetryAttemptInfo[] = [];
    let circuitBreakerTripped = false;

    // Check if retry system is globally enabled
    if (!this.config.global.enabled) {
      try {
        const result = await operation();
        return {
          success: true,
          result,
          totalAttempts: 1,
          totalTimeMs: Date.now() - startTime,
          attempts: [],
          circuitBreakerTripped: false
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error : new Error(String(error)),
          totalAttempts: 1,
          totalTimeMs: Date.now() - startTime,
          attempts: [],
          circuitBreakerTripped: false
        };
      }
    }

    logger.info('Starting retry operation', this.component, {
      operation: options.operation,
      context: options.context,
      overrideErrorType: options.errorType,
      hasCustomStrategy: !!options.strategy,
      skipCircuitBreaker: options.skipCircuitBreaker,
      timeoutMs: options.timeoutMs
    });

    try {
      // Setup timeout if specified
      const timeoutPromise = options.timeoutMs 
        ? new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error(`Operation timeout: ${options.timeoutMs}ms`)), options.timeoutMs);
          })
        : null;

      const retryPromise = this.executeWithPRetry(operation, options, attempts, startTime);

      const result = timeoutPromise 
        ? await Promise.race([retryPromise, timeoutPromise])
        : await retryPromise;

      const totalTimeMs = Date.now() - startTime;

      logger.info('Retry operation succeeded', this.component, {
        operation: options.operation,
        totalAttempts: attempts.length + 1,
        totalTimeMs,
        finalState: this.circuitBreaker.getState()
      });

      return {
        success: true,
        result,
        totalAttempts: attempts.length + 1,
        totalTimeMs,
        attempts,
        circuitBreakerTripped
      };

    } catch (error) {
      const totalTimeMs = Date.now() - startTime;
      const finalError = error instanceof Error ? error : new Error(String(error));

      // Check if circuit breaker tripped during execution
      circuitBreakerTripped = this.circuitBreaker.getState() === CircuitBreakerState.OPEN;

      logger.error('Retry operation failed', this.component, {
        operation: options.operation,
        error: finalError.message,
        totalAttempts: attempts.length + 1,
        totalTimeMs,
        circuitBreakerTripped,
        finalState: this.circuitBreaker.getState()
      });

      return {
        success: false,
        error: finalError,
        totalAttempts: attempts.length + 1,
        totalTimeMs,
        attempts,
        circuitBreakerTripped
      };
    }
  }

  /**
   * Execute operation using p-retry with custom logic
   */
  private async executeWithPRetry<T>(
    operation: RetryableOperation<T>,
    options: RetryOptions,
    attempts: RetryAttemptInfo[],
    startTime: number
  ): Promise<T> {
    return pRetry(async (attemptNumber: number) => {
      const attemptStartTime = Date.now();

      // Check circuit breaker (unless skipped)
      if (!options.skipCircuitBreaker && !this.circuitBreaker.canExecute()) {
        const error = new Error('Circuit breaker is OPEN - failing fast');
        throw new AbortError(error.message); // Don't retry when circuit is open
      }

      try {
        // Execute the operation
        const result = await operation();

        // Record success in circuit breaker
        if (!options.skipCircuitBreaker) {
          this.circuitBreaker.recordSuccess();
        }

        logger.debug('Operation attempt succeeded', this.component, {
          operation: options.operation,
          attemptNumber,
          elapsedMs: Date.now() - attemptStartTime
        });

        return result;

      } catch (error) {
        const attemptError = error instanceof Error ? error : new Error(String(error));
        const elapsedMs = Date.now() - startTime;

        // Classify the error
        const errorType = options.errorType || ErrorClassifier.getErrorType(attemptError);

        // Get retry strategy
        const baseStrategy = this.getStrategyForError(errorType, options.operation);
        const strategy = options.strategy ? { ...baseStrategy, ...options.strategy } : baseStrategy;

        // Record failure in circuit breaker
        if (!options.skipCircuitBreaker && strategy.useCircuitBreaker) {
          this.circuitBreaker.recordFailure(attemptError);
        }

        // Create attempt info
        const attemptInfo = RetryStrategies.createAttemptInfo(
          attemptNumber,
          strategy.maxAttempts,
          attemptError,
          errorType,
          0, // Will be filled in by p-retry
          elapsedMs,
          strategy,
          options.operation,
          this.circuitBreaker.getState()
        );
        attempts.push(attemptInfo);

        // Make retry decision
        const retryDecision = RetryStrategies.shouldRetry(
          errorType,
          strategy,
          attemptNumber,
          attemptError
        );

        if (!retryDecision.shouldRetry) {
          logger.warn('Retry decision: do not retry', this.component, {
            operation: options.operation,
            attemptNumber,
            errorType,
            reason: retryDecision.reason,
            errorMessage: attemptError.message
          });
          
          throw new AbortError(attemptError.message); // Don't retry
        }

        logger.debug('Retry decision: will retry', this.component, {
          operation: options.operation,
          attemptNumber,
          errorType,
          reason: retryDecision.reason,
          delayMs: retryDecision.delayMs,
          maxAttempts: strategy.maxAttempts,
          errorMessage: attemptError.message
        });

        // Update attempt info with delay
        attemptInfo.delayMs = retryDecision.delayMs || 0;

        throw attemptError; // Let p-retry handle the retry
      }
    }, {
      retries: this.config.global.defaultMaxAttempts - 1, // Use global max attempts
      
      minTimeout: 0, // We'll handle delays ourselves
      maxTimeout: 0, // We'll handle delays ourselves
      
      onFailedAttempt: async (error: any) => {
        const errorType = options.errorType || ErrorClassifier.getErrorType(error.error);
        const baseStrategy = this.getStrategyForError(errorType, options.operation);
        const strategy = options.strategy ? { ...baseStrategy, ...options.strategy } : baseStrategy;
        
        // Calculate our custom delay
        const delayCalc = RetryStrategies.calculateDelay(strategy, error.attemptNumber + 1);
        
        if (delayCalc.delayMs > 0) {
          logger.debug('Waiting before retry', this.component, {
            operation: options.operation,
            attemptNumber: error.attemptNumber,
            delayMs: delayCalc.delayMs,
            baseDelayMs: delayCalc.baseDelayMs,
            jitterMs: delayCalc.jitterMs
          });

          await this.delay(delayCalc.delayMs);
        }
      },

      ...(options.signal && { signal: options.signal })
    });
  }

  /**
   * Get retry strategy for specific error type and operation
   */
  private getStrategyForError(errorType: RetryableErrorType, operation: string): ErrorRetryStrategy {
    // Start with base strategy for error type
    const baseStrategy = this.config.errorStrategies[errorType];
    
    // Apply operation-specific overrides
    let strategy = { ...baseStrategy };
    
    const operationOverrides = this.config.operationOverrides;
    let override: Partial<ErrorRetryStrategy> | undefined;

    // Determine which operation override to apply
    if (operation.toLowerCase().includes('navigation') || operation.toLowerCase().includes('navigate')) {
      override = operationOverrides.navigation;
    } else if (operation.toLowerCase().includes('slot') || operation.toLowerCase().includes('search')) {
      override = operationOverrides.slotSearch;
    } else if (operation.toLowerCase().includes('booking') || operation.toLowerCase().includes('book')) {
      override = operationOverrides.bookingExecution;
    } else if (operation.toLowerCase().includes('checkout') || operation.toLowerCase().includes('payment')) {
      override = operationOverrides.checkout;
    }

    // Apply override if found
    if (override) {
      strategy = { ...strategy, ...override };
    }

    return strategy;
  }

  /**
   * Simple delay utility
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Execute operation with simplified interface (auto-detects error type)
   */
  async executeSimple<T>(
    operation: RetryableOperation<T>,
    operationName: string,
    context?: Record<string, unknown>
  ): Promise<T> {
    const options: RetryOptions = {
      operation: operationName
    };
    
    if (context) {
      options.context = context;
    }
    
    const result = await this.execute(operation, options);

    if (result.success && result.result !== undefined) {
      return result.result;
    } else {
      throw result.error || new Error('Operation failed without specific error');
    }
  }

  /**
   * Execute operation with timeout
   */
  async executeWithTimeout<T>(
    operation: RetryableOperation<T>,
    operationName: string,
    timeoutMs: number,
    context?: Record<string, unknown>
  ): Promise<T> {
    const options: RetryOptions = {
      operation: operationName,
      timeoutMs
    };
    
    if (context) {
      options.context = context;
    }
    
    const result = await this.execute(operation, options);

    if (result.success && result.result !== undefined) {
      return result.result;
    } else {
      throw result.error || new Error('Operation failed without specific error');
    }
  }

  /**
   * Get current retry manager statistics
   */
  getStats() {
    return {
      config: this.config,
      circuitBreaker: this.circuitBreaker.getStats(),
      isEnabled: this.config.global.enabled
    };
  }

  /**
   * Update retry configuration
   */
  updateConfig(newConfig: Partial<RetryConfig>): void {
    this.config = { ...this.config, ...newConfig };
    
    if (newConfig.circuitBreaker) {
      this.circuitBreaker.updateConfig(newConfig.circuitBreaker);
    }

    logger.info('RetryManager configuration updated', this.component, {
      updatedKeys: Object.keys(newConfig)
    });
  }

  /**
   * Reset circuit breaker state
   */
  resetCircuitBreaker(): void {
    this.circuitBreaker.reset();
    logger.info('Circuit breaker reset', this.component);
  }

  /**
   * Get circuit breaker state
   */
  getCircuitBreakerState(): CircuitBreakerState {
    return this.circuitBreaker.getState();
  }

  /**
   * Check if requests are currently allowed
   */
  isRequestAllowed(): boolean {
    return !this.config.global.enabled || this.circuitBreaker.canExecute();
  }

  /**
   * Force circuit breaker to open (useful for testing/maintenance)
   */
  forceCircuitBreakerOpen(): void {
    this.circuitBreaker.forceOpen();
    logger.warn('Circuit breaker forced open', 'RetryManager');
  }

  /**
   * Test retry configuration with a simple operation
   */
  async testConfiguration(): Promise<{
    success: boolean;
    message: string;
    stats: {
      config: RetryConfig;
      circuitBreaker: ReturnType<CircuitBreaker['getStats']>;
      isEnabled: boolean;
    };
  }> {
    try {
      const testOperation = async () => {
        await this.delay(100);
        return 'test-success';
      };

      const result = await this.execute(testOperation, {
        operation: 'configuration-test',
        context: { test: true }
      });

      return {
        success: result.success,
        message: result.success ? 'Configuration test passed' : `Configuration test failed: ${result.error?.message}`,
        stats: this.getStats()
      };
    } catch (error) {
      return {
        success: false,
        message: `Configuration test error: ${error instanceof Error ? error.message : String(error)}`,
        stats: this.getStats()
      };
    }
  }
}