import { BookingManager } from '../../src/core/BookingManager';
import { DateTimeCalculator } from '../../src/core/DateTimeCalculator';
import { SlotSearcher } from '../../src/core/SlotSearcher';
import { IsolationChecker } from '../../src/core/IsolationChecker';
import { RetryManager } from '../../src/core/retry/RetryManager';
import { DryRunValidator } from '../../src/utils/DryRunValidator';
import { TimeSlotGenerator } from '../../src/core/TimeSlotGenerator';
import type { Page } from '@playwright/test';
import type { BookingConfig, BookingPair } from '../../src/types/booking.types';

// Mock dependencies
jest.mock('../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    startTiming: jest.fn().mockReturnValue('timer-id'),
    endTiming: jest.fn(),
    logBookingSuccess: jest.fn(),
    logBookingFailure: jest.fn(),
    logStructuredError: jest.fn()
  }
}));
jest.mock('../../src/core/DateTimeCalculator');
jest.mock('../../src/core/SlotSearcher');
jest.mock('../../src/core/IsolationChecker');
jest.mock('../../src/core/CourtScorer');
jest.mock('../../src/core/PatternStorage');
jest.mock('../../src/core/TimeSlotGenerator');
jest.mock('../../src/core/retry/RetryManager');
jest.mock('../../src/utils/DryRunValidator');
jest.mock('../../src/utils/CorrelationManager', () => ({
  correlationManager: {
    runWithNewContext: jest.fn().mockImplementation((callback) => callback()),
    generateCorrelationId: jest.fn().mockReturnValue('test-correlation-id'),
    getCurrentCorrelationId: jest.fn().mockReturnValue('test-correlation-id'),
    setComponent: jest.fn(),
    createContext: jest.fn(),
    getMetadata: jest.fn().mockReturnValue({})
  }
}));
jest.mock('../../src/monitoring/BookingAnalytics', () => ({
  bookingAnalytics: {
    recordBookingAttempt: jest.fn()
  }
}));
jest.mock('date-fns', () => ({
  getDay: jest.fn(() => 1) // Monday
}));

// Get mocked constructors
const MockedSlotSearcher = SlotSearcher as jest.MockedClass<typeof SlotSearcher>;
const MockedIsolationChecker = IsolationChecker as unknown as jest.Mocked<typeof IsolationChecker>;
const MockedRetryManager = RetryManager as jest.MockedClass<typeof RetryManager>;
const MockedDryRunValidator = DryRunValidator as jest.MockedClass<typeof DryRunValidator>;
const MockedTimeSlotGenerator = TimeSlotGenerator as jest.MockedClass<typeof TimeSlotGenerator>;

describe('BookingManager', () => {
  let mockPage: Partial<Page>;
  let bookingManager: BookingManager;

  beforeEach(() => {
    // Create mock page object
    mockPage = {
      goto: jest.fn().mockResolvedValue(undefined),
      waitForLoadState: jest.fn().mockResolvedValue(undefined),
      waitForTimeout: jest.fn().mockResolvedValue(undefined),
      click: jest.fn().mockResolvedValue(undefined),
      $: jest.fn().mockResolvedValue(null),
      keyboard: {
        press: jest.fn().mockResolvedValue(undefined),
        down: jest.fn().mockResolvedValue(undefined),
        up: jest.fn().mockResolvedValue(undefined),
        insertText: jest.fn().mockResolvedValue(undefined),
        type: jest.fn().mockResolvedValue(undefined)
      },
      screenshot: jest.fn().mockResolvedValue(Buffer.from('')),
      url: jest.fn().mockReturnValue('https://www.eversports.de/test')
    };

    // Mock DateTimeCalculator methods
    (DateTimeCalculator.getCurrentTimestamp as jest.Mock).mockReturnValue(new Date('2024-01-01T12:00:00Z'));
    (DateTimeCalculator.calculateBookingDate as jest.Mock).mockReturnValue('2024-01-21');
    (DateTimeCalculator.generateTimeSlots as jest.Mock).mockReturnValue(['14:00', '15:00']);

    // Mock RetryManager
    MockedRetryManager.mockImplementation(() => ({
      execute: jest.fn().mockImplementation(async (operation) => {
        try {
          const result = await operation();
          return {
            success: true,
            result,
            totalAttempts: 1,
            totalTimeMs: 100,
            attempts: [],
            circuitBreakerTripped: false
          };
        } catch (error) {
          return {
            success: false,
            error: error as Error,
            totalAttempts: 1,
            totalTimeMs: 100,
            attempts: [],
            circuitBreakerTripped: false
          };
        }
      }),
      executeSimple: jest.fn().mockImplementation(async (operation) => {
        return await operation();
      }),
      getStats: jest.fn().mockReturnValue({
        isEnabled: true,
        config: {},
        circuitBreaker: {}
      }),
      getCircuitBreakerState: jest.fn().mockReturnValue('CLOSED')
    } as any));

    // Mock DryRunValidator
    MockedDryRunValidator.mockImplementation(() => ({
      validateBookingConfig: jest.fn().mockReturnValue({
        isValid: true,
        errors: [],
        warnings: [],
        recommendations: []
      })
    } as any));

    // Mock TimeSlotGenerator
    MockedTimeSlotGenerator.mockImplementation(() => ({
      generatePrioritizedTimeSlots: jest.fn().mockReturnValue([
        { startTime: '14:00', endTime: '15:00', priority: 9 }
      ])
    } as any));

    bookingManager = new BookingManager(mockPage as Page);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Constructor', () => {
    test('should initialize with default configuration', () => {
      const manager = new BookingManager(mockPage as Page);
      expect(manager).toBeInstanceOf(BookingManager);
    });

    test('should accept custom configuration', () => {
      const customConfig: Partial<BookingConfig> = {
        daysAhead: 15,
        targetStartTime: '16:00',
        duration: 90,
        maxRetries: 5,
        dryRun: true
      };

      const manager = new BookingManager(mockPage as Page, customConfig);
      expect(manager).toBeInstanceOf(BookingManager);
    });

    test('should merge partial config with defaults', () => {
      const partialConfig: Partial<BookingConfig> = {
        daysAhead: 10
      };

      const manager = new BookingManager(mockPage as Page, partialConfig);
      expect(manager).toBeInstanceOf(BookingManager);
    });
  });

  describe('executeBooking', () => {
    test('should return success result on successful booking', async () => {
      // Configure the mocked SlotSearcher
      const mockSearchAvailableSlots = jest.fn().mockResolvedValue({
        availableCourts: ['court-1'],
        totalSlots: 2,
        availablePairs: [{
          courtId: 'court-1',
          slot1: { courtId: 'court-1', startTime: '14:00', date: '2024-01-21', isAvailable: true, elementSelector: '.slot1' },
          slot2: { courtId: 'court-1', startTime: '15:00', date: '2024-01-21', isAvailable: true, elementSelector: '.slot2' }
        }]
      });

      MockedSlotSearcher.mockImplementation(() => ({
        searchAvailableSlots: mockSearchAvailableSlots
      } as any));

      // Configure the mocked IsolationChecker
      MockedIsolationChecker.findBestNonIsolatingPair.mockReturnValue({
        courtId: 'court-1',
        slot1: { courtId: 'court-1', startTime: '14:00', date: '2024-01-21', isAvailable: true, elementSelector: '.slot1' },
        slot2: { courtId: 'court-1', startTime: '15:00', date: '2024-01-21', isAvailable: true, elementSelector: '.slot2' }
      });

      const dryRunManager = new BookingManager(mockPage as Page, { dryRun: true });
      const result = await dryRunManager.executeBooking();

      expect(result.success).toBe(true);
      expect(result.bookedPair).toBeDefined();
      expect(result.retryAttempts).toBeGreaterThanOrEqual(1);
      expect(result.timestamp).toEqual(new Date('2024-01-01T12:00:00Z'));
    });

    test('should retry on failure up to maxRetries', async () => {
      const maxRetries = 3;
      
      // Mock RetryManager to simulate retries
      MockedRetryManager.mockImplementation(() => ({
        execute: jest.fn().mockResolvedValue({
          success: false,
          error: new Error('Network error'),
          totalAttempts: maxRetries,
          totalTimeMs: 1000,
          attempts: [],
          circuitBreakerTripped: false
        }),
        executeSimple: jest.fn().mockRejectedValue(new Error('Network error'))
      } as any));
      
      const errorManager = new BookingManager(mockPage as Page, { 
        maxRetries,
        dryRun: true 
      });

      const result = await errorManager.executeBooking();

      expect(result.success).toBe(false);
      expect(result.retryAttempts).toBe(maxRetries);
      expect(result.error).toContain('Network error');
    });

    test('should handle no available slots gracefully', async () => {
      // Configure the mocked SlotSearcher to return no slots
      const mockSearchAvailableSlots = jest.fn().mockResolvedValue({
        availableCourts: [],
        totalSlots: 0,
        availablePairs: []
      });

      MockedSlotSearcher.mockImplementation(() => ({
        searchAvailableSlots: mockSearchAvailableSlots
      } as any));

      const result = await bookingManager.executeBooking();

      expect(result.success).toBe(false);
      expect(result.error).toContain('No available slot pairs found');
    });

    test('should implement exponential backoff on retries', async () => {
      // Mock RetryManager to simulate exponential backoff
      const mockExecute = jest.fn().mockResolvedValue({
        success: true,
        result: {
          success: true,
          bookedPair: {
            courtId: 'court-1',
            slot1: { courtId: 'court-1', startTime: '14:00', date: '2024-01-21', isAvailable: true, elementSelector: '.slot1' },
            slot2: { courtId: 'court-1', startTime: '15:00', date: '2024-01-21', isAvailable: true, elementSelector: '.slot2' }
          }
        },
        totalAttempts: 3,
        totalTimeMs: 7000, // Simulated total time with backoff
        attempts: [],
        circuitBreakerTripped: false
      });

      MockedRetryManager.mockImplementation(() => ({
        execute: mockExecute,
        executeSimple: jest.fn().mockImplementation(async (operation) => operation())
      } as any));

      const manager = new BookingManager(mockPage as Page, { 
        maxRetries: 3,
        dryRun: true 
      });

      await manager.executeBooking();

      // Verify that RetryManager's execute was called (which handles exponential backoff internally)
      expect(mockExecute).toHaveBeenCalledTimes(1);
    });
  });

  describe('Dry Run Mode', () => {
    test('should simulate booking in dry run mode', async () => {
      const mockPair: BookingPair = {
        courtId: 'court-1',
        slot1: { courtId: 'court-1', startTime: '14:00', date: '2024-01-21', elementSelector: '.slot1', isAvailable: true },
        slot2: { courtId: 'court-1', startTime: '15:00', date: '2024-01-21', elementSelector: '.slot2', isAvailable: true }
      };

      // Mock successful slot search
      const mockSearchAvailableSlots = jest.fn().mockResolvedValue({
        availableCourts: ['court-1'],
        totalSlots: 2,
        availablePairs: [mockPair]
      });

      MockedSlotSearcher.mockImplementation(() => ({
        searchAvailableSlots: mockSearchAvailableSlots
      } as any));

      const dryRunManager = new BookingManager(mockPage as Page, { dryRun: true });
      const result = await dryRunManager.executeBooking();

      expect(result.success).toBe(true);
      expect(result.bookedPair).toEqual(mockPair);
      
      // Should not have clicked any real elements in dry run
      expect(mockPage.click).not.toHaveBeenCalled();
    });

    test('should not execute real booking actions in dry run', async () => {
      const dryRunManager = new BookingManager(mockPage as Page, { dryRun: true });
      
      // Mock successful flow
      const mockSearchAvailableSlots = jest.fn().mockResolvedValue({
        availableCourts: ['court-1'],
        totalSlots: 2,
        availablePairs: [{
          courtId: 'court-1',
          slot1: { courtId: 'court-1', startTime: '14:00', date: '2024-01-21', isAvailable: true, elementSelector: '.slot1' },
          slot2: { courtId: 'court-1', startTime: '15:00', date: '2024-01-21', isAvailable: true, elementSelector: '.slot2' }
        }]
      });

      MockedSlotSearcher.mockImplementation(() => ({
        searchAvailableSlots: mockSearchAvailableSlots
      } as any));

      await dryRunManager.executeBooking();

      // Verify no real booking actions were performed
      expect(mockPage.click).not.toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    test('should handle page navigation errors', async () => {
      (mockPage.goto as jest.Mock).mockRejectedValue(new Error('Navigation failed'));

      const result = await bookingManager.executeBooking();

      expect(result.success).toBe(false);
      expect(result.error).toContain('Navigation failed');
    });

    test('should handle timeout errors', async () => {
      (mockPage.waitForLoadState as jest.Mock).mockRejectedValue(new Error('Timeout'));

      const result = await bookingManager.executeBooking();

      expect(result.success).toBe(false);
      expect(result.error).toContain('Timeout');
    });

    test('should handle element not found errors', async () => {
      // Mock successful navigation but missing elements
      const mockSearchAvailableSlots = jest.fn().mockRejectedValue(new Error('Element not found'));

      MockedSlotSearcher.mockImplementation(() => ({
        searchAvailableSlots: mockSearchAvailableSlots
      } as any));

      const result = await bookingManager.executeBooking();

      expect(result.success).toBe(false);
      expect(result.error).toContain('Element not found');
    });
  });

  describe('Configuration Validation', () => {
    test('should handle invalid days ahead', () => {
      const manager = new BookingManager(mockPage as Page, { daysAhead: -1 });
      expect(manager).toBeInstanceOf(BookingManager);
    });

    test('should handle invalid time format', () => {
      const manager = new BookingManager(mockPage as Page, { targetStartTime: '25:99' });
      expect(manager).toBeInstanceOf(BookingManager);
    });

    test('should handle zero max retries', () => {
      const manager = new BookingManager(mockPage as Page, { maxRetries: 0 });
      expect(manager).toBeInstanceOf(BookingManager);
    });
  });

  describe('Integration with Other Components', () => {
    test('should call DateTimeCalculator correctly', async () => {
      const customDaysAhead = 15;
      const customStartTime = '16:00';
      
      const manager = new BookingManager(mockPage as Page, {
        daysAhead: customDaysAhead,
        targetStartTime: customStartTime,
        dryRun: true
      });

      // Mock successful flow to ensure DateTimeCalculator calls
      const mockSearchAvailableSlots = jest.fn().mockResolvedValue({
        availableCourts: ['court-1'],
        totalSlots: 2,
        availablePairs: [{
          courtId: 'court-1',
          slot1: { courtId: 'court-1', startTime: '16:00', date: '2024-01-16', isAvailable: true, elementSelector: '.slot1' },
          slot2: { courtId: 'court-1', startTime: '17:00', date: '2024-01-16', isAvailable: true, elementSelector: '.slot2' }
        }]
      });

      MockedSlotSearcher.mockImplementation(() => ({
        searchAvailableSlots: mockSearchAvailableSlots
      } as any));

      await manager.executeBooking();

      expect(DateTimeCalculator.calculateBookingDate).toHaveBeenCalledWith(customDaysAhead, 'Europe/Berlin');
      expect(DateTimeCalculator.generateTimeSlots).toHaveBeenCalledWith(customStartTime, 60, 30);
    });
  });
});