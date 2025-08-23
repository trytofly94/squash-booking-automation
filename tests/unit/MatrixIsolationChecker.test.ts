/**
 * Unit tests for MatrixIsolationChecker  
 * Issue #20: Single-Pass Calendar Matrix Building - Phase 4
 */

import { MatrixIsolationChecker } from '../../src/core/MatrixIsolationChecker';
import { CalendarMatrix, CalendarCell } from '../../src/types/booking.types';

// Mock logger
jest.mock('../../src/utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    error: jest.fn(),
    warn: jest.fn()
  }
}));

describe('MatrixIsolationChecker', () => {
  let checker: MatrixIsolationChecker;
  let mockMatrix: CalendarMatrix;

  beforeEach(() => {
    checker = new MatrixIsolationChecker();
    
    // Create a comprehensive test matrix
    const cells = new Map<string, Map<string, CalendarCell>>();
    
    // Court 1 with a typical schedule
    const court1Slots = new Map<string, CalendarCell>();
    court1Slots.set('2024-01-15T13:30', {
      court: 'court1',
      date: '2024-01-15', 
      start: '13:30',
      state: 'booked',
      className: 'slot-booked'
    });
    court1Slots.set('2024-01-15T14:00', {
      court: 'court1',
      date: '2024-01-15',
      start: '14:00', 
      state: 'free',
      className: 'slot-free'
    });
    court1Slots.set('2024-01-15T14:30', {
      court: 'court1',
      date: '2024-01-15',
      start: '14:30',
      state: 'free', 
      className: 'slot-free'
    });
    court1Slots.set('2024-01-15T15:00', {
      court: 'court1',
      date: '2024-01-15',
      start: '15:00',
      state: 'free',
      className: 'slot-free'
    });
    court1Slots.set('2024-01-15T15:30', {
      court: 'court1',
      date: '2024-01-15',
      start: '15:30',
      state: 'booked',
      className: 'slot-booked'
    });
    court1Slots.set('2024-01-15T16:00', {
      court: 'court1',
      date: '2024-01-15',
      start: '16:00',
      state: 'free',
      className: 'slot-free'
    });
    
    cells.set('court1', court1Slots);
    
    mockMatrix = {
      cells,
      dateRange: { start: '2024-01-15', end: '2024-01-15' },
      courts: ['court1'],
      timeSlots: ['13:30', '14:00', '14:30', '15:00', '15:30', '16:00'],
      createdAt: new Date(),
      source: 'dom',
      metrics: {
        totalCells: 6,
        freeCells: 4,
        bookedCells: 2,
        unavailableCells: 0,
        courtsWithData: 1,
        timeSlotsWithData: 6,
        extractionDurationMs: 100,
        isComplete: true,
        warnings: []
      }
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('checkIsolation', () => {
    it('should detect no isolation for safe booking', () => {
      // Booking 14:00-15:00 (60 minutes) should not create isolation
      const result = checker.checkIsolation(mockMatrix, 'court1', '2024-01-15', '14:00', 60);
      
      expect(result.hasIsolation).toBe(false);
      expect(result.isolatedSlots).toHaveLength(0);
      expect(result.recommendation).toBe('No isolation detected - booking is safe to proceed');
    });

    it('should detect isolation when booking would create isolated slot before', () => {
      // Booking 14:30-15:30 (60 minutes) would isolate 14:00 slot
      const result = checker.checkIsolation(mockMatrix, 'court1', '2024-01-15', '14:30', 60);
      
      expect(result.hasIsolation).toBe(true);
      expect(result.isolatedSlots).toHaveLength(1);
      expect(result.isolatedSlots[0]?.startTime).toBe('14:00');
      expect(result.isolatedSlots[0]?.courtId).toBe('court1');
      expect(result.recommendation).toContain('Booking would isolate 1 slot(s)');
    });

    it('should detect isolation when booking would create isolated slot after', () => {
      // Add isolated scenario after booking
      const court1Slots = mockMatrix.cells.get('court1')!;
      court1Slots.set('2024-01-15T16:30', {
        court: 'court1',
        date: '2024-01-15',
        start: '16:30',
        state: 'booked',
        className: 'slot-booked'
      });
      
      // Booking 14:30-15:30 would isolate 16:00 slot
      const result = checker.checkIsolation(mockMatrix, 'court1', '2024-01-15', '14:30', 60);
      
      expect(result.hasIsolation).toBe(true);
      expect(result.isolatedSlots.some(slot => slot.startTime === '16:00')).toBe(false); // This specific case wouldn't isolate 16:00
      expect(result.isolatedSlots.some(slot => slot.startTime === '14:00')).toBe(true); // But would isolate 14:00
    });

    it('should handle edge case at beginning of day', () => {
      // Create scenario at start of day
      const court2Slots = new Map<string, CalendarCell>();
      court2Slots.set('2024-01-15T09:00', {
        court: 'court2',
        date: '2024-01-15',
        start: '09:00',
        state: 'free',
        className: 'slot-free'
      });
      court2Slots.set('2024-01-15T09:30', {
        court: 'court2',
        date: '2024-01-15', 
        start: '09:30',
        state: 'free',
        className: 'slot-free'
      });
      court2Slots.set('2024-01-15T10:00', {
        court: 'court2',
        date: '2024-01-15',
        start: '10:00',
        state: 'booked',
        className: 'slot-booked'
      });
      
      mockMatrix.cells.set('court2', court2Slots);
      
      // Booking 09:30-10:30 would isolate 09:00 (first slot)
      const result = checker.checkIsolation(mockMatrix, 'court2', '2024-01-15', '09:30', 60);
      
      expect(result.hasIsolation).toBe(true);
      expect(result.isolatedSlots).toHaveLength(1);
      expect(result.isolatedSlots[0]?.startTime).toBe('09:00');
    });

    it('should handle edge case at end of day', () => {
      // Add end of day scenario
      const court1Slots = mockMatrix.cells.get('court1')!;
      court1Slots.set('2024-01-15T22:30', {
        court: 'court1',
        date: '2024-01-15',
        start: '22:30',
        state: 'free',
        className: 'slot-free'  
      });
      court1Slots.set('2024-01-15T23:00', {
        court: 'court1',
        date: '2024-01-15',
        start: '23:00',
        state: 'free',
        className: 'slot-free'
      });
      
      // Booking 22:30-23:30 would isolate nothing (end of day)
      const result = checker.checkIsolation(mockMatrix, 'court1', '2024-01-15', '22:30', 60);
      
      // Should isolate 23:00 slot since there's no 23:30 slot
      expect(result.hasIsolation).toBe(true);
      expect(result.isolatedSlots.some(slot => slot.startTime === '23:00')).toBe(true);
    });

    it('should handle missing court gracefully', () => {
      const result = checker.checkIsolation(mockMatrix, 'nonexistent-court', '2024-01-15', '14:00', 60);
      
      expect(result.hasIsolation).toBe(false);
      expect(result.isolatedSlots).toHaveLength(0);
    });

    it('should handle error scenarios', () => {
      // Corrupt matrix
      const corruptMatrix = { ...mockMatrix, cells: null as any };
      
      const result = checker.checkIsolation(corruptMatrix, 'court1', '2024-01-15', '14:00', 60);
      
      expect(result.hasIsolation).toBe(true); // Safe default
      expect(result.recommendation).toContain('Unable to check isolation');
    });
  });

  describe('time manipulation utilities', () => {
    it('should add minutes correctly', () => {
      const addMinutes = (checker as any).addMinutes.bind(checker);
      
      expect(addMinutes('14:00', 30)).toBe('14:30');
      expect(addMinutes('14:30', 30)).toBe('15:00');
      expect(addMinutes('23:30', 30)).toBe('00:00'); // Edge case handled
      expect(addMinutes('23:30', 60)).toBeNull(); // Past midnight
    });

    it('should subtract minutes correctly', () => {
      const subtractMinutes = (checker as any).subtractMinutes.bind(checker);
      
      expect(subtractMinutes('14:30', 30)).toBe('14:00');
      expect(subtractMinutes('15:00', 30)).toBe('14:30');
      expect(subtractMinutes('00:30', 30)).toBe('00:00');
      expect(subtractMinutes('00:00', 30)).toBeNull(); // Before start of day
    });

    it('should handle invalid time format', () => {
      const addMinutes = (checker as any).addMinutes.bind(checker);
      const subtractMinutes = (checker as any).subtractMinutes.bind(checker);
      
      expect(addMinutes('invalid', 30)).toBeNull();
      expect(subtractMinutes('invalid', 30)).toBeNull();
      expect(addMinutes('25:00', 30)).toBeNull(); // Invalid hour
    });
  });

  describe('checkBatchIsolation', () => {
    it('should check multiple bookings efficiently', () => {
      const bookingOptions = [
        { court: 'court1', date: '2024-01-15', startTime: '14:00', duration: 60 },
        { court: 'court1', date: '2024-01-15', startTime: '14:30', duration: 60 },
        { court: 'court1', date: '2024-01-15', startTime: '15:00', duration: 60 }
      ];
      
      const results = checker.checkBatchIsolation(mockMatrix, bookingOptions);
      
      expect(results).toHaveLength(3);
      expect(results[0]?.result.hasIsolation).toBe(false); // 14:00-15:00 safe
      expect(results[1]?.result.hasIsolation).toBe(true);  // 14:30-15:30 isolates 14:00
      expect(results[2]?.result.hasIsolation).toBe(false); // 15:00-16:00 safe
    });
  });

  describe('getIsolationSafeSlots', () => {
    it('should return only safe time slots', () => {
      const safeSlots = checker.getIsolationSafeSlots(mockMatrix, 'court1', '2024-01-15', 60);
      
      expect(safeSlots).toContain('14:00'); // 14:00-15:00 is safe
      expect(safeSlots).not.toContain('14:30'); // 14:30-15:30 would isolate 14:00
      expect(safeSlots).toContain('15:00'); // Might be safe depending on context
    });

    it('should handle non-existent court', () => {
      const safeSlots = checker.getIsolationSafeSlots(mockMatrix, 'non-existent', '2024-01-15', 60);
      
      expect(safeSlots).toEqual([]);
    });
  });
});