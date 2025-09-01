import { BookingSuccessResult } from '@/types/booking.types';
import { logger } from './logger';

/**
 * Analytics and monitoring for success detection performance
 * Tracks effectiveness of different detection methods and provides insights
 */
export class SuccessDetectionAnalytics {
  private static readonly component = 'SuccessDetectionAnalytics';
  private static readonly metrics: Map<string, MethodMetrics> = new Map();

  /**
   * Track a success detection attempt and its outcome
   */
  static trackDetectionMethod(result: BookingSuccessResult): void {
    const analytics = {
      method: result.method,
      success: result.success,
      timestamp: result.timestamp,
      confirmationPresent: !!result.confirmationId,
      hasAdditionalData: !!result.additionalData
    };
    
    logger.info('Success detection analytics tracked', this.component, analytics);
    
    // Update internal metrics
    this.updateMethodMetrics(result);
    
    // Send to external monitoring if enabled
    if (process.env['MONITORING_ENABLED'] === 'true') {
      this.sendToMonitoring(analytics);
    }
  }

  /**
   * Track detection attempt timing for performance analysis
   */
  static trackDetectionTiming(
    method: string, 
    startTime: Date, 
    endTime: Date, 
    success: boolean
  ): void {
    const duration = endTime.getTime() - startTime.getTime();
    
    const timingData = {
      method,
      duration,
      success,
      timestamp: endTime
    };
    
    logger.debug('Detection timing tracked', this.component, timingData);
    
    // Update timing metrics
    const metrics = this.getOrCreateMethodMetrics(method);
    metrics.timings.push({ duration, success, timestamp: endTime });
    
    // Keep only last 100 timing records per method
    if (metrics.timings.length > 100) {
      metrics.timings = metrics.timings.slice(-100);
    }
  }

  /**
   * Generate effectiveness report for all detection methods
   */
  static generateMethodEffectivenessReport(): MethodEffectivenessReport {
    const report: MethodEffectivenessReport = {
      generatedAt: new Date(),
      totalAttempts: 0,
      overallSuccessRate: 0,
      methods: {}
    };

    let totalAttempts = 0;
    let totalSuccesses = 0;

    for (const [method, metrics] of this.metrics.entries()) {
      const methodAttempts = metrics.attempts;
      const methodSuccesses = metrics.successes;
      const successRate = methodAttempts > 0 ? (methodSuccesses / methodAttempts) : 0;
      
      // Calculate average timing
      const successfulTimings = metrics.timings
        .filter(t => t.success)
        .map(t => t.duration);
      
      const avgTiming = successfulTimings.length > 0 
        ? successfulTimings.reduce((a, b) => a + b, 0) / successfulTimings.length
        : 0;

      report.methods[method] = {
        attempts: methodAttempts,
        successes: methodSuccesses,
        successRate,
        averageTimingMs: Math.round(avgTiming),
        lastUsed: metrics.lastUsed,
        trend: this.calculateTrend(metrics)
      };

      totalAttempts += methodAttempts;
      totalSuccesses += methodSuccesses;
    }

    report.totalAttempts = totalAttempts;
    report.overallSuccessRate = totalAttempts > 0 ? (totalSuccesses / totalAttempts) : 0;

    logger.info('Method effectiveness report generated', this.component, {
      totalAttempts,
      overallSuccessRate: report.overallSuccessRate,
      methodCount: Object.keys(report.methods).length
    });

    return report;
  }

  /**
   * Get recommendations for optimizing detection strategy
   */
  static getOptimizationRecommendations(): OptimizationRecommendation[] {
    const report = this.generateMethodEffectivenessReport();
    const recommendations: OptimizationRecommendation[] = [];

    // Analyze method performance
    for (const [method, stats] of Object.entries(report.methods)) {
      if (stats.attempts > 10) { // Only analyze methods with sufficient data
        
        // Low success rate recommendation
        if (stats.successRate < 0.5) {
          recommendations.push({
            type: 'performance',
            priority: 'high',
            method,
            issue: `Low success rate: ${(stats.successRate * 100).toFixed(1)}%`,
            recommendation: `Consider reviewing ${method} detection logic or increasing timeouts`,
            impact: 'May cause missed successful bookings'
          });
        }
        
        // Slow timing recommendation
        if (stats.averageTimingMs > 10000) {
          recommendations.push({
            type: 'performance',
            priority: 'medium',
            method,
            issue: `Slow detection: ${stats.averageTimingMs}ms average`,
            recommendation: `Consider reducing timeout or optimizing ${method} detection`,
            impact: 'Slower booking confirmation process'
          });
        }

        // Declining trend recommendation
        if (stats.trend === 'declining') {
          recommendations.push({
            type: 'reliability',
            priority: 'medium',
            method,
            issue: 'Success rate is declining over time',
            recommendation: `Investigate recent changes in ${method} detection or website structure`,
            impact: 'Detection reliability may continue to degrade'
          });
        }
      }
    }

    // Overall strategy recommendations
    const networkStats = report.methods['network'];
    const domStats = report.methods['dom-attribute'];
    
    if (networkStats && domStats && networkStats.successRate < domStats.successRate) {
      recommendations.push({
        type: 'strategy',
        priority: 'low',
        method: 'overall',
        issue: 'DOM detection outperforming network detection',
        recommendation: 'Consider adjusting detection strategy priority order',
        impact: 'Could improve overall detection speed'
      });
    }

    logger.info('Optimization recommendations generated', this.component, {
      recommendationCount: recommendations.length,
      highPriority: recommendations.filter(r => r.priority === 'high').length
    });

    return recommendations;
  }

  /**
   * Reset all analytics data
   */
  static reset(): void {
    this.metrics.clear();
    logger.info('Analytics data reset', this.component);
  }

  /**
   * Export analytics data for external analysis
   */
  static exportData(): AnalyticsExport {
    const exportData: AnalyticsExport = {
      exportedAt: new Date(),
      metrics: {},
      summary: this.generateMethodEffectivenessReport()
    };

    for (const [method, metrics] of this.metrics.entries()) {
      exportData.metrics[method] = {
        attempts: metrics.attempts,
        successes: metrics.successes,
        failures: metrics.failures,
        firstUsed: metrics.firstUsed,
        lastUsed: metrics.lastUsed,
        timings: [...metrics.timings] // Create copy
      };
    }

    return exportData;
  }

  /**
   * Update metrics for a specific method
   */
  private static updateMethodMetrics(result: BookingSuccessResult): void {
    const metrics = this.getOrCreateMethodMetrics(result.method);
    
    metrics.attempts++;
    metrics.lastUsed = result.timestamp;
    
    if (result.success) {
      metrics.successes++;
    } else {
      metrics.failures++;
    }
  }

  /**
   * Get or create metrics object for a method
   */
  private static getOrCreateMethodMetrics(method: string): MethodMetrics {
    if (!this.metrics.has(method)) {
      this.metrics.set(method, {
        attempts: 0,
        successes: 0,
        failures: 0,
        firstUsed: new Date(),
        lastUsed: new Date(),
        timings: []
      });
    }
    return this.metrics.get(method)!;
  }

  /**
   * Calculate trend for method performance
   */
  private static calculateTrend(metrics: MethodMetrics): 'improving' | 'stable' | 'declining' {
    const timings = metrics.timings;
    if (timings.length < 10) {
      return 'stable'; // Not enough data
    }

    // Compare recent performance (last 25%) with earlier performance (first 25%)
    const quarterSize = Math.floor(timings.length / 4);
    const earlySuccess = timings.slice(0, quarterSize).filter(t => t.success).length;
    const recentSuccess = timings.slice(-quarterSize).filter(t => t.success).length;
    
    const earlyRate = earlySuccess / quarterSize;
    const recentRate = recentSuccess / quarterSize;
    
    if (recentRate > earlyRate + 0.1) return 'improving';
    if (recentRate < earlyRate - 0.1) return 'declining';
    return 'stable';
  }

  /**
   * Send analytics to external monitoring system
   */
  private static sendToMonitoring(analytics: any): void {
    // This would integrate with external monitoring systems
    // For now, just log that it would be sent
    logger.debug('Analytics would be sent to monitoring', this.component, {
      monitoringEnabled: true,
      dataPoints: Object.keys(analytics).length
    });
  }
}

// Type definitions for analytics data structures

interface MethodMetrics {
  attempts: number;
  successes: number;
  failures: number;
  firstUsed: Date;
  lastUsed: Date;
  timings: Array<{
    duration: number;
    success: boolean;
    timestamp: Date;
  }>;
}

interface MethodEffectivenessReport {
  generatedAt: Date;
  totalAttempts: number;
  overallSuccessRate: number;
  methods: {
    [method: string]: {
      attempts: number;
      successes: number;
      successRate: number;
      averageTimingMs: number;
      lastUsed: Date;
      trend: 'improving' | 'stable' | 'declining';
    };
  };
}

interface OptimizationRecommendation {
  type: 'performance' | 'reliability' | 'strategy';
  priority: 'high' | 'medium' | 'low';
  method: string;
  issue: string;
  recommendation: string;
  impact: string;
}

interface AnalyticsExport {
  exportedAt: Date;
  metrics: {
    [method: string]: {
      attempts: number;
      successes: number;
      failures: number;
      firstUsed: Date;
      lastUsed: Date;
      timings: Array<{
        duration: number;
        success: boolean;
        timestamp: Date;
      }>;
    };
  };
  summary: MethodEffectivenessReport;
}

// Export the analytics class as default and interfaces
export { 
  MethodEffectivenessReport, 
  OptimizationRecommendation, 
  AnalyticsExport 
};