/**
 * Unit tests for CalendarMatrixBuilder
 * Issue #20: Single-Pass Calendar Matrix Building
 */

import { CalendarMatrixBuilder } from '../../src/core/CalendarMatrixBuilder';
import { CalendarMatrix, CalendarCell } from '../../src/types/booking.types';

// Mock Playwright Page
const createMockPage = () => ({
  $$eval: jest.fn(),
  $: jest.fn(),
  $$: jest.fn(),
  evaluate: jest.fn(),
  waitForSelector: jest.fn(),
  waitForTimeout: jest.fn()
});

// Mock logger
jest.mock('../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }
}));

describe('CalendarMatrixBuilder', () => {
  let builder: CalendarMatrixBuilder;
  let mockPage: ReturnType<typeof createMockPage>;

  beforeEach(() => {
    builder = new CalendarMatrixBuilder();
    mockPage = createMockPage();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('buildMatrix', () => {
    it('should build matrix from extracted cells', async () => {
      const mockCells = [
        {
          court: 'court1',
          date: '2024-01-15',
          start: '14:00',
          state: 'free',
          className: 'slot-free',
          elementSelector: "td[data-court='court1'][data-date='2024-01-15'][data-start='14:00']",
          rawData: {
            'data-court': 'court1',
            'data-date': '2024-01-15',
            'data-start': '14:00',
            'data-state': 'free',
            'class': 'slot-free',
            'id': ''
          }
        },
        {
          court: 'court1',
          date: '2024-01-15',
          start: '14:30',
          state: 'booked',
          className: 'slot-booked',
          elementSelector: "td[data-court='court1'][data-date='2024-01-15'][data-start='14:30']",
          rawData: {
            'data-court': 'court1',
            'data-date': '2024-01-15',
            'data-start': '14:30',
            'data-state': 'booked',
            'class': 'slot-booked',
            'id': ''
          }
        },
        {
          court: 'court2',
          date: '2024-01-15',
          start: '14:00',
          state: 'free',
          className: 'slot-free',
          elementSelector: "td[data-court='court2'][data-date='2024-01-15'][data-start='14:00']",
          rawData: {
            'data-court': 'court2',
            'data-date': '2024-01-15',
            'data-start': '14:00',
            'data-state': 'free',
            'class': 'slot-free',
            'id': ''
          }
        }
      ];

      // Mock successful primary selector
      mockPage.$$eval.mockResolvedValueOnce(mockCells);

      const matrix = await builder.buildMatrix(mockPage as any);

      expect(matrix).toBeDefined();
      expect(matrix.courts).toEqual(['court1', 'court2']);
      expect(matrix.timeSlots).toEqual(['14:00', '14:30']);
      expect(matrix.dateRange.start).toBe('2024-01-15');
      expect(matrix.dateRange.end).toBe('2024-01-15');
      expect(matrix.source).toBe('dom');
      expect(matrix.metrics.totalCells).toBe(3);
      expect(matrix.metrics.freeCells).toBe(2);
      expect(matrix.metrics.bookedCells).toBe(1);
      expect(matrix.metrics.courtsWithData).toBe(2);
    });

    it('should use fallback selector when primary fails', async () => {
      const mockFallbackCells = [
        {
          court: 'court1',
          date: '2024-01-15',
          start: '14:00',
          state: 'free',
          className: 'slot-free',
          elementSelector: '#slot-1',
          rawData: {
            'data-court': 'court1',
            'data-date': '2024-01-15',
            'data-start': '14:00',
            'data-state': 'free',
            'class': 'slot-free',
            'id': 'slot-1'
          }
        }
      ];

      // Primary selector returns empty, fallback succeeds
      mockPage.$$eval
        .mockResolvedValueOnce([]) // Primary
        .mockResolvedValueOnce(mockFallbackCells); // Fallback

      const matrix = await builder.buildMatrix(mockPage as any);

      expect(matrix.metrics.totalCells).toBe(1);
      expect(mockPage.$$eval).toHaveBeenCalledTimes(2);
    });

    it('should throw error when no cells found', async () => {
      mockPage.$$eval
        .mockResolvedValueOnce([]) // Primary
        .mockResolvedValueOnce([]); // Fallback

      await expect(builder.buildMatrix(mockPage as any)).rejects.toThrow(
        'No calendar cells found with primary or fallback selectors'
      );
    });

    it('should handle extraction errors gracefully', async () => {
      mockPage.$$eval.mockRejectedValue(new Error('DOM extraction failed'));

      await expect(builder.buildMatrix(mockPage as any)).rejects.toThrow(
        'DOM extraction failed'
      );
    });
  });

  describe('matrix validation', () => {
    it('should validate complete matrix', async () => {
      const mockCells = Array.from({ length: 100 }, (_, i) => ({
        court: `court${Math.floor(i / 10) + 1}`,
        date: '2024-01-15',
        start: `${14 + Math.floor((i % 10) / 2)}:${(i % 2) * 30}`,
        state: i % 3 === 0 ? 'free' : (i % 3 === 1 ? 'booked' : 'unavailable'),
        className: `slot-${i % 3 === 0 ? 'free' : (i % 3 === 1 ? 'booked' : 'unavailable')}`,
        elementSelector: `td[data-court='court${Math.floor(i / 10) + 1}']`,
        rawData: {
          'data-court': `court${Math.floor(i / 10) + 1}`,
          'data-date': '2024-01-15',
          'data-start': `${14 + Math.floor((i % 10) / 2)}:${(i % 2) * 30}`,
          'data-state': i % 3 === 0 ? 'free' : (i % 3 === 1 ? 'booked' : 'unavailable'),
          'class': `slot-${i % 3 === 0 ? 'free' : (i % 3 === 1 ? 'booked' : 'unavailable')}`,
          'id': ''
        }
      }));

      mockPage.$$eval.mockResolvedValueOnce(mockCells);

      const matrix = await builder.buildMatrix(mockPage as any);

      expect(matrix.metrics.isComplete).toBe(true);
      expect(matrix.metrics.warnings).toHaveLength(0);
      expect(matrix.metrics.totalCells).toBe(100);
    });

    it('should detect incomplete matrix', async () => {
      const mockCells = [
        {
          court: 'court1',
          date: '2024-01-15',
          start: '14:00',
          state: 'booked',
          className: 'slot-booked',
          elementSelector: 'td[data-court="court1"]',
          rawData: {
            'data-court': 'court1',
            'data-date': '2024-01-15',
            'data-start': '14:00',
            'data-state': 'booked',
            'class': 'slot-booked',
            'id': ''
          }
        }
      ];

      mockPage.$$eval.mockResolvedValueOnce(mockCells);

      const matrix = await builder.buildMatrix(mockPage as any);

      expect(matrix.metrics.isComplete).toBe(false);
      expect(matrix.metrics.warnings).toContain('No free slots found');
    });
  });

  describe('buildHybridMatrix', () => {
    it('should build hybrid matrix without network data', async () => {
      const mockCells = [
        {
          court: 'court1',
          date: '2024-01-15',
          start: '14:00',
          state: 'free',
          className: 'slot-free',
          elementSelector: 'td[data-court="court1"]',
          rawData: {
            'data-court': 'court1',
            'data-date': '2024-01-15',
            'data-start': '14:00',
            'data-state': 'free',
            'class': 'slot-free',
            'id': ''
          }
        }
      ];

      mockPage.$$eval.mockResolvedValueOnce(mockCells);

      const hybridMatrix = await builder.buildHybridMatrix(mockPage as any);

      expect(hybridMatrix.source).toBe('dom');
      expect(hybridMatrix.networkData).toBeUndefined();
      expect(hybridMatrix.conflicts).toEqual([]);
    });

    it('should build hybrid matrix with network data', async () => {
      const mockCells = [
        {
          court: 'court1',
          date: '2024-01-15',
          start: '14:00',
          state: 'free',
          className: 'slot-free',
          elementSelector: 'td[data-court="court1"]',
          rawData: {
            'data-court': 'court1',
            'data-date': '2024-01-15',
            'data-start': '14:00',
            'data-state': 'free',
            'class': 'slot-free',
            'id': ''
          }
        }
      ];

      const networkData = new Map([
        ['court1-2024-01-15', {
          courtId: 'court1',
          date: '2024-01-15',
          availableSlots: ['14:00', '14:30'],
          timestamp: new Date(),
          reliability: 0.9
        }]
      ]);

      mockPage.$$eval.mockResolvedValueOnce(mockCells);

      const hybridMatrix = await builder.buildHybridMatrix(mockPage as any, networkData);

      expect(hybridMatrix.networkData).toBe(networkData);
      expect(hybridMatrix.conflicts).toEqual([]); // No conflicts expected yet
    });
  });

  describe('utility methods', () => {
    it('should normalize state correctly', () => {
      // Access private method via reflection for testing
      const normalizeState = (builder as any).normalizeState.bind(builder);

      expect(normalizeState('free')).toBe('free');
      expect(normalizeState('available')).toBe('free');
      expect(normalizeState('booked')).toBe('booked');
      expect(normalizeState('occupied')).toBe('booked');
      expect(normalizeState('unavailable')).toBe('unavailable');
      expect(normalizeState('blocked')).toBe('unavailable');
      expect(normalizeState('unknown-state')).toBe('unknown');
      expect(normalizeState('')).toBe('unknown');
    });

    it('should extract court from class name', () => {
      const extractCourtFromClass = (builder as any).extractCourtFromClass.bind(builder);

      expect(extractCourtFromClass('court-1')).toBe('1');
      expect(extractCourtFromClass('court1')).toBe('1');
      expect(extractCourtFromClass('court-A')).toBe('A');
      expect(extractCourtFromClass('no-court-info')).toBe('');
    });

    it('should extract date from class name', () => {
      const extractDateFromClass = (builder as any).extractDateFromClass.bind(builder);

      expect(extractDateFromClass('date-2024-01-15')).toBe('2024-01-15');
      expect(extractDateFromClass('cell 2024-01-15 slot')).toBe('2024-01-15');
      expect(extractDateFromClass('no-date-info')).toBe('');
    });

    it('should extract time from class name', () => {
      const extractTimeFromClass = (builder as any).extractTimeFromClass.bind(builder);

      expect(extractTimeFromClass('time-14:00')).toBe('14:00');
      expect(extractTimeFromClass('slot 14:30 available')).toBe('14:30');
      expect(extractTimeFromClass('slot 9:00 available')).toBe('9:00');
      expect(extractTimeFromClass('no-time-info')).toBe('');
    });
  });
});