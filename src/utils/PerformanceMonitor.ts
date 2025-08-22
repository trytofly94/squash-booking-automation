/**
 * Performance Monitor for tracking execution times and system metrics
 * Provides detailed performance insights for booking operations
 */

import { v4 as uuidv4 } from 'uuid';
import { PerformanceMetric, TimerResult, MonitoringConfig, BookingStepMetrics, SystemResourceInfo } from '@/types/monitoring.types';
import { correlationManager } from './CorrelationManager';

class PerformanceMonitor {
  private activeTimers: Map<string, PerformanceMetric>;
  private completedMetrics: PerformanceMetric[];
  private bookingSteps: BookingStepMetrics[];
  private config: MonitoringConfig;
  private maxHistorySize: number;

  constructor() {
    this.activeTimers = new Map();
    this.completedMetrics = [];
    this.bookingSteps = [];
    this.maxHistorySize = parseInt(process.env['MAX_METRICS_HISTORY'] || '1000', 10);
    
    this.config = {
      enableCorrelationId: process.env['LOG_CORRELATION_ID']?.toLowerCase() === 'true',
      enablePerformanceLogging: process.env['LOG_PERFORMANCE']?.toLowerCase() === 'true',
      performanceThresholdWarning: parseInt(process.env['PERFORMANCE_THRESHOLD_WARNING'] || '5000', 10),
      performanceThresholdError: parseInt(process.env['PERFORMANCE_THRESHOLD_ERROR'] || '10000', 10),
      metricsEnabled: process.env['METRICS_ENABLED']?.toLowerCase() === 'true',
      maxMetricsHistory: this.maxHistorySize
    };
  }

  /**
   * Start a performance timer
   */
  startTimer(name: string, component: string, metadata?: Record<string, unknown>): string {
    if (!this.config.enablePerformanceLogging) {
      return '';
    }

    const id = uuidv4();
    const correlationId = correlationManager.getCurrentCorrelationId() || correlationManager.generateCorrelationId();
    
    const metric: PerformanceMetric = {
      id,
      name,
      startTime: process.hrtime.bigint(),
      correlationId,
      component,
      metadata
    };

    this.activeTimers.set(id, metric);
    return id;
  }

  /**
   * End a performance timer and return result
   */
  endTimer(timerId: string): TimerResult | null {
    if (!this.config.enablePerformanceLogging || !timerId) {
      return null;
    }

    const metric = this.activeTimers.get(timerId);
    if (!metric) {
      return null;
    }

    metric.endTime = process.hrtime.bigint();
    metric.duration = Number(metric.endTime - metric.startTime) / 1_000_000; // Convert to milliseconds

    this.activeTimers.delete(timerId);
    this.addCompletedMetric(metric);

    return {
      duration: metric.duration,
      metric
    };
  }

  /**
   * Measure execution time of a function
   */
  measureFunction<T>(
    name: string,
    component: string,
    fn: () => T,
    metadata?: Record<string, unknown>
  ): { result: T; duration: number } {
    if (!this.config.enablePerformanceLogging) {
      return { result: fn(), duration: 0 };
    }

    const timerId = this.startTimer(name, component, metadata);
    const startTime = Date.now();
    
    try {
      const result = fn();
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      this.endTimer(timerId);
      return { result, duration };
    } catch (error) {
      this.endTimer(timerId);
      throw error;
    }
  }

  /**
   * Measure execution time of an async function
   */
  async measureAsyncFunction<T>(
    name: string,
    component: string,
    fn: () => Promise<T>,
    metadata?: Record<string, unknown>
  ): Promise<{ result: T; duration: number }> {
    if (!this.config.enablePerformanceLogging) {
      return { result: await fn(), duration: 0 };
    }

    const timerId = this.startTimer(name, component, metadata);
    const startTime = Date.now();
    
    try {
      const result = await fn();
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      this.endTimer(timerId);
      return { result, duration };
    } catch (error) {
      this.endTimer(timerId);
      throw error;
    }
  }

  /**
   * Record a booking step with timing
   */
  recordBookingStep(
    step: string,
    success: boolean,
    duration?: number,
    error?: string,
    metadata?: Record<string, unknown>
  ): void {
    const correlationId = correlationManager.getCurrentCorrelationId() || 'unknown';
    const timestamp = Date.now();
    
    const stepMetric: BookingStepMetrics = {
      step,
      startTime: timestamp - (duration || 0),
      endTime: timestamp,
      duration,
      success,
      error,
      correlationId
    };

    this.bookingSteps.push(stepMetric);
    this.trimBookingSteps();
  }

  /**
   * Start tracking a booking step
   */
  startBookingStep(step: string): string {
    return this.startTimer(`booking_step_${step}`, 'BookingManager', { step });
  }

  /**
   * End tracking a booking step
   */
  endBookingStep(timerId: string, step: string, success: boolean, error?: string): void {
    const result = this.endTimer(timerId);
    if (result) {
      this.recordBookingStep(step, success, result.duration, error);
    }
  }

  /**
   * Get performance metrics summary
   */
  getMetricsSummary(component?: string): {
    totalMetrics: number;
    averageDuration: number;
    slowestOperation: PerformanceMetric | null;
    fastestOperation: PerformanceMetric | null;
    metricsAboveWarningThreshold: number;
    metricsAboveErrorThreshold: number;
  } {
    let metrics = this.completedMetrics;
    
    if (component) {
      metrics = metrics.filter(m => m.component === component);
    }

    if (metrics.length === 0) {
      return {
        totalMetrics: 0,
        averageDuration: 0,
        slowestOperation: null,
        fastestOperation: null,
        metricsAboveWarningThreshold: 0,
        metricsAboveErrorThreshold: 0
      };
    }

    const durations = metrics.map(m => m.duration || 0);
    const averageDuration = durations.reduce((sum, d) => sum + d, 0) / durations.length;
    const slowestOperation = metrics.reduce((slowest, current) => 
      (current.duration || 0) > (slowest.duration || 0) ? current : slowest
    );
    const fastestOperation = metrics.reduce((fastest, current) => 
      (current.duration || 0) < (fastest.duration || 0) ? current : fastest
    );

    const metricsAboveWarningThreshold = metrics.filter(m => 
      (m.duration || 0) > this.config.performanceThresholdWarning
    ).length;
    const metricsAboveErrorThreshold = metrics.filter(m => 
      (m.duration || 0) > this.config.performanceThresholdError
    ).length;

    return {
      totalMetrics: metrics.length,
      averageDuration,
      slowestOperation,
      fastestOperation,
      metricsAboveWarningThreshold,
      metricsAboveErrorThreshold
    };
  }

  /**
   * Get booking steps summary
   */
  getBookingStepsSummary(): {
    totalSteps: number;
    successfulSteps: number;
    failedSteps: number;
    successRate: number;
    averageDuration: number;
    stepBreakdown: Record<string, { count: number; successRate: number; avgDuration: number }>;
  } {
    const totalSteps = this.bookingSteps.length;
    const successfulSteps = this.bookingSteps.filter(s => s.success).length;
    const failedSteps = totalSteps - successfulSteps;
    const successRate = totalSteps > 0 ? (successfulSteps / totalSteps) * 100 : 0;
    
    const durations = this.bookingSteps.filter(s => s.duration).map(s => s.duration!);
    const averageDuration = durations.length > 0 ? durations.reduce((sum, d) => sum + d, 0) / durations.length : 0;

    const stepBreakdown: Record<string, { count: number; successRate: number; avgDuration: number }> = {};
    
    for (const step of this.bookingSteps) {
      if (!stepBreakdown[step.step]) {
        stepBreakdown[step.step] = { count: 0, successRate: 0, avgDuration: 0 };
      }
      stepBreakdown[step.step].count++;
    }

    // Calculate success rates and average durations for each step
    for (const [stepName, info] of Object.entries(stepBreakdown)) {
      const stepMetrics = this.bookingSteps.filter(s => s.step === stepName);
      const successfulCount = stepMetrics.filter(s => s.success).length;
      info.successRate = (successfulCount / info.count) * 100;
      
      const stepDurations = stepMetrics.filter(s => s.duration).map(s => s.duration!);
      info.avgDuration = stepDurations.length > 0 ? 
        stepDurations.reduce((sum, d) => sum + d, 0) / stepDurations.length : 0;
    }

    return {
      totalSteps,
      successfulSteps,
      failedSteps,
      successRate,
      averageDuration,
      stepBreakdown
    };
  }

  /**
   * Get system resource information
   */
  getSystemResourceInfo(): SystemResourceInfo {
    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();
    
    return {
      memoryUsage: {
        rss: memUsage.rss,
        heapTotal: memUsage.heapTotal,
        heapUsed: memUsage.heapUsed,
        external: memUsage.external,
        arrayBuffers: memUsage.arrayBuffers
      },
      uptime: process.uptime(),
      cpuUsage,
      nodeVersion: process.version,
      platform: process.platform
    };
  }

  /**
   * Clear all metrics (useful for testing)
   */
  clearMetrics(): void {
    this.activeTimers.clear();
    this.completedMetrics = [];
    this.bookingSteps = [];
  }

  /**
   * Get configuration
   */
  getConfig(): MonitoringConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<MonitoringConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Check if performance logging is enabled
   */
  isEnabled(): boolean {
    return this.config.enablePerformanceLogging;
  }

  /**
   * Check if a duration exceeds warning threshold
   */
  exceedsWarningThreshold(duration: number): boolean {
    return duration > this.config.performanceThresholdWarning;
  }

  /**
   * Check if a duration exceeds error threshold
   */
  exceedsErrorThreshold(duration: number): boolean {
    return duration > this.config.performanceThresholdError;
  }

  /**
   * Add completed metric to history
   */
  private addCompletedMetric(metric: PerformanceMetric): void {
    this.completedMetrics.push(metric);
    this.trimCompletedMetrics();
  }

  /**
   * Trim completed metrics to max history size
   */
  private trimCompletedMetrics(): void {
    if (this.completedMetrics.length > this.maxHistorySize) {
      this.completedMetrics = this.completedMetrics.slice(-this.maxHistorySize);
    }
  }

  /**
   * Trim booking steps to max history size
   */
  private trimBookingSteps(): void {
    if (this.bookingSteps.length > this.maxHistorySize) {
      this.bookingSteps = this.bookingSteps.slice(-this.maxHistorySize);
    }
  }
}

// Export singleton instance
export const performanceMonitor = new PerformanceMonitor();
export { PerformanceMonitor };