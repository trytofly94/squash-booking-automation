import type { Page } from '@playwright/test';
import { BasePage } from './BasePage';
import { BookingSlot } from '../types/booking.types';
import { logger } from '../utils/logger';

/**
 * Page Object for the booking calendar interface
 */
export class BookingCalendarPage extends BasePage {
  private readonly selectors = {
    // Calendar and container elements
    calendar: '#booking-calendar-container, .calendar, [data-testid="calendar"], .booking-calendar',
    calendarContainer: '#booking-calendar-container',

    // Date navigation elements (Eversports specific)
    dateInput: 'input[type="date"], .date-input, [data-testid="date-picker"]',
    nextWeekButton: '#next-week, .next-week, [data-testid="next-week"]',
    prevWeekButton: '#prev-week, .prev-week, [data-testid="prev-week"]',
    currentDateDisplay: '.current-date, .selected-date, .date-display',

    // Court and slot elements
    courtSelector: '[data-testid*="court"], .court-selector, .court-list',
    timeSlot: '[data-time], .time-slot, .booking-slot, td[data-date]',
    availableSlot: 'td[data-state="free"], .available, .slot-available, [data-available="true"]',
    bookedSlot: 'td[data-state="booked"], .booked, .unavailable, [data-available="false"]',
    slotContainer: '#booking-calendar-container, .slots-container, .time-slots, .calendar-slots',

    // Navigation controls
    nextButton: '#next-week, .next, .btn-next, [data-testid="next"]',
    prevButton: '#prev-week, .prev, .btn-prev, [data-testid="prev"]',
    loading: '.loading, .spinner, [data-testid="loading"]',
  };

  constructor(page: Page) {
    super(page);
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
        '.date-picker input',
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
            iteration: i + 1,
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
        this.selectors.nextWeekButton,
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
        this.selectors.prevWeekButton,
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
   * Get all available courts for the current date
   */
  async getAvailableCourts(): Promise<string[]> {
    const component = 'BookingCalendarPage.getAvailableCourts';

    logger.info('Getting available courts', component);

    try {
      await this.waitForElement(this.selectors.courtSelector);

      const courtElements = await this.page.$$(this.selectors.courtSelector);
      const courts: string[] = [];

      for (let i = 0; i < courtElements.length; i++) {
        const element = courtElements[i]!;

        // Extract court ID
        let courtId =
          (await element.getAttribute('data-court-id')) ||
          (await element.getAttribute('data-testid')) ||
          (await element.getAttribute('id')) ||
          `court-${i + 1}`;

        // Clean court ID
        courtId = courtId.replace(/^(court-|data-testid-court-)/, '');

        // Check if court has available slots
        const hasAvailableSlots = await this.checkCourtHasAvailableSlots(element);

        if (hasAvailableSlots) {
          courts.push(courtId);
        }
      }

      logger.info('Found available courts', component, { courts });
      return courts;
    } catch (error) {
      logger.error('Error getting available courts', component, {
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  /**
   * Check if a court has available slots
   */
  private async checkCourtHasAvailableSlots(courtElement: any): Promise<boolean> {
    try {
      const availableSlots = await courtElement.$$(this.selectors.availableSlot);
      return availableSlots.length > 0;
    } catch {
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
   * Find a specific time slot (optimized for Eversports)
   */
  async findTimeSlot(
    courtId: string,
    time: string,
    targetDate?: string
  ): Promise<BookingSlot | null> {
    const component = 'BookingCalendarPage.findTimeSlot';

    const currentDate = targetDate || (await this.getCurrentSelectedDate());

    try {
      // Convert time format if needed (e.g., "14:00" to "1400")
      const timeVariants = [time, time.replace(':', ''), time.replace(':', '')];

      // Eversports-specific selectors based on the original JSON automation
      const timeSelectors = [
        // Primary Eversports selector (from JSON automation)
        `td[data-date='${currentDate}'][data-start='${time.replace(':', '')}'][data-court='${courtId}'][data-state='free']`,
        `td[data-date='${currentDate}'][data-start='${time.replace(':', '')}'][data-state='free']`,

        // Alternative formats
        ...timeVariants.map(
          timeVar =>
            `td[data-date='${currentDate}'][data-start='${timeVar}'][data-court='${courtId}']`
        ),
        ...timeVariants.map(timeVar => `td[data-date='${currentDate}'][data-start='${timeVar}']`),

        // Generic selectors
        `[data-time="${time}"][data-court="${courtId}"]`,
        `[data-time="${time}"]`,
        `.slot-${time.replace(':', '-')}`,
        `[data-start-time="${time}"]`,

        // Backup selectors
        `td[data-time="${time}"]`,
        `td.time-slot[data-start="${time}"]`,
      ];

      logger.debug('Searching for time slot', component, {
        courtId,
        time,
        currentDate,
        timeVariants,
        totalSelectors: timeSelectors.length,
      });

      for (const selector of timeSelectors) {
        const elements = await this.page.$$(selector);

        if (elements.length > 0) {
          logger.debug('Found potential slot elements', component, {
            selector,
            count: elements.length,
          });

          for (const element of elements) {
            const isAvailable = await this.isSlotAvailable(element);
            const elementSelector = await this.getSlotSelector(element);
            const elementCourtId = (await element.getAttribute('data-court')) || courtId;

            // If court-specific search and court doesn't match, skip
            if (courtId && elementCourtId && elementCourtId !== courtId) {
              continue;
            }

            const slot: BookingSlot = {
              date: currentDate,
              startTime: time,
              courtId: elementCourtId || courtId,
              isAvailable,
              elementSelector,
            };

            logger.debug('Found time slot', component, {
              courtId: slot.courtId,
              time,
              isAvailable,
              selector: elementSelector,
            });

            return slot;
          }
        }
      }

      logger.warn('Time slot not found', component, { courtId, time, currentDate });
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
      const isAvailable =
        !classList.includes('booked') &&
        !classList.includes('unavailable') &&
        !classList.includes('disabled') &&
        !classList.includes('blocked') &&
        dataAvailable !== 'false' &&
        dataState !== 'booked';

      // Additional checks for positive availability indicators
      const hasAvailableClass =
        classList.includes('available') ||
        classList.includes('free') ||
        classList.includes('slot-available') ||
        dataAvailable === 'true' ||
        dataState === 'free';

      return isAvailable || hasAvailableClass;
    } catch (error) {
      // If we can't determine availability, assume it's not available for safety
      return false;
    }
  }

  /**
   * Get selector for a slot element (optimized for Eversports)
   */
  private async getSlotSelector(slotElement: any): Promise<string> {
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
        const classes = classList
          .split(' ')
          .filter((c: string) => c.includes('slot') || c.includes('time'));
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
        '[data-date-input]',
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
        '[data-current-date]',
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
        '[aria-current="date"]',
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
}
