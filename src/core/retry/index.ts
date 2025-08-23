/**
 * Retry system exports and global retry manager instance
 */

import { RetryManager } from './RetryManager';
import { ConfigurationManager } from '../../utils/ConfigurationManager';

/**
 * Global retry manager instance for use throughout the application
 */
let globalRetryManager: RetryManager | null = null;

/**
 * Get or create global retry manager instance
 */
export function getGlobalRetryManager(): RetryManager {
  if (!globalRetryManager) {
    const retryConfig = ConfigurationManager.getInstance().getRetryConfig();
    globalRetryManager = new RetryManager(retryConfig);
  }
  return globalRetryManager;
}

/**
 * Reset global retry manager (useful for testing)
 */
export function resetGlobalRetryManager(): void {
  globalRetryManager = null;
}

/**
 * Re-export all retry types and classes
 */
export { RetryManager } from './RetryManager';
export { CircuitBreaker } from './CircuitBreaker';
export { errorClassifier, BackoffCalculator, retryWithBackoff } from './RetryStrategies';
export * from '../../types/retry.types';