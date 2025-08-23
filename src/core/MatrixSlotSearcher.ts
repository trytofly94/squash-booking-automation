/**
 * Matrix-based Slot Searcher - Single-Pass Performance Optimization  
 * Issue #20: Phase 3 - SlotSearcher.ts Refactoring
 */

import type { Page } from '@playwright/test';
import { 
  BookingSlot, 
  BookingPair, 
  CourtSearchResult, 
  CalendarMatrix, 
  CalendarCell 
} from '../types/booking.types';
import { BookingCalendarPage } from '../pages/BookingCalendarPage';
import { MatrixIsolationChecker } from './MatrixIsolationChecker';
import { DateTimeCalculator } from './DateTimeCalculator';
import { logger } from '../utils/logger';
import { parseISO, isValid } from 'date-fns';

const component = 'MatrixSlotSearcher';

/**
 * Matrix-based slot searcher using single-pass DOM extraction for performance
 * Replaces iterative per-cell queries with O(1) matrix lookups
 */
export class MatrixSlotSearcher {
  private page: Page;
  private calendarPage: BookingCalendarPage;
  private isolationChecker: MatrixIsolationChecker;
  private targetDate: string;
  private targetTimes: string[];

  constructor(page: Page, targetDate: string, targetTimes: string[]) {
    this.page = page;
    this.calendarPage = new BookingCalendarPage(page);
    this.isolationChecker = new MatrixIsolationChecker();
    this.targetDate = targetDate;
    this.targetTimes = targetTimes;
    
    this.validateInputs();
  }

  /**
   * Validate constructor inputs using date-fns
   */
  private validateInputs(): void {
    const dateObj = parseISO(this.targetDate);
    if (!isValid(dateObj)) {
      throw new Error(`Invalid target date: ${this.targetDate}`);
    }

    this.targetTimes.forEach((time, index) => {
      if (!DateTimeCalculator.isValidTime(time)) {
        throw new Error(`Invalid target time at index ${index}: ${time}`);
      }
    });

    logger.debug('Matrix slot searcher inputs validated', component, {
      targetDate: this.targetDate,
      targetTimesCount: this.targetTimes.length
    });
  }

  /**
   * Main search method using matrix-based single-pass extraction
   * Replaces O(C*T*Q) with O(C*T) performance
   */
  async searchAvailableSlots(): Promise<CourtSearchResult> {
    logger.info('Starting matrix-based slot search', component, {
      targetDate: this.targetDate,
      targetTimes: this.targetTimes
    });

    try {
      // PERFORMANCE OPTIMIZATION: Single-pass matrix extraction
      const matrix = await this.calendarPage.extractCalendarMatrix();
      
      logger.info('Matrix extracted, proceeding with analysis', component, {
        totalCells: matrix.metrics.totalCells,
        courts: matrix.courts.length,
        extractionTime: matrix.metrics.extractionDurationMs
      });

      // Get available courts from matrix (O(C) instead of O(C*Q))
      const availableCourts = this.getAvailableCourtsFromMatrix(matrix);
      
      // Get all relevant slots from matrix (O(1) lookups)
      const allSlots = this.getSlotsFromMatrix(matrix, this.targetTimes);
      
      // Find available booking pairs with isolation checking
      const availablePairs = this.findAvailableSlotPairs(matrix, allSlots);

      const result: CourtSearchResult = {
        availableCourts,
        totalSlots: allSlots.length,
        availablePairs
      };

      logger.info('Matrix-based slot search completed', component, {
        availableCourts: availableCourts.length,
        totalSlots: allSlots.length,
        availablePairs: availablePairs.length,
        performanceMetrics: this.calendarPage.getMatrixMetrics(matrix)
      });

      return result;
    } catch (error) {
      logger.error('Matrix-based search failed, attempting fallback', component, { error });
      throw error; // For now, fail fast - fallback can be added later
    }
  }

  /**
   * Extract available courts from matrix data (O(C) performance)
   */
  private getAvailableCourtsFromMatrix(matrix: CalendarMatrix): string[] {
    const availableCourts: string[] = [];
    
    for (const [courtId, timeSlots] of matrix.cells) {
      const hasAvailableSlots = Array.from(timeSlots.values())
        .some(cell => cell.state === 'free');
      
      if (hasAvailableSlots) {
        availableCourts.push(courtId);
      }
    }

    logger.debug('Extracted available courts from matrix', component, {
      totalCourts: matrix.courts.length,
      availableCourts: availableCourts.length,
      courts: availableCourts
    });
    
    return availableCourts.sort();
  }

  /**
   * Get slots from matrix for target times (O(C*T) with O(1) lookups)
   */
  private getSlotsFromMatrix(matrix: CalendarMatrix, targetTimes: string[]): BookingSlot[] {
    const slots: BookingSlot[] = [];
    
    for (const [courtId, timeSlots] of matrix.cells) {
      for (const targetTime of targetTimes) {
        const timeKey = `${this.targetDate}T${targetTime}`;
        const cell = timeSlots.get(timeKey);
        
        if (cell && cell.state === 'free') {
          slots.push({
            date: this.targetDate,
            startTime: targetTime,
            courtId,
            isAvailable: true,
            elementSelector: cell.elementSelector
          });
        }
      }
    }

    logger.debug('Extracted slots from matrix for target times', component, {
      targetTimes: targetTimes.length,
      totalSlots: slots.length,
      availableSlots: slots.filter(s => s.isAvailable).length
    });

    return slots;
  }

  /**
   * Find available slot pairs with matrix-based isolation checking
   */
  private findAvailableSlotPairs(matrix: CalendarMatrix, allSlots: BookingSlot[]): BookingPair[] {
    const pairs: BookingPair[] = [];
    
    // Group slots by court for efficient pair finding
    const slotsByCourtAndTime = this.groupSlotsByCourtAndTime(allSlots);
    
    for (const [courtId, slotsByTime] of slotsByCourtAndTime) {
      for (const targetTime of this.targetTimes) {
        const slot1 = slotsByTime.get(targetTime);
        const nextTime = this.addThirtyMinutes(targetTime);
        const slot2 = nextTime ? slotsByTime.get(nextTime) : null;
        
        if (slot1 && slot2 && slot1.isAvailable && slot2.isAvailable) {
          // Matrix-based isolation check (deterministic, no DOM queries)
          const isolationResult = this.isolationChecker.checkIsolation(
            matrix,
            courtId,
            this.targetDate,
            targetTime,
            60 // 60 minutes duration
          );
          
          if (!isolationResult.hasIsolation) {
            pairs.push({
              slot1,
              slot2,
              courtId
            });
            
            logger.debug('Found valid slot pair without isolation', component, {
              courtId,
              slot1Time: slot1.startTime,
              slot2Time: slot2.startTime
            });
          } else {
            logger.debug('Skipping slot pair due to isolation', component, {
              courtId,
              slot1Time: slot1.startTime,
              slot2Time: slot2.startTime,
              reason: isolationResult.recommendation
            });
          }
        }
      }
    }

    return pairs;
  }

  /**
   * Group slots by court and time for efficient pair finding
   */
  private groupSlotsByCourtAndTime(slots: BookingSlot[]): Map<string, Map<string, BookingSlot>> {
    const grouped = new Map<string, Map<string, BookingSlot>>();
    
    for (const slot of slots) {
      if (!grouped.has(slot.courtId)) {
        grouped.set(slot.courtId, new Map());
      }
      
      grouped.get(slot.courtId)!.set(slot.startTime, slot);
    }
    
    return grouped;
  }

  /**
   * Add 30 minutes to time string (HH:MM format)
   */
  private addThirtyMinutes(timeStr: string): string | null {
    try {
      const [hours, mins] = timeStr.split(':').map(Number);
      const totalMinutes = hours * 60 + mins + 30;
      
      if (totalMinutes >= 24 * 60) return null; // Past end of day
      
      const newHours = Math.floor(totalMinutes / 60);
      const newMins = totalMinutes % 60;
      
      return `${newHours.toString().padStart(2, '0')}:${newMins.toString().padStart(2, '0')}`;
    } catch (error) {
      logger.error('Failed to add 30 minutes to time', component, { timeStr, error });
      return null;
    }
  }

  /**
   * Get optimization metrics for performance monitoring
   */
  async getOptimizationMetrics(matrix?: CalendarMatrix): Promise<{
    extractionTime: number;
    totalQueries: number;
    estimatedLegacyQueries: number;
    performanceGain: string;
    matrixCompleteness: number;
  }> {
    const currentMatrix = matrix || await this.calendarPage.extractCalendarMatrix();
    const metrics = currentMatrix.metrics;
    
    const totalQueries = 1; // Single matrix extraction
    const estimatedLegacyQueries = metrics.courtsWithData * this.targetTimes.length * 5; // Conservative estimate
    const performanceGain = `${Math.round((1 - totalQueries / estimatedLegacyQueries) * 100)}%`;
    const matrixCompleteness = metrics.isComplete ? 1.0 : metrics.totalCells / (metrics.courtsWithData * metrics.timeSlotsWithData);

    return {
      extractionTime: metrics.extractionDurationMs,
      totalQueries,
      estimatedLegacyQueries,
      performanceGain,
      matrixCompleteness
    };
  }

  /**
   * Batch search for multiple date/time combinations using matrix
   */
  async batchSearch(
    searchQueries: Array<{ date: string; times: string[] }>
  ): Promise<Array<{ query: typeof searchQueries[0]; result: CourtSearchResult }>> {
    logger.info('Starting batch matrix-based search', component, { 
      queriesCount: searchQueries.length 
    });

    const results = [];
    
    for (const query of searchQueries) {
      try {
        // Create temporary searcher for each date
        const searcher = new MatrixSlotSearcher(this.page, query.date, query.times);
        const result = await searcher.searchAvailableSlots();
        
        results.push({ query, result });
      } catch (error) {
        logger.error('Batch search query failed', component, { query, error });
        // Add empty result for failed queries
        results.push({
          query,
          result: {
            availableCourts: [],
            totalSlots: 0,
            availablePairs: []
          }
        });
      }
    }

    logger.info('Batch matrix-based search completed', component, { 
      totalResults: results.length,
      successfulResults: results.filter(r => r.result.totalSlots > 0).length
    });

    return results;
  }
}