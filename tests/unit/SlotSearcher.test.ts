import { jest } from '@jest/globals';
import { SlotSearcher } from '../../src/core/SlotSearcher';
import type { Page } from '@playwright/test';

// Mock dependencies
jest.mock('../../src/utils/logger');

describe('SlotSearcher', () => {
  let mockPage: Partial<Page>;
  let slotSearcher: SlotSearcher;

  beforeEach(() => {
    // Create comprehensive mock page object
    mockPage = {
      $: jest.fn().mockResolvedValue(null),
      $$: jest.fn().mockResolvedValue([]),
      waitForSelector: jest.fn().mockResolvedValue(null),
      waitForTimeout: jest.fn().mockResolvedValue(undefined),
      evaluate: jest.fn().mockResolvedValue({}),
      locator: jest.fn().mockReturnValue({
        count: jest.fn().mockResolvedValue(0),
        all: jest.fn().mockResolvedValue([]),
        getAttribute: jest.fn().mockResolvedValue(null),
        textContent: jest.fn().mockResolvedValue(''),
        isVisible: jest.fn().mockResolvedValue(false),
      }),
      screenshot: jest.fn().mockResolvedValue(Buffer.from('')),
      url: jest.fn().mockReturnValue('https://www.eversports.de/test'),
    };

    const targetDate = '2024-01-21';
    const timeSlots = ['14:00', '15:00'];

    slotSearcher = new SlotSearcher(mockPage as Page, targetDate, timeSlots);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Constructor', () => {
    test('should initialize with required parameters', () => {
      const targetDate = '2024-01-21';
      const timeSlots = ['14:00', '15:00'];

      const searcher = new SlotSearcher(mockPage as Page, targetDate, timeSlots);
      expect(searcher).toBeInstanceOf(SlotSearcher);
    });

    test('should accept empty time slots array', () => {
      const targetDate = '2024-01-21';
      const timeSlots: string[] = [];

      const searcher = new SlotSearcher(mockPage as Page, targetDate, timeSlots);
      expect(searcher).toBeInstanceOf(SlotSearcher);
    });
  });

  describe('searchAvailableSlots', () => {
    test('should return empty array when no slots found', async () => {
      // Mock page with no slot elements
      (mockPage.$$ as jest.Mock).mockResolvedValue([]);

      const result = await slotSearcher.searchAvailableSlots();

      expect(result.availablePairs).toEqual([]);
      expect(result.searchedCourts).toEqual([]);
    });

    test('should find available slots on multiple courts', async () => {
      // Mock slot elements
      const mockSlotElements = [
        {
          getAttribute: jest
            .fn()
            .mockResolvedValueOnce('court-1') // courtId
            .mockResolvedValueOnce('14:00') // startTime
            .mockResolvedValueOnce('2024-01-21'), // date
          textContent: jest.fn().mockResolvedValue('14:00'),
          isVisible: jest.fn().mockResolvedValue(true),
        },
        {
          getAttribute: jest
            .fn()
            .mockResolvedValueOnce('court-1') // courtId
            .mockResolvedValueOnce('15:00') // startTime
            .mockResolvedValueOnce('2024-01-21'), // date
          textContent: jest.fn().mockResolvedValue('15:00'),
          isVisible: jest.fn().mockResolvedValue(true),
        },
        {
          getAttribute: jest
            .fn()
            .mockResolvedValueOnce('court-2') // courtId
            .mockResolvedValueOnce('14:00') // startTime
            .mockResolvedValueOnce('2024-01-21'), // date
          textContent: jest.fn().mockResolvedValue('14:00'),
          isVisible: jest.fn().mockResolvedValue(true),
        },
      ];

      (mockPage.$$ as jest.Mock).mockResolvedValue(mockSlotElements);

      const result = await slotSearcher.searchAvailableSlots();

      expect(result.availablePairs).toHaveLength(1); // Only court-1 has both 14:00 and 15:00
      expect(result.availablePairs[0].courtId).toBe('court-1');
      expect(result.availablePairs[0].slot1.startTime).toBe('14:00');
      expect(result.availablePairs[0].slot2.startTime).toBe('15:00');
    });

    test('should handle different slot selector strategies', async () => {
      // Test multiple selector attempts
      const _selectors = [
        '.time-slot.available',
        '.slot.bookable',
        '[data-testid^="slot"]',
        '.calendar-slot',
        '[class*="available"][class*="slot"]',
      ];

      // Mock first selector fails, second succeeds
      (mockPage.$$ as jest.Mock)
        .mockResolvedValueOnce([]) // First selector finds nothing
        .mockResolvedValueOnce([
          // Second selector finds slots
          {
            getAttribute: jest
              .fn()
              .mockResolvedValueOnce('court-1')
              .mockResolvedValueOnce('14:00')
              .mockResolvedValueOnce('2024-01-21'),
            textContent: jest.fn().mockResolvedValue('14:00'),
            isVisible: jest.fn().mockResolvedValue(true),
          },
        ]);

      const result = await slotSearcher.searchAvailableSlots();

      // Should have tried multiple selectors
      expect(mockPage.$$).toHaveBeenCalledTimes(2);
      expect(result.searchedCourts).toBeDefined();
    });

    test('should filter out invisible slots', async () => {
      const mockSlotElements = [
        {
          getAttribute: jest
            .fn()
            .mockResolvedValueOnce('court-1')
            .mockResolvedValueOnce('14:00')
            .mockResolvedValueOnce('2024-01-21'),
          textContent: jest.fn().mockResolvedValue('14:00'),
          isVisible: jest.fn().mockResolvedValue(false), // Not visible
        },
        {
          getAttribute: jest
            .fn()
            .mockResolvedValueOnce('court-1')
            .mockResolvedValueOnce('15:00')
            .mockResolvedValueOnce('2024-01-21'),
          textContent: jest.fn().mockResolvedValue('15:00'),
          isVisible: jest.fn().mockResolvedValue(true), // Visible
        },
      ];

      (mockPage.$$ as jest.Mock).mockResolvedValue(mockSlotElements);

      const result = await slotSearcher.searchAvailableSlots();

      // Should only include visible slots
      expect(result.availablePairs).toHaveLength(0); // No pairs since only one visible slot
    });

    test('should handle missing attributes gracefully', async () => {
      const mockSlotElements = [
        {
          getAttribute: jest
            .fn()
            .mockResolvedValueOnce(null) // Missing courtId
            .mockResolvedValueOnce('14:00')
            .mockResolvedValueOnce('2024-01-21'),
          textContent: jest.fn().mockResolvedValue('14:00'),
          isVisible: jest.fn().mockResolvedValue(true),
        },
        {
          getAttribute: jest
            .fn()
            .mockResolvedValueOnce('court-1')
            .mockResolvedValueOnce(null) // Missing startTime
            .mockResolvedValueOnce('2024-01-21'),
          textContent: jest.fn().mockResolvedValue(''),
          isVisible: jest.fn().mockResolvedValue(true),
        },
      ];

      (mockPage.$$ as jest.Mock).mockResolvedValue(mockSlotElements);

      const result = await slotSearcher.searchAvailableSlots();

      // Should handle missing attributes without crashing
      expect(result).toBeDefined();
      expect(result.availablePairs).toEqual([]);
    });

    test('should extract time from text content when attribute missing', async () => {
      const mockSlotElements = [
        {
          getAttribute: jest
            .fn()
            .mockResolvedValueOnce('court-1')
            .mockResolvedValueOnce(null) // No time attribute
            .mockResolvedValueOnce('2024-01-21'),
          textContent: jest.fn().mockResolvedValue('14:00 - Available'), // Time in text
          isVisible: jest.fn().mockResolvedValue(true),
        },
        {
          getAttribute: jest
            .fn()
            .mockResolvedValueOnce('court-1')
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce('2024-01-21'),
          textContent: jest.fn().mockResolvedValue('15:00 - Available'),
          isVisible: jest.fn().mockResolvedValue(true),
        },
      ];

      (mockPage.$$ as jest.Mock).mockResolvedValue(mockSlotElements);

      const result = await slotSearcher.searchAvailableSlots();

      expect(result.availablePairs).toHaveLength(1);
      expect(result.availablePairs[0].slot1.startTime).toBe('14:00');
      expect(result.availablePairs[0].slot2.startTime).toBe('15:00');
    });

    test('should handle court identification from various sources', async () => {
      const mockSlotElements = [
        {
          getAttribute: jest.fn().mockImplementation(attr => {
            switch (attr) {
              case 'data-court-id':
                return 'court-1';
              case 'data-time':
                return '14:00';
              case 'data-date':
                return '2024-01-21';
              case 'data-court':
                return null;
              case 'court-id':
                return null;
              default:
                return null;
            }
          }),
          textContent: jest.fn().mockResolvedValue('14:00'),
          isVisible: jest.fn().mockResolvedValue(true),
          closest: jest.fn().mockReturnValue({
            getAttribute: jest.fn().mockReturnValue('court-1'),
          }),
        },
      ];

      (mockPage.$$ as jest.Mock).mockResolvedValue(mockSlotElements);

      const result = await slotSearcher.searchAvailableSlots();

      expect(result).toBeDefined();
      // Should find court ID from data-court-id attribute
    });
  });

  describe('Error Handling', () => {
    test('should handle page evaluation errors', async () => {
      (mockPage.$$ as jest.Mock).mockRejectedValue(new Error('Page evaluation failed'));

      const result = await slotSearcher.searchAvailableSlots();

      expect(result.availablePairs).toEqual([]);
      expect(result.searchedCourts).toEqual([]);
    });

    test('should handle element attribute errors', async () => {
      const mockSlotElements = [
        {
          getAttribute: jest.fn().mockRejectedValue(new Error('Attribute access failed')),
          textContent: jest.fn().mockResolvedValue('14:00'),
          isVisible: jest.fn().mockResolvedValue(true),
        },
      ];

      (mockPage.$$ as jest.Mock).mockResolvedValue(mockSlotElements);

      const result = await slotSearcher.searchAvailableSlots();

      // Should handle errors gracefully
      expect(result).toBeDefined();
      expect(result.availablePairs).toEqual([]);
    });

    test('should handle timeout during element discovery', async () => {
      (mockPage.waitForSelector as jest.Mock).mockRejectedValue(new Error('Timeout'));

      const result = await slotSearcher.searchAvailableSlots();

      expect(result).toBeDefined();
      expect(result.availablePairs).toEqual([]);
    });
  });

  describe('Slot Pairing Logic', () => {
    test('should create pairs from consecutive time slots', async () => {
      const targetDate = '2024-01-21';
      const timeSlots = ['14:00', '15:00', '16:00']; // Three consecutive slots

      const searcher = new SlotSearcher(mockPage as Page, targetDate, timeSlots);

      const mockSlotElements = [
        {
          getAttribute: jest
            .fn()
            .mockResolvedValueOnce('court-1')
            .mockResolvedValueOnce('14:00')
            .mockResolvedValueOnce('2024-01-21'),
          textContent: jest.fn().mockResolvedValue('14:00'),
          isVisible: jest.fn().mockResolvedValue(true),
        },
        {
          getAttribute: jest
            .fn()
            .mockResolvedValueOnce('court-1')
            .mockResolvedValueOnce('15:00')
            .mockResolvedValueOnce('2024-01-21'),
          textContent: jest.fn().mockResolvedValue('15:00'),
          isVisible: jest.fn().mockResolvedValue(true),
        },
        {
          getAttribute: jest
            .fn()
            .mockResolvedValueOnce('court-1')
            .mockResolvedValueOnce('16:00')
            .mockResolvedValueOnce('2024-01-21'),
          textContent: jest.fn().mockResolvedValue('16:00'),
          isVisible: jest.fn().mockResolvedValue(true),
        },
      ];

      (mockPage.$$ as jest.Mock).mockResolvedValue(mockSlotElements);

      const result = await searcher.searchAvailableSlots();

      // Should create pairs for consecutive slots
      expect(result.availablePairs).toHaveLength(2);

      // First pair: 14:00-15:00
      expect(result.availablePairs[0].slot1.startTime).toBe('14:00');
      expect(result.availablePairs[0].slot2.startTime).toBe('15:00');

      // Second pair: 15:00-16:00
      expect(result.availablePairs[1].slot1.startTime).toBe('15:00');
      expect(result.availablePairs[1].slot2.startTime).toBe('16:00');
    });

    test('should not create pairs for non-consecutive time slots', async () => {
      const mockSlotElements = [
        {
          getAttribute: jest
            .fn()
            .mockResolvedValueOnce('court-1')
            .mockResolvedValueOnce('14:00')
            .mockResolvedValueOnce('2024-01-21'),
          textContent: jest.fn().mockResolvedValue('14:00'),
          isVisible: jest.fn().mockResolvedValue(true),
        },
        {
          getAttribute: jest
            .fn()
            .mockResolvedValueOnce('court-1')
            .mockResolvedValueOnce('16:00') // Gap: missing 15:00
            .mockResolvedValueOnce('2024-01-21'),
          textContent: jest.fn().mockResolvedValue('16:00'),
          isVisible: jest.fn().mockResolvedValue(true),
        },
      ];

      (mockPage.$$ as jest.Mock).mockResolvedValue(mockSlotElements);

      const result = await slotSearcher.searchAvailableSlots();

      // Should not create pair due to gap
      expect(result.availablePairs).toHaveLength(0);
    });

    test('should group slots by court correctly', async () => {
      const mockSlotElements = [
        // Court 1 slots
        {
          getAttribute: jest
            .fn()
            .mockResolvedValueOnce('court-1')
            .mockResolvedValueOnce('14:00')
            .mockResolvedValueOnce('2024-01-21'),
          textContent: jest.fn().mockResolvedValue('14:00'),
          isVisible: jest.fn().mockResolvedValue(true),
        },
        {
          getAttribute: jest
            .fn()
            .mockResolvedValueOnce('court-2') // Different court
            .mockResolvedValueOnce('14:00')
            .mockResolvedValueOnce('2024-01-21'),
          textContent: jest.fn().mockResolvedValue('14:00'),
          isVisible: jest.fn().mockResolvedValue(true),
        },
        {
          getAttribute: jest
            .fn()
            .mockResolvedValueOnce('court-1') // Back to court 1
            .mockResolvedValueOnce('15:00')
            .mockResolvedValueOnce('2024-01-21'),
          textContent: jest.fn().mockResolvedValue('15:00'),
          isVisible: jest.fn().mockResolvedValue(true),
        },
      ];

      (mockPage.$$ as jest.Mock).mockResolvedValue(mockSlotElements);

      const result = await slotSearcher.searchAvailableSlots();

      // Should create one pair for court-1 (14:00-15:00)
      // Court-2 only has one slot, so no pair
      expect(result.availablePairs).toHaveLength(1);
      expect(result.availablePairs[0].courtId).toBe('court-1');
      expect(result.searchedCourts).toContain('court-1');
      expect(result.searchedCourts).toContain('court-2');
    });
  });

  describe('Performance', () => {
    test('should handle large number of slots efficiently', async () => {
      // Create mock for 100 slots across 10 courts
      const mockSlotElements = [];
      for (let court = 1; court <= 10; court++) {
        for (let hour = 8; hour < 18; hour++) {
          mockSlotElements.push({
            getAttribute: jest
              .fn()
              .mockResolvedValueOnce(`court-${court}`)
              .mockResolvedValueOnce(`${hour}:00`)
              .mockResolvedValueOnce('2024-01-21'),
            textContent: jest.fn().mockResolvedValue(`${hour}:00`),
            isVisible: jest.fn().mockResolvedValue(true),
          });
        }
      }

      (mockPage.$$ as jest.Mock).mockResolvedValue(mockSlotElements);

      const startTime = Date.now();
      const result = await slotSearcher.searchAvailableSlots();
      const endTime = Date.now();

      // Should complete within reasonable time (5 seconds)
      expect(endTime - startTime).toBeLessThan(5000);

      // Should find pairs for all courts
      expect(result.availablePairs.length).toBeGreaterThan(0);
      expect(result.searchedCourts).toHaveLength(10);
    });
  });
});
