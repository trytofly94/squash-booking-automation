/**
 * Error classification system for intelligent retry decision making
 * Analyzes errors and categorizes them to apply appropriate retry strategies
 */

import { RetryableErrorType } from './RetryConfig';
import { logger } from '../../utils/logger';

/**
 * Error classification result
 */
export interface ErrorClassification {
  /** Classified error type */
  errorType: RetryableErrorType;
  /** Whether this error should be retried */
  shouldRetry: boolean;
  /** Confidence level of classification (0-1) */
  confidence: number;
  /** Human-readable reason for classification */
  reason: string;
  /** Additional context about the error */
  context?: Record<string, unknown>;
}

/**
 * Error pattern definition for classification
 */
interface ErrorPattern {
  /** Regular expression to match error messages */
  messagePattern: RegExp;
  /** Error type to classify as */
  errorType: RetryableErrorType;
  /** Whether errors matching this pattern should be retried */
  shouldRetry: boolean;
  /** Confidence level for this pattern match */
  confidence: number;
  /** Description of this pattern */
  description: string;
}

/**
 * Intelligent error classifier that analyzes errors and determines
 * appropriate retry strategies based on error characteristics
 */
export class ErrorClassifier {
  private static readonly ERROR_PATTERNS: ErrorPattern[] = [
    // Network-related errors
    {
      messagePattern: /net::ERR_|ECONNREFUSED|ENOTFOUND|EHOSTUNREACH|ECONNRESET|ETIMEDOUT/i,
      errorType: RetryableErrorType.NETWORK_ERROR,
      shouldRetry: true,
      confidence: 0.95,
      description: 'Network connectivity issues'
    },
    {
      messagePattern: /failed to fetch|fetch.*failed|network.*error|connection.*failed/i,
      errorType: RetryableErrorType.NETWORK_ERROR,
      shouldRetry: true,
      confidence: 0.9,
      description: 'Generic network failures'
    },
    {
      messagePattern: /dns.*resolution.*failed|name.*not.*resolved/i,
      errorType: RetryableErrorType.NETWORK_ERROR,
      shouldRetry: true,
      confidence: 0.85,
      description: 'DNS resolution failures'
    },

    // Timeout-related errors
    {
      messagePattern: /timeout|timed.*out|request.*timeout|page.*timeout/i,
      errorType: RetryableErrorType.TIMEOUT_ERROR,
      shouldRetry: true,
      confidence: 0.9,
      description: 'Request or page load timeouts'
    },
    {
      messagePattern: /waiting.*for.*page.*to.*load.*failed/i,
      errorType: RetryableErrorType.TIMEOUT_ERROR,
      shouldRetry: true,
      confidence: 0.85,
      description: 'Page load timeout'
    },

    // Rate limiting errors
    {
      messagePattern: /429|too.*many.*requests|rate.*limit|throttled/i,
      errorType: RetryableErrorType.RATE_LIMIT_ERROR,
      shouldRetry: true,
      confidence: 0.95,
      description: 'Rate limiting or throttling'
    },
    {
      messagePattern: /quota.*exceeded|api.*limit.*reached/i,
      errorType: RetryableErrorType.RATE_LIMIT_ERROR,
      shouldRetry: true,
      confidence: 0.9,
      description: 'API quota or limits exceeded'
    },

    // Server errors
    {
      messagePattern: /5\d\d|internal.*server.*error|server.*unavailable|service.*unavailable/i,
      errorType: RetryableErrorType.SERVER_ERROR,
      shouldRetry: true,
      confidence: 0.9,
      description: 'Server-side errors'
    },
    {
      messagePattern: /bad.*gateway|gateway.*timeout|proxy.*error/i,
      errorType: RetryableErrorType.SERVER_ERROR,
      shouldRetry: true,
      confidence: 0.85,
      description: 'Gateway or proxy errors'
    },

    // Authentication errors
    {
      messagePattern: /401|unauthorized|authentication.*failed|login.*failed|invalid.*credentials/i,
      errorType: RetryableErrorType.AUTHENTICATION_ERROR,
      shouldRetry: true,
      confidence: 0.9,
      description: 'Authentication failures'
    },
    {
      messagePattern: /session.*expired|token.*expired|access.*denied/i,
      errorType: RetryableErrorType.AUTHENTICATION_ERROR,
      shouldRetry: true,
      confidence: 0.85,
      description: 'Session or token expiration'
    },

    // Navigation errors
    {
      messagePattern: /navigation.*failed|page.*not.*found|404|cannot.*navigate/i,
      errorType: RetryableErrorType.NAVIGATION_ERROR,
      shouldRetry: true,
      confidence: 0.8,
      description: 'Page navigation failures'
    },
    {
      messagePattern: /element.*not.*found|selector.*not.*found|locator.*not.*found/i,
      errorType: RetryableErrorType.NAVIGATION_ERROR,
      shouldRetry: true,
      confidence: 0.75,
      description: 'Element location failures'
    },

    // Booking-specific errors  
    {
      messagePattern: /booking.*failed|slot.*not.*available|court.*not.*available|reservation.*failed/i,
      errorType: RetryableErrorType.BOOKING_ERROR,
      shouldRetry: true,
      confidence: 0.8,
      description: 'Booking operation failures'
    },
    {
      messagePattern: /payment.*failed|checkout.*failed|transaction.*failed/i,
      errorType: RetryableErrorType.BOOKING_ERROR,
      shouldRetry: false, // Don't retry payment failures automatically
      confidence: 0.85,
      description: 'Payment or checkout failures'
    },

    // Non-retryable errors
    {
      messagePattern: /403|forbidden|not.*allowed|permission.*denied/i,
      errorType: RetryableErrorType.AUTHENTICATION_ERROR,
      shouldRetry: false,
      confidence: 0.9,
      description: 'Permission denied (non-retryable)'
    },
    {
      messagePattern: /400|bad.*request|invalid.*request|malformed.*request/i,
      errorType: RetryableErrorType.UNKNOWN_ERROR,
      shouldRetry: false,
      confidence: 0.85,
      description: 'Bad request (non-retryable)'
    }
  ];

  /**
   * Classify an error and determine retry strategy
   */
  static classifyError(error: Error | string): ErrorClassification {
    const component = 'ErrorClassifier';
    const errorMessage = typeof error === 'string' ? error : error.message;
    const errorStack = typeof error === 'string' ? undefined : error.stack;

    logger.debug('Classifying error', component, {
      errorMessage,
      errorType: typeof error === 'string' ? 'string' : error.constructor.name
    });

    // Try to match against known patterns
    for (const pattern of this.ERROR_PATTERNS) {
      if (pattern.messagePattern.test(errorMessage)) {
        const classification: ErrorClassification = {
          errorType: pattern.errorType,
          shouldRetry: pattern.shouldRetry,
          confidence: pattern.confidence,
          reason: pattern.description,
          context: {
            matchedPattern: pattern.messagePattern.source,
            originalMessage: errorMessage,
            errorConstructor: typeof error === 'string' ? 'string' : error.constructor.name
          }
        };

        logger.debug('Error classified', component, {
          errorType: classification.errorType,
          shouldRetry: classification.shouldRetry,
          confidence: classification.confidence,
          reason: classification.reason
        });

        return classification;
      }
    }

    // Additional context-based classification
    const contextClassification = this.classifyByContext(error, errorMessage, errorStack);
    if (contextClassification) {
      logger.debug('Error classified by context', component, {
        errorType: contextClassification.errorType,
        shouldRetry: contextClassification.shouldRetry,
        reason: contextClassification.reason
      });
      return contextClassification;
    }

    // Default classification for unknown errors
    const defaultClassification: ErrorClassification = {
      errorType: RetryableErrorType.UNKNOWN_ERROR,
      shouldRetry: true, // Conservative approach - retry unknown errors
      confidence: 0.3,
      reason: 'Unknown error type - applying default retry strategy',
      context: {
        originalMessage: errorMessage,
        errorConstructor: typeof error === 'string' ? 'string' : error.constructor.name
      }
    };

    logger.debug('Error classified as unknown', component, {
      errorMessage,
      classification: defaultClassification
    });

    return defaultClassification;
  }

  /**
   * Classify error based on additional context (error type, stack trace, etc.)
   */
  private static classifyByContext(
    error: Error | string, 
    errorMessage: string, 
    errorStack?: string
  ): ErrorClassification | null {
    
    if (typeof error !== 'string') {
      // Check error constructor type
      const errorType = error.constructor.name;
      
      switch (errorType) {
        case 'TimeoutError':
          return {
            errorType: RetryableErrorType.TIMEOUT_ERROR,
            shouldRetry: true,
            confidence: 0.95,
            reason: 'Error type indicates timeout',
            context: { errorConstructor: errorType }
          };
          
        case 'NetworkError':
        case 'FetchError':
          return {
            errorType: RetryableErrorType.NETWORK_ERROR,
            shouldRetry: true,
            confidence: 0.9,
            reason: 'Error type indicates network issue',
            context: { errorConstructor: errorType }
          };
          
        case 'TypeError':
          // Check if this might be a network-related TypeError
          if (errorMessage.includes('fetch') || errorMessage.includes('network')) {
            return {
              errorType: RetryableErrorType.NETWORK_ERROR,
              shouldRetry: true,
              confidence: 0.7,
              reason: 'TypeError with network-related message',
              context: { errorConstructor: errorType }
            };
          }
          break;
      }
    }

    // Check stack trace for additional context
    if (errorStack) {
      if (errorStack.includes('playwright') || errorStack.includes('@playwright')) {
        return {
          errorType: RetryableErrorType.NAVIGATION_ERROR,
          shouldRetry: true,
          confidence: 0.7,
          reason: 'Error originated from Playwright - likely navigation issue',
          context: { source: 'playwright' }
        };
      }
      
      if (errorStack.includes('booking') || errorStack.includes('BookingManager')) {
        return {
          errorType: RetryableErrorType.BOOKING_ERROR,
          shouldRetry: true,
          confidence: 0.6,
          reason: 'Error originated from booking logic',
          context: { source: 'booking' }
        };
      }
    }

    return null;
  }

  /**
   * Check if an error should be retried based on classification
   */
  static shouldRetryError(error: Error | string): boolean {
    const classification = this.classifyError(error);
    return classification.shouldRetry;
  }

  /**
   * Get error type for an error
   */
  static getErrorType(error: Error | string): RetryableErrorType {
    const classification = this.classifyError(error);
    return classification.errorType;
  }

  /**
   * Check if error matches specific type
   */
  static isErrorType(error: Error | string, targetType: RetryableErrorType): boolean {
    const classification = this.classifyError(error);
    return classification.errorType === targetType;
  }

  /**
   * Get classification confidence for an error
   */
  static getClassificationConfidence(error: Error | string): number {
    const classification = this.classifyError(error);
    return classification.confidence;
  }

  /**
   * Add custom error pattern for classification
   */
  static addCustomPattern(pattern: ErrorPattern): void {
    this.ERROR_PATTERNS.unshift(pattern); // Add to beginning for higher priority
    
    logger.info('Added custom error pattern', 'ErrorClassifier', {
      pattern: pattern.messagePattern.source,
      errorType: pattern.errorType,
      shouldRetry: pattern.shouldRetry,
      description: pattern.description
    });
  }

  /**
   * Get all registered error patterns (for debugging/testing)
   */
  static getErrorPatterns(): readonly ErrorPattern[] {
    return Object.freeze([...this.ERROR_PATTERNS]);
  }

  /**
   * Analyze error trends for a set of errors
   */
  static analyzeErrorTrends(errors: (Error | string)[]): {
    errorTypes: Record<RetryableErrorType, number>;
    retryableCount: number;
    nonRetryableCount: number;
    averageConfidence: number;
    mostCommonType: RetryableErrorType;
  } {
    const errorTypes: Record<RetryableErrorType, number> = {} as Record<RetryableErrorType, number>;
    let retryableCount = 0;
    let nonRetryableCount = 0;
    let totalConfidence = 0;

    // Initialize error type counts
    Object.values(RetryableErrorType).forEach(type => {
      errorTypes[type] = 0;
    });

    // Classify all errors
    errors.forEach(error => {
      const classification = this.classifyError(error);
      errorTypes[classification.errorType]++;
      totalConfidence += classification.confidence;
      
      if (classification.shouldRetry) {
        retryableCount++;
      } else {
        nonRetryableCount++;
      }
    });

    // Find most common error type
    const mostCommonType = Object.entries(errorTypes).reduce((a, b) => 
      errorTypes[a[0] as RetryableErrorType] > errorTypes[b[0] as RetryableErrorType] ? a : b
    )[0] as RetryableErrorType;

    return {
      errorTypes,
      retryableCount,
      nonRetryableCount,
      averageConfidence: errors.length > 0 ? totalConfidence / errors.length : 0,
      mostCommonType
    };
  }
}