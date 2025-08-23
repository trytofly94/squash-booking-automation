/**
 * Unit tests for MatrixSlotSearcher
 * Issue #20: Single-Pass Calendar Matrix Building - Phase 3
 */

import { MatrixSlotSearcher } from '../../src/core/MatrixSlotSearcher';
import { CalendarMatrix, CalendarCell } from '../../src/types/booking.types';

// Mock dependencies
jest.mock('../../src/pages/BookingCalendarPage');
jest.mock('../../src/core/MatrixIsolationChecker');
jest.mock('../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }
}));

// Mock Playwright Page
const createMockPage = () => ({
  $$eval: jest.fn(),
  $: jest.fn(),
  $$: jest.fn()
});

describe('MatrixSlotSearcher', () => {
  let mockPage: ReturnType<typeof createMockPage>;
  let searcher: MatrixSlotSearcher;
  let mockMatrix: CalendarMatrix;

  beforeEach(() => {
    mockPage = createMockPage();
    
    // Create comprehensive test matrix
    const cells = new Map<string, Map<string, CalendarCell>>();
    
    // Court 1
    const court1Slots = new Map<string, CalendarCell>();
    court1Slots.set('2024-01-20T14:00', {
      court: 'court1',
      date: '2024-01-20',
      start: '14:00',
      state: 'free',
      className: 'slot-free',
      elementSelector: "td[data-court='court1'][data-date='2024-01-20'][data-start='14:00']"
    });
    court1Slots.set('2024-01-20T14:30', {
      court: 'court1', 
      date: '2024-01-20',
      start: '14:30',
      state: 'free',
      className: 'slot-free',
      elementSelector: "td[data-court='court1'][data-date='2024-01-20'][data-start='14:30']"
    });
    court1Slots.set('2024-01-20T15:00', {
      court: 'court1',
      date: '2024-01-20', 
      start: '15:00',
      state: 'booked',
      className: 'slot-booked'
    });
    
    // Court 2
    const court2Slots = new Map<string, CalendarCell>();
    court2Slots.set('2024-01-20T14:00', {
      court: 'court2',
      date: '2024-01-20',
      start: '14:00', 
      state: 'free',
      className: 'slot-free',
      elementSelector: "td[data-court='court2'][data-date='2024-01-20'][data-start='14:00']"
    });
    court2Slots.set('2024-01-20T14:30', {
      court: 'court2',
      date: '2024-01-20',
      start: '14:30',
      state: 'booked', 
      className: 'slot-booked'
    });
    
    cells.set('court1', court1Slots);
    cells.set('court2', court2Slots);
    
    mockMatrix = {
      cells,
      dateRange: { start: '2024-01-20', end: '2024-01-20' },
      courts: ['court1', 'court2'],
      timeSlots: ['14:00', '14:30', '15:00'],
      createdAt: new Date(),
      source: 'dom',
      metrics: {
        totalCells: 5,
        freeCells: 3,
        bookedCells: 2,
        unavailableCells: 0,
        courtsWithData: 2,
        timeSlotsWithData: 3,
        extractionDurationMs: 50,
        isComplete: true,
        warnings: []
      }
    };

    searcher = new MatrixSlotSearcher(mockPage as any, '2024-01-20', ['14:00', '14:30']);
    
    // Mock calendar page and isolation checker
    const MockCalendarPage = require('../../src/pages/BookingCalendarPage').BookingCalendarPage;
    const MockIsolationChecker = require('../../src/core/MatrixIsolationChecker').MatrixIsolationChecker;
    
    MockCalendarPage.prototype.extractCalendarMatrix = jest.fn().mockResolvedValue(mockMatrix);
    MockCalendarPage.prototype.getMatrixMetrics = jest.fn().mockReturnValue({
      performanceGain: '85%',
      dataCompleteness: '95%',
      extractionTime: '50ms',
      cellDensity: 2.5
    });
    
    MockIsolationChecker.prototype.checkIsolation = jest.fn().mockReturnValue({
      hasIsolation: false,
      isolatedSlots: [],
      recommendation: 'No isolation detected'
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should validate inputs correctly', () => {
      expect(() => new MatrixSlotSearcher(mockPage as any, '2024-01-20', ['14:00'])).not.toThrow();
    });

    it('should throw error for invalid date', () => {
      expect(() => new MatrixSlotSearcher(mockPage as any, 'invalid-date', ['14:00'])).toThrow();
    });

    it('should throw error for invalid time', () => {
      expect(() => new MatrixSlotSearcher(mockPage as any, '2024-01-20', ['invalid-time'])).toThrow();
    });
  });

  describe('searchAvailableSlots', () => {
    it('should perform matrix-based search successfully', async () => {
      const result = await searcher.searchAvailableSlots();
      
      expect(result).toBeDefined();
      expect(result.availableCourts).toEqual(['court1', 'court2']);
      expect(result.totalSlots).toBe(2); // Only free slots for target times
      expect(result.availablePairs).toBeDefined();
    });

    it('should handle matrix extraction failure', async () => {
      const MockCalendarPage = require('../../src/pages/BookingCalendarPage').BookingCalendarPage;
      MockCalendarPage.prototype.extractCalendarMatrix = jest.fn().mockRejectedValue(new Error('Extraction failed'));
      
      await expect(searcher.searchAvailableSlots()).rejects.toThrow('Extraction failed');
    });
  });

  describe('getAvailableCourtsFromMatrix', () => {
    it('should extract available courts correctly', () => {
      const getAvailableCourtsFromMatrix = (searcher as any).getAvailableCourtsFromMatrix.bind(searcher);
      
      const courts = getAvailableCourtsFromMatrix(mockMatrix);
      
      expect(courts).toEqual(['court1', 'court2']);
      expect(courts).toHaveLength(2);
    });

    it('should handle matrix with no free slots', () => {
      const getAvailableCourtsFromMatrix = (searcher as any).getAvailableCourtsFromMatrix.bind(searcher);
      
      // Create matrix with all booked slots
      const bookedMatrix = { ...mockMatrix };
      const bookedCells = new Map<string, Map<string, CalendarCell>>();
      const court1Slots = new Map<string, CalendarCell>();
      court1Slots.set('2024-01-20T14:00', {
        court: 'court1',
        date: '2024-01-20',
        start: '14:00',
        state: 'booked',
        className: 'slot-booked'
      });
      bookedCells.set('court1', court1Slots);
      bookedMatrix.cells = bookedCells;
      
      const courts = getAvailableCourtsFromMatrix(bookedMatrix);
      
      expect(courts).toEqual([]);
    });
  });

  describe('getSlotsFromMatrix', () => {
    it('should extract slots for target times', () => {
      const getSlotsFromMatrix = (searcher as any).getSlotsFromMatrix.bind(searcher);
      
      const slots = getSlotsFromMatrix(mockMatrix, ['14:00', '14:30']);
      
      expect(slots).toHaveLength(2); // court1: 14:00, 14:30; court2: 14:00
      expect(slots.every(slot => slot.isAvailable)).toBe(true);
      expect(slots.every(slot => ['14:00', '14:30'].includes(slot.startTime))).toBe(true);
    });

    it('should return empty array when no slots match target times', () => {
      const getSlotsFromMatrix = (searcher as any).getSlotsFromMatrix.bind(searcher);
      
      const slots = getSlotsFromMatrix(mockMatrix, ['16:00', '16:30']);
      
      expect(slots).toEqual([]);
    });
  });

  describe('findAvailableSlotPairs', () => {
    it('should find valid slot pairs without isolation', () => {
      const findAvailableSlotPairs = (searcher as any).findAvailableSlotPairs.bind(searcher);
      const getSlotsFromMatrix = (searcher as any).getSlotsFromMatrix.bind(searcher);
      
      const slots = getSlotsFromMatrix(mockMatrix, ['14:00', '14:30']);
      const pairs = findAvailableSlotPairs(mockMatrix, slots);
      
      expect(pairs).toHaveLength(1); // Only court1 has both 14:00 and 14:30 free
      expect(pairs[0].courtId).toBe('court1');
      expect(pairs[0].slot1.startTime).toBe('14:00');
      expect(pairs[0].slot2.startTime).toBe('14:30');
    });

    it('should exclude pairs that would create isolation', () => {
      const MockIsolationChecker = require('../../src/core/MatrixIsolationChecker').MatrixIsolationChecker;
      MockIsolationChecker.prototype.checkIsolation = jest.fn().mockReturnValue({
        hasIsolation: true,
        isolatedSlots: [{ startTime: '13:30', courtId: 'court1' }],
        recommendation: 'Would isolate previous slot'
      });

      const findAvailableSlotPairs = (searcher as any).findAvailableSlotPairs.bind(searcher);
      const getSlotsFromMatrix = (searcher as any).getSlotsFromMatrix.bind(searcher);
      
      const slots = getSlotsFromMatrix(mockMatrix, ['14:00', '14:30']);
      const pairs = findAvailableSlotPairs(mockMatrix, slots);
      
      expect(pairs).toHaveLength(0); // All pairs excluded due to isolation
    });
  });

  describe('utility methods', () => {
    it('should add thirty minutes correctly', () => {
      const addThirtyMinutes = (searcher as any).addThirtyMinutes.bind(searcher);
      
      expect(addThirtyMinutes('14:00')).toBe('14:30');
      expect(addThirtyMinutes('14:30')).toBe('15:00');
      expect(addThirtyMinutes('23:30')).toBe('00:00'); // Handle edge case  
      expect(addThirtyMinutes('23:45')).toBeNull(); // Past midnight
    });

    it('should handle invalid time format', () => {
      const addThirtyMinutes = (searcher as any).addThirtyMinutes.bind(searcher);
      
      expect(addThirtyMinutes('invalid')).toBeNull();
      expect(addThirtyMinutes('25:00')).toBeNull();
    });

    it('should group slots by court and time correctly', () => {
      const groupSlotsByCourtAndTime = (searcher as any).groupSlotsByCourtAndTime.bind(searcher);
      
      const slots = [
        { courtId: 'court1', startTime: '14:00', date: '2024-01-20', isAvailable: true },
        { courtId: 'court1', startTime: '14:30', date: '2024-01-20', isAvailable: true },
        { courtId: 'court2', startTime: '14:00', date: '2024-01-20', isAvailable: true }
      ];
      
      const grouped = groupSlotsByCourtAndTime(slots);
      
      expect(grouped.size).toBe(2);
      expect(grouped.get('court1')?.size).toBe(2);
      expect(grouped.get('court2')?.size).toBe(1);
      expect(grouped.get('court1')?.get('14:00')).toBe(slots[0]);
    });
  });

  describe('getOptimizationMetrics', () => {
    it('should return performance metrics', async () => {
      const metrics = await searcher.getOptimizationMetrics(mockMatrix);
      
      expect(metrics).toHaveProperty('extractionTime');
      expect(metrics).toHaveProperty('totalQueries', 1);
      expect(metrics).toHaveProperty('estimatedLegacyQueries');
      expect(metrics).toHaveProperty('performanceGain');
      expect(metrics).toHaveProperty('matrixCompleteness');
      
      expect(metrics.totalQueries).toBeLessThan(metrics.estimatedLegacyQueries);
      expect(parseFloat(metrics.performanceGain)).toBeGreaterThan(0);
      expect(metrics.matrixCompleteness).toBeGreaterThan(0);
    });
  });

  describe('batchSearch', () => {
    it('should handle multiple search queries', async () => {
      const queries = [
        { date: '2024-01-20', times: ['14:00'] },
        { date: '2024-01-21', times: ['15:00'] }
      ];
      
      const results = await searcher.batchSearch(queries);
      
      expect(results).toHaveLength(2);
      expect(results[0].query).toBe(queries[0]);
      expect(results[0].result).toBeDefined();
      expect(results[1].query).toBe(queries[1]);
      expect(results[1].result).toBeDefined();
    });

    it('should handle failed queries gracefully', async () => {
      const MockCalendarPage = require('../../src/pages/BookingCalendarPage').BookingCalendarPage;
      let callCount = 0;
      MockCalendarPage.mockImplementation(() => ({
        extractCalendarMatrix: jest.fn(() => {
          callCount++;
          if (callCount === 2) {
            throw new Error('Second query failed');
          }
          return Promise.resolve(mockMatrix);
        })
      }));

      const queries = [
        { date: '2024-01-20', times: ['14:00'] },
        { date: '2024-01-21', times: ['15:00'] }
      ];
      
      const results = await searcher.batchSearch(queries);
      
      expect(results).toHaveLength(2);
      expect(results[0].result.totalSlots).toBeGreaterThanOrEqual(0);
      expect(results[1].result.totalSlots).toBe(0); // Failed query returns empty result
    });
  });
});