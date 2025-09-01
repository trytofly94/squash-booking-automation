import { BookingManager } from '../../src/core/BookingManager';
import { PatternStorage } from '../../src/core/PatternStorage';
import { CourtScorer } from '../../src/core/CourtScorer';
import { logger } from '../../src/utils/logger';
import type { Page } from '@playwright/test';
import type { BookingPattern, AdvancedBookingConfig } from '../../src/types/booking.types';

jest.mock('../../src/core/PatternStorage');
jest.mock('../../src/core/CourtScorer');
jest.mock('../../src/utils/logger');

describe('Lazy Pattern Loading', () => {
  let mockPage: Page;
  let mockPatternStorage: jest.Mocked<PatternStorage>;
  let mockCourtScorer: jest.Mocked<CourtScorer>;
  let bookingManager: BookingManager;
  
  const mockPatterns: BookingPattern[] = [
    {
      courtId: 'court-1',
      timeSlot: '14:00',
      dayOfWeek: 1,
      successRate: 0.8,
      totalAttempts: 10,
      lastUpdated: new Date()
    }
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock page object
    mockPage = {
      goto: jest.fn(),
      click: jest.fn(),
      waitForSelector: jest.fn(),
      evaluate: jest.fn(),
    } as any;

    // Setup mocks
    (PatternStorage as jest.MockedClass<typeof PatternStorage>).mockImplementation(() => {
      mockPatternStorage = {
        loadPatterns: jest.fn().mockResolvedValue(mockPatterns),
        savePatterns: jest.fn().mockResolvedValue(undefined),
      } as any;
      return mockPatternStorage;
    });

    (CourtScorer as jest.MockedClass<typeof CourtScorer>).mockImplementation(() => {
      mockCourtScorer = {
        loadPatterns: jest.fn(),
        scoreCourts: jest.fn().mockReturnValue([
          { courtId: 'court-1', score: 0.8 },
          { courtId: 'court-2', score: 0.6 }
        ]),
        getBestCourt: jest.fn().mockReturnValue('court-1'),
        updatePattern: jest.fn(),
        exportPatterns: jest.fn().mockReturnValue(mockPatterns),
      } as any;
      return mockCourtScorer;
    });
  });

  describe('Initialization', () => {
    it('should not load patterns during initialization when pattern learning is enabled', () => {
      const config: Partial<AdvancedBookingConfig> = {
        enablePatternLearning: true,
        dryRun: true
      };

      bookingManager = new BookingManager(mockPage, config);

      // Patterns should not be loaded during initialization
      expect(mockPatternStorage.loadPatterns).not.toHaveBeenCalled();
      expect(mockCourtScorer.loadPatterns).not.toHaveBeenCalled();
      
      // Should log that lazy loading is enabled
      expect(logger.info).toHaveBeenCalledWith(
        'Pattern learning enabled (lazy loading)',
        'BookingManager'
      );
    });

    it('should not attempt to load patterns when pattern learning is disabled', () => {
      const config: Partial<AdvancedBookingConfig> = {
        enablePatternLearning: false,
        dryRun: true
      };

      bookingManager = new BookingManager(mockPage, config);

      expect(mockPatternStorage.loadPatterns).not.toHaveBeenCalled();
      expect(mockCourtScorer.loadPatterns).not.toHaveBeenCalled();
    });
  });

  describe('Lazy Loading on First Use', () => {
    beforeEach(() => {
      const config: Partial<AdvancedBookingConfig> = {
        enablePatternLearning: true,
        dryRun: true
      };
      bookingManager = new BookingManager(mockPage, config);
    });

    it('should load patterns on first court scoring', async () => {
      // Mock the search result with proper booking pairs
      const searchResult = {
        availableCourts: ['court-1', 'court-2'],
        availablePairs: [
          { 
            courtId: 'court-1',
            slot1: { date: '2023-12-15', startTime: '14:00', courtId: 'court-1', isAvailable: true },
            slot2: { date: '2023-12-15', startTime: '14:30', courtId: 'court-1', isAvailable: true }
          },
          { 
            courtId: 'court-2',
            slot1: { date: '2023-12-15', startTime: '14:00', courtId: 'court-2', isAvailable: true },
            slot2: { date: '2023-12-15', startTime: '14:30', courtId: 'court-2', isAvailable: true }
          }
        ],
        allSlots: []
      };

      // Mock getAllSlotsFromSearchResult
      (bookingManager as any).getAllSlotsFromSearchResult = jest.fn().mockReturnValue([]);

      // Trigger selectOptimalCourt which should lazy load patterns
      await (bookingManager as any).selectOptimalCourt(
        searchResult,
        '14:00',
        1
      );

      // Patterns should be loaded
      expect(mockPatternStorage.loadPatterns).toHaveBeenCalledTimes(1);
      expect(mockCourtScorer.loadPatterns).toHaveBeenCalledWith(mockPatterns);
    });

    it('should only load patterns once even with multiple calls', async () => {
      const searchResult = {
        availableCourts: ['court-1', 'court-2'],
        availablePairs: [
          { 
            courtId: 'court-1',
            slot1: { date: '2023-12-15', startTime: '14:00', courtId: 'court-1', isAvailable: true },
            slot2: { date: '2023-12-15', startTime: '14:30', courtId: 'court-1', isAvailable: true }
          },
          { 
            courtId: 'court-2',
            slot1: { date: '2023-12-15', startTime: '14:00', courtId: 'court-2', isAvailable: true },
            slot2: { date: '2023-12-15', startTime: '14:30', courtId: 'court-2', isAvailable: true }
          }
        ],
        allSlots: []
      };
      
      // Mock getAllSlotsFromSearchResult
      (bookingManager as any).getAllSlotsFromSearchResult = jest.fn().mockReturnValue([]);

      // Multiple calls to selectOptimalCourt
      await (bookingManager as any).selectOptimalCourt(searchResult, '14:00', 1);
      await (bookingManager as any).selectOptimalCourt(searchResult, '15:00', 2);
      await (bookingManager as any).selectOptimalCourt(searchResult, '16:00', 3);

      // Patterns should only be loaded once
      expect(mockPatternStorage.loadPatterns).toHaveBeenCalledTimes(1);
      expect(mockCourtScorer.loadPatterns).toHaveBeenCalledTimes(1);
    });

    it('should handle concurrent loading requests correctly', async () => {
      const searchResult = {
        availableCourts: ['court-1', 'court-2'],
        availablePairs: [
          { 
            courtId: 'court-1',
            slot1: { date: '2023-12-15', startTime: '14:00', courtId: 'court-1', isAvailable: true },
            slot2: { date: '2023-12-15', startTime: '14:30', courtId: 'court-1', isAvailable: true }
          },
          { 
            courtId: 'court-2',
            slot1: { date: '2023-12-15', startTime: '14:00', courtId: 'court-2', isAvailable: true },
            slot2: { date: '2023-12-15', startTime: '14:30', courtId: 'court-2', isAvailable: true }
          }
        ],
        allSlots: []
      };
      
      // Mock getAllSlotsFromSearchResult
      (bookingManager as any).getAllSlotsFromSearchResult = jest.fn().mockReturnValue([]);

      // Simulate slow pattern loading
      let resolveLoad: (value: BookingPattern[]) => void;
      const slowLoadPromise = new Promise<BookingPattern[]>((resolve) => {
        resolveLoad = resolve;
      });
      mockPatternStorage.loadPatterns.mockReturnValue(slowLoadPromise);

      // Start multiple concurrent requests
      const promise1 = (bookingManager as any).selectOptimalCourt(searchResult, '14:00', 1);
      const promise2 = (bookingManager as any).selectOptimalCourt(searchResult, '15:00', 2);
      const promise3 = (bookingManager as any).selectOptimalCourt(searchResult, '16:00', 3);

      // Resolve the loading
      resolveLoad!(mockPatterns);

      await Promise.all([promise1, promise2, promise3]);

      // Should only load patterns once despite concurrent calls
      expect(mockPatternStorage.loadPatterns).toHaveBeenCalledTimes(1);
      expect(mockCourtScorer.loadPatterns).toHaveBeenCalledTimes(1);
    });
  });

  describe('Pattern Loading with Timeout', () => {
    beforeEach(() => {
      // Set a short timeout for testing
      process.env['PATTERN_LOAD_TIMEOUT_MS'] = '100';
      
      const config: Partial<AdvancedBookingConfig> = {
        enablePatternLearning: true,
        dryRun: true
      };
      bookingManager = new BookingManager(mockPage, config);
    });

    afterEach(() => {
      delete process.env['PATTERN_LOAD_TIMEOUT_MS'];
    });

    it('should timeout if pattern loading takes too long', async () => {
      // Create a promise that never resolves
      mockPatternStorage.loadPatterns.mockReturnValue(
        new Promise(() => {}) // Never resolves
      );

      const searchResult = {
        availableCourts: ['court-1', 'court-2'],
        availablePairs: [
          { 
            courtId: 'court-1',
            slot1: { date: '2023-12-15', startTime: '14:00', courtId: 'court-1', isAvailable: true },
            slot2: { date: '2023-12-15', startTime: '14:30', courtId: 'court-1', isAvailable: true }
          },
          { 
            courtId: 'court-2',
            slot1: { date: '2023-12-15', startTime: '14:00', courtId: 'court-2', isAvailable: true },
            slot2: { date: '2023-12-15', startTime: '14:30', courtId: 'court-2', isAvailable: true }
          }
        ],
        allSlots: []
      };
      
      // Mock getAllSlotsFromSearchResult
      (bookingManager as any).getAllSlotsFromSearchResult = jest.fn().mockReturnValue([]);

      // Should not throw but log warning
      await (bookingManager as any).selectOptimalCourt(searchResult, '14:00', 1);

      // Should load empty patterns on timeout
      expect(mockCourtScorer.loadPatterns).toHaveBeenCalledWith([]);
      
      // Should log warning about timeout
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Failed to load patterns'),
        'BookingManager',
        expect.objectContaining({
          error: expect.stringContaining('timeout'),
          timeout: 100
        })
      );
    });

    it('should handle pattern loading errors gracefully', async () => {
      mockPatternStorage.loadPatterns.mockRejectedValue(
        new Error('File read error')
      );

      const searchResult = {
        availableCourts: ['court-1', 'court-2'],
        availablePairs: [
          { 
            courtId: 'court-1',
            slot1: { date: '2023-12-15', startTime: '14:00', courtId: 'court-1', isAvailable: true },
            slot2: { date: '2023-12-15', startTime: '14:30', courtId: 'court-1', isAvailable: true }
          },
          { 
            courtId: 'court-2',
            slot1: { date: '2023-12-15', startTime: '14:00', courtId: 'court-2', isAvailable: true },
            slot2: { date: '2023-12-15', startTime: '14:30', courtId: 'court-2', isAvailable: true }
          }
        ],
        allSlots: []
      };
      
      // Mock getAllSlotsFromSearchResult
      (bookingManager as any).getAllSlotsFromSearchResult = jest.fn().mockReturnValue([]);

      // Should not throw
      await (bookingManager as any).selectOptimalCourt(searchResult, '14:00', 1);

      // Should load empty patterns on error
      expect(mockCourtScorer.loadPatterns).toHaveBeenCalledWith([]);
      
      // Should log warning
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Failed to load patterns'),
        'BookingManager',
        expect.objectContaining({
          error: 'File read error'
        })
      );
    });
  });

  describe('Pattern Updates with Lazy Loading', () => {
    beforeEach(() => {
      const config: Partial<AdvancedBookingConfig> = {
        enablePatternLearning: true,
        dryRun: true
      };
      bookingManager = new BookingManager(mockPage, config);
    });

    it('should load patterns before updating them', async () => {
      // Call updateBookingPattern directly
      await (bookingManager as any).updateBookingPattern(
        'court-1',
        '14:00',
        1,
        true
      );

      // Should load patterns first
      expect(mockPatternStorage.loadPatterns).toHaveBeenCalled();
      expect(mockCourtScorer.loadPatterns).toHaveBeenCalledWith(mockPatterns);
      
      // Then update the pattern
      expect(mockCourtScorer.updatePattern).toHaveBeenCalledWith(
        'court-1',
        '14:00',
        1,
        true
      );
    });

    it('should not reload patterns if already loaded', async () => {
      // First load patterns
      const searchResult = {
        availableCourts: ['court-1'],
        availablePairs: [
          { 
            courtId: 'court-1',
            slot1: { date: '2023-12-15', startTime: '14:00', courtId: 'court-1', isAvailable: true },
            slot2: { date: '2023-12-15', startTime: '14:30', courtId: 'court-1', isAvailable: true }
          }
        ],
        allSlots: []
      };
      
      // Mock getAllSlotsFromSearchResult
      (bookingManager as any).getAllSlotsFromSearchResult = jest.fn().mockReturnValue([]);
      
      await (bookingManager as any).selectOptimalCourt(searchResult, '14:00', 1);
      
      // Clear mock calls
      mockPatternStorage.loadPatterns.mockClear();
      
      // Update pattern
      await (bookingManager as any).updateBookingPattern(
        'court-1',
        '14:00',
        1,
        true
      );

      // Should not reload patterns
      expect(mockPatternStorage.loadPatterns).not.toHaveBeenCalled();
      
      // Should still update the pattern
      expect(mockCourtScorer.updatePattern).toHaveBeenCalledWith(
        'court-1',
        '14:00',
        1,
        true
      );
    });
  });

  describe('Performance Impact', () => {
    it('should have faster initialization without pattern loading', () => {
      const startTime = Date.now();
      
      const config: Partial<AdvancedBookingConfig> = {
        enablePatternLearning: true,
        dryRun: true
      };
      
      bookingManager = new BookingManager(mockPage, config);
      
      const initTime = Date.now() - startTime;
      
      // Initialization should be very fast (< 200ms)
      expect(initTime).toBeLessThan(200);
      
      // No I/O operations during init
      expect(mockPatternStorage.loadPatterns).not.toHaveBeenCalled();
    });
  });
});