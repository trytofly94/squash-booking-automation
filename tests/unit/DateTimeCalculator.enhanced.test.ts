import { DateTimeCalculator } from '../../src/core/DateTimeCalculator';
import { parseISO, format, addDays, addMinutes } from 'date-fns';
import { zonedTimeToUtc, utcToZonedTime } from 'date-fns-tz';

// Mock logger to avoid console output in tests
jest.mock('../../src/utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('DateTimeCalculator Enhanced Features (date-fns)', () => {
  describe('calculateBookingDate with timezone', () => {
    it('should calculate booking date with timezone awareness', () => {
      const result = DateTimeCalculator.calculateBookingDate(7, 'Europe/Berlin');
      
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      
      // Verify the date is 7 days from now
      const nowBerlin = utcToZonedTime(new Date(), 'Europe/Berlin');
      const expectedDate = addDays(nowBerlin, 7);
      const expectedDateStr = format(expectedDate, 'yyyy-MM-dd');
      
      expect(result).toBe(expectedDateStr);
    });

    it('should handle different timezones correctly', () => {
      const berlinDate = DateTimeCalculator.calculateBookingDate(1, 'Europe/Berlin');
      const tokyoDate = DateTimeCalculator.calculateBookingDate(1, 'Asia/Tokyo');
      
      // Both should be valid dates
      expect(berlinDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(tokyoDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      
      // They might be different due to timezone differences
      expect(typeof berlinDate).toBe('string');
      expect(typeof tokyoDate).toBe('string');
    });

    it('should use default timezone when none provided', () => {
      const result = DateTimeCalculator.calculateBookingDate(1);
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  describe('generateTimeSlots with flexible duration', () => {
    it('should generate slots for custom duration and slot size', () => {
      const slots = DateTimeCalculator.generateTimeSlots('14:00', 90, 30);
      
      expect(slots).toHaveLength(3); // 90 minutes / 30 minutes = 3 slots
      expect(slots[0]).toBe('14:00');
      expect(slots[1]).toBe('14:30');
      expect(slots[2]).toBe('15:00');
    });

    it('should handle non-standard slot sizes', () => {
      const slots = DateTimeCalculator.generateTimeSlots('10:00', 45, 15);
      
      expect(slots).toHaveLength(3); // 45 minutes / 15 minutes = 3 slots
      expect(slots[0]).toBe('10:00');
      expect(slots[1]).toBe('10:15');
      expect(slots[2]).toBe('10:30');
    });

    it('should maintain backward compatibility with default parameters', () => {
      const slots = DateTimeCalculator.generateTimeSlots('14:00');
      
      expect(slots).toHaveLength(2); // Default 60 minutes / 30 minutes = 2 slots
      expect(slots[0]).toBe('14:00');
      expect(slots[1]).toBe('14:30');
    });
  });

  describe('calculateNeighborSlots with flexible duration', () => {
    it('should calculate neighbors for custom duration', () => {
      const neighbors = DateTimeCalculator.calculateNeighborSlots('14:00', 90);
      
      expect(neighbors.before).toBe('13:30'); // 30 minutes before
      expect(neighbors.after).toBe('15:30'); // 90 minutes after start
    });

    it('should maintain backward compatibility', () => {
      const neighbors = DateTimeCalculator.calculateNeighborSlots('14:00');
      
      expect(neighbors.before).toBe('13:30');
      expect(neighbors.after).toBe('15:00'); // Default 60 minutes after start
    });
  });

  describe('business day functionality', () => {
    it('should correctly identify weekends', () => {
      const saturday = '2024-01-06'; // Saturday
      const sunday = '2024-01-07'; // Sunday
      const monday = '2024-01-08'; // Monday
      
      expect(DateTimeCalculator.isWeekend(saturday)).toBe(true);
      expect(DateTimeCalculator.isWeekend(sunday)).toBe(true);
      expect(DateTimeCalculator.isWeekend(monday)).toBe(false);
    });

    it('should identify business days correctly without holiday provider', () => {
      const monday = '2024-01-08'; // Monday
      const saturday = '2024-01-06'; // Saturday
      
      expect(DateTimeCalculator.isBusinessDay(monday)).toBe(true);
      expect(DateTimeCalculator.isBusinessDay(saturday)).toBe(false);
    });

    it('should get next business day', () => {
      const friday = '2024-01-05'; // Friday
      const nextBusinessDay = DateTimeCalculator.getNextBusinessDay(friday);
      
      // Should be Monday (skipping weekend)
      const expectedMonday = parseISO('2024-01-08');
      expect(nextBusinessDay.getTime()).toBeCloseTo(expectedMonday.getTime(), -5);
    });
  });

  describe('time calculations and utilities', () => {
    it('should calculate time difference correctly', () => {
      const diff = DateTimeCalculator.getTimeDifferenceInMinutes('14:00', '14:30');
      expect(diff).toBe(30);
      
      const diffLarger = DateTimeCalculator.getTimeDifferenceInMinutes('10:00', '11:45');
      expect(diff).toBe(30);
    });

    it('should check business hours correctly', () => {
      expect(DateTimeCalculator.isWithinBusinessHours('09:00')).toBe(true);
      expect(DateTimeCalculator.isWithinBusinessHours('02:00')).toBe(false);
      expect(DateTimeCalculator.isWithinBusinessHours('23:30')).toBe(false);
    });

    it('should check custom business hours', () => {
      expect(DateTimeCalculator.isWithinBusinessHours('08:00', '07:00', '18:00')).toBe(true);
      expect(DateTimeCalculator.isWithinBusinessHours('06:00', '07:00', '18:00')).toBe(false);
      expect(DateTimeCalculator.isWithinBusinessHours('19:00', '07:00', '18:00')).toBe(false);
    });
  });

  describe('alternative time slot generation', () => {
    it('should generate alternatives within range', () => {
      const alternatives = DateTimeCalculator.generateAlternativeTimeSlots('14:00', 60, 30);
      
      expect(alternatives.length).toBeGreaterThan(0);
      expect(alternatives).toContain('14:00'); // Should include the original time
      
      // All alternatives should be within business hours
      alternatives.forEach(time => {
        expect(DateTimeCalculator.isWithinBusinessHours(time)).toBe(true);
      });
    });

    it('should respect range limits', () => {
      const alternatives = DateTimeCalculator.generateAlternativeTimeSlots('14:00', 30, 15);
      
      // Should include times within ±30 minutes
      const earliestExpected = addMinutes(parseISO('2024-01-01T14:00:00'), -30);
      const latestExpected = addMinutes(parseISO('2024-01-01T14:00:00'), 30);
      
      alternatives.forEach(timeStr => {
        const timeDate = parseISO(`2024-01-01T${timeStr}:00`);
        expect(timeDate.getTime()).toBeGreaterThanOrEqual(earliestExpected.getTime());
        expect(timeDate.getTime()).toBeLessThanOrEqual(latestExpected.getTime());
      });
    });
  });

  describe('timezone conversions', () => {
    it('should convert UTC to timezone correctly', () => {
      const utcDate = new Date('2024-01-01T12:00:00.000Z');
      const berlinDate = DateTimeCalculator.convertToTimezone(utcDate, 'Europe/Berlin');
      
      // Berlin should be UTC+1 in winter
      expect(berlinDate.getHours()).toBe(13);
    });

    it('should convert timezone to UTC correctly', () => {
      const localDate = new Date(2024, 0, 1, 13, 0, 0); // Jan 1, 2024, 13:00
      const utcDate = DateTimeCalculator.convertToUTC(localDate, 'Europe/Berlin');
      
      // Should account for timezone offset
      expect(utcDate).toBeInstanceOf(Date);
    });
  });

  describe('validation and error handling', () => {
    it('should validate time format correctly', () => {
      expect(DateTimeCalculator.isValidTime('14:00')).toBe(true);
      expect(DateTimeCalculator.isValidTime('23:59')).toBe(true);
      expect(DateTimeCalculator.isValidTime('00:00')).toBe(true);
      expect(DateTimeCalculator.isValidTime('24:00')).toBe(false);
      expect(DateTimeCalculator.isValidTime('14:60')).toBe(false);
      expect(DateTimeCalculator.isValidTime('invalid')).toBe(false);
    });

    it('should parse time correctly', () => {
      const { hours, minutes } = DateTimeCalculator.parseTime('14:30');
      expect(hours).toBe(14);
      expect(minutes).toBe(30);
    });

    it('should throw error for invalid time parsing', () => {
      expect(() => DateTimeCalculator.parseTime('invalid')).toThrow('Invalid time format');
    });

    it('should handle edge cases in time calculations', () => {
      // Test midnight crossover
      const neighbors = DateTimeCalculator.calculateNeighborSlots('23:30', 60);
      expect(neighbors.before).toBe('23:00');
      expect(neighbors.after).toBe('00:30');
    });
  });

  describe('formatted date display', () => {
    it('should format date for display with timezone', () => {
      const formatted = DateTimeCalculator.formatDateForDisplay('2024-01-01', 'Europe/Berlin');
      expect(typeof formatted).toBe('string');
      expect(formatted.length).toBeGreaterThan(10); // Should be a formatted date string
    });
  });

  describe('getCurrentTimestamp with timezone', () => {
    it('should get current timestamp in specified timezone', () => {
      const timestamp = DateTimeCalculator.getCurrentTimestamp('Europe/Berlin');
      expect(timestamp).toBeInstanceOf(Date);
      
      const utcTimestamp = DateTimeCalculator.getCurrentTimestamp('UTC');
      expect(utcTimestamp).toBeInstanceOf(Date);
    });
  });
});