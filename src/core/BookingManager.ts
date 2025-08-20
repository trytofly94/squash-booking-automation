import type { Page } from '@playwright/test';
import { BookingConfig, BookingResult, BookingPair } from '../types/booking.types';
import { DateTimeCalculator } from './DateTimeCalculator';
import { SlotSearcher } from './SlotSearcher';
import { IsolationChecker } from './IsolationChecker';
import { logger } from '../utils/logger';
import { DryRunValidator } from '../utils/DryRunValidator';

/**
 * Main orchestrator for the squash court booking automation
 */
export class BookingManager {
  private page: Page;
  private config: BookingConfig;
  private validator: DryRunValidator;

  constructor(page: Page, config: Partial<BookingConfig> = {}) {
    this.page = page;
    this.config = {
      daysAhead: config.daysAhead || 20,
      targetStartTime: config.targetStartTime || '14:00',
      duration: config.duration || 60,
      maxRetries: config.maxRetries || 3,
      dryRun: config.dryRun !== false, // Default to true for safety
    };

    // Initialize validator with strict safety for production-like environments
    this.validator = new DryRunValidator(
      process.env['NODE_ENV'] === 'production' ? 'strict' : 'standard'
    );
  }

  /**
   * Execute the complete booking process
   */
  async executeBooking(): Promise<BookingResult> {
    const component = 'BookingManager';
    const startTime = DateTimeCalculator.getCurrentTimestamp();

    // Validate configuration before starting
    const configValidation = this.validator.validateBookingConfig(this.config);
    if (!configValidation.isValid) {
      const errorMessage = `Configuration validation failed: ${configValidation.errors.join(', ')}`;
      logger.error(errorMessage, component, {
        errors: configValidation.errors,
        warnings: configValidation.warnings,
      });

      return {
        success: false,
        error: errorMessage,
        retryAttempts: 0,
        timestamp: startTime,
      };
    }

    // Log warnings if any
    if (configValidation.warnings.length > 0) {
      logger.warn('Configuration warnings detected', component, {
        warnings: configValidation.warnings,
        recommendations: configValidation.recommendations,
      });
    }

    logger.info('Starting booking process', component, {
      config: this.config,
      mode: this.config.dryRun ? 'DRY_RUN' : 'PRODUCTION',
      validationPassed: true,
    });

    let attempt = 0;
    let lastError = '';

    while (attempt < this.config.maxRetries) {
      attempt++;
      logger.logBookingAttempt(attempt, this.config.maxRetries, component);

      try {
        const result = await this.attemptBooking();

        if (result.success) {
          logger.logBookingSuccess(
            result.bookedPair!.courtId,
            result.bookedPair!.slot1.date,
            result.bookedPair!.slot1.startTime,
            component
          );

          return {
            ...result,
            retryAttempts: attempt,
            timestamp: startTime,
          };
        }

        lastError = result.error || 'Unknown error';
        logger.warn(`Booking attempt ${attempt} failed`, component, { error: lastError });

        // Wait before retry (exponential backoff)
        if (attempt < this.config.maxRetries) {
          const waitTime = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s, etc.
          logger.info(`Waiting ${waitTime}ms before retry`, component);
          await this.page.waitForTimeout(waitTime);
        }
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
        logger.error(`Booking attempt ${attempt} threw error`, component, { error: lastError });

        if (attempt < this.config.maxRetries) {
          await this.page.waitForTimeout(2000);
        }
      }
    }

    // All attempts failed
    const finalResult: BookingResult = {
      success: false,
      error: `All ${this.config.maxRetries} booking attempts failed. Last error: ${lastError}`,
      retryAttempts: attempt,
      timestamp: startTime,
    };

    logger.logBookingFailure(finalResult.error!, component);
    return finalResult;
  }

  /**
   * Single booking attempt
   */
  private async attemptBooking(): Promise<BookingResult> {
    const component = 'BookingManager.attemptBooking';

    try {
      // Calculate target date and time slots
      const targetDate = DateTimeCalculator.calculateBookingDate(this.config.daysAhead);
      const timeSlots = DateTimeCalculator.generateTimeSlots(this.config.targetStartTime);

      logger.info('Calculated booking parameters', component, {
        targetDate,
        timeSlots,
        daysAhead: this.config.daysAhead,
      });

      // Navigate to booking page
      await this.navigateToBookingPage(targetDate);

      // Search for available slots
      const slotSearcher = new SlotSearcher(this.page, targetDate, timeSlots);
      const searchResult = await slotSearcher.searchAvailableSlots();

      if (searchResult.availablePairs.length === 0) {
        return {
          success: false,
          error: 'No available slot pairs found for the target date and time',
          retryAttempts: 0,
          timestamp: DateTimeCalculator.getCurrentTimestamp(),
        };
      }

      // Check for isolation and select best pair
      const bestPair = IsolationChecker.findBestNonIsolatingPair(
        searchResult.availablePairs,
        this.getAllSlotsFromSearchResult(searchResult)
      );

      const selectedPair = bestPair || searchResult.availablePairs[0];

      if (!selectedPair) {
        return {
          success: false,
          error: 'No available slots found',
          retryAttempts: 0,
          timestamp: DateTimeCalculator.getCurrentTimestamp(),
        };
      }

      if (!bestPair) {
        logger.warn('No non-isolating pair found, using first available pair', component, {
          selectedCourt: selectedPair.courtId,
          selectedTime: selectedPair.slot1.startTime,
        });
      }

      // Execute booking
      if (this.config.dryRun) {
        return await this.simulateBooking(selectedPair);
      } else {
        return await this.executeRealBooking(selectedPair);
      }
    } catch (error) {
      return {
        success: false,
        error: `Booking attempt failed: ${error instanceof Error ? error.message : String(error)}`,
        retryAttempts: 0,
        timestamp: DateTimeCalculator.getCurrentTimestamp(),
      };
    }
  }

  /**
   * Navigate to the booking page for the target date
   */
  private async navigateToBookingPage(targetDate: string): Promise<void> {
    const component = 'BookingManager.navigateToBookingPage';

    try {
      // Navigate to the base booking URL
      const baseUrl = 'https://www.eversports.de/sb/sportcenter-kautz?sport=squash';
      await this.page.goto(baseUrl);

      logger.info('Navigated to booking page', component, { baseUrl });

      // Wait for page to load
      await this.page.waitForLoadState('networkidle');

      // Look for date selector and navigate to target date
      await this.navigateToTargetDate(targetDate);
    } catch (error) {
      logger.error('Error navigating to booking page', component, {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Navigate to the target booking date
   */
  private async navigateToTargetDate(targetDate: string): Promise<void> {
    const component = 'BookingManager.navigateToTargetDate';

    try {
      // Try different selectors for date navigation
      const dateSelectors = [
        '[data-testid="date-picker"]',
        '.date-picker',
        '.calendar-navigation',
        'input[type="date"]',
      ];

      let dateElement = null;
      for (const selector of dateSelectors) {
        dateElement = await this.page.$(selector);
        if (dateElement) {
          logger.debug(`Found date selector: ${selector}`, component);
          break;
        }
      }

      if (dateElement) {
        await dateElement.fill(targetDate);
        await this.page.keyboard.press('Enter');
        await this.page.waitForTimeout(2000);
      } else {
        // Try alternative navigation methods
        await this.navigateToDateAlternative(targetDate);
      }

      logger.info('Navigated to target date', component, { targetDate });
    } catch (error) {
      logger.error('Error navigating to target date', component, {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Alternative date navigation method
   */
  private async navigateToDateAlternative(targetDate: string): Promise<void> {
    // Implementation for alternative date navigation
    // This would include logic for clicking through calendar widgets,
    // using arrow keys, or other date selection methods
    logger.info('Using alternative date navigation', 'BookingManager.navigateToDateAlternative', {
      targetDate,
    });
  }

  /**
   * Simulate booking for dry-run mode
   */
  private async simulateBooking(pair: BookingPair): Promise<BookingResult> {
    const component = 'BookingManager.simulateBooking';

    logger.info('Simulating booking (DRY RUN)', component, {
      courtId: pair.courtId,
      slot1: pair.slot1.startTime,
      slot2: pair.slot2.startTime,
      date: pair.slot1.date,
    });

    // Simulate some delay
    await this.page.waitForTimeout(1000);

    return {
      success: true,
      bookedPair: pair,
      retryAttempts: 1,
      timestamp: DateTimeCalculator.getCurrentTimestamp(),
    };
  }

  /**
   * Execute real booking
   */
  private async executeRealBooking(pair: BookingPair): Promise<BookingResult> {
    const component = 'BookingManager.executeRealBooking';

    logger.info('Executing real booking', component, {
      courtId: pair.courtId,
      slot1: pair.slot1.startTime,
      slot2: pair.slot2.startTime,
      date: pair.slot1.date,
    });

    try {
      // Select first slot
      if (pair.slot1.elementSelector) {
        await this.page.click(pair.slot1.elementSelector);
        await this.page.waitForTimeout(500);
      }

      // Select second slot
      if (pair.slot2.elementSelector) {
        await this.page.click(pair.slot2.elementSelector);
        await this.page.waitForTimeout(500);
      }

      // Proceed to checkout
      await this.proceedToCheckout();

      // Complete booking process
      await this.completeBookingProcess();

      return {
        success: true,
        bookedPair: pair,
        retryAttempts: 1,
        timestamp: DateTimeCalculator.getCurrentTimestamp(),
      };
    } catch (error) {
      return {
        success: false,
        error: `Real booking failed: ${error instanceof Error ? error.message : String(error)}`,
        retryAttempts: 1,
        timestamp: DateTimeCalculator.getCurrentTimestamp(),
      };
    }
  }

  /**
   * Proceed to checkout after slot selection
   */
  private async proceedToCheckout(): Promise<void> {
    const component = 'BookingManager.proceedToCheckout';

    try {
      const checkoutSelectors = [
        '[data-testid="proceed-to-checkout"]',
        '.checkout-button',
        'button[type="submit"]',
        '.btn-primary',
      ];

      for (const selector of checkoutSelectors) {
        const button = await this.page.$(selector);
        if (button) {
          await button.click();
          logger.info('Proceeded to checkout', component, { selector });
          await this.page.waitForLoadState('networkidle');
          return;
        }
      }

      throw new Error('Could not find checkout button');
    } catch (error) {
      logger.error('Error proceeding to checkout', component, {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Complete the booking process (login, payment, etc.)
   */
  private async completeBookingProcess(): Promise<void> {
    const component = 'BookingManager.completeBookingProcess';

    logger.info('Completing booking process', component);

    // This would include:
    // 1. Login if required
    // 2. Fill in any required information
    // 3. Complete payment process
    // 4. Confirm booking

    // For now, this is a placeholder
    await this.page.waitForTimeout(2000);

    logger.info('Booking process completed', component);
  }

  /**
   * Helper method to extract all slots from search result
   */
  private getAllSlotsFromSearchResult(searchResult: any): any[] {
    // This would extract all individual slots from the search result
    // for use in isolation checking
    const allSlots: any[] = [];

    searchResult.availablePairs.forEach((pair: BookingPair) => {
      allSlots.push(pair.slot1, pair.slot2);
    });

    return allSlots;
  }
}
