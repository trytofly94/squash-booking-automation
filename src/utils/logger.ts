import winston from 'winston';
import { correlationManager } from './CorrelationManager';
import { performanceMonitor } from './PerformanceMonitor';
import { ErrorCategory, StructuredError, LogMetadata } from '@/types/monitoring.types';
// LogLevel type removed as it's not used

/**
 * Centralized logging utility for the squash booking automation
 */
class Logger {
  private logger: winston.Logger;

  constructor() {
    this.logger = winston.createLogger({
      level: process.env['LOG_LEVEL'] || 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      ),
      defaultMeta: { service: 'squash-booking-automation' },
      transports: [
        new winston.transports.File({
          filename: 'logs/error.log',
          level: 'error',
        }),
        new winston.transports.File({
          filename: 'logs/combined.log',
        }),
      ],
    });

    // Add console transport for non-production environments
    if (process.env['NODE_ENV'] !== 'production') {
      this.logger.add(
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple(),
            winston.format.printf(({ timestamp, level, message, component, correlationId, ...meta }) => {
              const componentInfo = component ? `[${component}] ` : '';
              const correlationInfo = correlationId ? `[${correlationId.substring(0, 8)}] ` : '';
              const metaInfo = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';
              return `${timestamp} ${level}: ${correlationInfo}${componentInfo}${message}${metaInfo}`;
            })
          ),
        })
      );
    }
  }

  /**
   * Log debug message with enhanced metadata
   */
  debug(message: string, component?: string, metadata?: Record<string, unknown>): void {
    const enhancedMetadata = this.enhanceMetadata(component, metadata);
    this.logger.debug(message, enhancedMetadata);
  }

  /**
   * Log info message with enhanced metadata
   */
  info(message: string, component?: string, metadata?: Record<string, unknown>): void {
    const enhancedMetadata = this.enhanceMetadata(component, metadata);
    this.logger.info(message, enhancedMetadata);
  }

  /**
   * Log warning message with enhanced metadata
   */
  warn(message: string, component?: string, metadata?: Record<string, unknown>): void {
    const enhancedMetadata = this.enhanceMetadata(component, metadata);
    this.logger.warn(message, enhancedMetadata);
  }

  /**
   * Log error message with enhanced metadata
   */
  error(message: string, component?: string, metadata?: Record<string, unknown>): void {
    const enhancedMetadata = this.enhanceMetadata(component, metadata);
    this.logger.error(message, enhancedMetadata);
  }

  /**
   * Log booking attempt
   */
  logBookingAttempt(
    attempt: number,
    maxRetries: number,
    component: string = 'BookingManager'
  ): void {
    this.info(`Booking attempt ${attempt}/${maxRetries}`, component);
  }

  /**
   * Log booking success
   */
  logBookingSuccess(
    courtId: string,
    date: string,
    startTime: string,
    component: string = 'BookingManager'
  ): void {
    this.info('Booking successful', component, { courtId, date, startTime });
  }

  /**
   * Log booking failure
   */
  logBookingFailure(error: string, component: string = 'BookingManager'): void {
    this.error('Booking failed', component, { error });
  }

  /**
   * Log slot search results
   */
  logSlotSearch(
    totalSlots: number,
    availablePairs: number,
    component: string = 'SlotSearcher'
  ): void {
    this.info('Slot search completed', component, { totalSlots, availablePairs });
  }

  /**
   * Log isolation check results
   */
  logIsolationCheck(
    hasIsolation: boolean,
    isolatedCount: number,
    component: string = 'IsolationChecker'
  ): void {
    this.info('Isolation check completed', component, { hasIsolation, isolatedCount });
  }

  /**
   * Log structured error with categorization
   */
  logStructuredError(
    error: Error | string,
    category: ErrorCategory,
    component: string,
    metadata?: Record<string, unknown>
  ): void {
    const correlationId = correlationManager.getCurrentCorrelationId() || 'unknown';
    const errorMessage = typeof error === 'string' ? error : error.message;
    const stack = typeof error === 'string' ? undefined : error.stack;

    const structuredError: StructuredError = {
      category,
      message: errorMessage,
      correlationId,
      component,
      stack,
      metadata,
      timestamp: Date.now()
    };

    this.error(`[${category.toUpperCase()}] ${errorMessage}`, component, {
      structuredError,
      ...metadata
    });
  }

  /**
   * Log performance metric
   */
  logPerformance(
    operation: string,
    duration: number,
    component: string,
    metadata?: Record<string, unknown>
  ): void {
    const level = performanceMonitor.exceedsErrorThreshold(duration)
      ? 'error'
      : performanceMonitor.exceedsWarningThreshold(duration)
      ? 'warn'
      : 'info';

    const message = `Performance: ${operation} completed in ${duration}ms`;
    const performanceMetadata = {
      operation,
      duration,
      threshold_warning: performanceMonitor.getConfig().performanceThresholdWarning,
      threshold_error: performanceMonitor.getConfig().performanceThresholdError,
      exceeds_warning: performanceMonitor.exceedsWarningThreshold(duration),
      exceeds_error: performanceMonitor.exceedsErrorThreshold(duration),
      ...metadata
    };

    if (level === 'error') {
      this.error(message, component, performanceMetadata);
    } else if (level === 'warn') {
      this.warn(message, component, performanceMetadata);
    } else {
      this.info(message, component, performanceMetadata);
    }
  }

  /**
   * Start timing an operation
   */
  startTiming(operation: string, component: string, metadata?: Record<string, unknown>): string {
    return performanceMonitor.startTimer(operation, component, metadata);
  }

  /**
   * End timing an operation and log performance
   */
  endTiming(timerId: string, component?: string): void {
    const result = performanceMonitor.endTimer(timerId);
    if (result && result.metric.duration !== undefined) {
      this.logPerformance(
        result.metric.name,
        result.metric.duration,
        component || result.metric.component,
        result.metric.metadata
      );
    }
  }

  /**
   * Log with correlation context
   */
  withCorrelation<T>(fn: () => T, component?: string): T {
    return correlationManager.runWithNewContext(() => {
      if (component) {
        correlationManager.setComponent(component);
      }
      return fn();
    });
  }

  /**
   * Enhance metadata with correlation and monitoring data
   */
  private enhanceMetadata(
    component?: string,
    metadata?: Record<string, unknown>
  ): LogMetadata {
    const correlationMetadata = correlationManager.getMetadata();
    const systemInfo = performanceMonitor.getSystemResourceInfo();

    return {
      component,
      ...correlationMetadata,
      ...metadata,
      system: {
        memoryUsage: Math.round((systemInfo.memoryUsage.heapUsed / systemInfo.memoryUsage.heapTotal) * 100),
        uptime: Math.round(systemInfo.uptime)
      }
    };
  }

  /**
   * Get logger statistics
   */
  getStats(): {
    performanceMetrics: ReturnType<typeof performanceMonitor.getMetricsSummary>;
    bookingMetrics: ReturnType<typeof performanceMonitor.getBookingStepsSummary>;
    systemInfo: ReturnType<typeof performanceMonitor.getSystemResourceInfo>;
    correlationEnabled: boolean;
    performanceEnabled: boolean;
  } {
    return {
      performanceMetrics: performanceMonitor.getMetricsSummary(),
      bookingMetrics: performanceMonitor.getBookingStepsSummary(),
      systemInfo: performanceMonitor.getSystemResourceInfo(),
      correlationEnabled: correlationManager.isEnabled(),
      performanceEnabled: performanceMonitor.isEnabled()
    };
  }
}

// Export singleton instance
export const logger = new Logger();
