import type { Page } from '@playwright/test';
import { BookingSlot, BookingPair, CourtSearchResult, CalendarMatrix } from '../types/booking.types';
import { MatrixSlotSearcher } from './MatrixSlotSearcher';
import { BookingCalendarPage } from '../pages/BookingCalendarPage';
import { DateTimeCalculator } from './DateTimeCalculator';
import { logger } from '../utils/logger';
import { parseISO, isValid } from 'date-fns';

// Configuration constants for matrix validation
const MATRIX_VALIDATION_CONFIG = {
  MINIMUM_CELL_COVERAGE_PERCENTAGE: 0.5, // 50% minimum coverage
  MINIMUM_TIME_SLOTS: 1,
  MINIMUM_COURTS: 1
} as const;

/**
 * Enhanced slot searcher with date-fns integration and improved court discovery
 * Searches for available booking slots across multiple courts with intelligent filtering
 */
export class SlotSearcher {
  private page: Page;
  private targetDate: string;
  private targetTimes: string[];
  private matrixSearcher: MatrixSlotSearcher;
  private calendarPage: BookingCalendarPage;

  constructor(page: Page, targetDate: string, targetTimes: string[]) {
    this.page = page;
    this.targetDate = targetDate;
    this.targetTimes = targetTimes;
    this.matrixSearcher = new MatrixSlotSearcher(page, targetDate, targetTimes);
    this.calendarPage = new BookingCalendarPage(page);
    
    // Validate inputs with date-fns
    this.validateInputs();
  }

  /**
   * Validate constructor inputs using date-fns
   */
  private validateInputs(): void {
    // Validate target date
    const dateObj = parseISO(this.targetDate);
    if (!isValid(dateObj)) {
      throw new Error(`Invalid target date: ${this.targetDate}`);
    }

    // Validate target times
    this.targetTimes.forEach((time, index) => {
      if (!DateTimeCalculator.isValidTime(time)) {
        throw new Error(`Invalid target time at index ${index}: ${time}`);
      }
    });

    logger.debug('SlotSearcher inputs validated', 'SlotSearcher', {
      targetDate: this.targetDate,
      targetTimesCount: this.targetTimes.length,
      validatedDate: dateObj.toISOString()
    });
  }

  /**
   * Search for available courts and their slots
   * Issue #20: Matrix-based approach with legacy fallback
   */
  async searchAvailableSlots(): Promise<CourtSearchResult> {
    const component = 'SlotSearcher.searchAvailableSlots';

    logger.info('Starting slot search with matrix optimization', component, {
      targetDate: this.targetDate,
      targetTimes: this.targetTimes,
    });

    try {
      // OPTIMIZATION: Try matrix-based approach first (Issue #20)
      logger.debug('Attempting matrix-based search', component);
      const matrixResult = await this.searchWithMatrix();
      
      if (this.validateMatrixResult(matrixResult)) {
        logger.info('Matrix-based search successful', component, {
          availableCourts: matrixResult.availableCourts.length,
          totalSlots: matrixResult.totalSlots,
          availablePairs: matrixResult.availablePairs.length,
          approach: 'matrix-optimized'
        });
        return matrixResult;
      } else {
        logger.warn('Matrix result validation failed, falling back to legacy approach', component);
      }
    } catch (error) {
      logger.warn('Matrix-based search failed, falling back to legacy approach', component, { 
        error: error instanceof Error ? error.message : String(error) 
      });
    }

    // FALLBACK: Use legacy iterative approach
    logger.debug('Using legacy iterative search approach', component);
    return this.searchWithLegacyApproach();
  }

  /**
   * Matrix-based search implementation (Issue #20)
   */
  private async searchWithMatrix(): Promise<CourtSearchResult> {
    const component = 'SlotSearcher.searchWithMatrix';
    
    try {
      // Extract calendar matrix in single pass
      const matrix = await this.calendarPage.extractCalendarMatrix();
      
      // Validate matrix completeness
      if (!this.validateMatrixCompleteness(matrix)) {
        throw new Error('Matrix extraction incomplete or invalid');
      }
      
      // Use matrix searcher for optimized slot finding
      const result = await this.matrixSearcher.searchAvailableSlots();
      
      // Log performance metrics
      const metrics = await this.matrixSearcher.getOptimizationMetrics(matrix);
      logger.info('Matrix search performance', component, metrics);
      
      return result;
    } catch (error) {
      logger.error('Matrix search failed', component, { error });
      throw error;
    }
  }

  /**
   * Legacy iterative search approach (fallback)
   */
  private async searchWithLegacyApproach(): Promise<CourtSearchResult> {
    const component = 'SlotSearcher.searchWithLegacyApproach';
    
    logger.info('Using legacy iterative approach', component);

    const availableCourts = await this.findAvailableCourts();
    const allSlots: BookingSlot[] = [];

    for (const courtId of availableCourts) {
      const courtSlots = await this.getCourtSlots(courtId);
      allSlots.push(...courtSlots);
    }

    const availablePairs = this.findAvailableSlotPairs(allSlots);

    const result: CourtSearchResult = {
      availableCourts,
      totalSlots: allSlots.length,
      availablePairs,
    };

    logger.info('Legacy slot search completed', component, {
      availableCourts: availableCourts.length,
      totalSlots: allSlots.length,
      availablePairs: availablePairs.length,
      approach: 'legacy-iterative'
    });

    return result;
  }

  /**
   * Validate matrix extraction completeness
   */
  private validateMatrixCompleteness(matrix: CalendarMatrix): boolean {
    const component = 'SlotSearcher.validateMatrixCompleteness';
    
    const { metrics } = matrix;
    
    // Basic completeness checks
    if (metrics.totalCells === 0) {
      logger.warn('Matrix validation failed: no cells', component);
      return false;
    }
    
    if (metrics.courtsWithData === 0) {
      logger.warn('Matrix validation failed: no courts', component);
      return false;
    }
    
    if (metrics.timeSlotsWithData === 0) {
      logger.warn('Matrix validation failed: no time slots', component);
      return false;
    }

    // Quality threshold check
    const expectedMinimumCells = metrics.courtsWithData * this.targetTimes.length;
    if (metrics.totalCells < expectedMinimumCells * MATRIX_VALIDATION_CONFIG.MINIMUM_CELL_COVERAGE_PERCENTAGE) {
      logger.warn('Matrix validation failed: insufficient cell coverage', component, {
        totalCells: metrics.totalCells,
        expectedMinimum: expectedMinimumCells,
        coverage: metrics.totalCells / expectedMinimumCells
      });
      return false;
    }

    logger.debug('Matrix validation passed', component, {
      totalCells: metrics.totalCells,
      courts: metrics.courtsWithData,
      timeSlots: metrics.timeSlotsWithData,
      warnings: metrics.warnings.length
    });

    return true;
  }

  /**
   * Validate matrix search result quality
   */
  private validateMatrixResult(result: CourtSearchResult): boolean {
    const component = 'SlotSearcher.validateMatrixResult';
    
    // Basic sanity checks
    if (result.availableCourts.length === 0 && result.totalSlots === 0 && result.availablePairs.length === 0) {
      logger.warn('Matrix result appears empty - may indicate extraction failure', component);
      return false;
    }

    // Check for data consistency
    if (result.totalSlots > 0 && result.availableCourts.length === 0) {
      logger.warn('Matrix result inconsistent: slots found but no courts', component);
      return false;
    }

    if (result.availablePairs.length > result.totalSlots / 2) {
      logger.warn('Matrix result suspicious: more pairs than possible slots', component);
      return false;
    }

    logger.debug('Matrix result validation passed', component, {
      courts: result.availableCourts.length,
      slots: result.totalSlots,
      pairs: result.availablePairs.length
    });

    return true;
  }

  /**
   * Find all available court IDs for the target date
   */
  private async findAvailableCourts(): Promise<string[]> {
    const component = 'SlotSearcher.findAvailableCourts';

    try {
      // Wait for the court selection or calendar to load
      await this.page.waitForSelector(
        '[data-testid="court-selector"], .court-list, .calendar-view',
        { timeout: 10000 }
      );

      // Try different selectors for court elements
      const courtSelectors = [
        '[data-testid*="court"]',
        '[class*="court"]',
        '.court-item',
        '.calendar-court',
        '[data-court-id]',
      ];

      let courtElements: any[] = [];

      for (const selector of courtSelectors) {
        courtElements = await this.page.$$(selector);
        if (courtElements.length > 0) {
          logger.debug(`Found courts using selector: ${selector}`, component, {
            count: courtElements.length,
          });
          break;
        }
      }

      if (courtElements.length === 0) {
        logger.warn('No court elements found with any selector', component);
        return [];
      }

      const courts: string[] = [];

      for (let i = 0; i < courtElements.length; i++) {
        const element = courtElements[i];

        // Try to extract court ID from various attributes
        let courtId =
          (await element.getAttribute('data-court-id')) ||
          (await element.getAttribute('data-testid')) ||
          (await element.getAttribute('id')) ||
          `court-${i + 1}`;

        // Clean up court ID
        courtId = courtId.replace(/^(court-|data-testid-court-)/, '');

        // Verify court has available slots for our target date
        const hasAvailableSlots = await this.checkCourtAvailability(element);

        if (hasAvailableSlots) {
          courts.push(courtId);
        }
      }

      logger.info('Found available courts', component, { courts });
      return courts;
    } catch (error) {
      logger.error('Error finding available courts', component, {
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  /**
   * Check if a court has available slots
   */
  private async checkCourtAvailability(courtElement: any): Promise<boolean> {
    try {
      // Look for available slot indicators
      const availabilitySelectors = [
        '.available',
        '.slot-available',
        '[data-available="true"]',
        '.booking-slot:not(.booked):not(.unavailable)',
      ];

      for (const selector of availabilitySelectors) {
        const availableSlots = await courtElement.$$(selector);
        if (availableSlots.length > 0) {
          return true;
        }
      }

      return false;
    } catch (error) {
      logger.warn('Error checking court availability', 'SlotSearcher.checkCourtAvailability', {
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Get all slots for a specific court
   */
  private async getCourtSlots(courtId: string): Promise<BookingSlot[]> {
    const component = 'SlotSearcher.getCourtSlots';
    const slots: BookingSlot[] = [];

    try {
      // Navigate to court-specific view if needed
      await this.navigateToCourtView(courtId);

      // Find slot elements for our target times
      for (const targetTime of this.targetTimes) {
        const slotElement = await this.findSlotElement(courtId, targetTime);

        if (slotElement) {
          const isAvailable = await this.isSlotAvailable(slotElement);
          const elementSelector = await this.getElementSelector(slotElement);

          slots.push({
            date: this.targetDate,
            startTime: targetTime,
            courtId,
            isAvailable,
            elementSelector,
          });

          logger.debug('Found slot', component, {
            courtId,
            startTime: targetTime,
            isAvailable,
          });
        }
      }
    } catch (error) {
      logger.error('Error getting court slots', component, {
        courtId,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return slots;
  }

  /**
   * Navigate to a specific court view
   */
  private async navigateToCourtView(courtId: string): Promise<void> {
    const component = 'SlotSearcher.navigateToCourtView';

    try {
      const courtSelectors = [
        `[data-court-id="${courtId}"]`,
        `[data-testid*="${courtId}"]`,
        `#court-${courtId}`,
        `.court-${courtId}`
      ];

      // Use the calendar page's cached selector functionality
      await this.calendarPage.safeClickCached(courtSelectors, 'court', courtId);
      await this.page.waitForTimeout(1000); // Wait for view to update
      logger.debug(`Navigated to court view via cache: ${courtId}`, component);
    } catch (error) {
      logger.warn(`Could not navigate to court view: ${courtId}`, component, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Find slot element for specific court and time (Cache-optimized)
   */
  private async findSlotElement(courtId: string, time: string): Promise<any> {
    const timeSelectors = [
      `[data-time="${time}"][data-court="${courtId}"]`,
      `[data-time="${time}"]`,
      `.slot-${time.replace(':', '-')}`,
      `[data-start-time="${time}"]`,
    ];

    try {
      // Use calendar page cached approach
      const element = await this.calendarPage.waitForElementCached(
        timeSelectors, 
        'timeSlot',
        5000,
        `${courtId}-${time}`
      );
      
      // Convert Locator to element handle for compatibility
      return await element.elementHandle();
    } catch (error) {
      // Fallback to original approach if cached approach fails
      for (const selector of timeSelectors) {
        const element = await this.page.$(selector);
        if (element) {
          return element;
        }
      }
      return null;
    }
  }

  /**
   * Check if a slot element represents an available slot
   */
  private async isSlotAvailable(slotElement: any): Promise<boolean> {
    try {
      const classList = (await slotElement.getAttribute('class')) || '';
      const dataAvailable = await slotElement.getAttribute('data-available');

      // Check for availability indicators
      const isAvailable =
        !classList.includes('booked') &&
        !classList.includes('unavailable') &&
        !classList.includes('disabled') &&
        dataAvailable !== 'false';

      return isAvailable;
    } catch (error) {
      logger.warn('Error checking slot availability', 'SlotSearcher.isSlotAvailable', {
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Get a selector for the slot element for later interaction
   */
  private async getElementSelector(slotElement: any): Promise<string> {
    try {
      // Try to get a unique selector
      const id = await slotElement.getAttribute('id');
      if (id) {
        return `#${id}`;
      }

      const dataTestId = await slotElement.getAttribute('data-testid');
      if (dataTestId) {
        return `[data-testid="${dataTestId}"]`;
      }

      const className = await slotElement.getAttribute('class');
      if (className) {
        const uniqueClass = className
          .split(' ')
          .find((cls: string) => cls.includes('slot') || cls.includes('time'));
        if (uniqueClass) {
          return `.${uniqueClass}`;
        }
      }

      return 'slot-element'; // Fallback
    } catch (error) {
      return 'slot-element';
    }
  }

  /**
   * Find available consecutive slot pairs
   */
  private findAvailableSlotPairs(allSlots: BookingSlot[]): BookingPair[] {
    const component = 'SlotSearcher.findAvailableSlotPairs';
    const pairs: BookingPair[] = [];

    // Group slots by court
    const slotsByCourt = allSlots.reduce(
      (acc, slot) => {
        if (!acc[slot.courtId]) {
          acc[slot.courtId] = [];
        }
        acc[slot.courtId]!.push(slot);
        return acc;
      },
      {} as Record<string, BookingSlot[]>
    );

    // Find pairs for each court
    Object.entries(slotsByCourt).forEach(([courtId, courtSlots]) => {
      const availableSlots = courtSlots.filter(slot => slot.isAvailable);

      if (availableSlots.length >= 2) {
        // Sort slots by time
        availableSlots.sort((a, b) => a.startTime.localeCompare(b.startTime));

        // Look for consecutive slots
        for (let i = 0; i < availableSlots.length - 1; i++) {
          const slot1 = availableSlots[i];
          const slot2 = availableSlots[i + 1];

          if (slot1 && slot2 && this.areConsecutiveSlots(slot1.startTime, slot2.startTime)) {
            pairs.push({
              slot1,
              slot2,
              courtId,
            });

            logger.debug('Found available slot pair', component, {
              courtId,
              slot1Time: slot1.startTime,
              slot2Time: slot2.startTime,
            });
          }
        }
      }
    });

    return pairs;
  }

  /**
   * Check if two time slots are consecutive (30 minutes apart)
   */
  private areConsecutiveSlots(time1: string, time2: string): boolean {
    const time1Parsed = DateTimeCalculator.parseTime(time1);
    const time2Parsed = DateTimeCalculator.parseTime(time2);

    const time1Minutes = time1Parsed.hours * 60 + time1Parsed.minutes;
    const time2Minutes = time2Parsed.hours * 60 + time2Parsed.minutes;

    return time2Minutes - time1Minutes === 30;
  }
}
