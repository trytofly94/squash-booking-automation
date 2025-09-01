import { BookingSuccessResult } from '@/types/booking.types';
import { logger } from './logger';

/**
 * Enhanced retry manager specifically for success detection failures
 * Provides intelligent retry strategies based on detection method failures
 */
export class SuccessDetectionRetryManager {
  private readonly component = 'SuccessDetectionRetryManager';

  /**
   * Retry booking with success detection using progressive delay and smart strategies
   */
  async retryWithSuccessDetection(
    bookingFunction: () => Promise<BookingSuccessResult>,
    maxRetries: number = 3
  ): Promise<BookingSuccessResult> {
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        logger.info('Attempting booking with success detection', this.component, { 
          attempt, 
          maxRetries 
        });

        const result = await bookingFunction();
        
        if (result.success) {
          logger.info('Booking succeeded on attempt', this.component, { 
            attempt,
            method: result.method,
            confirmationId: result.confirmationId
          });
          return result;
        }
        
        // Analyze failure reason for smart retry strategy
        if (result.method === 'network' && attempt < maxRetries) {
          logger.warn('Network detection failed, retrying with extended timeout', this.component, { 
            attempt,
            nextRetryIn: attempt * 2000
          });
          await this.waitBeforeRetry(attempt * 2000); // Progressive delay
          continue;
        }
        
        if (result.method === 'dom-attribute' && attempt < maxRetries) {
          logger.warn('DOM attribute detection failed, retrying with page refresh', this.component, { 
            attempt,
            nextRetryIn: attempt * 1500
          });
          await this.waitBeforeRetry(attempt * 1500);
          continue;
        }
        
        if (result.method === 'url-pattern' && attempt < maxRetries) {
          logger.warn('URL pattern detection failed, retrying with longer URL monitoring', this.component, { 
            attempt,
            nextRetryIn: attempt * 1000
          });
          await this.waitBeforeRetry(attempt * 1000);
          continue;
        }

        if (result.method === 'none' && attempt < maxRetries) {
          logger.warn('All detection methods failed, full retry with increased timeouts', this.component, { 
            attempt,
            nextRetryIn: attempt * 3000
          });
          await this.waitBeforeRetry(attempt * 3000);
          continue;
        }
        
        // Final attempt or specific failure that shouldn't be retried
        if (attempt === maxRetries) {
          logger.error('Final retry attempt failed', this.component, {
            finalMethod: result.method,
            totalAttempts: attempt
          });
        }
        
        return result;
        
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        
        if (attempt === maxRetries) {
          logger.error('Success detection retry limit exceeded with error', this.component, {
            totalAttempts: attempt,
            finalError: errorMessage
          });
          throw error;
        }
        
        logger.warn('Success detection threw error, retrying', this.component, { 
          attempt, 
          error: errorMessage,
          nextRetryIn: attempt * 1500
        });
        
        await this.waitBeforeRetry(attempt * 1500);
      }
    }
    
    throw new Error(`Success detection retry limit exceeded after ${maxRetries} attempts`);
  }

  /**
   * Smart retry strategy that adapts delay based on failure type
   */
  async retryWithAdaptiveStrategy(
    bookingFunction: () => Promise<BookingSuccessResult>,
    maxRetries: number = 3,
    baseDelay: number = 1000
  ): Promise<BookingSuccessResult> {
    let lastFailureType: string | null = null;
    let consecutiveFailures = 0;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const result = await bookingFunction();
        
        if (result.success) {
          return result;
        }

        // Track consecutive failures of the same type
        if (lastFailureType === result.method) {
          consecutiveFailures++;
        } else {
          consecutiveFailures = 1;
          lastFailureType = result.method;
        }

        if (attempt < maxRetries) {
          const delay = this.calculateAdaptiveDelay(
            result.method, 
            consecutiveFailures, 
            baseDelay
          );
          
          logger.info('Adaptive retry strategy', this.component, {
            attempt,
            failureType: result.method,
            consecutiveFailures,
            delay
          });
          
          await this.waitBeforeRetry(delay);
        }
        
        if (attempt === maxRetries) {
          return result;
        }

      } catch (error) {
        if (attempt === maxRetries) {
          throw error;
        }
        
        await this.waitBeforeRetry(baseDelay * attempt);
      }
    }

    throw new Error('Adaptive retry strategy failed');
  }

  /**
   * Calculate adaptive delay based on failure type and consecutive failures
   */
  private calculateAdaptiveDelay(
    failureType: string, 
    consecutiveFailures: number, 
    baseDelay: number
  ): number {
    let multiplier = 1;

    switch (failureType) {
      case 'network':
        // Network issues may need more time
        multiplier = 2 + (consecutiveFailures * 0.5);
        break;
      case 'dom-attribute':
        // DOM issues may need page refresh time
        multiplier = 1.5 + (consecutiveFailures * 0.3);
        break;
      case 'url-pattern':
        // URL pattern issues are usually quick to resolve
        multiplier = 1 + (consecutiveFailures * 0.2);
        break;
      case 'text-fallback':
        // Text issues may indicate deeper problems
        multiplier = 3 + (consecutiveFailures * 0.7);
        break;
      case 'none':
        // Total failure needs significant wait
        multiplier = 4 + (consecutiveFailures * 1);
        break;
      default:
        multiplier = 2;
    }

    return Math.min(baseDelay * multiplier, 30000); // Cap at 30 seconds
  }

  /**
   * Wait before retry with optional jitter to avoid thundering herd
   */
  private async waitBeforeRetry(ms: number, addJitter: boolean = true): Promise<void> {
    let delay = ms;
    
    if (addJitter) {
      // Add up to 25% jitter to avoid synchronized retries
      const jitter = Math.random() * 0.25 * ms;
      delay = ms + jitter;
    }
    
    logger.debug('Waiting before retry', this.component, { 
      originalDelay: ms,
      actualDelay: Math.round(delay)
    });
    
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  /**
   * Exponential backoff with optional maximum delay
   */
  async retryWithExponentialBackoff(
    bookingFunction: () => Promise<BookingSuccessResult>,
    maxRetries: number = 3,
    initialDelay: number = 1000,
    maxDelay: number = 16000
  ): Promise<BookingSuccessResult> {
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const result = await bookingFunction();
        
        if (result.success) {
          return result;
        }
        
        if (attempt < maxRetries) {
          const delay = Math.min(
            initialDelay * Math.pow(2, attempt - 1),
            maxDelay
          );
          
          logger.info('Exponential backoff retry', this.component, {
            attempt,
            delay,
            method: result.method
          });
          
          await this.waitBeforeRetry(delay);
        } else {
          return result;
        }
        
      } catch (error) {
        if (attempt === maxRetries) {
          throw error;
        }
        
        const delay = Math.min(
          initialDelay * Math.pow(2, attempt - 1),
          maxDelay
        );
        
        await this.waitBeforeRetry(delay);
      }
    }

    throw new Error('Exponential backoff retry failed');
  }
}