import { chromium } from '@playwright/test';
import dotenv from 'dotenv';
import { BookingManager } from './core/BookingManager';
import { BookingConfig } from './types/booking.types';
import { logger } from './utils/logger';

// Load environment variables
dotenv.config();

/**
 * Main entry point for the squash booking automation
 */
async function main(): Promise<void> {
  const component = 'Main';

  logger.info('Starting Squash Booking Automation', component);

  // Parse configuration from environment variables
  const config: BookingConfig = {
    daysAhead: parseInt(process.env['DAYS_AHEAD'] || '20', 10),
    targetStartTime: process.env['TARGET_START_TIME'] || '14:00',
    duration: parseInt(process.env['DURATION'] || '60', 10),
    maxRetries: parseInt(process.env['MAX_RETRIES'] || '3', 10),
    dryRun: process.env['DRY_RUN']?.toLowerCase() === 'true',
  };

  logger.info('Configuration loaded', component, { config });

  // Launch browser
  const browser = await chromium.launch({
    headless: process.env['NODE_ENV'] === 'production',
    slowMo: config.dryRun ? 1000 : 0, // Slow down in dry-run mode for visibility
  });

  try {
    // Create new page
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });

    const page = await context.newPage();

    // Create booking manager and execute booking
    const bookingManager = new BookingManager(page, config);
    const result = await bookingManager.executeBooking();

    // Log results
    if (result.success) {
      logger.info('Booking completed successfully', component, {
        court: result.bookedPair?.courtId,
        date: result.bookedPair?.slot1.date,
        startTime: result.bookedPair?.slot1.startTime,
        endTime: result.bookedPair?.slot2.startTime,
        retryAttempts: result.retryAttempts,
        mode: config.dryRun ? 'DRY_RUN' : 'PRODUCTION',
      });
    } else {
      logger.error('Booking failed', component, {
        error: result.error,
        retryAttempts: result.retryAttempts,
      });
      process.exit(1);
    }
  } catch (error) {
    logger.error('Critical error in main process', component, {
      error: error instanceof Error ? error.message : String(error),
    });
    process.exit(1);
  } finally {
    await browser.close();
    logger.info('Browser closed, automation complete', component);
  }
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection', 'Process', { reason, promise });
  process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error: Error) => {
  logger.error('Uncaught Exception', 'Process', { error: error.message, stack: error.stack });
  process.exit(1);
});

// Run the main function
if (require.main === module) {
  main().catch((error: Error) => {
    logger.error('Main function failed', 'Process', { error: error.message });
    process.exit(1);
  });
}
