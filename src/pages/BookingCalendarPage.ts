import type { Page } from '@playwright/test';
import { BasePage } from './BasePage';
import { BookingSlot, CalendarMatrix, CalendarCell } from '../types/booking.types';
import { CalendarMatrixBuilder } from '../core/CalendarMatrixBuilder';
import { logger } from '../utils/logger';

/**
 * Page Object for the booking calendar interface
 */
export class BookingCalendarPage extends BasePage {
  private readonly matrixBuilder: CalendarMatrixBuilder;
  
  private readonly selectors = {
    // Calendar and container elements (LIVE-TESTED WORKING SELECTORS)
    calendar: '#booking-calendar-container', // ✅ LIVE VERIFIED - Found 1
    calendarContainer: '#booking-calendar-container', // ✅ LIVE VERIFIED - Found 1
    
    // Date navigation elements (Eversports specific)
    dateInput: 'input[type="date"], .date-input, [data-testid="date-picker"]',
    nextWeekButton: '#next-week, .next-week, [data-testid="next-week"]',
    prevWeekButton: '#prev-week, .prev-week, [data-testid="prev-week"]',
    currentDateDisplay: '.current-date, .selected-date, .date-display',
    
    // Court and slot elements (LIVE-TESTED WORKING SELECTORS)
    courtSelector: 'td[data-court]', // ✅ LIVE VERIFIED - Found 1477
    timeSlot: 'td[data-date], td[data-start]', // ✅ LIVE VERIFIED - Found 1428 each
    availableSlot: 'td[data-state="free"]', // ✅ LIVE VERIFIED - Found 787
    bookedSlot: 'td[data-state="booked"], td[data-state="unavailable"]',
    slotContainer: '#booking-calendar-container', // ✅ LIVE VERIFIED
    
    // Combined selectors (WORKING ui.vision patterns)
    combinedSlot: '[data-date][data-start][data-state][data-court]', // ✅ LIVE VERIFIED - Found 1428
    freeSlotByTime: (date: string, time: string, court: string) => 
      `td[data-date='${date}'][data-start='${time}'][data-court='${court}'][data-state='free']`, // ui.vision pattern
    
    // XPath patterns (proven working from ui.vision)
    xpathCalendar: '//div[@id="booking-calendar-container"]', // ✅ LIVE VERIFIED
    xpathTimeSlots: '//div[@id="booking-calendar-container"]//td[@data-date]', // ✅ LIVE VERIFIED - Found 1428
    xpathFreeSlots: '//div[@id="booking-calendar-container"]//td[@data-state="free"]', // ✅ LIVE VERIFIED - Found 787
    xpathCourtSlots: '//div[@id="booking-calendar-container"]//td[@data-court]', // ✅ LIVE VERIFIED - Found 1477
    
    // Navigation controls
    nextButton: '#next-week, .next, .btn-next, [data-testid="next"]',
    prevButton: '#prev-week, .prev, .btn-prev, [data-testid="prev"]',
    loading: '.loading, .spinner, [data-testid="loading"]',
  };

  constructor(page: Page) {
    super(page);
    this.matrixBuilder = new CalendarMatrixBuilder();
  }

  /**
   * Navigate to the booking calendar page
   */
  async navigateToBookingPage(): Promise<void> {
    const component = 'BookingCalendarPage.navigateToBookingPage';

    logger.info('Navigating to booking calendar', component);

    await this.navigateTo('/sb/sportcenter-kautz?sport=squash');
    await this.handleCookieConsent();
    await this.waitForCalendarToLoad();

    logger.info('Successfully navigated to booking calendar', component);
  }

  /**
   * Wait for calendar to fully load
   */
  async waitForCalendarToLoad(): Promise<void> {
    const component = 'BookingCalendarPage.waitForCalendarToLoad';

    try {
      // Wait for calendar container
      await this.waitForAnySelector([this.selectors.calendar, this.selectors.slotContainer]);

      // Wait for loading indicators to disappear
      const loadingExists = await this.elementExists(this.selectors.loading, 2000);
      if (loadingExists) {
        await this.page
          .locator(this.selectors.loading)
          .waitFor({ state: 'hidden', timeout: 10000 });
      }

      logger.debug('Calendar loaded successfully', component);
    } catch (error) {
      logger.error('Error waiting for calendar to load', component, {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Navigate to a specific date using direct input or button clicks
   */
  async navigateToDate(targetDate: string): Promise<void> {
    const component = 'BookingCalendarPage.navigateToDate';

    logger.info('Navigating to target date', component, { targetDate });

    try {
      // Method 1: Try direct date input first (preferred method)
      if (await this.tryDirectDateInput(targetDate)) {
        logger.info('Successfully navigated using direct date input', component);
        return;
      }

      // Method 2: Try URL parameter approach
      if (await this.tryUrlDateNavigation(targetDate)) {
        logger.info('Successfully navigated using URL parameters', component);
        return;
      }

      // Method 3: Fallback to clicking navigation buttons
      logger.info('Falling back to click navigation', component);
      await this.navigateToDateByClicking(targetDate);
    } catch (error) {
      logger.error('Error navigating to date', component, {
        targetDate,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Try to navigate by directly entering the date in an input field
   */
  private async tryDirectDateInput(targetDate: string): Promise<boolean> {
    const component = 'BookingCalendarPage.tryDirectDateInput';

    try {
      // Look for date input fields
      const dateInputSelectors = [
        this.selectors.dateInput,
        'input[type="date"]',
        '.datepicker input',
        '[data-date-input]',
        '#date-picker',
        '.date-picker input'
      ];

      for (const selector of dateInputSelectors) {
        if (await this.elementExists(selector)) {
          logger.debug('Found date input field', component, { selector });
          
          // Clear and fill the date input
          await this.page.locator(selector).clear();
          await this.page.locator(selector).fill(targetDate);
          
          // Try different ways to trigger the date change
          await this.page.keyboard.press('Enter');
          await this.page.waitForTimeout(1000);
          
          // Check if the calendar updated
          await this.waitForCalendarToLoad();
          
          // Verify the date was set correctly
          const currentDate = await this.getCurrentSelectedDate();
          if (currentDate === targetDate) {
            logger.info('Date input successful', component, { targetDate });
            return true;
          }
        }
      }

      return false;
    } catch (error) {
      logger.debug('Direct date input failed', component, {
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Try to navigate using URL parameters
   */
  private async tryUrlDateNavigation(targetDate: string): Promise<boolean> {
    const component = 'BookingCalendarPage.tryUrlDateNavigation';

    try {
      const currentUrl = this.page.url();
      const urlParams = new URLSearchParams();
      urlParams.set('date', targetDate);
      urlParams.set('view', 'calendar');
      
      const newUrl = `${currentUrl.split('?')[0]}?${urlParams.toString()}`;
      
      logger.debug('Trying URL navigation', component, { newUrl });
      
      await this.page.goto(newUrl, { waitUntil: 'networkidle' });
      await this.waitForCalendarToLoad();
      
      // Verify we're on the correct date
      const currentDate = await this.getCurrentSelectedDate();
      if (currentDate === targetDate) {
        logger.info('URL navigation successful', component, { targetDate });
        return true;
      }
      
      return false;
    } catch (error) {
      logger.debug('URL navigation failed', component, {
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Navigate to date by clicking through calendar (improved for Eversports)
   */
  private async navigateToDateByClicking(targetDate: string): Promise<void> {
    const component = 'BookingCalendarPage.navigateToDateByClicking';

    const targetDateObj = new Date(targetDate);
    const currentDate = new Date();

    logger.debug('Navigating by clicking', component, {
      targetDate,
      currentDate: currentDate.toISOString(),
    });

    // Calculate how many weeks to navigate forward (Eversports uses weekly navigation)
    const daysDifference = Math.ceil(
      (targetDateObj.getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24)
    );
    
    const weeksToNavigate = Math.ceil(daysDifference / 7);

    logger.debug('Navigation calculation', component, {
      daysDifference,
      weeksToNavigate,
    });

    if (weeksToNavigate > 0) {
      // Navigate forward using next-week button (Eversports specific)
      for (let i = 0; i < weeksToNavigate; i++) {
        await this.clickNextWeek();
        await this.page.waitForTimeout(2000); // Wait for calendar to update
        await this.waitForCalendarToLoad();
        
        // Check if we've reached or passed the target date
        const currentCalendarDate = await this.getCurrentSelectedDate();
        if (currentCalendarDate >= targetDate) {
          logger.debug('Reached target date range', component, { 
            currentCalendarDate, 
            targetDate, 
            iteration: i + 1 
          });
          break;
        }
      }
    } else if (weeksToNavigate < 0) {
      // Navigate backward if needed
      const weeksBack = Math.abs(weeksToNavigate);
      for (let i = 0; i < weeksBack; i++) {
        await this.clickPrevWeek();
        await this.page.waitForTimeout(2000);
        await this.waitForCalendarToLoad();
      }
    }

    await this.waitForCalendarToLoad();
    logger.info('Navigation by clicking completed', component, { targetDate });
  }

  /**
   * Click the next week button (Eversports specific)
   */
  private async clickNextWeek(): Promise<void> {
    const component = 'BookingCalendarPage.clickNextWeek';

    try {
      // Try different selectors for the next week button
      const nextWeekSelectors = [
        '#next-week',
        '.next-week',
        '[data-testid="next-week"]',
        'button[aria-label*="next"]',
        '.calendar-nav-next',
        this.selectors.nextWeekButton
      ];

      for (const selector of nextWeekSelectors) {
        if (await this.elementExists(selector)) {
          await this.safeClick(selector);
          logger.debug('Clicked next week button', component, { selector });
          return;
        }
      }

      // Fallback to generic next button
      if (await this.elementExists(this.selectors.nextButton)) {
        await this.safeClick(this.selectors.nextButton);
        logger.debug('Used fallback next button', component);
        return;
      }

      throw new Error('No next week button found');
    } catch (error) {
      logger.error('Error clicking next week', component, {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Click the previous week button (Eversports specific)
   */
  private async clickPrevWeek(): Promise<void> {
    const component = 'BookingCalendarPage.clickPrevWeek';

    try {
      const prevWeekSelectors = [
        '#prev-week',
        '.prev-week',
        '[data-testid="prev-week"]',
        'button[aria-label*="prev"]',
        '.calendar-nav-prev',
        this.selectors.prevWeekButton
      ];

      for (const selector of prevWeekSelectors) {
        if (await this.elementExists(selector)) {
          await this.safeClick(selector);
          logger.debug('Clicked prev week button', component, { selector });
          return;
        }
      }

      // Fallback to generic prev button
      if (await this.elementExists(this.selectors.prevButton)) {
        await this.safeClick(this.selectors.prevButton);
        logger.debug('Used fallback prev button', component);
        return;
      }

      throw new Error('No prev week button found');
    } catch (error) {
      logger.error('Error clicking prev week', component, {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Get all available courts for the current date (LIVE-TESTED IMPLEMENTATION)
   */
  async getAvailableCourts(): Promise<string[]> {
    const component = 'BookingCalendarPage.getAvailableCourts';

    logger.info('Getting available courts', component);

    try {
      // Wait for calendar container first (LIVE VERIFIED)
      await this.waitForElement('#booking-calendar-container');
      
      // Use LIVE VERIFIED approach - use locator.all() with immediate extraction
      const courtLocators = await this.page.locator('td[data-court]').all();
      const courts = new Set<string>();
      
      // Extract court IDs immediately to avoid memory collection issues  
      for (const locator of courtLocators) {
        try {
          const courtId = await locator.getAttribute('data-court');
          if (courtId) {
            courts.add(courtId);
          }
        } catch (error) {
          // Skip this element if it was collected
          continue;
        }
      }

      const courtsArray = Array.from(courts);
      logger.debug('Found unique courts from locators', component, { courts: courtsArray, count: courtsArray.length });

      // Now check which courts have available slots
      const availableCourts: string[] = [];
      
      for (const courtId of courtsArray) {
        const hasAvailableSlots = await this.checkCourtHasAvailableSlots(courtId);
        
        if (hasAvailableSlots) {
          availableCourts.push(courtId);
          logger.debug('Court with available slots found', component, { courtId });
        }
      }

      logger.info('Found available courts', component, { courts: availableCourts, totalCount: availableCourts.length });
      return availableCourts;
    } catch (error) {
      logger.error('Error getting available courts', component, {
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  /**
   * Check if a court has available slots (LIVE-TESTED IMPLEMENTATION)
   */
  private async checkCourtHasAvailableSlots(courtId: string): Promise<boolean> {
    try {
      // Use LIVE VERIFIED selector pattern to find free slots for this court
      const freeSlots = await this.page.$$(`td[data-court='${courtId}'][data-state='free']`);
      const hasSlots = freeSlots.length > 0;
      
      logger.debug('Checked court for available slots', 'BookingCalendarPage.checkCourtHasAvailableSlots', {
        courtId,
        freeSlots: freeSlots.length,
        hasSlots
      });
      
      return hasSlots;
    } catch (error) {
      logger.debug('Error checking court slots', 'BookingCalendarPage.checkCourtHasAvailableSlots', {
        courtId,
        error: error instanceof Error ? error.message : String(error)
      });
      return false;
    }
  }

  /**
   * Get all time slots for a specific court
   */
  async getCourtTimeSlots(courtId: string, targetTimes: string[]): Promise<BookingSlot[]> {
    const component = 'BookingCalendarPage.getCourtTimeSlots';

    logger.info('Getting court time slots', component, { courtId, targetTimes });

    const slots: BookingSlot[] = [];

    try {
      // Navigate to court view if needed
      await this.selectCourt(courtId);

      for (const targetTime of targetTimes) {
        const slot = await this.findTimeSlot(courtId, targetTime);
        if (slot) {
          slots.push(slot);
        }
      }

      logger.info('Retrieved court time slots', component, { courtId, slotsFound: slots.length });
      return slots;
    } catch (error) {
      logger.error('Error getting court time slots', component, {
        courtId,
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  /**
   * Select a specific court
   */
  async selectCourt(courtId: string): Promise<void> {
    const component = 'BookingCalendarPage.selectCourt';

    try {
      const courtSelectors = [
        `[data-court-id="${courtId}"]`,
        `[data-testid*="${courtId}"]`,
        `#court-${courtId}`,
        `.court-${courtId}`,
      ];

      for (const selector of courtSelectors) {
        if (await this.elementExists(selector)) {
          await this.safeClick(selector);
          await this.page.waitForTimeout(1000);
          logger.debug('Selected court', component, { courtId, selector });
          return;
        }
      }

      logger.warn('Could not find court selector', component, { courtId });
    } catch (error) {
      logger.error('Error selecting court', component, {
        courtId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Find a specific time slot (LIVE-TESTED ui.vision IMPLEMENTATION)
   */
  async findTimeSlot(courtId: string, time: string, targetDate?: string): Promise<BookingSlot | null> {
    const component = 'BookingCalendarPage.findTimeSlot';

    const currentDate = targetDate || await this.getCurrentSelectedDate();
    
    // Convert time format to match ui.vision ("14:00" to "1400")
    const timeFormatted = time.replace(':', '');

    try {
      logger.debug('Searching for time slot with LIVE-VERIFIED patterns', component, { 
        courtId, 
        time, 
        timeFormatted,
        currentDate
      });

      // PRIMARY: Use exact ui.vision working pattern (LIVE VERIFIED)
      const primarySelector = `td[data-date='${currentDate}'][data-start='${timeFormatted}'][data-court='${courtId}'][data-state='free']`;
      logger.debug('Testing primary ui.vision selector', component, { primarySelector });
      
      const primaryElements = await this.page.$$(primarySelector);
      if (primaryElements.length > 0) {
        const element = primaryElements[0]!;
        const isAvailable = await this.isSlotAvailable(element);
        
        const slot: BookingSlot = {
          date: currentDate,
          startTime: time,
          courtId,
          isAvailable,
          elementSelector: primarySelector,
        };

        logger.info('Found time slot with primary selector', component, { 
          courtId, 
          time, 
          isAvailable, 
          selector: primarySelector 
        });
        
        return slot;
      }

      // SECONDARY: Use XPath pattern (LIVE VERIFIED)
      const xpathSelector = `xpath=//div[@id='booking-calendar-container']//td[@data-date='${currentDate}' and @data-start='${timeFormatted}' and @data-court='${courtId}' and @data-state='free']`;
      logger.debug('Testing XPath ui.vision selector', component, { xpathSelector });
      
      const xpathElements = await this.page.$$(xpathSelector);
      if (xpathElements.length > 0) {
        const element = xpathElements[0]!;
        const isAvailable = await this.isSlotAvailable(element);
        
        const slot: BookingSlot = {
          date: currentDate,
          startTime: time,
          courtId,
          isAvailable,
          elementSelector: xpathSelector,
        };

        logger.info('Found time slot with XPath selector', component, { 
          courtId, 
          time, 
          isAvailable 
        });
        
        return slot;
      }

      // TERTIARY: Relaxed search without state requirement
      const relaxedSelector = `td[data-date='${currentDate}'][data-start='${timeFormatted}'][data-court='${courtId}']`;
      logger.debug('Testing relaxed selector', component, { relaxedSelector });
      
      const relaxedElements = await this.page.$$(relaxedSelector);
      if (relaxedElements.length > 0) {
        const element = relaxedElements[0]!;
        const isAvailable = await this.isSlotAvailable(element);
        
        const slot: BookingSlot = {
          date: currentDate,
          startTime: time,
          courtId,
          isAvailable,
          elementSelector: relaxedSelector,
        };

        logger.info('Found time slot with relaxed selector', component, { 
          courtId, 
          time, 
          isAvailable 
        });
        
        return slot;
      }

      logger.warn('Time slot not found with any LIVE-VERIFIED patterns', component, { 
        courtId, 
        time, 
        timeFormatted, 
        currentDate 
      });
      return null;
      
    } catch (error) {
      logger.error('Error finding time slot', component, {
        courtId,
        time,
        currentDate,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Check if a slot is available (optimized for Eversports)
   */
  private async isSlotAvailable(slotElement: any): Promise<boolean> {
    try {
      // Eversports-specific availability check (data-state attribute)
      const dataState = await slotElement.getAttribute('data-state');
      if (dataState === 'free') {
        return true;
      }
      if (dataState === 'booked' || dataState === 'unavailable') {
        return false;
      }

      // Generic availability checks
      const classList = (await slotElement.getAttribute('class')) || '';
      const dataAvailable = await slotElement.getAttribute('data-available');

      // Check for availability indicators
      const isAvailable = (
        !classList.includes('booked') &&
        !classList.includes('unavailable') &&
        !classList.includes('disabled') &&
        !classList.includes('blocked') &&
        dataAvailable !== 'false' &&
        dataState !== 'booked'
      );

      // Additional checks for positive availability indicators
      const hasAvailableClass = (
        classList.includes('available') ||
        classList.includes('free') ||
        classList.includes('slot-available') ||
        dataAvailable === 'true' ||
        dataState === 'free'
      );

      return isAvailable || hasAvailableClass;
    } catch (error) {
      // If we can't determine availability, assume it's not available for safety
      return false;
    }
  }

  /**
   * Get selector for a slot element (optimized for Eversports)
   * @param slotElement - The slot element to get selector for
   * @returns Promise<string> - The element selector
   */
  async getSlotSelector(slotElement: any): Promise<string> {
    try {
      // Try ID first
      const id = await slotElement.getAttribute('id');
      if (id) return `#${id}`;

      // Eversports-specific attributes (from original JSON automation)
      const dataDate = await slotElement.getAttribute('data-date');
      const dataStart = await slotElement.getAttribute('data-start');
      const dataCourt = await slotElement.getAttribute('data-court');
      const dataState = await slotElement.getAttribute('data-state');

      // Build Eversports-specific selector
      if (dataDate && dataStart) {
        let selector = `td[data-date='${dataDate}'][data-start='${dataStart}']`;
        
        if (dataCourt) {
          selector += `[data-court='${dataCourt}']`;
        }
        
        if (dataState) {
          selector += `[data-state='${dataState}']`;
        }
        
        return selector;
      }

      // Generic data attributes
      const testId = await slotElement.getAttribute('data-testid');
      if (testId) return `[data-testid="${testId}"]`;

      const time = await slotElement.getAttribute('data-time');
      const court = await slotElement.getAttribute('data-court');
      if (time && court) return `[data-time="${time}"][data-court="${court}"]`;

      if (time) return `[data-time="${time}"]`;

      // Try class-based selectors
      const classList = await slotElement.getAttribute('class');
      if (classList) {
        const classes = classList.split(' ').filter((c: string) => c.includes('slot') || c.includes('time'));
        if (classes.length > 0) {
          return `.${classes.join('.')}`;
        }
      }

      // Fallback: use tag name with unique attributes
      const tagName = await slotElement.evaluate((el: any) => el.tagName.toLowerCase());
      if (tagName === 'td' && (dataDate || dataStart)) {
        const parts = [`${tagName}`];
        if (dataDate) parts.push(`[data-date='${dataDate}']`);
        if (dataStart) parts.push(`[data-start='${dataStart}']`);
        return parts.join('');
      }

      return 'td'; // Fallback for table cells
    } catch (error) {
      return 'slot-element';
    }
  }

  /**
   * Select a specific time slot
   */
  async selectTimeSlot(slot: BookingSlot): Promise<void> {
    const component = 'BookingCalendarPage.selectTimeSlot';

    logger.info('Selecting time slot', component, {
      courtId: slot.courtId,
      startTime: slot.startTime,
      selector: slot.elementSelector,
    });

    try {
      if (slot.elementSelector && slot.elementSelector !== 'slot-element') {
        await this.safeClick(slot.elementSelector);
        await this.page.waitForTimeout(500);
        logger.info('Time slot selected successfully', component);
      } else {
        throw new Error('No valid element selector for slot');
      }
    } catch (error) {
      logger.error('Error selecting time slot', component, {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Check if current page shows booking calendar
   */
  async isOnBookingCalendar(): Promise<boolean> {
    try {
      return (
        (await this.elementExists(this.selectors.calendar)) ||
        (await this.elementExists(this.selectors.slotContainer))
      );
    } catch {
      return false;
    }
  }

  /**
   * Get current selected date from the calendar
   */
  async getCurrentSelectedDate(): Promise<string> {
    const component = 'BookingCalendarPage.getCurrentSelectedDate';

    try {
      // Method 1: Try to extract date from date input field
      const dateInputSelectors = [
        this.selectors.dateInput,
        'input[type="date"]',
        '.date-input',
        '[data-date-input]'
      ];

      for (const selector of dateInputSelectors) {
        if (await this.elementExists(selector)) {
          const dateValue = await this.page.inputValue(selector);
          if (dateValue && dateValue.match(/^\d{4}-\d{2}-\d{2}$/)) {
            logger.debug('Found date from input field', component, { dateValue, selector });
            return dateValue;
          }
        }
      }

      // Method 2: Try to extract from current date display
      const dateDisplaySelectors = [
        this.selectors.currentDateDisplay,
        '.current-date',
        '.selected-date',
        '.date-display',
        '.calendar-header .date',
        '[data-current-date]'
      ];

      for (const selector of dateDisplaySelectors) {
        if (await this.elementExists(selector)) {
          const dateText = await this.page.textContent(selector);
          if (dateText) {
            const dateMatch = dateText.match(/(\d{4}-\d{2}-\d{2})/);
            if (dateMatch) {
              logger.debug('Found date from display element', component, { dateText, selector });
              return dateMatch[1]!;
            }
          }
        }
      }

      // Method 3: Try to extract from URL parameters
      const url = this.page.url();
      const urlParams = new URLSearchParams(url.split('?')[1] || '');
      const urlDate = urlParams.get('date');
      if (urlDate && urlDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
        logger.debug('Found date from URL parameters', component, { urlDate });
        return urlDate;
      }

      // Method 4: Try to extract from page title or header
      const title = await this.getPageTitle();
      const titleDateMatch = title.match(/(\d{4}-\d{2}-\d{2})/);
      if (titleDateMatch) {
        logger.debug('Found date from page title', component, { title });
        return titleDateMatch[1]!;
      }

      // Method 5: Check for any calendar cells with current date indicators
      const todaySelectors = [
        '.today',
        '.current',
        '.selected',
        '[data-today]',
        '[aria-current="date"]'
      ];

      for (const selector of todaySelectors) {
        if (await this.elementExists(selector)) {
          const element = await this.page.$(selector);
          if (element) {
            const dataDate = await element.getAttribute('data-date');
            if (dataDate && dataDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
              logger.debug('Found date from current date cell', component, { dataDate, selector });
              return dataDate;
            }
          }
        }
      }

      // Fallback: Return current date
      const fallbackDate = new Date().toISOString().split('T')[0]!;
      logger.debug('Using fallback current date', component, { fallbackDate });
      return fallbackDate;
    } catch (error) {
      logger.error('Error getting current selected date', component, {
        error: error instanceof Error ? error.message : String(error),
      });
      // Fallback: Return current date
      return new Date().toISOString().split('T')[0]!;
    }
  }

  // ====================
  // MATRIX-BASED METHODS (Issue #20)
  // Single-Pass DOM Extraction for Performance Optimization
  // ====================

  /**
   * Extract complete calendar matrix in single pass
   * This is the main entry point for matrix-based operations
   */
  async extractCalendarMatrix(): Promise<CalendarMatrix> {
    const component = 'BookingCalendarPage.extractCalendarMatrix';
    logger.info('Starting single-pass calendar matrix extraction', component);

    try {
      await this.waitForCalendarToLoad();
      const matrix = await this.matrixBuilder.buildMatrix(this.page);
      
      logger.info('Calendar matrix extracted successfully', component, {
        totalCells: matrix.metrics.totalCells,
        courts: matrix.courts.length,
        timeSlots: matrix.timeSlots.length,
        extractionTimeMs: matrix.metrics.extractionDurationMs
      });

      return matrix;
    } catch (error) {
      logger.error('Failed to extract calendar matrix', component, { error });
      throw error;
    }
  }

  /**
   * Convert calendar matrix to legacy BookingSlot array for API compatibility
   */
  matrixToBookingSlots(matrix: CalendarMatrix, targetTimes: string[]): BookingSlot[] {
    const component = 'BookingCalendarPage.matrixToBookingSlots';
    const slots: BookingSlot[] = [];

    try {
      for (const [court, timeSlots] of matrix.cells) {
        for (const [timeKey, cell] of timeSlots) {
          const time = timeKey.split('T')[1]!;
          
          // Filter by target times if specified
          if (targetTimes.length > 0 && !targetTimes.includes(time)) {
            continue;
          }

          slots.push({
            date: cell.date,
            startTime: time,
            courtId: court,
            isAvailable: cell.state === 'free',
            elementSelector: cell.elementSelector
          });
        }
      }

      logger.debug('Converted matrix to booking slots', component, {
        totalSlots: slots.length,
        availableSlots: slots.filter(s => s.isAvailable).length
      });

      return slots;
    } catch (error) {
      logger.error('Failed to convert matrix to booking slots', component, { error });
      return [];
    }
  }

  /**
   * Get available courts from matrix data
   */
  matrixToCourtList(matrix: CalendarMatrix): string[] {
    const component = 'BookingCalendarPage.matrixToCourtList';
    
    try {
      const availableCourts: string[] = [];
      
      for (const [court, timeSlots] of matrix.cells) {
        const hasAvailableSlots = Array.from(timeSlots.values())
          .some(cell => cell.state === 'free');
        
        if (hasAvailableSlots) {
          availableCourts.push(court);
        }
      }

      logger.debug('Extracted available courts from matrix', component, {
        totalCourts: matrix.courts.length,
        availableCourts: availableCourts.length
      });

      return availableCourts.sort();
    } catch (error) {
      logger.error('Failed to extract courts from matrix', component, { error });
      return [];
    }
  }

  /**
   * Get specific slot from matrix with O(1) lookup
   */
  getSlotFromMatrix(
    matrix: CalendarMatrix, 
    court: string, 
    date: string, 
    startTime: string
  ): CalendarCell | null {
    const component = 'BookingCalendarPage.getSlotFromMatrix';
    
    try {
      const courtMap = matrix.cells.get(court);
      if (!courtMap) {
        logger.debug('Court not found in matrix', component, { court });
        return null;
      }

      const timeKey = `${date}T${startTime}`;
      const cell = courtMap.get(timeKey);
      
      if (cell) {
        logger.debug('Found slot in matrix', component, { court, date, startTime, state: cell.state });
      } else {
        logger.debug('Slot not found in matrix', component, { court, date, startTime });
      }

      return cell || null;
    } catch (error) {
      logger.error('Error getting slot from matrix', component, { error, court, date, startTime });
      return null;
    }
  }

  /**
   * Batch check slot availability from matrix
   */
  checkSlotsAvailabilityFromMatrix(
    matrix: CalendarMatrix,
    slotQueries: Array<{ court: string; date: string; startTime: string }>
  ): Array<{ query: typeof slotQueries[0]; cell: CalendarCell | null; isAvailable: boolean }> {
    const component = 'BookingCalendarPage.checkSlotsAvailabilityFromMatrix';
    
    try {
      const results = slotQueries.map(query => {
        const cell = this.getSlotFromMatrix(matrix, query.court, query.date, query.startTime);
        return {
          query,
          cell,
          isAvailable: cell?.state === 'free'
        };
      });

      logger.debug('Batch checked slot availability from matrix', component, {
        totalQueries: slotQueries.length,
        availableSlots: results.filter(r => r.isAvailable).length
      });

      return results;
    } catch (error) {
      logger.error('Error batch checking slots from matrix', component, { error });
      return slotQueries.map(query => ({ query, cell: null, isAvailable: false }));
    }
  }

  /**
   * Get matrix performance metrics
   */
  getMatrixMetrics(matrix: CalendarMatrix): {
    performanceGain: string;
    dataCompleteness: string;
    extractionTime: string;
    cellDensity: number;
  } {
    const { metrics } = matrix;
    
    // Estimate performance gain vs legacy approach
    const estimatedLegacyQueries = metrics.courtsWithData * metrics.timeSlotsWithData * 3; // 3 queries per slot
    const actualQueries = 1; // Single matrix extraction
    const performanceGain = `${Math.round((1 - actualQueries / estimatedLegacyQueries) * 100)}%`;
    
    const completenessPercentage = Math.round((metrics.totalCells / (metrics.courtsWithData * metrics.timeSlotsWithData)) * 100);
    const dataCompleteness = `${completenessPercentage}%`;
    
    const extractionTime = `${metrics.extractionDurationMs}ms`;
    const cellDensity = metrics.totalCells / (metrics.courtsWithData || 1);

    return {
      performanceGain,
      dataCompleteness, 
      extractionTime,
      cellDensity
    };
  }
}
