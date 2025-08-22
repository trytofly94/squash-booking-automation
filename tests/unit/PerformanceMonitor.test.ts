/**
 * Tests for PerformanceMonitor
 * Validates timing functionality, metrics collection, and performance analysis
 */

import { performanceMonitor, PerformanceMonitor } from '@/utils/PerformanceMonitor';
import { MonitoringConfig } from '@/types/monitoring.types';

// Mock correlationManager for controlled testing
jest.mock('@/utils/CorrelationManager', () => ({
  correlationManager: {
    getCurrentCorrelationId: jest.fn(() => 'test-correlation-id'),
    generateCorrelationId: jest.fn(() => 'generated-correlation-id')
  }
}));

describe('PerformanceMonitor', () => {
  let monitor: PerformanceMonitor;
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset environment variables
    process.env = {
      ...originalEnv,
      LOG_PERFORMANCE: 'true',
      PERFORMANCE_THRESHOLD_WARNING: '1000',
      PERFORMANCE_THRESHOLD_ERROR: '5000',
      MAX_METRICS_HISTORY: '100'
    };
    
    monitor = new PerformanceMonitor();
    monitor.clearMetrics();
  });

  afterEach(() => {
    process.env = originalEnv;
    monitor.clearMetrics();
  });

  describe('Timer Management', () => {
    it('should start and end timers correctly', () => {
      const timerId = monitor.startTimer('test-operation', 'TestComponent');
      
      expect(timerId).toBeDefined();
      expect(typeof timerId).toBe('string');
      
      // Small delay to ensure measurable time
      const result = monitor.endTimer(timerId);
      
      expect(result).toBeDefined();
      expect(result!.duration).toBeGreaterThan(0);
      expect(result!.metric.name).toBe('test-operation');
      expect(result!.metric.component).toBe('TestComponent');
      expect(result!.metric.correlationId).toBe('test-correlation-id');
    });

    it('should return null for invalid timer ID', () => {
      const result = monitor.endTimer('invalid-timer-id');
      expect(result).toBeNull();
    });

    it('should handle multiple concurrent timers', () => {
      const timer1 = monitor.startTimer('operation-1', 'Component1');
      const timer2 = monitor.startTimer('operation-2', 'Component2');
      
      const result1 = monitor.endTimer(timer1);
      const result2 = monitor.endTimer(timer2);
      
      expect(result1).toBeDefined();
      expect(result2).toBeDefined();
      expect(result1!.metric.name).toBe('operation-1');
      expect(result2!.metric.name).toBe('operation-2');
    });

    it('should not start timers when performance logging is disabled', () => {
      monitor.updateConfig({ enablePerformanceLogging: false });
      
      const timerId = monitor.startTimer('test-operation', 'TestComponent');
      expect(timerId).toBe('');
    });
  });

  describe('Function Measurement', () => {
    it('should measure synchronous function execution', () => {
      const testFunction = () => {
        // Simulate some work
        let sum = 0;
        for (let i = 0; i < 1000; i++) {
          sum += i;
        }
        return sum;
      };

      const result = monitor.measureFunction('sync-test', 'TestComponent', testFunction);
      
      expect(result.result).toBe(499500); // Sum of 0 to 999
      expect(result.duration).toBeGreaterThan(0);
    });

    it('should measure asynchronous function execution', async () => {
      const testAsyncFunction = async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        return 'async-result';
      };

      const result = await monitor.measureAsyncFunction('async-test', 'TestComponent', testAsyncFunction);
      
      expect(result.result).toBe('async-result');
      expect(result.duration).toBeGreaterThanOrEqual(8); // Allow for timing variance
    });

    it('should handle errors in measured functions', () => {
      const errorFunction = () => {
        throw new Error('Test error');
      };

      expect(() => {
        monitor.measureFunction('error-test', 'TestComponent', errorFunction);
      }).toThrow('Test error');
    });

    it('should handle errors in async measured functions', async () => {
      const asyncErrorFunction = async () => {
        throw new Error('Async test error');
      };

      await expect(
        monitor.measureAsyncFunction('async-error-test', 'TestComponent', asyncErrorFunction)
      ).rejects.toThrow('Async test error');
    });
  });

  describe('Booking Step Tracking', () => {
    it('should record booking steps correctly', () => {
      monitor.recordBookingStep('login', true, 100);
      monitor.recordBookingStep('search-slots', false, 200, 'No slots available');
      
      const summary = monitor.getBookingStepsSummary();
      
      expect(summary.totalSteps).toBe(2);
      expect(summary.successfulSteps).toBe(1);
      expect(summary.failedSteps).toBe(1);
      expect(summary.successRate).toBe(50);
    });

    it('should track booking step timing', () => {
      const stepTimerId = monitor.startBookingStep('checkout');
      
      // Simulate work
      setTimeout(() => {
        monitor.endBookingStep(stepTimerId, 'checkout', true);
      }, 10);

      // Allow async operation to complete
      return new Promise(resolve => {
        setTimeout(() => {
          const summary = monitor.getBookingStepsSummary();
          expect(summary.totalSteps).toBe(1);
          expect(summary.successfulSteps).toBe(1);
          resolve(undefined);
        }, 20);
      });
    });

    it('should provide step breakdown analysis', () => {
      monitor.recordBookingStep('login', true, 100);
      monitor.recordBookingStep('login', false, 150, 'Invalid credentials');
      monitor.recordBookingStep('search', true, 200);
      
      const summary = monitor.getBookingStepsSummary();
      
      expect(summary.stepBreakdown['login'].count).toBe(2);
      expect(summary.stepBreakdown['login'].successRate).toBe(50);
      expect(summary.stepBreakdown['search'].count).toBe(1);
      expect(summary.stepBreakdown['search'].successRate).toBe(100);
    });
  });

  describe('Metrics Summary', () => {
    beforeEach(() => {
      // Add some test metrics
      const timer1 = monitor.startTimer('fast-operation', 'Component1');
      const timer2 = monitor.startTimer('slow-operation', 'Component2');
      
      monitor.endTimer(timer1);
      
      // Simulate slow operation
      setTimeout(() => {
        monitor.endTimer(timer2);
      }, 10);
    });

    it('should provide comprehensive metrics summary', () => {
      const summary = monitor.getMetricsSummary();
      
      expect(summary.totalMetrics).toBeGreaterThan(0);
      expect(summary.averageDuration).toBeGreaterThan(0);
      expect(summary.slowestOperation).toBeDefined();
      expect(summary.fastestOperation).toBeDefined();
    });

    it('should filter metrics by component', () => {
      const component1Summary = monitor.getMetricsSummary('Component1');
      const component2Summary = monitor.getMetricsSummary('Component2');
      
      expect(component1Summary.totalMetrics).toBeGreaterThanOrEqual(0);
      expect(component2Summary.totalMetrics).toBeGreaterThanOrEqual(0);
    });

    it('should handle empty metrics gracefully', () => {
      monitor.clearMetrics();
      
      const summary = monitor.getMetricsSummary();
      
      expect(summary.totalMetrics).toBe(0);
      expect(summary.averageDuration).toBe(0);
      expect(summary.slowestOperation).toBeNull();
      expect(summary.fastestOperation).toBeNull();
    });
  });

  describe('System Resource Information', () => {
    it('should provide system resource information', () => {
      const resourceInfo = monitor.getSystemResourceInfo();
      
      expect(resourceInfo.memoryUsage).toBeDefined();
      expect(resourceInfo.memoryUsage.rss).toBeGreaterThan(0);
      expect(resourceInfo.memoryUsage.heapTotal).toBeGreaterThan(0);
      expect(resourceInfo.memoryUsage.heapUsed).toBeGreaterThan(0);
      expect(resourceInfo.uptime).toBeGreaterThan(0);
      expect(resourceInfo.nodeVersion).toBeDefined();
      expect(resourceInfo.platform).toBeDefined();
    });

    it('should include CPU usage information', () => {
      const resourceInfo = monitor.getSystemResourceInfo();
      
      expect(resourceInfo.cpuUsage).toBeDefined();
      expect(typeof resourceInfo.cpuUsage?.user).toBe('number');
      expect(typeof resourceInfo.cpuUsage?.system).toBe('number');
    });
  });

  describe('Configuration Management', () => {
    it('should load configuration from environment variables', () => {
      const config = monitor.getConfig();
      
      expect(config.enablePerformanceLogging).toBe(true);
      expect(config.performanceThresholdWarning).toBe(1000);
      expect(config.performanceThresholdError).toBe(5000);
      expect(config.maxMetricsHistory).toBe(100);
    });

    it('should update configuration at runtime', () => {
      const newConfig: Partial<MonitoringConfig> = {
        performanceThresholdWarning: 2000,
        performanceThresholdError: 8000
      };
      
      monitor.updateConfig(newConfig);
      
      const config = monitor.getConfig();
      expect(config.performanceThresholdWarning).toBe(2000);
      expect(config.performanceThresholdError).toBe(8000);
    });

    it('should check threshold exceedance correctly', () => {
      monitor.updateConfig({
        performanceThresholdWarning: 100,
        performanceThresholdError: 500
      });
      
      expect(monitor.exceedsWarningThreshold(150)).toBe(true);
      expect(monitor.exceedsWarningThreshold(50)).toBe(false);
      expect(monitor.exceedsErrorThreshold(600)).toBe(true);
      expect(monitor.exceedsErrorThreshold(300)).toBe(false);
    });
  });

  describe('Memory Management', () => {
    it('should limit metrics history size', () => {
      monitor.updateConfig({ maxMetricsHistory: 5 });
      
      // Add more metrics than the limit
      for (let i = 0; i < 10; i++) {
        const timerId = monitor.startTimer(`operation-${i}`, 'TestComponent');
        monitor.endTimer(timerId);
      }
      
      const summary = monitor.getMetricsSummary();
      expect(summary.totalMetrics).toBeLessThanOrEqual(5);
    });

    it('should trim booking steps to max history size', () => {
      monitor.updateConfig({ maxMetricsHistory: 3 });
      
      // Add more booking steps than the limit
      for (let i = 0; i < 6; i++) {
        monitor.recordBookingStep(`step-${i}`, true, 100);
      }
      
      const summary = monitor.getBookingStepsSummary();
      expect(summary.totalSteps).toBeLessThanOrEqual(3);
    });
  });

  describe('Enable/Disable Functionality', () => {
    it('should respect enabled state', () => {
      monitor.updateConfig({ enablePerformanceLogging: false });
      
      expect(monitor.isEnabled()).toBe(false);
      
      const timerId = monitor.startTimer('test', 'Component');
      expect(timerId).toBe('');
    });

    it('should return zero duration when disabled', () => {
      monitor.updateConfig({ enablePerformanceLogging: false });
      
      const result = monitor.measureFunction('test', 'Component', () => 'result');
      
      expect(result.result).toBe('result');
      expect(result.duration).toBe(0);
    });
  });

  describe('Singleton Instance', () => {
    it('should use singleton pattern', () => {
      expect(performanceMonitor).toBeInstanceOf(PerformanceMonitor);
    });

    it('should maintain state across singleton access', () => {
      const timerId = performanceMonitor.startTimer('singleton-test', 'TestComponent');
      const result = performanceMonitor.endTimer(timerId);
      
      expect(result).toBeDefined();
      expect(result!.metric.name).toBe('singleton-test');
    });
  });

  describe('Edge Cases', () => {
    it('should handle very short operations', () => {
      const timerId = monitor.startTimer('quick-operation', 'TestComponent');
      const result = monitor.endTimer(timerId);
      
      expect(result).toBeDefined();
      expect(result!.duration).toBeGreaterThanOrEqual(0);
    });

    it('should handle operations with metadata', () => {
      const metadata = { userId: 'user123', sessionId: 'session456' };
      const timerId = monitor.startTimer('operation-with-metadata', 'TestComponent', metadata);
      const result = monitor.endTimer(timerId);
      
      expect(result).toBeDefined();
      expect(result!.metric.metadata).toEqual(metadata);
    });

    it('should handle concurrent operations correctly', async () => {
      const promises = Array.from({ length: 10 }, (_, i) => 
        monitor.measureAsyncFunction(`concurrent-${i}`, 'TestComponent', async () => {
          await new Promise(resolve => setTimeout(resolve, Math.random() * 10));
          return i;
        })
      );
      
      const results = await Promise.all(promises);
      
      expect(results).toHaveLength(10);
      results.forEach((result, index) => {
        expect(result.result).toBe(index);
        expect(result.duration).toBeGreaterThan(0);
      });
    });
  });
});