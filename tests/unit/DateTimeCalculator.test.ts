import { DateTimeCalculator } from '../../src/core/DateTimeCalculator';

describe('DateTimeCalculator', () => {
  // Remove global date mocking for now - tests will use current date

  describe('calculateBookingDate', () => {
    it('should calculate correct booking date with default days ahead', () => {
      const today = new Date();
      const result = DateTimeCalculator.calculateBookingDate();
      const expected = new Date(today);
      expected.setDate(today.getDate() + 20);
      expect(result).toBe(expected.toISOString().split('T')[0]);
    });

    it('should calculate correct booking date with custom days ahead', () => {
      const today = new Date();
      const result = DateTimeCalculator.calculateBookingDate(10);
      const expected = new Date(today);
      expected.setDate(today.getDate() + 10);
      expect(result).toBe(expected.toISOString().split('T')[0]);
    });

    it('should handle leap year correctly', () => {
      const originalDate = Date;
      global.Date = jest.fn(() => new originalDate('2024-02-20T10:00:00.000Z')) as any;
      global.Date.UTC = originalDate.UTC;
      global.Date.parse = originalDate.parse;
      global.Date.now = () => new originalDate('2024-02-20T10:00:00.000Z').getTime();

      const result = DateTimeCalculator.calculateBookingDate(10);
      expect(result).toBe('2024-03-01'); // Should cross leap day correctly

      global.Date = originalDate; // Restore
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
      expect(() => DateTimeCalculator.generateTimeSlots('25:00')).toThrow(
        'Invalid start time format'
      );
      expect(() => DateTimeCalculator.generateTimeSlots('14:75')).toThrow(
        'Invalid start time format'
      );
    });
  });

  describe('calculateNeighborSlots', () => {
    it('should calculate correct neighbor slots', () => {
      const result = DateTimeCalculator.calculateNeighborSlots('14:00');
      expect(result).toEqual({
        before: '13:30',
        after: '15:00',
      });
    });

    it('should handle hour boundaries correctly', () => {
      const result = DateTimeCalculator.calculateNeighborSlots('16:00');
      expect(result).toEqual({
        before: '15:30',
        after: '17:00',
      });
    });

    it('should handle edge cases near day boundaries', () => {
      const result = DateTimeCalculator.calculateNeighborSlots('00:30');
      expect(result).toEqual({
        before: '00:00',
        after: '01:30',
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
      expect(result).toMatch(/(?:09|September|Sept)/);
      expect(result).toMatch(/(?:07|7)/);
    });
  });

  describe('getCurrentTimestamp', () => {
    it('should return current date', () => {
      const before = new Date();
      const result = DateTimeCalculator.getCurrentTimestamp();
      const after = new Date();

      expect(result).toBeInstanceOf(Date);
      expect(result.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(result.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });
});
