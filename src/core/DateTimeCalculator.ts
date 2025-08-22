import { logger } from '../utils/logger';
import {
  format,
  addDays,
  parseISO,
  startOfDay,
  addMinutes,
  isWithinInterval,
  differenceInMinutes,
  isWeekend,
  parse,
  isValid
} from 'date-fns';
import { fromZonedTime, toZonedTime } from 'date-fns-tz';
import type { HolidayProvider } from '../types/booking.types';

/**
 * Enhanced utility class for date and time calculations with date-fns integration
 * Provides timezone-aware date operations and business logic for booking system
 */
export class DateTimeCalculator {
  private static readonly DEFAULT_DAYS_AHEAD = 20;
  private static readonly DEFAULT_START_TIME = '14:00';
  private static readonly SLOT_DURATION_MINUTES = 30;
  private static readonly DEFAULT_TIMEZONE = 'Europe/Berlin';
  
  // Cached holiday provider
  private static holidayProvider?: HolidayProvider;

  /**
   * Calculate target booking date with timezone awareness
   * @param daysAhead Number of days to add to current date
   * @param timezone Target timezone (default: Europe/Berlin)
   * @returns Date string in YYYY-MM-DD format
   */
  static calculateBookingDate(
    daysAhead: number = this.DEFAULT_DAYS_AHEAD,
    timezone: string = this.DEFAULT_TIMEZONE
  ): string {
    // Get current date in the specified timezone
    const nowUtc = new Date();
    const nowInTimezone = toZonedTime(nowUtc, timezone);
    const today = startOfDay(nowInTimezone);
    
    // Add days and format
    const targetDate = addDays(today, daysAhead);
    const formattedDate = format(targetDate, 'yyyy-MM-dd');

    logger.debug('Calculated booking date with timezone', 'DateTimeCalculator', {
      today: format(today, 'yyyy-MM-dd'),
      daysAhead,
      timezone,
      targetDate: formattedDate,
      nowUtc: nowUtc.toISOString(),
      nowInTimezone: nowInTimezone.toISOString()
    });

    return formattedDate;
  }

  /**
   * Generate time slots with flexible duration support
   * @param startTime Start time in HH:MM format
   * @param duration Total duration in minutes (default: 60 for two 30-min slots)
   * @param slotSize Size of individual slots in minutes (default: 30)
   * @returns Array of time slots in HH:MM format
   */
  static generateTimeSlots(
    startTime: string = this.DEFAULT_START_TIME,
    duration: number = 60,
    slotSize: number = this.SLOT_DURATION_MINUTES
  ): string[] {
    this.validateTimeFormat(startTime);
    
    const baseDate = startOfDay(new Date());
    const startDateTime = parse(startTime, 'HH:mm', baseDate);
    
    if (!isValid(startDateTime)) {
      throw new Error(`Invalid start time: ${startTime}`);
    }
    
    const numberOfSlots = Math.ceil(duration / slotSize);
    const slots: string[] = [];
    
    for (let i = 0; i < numberOfSlots; i++) {
      const slotDateTime = addMinutes(startDateTime, i * slotSize);
      slots.push(format(slotDateTime, 'HH:mm'));
    }

    logger.debug('Generated flexible time slots', 'DateTimeCalculator', {
      startTime,
      duration,
      slotSize,
      numberOfSlots,
      slots
    });

    return slots;
  }

  /**
   * Calculate neighbor slots for isolation checking with flexible duration
   * @param startTime Target start time in HH:MM format
   * @param duration Duration of the booking in minutes (default: 60)
   * @returns Object with before and after slot times
   */
  static calculateNeighborSlots(
    startTime: string,
    duration: number = 60
  ): { before: string; after: string } {
    this.validateTimeFormat(startTime);
    
    const baseDate = startOfDay(new Date());
    const startDateTime = parse(startTime, 'HH:mm', baseDate);
    
    if (!isValid(startDateTime)) {
      throw new Error(`Invalid time format: ${startTime}`);
    }

    // Slot before (one slot duration earlier)
    const beforeDateTime = addMinutes(startDateTime, -this.SLOT_DURATION_MINUTES);
    const before = format(beforeDateTime, 'HH:mm');

    // Slot after (after the complete booking duration)
    const afterDateTime = addMinutes(startDateTime, duration);
    const after = format(afterDateTime, 'HH:mm');

    logger.debug('Calculated neighbor slots with flexible duration', 'DateTimeCalculator', {
      targetStart: startTime,
      duration,
      before,
      after
    });

    return { before, after };
  }

  /**
   * Check if a given time string is valid using date-fns
   * @param time Time string in HH:MM format
   * @returns true if valid, false otherwise
   */
  static isValidTime(time: string): boolean {
    try {
      const baseDate = startOfDay(new Date());
      const parsedTime = parse(time, 'HH:mm', baseDate);
      return isValid(parsedTime);
    } catch {
      return false;
    }
  }

  /**
   * Parse time string into hours and minutes using date-fns
   * @param time Time string in HH:MM format
   * @returns Object with hours and minutes
   */
  static parseTime(time: string): { hours: number; minutes: number } {
    this.validateTimeFormat(time);
    
    const baseDate = startOfDay(new Date());
    const parsedTime = parse(time, 'HH:mm', baseDate);
    
    if (!isValid(parsedTime)) {
      throw new Error(`Invalid time format: ${time}`);
    }

    return {
      hours: parsedTime.getHours(),
      minutes: parsedTime.getMinutes()
    };
  }

  /**
   * Format date for display purposes with timezone support
   * @param date Date string in YYYY-MM-DD format
   * @param timezone Target timezone (default: Europe/Berlin)
   * @param locale Locale for formatting (default: de-DE)
   * @returns Formatted date string
   */
  static formatDateForDisplay(
    date: string,
    timezone: string = this.DEFAULT_TIMEZONE,
    locale: string = 'de-DE'
  ): string {
    const dateObj = parseISO(date);
    const zonedDate = toZonedTime(dateObj, timezone);
    
    // Use date-fns format with German locale pattern
    return format(zonedDate, 'EEEE, dd. MMMM yyyy');
  }

  /**
   * Get current timestamp in specified timezone for logging
   * @param timezone Target timezone (default: Europe/Berlin)
   * @returns Date object in the specified timezone
   */
  static getCurrentTimestamp(timezone: string = this.DEFAULT_TIMEZONE): Date {
    const nowUtc = new Date();
    return toZonedTime(nowUtc, timezone);
  }

  // New enhanced functionality for Issue #9

  /**
   * Set holiday provider for business day calculations
   * @param provider Holiday provider instance
   */
  static setHolidayProvider(provider: HolidayProvider): void {
    this.holidayProvider = provider;
  }

  /**
   * Check if a date is a weekend (Saturday or Sunday)
   * @param date Date string in YYYY-MM-DD format or Date object
   * @returns true if weekend, false otherwise
   */
  static isWeekend(date: string | Date): boolean {
    const dateObj = typeof date === 'string' ? parseISO(date) : date;
    return isWeekend(dateObj);
  }

  /**
   * Check if a date is a holiday using the configured provider
   * @param date Date string in YYYY-MM-DD format or Date object
   * @returns true if holiday, false otherwise
   */
  static isHoliday(date: string | Date): boolean {
    if (!this.holidayProvider) {
      return false;
    }
    
    const dateObj = typeof date === 'string' ? parseISO(date) : date;
    return this.holidayProvider.isHoliday(dateObj);
  }

  /**
   * Check if a date is a business day (not weekend and not holiday)
   * @param date Date string in YYYY-MM-DD format or Date object
   * @returns true if business day, false otherwise
   */
  static isBusinessDay(date: string | Date): boolean {
    return !this.isWeekend(date) && !this.isHoliday(date);
  }

  /**
   * Get the next business day after the given date
   * @param date Date string in YYYY-MM-DD format or Date object
   * @param timezone Target timezone (default: Europe/Berlin)
   * @returns Next business day as Date object
   */
  static getNextBusinessDay(
    date: string | Date,
    timezone: string = this.DEFAULT_TIMEZONE
  ): Date {
    if (this.holidayProvider) {
      const dateObj = typeof date === 'string' ? parseISO(date) : date;
      return this.holidayProvider.getNextBusinessDay(dateObj);
    }

    // Fallback implementation without holiday provider
    let nextDay = typeof date === 'string' ? parseISO(date) : new Date(date);
    nextDay = addDays(nextDay, 1);
    
    while (this.isWeekend(nextDay)) {
      nextDay = addDays(nextDay, 1);
    }
    
    return toZonedTime(nextDay, timezone);
  }

  /**
   * Calculate time difference in minutes between two time strings
   * @param startTime Start time in HH:MM format
   * @param endTime End time in HH:MM format
   * @returns Difference in minutes
   */
  static getTimeDifferenceInMinutes(startTime: string, endTime: string): number {
    this.validateTimeFormat(startTime);
    this.validateTimeFormat(endTime);
    
    const baseDate = startOfDay(new Date());
    const start = parse(startTime, 'HH:mm', baseDate);
    const end = parse(endTime, 'HH:mm', baseDate);
    
    return differenceInMinutes(end, start);
  }

  /**
   * Check if a time is within business hours
   * @param time Time string in HH:MM format
   * @param businessStart Business start time (default: 06:00)
   * @param businessEnd Business end time (default: 23:00)
   * @returns true if within business hours
   */
  static isWithinBusinessHours(
    time: string,
    businessStart: string = '06:00',
    businessEnd: string = '23:00'
  ): boolean {
    this.validateTimeFormat(time);
    this.validateTimeFormat(businessStart);
    this.validateTimeFormat(businessEnd);
    
    const baseDate = startOfDay(new Date());
    const timeObj = parse(time, 'HH:mm', baseDate);
    const startObj = parse(businessStart, 'HH:mm', baseDate);
    const endObj = parse(businessEnd, 'HH:mm', baseDate);
    
    return isWithinInterval(timeObj, { start: startObj, end: endObj });
  }

  /**
   * Generate alternative time slots within a time range
   * @param preferredTime Preferred time in HH:MM format
   * @param rangeMinutes Range in minutes around preferred time
   * @param slotInterval Interval between slots in minutes (default: 30)
   * @returns Array of alternative times
   */
  static generateAlternativeTimeSlots(
    preferredTime: string,
    rangeMinutes: number,
    slotInterval: number = this.SLOT_DURATION_MINUTES
  ): string[] {
    this.validateTimeFormat(preferredTime);
    
    const baseDate = startOfDay(new Date());
    const preferredDateTime = parse(preferredTime, 'HH:mm', baseDate);
    const alternatives: string[] = [];
    
    const startRange = addMinutes(preferredDateTime, -rangeMinutes);
    const endRange = addMinutes(preferredDateTime, rangeMinutes);
    
    let currentTime = startRange;
    while (currentTime <= endRange) {
      const timeString = format(currentTime, 'HH:mm');
      if (this.isWithinBusinessHours(timeString)) {
        alternatives.push(timeString);
      }
      currentTime = addMinutes(currentTime, slotInterval);
    }
    
    logger.debug('Generated alternative time slots', 'DateTimeCalculator', {
      preferredTime,
      rangeMinutes,
      slotInterval,
      totalAlternatives: alternatives.length,
      alternatives
    });
    
    return alternatives;
  }

  /**
   * Convert UTC time to local timezone
   * @param utcDate UTC date
   * @param timezone Target timezone
   * @returns Date in local timezone
   */
  static convertToTimezone(utcDate: Date, timezone: string): Date {
    return toZonedTime(utcDate, timezone);
  }

  /**
   * Convert local timezone to UTC
   * @param localDate Local date
   * @param timezone Source timezone
   * @returns UTC date
   */
  static convertToUTC(localDate: Date, timezone: string): Date {
    return fromZonedTime(localDate, timezone);
  }

  /**
   * Private helper method to validate time format
   * @param time Time string to validate
   * @throws Error if format is invalid
   */
  private static validateTimeFormat(time: string): void {
    if (!this.isValidTime(time)) {
      throw new Error(`Invalid time format: ${time}. Expected HH:MM format.`);
    }
  }
}
