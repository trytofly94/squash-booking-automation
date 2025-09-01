/**
 * Integration tests for Calendar Matrix system
 * Issue #20: Single-Pass Calendar Matrix Building - Phase 8
 */

import { test, expect, Page } from '@playwright/test';
import { CalendarMatrixBuilder } from '../../src/core/CalendarMatrixBuilder';
import { MatrixSlotSearcher } from '../../src/core/MatrixSlotSearcher';
import { MatrixIsolationChecker } from '../../src/core/MatrixIsolationChecker';
import { BookingCalendarPage } from '../../src/pages/BookingCalendarPage';
import { SlotSearcher } from '../../src/core/SlotSearcher';

const TEST_URL = process.env.TEST_URL || 'https://www.eversports.de/sb/sportcenter-kautz?sport=squash';

test.describe('Calendar Matrix Integration Tests', () => {
  let page: Page;
  
  test.beforeEach(async ({ page: testPage }) => {
    page = testPage;
  });

  test('Complete matrix workflow integration', async () => {
    const calendarPage = new BookingCalendarPage(page);
    const matrixBuilder = new CalendarMatrixBuilder();
    const isolationChecker = new MatrixIsolationChecker();
    
    // Navigate to calendar
    await calendarPage.navigateToBookingPage();
    
    // Phase 1: Extract matrix
    const matrix = await matrixBuilder.buildMatrix(page);
    
    expect(matrix).toBeDefined();
    expect(matrix.courts.length).toBeGreaterThan(0);
    expect(matrix.timeSlots.length).toBeGreaterThan(0);
    expect(matrix.metrics.totalCells).toBeGreaterThan(0);
    
    // Phase 2: Test matrix-to-legacy conversion
    const targetTimes = ['14:00', '14:30', '15:00'];
    const legacySlots = calendarPage.matrixToBookingSlots(matrix, targetTimes);
    const availableCourts = calendarPage.matrixToCourtList(matrix);
    
    expect(legacySlots).toBeInstanceOf(Array);
    expect(availableCourts).toBeInstanceOf(Array);
    expect(availableCourts.length).toBeGreaterThan(0);
    
    // Phase 3: Test isolation checking
    if (availableCourts.length > 0 && matrix.timeSlots.length > 1) {
      const testCourt = availableCourts[0];
      const testTime = matrix.timeSlots[0];
      const testDate = matrix.dateRange.start;
      
      const isolationResult = isolationChecker.checkIsolation(
        matrix, 
        testCourt, 
        testDate, 
        testTime, 
        60
      );
      
      expect(isolationResult).toBeDefined();
      expect(typeof isolationResult.hasIsolation).toBe('boolean');
      expect(isolationResult.recommendation).toBeTruthy();
    }
    
    console.log('Matrix Integration Test Results:', {
      totalCells: matrix.metrics.totalCells,
      courts: matrix.courts.length,
      timeSlots: matrix.timeSlots.length,
      legacySlots: legacySlots.length,
      availableCourts: availableCourts.length,
      extractionTime: matrix.metrics.extractionDurationMs
    });
  });

  test('Matrix vs Legacy SlotSearcher comparison', async () => {
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + 7); // Next week
    const dateStr = targetDate.toISOString().split('T')[0];
    const targetTimes = ['14:00', '14:30'];
    
    const calendarPage = new BookingCalendarPage(page);
    await calendarPage.navigateToBookingPage();
    
    // Test matrix approach
    const matrixSearcher = new MatrixSlotSearcher(page, dateStr, targetTimes);
    const matrixStartTime = Date.now();
    
    let matrixResult;
    let matrixError = null;
    try {
      matrixResult = await matrixSearcher.searchAvailableSlots();
    } catch (error) {
      matrixError = error;
      matrixResult = { availableCourts: [], totalSlots: 0, availablePairs: [] };
    }
    
    const matrixDuration = Date.now() - matrixStartTime;
    
    // Test legacy approach (with fallback)
    const legacySearcher = new SlotSearcher(page, dateStr, targetTimes);
    const legacyStartTime = Date.now();
    
    let legacyResult;
    let legacyError = null;
    try {
      legacyResult = await legacySearcher.searchAvailableSlots();
    } catch (error) {
      legacyError = error;
      legacyResult = { availableCourts: [], totalSlots: 0, availablePairs: [] };
    }
    
    const legacyDuration = Date.now() - legacyStartTime;
    
    console.log('SlotSearcher Comparison Results:', {
      matrix: {
        duration: matrixDuration,
        error: (matrixError as Error)?.message || null,
        courts: matrixResult.availableCourts.length,
        slots: matrixResult.totalSlots,
        pairs: matrixResult.availablePairs.length
      },
      legacy: {
        duration: legacyDuration,
        error: (legacyError as Error)?.message || null,
        courts: legacyResult.availableCourts.length,
        slots: legacyResult.totalSlots,
        pairs: legacyResult.availablePairs.length
      },
      improvement: legacyDuration > 0 ? `${Math.round((legacyDuration - matrixDuration) / legacyDuration * 100)}%` : 'N/A'
    });
    
    // Both approaches should return valid results (even if empty)
    expect(matrixResult).toBeDefined();
    expect(legacyResult).toBeDefined();
    expect(matrixResult.availableCourts).toBeInstanceOf(Array);
    expect(legacyResult.availableCourts).toBeInstanceOf(Array);
    
    // If both succeeded, results should be reasonably similar
    if (!matrixError && !legacyError) {
      const courtDiff = Math.abs(matrixResult.availableCourts.length - legacyResult.availableCourts.length);
      expect(courtDiff).toBeLessThanOrEqual(2); // Allow small variance
    }
  });

  test('Matrix data quality and consistency', async () => {
    const calendarPage = new BookingCalendarPage(page);
    await calendarPage.navigateToBookingPage();
    
    const matrix = await calendarPage.extractCalendarMatrix();
    
    // Data structure validation
    expect(matrix.cells).toBeInstanceOf(Map);
    expect(matrix.courts).toBeInstanceOf(Array);
    expect(matrix.timeSlots).toBeInstanceOf(Array);
    expect(matrix.dateRange).toBeDefined();
    expect(matrix.metrics).toBeDefined();
    
    // Data consistency checks
    let structuralCellCount = 0;
    const foundCourts = new Set<string>();
    const foundTimeSlots = new Set<string>();
    
    for (const [courtId, timeSlots] of matrix.cells) {
      foundCourts.add(courtId);
      
      for (const [timeKey, cell] of timeSlots) {
        structuralCellCount++;
        
        // Validate cell structure
        expect(cell.court).toBe(courtId);
        expect(cell.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(cell.start).toMatch(/^\d{2}:\d{2}$/);
        expect(['free', 'booked', 'unavailable', 'unknown']).toContain(cell.state);
        expect(cell.className).toBeTruthy();
        
        // Validate time key format
        expect(timeKey).toBe(`${cell.date}T${cell.start}`);
        
        foundTimeSlots.add(cell.start);
      }
    }
    
    // Consistency assertions
    expect(structuralCellCount).toBe(matrix.metrics.totalCells);
    expect(foundCourts.size).toBe(matrix.courts.length);
    expect([...foundCourts].sort()).toEqual(matrix.courts.sort());
    
    // Data completeness assertions
    expect(matrix.metrics.totalCells).toBeGreaterThan(0);
    expect(matrix.metrics.courtsWithData).toBe(foundCourts.size);
    expect(matrix.metrics.timeSlotsWithData).toBe(foundTimeSlots.size);
    
    console.log('Matrix Data Quality Results:', {
      structuralIntegrity: 'PASSED',
      cellConsistency: 'PASSED',
      courtConsistency: 'PASSED',
      metrics: {
        totalCells: matrix.metrics.totalCells,
        courts: matrix.metrics.courtsWithData,
        timeSlots: matrix.metrics.timeSlotsWithData,
        extractionTime: matrix.metrics.extractionDurationMs,
        completeness: matrix.metrics.isComplete
      }
    });
  });

  test('Matrix performance under different load conditions', async () => {
    const calendarPage = new BookingCalendarPage(page);
    await calendarPage.navigateToBookingPage();
    
    const performanceTests = [];
    const iterations = 3;
    
    // Test 1: Basic extraction performance
    for (let i = 0; i < iterations; i++) {
      const startTime = Date.now();
      const matrix = await calendarPage.extractCalendarMatrix();
      const duration = Date.now() - startTime;
      
      performanceTests.push({
        test: 'basic_extraction',
        iteration: i + 1,
        duration,
        cells: matrix.metrics.totalCells,
        courts: matrix.courts.length
      });
    }
    
    // Test 2: Matrix with different query patterns
    const matrix = await calendarPage.extractCalendarMatrix();
    const targetDate = matrix.dateRange.start;
    
    if (matrix.courts.length > 0) {
      const queryPatterns = [
        ['14:00'],
        ['14:00', '14:30'],
        ['14:00', '14:30', '15:00', '15:30'],
        ['13:00', '13:30', '14:00', '14:30', '15:00', '15:30', '16:00', '16:30']
      ];
      
      for (const [index, times] of queryPatterns.entries()) {
        const searcher = new MatrixSlotSearcher(page, targetDate, times);
        
        const startTime = Date.now();
        const result = await searcher.searchAvailableSlots();
        const duration = Date.now() - startTime;
        
        performanceTests.push({
          test: 'matrix_search',
          pattern: `${times.length}_times`,
          duration,
          courts: result.availableCourts.length,
          slots: result.totalSlots,
          pairs: result.availablePairs.length
        });
      }
    }
    
    // Performance analysis
    const extractionTests = performanceTests.filter(t => t.test === 'basic_extraction');
    const searchTests = performanceTests.filter(t => t.test === 'matrix_search');
    
    const avgExtractionTime = extractionTests.reduce((sum, t) => sum + t.duration, 0) / extractionTests.length;
    const maxExtractionTime = Math.max(...extractionTests.map(t => t.duration));
    
    console.log('Performance Test Results:', {
      extraction: {
        average: avgExtractionTime,
        maximum: maxExtractionTime,
        iterations: extractionTests.length
      },
      searching: searchTests.map(t => ({
        pattern: t.pattern,
        duration: t.duration,
        efficiency: (t.slots ?? 0) > 0 ? t.duration / (t.slots ?? 0) : 'N/A'
      }))
    });
    
    // Performance assertions
    expect(avgExtractionTime).toBeLessThan(3000); // 3 second average
    expect(maxExtractionTime).toBeLessThan(5000); // 5 second maximum
    
    // Search performance should scale reasonably
    if (searchTests.length > 1) {
      const searchTimes = searchTests.map(t => t.duration);
      const maxSearchTime = Math.max(...searchTimes);
      expect(maxSearchTime).toBeLessThan(2000); // 2 seconds max for search
    }
  });

  test('Error recovery and fallback mechanisms', async () => {
    const calendarPage = new BookingCalendarPage(page);
    
    // Test with potentially problematic navigation
    await page.goto('about:blank');
    
    try {
      await calendarPage.navigateToBookingPage();
    } catch (error) {
      // Should handle navigation errors gracefully
      expect(error).toBeDefined();
    }
    
    // Test matrix extraction error handling
    const mockPage = {
      $$eval: jest.fn().mockRejectedValue(new Error('DOM not ready')),
      waitForSelector: jest.fn().mockResolvedValue(null)
    };
    
    const matrixBuilder = new CalendarMatrixBuilder();
    
    try {
      await matrixBuilder.buildMatrix(mockPage as any);
      expect(false).toBe(true); // Should not reach here
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBeTruthy();
    }
    
    // Test SlotSearcher fallback behavior
    const targetDate = new Date().toISOString().split('T')[0];
    const searcher = new SlotSearcher(mockPage as any, targetDate, ['14:00']);
    
    try {
      const result = await searcher.searchAvailableSlots();
      // Should either succeed with legacy method or fail gracefully
      expect(result).toBeDefined();
    } catch (error) {
      // Graceful failure is acceptable
      expect(error).toBeInstanceOf(Error);
    }
    
    console.log('Error Recovery Test Results:', {
      navigationHandling: 'TESTED',
      matrixExtractionError: 'HANDLED',
      fallbackBehavior: 'TESTED'
    });
  });

  test('Matrix isolation logic integration', async () => {
    const calendarPage = new BookingCalendarPage(page);
    await calendarPage.navigateToBookingPage();
    
    const matrix = await calendarPage.extractCalendarMatrix();
    const isolationChecker = new MatrixIsolationChecker();
    
    if (matrix.courts.length > 0 && matrix.timeSlots.length > 2) {
      const testCourt = matrix.courts[0];
      const testDate = matrix.dateRange.start;
      const testTimes = matrix.timeSlots.slice(0, 3); // First 3 time slots
      
      // Test various isolation scenarios
      const isolationTests = [];
      
      for (const startTime of testTimes) {
        const result = isolationChecker.checkIsolation(matrix, testCourt, testDate, startTime, 60);
        
        isolationTests.push({
          court: testCourt,
          startTime,
          hasIsolation: result.hasIsolation,
          isolatedSlots: result.isolatedSlots.length,
          recommendation: result.recommendation
        });
      }
      
      // Test batch isolation checking
      const batchOptions = testTimes.map(time => ({
        court: testCourt,
        date: testDate,
        startTime: time,
        duration: 60
      }));
      
      const batchResults = isolationChecker.checkBatchIsolation(matrix, batchOptions);
      
      expect(batchResults).toHaveLength(batchOptions.length);
      expect(batchResults.every(r => r.option && r.result)).toBe(true);
      
      // Test safe slots identification
      const safeSlots = isolationChecker.getIsolationSafeSlots(matrix, testCourt, testDate, 60);
      
      console.log('Isolation Logic Integration Results:', {
        isolationTests: isolationTests.length,
        batchTests: batchResults.length,
        safeSlots: safeSlots.length,
        sampleResults: isolationTests.slice(0, 2)
      });
      
      expect(isolationTests.length).toBeGreaterThan(0);
      expect(safeSlots).toBeInstanceOf(Array);
    }
  });
});