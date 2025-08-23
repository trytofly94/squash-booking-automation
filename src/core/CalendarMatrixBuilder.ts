/**
 * Calendar Matrix Builder - Single-Pass DOM Extraction for Performance Optimization
 * Issue #20: Implement Single-Pass Calendar Matrix Building
 */

import { Page } from 'playwright';
import { CalendarMatrix, CalendarCell, CalendarMatrixMetrics, HybridCalendarMatrix, NetworkAvailabilityData, MatrixConflict } from '@/types/booking.types';
import { logger } from '@/utils/logger';

const component = 'CalendarMatrixBuilder';

export class CalendarMatrixBuilder {
  /**
   * Primary entry point for building a complete calendar matrix from DOM
   * Uses single-pass $$eval for maximum performance (O(C*T) vs O(C*T*Q))
   */
  async buildMatrix(page: Page): Promise<CalendarMatrix> {
    const startTime = Date.now();
    logger.info('Starting single-pass calendar matrix extraction', component);

    try {
      // Single-pass extraction using optimized selector
      const cells = await this.extractAllCells(page);
      logger.debug(`Extracted ${cells.length} cells in single pass`, component);

      // Build dense matrix structure
      const matrix = this.buildDenseStructure(cells, startTime);
      
      // Validate matrix completeness
      const isValid = this.validateMatrix(matrix);
      if (!isValid) {
        logger.warn('Matrix validation failed, but proceeding', component, { 
          metrics: matrix.metrics 
        });
      }

      logger.info('Calendar matrix built successfully', component, {
        totalCells: matrix.metrics.totalCells,
        courts: matrix.courts.length,
        timeSlots: matrix.timeSlots.length,
        extractionTimeMs: matrix.metrics.extractionDurationMs,
        isComplete: matrix.metrics.isComplete
      });

      return matrix;
    } catch (error) {
      logger.error('Failed to build calendar matrix', component, { error });
      throw error;
    }
  }

  /**
   * Extract all calendar cells in a single DOM query using $$eval
   * This is the core performance optimization - one query instead of hundreds
   */
  private async extractAllCells(page: Page): Promise<CalendarCell[]> {
    try {
      // Primary selector based on live testing: works for 1428+ elements
      const primaryCells = await page.$$eval(
        'td[data-date][data-start][data-court]',
        (elements) => {
          // Browser-context utility functions
          const normalizeState = (stateData: string): string => {
            const normalized = stateData.toLowerCase();
            if (normalized.includes('free') || normalized.includes('available')) return 'free';
            if (normalized.includes('booked') || normalized.includes('occupied')) return 'booked';
            if (normalized.includes('unavailable') || normalized.includes('blocked')) return 'unavailable';
            return 'unknown';
          };
          
          return elements.map(el => ({
            court: el.getAttribute('data-court') || '',
            date: el.getAttribute('data-date') || '',
            start: el.getAttribute('data-start') || '',
            state: normalizeState(el.getAttribute('data-state') || el.className),
            className: el.className,
            elementSelector: `td[data-court='${el.getAttribute('data-court')}'][data-date='${el.getAttribute('data-date')}'][data-start='${el.getAttribute('data-start')}']`,
            rawData: {
              'data-court': el.getAttribute('data-court') || '',
              'data-date': el.getAttribute('data-date') || '',
              'data-start': el.getAttribute('data-start') || '',
              'data-state': el.getAttribute('data-state') || '',
              'class': el.className,
              'id': el.id || ''
            }
          }));
        }
      );

      if (primaryCells.length > 0) {
        logger.debug(`Primary selector successful: ${primaryCells.length} cells`, component);
        return primaryCells;
      }

      // Fallback: Try alternative selector patterns
      logger.warn('Primary selector returned no cells, trying fallbacks', component);
      
      const fallbackCells = await page.$$eval(
        'td[data-court], td[data-date]',
        (elements) => {
          // Browser-context utility functions
          const normalizeState = (stateData: string): string => {
            const normalized = stateData.toLowerCase();
            if (normalized.includes('free') || normalized.includes('available')) return 'free';
            if (normalized.includes('booked') || normalized.includes('occupied')) return 'booked';
            if (normalized.includes('unavailable') || normalized.includes('blocked')) return 'unavailable';
            return 'unknown';
          };

          const extractCourtFromClass = (className: string): string => {
            const match = className.match(/court-?(\d+|[a-z]+)/i);
            return match ? match[1] : '';
          };

          const extractDateFromClass = (className: string): string => {
            const match = className.match(/(\d{4}-\d{2}-\d{2})/);
            return match ? match[1] : '';
          };

          const extractTimeFromClass = (className: string): string => {
            const match = className.match(/(\d{1,2}:\d{2})/);
            return match ? match[1] : '';
          };

          const buildFallbackSelector = (element: Element): string => {
            const court = element.getAttribute('data-court');
            const date = element.getAttribute('data-date');
            const start = element.getAttribute('data-start');
            
            if (court && date && start) {
              return `td[data-court='${court}'][data-date='${date}'][data-start='${start}']`;
            }
            
            if (element.id) {
              return `#${element.id}`;
            }
            
            return `.${element.className.split(' ')[0]}`;
          };

          return elements.map(el => ({
            court: el.getAttribute('data-court') || extractCourtFromClass(el.className) || '',
            date: el.getAttribute('data-date') || extractDateFromClass(el.className) || '',
            start: el.getAttribute('data-start') || extractTimeFromClass(el.className) || '',
            state: normalizeState(el.getAttribute('data-state') || el.className),
            className: el.className,
            elementSelector: buildFallbackSelector(el),
            rawData: {
              'data-court': el.getAttribute('data-court') || '',
              'data-date': el.getAttribute('data-date') || '',
              'data-start': el.getAttribute('data-start') || '',
              'data-state': el.getAttribute('data-state') || '',
              'class': el.className,
              'id': el.id || ''
            }
          })).filter(cell => cell.court && cell.date && cell.start);
        }
      );

      if (fallbackCells.length === 0) {
        throw new Error('No calendar cells found with primary or fallback selectors');
      }

      logger.info(`Fallback selector successful: ${fallbackCells.length} cells`, component);
      return fallbackCells;
    } catch (error) {
      logger.error('Failed to extract calendar cells', component, { error });
      throw error;
    }
  }

  /**
   * Build dense matrix structure from flat cell array
   * Creates O(1) lookup structure: court -> time -> cell
   */
  private buildDenseStructure(cells: CalendarCell[], startTime: number): CalendarMatrix {
    const matrix = new Map<string, Map<string, CalendarCell>>();
    const courts = new Set<string>();
    const timeSlots = new Set<string>();
    let dateStart = '';
    let dateEnd = '';

    // Group cells by court and time for O(1) access
    for (const cell of cells) {
      if (!matrix.has(cell.court)) {
        matrix.set(cell.court, new Map());
      }
      
      const timeKey = `${cell.date}T${cell.start}`;
      matrix.get(cell.court)!.set(timeKey, cell);
      
      courts.add(cell.court);
      timeSlots.add(cell.start);
      
      // Track date range
      if (!dateStart || cell.date < dateStart) dateStart = cell.date;
      if (!dateEnd || cell.date > dateEnd) dateEnd = cell.date;
    }

    // Calculate metrics
    const metrics = this.calculateMetrics(cells, Date.now() - startTime);

    return {
      cells: matrix,
      dateRange: { start: dateStart, end: dateEnd },
      courts: Array.from(courts).sort(),
      timeSlots: Array.from(timeSlots).sort(),
      createdAt: new Date(),
      source: 'dom',
      metrics
    };
  }

  /**
   * Calculate matrix metrics for validation and monitoring
   */
  private calculateMetrics(cells: CalendarCell[], extractionDurationMs: number): CalendarMatrixMetrics {
    const stateCounts = { free: 0, booked: 0, unavailable: 0, unknown: 0 };
    const courts = new Set<string>();
    const timeSlots = new Set<string>();
    const warnings: string[] = [];

    for (const cell of cells) {
      stateCounts[cell.state]++;
      courts.add(cell.court);
      timeSlots.add(cell.start);
    }

    // Validation warnings
    if (cells.length === 0) {
      warnings.push('No cells extracted');
    }
    if (courts.size === 0) {
      warnings.push('No courts found');
    }
    if (timeSlots.size === 0) {
      warnings.push('No time slots found');
    }
    if (stateCounts.free === 0) {
      warnings.push('No free slots found');
    }

    const isComplete = warnings.length === 0 && cells.length > 50; // Reasonable minimum

    return {
      totalCells: cells.length,
      freeCells: stateCounts.free,
      bookedCells: stateCounts.booked,
      unavailableCells: stateCounts.unavailable,
      courtsWithData: courts.size,
      timeSlotsWithData: timeSlots.size,
      extractionDurationMs,
      isComplete,
      warnings
    };
  }

  /**
   * Validate matrix completeness and consistency
   */
  private validateMatrix(matrix: CalendarMatrix): boolean {
    const { metrics } = matrix;
    
    // Basic completeness checks
    if (metrics.totalCells === 0) {
      logger.warn('Matrix validation failed: no cells', component);
      return false;
    }
    
    if (metrics.courtsWithData === 0) {
      logger.warn('Matrix validation failed: no courts', component);
      return false;
    }
    
    if (metrics.timeSlotsWithData === 0) {
      logger.warn('Matrix validation failed: no time slots', component);
      return false;
    }

    // Data quality checks
    if (metrics.freeCells === 0) {
      logger.warn('Matrix validation warning: no free slots found', component);
    }

    const successRate = (metrics.totalCells - metrics.warnings.length) / metrics.totalCells;
    if (successRate < 0.8) {
      logger.warn(`Matrix validation warning: low success rate ${successRate}`, component);
    }

    return metrics.isComplete;
  }

  /**
   * Build hybrid matrix combining DOM and network data
   * Supports Issue #19 integration
   */
  async buildHybridMatrix(
    page: Page, 
    networkData?: Map<string, NetworkAvailabilityData>
  ): Promise<HybridCalendarMatrix> {
    const domMatrix = await this.buildMatrix(page);
    const conflicts: MatrixConflict[] = [];

    if (!networkData) {
      return {
        ...domMatrix,
        networkData,
        conflicts
      };
    }

    // TODO: Implement conflict detection and resolution
    // This will be completed as part of Issue #19 integration
    logger.debug('Hybrid matrix building with network data integration', component, {
      networkDataSets: networkData.size
    });

    return {
      ...domMatrix,
      networkData,
      conflicts
    };
  }

  /**
   * Utility methods for fallback data extraction
   */
  private normalizeState(stateData: string): 'free' | 'booked' | 'unavailable' | 'unknown' {
    const normalized = stateData.toLowerCase();
    
    if (normalized.includes('free') || normalized.includes('available')) {
      return 'free';
    }
    if (normalized.includes('booked') || normalized.includes('occupied')) {
      return 'booked';
    }
    if (normalized.includes('unavailable') || normalized.includes('blocked')) {
      return 'unavailable';
    }
    
    return 'unknown';
  }

  private extractCourtFromClass(className: string): string {
    const match = className.match(/court-?(\d+|[a-z]+)/i);
    return match ? match[1] : '';
  }

  private extractDateFromClass(className: string): string {
    const match = className.match(/(\d{4}-\d{2}-\d{2})/);
    return match ? match[1] : '';
  }

  private extractTimeFromClass(className: string): string {
    const match = className.match(/(\d{1,2}:\d{2})/);
    return match ? match[1] : '';
  }

  private buildFallbackSelector(element: Element): string {
    const court = element.getAttribute('data-court');
    const date = element.getAttribute('data-date');
    const start = element.getAttribute('data-start');
    
    if (court && date && start) {
      return `td[data-court='${court}'][data-date='${date}'][data-start='${start}']`;
    }
    
    // Fallback to class or id based selector
    if (element.id) {
      return `#${element.id}`;
    }
    
    return `.${element.className.split(' ')[0]}`;
  }
}