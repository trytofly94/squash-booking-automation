import winston from 'winston';
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
            winston.format.printf(({ timestamp, level, message, component, ...meta }) => {
              const componentInfo = component ? `[${component}] ` : '';
              const metaInfo = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';
              return `${timestamp} ${level}: ${componentInfo}${message}${metaInfo}`;
            })
          ),
        })
      );
    }
  }

  /**
   * Log debug message
   */
  debug(message: string, component?: string, metadata?: Record<string, unknown>): void {
    this.logger.debug(message, { component, ...metadata });
  }

  /**
   * Log info message
   */
  info(message: string, component?: string, metadata?: Record<string, unknown>): void {
    this.logger.info(message, { component, ...metadata });
  }

  /**
   * Log warning message
   */
  warn(message: string, component?: string, metadata?: Record<string, unknown>): void {
    this.logger.warn(message, { component, ...metadata });
  }

  /**
   * Log error message
   */
  error(message: string, component?: string, metadata?: Record<string, unknown>): void {
    this.logger.error(message, { component, ...metadata });
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
}

// Export singleton instance
export const logger = new Logger();
