import { promises as fs } from 'fs';
import { logger } from '../utils/logger';
import type { BookingPattern } from '../types/booking.types';

/**
 * JSON-based pattern storage system for booking pattern persistence
 * Handles loading, saving, and cleanup of booking pattern data
 */
export class PatternStorage {
  private readonly filePath: string;
  private readonly backupPath: string;
  private readonly maxAge: number; // Maximum age of patterns in days

  constructor(
    filePath: string = 'booking-patterns.json',
    maxAge: number = 90 // Keep patterns for 90 days by default
  ) {
    this.filePath = filePath;
    this.backupPath = `${filePath}.backup`;
    this.maxAge = maxAge;
    
    logger.info('PatternStorage initialized', 'PatternStorage', {
      filePath,
      backupPath: this.backupPath,
      maxAge
    });
  }

  /**
   * Load patterns from storage file
   * @returns Promise resolving to array of booking patterns
   */
  async loadPatterns(): Promise<BookingPattern[]> {
    try {
      const data = await fs.readFile(this.filePath, 'utf-8');
      const parsed = JSON.parse(data);
      
      // Validate and convert dates
      const patterns = this.validateAndConvertPatterns(parsed);
      
      // Clean up old patterns
      const cleanedPatterns = this.cleanupOldPatterns(patterns);
      
      logger.info('Loaded booking patterns', 'PatternStorage', {
        totalLoaded: patterns.length,
        afterCleanup: cleanedPatterns.length,
        filePath: this.filePath
      });
      
      return cleanedPatterns;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        logger.info('Pattern file does not exist, starting with empty patterns', 'PatternStorage');
        return [];
      }
      
      logger.error('Error loading patterns, attempting backup', 'PatternStorage', { 
        error: (error as Error).message 
      });
      
      // Try to load from backup
      return await this.loadFromBackup();
    }
  }

  /**
   * Save patterns to storage file with backup
   * @param patterns Array of booking patterns to save
   */
  async savePatterns(patterns: BookingPattern[]): Promise<void> {
    try {
      // Create backup of existing file if it exists
      await this.createBackup();
      
      // Clean patterns before saving
      const cleanedPatterns = this.cleanupOldPatterns(patterns);
      
      // Convert dates to ISO strings for JSON serialization
      const serializable = cleanedPatterns.map(pattern => ({
        ...pattern,
        lastUpdated: pattern.lastUpdated.toISOString()
      }));
      
      const data = JSON.stringify(serializable, null, 2);
      await fs.writeFile(this.filePath, data, 'utf-8');
      
      logger.info('Saved booking patterns', 'PatternStorage', {
        totalPatterns: cleanedPatterns.length,
        filePath: this.filePath
      });
    } catch (error) {
      logger.error('Error saving patterns', 'PatternStorage', { 
        error: (error as Error).message,
        totalPatterns: patterns.length
      });
      throw error;
    }
  }

  /**
   * Update a single pattern in storage
   * @param updatedPattern Pattern to update
   */
  async updatePattern(updatedPattern: BookingPattern): Promise<void> {
    try {
      const existingPatterns = await this.loadPatterns();
      const patternKey = this.getPatternKey(updatedPattern);
      
      // Find and update existing pattern or add new one
      const index = existingPatterns.findIndex(p => 
        this.getPatternKey(p) === patternKey
      );
      
      if (index >= 0) {
        existingPatterns[index] = updatedPattern;
      } else {
        existingPatterns.push(updatedPattern);
      }
      
      await this.savePatterns(existingPatterns);
      
      logger.debug('Updated individual pattern', 'PatternStorage', {
        courtId: updatedPattern.courtId,
        timeSlot: updatedPattern.timeSlot,
        dayOfWeek: updatedPattern.dayOfWeek,
        successRate: updatedPattern.successRate,
        totalAttempts: updatedPattern.totalAttempts
      });
    } catch (error) {
      logger.error('Error updating individual pattern', 'PatternStorage', { 
        error: (error as Error).message,
        pattern: updatedPattern
      });
      throw error;
    }
  }

  /**
   * Get patterns for specific criteria
   * @param courtId Optional court ID filter
   * @param timeSlot Optional time slot filter
   * @param dayOfWeek Optional day of week filter
   * @returns Promise resolving to filtered patterns
   */
  async getFilteredPatterns(
    courtId?: string,
    timeSlot?: string,
    dayOfWeek?: number
  ): Promise<BookingPattern[]> {
    const allPatterns = await this.loadPatterns();
    
    return allPatterns.filter(pattern => {
      if (courtId && pattern.courtId !== courtId) return false;
      if (timeSlot && pattern.timeSlot !== timeSlot) return false;
      if (dayOfWeek !== undefined && pattern.dayOfWeek !== dayOfWeek) return false;
      return true;
    });
  }

  /**
   * Get success statistics for patterns
   * @returns Promise resolving to statistics object
   */
  async getStatistics(): Promise<{
    totalPatterns: number;
    averageSuccessRate: number;
    courtStats: Record<string, { successRate: number; attempts: number }>;
    timeSlotStats: Record<string, { successRate: number; attempts: number }>;
    dayStats: Record<number, { successRate: number; attempts: number }>;
  }> {
    const patterns = await this.loadPatterns();
    
    if (patterns.length === 0) {
      return {
        totalPatterns: 0,
        averageSuccessRate: 0,
        courtStats: {},
        timeSlotStats: {},
        dayStats: {}
      };
    }

    const averageSuccessRate = patterns.reduce((sum, p) => sum + p.successRate, 0) / patterns.length;

    // Group by court
    const courtStats = patterns.reduce((acc, pattern) => {
      if (!acc[pattern.courtId]) {
        acc[pattern.courtId] = { totalRate: 0, totalAttempts: 0, count: 0 };
      }
      acc[pattern.courtId].totalRate += pattern.successRate;
      acc[pattern.courtId].totalAttempts += pattern.totalAttempts;
      acc[pattern.courtId].count++;
      return acc;
    }, {} as Record<string, { totalRate: number; totalAttempts: number; count: number }>);

    const courtStatsFormatted = Object.entries(courtStats).reduce((acc, [courtId, stats]) => {
      acc[courtId] = {
        successRate: stats.totalRate / stats.count,
        attempts: stats.totalAttempts
      };
      return acc;
    }, {} as Record<string, { successRate: number; attempts: number }>);

    // Group by time slot
    const timeSlotStats = patterns.reduce((acc, pattern) => {
      if (!acc[pattern.timeSlot]) {
        acc[pattern.timeSlot] = { totalRate: 0, totalAttempts: 0, count: 0 };
      }
      acc[pattern.timeSlot].totalRate += pattern.successRate;
      acc[pattern.timeSlot].totalAttempts += pattern.totalAttempts;
      acc[pattern.timeSlot].count++;
      return acc;
    }, {} as Record<string, { totalRate: number; totalAttempts: number; count: number }>);

    const timeSlotStatsFormatted = Object.entries(timeSlotStats).reduce((acc, [timeSlot, stats]) => {
      acc[timeSlot] = {
        successRate: stats.totalRate / stats.count,
        attempts: stats.totalAttempts
      };
      return acc;
    }, {} as Record<string, { successRate: number; attempts: number }>);

    // Group by day of week
    const dayStats = patterns.reduce((acc, pattern) => {
      if (!acc[pattern.dayOfWeek]) {
        acc[pattern.dayOfWeek] = { totalRate: 0, totalAttempts: 0, count: 0 };
      }
      acc[pattern.dayOfWeek].totalRate += pattern.successRate;
      acc[pattern.dayOfWeek].totalAttempts += pattern.totalAttempts;
      acc[pattern.dayOfWeek].count++;
      return acc;
    }, {} as Record<number, { totalRate: number; totalAttempts: number; count: number }>);

    const dayStatsFormatted = Object.entries(dayStats).reduce((acc, [day, stats]) => {
      acc[parseInt(day)] = {
        successRate: stats.totalRate / stats.count,
        attempts: stats.totalAttempts
      };
      return acc;
    }, {} as Record<number, { successRate: number; attempts: number }>);

    return {
      totalPatterns: patterns.length,
      averageSuccessRate,
      courtStats: courtStatsFormatted,
      timeSlotStats: timeSlotStatsFormatted,
      dayStats: dayStatsFormatted
    };
  }

  /**
   * Clean up storage by removing old patterns
   * @returns Promise resolving to number of patterns removed
   */
  async cleanupStorage(): Promise<number> {
    const patterns = await this.loadPatterns();
    const originalCount = patterns.length;
    const cleanedPatterns = this.cleanupOldPatterns(patterns);
    
    if (cleanedPatterns.length !== originalCount) {
      await this.savePatterns(cleanedPatterns);
      const removedCount = originalCount - cleanedPatterns.length;
      
      logger.info('Cleaned up old patterns', 'PatternStorage', {
        originalCount,
        removedCount,
        remainingCount: cleanedPatterns.length
      });
      
      return removedCount;
    }
    
    return 0;
  }

  /**
   * Export patterns to external file for backup or analysis
   * @param exportPath Path to export file
   */
  async exportPatterns(exportPath: string): Promise<void> {
    const patterns = await this.loadPatterns();
    const statistics = await this.getStatistics();
    
    const exportData = {
      exportedAt: new Date().toISOString(),
      statistics,
      patterns: patterns.map(pattern => ({
        ...pattern,
        lastUpdated: pattern.lastUpdated.toISOString()
      }))
    };
    
    const data = JSON.stringify(exportData, null, 2);
    await fs.writeFile(exportPath, data, 'utf-8');
    
    logger.info('Exported patterns', 'PatternStorage', {
      exportPath,
      totalPatterns: patterns.length
    });
  }

  /**
   * Validate and convert loaded pattern data
   * @param data Raw data from JSON file
   * @returns Array of validated booking patterns
   */
  private validateAndConvertPatterns(data: any[]): BookingPattern[] {
    if (!Array.isArray(data)) {
      throw new Error('Pattern data is not an array');
    }

    return data.map((item, index) => {
      if (!item || typeof item !== 'object') {
        throw new Error(`Invalid pattern at index ${index}`);
      }

      const pattern: BookingPattern = {
        courtId: String(item.courtId || ''),
        timeSlot: String(item.timeSlot || ''),
        dayOfWeek: Number(item.dayOfWeek ?? -1),
        successRate: Number(item.successRate ?? 0),
        totalAttempts: Number(item.totalAttempts ?? 0),
        lastUpdated: new Date(item.lastUpdated || new Date())
      };

      // Validate required fields
      if (!pattern.courtId) {
        throw new Error(`Missing courtId at index ${index}`);
      }
      if (!pattern.timeSlot) {
        throw new Error(`Missing timeSlot at index ${index}`);
      }
      if (pattern.dayOfWeek < 0 || pattern.dayOfWeek > 6) {
        throw new Error(`Invalid dayOfWeek at index ${index}: ${pattern.dayOfWeek}`);
      }
      if (pattern.successRate < 0 || pattern.successRate > 1) {
        throw new Error(`Invalid successRate at index ${index}: ${pattern.successRate}`);
      }

      return pattern;
    });
  }

  /**
   * Remove patterns older than maxAge
   * @param patterns Array of patterns to clean
   * @returns Array of patterns within age limit
   */
  private cleanupOldPatterns(patterns: BookingPattern[]): BookingPattern[] {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.maxAge);

    return patterns.filter(pattern => 
      pattern.lastUpdated > cutoffDate
    );
  }

  /**
   * Create backup of existing pattern file
   */
  private async createBackup(): Promise<void> {
    try {
      await fs.access(this.filePath);
      await fs.copyFile(this.filePath, this.backupPath);
      logger.debug('Created pattern file backup', 'PatternStorage');
    } catch (error) {
      // File doesn't exist, no need to backup
      logger.debug('No existing pattern file to backup', 'PatternStorage');
    }
  }

  /**
   * Load patterns from backup file
   * @returns Promise resolving to patterns from backup or empty array
   */
  private async loadFromBackup(): Promise<BookingPattern[]> {
    try {
      const data = await fs.readFile(this.backupPath, 'utf-8');
      const parsed = JSON.parse(data);
      const patterns = this.validateAndConvertPatterns(parsed);
      
      logger.info('Loaded patterns from backup', 'PatternStorage', {
        totalPatterns: patterns.length
      });
      
      return patterns;
    } catch (error) {
      logger.warn('Could not load from backup, starting fresh', 'PatternStorage', {
        error: (error as Error).message
      });
      return [];
    }
  }

  /**
   * Generate unique key for a pattern
   * @param pattern Booking pattern
   * @returns Unique key string
   */
  private getPatternKey(pattern: BookingPattern): string {
    return `${pattern.courtId}:${pattern.timeSlot}:${pattern.dayOfWeek}`;
  }
}