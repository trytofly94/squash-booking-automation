#!/usr/bin/env npx ts-node

/**
 * Live Booking Flow Test
 * Testet den kompletten Buchungsprozess mit den aktualisierten Selektoren
 */

import { chromium } from '@playwright/test';
import { logger } from '../src/utils/logger';
import { BookingCalendarPage } from '../src/pages/BookingCalendarPage';
import { SlotSearcher } from '../src/core/SlotSearcher';

async function testBookingFlow() {
  logger.info('🧪 Starting Live Booking Flow Test', 'BookingFlowTest');

  const browser = await chromium.launch({ 
    headless: false,
    slowMo: 1500 
  });
  
  const page = await browser.newPage();

  try {
    // 1. Initialize Page Objects
    console.log('\n📋 Step 1: Initialize Page Objects');
    const calendarPage = new BookingCalendarPage(page);
    
    // SlotSearcher requires target date and times in constructor
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + 1); // Tomorrow
    const targetDateStr = targetDate.toISOString().split('T')[0]!;
    const targetTimes = ['14:00', '14:30']; // Standard ui.vision times
    
    const slotSearcher = new SlotSearcher(page, targetDateStr, targetTimes);

    // 2. Navigate to Booking Page
    console.log('\n🌐 Step 2: Navigate to Booking Page');
    await calendarPage.navigateToBookingPage();
    console.log('✅ Successfully navigated to booking page');

    // Screenshot after navigation
    await page.screenshot({ path: './test-booking-step-2-navigation.png', fullPage: true });

    // 3. Test Calendar Loading
    console.log('\n📅 Step 3: Test Calendar Loading');
    const isOnCalendar = await calendarPage.isOnBookingCalendar();
    console.log(`Calendar loaded: ${isOnCalendar ? '✅' : '❌'}`);

    if (!isOnCalendar) {
      throw new Error('Calendar not loaded - critical failure');
    }

    // 4. Test Court Detection with Updated Selectors
    console.log('\n🏟️ Step 4: Test Court Detection (LIVE-UPDATED SELECTORS)');
    const availableCourts = await calendarPage.getAvailableCourts();
    console.log(`Available courts found: ${availableCourts.length}`);
    console.log(`Courts: ${availableCourts.join(', ')}`);

    if (availableCourts.length === 0) {
      throw new Error('No courts found - critical selector failure');
    }

    // 5. Test Date Navigation
    console.log('\n📆 Step 5: Test Date Navigation');
    console.log(`Navigating to: ${targetDateStr}`);
    await calendarPage.navigateToDate(targetDateStr);
    console.log('✅ Date navigation completed');

    // 6. Test Slot Finding with ui.vision Patterns
    console.log('\n⏰ Step 6: Test Slot Finding (ui.vision PATTERNS)');
    const testCourt = availableCourts[0]!;
    const testTime = '14:00'; // Standard test time from ui.vision
    
    console.log(`Testing slot: Court ${testCourt}, Time ${testTime}, Date ${targetDateStr}`);
    
    const slot = await calendarPage.findTimeSlot(testCourt, testTime, targetDateStr);
    
    if (slot) {
      console.log('✅ Slot found with ui.vision patterns:');
      console.log(`  - Court: ${slot.courtId}`);
      console.log(`  - Time: ${slot.startTime}`);
      console.log(`  - Available: ${slot.isAvailable ? '✅' : '❌'}`);
      console.log(`  - Selector: ${slot.elementSelector}`);
    } else {
      console.log('❌ Slot not found - investigating...');
      
      // Debug: Check what slots are available
      const debugSlots = await page.$$('td[data-date][data-start][data-court]');
      console.log(`Total slots found for debugging: ${debugSlots.length}`);
      
      if (debugSlots.length > 0) {
        const sampleSlot = debugSlots[0]!;
        const sampleData = await sampleSlot.evaluate((el: any) => ({
          date: el.getAttribute('data-date'),
          start: el.getAttribute('data-start'),
          court: el.getAttribute('data-court'),
          state: el.getAttribute('data-state')
        }));
        console.log('Sample slot data:', sampleData);
      }
    }

    // 7. Test SlotSearcher Integration
    console.log('\n🔍 Step 7: Test SlotSearcher Integration');
    
    console.log('Running SlotSearcher...');
    
    try {
      const searchResults = await slotSearcher.searchAvailableSlots();
      
      console.log(`SlotSearcher results:`);
      console.log(`  - Available courts: ${searchResults.availableCourts.length}`);
      console.log(`  - Total slots: ${searchResults.totalSlots}`);
      console.log(`  - Available pairs: ${searchResults.availablePairs.length}`);
      
      if (searchResults.availableCourts.length > 0) {
        console.log(`Courts found: ${searchResults.availableCourts.join(', ')}`);
      }
      
      if (searchResults.availablePairs.length > 0) {
        console.log(`Booking pairs available:`);
        searchResults.availablePairs.forEach((pair: any, index: number) => {
          console.log(`  Pair ${index + 1}: Court ${pair.firstSlot.courtId} - ${pair.firstSlot.startTime} to ${pair.secondSlot.startTime}`);
        });
      }
      
    } catch (searchError) {
      console.log('⚠️ SlotSearcher error:', (searchError as Error).message);
    }

    // 8. Live Selector Validation
    console.log('\n🛠️ Step 8: Live Selector Validation');
    
    const selectorTests = [
      { name: 'Calendar Container', selector: '#booking-calendar-container' },
      { name: 'Time Slots', selector: 'td[data-date]' },
      { name: 'Court Elements', selector: 'td[data-court]' },
      { name: 'Free Slots', selector: 'td[data-state="free"]' },
      { name: 'Combined Pattern', selector: '[data-date][data-start][data-state][data-court]' }
    ];

    for (const test of selectorTests) {
      const elements = await page.$$(test.selector);
      const status = elements.length > 0 ? '✅' : '❌';
      console.log(`  ${test.name}: ${status} (${elements.length} found)`);
    }

    // 9. Screenshot Final State
    await page.screenshot({ path: './test-booking-step-9-final.png', fullPage: true });

    // 10. Summary
    console.log('\n📊 BOOKING FLOW TEST SUMMARY');
    console.log('========================================');
    console.log(`✅ Calendar Loading: Working`);
    console.log(`✅ Court Detection: ${availableCourts.length} courts found`);
    console.log(`${slot ? '✅' : '❌'} Slot Finding: ${slot ? 'Working with ui.vision patterns' : 'Needs investigation'}`);
    
    if (slot && slot.isAvailable) {
      console.log('🎯 READY FOR LIVE BOOKING: All core components working');
    } else {
      console.log('⚠️ NEEDS ATTENTION: Slot finding or availability check issues');
    }

    logger.info('✅ Live Booking Flow Test completed', 'BookingFlowTest', {
      courtsFound: availableCourts.length,
      slotFound: !!slot,
      slotAvailable: slot?.isAvailable || false
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('❌ Booking Flow Test failed:', errorMessage);
    logger.error('❌ Booking Flow Test failed', 'BookingFlowTest', { error: errorMessage });
    
    // Error screenshot
    await page.screenshot({ path: './test-booking-error.png', fullPage: true });
  } finally {
    await browser.close();
  }
}

// Run the test
testBookingFlow().catch(error => {
  console.error('💥 Fatal error:', error);
  process.exit(1);
});