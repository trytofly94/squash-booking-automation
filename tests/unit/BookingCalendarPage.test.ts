import { BookingCalendarPage } from '../../src/pages/BookingCalendarPage';
import { Page } from '@playwright/test';

describe('BookingCalendarPage - Date Navigation', () => {
  let mockPage: jest.Mocked<Page>;
  let calendarPage: BookingCalendarPage;

  beforeEach(() => {
    // Create a mock Page object
    mockPage = {
      url: jest.fn(),
      goto: jest.fn(),
      locator: jest.fn(),
      $: jest.fn(),
      $$: jest.fn(),
      waitForTimeout: jest.fn(),
      keyboard: {
        press: jest.fn(),
      },
      inputValue: jest.fn(),
      textContent: jest.fn(),
      evaluate: jest.fn(),
    } as any;

    // Mock locator methods
    const mockLocator = {
      clear: jest.fn(),
      fill: jest.fn(),
      waitFor: jest.fn(),
    };

    mockPage.locator.mockReturnValue(mockLocator as any);

    calendarPage = new BookingCalendarPage(mockPage);
  });

  describe('navigateToDate', () => {
    it('should try direct date input first', async () => {
      const targetDate = '2025-09-08';
      
      // Mock the internal tryDirectDateInput method to return true (success)
      // This prevents the method from falling back to other navigation methods
      jest.spyOn(calendarPage as any, 'tryDirectDateInput').mockResolvedValue(true);
      jest.spyOn(calendarPage as any, 'waitForCalendarToLoad').mockResolvedValue(undefined);

      await calendarPage.navigateToDate(targetDate);

      // Verify that tryDirectDateInput was called with the correct target date
      expect(calendarPage['tryDirectDateInput']).toHaveBeenCalledWith(targetDate);
    });

    it('should fallback to URL navigation if direct input fails', async () => {
      const targetDate = '2025-09-08';
      
      // Mock direct input failure
      jest.spyOn(calendarPage as any, 'tryDirectDateInput').mockResolvedValue(false);
      
      // Mock URL navigation method dependencies rather than the method itself
      jest.spyOn(calendarPage as any, 'getCurrentSelectedDate').mockResolvedValue(targetDate);
      jest.spyOn(calendarPage as any, 'waitForCalendarToLoad').mockResolvedValue(undefined);
      
      // Mock page.url() to return a base URL
      mockPage.url.mockReturnValue('https://example.com/booking');
      
      await calendarPage.navigateToDate(targetDate);

      expect(mockPage.goto).toHaveBeenCalledWith(
        expect.stringContaining('date=2025-09-08'),
        expect.any(Object)
      );
    });

    it('should fallback to click navigation if other methods fail', async () => {
      const targetDate = '2025-09-08';
      
      // Mock all advanced methods failing
      jest.spyOn(calendarPage as any, 'tryDirectDateInput').mockResolvedValue(false);
      jest.spyOn(calendarPage as any, 'tryUrlDateNavigation').mockResolvedValue(false);
      jest.spyOn(calendarPage as any, 'navigateToDateByClicking').mockResolvedValue(undefined);
      
      await calendarPage.navigateToDate(targetDate);

      expect(calendarPage['navigateToDateByClicking']).toHaveBeenCalledWith(targetDate);
    });
  });

  describe('getCurrentSelectedDate', () => {
    it('should extract date from input field', async () => {
      const expectedDate = '2025-09-08';
      
      jest.spyOn(calendarPage as any, 'elementExists').mockResolvedValue(true);
      mockPage.inputValue.mockResolvedValue(expectedDate);

      const result = await calendarPage.getCurrentSelectedDate();

      expect(result).toBe(expectedDate);
    });

    it('should extract date from URL parameters', async () => {
      const expectedDate = '2025-09-08';
      
      jest.spyOn(calendarPage as any, 'elementExists').mockResolvedValue(false);
      mockPage.url.mockReturnValue(`https://example.com?date=${expectedDate}&view=calendar`);

      const result = await calendarPage.getCurrentSelectedDate();

      expect(result).toBe(expectedDate);
    });

    it('should return current date as fallback', async () => {
      const today = new Date().toISOString().split('T')[0]!;
      
      jest.spyOn(calendarPage as any, 'elementExists').mockResolvedValue(false);
      mockPage.url.mockReturnValue('https://example.com');
      jest.spyOn(calendarPage as any, 'getPageTitle').mockResolvedValue('Calendar');

      const result = await calendarPage.getCurrentSelectedDate();

      expect(result).toBe(today);
    });
  });

  describe('findTimeSlot - Eversports specific', () => {
    it('should find slot using Eversports data attributes', async () => {
      const courtId = '1';
      const time = '14:00';
      const targetDate = '2025-09-08';
      
      const mockElement = {
        getAttribute: jest.fn((attr: string) => {
          switch (attr) {
            case 'data-date': return targetDate;
            case 'data-start': return '1400';
            case 'data-court': return courtId;
            case 'data-state': return 'free';
            default: return null;
          }
        })
      };

      mockPage.$$.mockResolvedValue([mockElement] as any);
      jest.spyOn(calendarPage as any, 'isSlotAvailable').mockResolvedValue(true);
      jest.spyOn(calendarPage as any, 'getSlotSelector').mockResolvedValue(
        `td[data-date='${targetDate}'][data-start='1400'][data-court='${courtId}'][data-state='free']`
      );

      const result = await calendarPage.findTimeSlot(courtId, time, targetDate);

      expect(result).toEqual({
        date: targetDate,
        startTime: time,
        courtId: courtId,
        isAvailable: true,
        elementSelector: `td[data-date='${targetDate}'][data-start='1400'][data-court='${courtId}'][data-state='free']`,
      });
    });

    it('should handle time format conversion (14:00 to 1400)', async () => {
      const courtId = '1';
      const time = '14:00';
      const targetDate = '2025-09-08';
      
      mockPage.$$.mockImplementation((selector: string) => {
        if (selector.includes('data-start=\'1400\'')) {
          return Promise.resolve([{ getAttribute: jest.fn() }] as any);
        }
        return Promise.resolve([] as any);
      });

      jest.spyOn(calendarPage as any, 'isSlotAvailable').mockResolvedValue(true);
      jest.spyOn(calendarPage as any, 'getSlotSelector').mockResolvedValue('mock-selector');

      await calendarPage.findTimeSlot(courtId, time, targetDate);

      expect(mockPage.$$).toHaveBeenCalledWith(
        expect.stringContaining('data-start=\'1400\'')
      );
    });
  });

  describe('navigateToDateByClicking - Weekly navigation', () => {
    it('should calculate weeks correctly for 20 days ahead', async () => {
      const today = new Date();
      const targetDate = new Date(today);
      targetDate.setDate(today.getDate() + 20);
      const targetDateString = targetDate.toISOString().split('T')[0]!;

      jest.spyOn(calendarPage as any, 'clickNextWeek').mockResolvedValue(undefined);
      jest.spyOn(calendarPage as any, 'waitForCalendarToLoad').mockResolvedValue(undefined);
      jest.spyOn(calendarPage, 'getCurrentSelectedDate')
        .mockResolvedValueOnce('2025-08-19') // First check
        .mockResolvedValueOnce('2025-08-26') // After first click
        .mockResolvedValueOnce('2025-09-02') // After second click
        .mockResolvedValueOnce(targetDateString); // Final check

      await calendarPage['navigateToDateByClicking'](targetDateString);

      // Should click next week button multiple times (approximately 3 times for 20 days)
      expect(calendarPage['clickNextWeek']).toHaveBeenCalledTimes(3);
    });
  });

  describe('isSlotAvailable - Eversports specific', () => {
    it('should return true for data-state="free"', async () => {
      const mockElement = {
        getAttribute: jest.fn((attr: string) => {
          if (attr === 'data-state') return 'free';
          return null;
        })
      };

      const result = await calendarPage['isSlotAvailable'](mockElement);

      expect(result).toBe(true);
    });

    it('should return false for data-state="booked"', async () => {
      const mockElement = {
        getAttribute: jest.fn((attr: string) => {
          if (attr === 'data-state') return 'booked';
          return null;
        })
      };

      const result = await calendarPage['isSlotAvailable'](mockElement);

      expect(result).toBe(false);
    });

    it('should check class names as fallback', async () => {
      const mockElement = {
        getAttribute: jest.fn((attr: string) => {
          if (attr === 'class') return 'available slot';
          return null;
        })
      };

      const result = await calendarPage['isSlotAvailable'](mockElement);

      expect(result).toBe(true);
    });
  });

  describe('getSlotSelector - Eversports specific', () => {
    it('should generate Eversports-specific selector', async () => {
      const mockElement = {
        getAttribute: jest.fn((attr: string) => {
          switch (attr) {
            case 'data-date': return '2025-09-08';
            case 'data-start': return '1400';
            case 'data-court': return '1';
            case 'data-state': return 'free';
            default: return null;
          }
        }),
        evaluate: jest.fn()
      };

      const result = await calendarPage['getSlotSelector'](mockElement);

      expect(result).toBe("td[data-date='2025-09-08'][data-start='1400'][data-court='1'][data-state='free']");
    });

    it('should handle missing court attribute', async () => {
      const mockElement = {
        getAttribute: jest.fn((attr: string) => {
          switch (attr) {
            case 'data-date': return '2025-09-08';
            case 'data-start': return '1400';
            case 'data-state': return 'free';
            default: return null;
          }
        }),
        evaluate: jest.fn()
      };

      const result = await calendarPage['getSlotSelector'](mockElement);

      expect(result).toBe("td[data-date='2025-09-08'][data-start='1400'][data-state='free']");
    });
  });
});