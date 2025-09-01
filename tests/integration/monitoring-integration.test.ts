/**
 * Integration tests for enhanced monitoring and observability features
 * Tests the complete monitoring stack working together
 */

import { correlationManager } from '@/utils/CorrelationManager';
import { performanceMonitor } from '@/utils/PerformanceMonitor';
import { logger } from '@/utils/logger';
import { healthCheckManager } from '@/monitoring/HealthCheckManager';
import { bookingAnalytics } from '@/monitoring/BookingAnalytics';
import { ConfigurationManager } from '@/utils/ConfigurationManager';
import { ErrorCategory } from '@/types/monitoring.types';
import { HealthStatus } from '@/types/health.types';

// Mock fetch for health checks
global.fetch = jest.fn();

describe('Monitoring Integration Tests', () => {
  let configManager: ConfigurationManager;
  const originalEnv = process.env;

  beforeAll(() => {
    process.env = {
      ...originalEnv,
      LOG_CORRELATION_ID: 'true',
      LOG_PERFORMANCE: 'true',
      PERFORMANCE_THRESHOLD_WARNING: '100',
      PERFORMANCE_THRESHOLD_ERROR: '500',
      HEALTH_CHECK_ENABLED: 'true',
      HEALTH_CHECK_INTERVAL: '60000',
      BOOKING_ANALYTICS_ENABLED: 'true'
    };

    configManager = ConfigurationManager.getInstance();
  });

  afterAll(() => {
    process.env = originalEnv;
    healthCheckManager.dispose();
  });

  beforeEach(() => {
    // Clear all monitoring data
    performanceMonitor.clearMetrics();
    bookingAnalytics.clearAnalyticsData();
    
    // Reset mocks
    jest.clearAllMocks();
    
    // Mock successful fetch
    (fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200
    });
  });

  describe('End-to-End Monitoring Flow', () => {
    it('should track complete booking operation with all monitoring features', async () => {
      // Simulate a complete booking operation
      await correlationManager.runWithNewContext(async () => {
        correlationManager.setComponent('BookingIntegrationTest');
        const correlationId = correlationManager.getCurrentCorrelationId()!;

        // Start overall operation timing
        const overallTimerId = logger.startTiming('integration_test_booking', 'BookingIntegrationTest');

        // Simulate booking steps
        const steps = [
          { name: 'authentication', duration: 150, success: true },
          { name: 'page_navigation', duration: 300, success: true },
          { name: 'slot_search', duration: 800, success: true },
          { name: 'booking_submission', duration: 1200, success: false, error: 'Slot unavailable' }
        ];

        for (const step of steps) {
          const stepTimerId = performanceMonitor.startBookingStep(step.name);
          
          // Simulate work
          await new Promise(resolve => setTimeout(resolve, 10));
          
          performanceMonitor.endBookingStep(stepTimerId, step.name, step.success, step.error);
          
          if (step.success) {
            logger.info(`Step ${step.name} completed successfully`, 'BookingIntegrationTest');
          } else {
            logger.logStructuredError(step.error!, ErrorCategory.BUSINESS_LOGIC, 'BookingIntegrationTest', {
              step: step.name
            });
          }
        }

        // Record final booking attempt
        bookingAnalytics.recordBookingAttempt({
          success: false,
          responseTime: 2450,
          retryCount: 1,
          error: 'Slot unavailable',
          errorCategory: ErrorCategory.BUSINESS_LOGIC
        });

        logger.endTiming(overallTimerId);

        // Verify correlation ID propagation
        expect(correlationId).toBeDefined();
        expect(correlationManager.getCurrentCorrelationId()).toBe(correlationId);

        // Verify performance tracking
        const performanceStats = performanceMonitor.getMetricsSummary();
        expect(performanceStats.totalMetrics).toBeGreaterThan(0);

        // Verify booking analytics
        const bookingStats = bookingAnalytics.getBookingSuccessMetrics();
        expect(bookingStats.totalAttempts).toBe(1);
        expect(bookingStats.successfulBookings).toBe(0);
        expect(bookingStats.errorBreakdown[ErrorCategory.BUSINESS_LOGIC]).toBe(1);

        // Verify logger integration
        const loggerStats = logger.getStats();
        expect(loggerStats.correlationEnabled).toBe(true);
        expect(loggerStats.performanceEnabled).toBe(true);
      });
    });

    it('should handle concurrent booking operations with separate correlation contexts', async () => {
      const operations = Array.from({ length: 3 }, (_, i) => 
        correlationManager.runWithNewContext(async () => {
          correlationManager.setComponent(`BookingOperation${i}`);
          const correlationId = correlationManager.getCurrentCorrelationId()!;

          const timerId = performanceMonitor.startTimer(`concurrent_operation_${i}`, `BookingOperation${i}`);
          
          // Simulate different operation durations
          await new Promise(resolve => setTimeout(resolve, (i + 1) * 20));
          
          performanceMonitor.endTimer(timerId);

          bookingAnalytics.recordBookingAttempt({
            success: i % 2 === 0, // Alternate success/failure
            responseTime: (i + 1) * 100,
            retryCount: 0
          });

          return correlationId;
        })
      );

      const correlationIds = await Promise.all(operations);

      // Verify each operation had unique correlation ID
      expect(new Set(correlationIds).size).toBe(3);

      // Verify all operations were tracked
      const performanceStats = performanceMonitor.getMetricsSummary();
      expect(performanceStats.totalMetrics).toBe(3);

      const bookingStats = bookingAnalytics.getBookingSuccessMetrics();
      expect(bookingStats.totalAttempts).toBe(3);
      expect(bookingStats.successfulBookings).toBe(2); // Operations 0 and 2 succeed
    });
  });

  describe('Configuration Integration', () => {
    it('should apply monitoring configuration changes across all components', () => {
      // Update monitoring configuration
      configManager.updateMonitoringConfig({
        enableCorrelationId: false,
        enablePerformanceLogging: false,
        performanceThresholdWarning: 200,
        performanceThresholdError: 1000
      });

      // Update health check configuration
      configManager.updateHealthCheckConfig({
        enabled: false,
        interval: 120000
      });

      // Verify configuration propagation
      expect(correlationManager.isEnabled()).toBe(false);
      expect(performanceMonitor.isEnabled()).toBe(false);
      
      const performanceConfig = performanceMonitor.getConfig();
      expect(performanceConfig.performanceThresholdWarning).toBe(200);
      expect(performanceConfig.performanceThresholdError).toBe(1000);

      const healthConfig = healthCheckManager.getConfig();
      expect(healthConfig.enabled).toBe(false);
      expect(healthConfig.interval).toBe(120000);

      // Reset for other tests
      configManager.updateMonitoringConfig({
        enableCorrelationId: true,
        enablePerformanceLogging: true
      });
    });

    it('should export complete configuration as environment variables', () => {
      const envVars = configManager.getEnvironmentVariables();

      // Verify monitoring variables are included
      expect(envVars.LOG_CORRELATION_ID).toBeDefined();
      expect(envVars.LOG_PERFORMANCE).toBeDefined();
      expect(envVars.PERFORMANCE_THRESHOLD_WARNING).toBeDefined();
      expect(envVars.PERFORMANCE_THRESHOLD_ERROR).toBeDefined();
      expect(envVars.HEALTH_CHECK_ENABLED).toBeDefined();
      expect(envVars.HEALTH_CHECK_INTERVAL).toBeDefined();
      expect(envVars.WEBSITE_URL).toBeDefined();
    });
  });

  describe('Health Check Integration', () => {
    it('should perform comprehensive system health check', async () => {
      // Add some performance metrics first
      const timerId = performanceMonitor.startTimer('health_check_prep', 'HealthIntegrationTest');
      performanceMonitor.endTimer(timerId);

      // Add booking analytics data
      bookingAnalytics.recordBookingAttempt({
        success: true,
        responseTime: 150,
        retryCount: 0
      });

      // Run health check
      const healthResult = await healthCheckManager.runFullHealthCheck();

      expect(healthResult.status).toBeDefined();
      expect(healthResult.checks).toHaveLength(4);
      expect(healthResult.metrics).toBeDefined();

      // Verify all check types are present
      const checkNames = healthResult.checks.map(check => check.name);
      expect(checkNames).toContain('system_resources');
      expect(checkNames).toContain('website_availability');
      expect(checkNames).toContain('application_health');
      expect(checkNames).toContain('performance_health');

      // Verify health check uses monitoring data
      const appHealthCheck = healthResult.checks.find(check => check.name === 'application_health');
      expect(appHealthCheck?.details?.totalBookingSteps).toBeGreaterThan(0);
    });

    it('should detect and report performance issues', async () => {
      // Create slow operations that exceed thresholds
      const slowTimerId = performanceMonitor.startTimer('slow_operation', 'IntegrationTest');
      await new Promise(resolve => setTimeout(resolve, 150)); // Exceed warning threshold (100ms)
      performanceMonitor.endTimer(slowTimerId);

      const verySlowTimerId = performanceMonitor.startTimer('very_slow_operation', 'IntegrationTest');
      await new Promise(resolve => setTimeout(resolve, 600)); // Exceed error threshold (500ms)
      performanceMonitor.endTimer(verySlowTimerId);

      const healthResult = await healthCheckManager.runFullHealthCheck();
      const performanceCheck = healthResult.checks.find(check => check.name === 'performance_health');

      expect(performanceCheck?.status).toBe(HealthStatus.UNHEALTHY);
      expect(performanceCheck?.details?.metricsAboveError).toBeGreaterThan(0);
    });
  });

  describe('Analytics Integration', () => {
    it('should provide comprehensive booking analytics with patterns', async () => {
      // Record multiple booking attempts with different patterns
      const bookingPatterns = [
        { courtId: 'court-1', startTime: '14:00', success: true, responseTime: 200 },
        { courtId: 'court-1', startTime: '14:00', success: true, responseTime: 180 },
        { courtId: 'court-2', startTime: '15:00', success: false, responseTime: 300 },
        { courtId: 'court-1', startTime: '16:00', success: true, responseTime: 220 }
      ];

      for (const pattern of bookingPatterns) {
        const attemptData = {
          courtId: pattern.courtId,
          startTime: pattern.startTime,
          success: pattern.success,
          responseTime: pattern.responseTime,
          retryCount: 0,
          ...(pattern.success ? {} : { errorCategory: ErrorCategory.NETWORK })
        };
        bookingAnalytics.recordBookingAttempt(attemptData);
      }

      // Get comprehensive analytics
      const analytics = bookingAnalytics.getBookingAnalytics(1); // Last hour
      
      expect(analytics.metrics.totalAttempts).toBe(4);
      expect(analytics.metrics.successfulBookings).toBe(3);
      expect(analytics.metrics.successRate).toBe(75);

      // Verify pattern analysis
      expect(analytics.patterns.courtUsage['court-1']).toBe(3);
      expect(analytics.patterns.courtUsage['court-2']).toBe(1);
      expect(analytics.patterns.preferredTimeSlots['14:00']).toBe(2);

      // Verify error analysis
      const errorAnalysis = bookingAnalytics.getErrorAnalysis(1);
      expect(errorAnalysis.totalErrors).toBe(1);
      expect(errorAnalysis.errorsByCategory[ErrorCategory.NETWORK]).toBe(1);
    });

    it('should track real-time metrics', () => {
      // Record recent booking attempts
      bookingAnalytics.recordBookingAttempt({
        success: true,
        responseTime: 150,
        retryCount: 0
      });

      bookingAnalytics.recordBookingAttempt({
        success: false,
        responseTime: 300,
        retryCount: 1,
        errorCategory: ErrorCategory.TIMEOUT
      });

      const realTimeMetrics = bookingAnalytics.getRealTimeMetrics();
      
      expect(realTimeMetrics.currentSuccessRate).toBe(50);
      expect(realTimeMetrics.averageResponseTime).toBe(225);
      expect(realTimeMetrics.recentErrors).toBe(1);
    });
  });

  describe('Error Handling and Recovery', () => {
    it('should handle monitoring component failures gracefully', async () => {
      // Simulate health check failure
      (fetch as jest.Mock).mockRejectedValue(new Error('Network unreachable'));

      const healthResult = await healthCheckManager.runFullHealthCheck();
      
      // Health check should still complete but report website as unhealthy
      expect(healthResult.checks).toHaveLength(4);
      const websiteCheck = healthResult.checks.find(check => check.name === 'website_availability');
      expect(websiteCheck?.status).toBe(HealthStatus.UNHEALTHY);
      expect(websiteCheck?.error).toContain('Network unreachable');
    });

    it('should maintain monitoring functionality when individual components fail', () => {
      // Even if correlation is disabled, other monitoring should work
      correlationManager.setEnabled(false);

      const timerId = performanceMonitor.startTimer('test_operation', 'TestComponent');
      const result = performanceMonitor.endTimer(timerId);

      expect(result).toBeDefined();
      expect(result!.duration).toBeGreaterThan(0);

      // Analytics should still work
      bookingAnalytics.recordBookingAttempt({
        success: true,
        responseTime: 100,
        retryCount: 0
      });

      const metrics = bookingAnalytics.getBookingSuccessMetrics();
      expect(metrics.totalAttempts).toBe(1);

      // Re-enable for other tests
      correlationManager.setEnabled(true);
    });
  });

  describe('Performance and Memory Management', () => {
    it('should manage memory usage with large amounts of monitoring data', () => {
      // Generate large amount of monitoring data
      for (let i = 0; i < 1500; i++) {
        const timerId = performanceMonitor.startTimer(`operation_${i}`, 'LoadTest');
        performanceMonitor.endTimer(timerId);

        bookingAnalytics.recordBookingAttempt({
          success: i % 3 === 0,
          responseTime: Math.random() * 1000,
          retryCount: 0
        });
      }

      // Verify memory limits are respected
      const performanceStats = performanceMonitor.getMetricsSummary();
      expect(performanceStats.totalMetrics).toBeLessThanOrEqual(1000); // Default max history

      const analyticsConfig = bookingAnalytics.getConfig();
      expect(analyticsConfig.currentDataSize).toBeLessThanOrEqual(1000); // Default max history
    });

    it('should perform efficiently under concurrent load', async () => {
      const startTime = Date.now();

      // Simulate concurrent monitoring operations
      const promises = Array.from({ length: 50 }, async (_, i) => {
        return correlationManager.runWithNewContext(async () => {
          const timerId = performanceMonitor.startTimer(`concurrent_${i}`, 'LoadTest');
          await new Promise(resolve => setTimeout(resolve, Math.random() * 10));
          performanceMonitor.endTimer(timerId);

          bookingAnalytics.recordBookingAttempt({
            success: Math.random() > 0.3,
            responseTime: Math.random() * 500,
            retryCount: 0
          });
        });
      });

      await Promise.all(promises);

      const endTime = Date.now();
      const totalTime = endTime - startTime;

      // Should complete relatively quickly (within 2 seconds)
      expect(totalTime).toBeLessThan(2000);

      // All operations should be tracked
      const performanceStats = performanceMonitor.getMetricsSummary();
      expect(performanceStats.totalMetrics).toBe(50);

      const bookingStats = bookingAnalytics.getBookingSuccessMetrics();
      expect(bookingStats.totalAttempts).toBe(50);
    });
  });

  describe('Cross-Component Data Flow', () => {
    it('should maintain data consistency across all monitoring components', async () => {
      const testCorrelationId = 'test-consistency-' + Date.now();

      await correlationManager.runWithNewContext(async () => {
        correlationManager.setCorrelationId(testCorrelationId);
        correlationManager.setComponent('ConsistencyTest');

        // Perform monitored operation
        const timerId = logger.startTiming('consistency_test', 'ConsistencyTest');
        
        // Simulate work
        await new Promise(resolve => setTimeout(resolve, 50));
        
        logger.endTiming(timerId);

        // Record booking attempt
        bookingAnalytics.recordBookingAttempt({
          success: true,
          responseTime: 50,
          retryCount: 0
        });

        // Verify correlation ID is present in all components
        const metadata = correlationManager.getMetadata();
        expect(metadata.correlationId).toBe(testCorrelationId);

        // Verify performance tracking has correlation ID
        const performanceStats = performanceMonitor.getMetricsSummary();
        expect(performanceStats.totalMetrics).toBeGreaterThan(0);

        // Verify logger stats include monitoring data
        const loggerStats = logger.getStats();
        expect(loggerStats.correlationEnabled).toBe(true);
        expect(loggerStats.performanceEnabled).toBe(true);
      });
    });

    it('should export unified monitoring data', () => {
      // Add data to all monitoring components
      const timerId = performanceMonitor.startTimer('export_test', 'ExportTest');
      performanceMonitor.endTimer(timerId);

      bookingAnalytics.recordBookingAttempt({
        success: true,
        responseTime: 100,
        retryCount: 0
      });

      // Export data from all components
      const exportedData = {
        performance: performanceMonitor.getMetricsSummary(),
        booking: bookingAnalytics.exportAnalyticsData(),
        logger: logger.getStats(),
        health: healthCheckManager.getSystemStatus(),
        configuration: configManager.getAllConfigurations()
      };

      expect(exportedData.performance).toBeDefined();
      expect(exportedData.booking).toBeDefined();
      expect(exportedData.logger).toBeDefined();
      expect(exportedData.health).toBeDefined();
      expect(exportedData.configuration).toBeDefined();

      // Verify data completeness
      expect(exportedData.booking.summary.totalAttempts).toBeGreaterThan(0);
      expect(exportedData.performance.totalMetrics).toBeGreaterThan(0);
      expect(exportedData.configuration.monitoring).toBeDefined();
      expect(exportedData.configuration.healthCheck).toBeDefined();
    });
  });
});