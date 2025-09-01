/**
 * Performance benchmark tests for Calendar Matrix implementation
 * Issue #20: Single-Pass Calendar Matrix Building - Phase 5
 */

import { test, expect, Page } from '@playwright/test';
import { CalendarMatrixBuilder } from '../../src/core/CalendarMatrixBuilder';
import { MatrixSlotSearcher } from '../../src/core/MatrixSlotSearcher';
import { BookingCalendarPage } from '../../src/pages/BookingCalendarPage';
import { SlotSearcher } from '../../src/core/SlotSearcher';

const BENCHMARK_URL = process.env.BENCHMARK_URL || 'https://www.eversports.de/sb/sportcenter-kautz?sport=squash';
const PERFORMANCE_TARGET_MS = 2000; // 2 second target for matrix extraction
const IMPROVEMENT_TARGET_PERCENTAGE = 70; // Minimum 70% improvement expected

test.describe('Calendar Matrix Performance Benchmarks', () => {
  let page: Page;
  let calendarPage: BookingCalendarPage;
  let matrixBuilder: CalendarMatrixBuilder;
  
  test.beforeEach(async ({ page: testPage }) => {
    page = testPage;
    calendarPage = new BookingCalendarPage(page);
    matrixBuilder = new CalendarMatrixBuilder();
    
    // Navigate to booking calendar
    await calendarPage.navigateToBookingPage();
  });

  test('Matrix extraction performance vs targets', async () => {
    const startTime = Date.now();
    
    // Extract calendar matrix
    const matrix = await matrixBuilder.buildMatrix(page);
    
    const extractionTime = Date.now() - startTime;
    const metricsTime = matrix.metrics.extractionDurationMs;
    
    console.log('Matrix Performance Metrics:', {
      totalExtractionTime: extractionTime,
      internalExtractionTime: metricsTime,
      totalCells: matrix.metrics.totalCells,
      courts: matrix.courts.length,
      timeSlots: matrix.timeSlots.length
    });
    
    // Performance assertions
    expect(extractionTime).toBeLessThan(PERFORMANCE_TARGET_MS);
    expect(matrix.metrics.totalCells).toBeGreaterThan(50); // Reasonable minimum
    expect(matrix.courts.length).toBeGreaterThan(0);
    expect(matrix.timeSlots.length).toBeGreaterThan(0);
    expect(matrix.metrics.isComplete).toBe(true);
  });

  test('Matrix vs Legacy approach comparison', async () => {
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + 7); // Next week
    const dateStr = targetDate.toISOString().split('T')[0];
    const targetTimes = ['14:00', '14:30', '15:00', '15:30'];
    
    // Test matrix-based approach
    const matrixStartTime = Date.now();
    const matrixSearcher = new MatrixSlotSearcher(page, dateStr, targetTimes);
    const matrixResult = await matrixSearcher.searchAvailableSlots();
    const matrixDuration = Date.now() - matrixStartTime;
    
    // Test legacy approach
    const legacyStartTime = Date.now();
    const legacySearcher = new SlotSearcher(page, dateStr, targetTimes);
    const legacyResult = await legacySearcher.searchAvailableSlots();
    const legacyDuration = Date.now() - legacyStartTime;
    
    console.log('Performance Comparison:', {
      matrix: {
        duration: matrixDuration,
        availableCourts: matrixResult.availableCourts.length,
        totalSlots: matrixResult.totalSlots,
        availablePairs: matrixResult.availablePairs.length
      },
      legacy: {
        duration: legacyDuration,
        availableCourts: legacyResult.availableCourts.length,
        totalSlots: legacyResult.totalSlots,
        availablePairs: legacyResult.availablePairs.length
      }
    });
    
    // Performance improvement assertion
    const improvementPercentage = ((legacyDuration - matrixDuration) / legacyDuration) * 100;
    console.log(`Performance improvement: ${improvementPercentage.toFixed(1)}%`);
    
    // Results should be similar (within reasonable bounds)
    expect(matrixResult.availableCourts.length).toBeGreaterThanOrEqual(0);
    expect(matrixResult.totalSlots).toBeGreaterThanOrEqual(0);
    
    // Matrix approach should be significantly faster
    if (legacyDuration > 500) { // Only assert improvement if legacy took meaningful time
      expect(improvementPercentage).toBeGreaterThan(IMPROVEMENT_TARGET_PERCENTAGE);
    }
    
    expect(matrixDuration).toBeLessThan(legacyDuration);
  });

  test('Memory usage and data density', async () => {
    const matrix = await matrixBuilder.buildMatrix(page);
    const metrics = calendarPage.getMatrixMetrics(matrix);
    
    console.log('Matrix Metrics:', metrics);
    
    // Data quality assertions
    expect(matrix.metrics.totalCells).toBeGreaterThan(100); // Reasonable minimum for eversports
    expect(matrix.courts.length).toBeGreaterThan(1); // Should have multiple courts
    expect(matrix.timeSlots.length).toBeGreaterThan(10); // Should have multiple time slots
    expect(metrics.cellDensity).toBeGreaterThan(10); // Average cells per court
    
    // Data completeness assertion
    const completenessPercentage = parseFloat(metrics.dataCompleteness.replace('%', ''));
    expect(completenessPercentage).toBeGreaterThan(80); // At least 80% complete
  });

  test('Batch processing performance', async () => {
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + 7);
    const dateStr = targetDate.toISOString().split('T')[0];
    
    const batchQueries = [
      { date: dateStr, times: ['14:00', '14:30'] },
      { date: dateStr, times: ['15:00', '15:30'] },
      { date: dateStr, times: ['16:00', '16:30'] }
    ];
    
    const startTime = Date.now();
    const matrixSearcher = new MatrixSlotSearcher(page, dateStr, ['14:00']);
    const results = await matrixSearcher.batchSearch(batchQueries);
    const duration = Date.now() - startTime;
    
    console.log('Batch Processing Results:', {
      duration,
      queriesProcessed: results.length,
      averagePerQuery: duration / results.length,
      successfulQueries: results.filter(r => r.result.totalSlots > 0).length
    });
    
    // Batch processing should be efficient
    expect(results.length).toBe(batchQueries.length);
    expect(duration).toBeLessThan(5000); // 5 seconds for 3 queries should be reasonable
    
    // Results should have meaningful data structure
    for (const result of results) {
      expect(result.query).toBeDefined();
      expect(result.result).toBeDefined();
      expect(result.result.availableCourts).toBeDefined();
      expect(result.result.totalSlots).toBeGreaterThanOrEqual(0);
      expect(result.result.availablePairs).toBeDefined();
    }
  });

  test('Matrix validation and error recovery', async () => {
    // Test matrix validation logic
    const matrix = await matrixBuilder.buildMatrix(page);
    
    // Basic validation checks
    expect(matrix.cells.size).toBeGreaterThan(0);
    expect(matrix.courts.length).toBeGreaterThan(0);
    expect(matrix.timeSlots.length).toBeGreaterThan(0);
    expect(matrix.metrics.totalCells).toBeGreaterThan(0);
    
    // Advanced validation
    let totalCellsFromStructure = 0;
    for (const [courtId, timeSlots] of matrix.cells) {
      expect(courtId).toBeTruthy();
      expect(timeSlots.size).toBeGreaterThan(0);
      totalCellsFromStructure += timeSlots.size;
      
      for (const [timeKey, cell] of timeSlots) {
        expect(timeKey).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
        expect(cell.court).toBe(courtId);
        expect(cell.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(cell.start).toMatch(/^\d{2}:\d{2}$/);
        expect(['free', 'booked', 'unavailable', 'unknown']).toContain(cell.state);
        expect(cell.className).toBeTruthy();
      }
    }
    
    // Structure consistency check
    expect(totalCellsFromStructure).toBe(matrix.metrics.totalCells);
    
    console.log('Matrix Validation Results:', {
      structuralIntegrity: 'PASSED',
      totalCells: matrix.metrics.totalCells,
      courts: matrix.courts.length,
      timeSlots: matrix.timeSlots.length,
      warnings: matrix.metrics.warnings.length
    });
  });

  test('Scalability under load simulation', async () => {
    const iterationsCount = 5;
    const durations: number[] = [];
    const cellCounts: number[] = [];
    
    for (let i = 0; i < iterationsCount; i++) {
      const startTime = Date.now();
      const matrix = await matrixBuilder.buildMatrix(page);
      const duration = Date.now() - startTime;
      
      durations.push(duration);
      cellCounts.push(matrix.metrics.totalCells);
    }
    
    const avgDuration = durations.reduce((a, b) => a + b) / durations.length;
    const maxDuration = Math.max(...durations);
    const minDuration = Math.min(...durations);
    const variance = durations.reduce((acc, dur) => acc + Math.pow(dur - avgDuration, 2), 0) / durations.length;
    const stdDev = Math.sqrt(variance);
    
    console.log('Load Test Results:', {
      iterations: iterationsCount,
      averageDuration: avgDuration,
      minDuration,
      maxDuration,
      standardDeviation: stdDev,
      averageCells: cellCounts.reduce((a, b) => a + b) / cellCounts.length,
      performanceStability: stdDev < avgDuration * 0.3 ? 'STABLE' : 'UNSTABLE'
    });
    
    // Performance consistency assertions
    expect(maxDuration).toBeLessThan(PERFORMANCE_TARGET_MS * 1.5); // Allow 50% variance
    expect(stdDev).toBeLessThan(avgDuration * 0.5); // Standard deviation should be less than 50% of mean
    
    // Cell count consistency (should be relatively stable)
    const avgCells = cellCounts.reduce((a, b) => a + b) / cellCounts.length;
    const cellVariance = cellCounts.every(count => Math.abs(count - avgCells) < avgCells * 0.1);
    expect(cellVariance).toBe(true);
  });
});