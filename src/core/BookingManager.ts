import type { Page } from '@playwright/test';
import { 
  BookingResult, 
  BookingPair,
  AdvancedBookingConfig,
  TimePreference,
  BookingSuccessResult,
  BookingPattern
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
import { getGlobalRetryManager, RetryManager } from './retry';
import { getDay } from 'date-fns';
import { CheckoutPage } from '@/pages/CheckoutPage';
import { BasePage } from '@/pages/BasePage';

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
  private patternsLoaded: boolean = false;
  private patternLoadingPromise: Promise<void> | null = null;
  private retryManager: RetryManager;
  private checkoutPage: CheckoutPage;

  constructor(page: Page, config: Partial<AdvancedBookingConfig> = {}) {
    this.page = page;
    
    // Extended configuration with new advanced features
    const advancedConfig: AdvancedBookingConfig = {
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
      timePreferences: config.timePreferences || this.generateDefaultTimePreferences()
    };
    
    // Only add holidayProvider if it exists
    if (config.holidayProvider) {
      advancedConfig.holidayProvider = config.holidayProvider;
    }
    
    this.config = advancedConfig;

    this.patternLearningEnabled = this.config.enablePatternLearning;

    // Initialize enhanced components
    this.validator = new DryRunValidator(
      process.env['NODE_ENV'] === 'production' ? 'strict' : 'standard'
    );
    this.courtScorer = new CourtScorer(this.config.courtScoringWeights);
    this.patternStorage = new PatternStorage();
    
    // Initialize TimeSlotGenerator with cache configuration
    this.timeSlotGenerator = new TimeSlotGenerator({
      enabled: process.env['TIME_SLOT_CACHE_ENABLED'] !== 'false',
      maxSize: parseInt(process.env['TIME_SLOT_CACHE_MAX_SIZE'] || '100', 10),
      ttlMs: parseInt(process.env['TIME_SLOT_CACHE_TTL_MS'] || '3600000', 10), // 1 hour
      debugMode: process.env['TIME_SLOT_CACHE_DEBUG'] === 'true',
      enableCacheWarming: process.env['TIME_SLOT_CACHE_WARMING'] !== 'false'
    });
    
    // Use global retry manager instance
    this.retryManager = getGlobalRetryManager();
    
    // Initialize checkout page
    this.checkoutPage = new CheckoutPage(page);

    // Pattern learning will be lazy-loaded on first use
    // No immediate loading during initialization for better performance
    if (this.patternLearningEnabled) {
      logger.info('Pattern learning enabled (lazy loading)', 'BookingManager');
    }

    // Initialize time slot cache warming if enabled
    if (this.timeSlotGenerator.isCacheEnabled()) {
      this.initializeCacheWarming();
    }

    logger.info('BookingManager initialized with advanced features', 'BookingManager', {
      timezone: this.config.timezone,
      preferredCourts: this.config.preferredCourts,
      patternLearning: this.patternLearningEnabled,
      fallbackRange: this.config.fallbackTimeRange,
      scoringWeights: this.config.courtScoringWeights,
      timeslotCacheEnabled: this.timeSlotGenerator.isCacheEnabled()
    });
  }

  /**
   * Ensure patterns are loaded (lazy loading)
   * This method is idempotent and thread-safe
   */
  private async ensurePatternsLoaded(): Promise<void> {
    // If patterns are already loaded, return immediately
    if (this.patternsLoaded) {
      return;
    }

    // If loading is already in progress, wait for it
    if (this.patternLoadingPromise) {
      await this.patternLoadingPromise;
      return;
    }

    // Start loading patterns
    this.patternLoadingPromise = this.loadPatternsWithTimeout();
    
    try {
      await this.patternLoadingPromise;
      this.patternsLoaded = true;
    } finally {
      this.patternLoadingPromise = null;
    }
  }

  /**
   * Load patterns with timeout and error handling
   */
  private async loadPatternsWithTimeout(): Promise<void> {
    const timeoutMs = parseInt(process.env['PATTERN_LOAD_TIMEOUT_MS'] || '5000', 10);
    
    try {
      const loadPromise = this.patternStorage.loadPatterns();
      
      // Race between loading and timeout
      const patterns = await Promise.race([
        loadPromise,
        new Promise<BookingPattern[]>((_, reject) => 
          setTimeout(() => reject(new Error('Pattern loading timeout')), timeoutMs)
        )
      ]);
      
      this.courtScorer.loadPatterns(patterns);
      
      logger.info('Pattern learning initialized (lazy loaded)', 'BookingManager', {
        loadedPatterns: patterns.length,
        loadTimeMs: timeoutMs
      });
    } catch (error) {
      logger.warn('Failed to load patterns, continuing without pattern learning', 'BookingManager', {
        error: (error as Error).message,
        timeout: timeoutMs
      });
      // Load empty patterns to prevent repeated attempts
      this.courtScorer.loadPatterns([]);
    }
  }

  /**
   * Initialize time slot cache warming with common configurations
   */
  private async initializeCacheWarming(): Promise<void> {
    try {
      // Run cache warming asynchronously to avoid blocking initialization
      this.timeSlotGenerator.warmCache().then(() => {
        const metrics = this.timeSlotGenerator.getCacheMetrics();
        logger.info('Time slot cache warming completed', 'BookingManager', {
          cacheSize: metrics.cacheSize,
          memoryUsage: `${metrics.memoryUsageMB.toFixed(2)}MB`
        });
      }).catch(error => {
        logger.warn('Cache warming failed', 'BookingManager', {
          error: error instanceof Error ? error.message : String(error)
        });
      });
    } catch (error) {
      logger.warn('Failed to start cache warming', 'BookingManager', {
        error: error instanceof Error ? error.message : String(error)
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
    const startTime = Date.now();
    
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
          ...(result.bookedPair?.courtId && { courtId: result.bookedPair.courtId }),
          ...(result.bookedPair?.slot1.date && { date: result.bookedPair.slot1.date }),
          ...(result.bookedPair?.slot1.startTime && { startTime: result.bookedPair.slot1.startTime }),
          ...(this.config.duration && { duration: this.config.duration }),
          ...(result.error && { error: result.error }),
          ...((!result.success && result.error) && { errorCategory: this.categorizeError(result.error) })
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
        
        logger.logStructuredError(errorMessage, errorCategory, component, {
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
    _correlationId: string
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
        timestamp: new Date(startTime),
      };
    }

    // Log warnings if any
    if (configValidation.warnings.length > 0) {
      logger.warn('Configuration warnings detected', component, {
        warnings: configValidation.warnings,
        recommendations: configValidation.recommendations
      });
    }

    logger.info('Starting booking process with retry manager', component, {
      config: this.config,
      mode: this.config.dryRun ? 'DRY_RUN' : 'PRODUCTION',
      validationPassed: true,
      retryEnabled: this.retryManager.getConfig().enabled,
      circuitBreakerState: this.retryManager.getCircuitBreakerState()
    });

    try {
      // Execute booking with robust retry logic
      const retryResult = await this.retryManager.execute(
        () => this.attemptBookingWithValidation(),
        'booking-process'
      );

      const finalResult: BookingResult = {
        ...retryResult.result,
        retryAttempts: retryResult.attempts,
        timestamp: new Date(startTime),
      };

      // Log successful booking
      if (finalResult.success && finalResult.bookedPair) {
        logger.logBookingSuccess(
          finalResult.bookedPair.courtId,
          finalResult.bookedPair.slot1.date,
          finalResult.bookedPair.slot1.startTime,
          component
        );
      }

      return finalResult;

    } catch (error) {
      // Handle retry exhaustion or circuit breaker errors
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      const finalResult: BookingResult = {
        success: false,
        error: `Booking failed after retry attempts: ${errorMessage}`,
        retryAttempts: this.retryManager.getConfig().maxAttempts,
        timestamp: new Date(startTime),
      };

      logger.logBookingFailure(finalResult.error!, component);
      
      return finalResult;
    }
  }

  /**
   * Booking attempt wrapper for retry manager integration
   * Validates success and throws errors for proper retry handling
   */
  private async attemptBookingWithValidation(): Promise<BookingResult> {
    const result = await this.attemptBooking();
    
    // If booking failed, throw an error for retry manager to handle
    if (!result.success) {
      const error = new Error(result.error || 'Booking attempt failed');
      // Add error properties for better classification
      (error as any).bookingResult = result;
      (error as any).isBookingFailure = true;
      throw error;
    }
    
    return result;
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
      
      const dayOfWeek = getDay(new Date(targetDate));

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
    // Component name for logging
    
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
    
    // Ensure patterns are loaded before scoring (lazy loading)
    if (this.patternLearningEnabled && !this.patternsLoaded) {
      await this.ensurePatternsLoaded();
    }
    
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
      const isolationCheck = IsolationChecker.checkForIsolation(
        pair,
        this.getAllSlotsFromSearchResult(searchResult)
      );
      return !isolationCheck.hasIsolation;
    });

    // Prefer the best scoring court if it doesn't create isolation
    const bestPairIsolationCheck = IsolationChecker.checkForIsolation(
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
      // Ensure patterns are loaded before updating (lazy loading)
      if (this.patternLearningEnabled && !this.patternsLoaded) {
        await this.ensurePatternsLoaded();
      }
      
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

      // Handle cookie consent banner immediately after page load
      await this.handleCookieConsentForBooking();

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
   * Handle cookie consent banner for booking flow
   * Non-blocking implementation that continues booking even if cookie handling fails
   */
  private async handleCookieConsentForBooking(): Promise<void> {
    const component = 'BookingManager.handleCookieConsentForBooking';
    
    try {
      logger.debug('Attempting to handle cookie consent for booking flow', component);
      
      // Create a temporary BasePage instance to use existing cookie handling functionality
      const basePage = new (class extends BasePage {
        constructor(page: Page) {
          super(page);
        }
      })(this.page);
      
      await basePage.handleCookieConsent();
      
      logger.info('Cookie consent handled successfully in booking flow', component);
    } catch (error) {
      // Non-blocking: Don't fail booking process if cookie handling fails
      logger.warn('Cookie consent handling failed, continuing with booking', component, {
        error: error instanceof Error ? error.message : String(error)
      });
    }
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

      // Complete booking process with enhanced success detection
      const successResult = await this.completeBookingProcess();

      if (successResult.success) {
        return {
          success: true,
          bookedPair: pair,
          retryAttempts: 1,
          timestamp: DateTimeCalculator.getCurrentTimestamp(this.config.timezone),
        };
      } else {
        // Booking process completed but success detection failed
        const errorMessage = `Booking success detection failed using ${successResult.method}`;
        logger.error(errorMessage, 'BookingManager.executeRealBooking', {
          method: successResult.method,
          timestamp: successResult.timestamp
        });
        
        return {
          success: false,
          error: errorMessage,
          retryAttempts: 1,
          timestamp: DateTimeCalculator.getCurrentTimestamp(this.config.timezone),
        };
      }
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
   * Complete the booking process with enhanced success detection
   */
  private async completeBookingProcess(): Promise<BookingSuccessResult> {
    const component = 'BookingManager.completeBookingProcess';

    logger.info('Completing booking process with enhanced success detection', component);

    try {
      // Complete the checkout process (handles login, payment, etc.)
      const checkoutOptions: {
        dryRun: boolean;
        userCredentials?: { email: string; password: string };
      } = {
        dryRun: this.config.dryRun
      };
      
      // Add user credentials from environment if available
      if (process.env['USER_EMAIL'] && process.env['USER_PASSWORD']) {
        checkoutOptions.userCredentials = {
          email: process.env['USER_EMAIL'],
          password: process.env['USER_PASSWORD']
        };
      }

      const checkoutSuccess = await this.checkoutPage.completeCheckout(checkoutOptions);
      
      if (!checkoutSuccess) {
        logger.error('Checkout process failed', component);
        return {
          success: false,
          method: 'none',
          timestamp: new Date()
        };
      }

      // If in dry run mode, return success without actual confirmation
      if (this.config.dryRun) {
        logger.info('Dry run mode - booking process completed without confirmation', component);
        return {
          success: true,
          confirmationId: 'dry-run-success',
          method: 'text-fallback', // Use text fallback method for dry runs
          timestamp: new Date()
        };
      }

      // Enhanced booking confirmation with success detection
      const successResult = await this.checkoutPage.confirmBooking();
      
      if (successResult.success) {
        logger.info('Live booking completed successfully', component, {
          confirmationId: successResult.confirmationId,
          detectionMethod: successResult.method,
          timestamp: successResult.timestamp
        });
        
        // Record booking success metrics
        this.recordBookingSuccess(successResult);
        
        return successResult;
      } else {
        logger.warn('Booking success detection failed', component, {
          method: successResult.method,
          timestamp: successResult.timestamp
        });
        
        return successResult;
      }

    } catch (error) {
      logger.error('Booking process failed with error', component, {
        error: error instanceof Error ? error.message : String(error),
        phase: 'booking-process'
      });
      
      return {
        success: false,
        method: 'none',
        timestamp: new Date()
      };
    }
  }

  /**
   * Record booking success metrics for analytics and monitoring
   */
  private recordBookingSuccess(result: BookingSuccessResult): void {
    const component = 'BookingManager.recordBookingSuccess';
    
    // Enhanced success metrics collection
    const metrics = {
      detectionMethod: result.method,
      confirmationId: result.confirmationId,
      detectionTime: result.timestamp,
      additionalData: result.additionalData
    };
    
    logger.info('Booking success metrics recorded', component, metrics);
    
    // Integration with existing monitoring systems
    try {
      bookingAnalytics.recordSuccess({
        confirmationId: result.confirmationId || 'unknown',
        detectionMethod: result.method,
        timestamp: result.timestamp,
        metadata: result.additionalData
      });
    } catch (error) {
      logger.warn('Failed to record booking analytics', component, {
        error: error instanceof Error ? error.message : String(error)
      });
    }
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
    timeslotCacheStats: ReturnType<TimeSlotGenerator['getCacheMetrics']>;
  } {
    return {
      config: this.sanitizeConfigForLogging(),
      patternLearningEnabled: this.patternLearningEnabled,
      courtScorerStats: this.courtScorer.getStats(),
      validatorStats: this.validator.getValidationStats(),
      timeslotCacheStats: this.timeSlotGenerator.getCacheMetrics()
    };
  }

  /**
   * Get time slot cache performance metrics
   */
  getCacheMetrics() {
    return this.timeSlotGenerator.getCacheMetrics();
  }

  /**
   * Log current cache status for monitoring
   */
  logCacheStatus(): void {
    this.timeSlotGenerator.logCacheStatus();
  }

  /**
   * Clear the time slot cache (useful for testing or troubleshooting)
   */
  clearTimeSlotCache(): void {
    this.timeSlotGenerator.clearCache();
    logger.info('Time slot cache cleared by request', 'BookingManager');
  }

  /**
   * Check if time slot caching is enabled
   */
  isCacheEnabled(): boolean {
    return this.timeSlotGenerator.isCacheEnabled();
  }
}
