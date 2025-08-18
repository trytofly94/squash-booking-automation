import { logger } from '../utils/logger';

/**
 * Utility class for date and time calculations in the booking system
 */
export class DateTimeCalculator {
  private static readonly DEFAULT_DAYS_AHEAD = 20;
  private static readonly DEFAULT_START_TIME = '14:00';
  private static readonly SLOT_DURATION_MINUTES = 30;

  /**
   * Calculate target booking date (current date + specified days ahead)
   */
  static calculateBookingDate(daysAhead: number = this.DEFAULT_DAYS_AHEAD): string {
    const today = new Date();
    const targetDate = new Date(today);
    targetDate.setDate(today.getDate() + daysAhead);
    
    const formattedDate = targetDate.toISOString().split('T')[0]; // YYYY-MM-DD format
    
    logger.debug('Calculated booking date', 'DateTimeCalculator', {
      today: today.toISOString().split('T')[0],
      daysAhead,
      targetDate: formattedDate
    });
    
    return formattedDate;
  }

  /**
   * Generate time slots for the target booking period
   * Returns two consecutive 30-minute slots starting at the specified time
   */
  static generateTimeSlots(startTime: string = this.DEFAULT_START_TIME): string[] {
    const [hours, minutes] = startTime.split(':').map(Number);
    
    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
      throw new Error(`Invalid start time format: ${startTime}`);
    }

    const slot1 = startTime;
    
    // Calculate second slot (30 minutes later)
    const slot2Date = new Date();
    slot2Date.setHours(hours, minutes + this.SLOT_DURATION_MINUTES, 0, 0);
    
    const slot2Hours = slot2Date.getHours().toString().padStart(2, '0');
    const slot2Minutes = slot2Date.getMinutes().toString().padStart(2, '0');
    const slot2 = `${slot2Hours}:${slot2Minutes}`;

    const slots = [slot1, slot2];
    
    logger.debug('Generated time slots', 'DateTimeCalculator', {
      startTime,
      slots,
      durationMinutes: this.SLOT_DURATION_MINUTES * 2
    });
    
    return slots;
  }

  /**
   * Calculate neighbor slots for isolation checking
   * Returns slots before and after the target slots
   */
  static calculateNeighborSlots(startTime: string): { before: string; after: string } {
    const [hours, minutes] = startTime.split(':').map(Number);
    
    // Slot before (30 minutes earlier)
    const beforeDate = new Date();
    beforeDate.setHours(hours, minutes - this.SLOT_DURATION_MINUTES, 0, 0);
    const beforeHours = beforeDate.getHours().toString().padStart(2, '0');
    const beforeMinutes = beforeDate.getMinutes().toString().padStart(2, '0');
    const before = `${beforeHours}:${beforeMinutes}`;
    
    // Slot after (60 minutes later - after both target slots)
    const afterDate = new Date();
    afterDate.setHours(hours, minutes + (this.SLOT_DURATION_MINUTES * 2), 0, 0);
    const afterHours = afterDate.getHours().toString().padStart(2, '0');
    const afterMinutes = afterDate.getMinutes().toString().padStart(2, '0');
    const after = `${afterHours}:${afterMinutes}`;

    logger.debug('Calculated neighbor slots', 'DateTimeCalculator', {
      targetStart: startTime,
      before,
      after
    });

    return { before, after };
  }

  /**
   * Check if a given time string is valid
   */
  static isValidTime(time: string): boolean {
    const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
    return timeRegex.test(time);
  }

  /**
   * Parse time string into hours and minutes
   */
  static parseTime(time: string): { hours: number; minutes: number } {
    if (!this.isValidTime(time)) {
      throw new Error(`Invalid time format: ${time}`);
    }
    
    const [hours, minutes] = time.split(':').map(Number);
    return { hours, minutes };
  }

  /**
   * Format date for display purposes
   */
  static formatDateForDisplay(date: string): string {
    const dateObj = new Date(date);
    return dateObj.toLocaleDateString('de-DE', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }

  /**
   * Get current timestamp for logging
   */
  static getCurrentTimestamp(): Date {
    return new Date();
  }
}