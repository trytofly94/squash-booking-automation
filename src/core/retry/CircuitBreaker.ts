/**
 * Circuit Breaker implementation to prevent cascading failures
 * Implements the Circuit Breaker pattern with configurable thresholds
 */

import {
  CircuitState,
  CircuitBreakerConfig,
  CircuitBreakerStats,
  RetryableOperation
} from '../../types/retry.types';
import { logger } from '../../utils/logger';
import { performanceMonitor } from '../../utils/PerformanceMonitor';

/**
 * Circuit Breaker class implementing the Circuit Breaker pattern
 */
export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime = 0;
  private requestWindow: { timestamp: number; success: boolean }[] = [];
  
  constructor(private config: CircuitBreakerConfig) {
    logger.info('Circuit breaker initialized', 'CircuitBreaker', {
      config: this.config
    });
  }

  /**
   * Execute an operation through the circuit breaker
   */
  async execute<T>(
    operation: RetryableOperation<T>,
    operationName = 'unknown'
  ): Promise<T> {
    const startTime = Date.now();
    
    // Check if circuit should be opened or requests should be rejected
    if (this.state === CircuitState.OPEN) {
      if (this.shouldAllowRequest()) {
        this.state = CircuitState.HALF_OPEN;
        logger.info('Circuit breaker moving to HALF_OPEN state', 'CircuitBreaker', {
          operationName,
          previousFailures: this.failureCount
        });
      } else {
        const error = new Error(
          `Circuit breaker is OPEN. Last failure: ${new Date(this.lastFailureTime).toISOString()}`
        );
        logger.warn('Circuit breaker rejected request', 'CircuitBreaker', {
          operationName,
          state: this.state,
          failureCount: this.failureCount,
          timeSinceLastFailure: Date.now() - this.lastFailureTime
        });
        throw error;
      }
    }

    try {
      // Execute the operation with performance tracking
      const measureResult = await performanceMonitor.measureAsyncFunction(
        `circuit-breaker-${operationName}`,
        'CircuitBreaker',
        operation
      );
      const result = measureResult.result;
      
      this.onSuccess(operationName, Date.now() - startTime);
      return result;
      
    } catch (error) {
      this.onFailure(error, operationName, Date.now() - startTime);
      throw error;
    }
  }

  /**
   * Handle successful operation
   */
  private onSuccess(operationName: string, duration: number): void {
    this.successCount++;
    this.addToWindow({ timestamp: Date.now(), success: true });
    
    if (this.state === CircuitState.HALF_OPEN) {
      if (this.successCount >= this.config.successThreshold) {
        this.state = CircuitState.CLOSED;
        this.failureCount = 0;
        this.successCount = 0;
        
        logger.info('Circuit breaker closed after successful requests', 'CircuitBreaker', {
          operationName,
          duration,
          successCount: this.successCount,
          state: this.state
        });
      }
    }
    
    logger.debug('Circuit breaker operation succeeded', 'CircuitBreaker', {
      operationName,
      duration,
      state: this.state,
      successCount: this.successCount
    });
  }

  /**
   * Handle failed operation
   */
  private onFailure(error: any, operationName: string, duration: number): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    this.addToWindow({ timestamp: Date.now(), success: false });
    
    const stats = this.getStats();
    
    logger.warn('Circuit breaker operation failed', 'CircuitBreaker', {
      operationName,
      duration,
      error: error instanceof Error ? error.message : String(error),
      failureCount: this.failureCount,
      failureRate: stats.failureRate,
      state: this.state
    });
    
    // Check if we should open the circuit
    if (this.shouldOpenCircuit(stats)) {
      this.state = CircuitState.OPEN;
      this.successCount = 0;
      
      logger.error('Circuit breaker opened due to excessive failures', 'CircuitBreaker', {
        operationName,
        failureCount: this.failureCount,
        failureRate: stats.failureRate,
        requestVolume: stats.totalRequests,
        threshold: this.config.failureThreshold
      });
    }
  }

  /**
   * Check if circuit should be opened based on failure statistics
   */
  private shouldOpenCircuit(stats: CircuitBreakerStats): boolean {
    // If in HALF_OPEN state, any failure should reopen the circuit
    if (this.state === CircuitState.HALF_OPEN) {
      return true;
    }
    
    // Circuit is already open
    if (this.state === CircuitState.OPEN) {
      return false;
    }
    
    // For CLOSED state, check thresholds
    // Not enough requests to make a decision
    if (stats.totalRequests < this.config.requestVolumeThreshold) {
      return false;
    }
    
    // Check failure threshold
    return this.failureCount >= this.config.failureThreshold;
  }

  /**
   * Check if a request should be allowed when circuit is open
   */
  private shouldAllowRequest(): boolean {
    const timeSinceLastFailure = Date.now() - this.lastFailureTime;
    return timeSinceLastFailure >= this.config.recoveryTimeout;
  }

  /**
   * Add request result to rolling window
   */
  private addToWindow(entry: { timestamp: number; success: boolean }): void {
    const now = Date.now();
    const windowStart = now - this.config.rollingWindow;
    
    // Add new entry
    this.requestWindow.push(entry);
    
    // Remove entries outside rolling window
    this.requestWindow = this.requestWindow.filter(
      entry => entry.timestamp >= windowStart
    );
  }

  /**
   * Get current circuit breaker statistics
   */
  getStats(): CircuitBreakerStats {
    const now = Date.now();
    const windowStart = now - this.config.rollingWindow;
    
    // Get requests within rolling window
    const windowRequests = this.requestWindow.filter(
      entry => entry.timestamp >= windowStart
    );
    
    const totalRequests = windowRequests.length;
    const successfulRequests = windowRequests.filter(entry => entry.success).length;
    const failedRequests = totalRequests - successfulRequests;
    const failureRate = totalRequests > 0 ? failedRequests / totalRequests : 0;
    
    return {
      totalRequests,
      successfulRequests,
      failedRequests,
      failureRate,
      currentState: this.state,
      lastFailureTime: this.lastFailureTime,
      consecutiveFailures: this.failureCount
    };
  }

  /**
   * Reset circuit breaker to initial state
   */
  reset(): void {
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = 0;
    this.requestWindow = [];
    
    logger.info('Circuit breaker reset to initial state', 'CircuitBreaker');
  }

  /**
   * Get current circuit breaker state
   */
  getState(): CircuitState {
    return this.state;
  }

  /**
   * Force circuit breaker to specific state (for testing)
   */
  setState(state: CircuitState): void {
    this.state = state;
    
    // When setting to OPEN state, set lastFailureTime to current time
    // to ensure proper rejection behavior
    if (state === CircuitState.OPEN) {
      this.lastFailureTime = Date.now();
    }
    
    logger.debug('Circuit breaker state manually set', 'CircuitBreaker', {
      newState: state,
      lastFailureTime: this.lastFailureTime
    });
  }

  /**
   * Check if circuit breaker is healthy
   */
  isHealthy(): boolean {
    const stats = this.getStats();
    
    // Consider unhealthy if open or failure rate is too high
    if (this.state === CircuitState.OPEN) {
      return false;
    }
    
    if (stats.totalRequests >= this.config.requestVolumeThreshold && 
        stats.failureRate > 0.5) {
      return false;
    }
    
    return true;
  }

  /**
   * Get configuration
   */
  getConfig(): CircuitBreakerConfig {
    return { ...this.config };
  }
}