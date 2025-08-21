import { BookingManager } from '../../src/core/BookingManager';
import { DateTimeCalculator } from '../../src/core/DateTimeCalculator';
import { SlotSearcher } from '../../src/core/SlotSearcher';
import { IsolationChecker } from '../../src/core/IsolationChecker';
import type { Page } from '@playwright/test';
import type { BookingConfig, BookingPair } from '../../src/types/booking.types';

// Mock dependencies
jest.mock('../../src/utils/logger');
jest.mock('../../src/core/DateTimeCalculator');
jest.mock('../../src/core/SlotSearcher');
jest.mock('../../src/core/IsolationChecker');

// Get mocked constructors
const MockedSlotSearcher = SlotSearcher as jest.MockedClass<typeof SlotSearcher>;
const MockedIsolationChecker = IsolationChecker as unknown as jest.Mocked<typeof IsolationChecker>;

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
    (DateTimeCalculator.getCurrentTimestamp as jest.Mock).mockReturnValue('2024-01-01 12:00:00');
    (DateTimeCalculator.calculateBookingDate as jest.Mock).mockReturnValue('2024-01-21');
    (DateTimeCalculator.generateTimeSlots as jest.Mock).mockReturnValue(['14:00', '15:00']);

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
      expect(result.timestamp).toBe('2024-01-01 12:00:00');
    });

    test('should retry on failure up to maxRetries', async () => {
      const maxRetries = 3;
      const errorManager = new BookingManager(mockPage as Page, { 
        maxRetries,
        dryRun: true 
      });

      // Mock page.goto to throw error
      (mockPage.goto as jest.Mock).mockRejectedValue(new Error('Network error'));

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
      const manager = new BookingManager(mockPage as Page, { 
        maxRetries: 3,
        dryRun: true 
      });

      // Mock to fail first two attempts
      let attemptCount = 0;
      (mockPage.goto as jest.Mock).mockImplementation(() => {
        attemptCount++;
        if (attemptCount <= 2) {
          throw new Error('Temporary failure');
        }
        return Promise.resolve();
      });

      await manager.executeBooking();

      // Should have called waitForTimeout with exponential backoff values
      expect(mockPage.waitForTimeout).toHaveBeenCalledTimes(2); // Two retries
      expect(mockPage.waitForTimeout).toHaveBeenCalledWith(2000); // First retry: 2s
      expect(mockPage.waitForTimeout).toHaveBeenCalledWith(4000); // Second retry: 4s
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

      expect(DateTimeCalculator.calculateBookingDate).toHaveBeenCalledWith(customDaysAhead);
      expect(DateTimeCalculator.generateTimeSlots).toHaveBeenCalledWith(customStartTime);
    });
  });
});