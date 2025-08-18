import { Page } from '@playwright/test';
import { BasePage } from './BasePage';
import { BookingSlot } from '../types/booking.types';
import { logger } from '../utils/logger';

/**
 * Page Object for the booking calendar interface
 */
export class BookingCalendarPage extends BasePage {
  private readonly selectors = {
    calendar: '.calendar, [data-testid="calendar"], .booking-calendar',
    dateNavigator: '[data-testid="date-picker"], .date-picker, input[type="date"]',
    courtSelector: '[data-testid*="court"], .court-selector, .court-list',
    timeSlot: '[data-time], .time-slot, .booking-slot',
    availableSlot: '.available, .slot-available, [data-available="true"]',
    bookedSlot: '.booked, .unavailable, [data-available="false"]',
    slotContainer: '.slots-container, .time-slots, .calendar-slots',
    nextButton: '.next, .btn-next, [data-testid="next"]',
    prevButton: '.prev, .btn-prev, [data-testid="prev"]',
    loading: '.loading, .spinner, [data-testid="loading"]'
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
      await this.waitForAnySelector([
        this.selectors.calendar,
        this.selectors.slotContainer
      ]);
      
      // Wait for loading indicators to disappear
      const loadingExists = await this.elementExists(this.selectors.loading, 2000);
      if (loadingExists) {
        await this.page.locator(this.selectors.loading).waitFor({ state: 'hidden', timeout: 10000 });
      }
      
      logger.debug('Calendar loaded successfully', component);
    } catch (error) {
      logger.error('Error waiting for calendar to load', component, { error: error.message });
      throw error;
    }
  }

  /**
   * Navigate to a specific date
   */
  async navigateToDate(targetDate: string): Promise<void> {
    const component = 'BookingCalendarPage.navigateToDate';
    
    logger.info('Navigating to target date', component, { targetDate });
    
    try {
      // Try direct date input
      if (await this.elementExists(this.selectors.dateNavigator)) {
        await this.safeFill(this.selectors.dateNavigator, targetDate);
        await this.page.keyboard.press('Enter');
        await this.waitForCalendarToLoad();
        return;
      }
      
      // Try alternative navigation methods
      await this.navigateToDateByClicking(targetDate);
      
    } catch (error) {
      logger.error('Error navigating to date', component, { targetDate, error: error.message });
      throw error;
    }
  }

  /**
   * Navigate to date by clicking through calendar
   */
  private async navigateToDateByClicking(targetDate: string): Promise<void> {
    const component = 'BookingCalendarPage.navigateToDateByClicking';
    
    const targetDateObj = new Date(targetDate);
    const currentDate = new Date();
    
    logger.debug('Navigating by clicking', component, { targetDate, currentDate: currentDate.toISOString() });
    
    // Calculate how many days to navigate forward
    const daysDifference = Math.ceil((targetDateObj.getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24));
    
    if (daysDifference > 0) {
      // Navigate forward
      for (let i = 0; i < daysDifference; i++) {
        if (await this.elementExists(this.selectors.nextButton)) {
          await this.safeClick(this.selectors.nextButton);
          await this.page.waitForTimeout(1000);
        }
      }
    }
    
    await this.waitForCalendarToLoad();
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
        const element = courtElements[i];
        
        // Extract court ID
        let courtId = await element.getAttribute('data-court-id') ||
                     await element.getAttribute('data-testid') ||
                     await element.getAttribute('id') ||
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
      logger.error('Error getting available courts', component, { error: error.message });
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
      logger.error('Error getting court time slots', component, { courtId, error: error.message });
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
        `.court-${courtId}`
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
      logger.error('Error selecting court', component, { courtId, error: error.message });
    }
  }

  /**
   * Find a specific time slot
   */
  async findTimeSlot(courtId: string, time: string): Promise<BookingSlot | null> {
    const component = 'BookingCalendarPage.findTimeSlot';
    
    try {
      const timeSelectors = [
        `[data-time="${time}"][data-court="${courtId}"]`,
        `[data-time="${time}"]`,
        `.slot-${time.replace(':', '-')}`,
        `[data-start-time="${time}"]`
      ];
      
      for (const selector of timeSelectors) {
        const element = await this.page.$(selector);
        if (element) {
          const isAvailable = await this.isSlotAvailable(element);
          const elementSelector = await this.getSlotSelector(element);
          
          const slot: BookingSlot = {
            date: new Date().toISOString().split('T')[0], // Current date, will be updated by caller
            startTime: time,
            courtId,
            isAvailable,
            elementSelector
          };
          
          logger.debug('Found time slot', component, { courtId, time, isAvailable });
          return slot;
        }
      }
      
      logger.warn('Time slot not found', component, { courtId, time });
      return null;
      
    } catch (error) {
      logger.error('Error finding time slot', component, { courtId, time, error: error.message });
      return null;
    }
  }

  /**
   * Check if a slot is available
   */
  private async isSlotAvailable(slotElement: any): Promise<boolean> {
    try {
      const classList = await slotElement.getAttribute('class') || '';
      const dataAvailable = await slotElement.getAttribute('data-available');
      
      return !classList.includes('booked') &&
             !classList.includes('unavailable') &&
             !classList.includes('disabled') &&
             dataAvailable !== 'false';
    } catch {
      return false;
    }
  }

  /**
   * Get selector for a slot element
   */
  private async getSlotSelector(slotElement: any): Promise<string> {
    try {
      const id = await slotElement.getAttribute('id');
      if (id) return `#${id}`;
      
      const testId = await slotElement.getAttribute('data-testid');
      if (testId) return `[data-testid="${testId}"]`;
      
      const time = await slotElement.getAttribute('data-time');
      const court = await slotElement.getAttribute('data-court');
      if (time && court) return `[data-time="${time}"][data-court="${court}"]`;
      
      if (time) return `[data-time="${time}"]`;
      
      return 'slot-element';
    } catch {
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
      selector: slot.elementSelector
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
      logger.error('Error selecting time slot', component, { error: error.message });
      throw error;
    }
  }

  /**
   * Check if current page shows booking calendar
   */
  async isOnBookingCalendar(): Promise<boolean> {
    try {
      return await this.elementExists(this.selectors.calendar) ||
             await this.elementExists(this.selectors.slotContainer);
    } catch {
      return false;
    }
  }

  /**
   * Get current selected date
   */
  async getCurrentSelectedDate(): Promise<string> {
    try {
      // Try to extract date from date picker
      if (await this.elementExists(this.selectors.dateNavigator)) {
        const dateValue = await this.page.inputValue(this.selectors.dateNavigator);
        if (dateValue) return dateValue;
      }
      
      // Try to extract date from page title or header
      const title = await this.getPageTitle();
      const dateMatch = title.match(/(\d{4}-\d{2}-\d{2})/);
      if (dateMatch) return dateMatch[1];
      
      // Return current date as fallback
      return new Date().toISOString().split('T')[0];
    } catch {
      return new Date().toISOString().split('T')[0];
    }
  }
}