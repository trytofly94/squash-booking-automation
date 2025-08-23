/**
 * Matrix-based Isolation Checker - Deterministic In-Memory Logic
 * Issue #20: Single-Pass Calendar Matrix Building - Phase 4
 */

import { CalendarMatrix, CalendarCell, IsolationCheckResult, BookingSlot } from '@/types/booking.types';
import { logger } from '@/utils/logger';

const component = 'MatrixIsolationChecker';

export class MatrixIsolationChecker {
  /**
   * Check if a booking would create isolated 30-minute slots
   * Uses in-memory matrix data instead of DOM queries for performance
   */
  checkIsolation(
    matrix: CalendarMatrix, 
    court: string, 
    date: string, 
    startTime: string, 
    duration: number
  ): IsolationCheckResult {
    logger.debug('Checking isolation with matrix data', component, {
      court,
      date,
      startTime,
      duration
    });

    const isolatedSlots: BookingSlot[] = [];
    
    try {
      // Check slots before the booking
      const beforeSlots = this.checkSlotsBeforeBooking(matrix, court, date, startTime);
      isolatedSlots.push(...beforeSlots);

      // Check slots after the booking
      const afterSlots = this.checkSlotsAfterBooking(matrix, court, date, startTime, duration);
      isolatedSlots.push(...afterSlots);

      const hasIsolation = isolatedSlots.length > 0;
      const recommendation = this.generateRecommendation(hasIsolation, isolatedSlots);

      return {
        hasIsolation,
        isolatedSlots,
        recommendation
      };
    } catch (error) {
      logger.error('Failed to check isolation', component, { error, court, date, startTime });
      
      // Return safe default - assume isolation to prevent problematic bookings
      return {
        hasIsolation: true,
        isolatedSlots: [],
        recommendation: 'Unable to check isolation - assuming isolation exists for safety'
      };
    }
  }

  /**
   * Check for isolated slots before the booking
   */
  private checkSlotsBeforeBooking(
    matrix: CalendarMatrix, 
    court: string, 
    date: string, 
    startTime: string
  ): BookingSlot[] {
    const isolatedSlots: BookingSlot[] = [];
    
    // Get 30 minutes before start time
    const beforeTime = this.subtractMinutes(startTime, 30);
    if (!beforeTime) return isolatedSlots; // At start of day

    const beforeCell = this.getCellByTime(matrix, court, date, beforeTime);
    if (!beforeCell || beforeCell.state !== 'free') {
      return isolatedSlots; // No free slot before, no isolation
    }

    // Check if the slot before would be isolated by this booking
    const beforeBeforeTime = this.subtractMinutes(beforeTime, 30);
    if (!beforeBeforeTime) {
      // First slot of day - would be isolated
      isolatedSlots.push(this.cellToBookingSlot(beforeCell, date, beforeTime));
    } else {
      const beforeBeforeCell = this.getCellByTime(matrix, court, date, beforeBeforeTime);
      if (!beforeBeforeCell || beforeBeforeCell.state !== 'free') {
        // The slot before our booking would be isolated
        isolatedSlots.push(this.cellToBookingSlot(beforeCell, date, beforeTime));
      }
    }

    return isolatedSlots;
  }

  /**
   * Check for isolated slots after the booking
   */
  private checkSlotsAfterBooking(
    matrix: CalendarMatrix, 
    court: string, 
    date: string, 
    startTime: string, 
    duration: number
  ): BookingSlot[] {
    const isolatedSlots: BookingSlot[] = [];
    
    // Get time immediately after booking ends
    const afterTime = this.addMinutes(startTime, duration);
    if (!afterTime) return isolatedSlots; // At end of day

    const afterCell = this.getCellByTime(matrix, court, date, afterTime);
    if (!afterCell || afterCell.state !== 'free') {
      return isolatedSlots; // No free slot after, no isolation
    }

    // Check if the slot after would be isolated by this booking
    const afterAfterTime = this.addMinutes(afterTime, 30);
    if (!afterAfterTime) {
      // Last slot of day - would be isolated
      isolatedSlots.push(this.cellToBookingSlot(afterCell, date, afterTime));
    } else {
      const afterAfterCell = this.getCellByTime(matrix, court, date, afterAfterTime);
      if (!afterAfterCell || afterAfterCell.state !== 'free') {
        // The slot after our booking would be isolated
        isolatedSlots.push(this.cellToBookingSlot(afterCell, date, afterTime));
      }
    }

    return isolatedSlots;
  }

  /**
   * Get a specific cell by time with O(1) matrix lookup
   */
  private getCellByTime(
    matrix: CalendarMatrix, 
    court: string, 
    date: string, 
    time: string
  ): CalendarCell | null {
    const courtMap = matrix.cells.get(court);
    if (!courtMap) return null;

    const timeKey = `${date}T${time}`;
    return courtMap.get(timeKey) || null;
  }

  /**
   * Add minutes to a time string (HH:MM format)
   */
  private addMinutes(timeStr: string, minutes: number): string | null {
    try {
      const [hours, mins] = timeStr.split(':').map(Number);
      const totalMinutes = hours * 60 + mins + minutes;
      
      // Check if we've gone past end of day (assume max 23:30)
      if (totalMinutes >= 24 * 60) return null;
      
      const newHours = Math.floor(totalMinutes / 60);
      const newMins = totalMinutes % 60;
      
      return `${newHours.toString().padStart(2, '0')}:${newMins.toString().padStart(2, '0')}`;
    } catch (error) {
      logger.error('Failed to add minutes to time', component, { timeStr, minutes, error });
      return null;
    }
  }

  /**
   * Subtract minutes from a time string (HH:MM format)
   */
  private subtractMinutes(timeStr: string, minutes: number): string | null {
    try {
      const [hours, mins] = timeStr.split(':').map(Number);
      const totalMinutes = hours * 60 + mins - minutes;
      
      // Check if we've gone before start of day
      if (totalMinutes < 0) return null;
      
      const newHours = Math.floor(totalMinutes / 60);
      const newMins = totalMinutes % 60;
      
      return `${newHours.toString().padStart(2, '0')}:${newMins.toString().padStart(2, '0')}`;
    } catch (error) {
      logger.error('Failed to subtract minutes from time', component, { timeStr, minutes, error });
      return null;
    }
  }

  /**
   * Convert CalendarCell to BookingSlot for API compatibility
   */
  private cellToBookingSlot(cell: CalendarCell, date: string, startTime: string): BookingSlot {
    return {
      date,
      startTime,
      courtId: cell.court,
      isAvailable: cell.state === 'free',
      elementSelector: cell.elementSelector
    };
  }

  /**
   * Generate human-readable recommendation
   */
  private generateRecommendation(hasIsolation: boolean, isolatedSlots: BookingSlot[]): string {
    if (!hasIsolation) {
      return 'No isolation detected - booking is safe to proceed';
    }

    const slotDescriptions = isolatedSlots.map(slot => 
      `${slot.courtId} at ${slot.startTime}`
    ).join(', ');

    return `Booking would isolate ${isolatedSlots.length} slot(s): ${slotDescriptions}. Consider alternative times.`;
  }

  /**
   * Check multiple slots for batch validation
   * Useful for optimizing slot selection across multiple courts
   */
  checkBatchIsolation(
    matrix: CalendarMatrix,
    bookingOptions: Array<{
      court: string;
      date: string;
      startTime: string;
      duration: number;
    }>
  ): Array<{ option: typeof bookingOptions[0]; result: IsolationCheckResult }> {
    return bookingOptions.map(option => ({
      option,
      result: this.checkIsolation(matrix, option.court, option.date, option.startTime, option.duration)
    }));
  }

  /**
   * Get isolation-safe time slots for a specific court and date
   * Returns only slots that won't create isolation when booked
   */
  getIsolationSafeSlots(
    matrix: CalendarMatrix,
    court: string,
    date: string,
    duration: number
  ): string[] {
    const safeSlots: string[] = [];
    const courtMap = matrix.cells.get(court);
    
    if (!courtMap) {
      logger.warn(`No data found for court ${court}`, component);
      return safeSlots;
    }

    // Get all time slots for this court on this date
    const timeSlots = Array.from(courtMap.keys())
      .filter(key => key.startsWith(date))
      .map(key => key.split('T')[1])
      .sort();

    for (const timeSlot of timeSlots) {
      const cell = this.getCellByTime(matrix, court, date, timeSlot);
      if (!cell || cell.state !== 'free') continue;

      const isolationResult = this.checkIsolation(matrix, court, date, timeSlot, duration);
      if (!isolationResult.hasIsolation) {
        safeSlots.push(timeSlot);
      }
    }

    logger.debug(`Found ${safeSlots.length} isolation-safe slots for ${court} on ${date}`, component);
    return safeSlots;
  }
}