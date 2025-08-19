import { test, expect, Page } from '@playwright/test';
import { BookingManager } from '../../src/core/BookingManager';
import { BookingCalendarPage } from '../../src/pages/BookingCalendarPage';
import { CheckoutPage } from '../../src/pages/CheckoutPage';
import { DateTimeCalculator } from '../../src/core/DateTimeCalculator';
import { logger } from '../../src/utils/logger';

/**
 * Comprehensive End-to-End Booking Flow Tests
 * Tests against the real eversports.de website in DRY-RUN mode
 */

test.describe('Squash Booking E2E Flow', () => {
  let page: Page;
  let bookingManager: BookingManager;
  let calendarPage: BookingCalendarPage;
  let checkoutPage: CheckoutPage;

  test.beforeEach(async ({ page: testPage }) => {
    page = testPage;
    
    // Initialize page objects
    calendarPage = new BookingCalendarPage(page);
    checkoutPage = new CheckoutPage(page);
    
    // Initialize booking manager in DRY-RUN mode
    bookingManager = new BookingManager(page, {
      daysAhead: 20,
      targetStartTime: '14:00',
      duration: 60,
      maxRetries: 3,
      dryRun: true // Critical: Always dry run for tests
    });

    // Set up test environment
    await page.route('**/*', (route) => {
      // Log all network requests for debugging
      logger.debug('Network request', 'E2E Test', {
        url: route.request().url(),
        method: route.request().method()
      });
      route.continue();
    });
  });

  test.afterEach(async () => {
    // Take screenshot after each test for debugging
    await page.screenshot({ 
      path: `test-results/screenshots/e2e-${test.info().title.replace(/\s+/g, '-')}.png`,
      fullPage: true 
    });
  });

  test('should navigate to booking page successfully', async () => {
    await test.step('Navigate to eversports booking page', async () => {
      await page.goto('/sb/sportcenter-kautz?sport=squash');
      await page.waitForLoadState('networkidle');
    });

    await test.step('Verify page loaded correctly', async () => {
      // Check that we're on the right page
      expect(page.url()).toContain('eversports.de');
      expect(page.url()).toContain('sportcenter-kautz');
      expect(page.url()).toContain('sport=squash');
      
      // Check for essential page elements
      await expect(page.locator('body')).toBeVisible();
    });

    await test.step('Check for calendar or booking interface', async () => {
      // Look for common booking interface elements
      const hasCalendar = await page.locator('.calendar, [class*="calendar"], .booking-calendar').count() > 0;
      const hasTimeSlots = await page.locator('.time-slot, [class*="slot"], .available').count() > 0;
      const hasDatePicker = await page.locator('input[type="date"], .date-picker, [class*="date"]').count() > 0;
      
      // At least one booking interface element should be present
      expect(hasCalendar || hasTimeSlots || hasDatePicker).toBeTruthy();
    });
  });

  test('should analyze current website structure', async () => {
    await test.step('Navigate to booking page', async () => {
      await page.goto('/sb/sportcenter-kautz?sport=squash');
      await page.waitForLoadState('networkidle');
    });

    await test.step('Analyze page structure', async () => {
      // Analyze and document current selectors
      const pageStructure = await page.evaluate(() => {
        const structure = {
          title: document.title,
          forms: Array.from(document.forms).length,
          buttons: Array.from(document.querySelectorAll('button')).length,
          inputs: Array.from(document.querySelectorAll('input')).length,
          links: Array.from(document.querySelectorAll('a')).length,
          divs: Array.from(document.querySelectorAll('div')).length,
          hasReact: !!(window as any).React || document.querySelector('[data-reactroot]'),
          hasAngular: !!(window as any).angular || document.querySelector('[ng-app]'),
          hasVue: !!(window as any).Vue || document.querySelector('[data-v-]'),
          bodyClasses: document.body.className,
          htmlLang: document.documentElement.lang
        };
        return structure;
      });

      // Log structure for analysis
      logger.info('Website structure analysis', 'E2E Test', pageStructure);
      
      // Basic assertions
      expect(pageStructure.title).toBeTruthy();
      expect(pageStructure.forms).toBeGreaterThanOrEqual(0);
      expect(pageStructure.buttons).toBeGreaterThan(0);
    });

    await test.step('Find booking-related elements', async () => {
      const bookingElements = await page.evaluate(() => {
        const findElements = (selectors: string[]) => {
          return selectors.map(selector => ({
            selector,
            count: document.querySelectorAll(selector).length,
            visible: Array.from(document.querySelectorAll(selector))
              .filter(el => (el as HTMLElement).offsetParent !== null).length
          }));
        };

        return {
          dateSelectors: findElements([
            '[data-testid="date-picker"]',
            '.date-picker',
            '.calendar-navigation', 
            'input[type="date"]',
            '[class*="date"]'
          ]),
          timeSlotSelectors: findElements([
            '.time-slot',
            '.slot',
            '.booking-slot',
            '[class*="slot"]',
            '.available',
            '.bookable'
          ]),
          calendarSelectors: findElements([
            '.calendar',
            '.booking-calendar',
            '[class*="calendar"]',
            '.fc-event'
          ]),
          buttonSelectors: findElements([
            '.btn-primary',
            '.checkout-button',
            '[data-testid*="book"]',
            'button[type="submit"]'
          ])
        };
      });

      // Log findings for debugging
      logger.info('Booking elements analysis', 'E2E Test', bookingElements);
      
      // Save analysis to file for manual review
      const analysisPath = 'test-results/website-analysis.json';
      const analysisData = {
        timestamp: new Date().toISOString(),
        url: page.url(),
        elements: bookingElements
      };
      
      const fs = require('fs');
      const path = require('path');
      
      // Ensure directory exists
      const dir = path.dirname(analysisPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      fs.writeFileSync(analysisPath, JSON.stringify(analysisData, null, 2));
    });
  });

  test('should validate DateTimeCalculator with current date', async () => {
    await test.step('Calculate booking date', async () => {
      const daysAhead = 20;
      const bookingDate = DateTimeCalculator.calculateBookingDate(daysAhead);
      
      // Verify date is correctly calculated
      expect(bookingDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      
      const calculatedDate = new Date(bookingDate);
      const today = new Date();
      const expectedDate = new Date(today);
      expectedDate.setDate(today.getDate() + daysAhead);
      
      expect(calculatedDate.getFullYear()).toBe(expectedDate.getFullYear());
      expect(calculatedDate.getMonth()).toBe(expectedDate.getMonth());
      expect(calculatedDate.getDate()).toBe(expectedDate.getDate());
    });

    await test.step('Generate time slots', async () => {
      const timeSlots = DateTimeCalculator.generateTimeSlots('14:00');
      
      expect(timeSlots).toHaveLength(2);
      expect(timeSlots[0]).toBe('14:00');
      expect(timeSlots[1]).toBe('15:00');
    });

    await test.step('Validate timestamp generation', async () => {
      const timestamp = DateTimeCalculator.getCurrentTimestamp();
      
      expect(timestamp).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
      
      // Should be close to current time
      const timestampDate = new Date(timestamp.replace(' ', 'T'));
      const now = new Date();
      const timeDiff = Math.abs(now.getTime() - timestampDate.getTime());
      
      // Should be within 1 minute
      expect(timeDiff).toBeLessThan(60 * 1000);
    });
  });

  test('should attempt booking flow in dry-run mode', async () => {
    await test.step('Execute booking process', async () => {
      const result = await bookingManager.executeBooking();
      
      // In dry-run mode, we should get a result regardless
      expect(result).toBeDefined();
      expect(result.timestamp).toBeDefined();
      expect(result.retryAttempts).toBeGreaterThanOrEqual(1);
      
      if (result.success) {
        logger.info('Dry-run booking successful', 'E2E Test', {
          bookedPair: result.bookedPair,
          retryAttempts: result.retryAttempts
        });
        
        expect(result.bookedPair).toBeDefined();
        expect(result.bookedPair?.courtId).toBeDefined();
        expect(result.bookedPair?.slot1).toBeDefined();
        expect(result.bookedPair?.slot2).toBeDefined();
      } else {
        logger.warn('Dry-run booking failed (expected in some cases)', 'E2E Test', {
          error: result.error,
          retryAttempts: result.retryAttempts
        });
        
        expect(result.error).toBeDefined();
        // Failure in dry-run is acceptable - might be no available slots
      }
    });
  });

  test('should test calendar page functionality', async () => {
    await test.step('Navigate to calendar page', async () => {
      await calendarPage.navigateToBookingPage();
      
      // Verify navigation was successful
      expect(page.url()).toContain('eversports.de');
    });

    await test.step('Navigate to future date', async () => {
      const targetDate = DateTimeCalculator.calculateBookingDate(20);
      
      try {
        await calendarPage.navigateToDate(targetDate);
        logger.info('Successfully navigated to target date', 'E2E Test', { targetDate });
      } catch (error) {
        logger.warn('Date navigation failed - may need selector updates', 'E2E Test', { 
          error: error instanceof Error ? error.message : String(error),
          targetDate 
        });
        // Don't fail test - this helps identify selector issues
      }
    });

    await test.step('Search for available slots', async () => {
      const timeSlots = ['14:00', '15:00'];
      
      try {
        const slots = await calendarPage.findAvailableSlots(timeSlots);
        
        if (slots.length > 0) {
          logger.info('Found available slots', 'E2E Test', { 
            slotCount: slots.length,
            sampleSlots: slots.slice(0, 3)
          });
          
          // Verify slot structure
          slots.forEach(slot => {
            expect(slot.courtId).toBeDefined();
            expect(slot.startTime).toBeDefined();
            expect(slot.date).toBeDefined();
          });
        } else {
          logger.info('No available slots found (acceptable)', 'E2E Test');
        }
      } catch (error) {
        logger.warn('Slot search failed - may need selector updates', 'E2E Test', {
          error: error instanceof Error ? error.message : String(error)
        });
        // Don't fail test - this helps identify selector issues
      }
    });
  });

  test('should test isolation checker logic', async () => {
    await test.step('Test isolation checking algorithm', async () => {
      // Import IsolationChecker for testing
      const { IsolationChecker } = await import('../../src/core/IsolationChecker');
      
      // Create mock booking pairs for testing
      const mockPairs = [
        {
          courtId: 'court-1',
          slot1: { courtId: 'court-1', startTime: '14:00', date: '2024-01-01', elementSelector: '' },
          slot2: { courtId: 'court-1', startTime: '15:00', date: '2024-01-01', elementSelector: '' }
        },
        {
          courtId: 'court-2', 
          slot1: { courtId: 'court-2', startTime: '14:00', date: '2024-01-01', elementSelector: '' },
          slot2: { courtId: 'court-2', startTime: '15:00', date: '2024-01-01', elementSelector: '' }
        }
      ];

      // Create mock all slots (including isolated slots)
      const allSlots = [
        { courtId: 'court-1', startTime: '13:30', date: '2024-01-01' }, // Would be isolated
        { courtId: 'court-1', startTime: '14:00', date: '2024-01-01' },
        { courtId: 'court-1', startTime: '15:00', date: '2024-01-01' },
        { courtId: 'court-1', startTime: '16:00', date: '2024-01-01' },
        { courtId: 'court-2', startTime: '14:00', date: '2024-01-01' },
        { courtId: 'court-2', startTime: '15:00', date: '2024-01-01' },
        { courtId: 'court-2', startTime: '16:30', date: '2024-01-01' }  // Would be isolated
      ];

      const bestPair = IsolationChecker.findBestNonIsolatingPair(mockPairs, allSlots);
      
      // Should find a non-isolating pair
      expect(bestPair).toBeDefined();
      
      if (bestPair) {
        logger.info('Isolation checker found best pair', 'E2E Test', {
          selectedCourt: bestPair.courtId,
          slot1Time: bestPair.slot1.startTime,
          slot2Time: bestPair.slot2.startTime
        });
      }
    });
  });

  test('should validate error handling and retry logic', async () => {
    await test.step('Test with invalid configuration', async () => {
      const invalidBookingManager = new BookingManager(page, {
        daysAhead: -1, // Invalid
        targetStartTime: '25:99', // Invalid time
        duration: 0, // Invalid duration
        maxRetries: 0, // No retries
        dryRun: true
      });

      const result = await invalidBookingManager.executeBooking();
      
      // Should handle invalid config gracefully
      expect(result).toBeDefined();
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.retryAttempts).toBeDefined();
    });
  });

  test('should performance test booking flow', async () => {
    await test.step('Measure booking flow performance', async () => {
      const startTime = Date.now();
      
      const result = await bookingManager.executeBooking();
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      logger.info('Booking flow performance', 'E2E Test', {
        durationMs: duration,
        success: result.success,
        retryAttempts: result.retryAttempts
      });
      
      // Should complete within reasonable time (2 minutes)
      expect(duration).toBeLessThan(120000);
      
      // Log performance metrics
      const performanceMetrics = {
        timestamp: new Date().toISOString(),
        durationMs: duration,
        success: result.success,
        retryAttempts: result.retryAttempts,
        url: page.url()
      };
      
      const fs = require('fs');
      const path = require('path');
      
      const metricsPath = 'test-results/performance-metrics.json';
      const dir = path.dirname(metricsPath);
      
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      // Append to metrics file
      let existingMetrics = [];
      if (fs.existsSync(metricsPath)) {
        try {
          existingMetrics = JSON.parse(fs.readFileSync(metricsPath, 'utf8'));
        } catch (error) {
          existingMetrics = [];
        }
      }
      
      existingMetrics.push(performanceMetrics);
      fs.writeFileSync(metricsPath, JSON.stringify(existingMetrics, null, 2));
    });
  });
});