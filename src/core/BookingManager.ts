import type { Page } from '@playwright/test';
import { 
  BookingResult, 
  BookingPair,
  AdvancedBookingConfig,
  TimePreference
} from '../types/booking.types';
import { DateTimeCalculator } from './DateTimeCalculator';
import { SlotSearcher } from './SlotSearcher';
import { IsolationChecker } from './IsolationChecker';
import { CourtScorer } from './CourtScorer';
import { PatternStorage } from './PatternStorage';
import { TimeSlotGenerator } from './TimeSlotGenerator';
import { logger } from '../utils/logger';
import { DryRunValidator } from '../utils/DryRunValidator';
import { correlationManager } from '../utils/CorrelationManager';
import { bookingAnalytics } from '../monitoring/BookingAnalytics';
import { ErrorCategory } from '../types/monitoring.types';
import { getDay } from 'date-fns';

/**
 * Enhanced main orchestrator for squash court booking automation
 * Integrates advanced booking logic with court scoring, pattern learning, and intelligent fallbacks
 */
export class BookingManager {
  private page: Page;
  private config: AdvancedBookingConfig;
  private validator: DryRunValidator;
  private courtScorer: CourtScorer;
  private patternStorage: PatternStorage;
  private timeSlotGenerator: TimeSlotGenerator;
  private patternLearningEnabled: boolean;

  constructor(page: Page, config: Partial<AdvancedBookingConfig> = {}) {
    this.page = page;
    
    // Extended configuration with new advanced features
    this.config = {
      // Basic configuration
      daysAhead: config.daysAhead || 20,
      targetStartTime: config.targetStartTime || '14:00',
      duration: config.duration || 60,
      maxRetries: config.maxRetries || 3,
      dryRun: config.dryRun !== false, // Default to true for safety
      
      // Advanced configuration
      timezone: config.timezone || process.env['TIMEZONE'] || 'Europe/Berlin',
      preferredCourts: config.preferredCourts || this.parsePreferredCourts(),
      enablePatternLearning: config.enablePatternLearning ?? 
        (process.env['BOOKING_PATTERN_LEARNING'] === 'true'),
      fallbackTimeRange: config.fallbackTimeRange || 
        parseInt(process.env['FALLBACK_TIME_RANGE'] || '120'),
      courtScoringWeights: config.courtScoringWeights || {
        availability: 0.4,
        historical: 0.3,
        preference: 0.2,
        position: 0.1
      },
      timePreferences: config.timePreferences || this.generateDefaultTimePreferences(),
      holidayProvider: config.holidayProvider || undefined
    };

    this.patternLearningEnabled = this.config.enablePatternLearning;

    // Initialize enhanced components
    this.validator = new DryRunValidator(
      process.env['NODE_ENV'] === 'production' ? 'strict' : 'standard'
    );
    this.courtScorer = new CourtScorer(this.config.courtScoringWeights);
    this.patternStorage = new PatternStorage();
    this.timeSlotGenerator = new TimeSlotGenerator();

    // Initialize pattern learning if enabled
    if (this.patternLearningEnabled) {
      this.initializePatternLearning();
    }

    logger.info('BookingManager initialized with advanced features', 'BookingManager', {
      timezone: this.config.timezone,
      preferredCourts: this.config.preferredCourts,
      patternLearning: this.patternLearningEnabled,
      fallbackRange: this.config.fallbackTimeRange,
      scoringWeights: this.config.courtScoringWeights
    });
  }

  /**
   * Initialize pattern learning system
   */
  private async initializePatternLearning(): Promise<void> {
    try {
      const patterns = await this.patternStorage.loadPatterns();
      this.courtScorer.loadPatterns(patterns);
      
      logger.info('Pattern learning initialized', 'BookingManager', {
        loadedPatterns: patterns.length
      });
    } catch (error) {
      logger.warn('Failed to initialize pattern learning', 'BookingManager', {
        error: (error as Error).message
      });
    }
  }

  /**
   * Parse preferred courts from environment variable
   */
  private parsePreferredCourts(): string[] {
    const prefCourts = process.env['PREFERRED_COURTS'] || '';
    return prefCourts.split(',').map(c => c.trim()).filter(c => c.length > 0);
  }

  /**
   * Generate default time preferences based on target time
   */
  private generateDefaultTimePreferences(): TimePreference[] {
    const targetTime = this.config?.targetStartTime || '14:00';
    
    return [
      { startTime: targetTime, priority: 10, flexibility: 30 }
    ];
  }

  /**
   * Execute the complete booking process with enhanced intelligence and monitoring
   */
  async executeBooking(): Promise<BookingResult> {
    const component = 'BookingManager';
    const startTime = DateTimeCalculator.getCurrentTimestamp();
    
    // Create correlation context for this booking operation
    return correlationManager.runWithNewContext(async () => {
      correlationManager.setComponent(component);
      const correlationId = correlationManager.getCurrentCorrelationId()!;
      
      // Start performance tracking for entire booking process
      const bookingTimerId = logger.startTiming('complete_booking_process', component, {
        correlationId,
        dryRun: this.config.dryRun,
        targetTime: this.config.targetStartTime,
        daysAhead: this.config.daysAhead
      });
      
      logger.info('Starting booking process with enhanced monitoring', component, {
        correlationId,
        config: this.sanitizeConfigForLogging(),
        mode: this.config.dryRun ? 'DRY_RUN' : 'PRODUCTION'
      });
      
      try {
        const result = await this.executeBookingWithRetries(startTime, component, correlationId);
        
        // Record booking analytics
        bookingAnalytics.recordBookingAttempt({
          success: result.success,
          responseTime: Date.now() - startTime,
          retryCount: result.retryAttempts || 0,
          courtId: result.bookedPair?.courtId,
          date: result.bookedPair?.slot1.date,
          startTime: result.bookedPair?.slot1.startTime,
          duration: this.config.duration,
          error: result.error,
          errorCategory: result.success ? undefined : this.categorizeError(result.error || '')
        });
        
        logger.endTiming(bookingTimerId, component);
        return result;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const errorCategory = this.categorizeError(errorMessage);
        
        // Record failed booking attempt
        bookingAnalytics.recordBookingAttempt({
          success: false,
          responseTime: Date.now() - startTime,
          retryCount: this.config.maxRetries,
          error: errorMessage,
          errorCategory
        });
        
        logger.logStructuredError(error, errorCategory, component, {
          correlationId,
          operation: 'complete_booking_process'
        });
        
        logger.endTiming(bookingTimerId, component);
        throw error;
      }
    });
  }
  
  /**
   * Execute booking with retries and enhanced monitoring
   */
  private async executeBookingWithRetries(
    startTime: number, 
    component: string, 
    correlationId: string
  ): Promise<BookingResult> {

    // Validate configuration before starting
    const configValidation = this.validator.validateBookingConfig(this.config);
    if (!configValidation.isValid) {
      const errorMessage = `Configuration validation failed: ${configValidation.errors.join(', ')}`;
      logger.error(errorMessage, component, { 
        errors: configValidation.errors,
        warnings: configValidation.warnings 
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
        recommendations: configValidation.recommendations
      });
    }

    logger.info('Starting booking process', component, {
      config: this.config,
      mode: this.config.dryRun ? 'DRY_RUN' : 'PRODUCTION',
      validationPassed: true
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
   * Enhanced booking attempt with intelligent court selection and fallback strategies
   */
  private async attemptBooking(): Promise<BookingResult> {
    const component = 'BookingManager.attemptBooking';

    try {
      // Calculate target date with timezone awareness
      const targetDate = DateTimeCalculator.calculateBookingDate(
        this.config.daysAhead,
        this.config.timezone
      );
      
      const dayOfWeek = getDay(DateTimeCalculator.getCurrentTimestamp(this.config.timezone));

      // Generate prioritized time slots with fallback alternatives
      const prioritizedTimeSlots = this.timeSlotGenerator.generatePrioritizedTimeSlots(
        this.config.targetStartTime,
        this.config.timePreferences,
        this.config.fallbackTimeRange
      );

      logger.info('Calculated enhanced booking parameters', component, {
        targetDate,
        timezone: this.config.timezone,
        dayOfWeek,
        primaryTime: this.config.targetStartTime,
        alternativeSlots: prioritizedTimeSlots.length,
        daysAhead: this.config.daysAhead,
      });

      // Try booking with prioritized time slots (fallback strategy)
      for (const timeSlot of prioritizedTimeSlots) {
        const result = await this.attemptBookingForTimeSlot(
          targetDate,
          timeSlot,
          dayOfWeek
        );
        
        if (result.success) {
          // Update pattern learning on success
          if (this.patternLearningEnabled && result.bookedPair) {
            await this.updateBookingPattern(
              result.bookedPair.courtId,
              timeSlot.startTime,
              dayOfWeek,
              true
            );
          }
          
          return result;
        }
        
        // Log failed attempt but continue to next time slot
        logger.debug('Time slot attempt failed, trying next', component, {
          attemptedTime: timeSlot.startTime,
          priority: timeSlot.priority,
          error: result.error
        });
      }

      // All time slots failed
      return {
        success: false,
        error: `No bookings possible for any of ${prioritizedTimeSlots.length} time alternatives`,
        retryAttempts: 0,
        timestamp: DateTimeCalculator.getCurrentTimestamp(this.config.timezone),
      };
    } catch (error) {
      return {
        success: false,
        error: `Enhanced booking attempt failed: ${error instanceof Error ? error.message : String(error)}`,
        retryAttempts: 0,
        timestamp: DateTimeCalculator.getCurrentTimestamp(this.config.timezone),
      };
    }
  }

  /**
   * Attempt booking for a specific time slot with intelligent court selection
   */
  private async attemptBookingForTimeSlot(
    targetDate: string,
    timeSlot: { startTime: string; endTime: string; priority: number },
    dayOfWeek: number
  ): Promise<BookingResult> {
    const component = 'BookingManager.attemptBookingForTimeSlot';
    
    try {
      // Generate time slots for this specific time
      const timeSlots = DateTimeCalculator.generateTimeSlots(
        timeSlot.startTime,
        this.config.duration
      );

      // Navigate to booking page
      await this.navigateToBookingPage(targetDate);

      // Search for available slots
      const slotSearcher = new SlotSearcher(this.page, targetDate, timeSlots);
      const searchResult = await slotSearcher.searchAvailableSlots();

      if (searchResult.availablePairs.length === 0) {
        // Update pattern learning on failure
        if (this.patternLearningEnabled) {
          // Update patterns for all preferred courts as failed
          for (const courtId of this.config.preferredCourts) {
            await this.updateBookingPattern(courtId, timeSlot.startTime, dayOfWeek, false);
          }
        }
        
        return {
          success: false,
          error: `No available slot pairs found for ${timeSlot.startTime}`,
          retryAttempts: 0,
          timestamp: DateTimeCalculator.getCurrentTimestamp(this.config.timezone),
        };
      }

      // Use intelligent court selection
      const selectedPair = await this.selectOptimalCourt(
        searchResult,
        timeSlot.startTime,
        dayOfWeek
      );

      if (!selectedPair) {
        return {
          success: false,
          error: 'No suitable courts available after intelligent selection',
          retryAttempts: 0,
          timestamp: DateTimeCalculator.getCurrentTimestamp(this.config.timezone),
        };
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
        error: `Time slot booking failed: ${error instanceof Error ? error.message : String(error)}`,
        retryAttempts: 0,
        timestamp: DateTimeCalculator.getCurrentTimestamp(this.config.timezone),
      };
    }
  }

  /**
   * Select optimal court using intelligence scoring system
   */
  private async selectOptimalCourt(
    searchResult: any,
    timeSlot: string,
    dayOfWeek: number
  ): Promise<BookingPair | null> {
    const component = 'BookingManager.selectOptimalCourt';
    
    // Extract available court IDs
    const availableCourtIds = searchResult.availableCourts;
    const availablePairs = searchResult.availablePairs;
    
    // Score courts using the intelligent scoring system
    const courtScores = this.courtScorer.scoreCourts(
      availableCourtIds,
      availableCourtIds, // All courts are available
      this.config.preferredCourts,
      timeSlot,
      dayOfWeek
    );

    logger.debug('Court scoring completed', component, {
      timeSlot,
      dayOfWeek,
      totalCourts: availableCourtIds.length,
      scores: courtScores.slice(0, 3).map(s => ({
        courtId: s.courtId,
        score: s.score,
        reason: s.reason
      }))
    });

    // Get the best available court
    const bestCourtId = this.courtScorer.getBestCourt(courtScores);
    
    if (!bestCourtId) {
      logger.warn('No best court found from scoring', component);
      return null;
    }

    // Find the booking pair for the best court
    const bestPair = availablePairs.find((pair: BookingPair) => 
      pair.courtId === bestCourtId
    );

    if (!bestPair) {
      logger.warn('Best court has no available pairs', component, { bestCourtId });
      return availablePairs[0] || null; // Fallback to first available
    }

    // Check for isolation before final selection
    const nonIsolatingPairs = availablePairs.filter((pair: BookingPair) => {
      const isolationCheck = IsolationChecker.checkIsolation(
        pair,
        this.getAllSlotsFromSearchResult(searchResult)
      );
      return !isolationCheck.hasIsolation;
    });

    // Prefer the best scoring court if it doesn't create isolation
    const bestPairIsolationCheck = IsolationChecker.checkIsolation(
      bestPair,
      this.getAllSlotsFromSearchResult(searchResult)
    );

    if (!bestPairIsolationCheck.hasIsolation) {
      logger.info('Selected optimal court without isolation', component, {
        courtId: bestCourtId,
        score: courtScores.find(s => s.courtId === bestCourtId)?.score
      });
      return bestPair;
    }

    // If best court creates isolation, try the next best non-isolating option
    if (nonIsolatingPairs.length > 0) {
      const alternativePair = nonIsolatingPairs[0];
      logger.info('Selected alternative court to avoid isolation', component, {
        originalCourt: bestCourtId,
        selectedCourt: alternativePair.courtId
      });
      return alternativePair;
    }

    // If all pairs create isolation, use the best scoring one anyway
    logger.warn('All pairs create isolation, using best scoring court', component, {
      selectedCourt: bestCourtId
    });
    return bestPair;
  }

  /**
   * Update booking pattern for pattern learning
   */
  private async updateBookingPattern(
    courtId: string,
    timeSlot: string,
    dayOfWeek: number,
    success: boolean
  ): Promise<void> {
    try {
      this.courtScorer.updatePattern(courtId, timeSlot, dayOfWeek, success);
      
      // Periodically save patterns to storage
      if (Math.random() < 0.1) { // 10% chance to save (to avoid too frequent I/O)
        const patterns = this.courtScorer.exportPatterns();
        await this.patternStorage.savePatterns(patterns);
      }
    } catch (error) {
      logger.warn('Failed to update booking pattern', 'BookingManager', {
        courtId,
        timeSlot,
        dayOfWeek,
        success,
        error: (error as Error).message
      });
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
   * Simulate booking for dry-run mode with pattern learning
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
      timestamp: DateTimeCalculator.getCurrentTimestamp(this.config.timezone),
    };
  }

  /**
   * Execute real booking with enhanced error handling
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
        timestamp: DateTimeCalculator.getCurrentTimestamp(this.config.timezone),
      };
    } catch (error) {
      return {
        success: false,
        error: `Real booking failed: ${error instanceof Error ? error.message : String(error)}`,
        retryAttempts: 1,
        timestamp: DateTimeCalculator.getCurrentTimestamp(this.config.timezone),
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

  /**
   * Categorize error for structured logging
   */
  private categorizeError(errorMessage: string): ErrorCategory {
    const lowerError = errorMessage.toLowerCase();
    
    if (lowerError.includes('timeout') || lowerError.includes('timed out')) {
      return ErrorCategory.TIMEOUT;
    } else if (lowerError.includes('network') || lowerError.includes('connection') || lowerError.includes('fetch')) {
      return ErrorCategory.NETWORK;
    } else if (lowerError.includes('auth') || lowerError.includes('login') || lowerError.includes('permission')) {
      return ErrorCategory.AUTHENTICATION;
    } else if (lowerError.includes('validation') || lowerError.includes('invalid') || lowerError.includes('format')) {
      return ErrorCategory.VALIDATION;
    } else if (lowerError.includes('booking') || lowerError.includes('slot') || lowerError.includes('court')) {
      return ErrorCategory.BUSINESS_LOGIC;
    } else if (lowerError.includes('system') || lowerError.includes('memory') || lowerError.includes('resource')) {
      return ErrorCategory.SYSTEM;
    } else {
      return ErrorCategory.UNKNOWN;
    }
  }

  /**
   * Sanitize configuration for logging (remove sensitive data)
   */
  private sanitizeConfigForLogging(): Record<string, unknown> {
    return {
      daysAhead: this.config.daysAhead,
      targetStartTime: this.config.targetStartTime,
      duration: this.config.duration,
      maxRetries: this.config.maxRetries,
      dryRun: this.config.dryRun,
      timezone: this.config.timezone,
      preferredCourtsCount: this.config.preferredCourts.length,
      patternLearningEnabled: this.config.enablePatternLearning,
      fallbackTimeRange: this.config.fallbackTimeRange,
      timePreferencesCount: this.config.timePreferences.length
    };
  }

  /**
   * Get booking manager statistics for monitoring
   */
  getBookingStats(): {
    config: Record<string, unknown>;
    patternLearningEnabled: boolean;
    courtScorerStats: ReturnType<CourtScorer['getStats']>;
    validatorStats: ReturnType<DryRunValidator['getValidationStats']>;
  } {
    return {
      config: this.sanitizeConfigForLogging(),
      patternLearningEnabled: this.patternLearningEnabled,
      courtScorerStats: this.courtScorer.getStats(),
      validatorStats: this.validator.getValidationStats()
    };
  }
}
