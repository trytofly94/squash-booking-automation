import { DateTimeCalculator } from '../../src/core/DateTimeCalculator';

describe('DateTimeCalculator', () => {
  beforeEach(() => {
    // Mock current date to 2025-08-18 for consistent testing
    global.testUtils.mockDate('2025-08-18T10:00:00.000Z');
  });

  afterEach(() => {
    global.testUtils.restoreDate();
  });

  describe('calculateBookingDate', () => {
    it('should calculate correct booking date with default days ahead', () => {
      const result = DateTimeCalculator.calculateBookingDate();
      expect(result).toBe('2025-09-07'); // 20 days from 2025-08-18
    });

    it('should calculate correct booking date with custom days ahead', () => {
      const result = DateTimeCalculator.calculateBookingDate(10);
      expect(result).toBe('2025-08-28'); // 10 days from 2025-08-18
    });

    it('should handle leap year correctly', () => {
      global.testUtils.mockDate('2024-02-20T10:00:00.000Z');
      const result = DateTimeCalculator.calculateBookingDate(10);
      expect(result).toBe('2024-03-01'); // Should cross leap day correctly
    });
  });

  describe('generateTimeSlots', () => {
    it('should generate two consecutive 30-minute slots with default time', () => {
      const result = DateTimeCalculator.generateTimeSlots();
      expect(result).toEqual(['14:00', '14:30']);
    });

    it('should generate correct slots for custom start time', () => {
      const result = DateTimeCalculator.generateTimeSlots('16:30');
      expect(result).toEqual(['16:30', '17:00']);
    });

    it('should handle hour transition correctly', () => {
      const result = DateTimeCalculator.generateTimeSlots('15:30');
      expect(result).toEqual(['15:30', '16:00']);
    });

    it('should throw error for invalid time format', () => {
      expect(() => DateTimeCalculator.generateTimeSlots('25:00')).toThrow('Invalid start time format');
      expect(() => DateTimeCalculator.generateTimeSlots('14:75')).toThrow('Invalid start time format');
    });
  });

  describe('calculateNeighborSlots', () => {
    it('should calculate correct neighbor slots', () => {
      const result = DateTimeCalculator.calculateNeighborSlots('14:00');
      expect(result).toEqual({
        before: '13:30',
        after: '15:00'
      });
    });

    it('should handle hour boundaries correctly', () => {
      const result = DateTimeCalculator.calculateNeighborSlots('16:00');
      expect(result).toEqual({
        before: '15:30',
        after: '17:00'
      });
    });

    it('should handle edge cases near day boundaries', () => {
      const result = DateTimeCalculator.calculateNeighborSlots('00:30');
      expect(result).toEqual({
        before: '00:00',
        after: '01:30'
      });
    });
  });

  describe('isValidTime', () => {
    it('should validate correct time formats', () => {
      expect(DateTimeCalculator.isValidTime('14:00')).toBe(true);
      expect(DateTimeCalculator.isValidTime('23:59')).toBe(true);
      expect(DateTimeCalculator.isValidTime('00:00')).toBe(true);
      expect(DateTimeCalculator.isValidTime('9:30')).toBe(true);
    });

    it('should reject invalid time formats', () => {
      expect(DateTimeCalculator.isValidTime('25:00')).toBe(false);
      expect(DateTimeCalculator.isValidTime('14:60')).toBe(false);
      expect(DateTimeCalculator.isValidTime('abc')).toBe(false);
      expect(DateTimeCalculator.isValidTime('14')).toBe(false);
      expect(DateTimeCalculator.isValidTime('')).toBe(false);
    });
  });

  describe('parseTime', () => {
    it('should parse valid time strings correctly', () => {
      expect(DateTimeCalculator.parseTime('14:30')).toEqual({ hours: 14, minutes: 30 });
      expect(DateTimeCalculator.parseTime('09:05')).toEqual({ hours: 9, minutes: 5 });
      expect(DateTimeCalculator.parseTime('23:59')).toEqual({ hours: 23, minutes: 59 });
    });

    it('should throw error for invalid time strings', () => {
      expect(() => DateTimeCalculator.parseTime('25:00')).toThrow('Invalid time format');
      expect(() => DateTimeCalculator.parseTime('abc')).toThrow('Invalid time format');
    });
  });

  describe('formatDateForDisplay', () => {
    it('should format date correctly for German locale', () => {
      const result = DateTimeCalculator.formatDateForDisplay('2025-09-07');
      expect(result).toContain('2025');
      expect(result).toContain('September');
      expect(result).toContain('7');
    });
  });

  describe('getCurrentTimestamp', () => {
    it('should return current date', () => {
      const result = DateTimeCalculator.getCurrentTimestamp();
      expect(result).toBeInstanceOf(Date);
    });
  });
});