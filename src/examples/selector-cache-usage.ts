/**
 * Example: Selector Cache Usage
 * Demonstrates how to use the selector caching system in the booking automation
 */

import type { Page } from '@playwright/test';
import { BookingCalendarPage } from '../pages/BookingCalendarPage';
import { initializeGlobalSelectorCache, logCacheStatus } from '../utils/CacheInitializer';
import { logger } from '../utils/logger';

/**
 * Example: Initialize and use selector cache in booking automation
 */
export async function exampleSelectorCacheUsage(page: Page): Promise<void> {
  const component = 'SelectorCacheExample';
  
  try {
    // Step 1: Initialize the global selector cache
    // This should be done once at application startup
    logger.info('Initializing selector cache', component);
    initializeGlobalSelectorCache();
    
    // Step 2: Use pages that benefit from caching
    const calendarPage = new BookingCalendarPage(page);
    
    // Navigate to booking page (will use cached navigation selectors)
    await calendarPage.navigateToBookingPage();
    
    // Step 3: Perform repeated operations that benefit from caching
    
    // Date navigation (cache will improve repeated date input searches)
    await calendarPage.navigateToDate('2024-01-15');
    await calendarPage.navigateToDate('2024-01-16');
    await calendarPage.navigateToDate('2024-01-17');
    
    // Get available courts (cache will improve repeated court selector searches)
    const courts1 = await calendarPage.getAvailableCourts();
    const courts2 = await calendarPage.getAvailableCourts(); // Should be faster due to caching
    const courts3 = await calendarPage.getAvailableCourts(); // Should be even faster
    
    logger.info('Court discovery results', component, {
      attempt1: courts1.length,
      attempt2: courts2.length,
      attempt3: courts3.length
    });
    
    // Step 4: Log cache performance
    logCacheStatus();
    
    // Step 5: Demonstrate cache benefits with repeated slot searches
    const targetDate = '2024-01-20';
    const targetTimes = ['14:00', '15:00', '16:00'];
    
    logger.info('Starting repeated slot searches', component, {
      targetDate,
      targetTimes
    });
    
    // First search (mostly cache misses)
    const startTime1 = Date.now();
    await performSlotSearchDemo(calendarPage, targetDate, targetTimes);
    const time1 = Date.now() - startTime1;
    
    // Second search (should have cache hits)
    const startTime2 = Date.now();
    await performSlotSearchDemo(calendarPage, targetDate, targetTimes);
    const time2 = Date.now() - startTime2;
    
    // Third search (should be fastest)
    const startTime3 = Date.now();
    await performSlotSearchDemo(calendarPage, targetDate, targetTimes);
    const time3 = Date.now() - startTime3;
    
    logger.info('Slot search performance comparison', component, {
      firstSearch: `${time1}ms`,
      secondSearch: `${time2}ms (${((time1 - time2) / time1 * 100).toFixed(1)}% faster)`,
      thirdSearch: `${time3}ms (${((time1 - time3) / time1 * 100).toFixed(1)}% faster)`
    });
    
    // Final cache status
    logCacheStatus();
    
  } catch (error) {
    logger.error('Error in selector cache example', component, {
      error: error instanceof Error ? error.message : String(error)
    });
    throw error;
  }
}

/**
 * Demo function that simulates slot searching operations
 */
async function performSlotSearchDemo(
  calendarPage: BookingCalendarPage, 
  targetDate: string, 
  targetTimes: string[]
): Promise<void> {
  const component = 'performSlotSearchDemo';
  
  try {
    // Navigate to target date (uses cached date input selectors)
    await calendarPage.navigateToDate(targetDate);
    
    // Get courts for the date (uses cached court selectors)
    const courts = await calendarPage.getAvailableCourts();
    
    logger.debug('Slot search demo completed', component, {
      targetDate,
      targetTimes: targetTimes.length,
      courtsFound: courts.length
    });
    
  } catch (error) {
    logger.warn('Error in slot search demo', component, {
      targetDate,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

/**
 * Example: Manual cache operations for advanced usage
 */
export async function exampleAdvancedCacheUsage(page: Page): Promise<void> {
  const component = 'AdvancedCacheExample';
  
  try {
    // Initialize cache
    initializeGlobalSelectorCache();
    
    const calendarPage = new BookingCalendarPage(page);
    
    // Navigate to page
    await calendarPage.navigateToBookingPage();
    
    // Example: Use cache-aware methods directly
    
    // Cache-aware element waiting
    const dateInputSelectors = [
      'input[type="date"]',
      '.datepicker input',
      '[data-date-input]'
    ];
    
    try {
      const dateInput = await calendarPage.waitForElementCached(
        dateInputSelectors,
        'dateInput',
        5000
      );
      logger.info('Found date input via cache', component);
      
      // Use the cached element
      await dateInput.fill('2024-01-20');
      
    } catch (error) {
      logger.warn('Date input not found', component, {
        error: error instanceof Error ? error.message : String(error)
      });
    }
    
    // Cache-aware clicking
    const navigationButtons = [
      '#next-week',
      '.next-week',
      '[data-testid="next-week"]'
    ];
    
    try {
      await calendarPage.safeClickCached(navigationButtons, 'nextWeek');
      logger.info('Clicked next week button via cache', component);
      
    } catch (error) {
      logger.warn('Next week button not found', component, {
        error: error instanceof Error ? error.message : String(error)
      });
    }
    
    // Show final cache performance
    logCacheStatus();
    
  } catch (error) {
    logger.error('Error in advanced cache example', component, {
      error: error instanceof Error ? error.message : String(error)
    });
    throw error;
  }
}

/**
 * Example: Configuration and environment setup
 */
export function exampleCacheConfiguration(): void {
  const component = 'CacheConfigurationExample';
  
  logger.info('Selector cache configuration example', component);
  
  // Environment variables that control cache behavior:
  const exampleEnvVars = {
    SELECTOR_CACHE_ENABLED: 'true',     // Enable/disable caching
    SELECTOR_CACHE_SIZE: '100',         // Maximum cache entries
    SELECTOR_CACHE_TTL_MS: '600000',    // 10 minutes TTL
    SELECTOR_CACHE_DEBUG: 'true'        // Enable debug logging
  };
  
  logger.info('Cache configuration environment variables', component, exampleEnvVars);
  
  // These can be set in your .env file:
  // SELECTOR_CACHE_ENABLED=true
  // SELECTOR_CACHE_SIZE=100
  // SELECTOR_CACHE_TTL_MS=600000
  // SELECTOR_CACHE_DEBUG=false
}