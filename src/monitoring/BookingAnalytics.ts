/**
 * Booking Analytics for tracking success rates, patterns, and trends
 * Provides comprehensive insights into booking performance and behavior
 */

import { BookingSuccessMetrics, BookingAnalytics } from '@/types/health.types';
// performanceMonitor import removed as it's unused
import { correlationManager } from '@/utils/CorrelationManager';
import { logger } from '@/utils/logger';
import { ErrorCategory } from '@/types/monitoring.types';

interface BookingAttempt {
  id: string;
  timestamp: number;
  correlationId: string;
  courtId?: string;
  date?: string;
  startTime?: string;
  duration?: number;
  success: boolean;
  error?: string;
  errorCategory?: ErrorCategory;
  responseTime: number;
  retryCount: number;
}

interface BookingPattern {
  timeSlot: string;
  courtId: string;
  dayOfWeek: string;
  date: string;
  success: boolean;
  responseTime: number;
}

class BookingAnalyticsManager {
  private bookingAttempts: BookingAttempt[] = [];
  private bookingPatterns: BookingPattern[] = [];
  private maxHistorySize: number;
  private enabled: boolean;

  constructor() {
    this.maxHistorySize = parseInt(process.env['BOOKING_ANALYTICS_HISTORY'] || '1000', 10);
    this.enabled = process.env['BOOKING_ANALYTICS_ENABLED']?.toLowerCase() !== 'false';
  }

  /**
   * Record a booking attempt
   */
  recordBookingAttempt({
    courtId,
    date,
    startTime,
    duration,
    success,
    error,
    errorCategory,
    responseTime,
    retryCount = 0
  }: {
    courtId?: string;
    date?: string;
    startTime?: string;
    duration?: number;
    success: boolean;
    error?: string;
    errorCategory?: ErrorCategory;
    responseTime: number;
    retryCount?: number;
  }): void {
    if (!this.enabled) {
      return;
    }

    const correlationId = correlationManager.getCurrentCorrelationId() || correlationManager.generateCorrelationId();
    const timestamp = Date.now();

    const attempt: BookingAttempt = {
      id: `${correlationId}-${timestamp}`,
      timestamp,
      correlationId,
      ...(courtId !== undefined && { courtId }),
      ...(date !== undefined && { date }),
      ...(startTime !== undefined && { startTime }),
      ...(duration !== undefined && { duration }),
      success,
      ...(error !== undefined && { error }),
      ...(errorCategory !== undefined && { errorCategory }),
      responseTime,
      retryCount
    };

    this.bookingAttempts.push(attempt);
    this.trimBookingAttempts();

    // Record pattern if successful
    if (success && courtId && date && startTime) {
      this.recordBookingPattern({
        courtId,
        date,
        startTime,
        success,
        responseTime
      });
    }

    logger.info('Booking attempt recorded', 'BookingAnalytics', {
      correlationId,
      success,
      responseTime,
      retryCount,
      courtId,
      date,
      startTime
    });
  }

  /**
   * Record a successful booking with enhanced detection details
   */
  recordSuccess({
    confirmationId,
    detectionMethod,
    timestamp,
    metadata
  }: {
    confirmationId: string;
    detectionMethod: string;
    timestamp: Date;
    metadata?: any;
  }): void {
    if (!this.enabled) {
      return;
    }

    const correlationId = correlationManager.getCurrentCorrelationId() || correlationManager.generateCorrelationId();
    
    logger.info('Booking success recorded with enhanced detection', 'BookingAnalytics', {
      correlationId,
      confirmationId,
      detectionMethod,
      timestamp,
      metadata
    });

    // Also record as a successful booking attempt for overall metrics
    this.recordBookingAttempt({
      success: true,
      responseTime: 0, // Not applicable for success recording
      retryCount: 0
    });
  }

  /**
   * Record a booking pattern
   */
  private recordBookingPattern({
    courtId,
    date,
    startTime,
    success,
    responseTime
  }: {
    courtId: string;
    date: string;
    startTime: string;
    success: boolean;
    responseTime: number;
  }): void {
    const dateObj = new Date(date);
    const dayOfWeek = dateObj.toLocaleDateString('en-US', { weekday: 'long' });

    const pattern: BookingPattern = {
      timeSlot: startTime,
      courtId,
      dayOfWeek,
      date,
      success,
      responseTime
    };

    this.bookingPatterns.push(pattern);
    this.trimBookingPatterns();
  }

  /**
   * Get booking success metrics
   */
  getBookingSuccessMetrics(timeRangeHours?: number): BookingSuccessMetrics {
    const cutoffTime = timeRangeHours ? Date.now() - (timeRangeHours * 60 * 60 * 1000) : 0;
    const relevantAttempts = this.bookingAttempts.filter(attempt => attempt.timestamp >= cutoffTime);

    const totalAttempts = relevantAttempts.length;
    const successfulBookings = relevantAttempts.filter(a => a.success).length;
    const failedBookings = totalAttempts - successfulBookings;
    const successRate = totalAttempts > 0 ? (successfulBookings / totalAttempts) * 100 : 0;

    const responseTimes = relevantAttempts.map(a => a.responseTime);
    const averageResponseTime = responseTimes.length > 0 
      ? responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length 
      : 0;

    // Error breakdown by category
    const errorBreakdown: Record<string, number> = {};
    relevantAttempts
      .filter(a => !a.success && a.errorCategory)
      .forEach(a => {
        const category = a.errorCategory!;
        errorBreakdown[category] = (errorBreakdown[category] || 0) + 1;
      });

    return {
      totalAttempts,
      successfulBookings,
      failedBookings,
      successRate,
      averageResponseTime,
      errorBreakdown,
      lastUpdated: Date.now()
    };
  }

  /**
   * Get comprehensive booking analytics
   */
  getBookingAnalytics(timeRangeHours = 24): BookingAnalytics {
    const timeRange = {
      start: Date.now() - (timeRangeHours * 60 * 60 * 1000),
      end: Date.now()
    };

    const metrics = this.getBookingSuccessMetrics(timeRangeHours);
    const patterns = this.analyzePatterns(timeRange.start);
    const trends = this.analyzeTrends(timeRange.start);

    return {
      timeRange,
      metrics,
      patterns,
      trends
    };
  }

  /**
   * Analyze booking patterns
   */
  private analyzePatterns(sinceTimestamp: number): {
    preferredTimeSlots: Record<string, number>;
    courtUsage: Record<string, number>;
    dayOfWeekPatterns: Record<string, number>;
  } {
    const relevantPatterns = this.bookingPatterns.filter(p => 
      new Date(p.date).getTime() >= sinceTimestamp && p.success
    );

    const preferredTimeSlots: Record<string, number> = {};
    const courtUsage: Record<string, number> = {};
    const dayOfWeekPatterns: Record<string, number> = {};

    relevantPatterns.forEach(pattern => {
      // Time slot preferences
      preferredTimeSlots[pattern.timeSlot] = (preferredTimeSlots[pattern.timeSlot] || 0) + 1;
      
      // Court usage
      courtUsage[pattern.courtId] = (courtUsage[pattern.courtId] || 0) + 1;
      
      // Day of week patterns
      dayOfWeekPatterns[pattern.dayOfWeek] = (dayOfWeekPatterns[pattern.dayOfWeek] || 0) + 1;
    });

    return {
      preferredTimeSlots,
      courtUsage,
      dayOfWeekPatterns
    };
  }

  /**
   * Analyze trends over time
   */
  private analyzeTrends(sinceTimestamp: number): {
    successRateOverTime: Array<{ timestamp: number; rate: number }>;
    responseTimeOverTime: Array<{ timestamp: number; time: number }>;
  } {
    const relevantAttempts = this.bookingAttempts.filter(a => a.timestamp >= sinceTimestamp);
    
    // Group by hour for trend analysis
    const hourlyData: Record<number, { attempts: BookingAttempt[]; hour: number }> = {};
    
    relevantAttempts.forEach(attempt => {
      const hour = Math.floor(attempt.timestamp / (60 * 60 * 1000)) * (60 * 60 * 1000);
      if (!hourlyData[hour]) {
        hourlyData[hour] = { attempts: [], hour };
      }
      hourlyData[hour].attempts.push(attempt);
    });

    const successRateOverTime: Array<{ timestamp: number; rate: number }> = [];
    const responseTimeOverTime: Array<{ timestamp: number; time: number }> = [];

    Object.values(hourlyData)
      .sort((a, b) => a.hour - b.hour)
      .forEach(({ attempts, hour }) => {
        const successfulCount = attempts.filter(a => a.success).length;
        const successRate = attempts.length > 0 ? (successfulCount / attempts.length) * 100 : 0;
        
        const avgResponseTime = attempts.length > 0 
          ? attempts.reduce((sum, a) => sum + a.responseTime, 0) / attempts.length 
          : 0;

        successRateOverTime.push({ timestamp: hour, rate: successRate });
        responseTimeOverTime.push({ timestamp: hour, time: avgResponseTime });
      });

    return {
      successRateOverTime,
      responseTimeOverTime
    };
  }

  /**
   * Get most successful booking patterns
   */
  getMostSuccessfulPatterns(limit = 10): Array<{
    pattern: string;
    successRate: number;
    totalAttempts: number;
    averageResponseTime: number;
  }> {
    const patternStats: Record<string, {
      attempts: number;
      successes: number;
      totalResponseTime: number;
    }> = {};

    this.bookingAttempts.forEach(attempt => {
      if (attempt.courtId && attempt.startTime) {
        const patternKey = `${attempt.courtId}-${attempt.startTime}`;
        
        if (!patternStats[patternKey]) {
          patternStats[patternKey] = { attempts: 0, successes: 0, totalResponseTime: 0 };
        }
        
        patternStats[patternKey].attempts++;
        patternStats[patternKey].totalResponseTime += attempt.responseTime;
        
        if (attempt.success) {
          patternStats[patternKey].successes++;
        }
      }
    });

    return Object.entries(patternStats)
      .map(([pattern, stats]) => ({
        pattern,
        successRate: (stats.successes / stats.attempts) * 100,
        totalAttempts: stats.attempts,
        averageResponseTime: stats.totalResponseTime / stats.attempts
      }))
      .filter(item => item.totalAttempts >= 2) // Only include patterns with at least 2 attempts
      .sort((a, b) => b.successRate - a.successRate)
      .slice(0, limit);
  }

  /**
   * Get error analysis
   */
  getErrorAnalysis(timeRangeHours = 24): {
    totalErrors: number;
    errorsByCategory: Record<string, number>;
    errorsByTimeOfDay: Record<string, number>;
    mostCommonErrors: Array<{ error: string; count: number; category?: ErrorCategory }>;
  } {
    const cutoffTime = Date.now() - (timeRangeHours * 60 * 60 * 1000);
    const failedAttempts = this.bookingAttempts.filter(a => 
      !a.success && a.timestamp >= cutoffTime
    );

    const totalErrors = failedAttempts.length;
    
    const errorsByCategory: Record<string, number> = {};
    const errorsByTimeOfDay: Record<string, number> = {};
    const errorCounts: Record<string, { count: number; category?: ErrorCategory }> = {};

    failedAttempts.forEach(attempt => {
      // Category breakdown
      if (attempt.errorCategory) {
        errorsByCategory[attempt.errorCategory] = (errorsByCategory[attempt.errorCategory] || 0) + 1;
      }
      
      // Time of day breakdown
      const hour = new Date(attempt.timestamp).getHours();
      const timeSlot = `${hour}:00-${hour + 1}:00`;
      errorsByTimeOfDay[timeSlot] = (errorsByTimeOfDay[timeSlot] || 0) + 1;
      
      // Error message counts
      if (attempt.error) {
        if (!errorCounts[attempt.error]) {
          errorCounts[attempt.error] = { 
            count: 0, 
            ...(attempt.errorCategory !== undefined && { category: attempt.errorCategory })
          };
        }
        errorCounts[attempt.error]!.count++;
      }
    });

    const mostCommonErrors = Object.entries(errorCounts)
      .map(([error, data]) => ({ 
        error, 
        count: data.count, 
        ...(data.category !== undefined && { category: data.category })
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      totalErrors,
      errorsByCategory,
      errorsByTimeOfDay,
      mostCommonErrors
    };
  }

  /**
   * Export analytics data
   */
  exportAnalyticsData(): {
    bookingAttempts: BookingAttempt[];
    bookingPatterns: BookingPattern[];
    summary: BookingSuccessMetrics;
    analytics: BookingAnalytics;
  } {
    return {
      bookingAttempts: [...this.bookingAttempts],
      bookingPatterns: [...this.bookingPatterns],
      summary: this.getBookingSuccessMetrics(),
      analytics: this.getBookingAnalytics()
    };
  }

  /**
   * Clear analytics data
   */
  clearAnalyticsData(): void {
    this.bookingAttempts = [];
    this.bookingPatterns = [];
    logger.info('Analytics data cleared', 'BookingAnalytics');
  }

  /**
   * Get analytics configuration
   */
  getConfig(): {
    enabled: boolean;
    maxHistorySize: number;
    currentDataSize: number;
  } {
    return {
      enabled: this.enabled,
      maxHistorySize: this.maxHistorySize,
      currentDataSize: this.bookingAttempts.length
    };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<{ enabled: boolean; maxHistorySize: number }>): void {
    if (config.enabled !== undefined) {
      this.enabled = config.enabled;
    }
    if (config.maxHistorySize !== undefined) {
      this.maxHistorySize = config.maxHistorySize;
      this.trimBookingAttempts();
      this.trimBookingPatterns();
    }

    logger.info('BookingAnalytics configuration updated', 'BookingAnalytics', config);
  }

  /**
   * Trim booking attempts to max history size
   */
  private trimBookingAttempts(): void {
    if (this.bookingAttempts.length > this.maxHistorySize) {
      this.bookingAttempts = this.bookingAttempts.slice(-this.maxHistorySize);
    }
  }

  /**
   * Trim booking patterns to max history size
   */
  private trimBookingPatterns(): void {
    if (this.bookingPatterns.length > this.maxHistorySize) {
      this.bookingPatterns = this.bookingPatterns.slice(-this.maxHistorySize);
    }
  }

  /**
   * Get real-time booking metrics
   */
  getRealTimeMetrics(): {
    currentSuccessRate: number;
    averageResponseTime: number;
    recentErrors: number;
    activeBookingProcesses: number;
  } {
    // Get metrics for the last hour
    const lastHour = Date.now() - (60 * 60 * 1000);
    const recentAttempts = this.bookingAttempts.filter(a => a.timestamp >= lastHour);
    
    const successfulCount = recentAttempts.filter(a => a.success).length;
    const currentSuccessRate = recentAttempts.length > 0 ? (successfulCount / recentAttempts.length) * 100 : 0;
    
    const responseTimes = recentAttempts.map(a => a.responseTime);
    const averageResponseTime = responseTimes.length > 0 
      ? responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length 
      : 0;
    
    const recentErrors = recentAttempts.filter(a => !a.success).length;
    
    // Get count of active booking processes (correlation IDs from last 10 minutes)
    const last10Minutes = Date.now() - (10 * 60 * 1000);
    const activeCorrelationIds = new Set(
      this.bookingAttempts
        .filter(a => a.timestamp >= last10Minutes)
        .map(a => a.correlationId)
    );
    
    return {
      currentSuccessRate,
      averageResponseTime,
      recentErrors,
      activeBookingProcesses: activeCorrelationIds.size
    };
  }
}

// Export singleton instance
export const bookingAnalytics = new BookingAnalyticsManager();
export { BookingAnalyticsManager };