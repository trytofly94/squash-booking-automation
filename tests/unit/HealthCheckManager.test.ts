/**
 * Tests for HealthCheckManager
 * Validates health checking functionality, system monitoring, and configuration management
 */

import { healthCheckManager, HealthCheckManager } from '@/monitoring/HealthCheckManager';
import { HealthStatus, /* HealthCheckResult, */ SystemHealth } from '@/types/health.types';
import { performanceMonitor } from '@/utils/PerformanceMonitor';
import { logger } from '@/utils/logger';

// Mock dependencies
jest.mock('@/utils/PerformanceMonitor');
jest.mock('@/utils/logger');
jest.mock('@/utils/CorrelationManager');

// Mock global fetch
global.fetch = jest.fn();

describe('HealthCheckManager', () => {
  let manager: HealthCheckManager;
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      HEALTH_CHECK_ENABLED: 'true',
      HEALTH_CHECK_INTERVAL: '60000',
      HEALTH_CHECK_TIMEOUT: '5000',
      WEBSITE_URL: 'https://test.example.com',
      HEALTH_CHECK_RETRIES: '2',
      ALERT_THRESHOLD_RESPONSE_TIME: '1000',
      ALERT_THRESHOLD_ERROR_RATE: '5',
      ALERT_THRESHOLD_MEMORY: '70'
    };

    // Reset mocks
    jest.clearAllMocks();
    
    // Mock performanceMonitor methods
    (performanceMonitor.getSystemResourceInfo as jest.Mock).mockReturnValue({
      memoryUsage: {
        rss: 100000000,
        heapTotal: 50000000,
        heapUsed: 30000000,
        external: 5000000,
        arrayBuffers: 1000000
      },
      uptime: 3600,
      nodeVersion: 'v18.0.0',
      platform: 'linux'
    });

    (performanceMonitor.getMetricsSummary as jest.Mock).mockReturnValue({
      totalMetrics: 10,
      averageDuration: 150,
      slowestOperation: null,
      fastestOperation: null,
      metricsAboveWarningThreshold: 1,
      metricsAboveErrorThreshold: 0
    });

    // Mock logger methods
    (logger.getStats as jest.Mock).mockReturnValue({
      bookingMetrics: {
        totalSteps: 20,
        successfulSteps: 18,
        failedSteps: 2,
        successRate: 90,
        averageDuration: 200
      }
    });

    manager = new HealthCheckManager();
  });

  afterEach(() => {
    process.env = originalEnv;
    manager.dispose();
  });

  describe('Configuration Loading', () => {
    it('should load configuration from environment variables', () => {
      const config = manager.getConfig();
      
      expect(config.enabled).toBe(true);
      expect(config.interval).toBe(60000);
      expect(config.timeout).toBe(5000);
      expect(config.websiteUrl).toBe('https://test.example.com');
      expect(config.retryAttempts).toBe(2);
      expect(config.alertThresholds.responseTime).toBe(1000);
      expect(config.alertThresholds.errorRate).toBe(5);
      expect(config.alertThresholds.memoryUsage).toBe(70);
    });

    it('should use default values when environment variables are not set', () => {
      process.env = {};
      const defaultManager = new HealthCheckManager();
      const config = defaultManager.getConfig();
      
      expect(config.enabled).toBe(true);
      expect(config.interval).toBe(300000); // 5 minutes
      expect(config.timeout).toBe(30000); // 30 seconds
      expect(config.websiteUrl).toContain('eversports.de');
      expect(config.retryAttempts).toBe(3);
      
      defaultManager.dispose();
    });
  });

  describe('System Resource Check', () => {
    it('should perform system resource check successfully', async () => {
      const result = await manager['checkSystemResources']();
      
      expect(result.name).toBe('system_resources');
      expect(result.status).toBe(HealthStatus.HEALTHY);
      expect(result.duration).toBeGreaterThan(0);
      expect(result.details).toBeDefined();
      expect(result.details?.memoryUsage).toBeDefined();
      expect(result.details?.uptime).toBe(3600);
    });

    it('should detect degraded system resources', async () => {
      // Mock high memory usage
      (performanceMonitor.getSystemResourceInfo as jest.Mock).mockReturnValue({
        memoryUsage: {
          rss: 100000000,
          heapTotal: 50000000,
          heapUsed: 45000000, // 90% usage
          external: 5000000,
          arrayBuffers: 1000000
        },
        uptime: 3600,
        nodeVersion: 'v18.0.0',
        platform: 'linux'
      });

      const result = await manager['checkSystemResources']();
      
      expect(result.status).toBe(HealthStatus.DEGRADED);
      expect(result.message).toContain('90.00%');
    });

    it('should handle system resource check errors', async () => {
      (performanceMonitor.getSystemResourceInfo as jest.Mock).mockImplementation(() => {
        throw new Error('System info unavailable');
      });

      const result = await manager['checkSystemResources']();
      
      expect(result.status).toBe(HealthStatus.UNHEALTHY);
      expect(result.error).toBe('System info unavailable');
    });
  });

  describe('Website Availability Check', () => {
    it('should perform successful website availability check', async () => {
      (fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200
      });

      const result = await manager['checkWebsiteAvailability']();
      
      expect(result.name).toBe('website_availability');
      expect(result.status).toBe(HealthStatus.HEALTHY);
      expect(result.details?.statusCode).toBe(200);
      expect(result.duration).toBeGreaterThan(0);
    });

    it('should detect degraded website availability', async () => {
      (fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 500
      });

      const result = await manager['checkWebsiteAvailability']();
      
      expect(result.status).toBe(HealthStatus.DEGRADED);
      expect(result.details?.statusCode).toBe(500);
    });

    it('should handle website availability check errors', async () => {
      (fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

      const result = await manager['checkWebsiteAvailability']();
      
      expect(result.status).toBe(HealthStatus.UNHEALTHY);
      expect(result.error).toBe('Network error');
    });

    it('should handle fetch timeout', async () => {
      (fetch as jest.Mock).mockImplementation(() => 
        new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Timeout')), 100);
        })
      );

      const result = await manager['checkWebsiteAvailability']();
      
      expect(result.status).toBe(HealthStatus.UNHEALTHY);
      expect(result.error).toContain('Timeout');
    });
  });

  describe('Application Health Check', () => {
    it('should perform successful application health check', async () => {
      const result = await manager['checkApplicationHealth']();
      
      expect(result.name).toBe('application_health');
      expect(result.status).toBe(HealthStatus.HEALTHY);
      expect(result.details?.totalBookingSteps).toBe(20);
      expect(result.details?.successRate).toBe(90);
    });

    it('should detect degraded application health', async () => {
      // Mock high failure rate
      (logger.getStats as jest.Mock).mockReturnValue({
        bookingMetrics: {
          totalSteps: 20,
          successfulSteps: 8,
          failedSteps: 12,
          successRate: 40,
          averageDuration: 200
        }
      });

      const result = await manager['checkApplicationHealth']();
      
      expect(result.status).toBe(HealthStatus.DEGRADED);
      expect(result.details?.recentFailureRate).toBe(60);
    });

    it('should handle application health check errors', async () => {
      (logger.getStats as jest.Mock).mockImplementation(() => {
        throw new Error('Stats unavailable');
      });

      const result = await manager['checkApplicationHealth']();
      
      expect(result.status).toBe(HealthStatus.UNHEALTHY);
      expect(result.error).toBe('Stats unavailable');
    });
  });

  describe('Performance Health Check', () => {
    it('should perform successful performance health check', async () => {
      const result = await manager['checkPerformanceHealth']();
      
      expect(result.name).toBe('performance_health');
      expect(result.status).toBe(HealthStatus.DEGRADED); // Due to metricsAboveWarningThreshold: 1
      expect(result.details?.totalMetrics).toBe(10);
      expect(result.details?.averageDuration).toBe(150);
    });

    it('should detect unhealthy performance', async () => {
      (performanceMonitor.getMetricsSummary as jest.Mock).mockReturnValue({
        totalMetrics: 10,
        averageDuration: 2000,
        slowestOperation: null,
        fastestOperation: null,
        metricsAboveWarningThreshold: 5,
        metricsAboveErrorThreshold: 2
      });

      const result = await manager['checkPerformanceHealth']();
      
      expect(result.status).toBe(HealthStatus.UNHEALTHY);
      expect(result.details?.metricsAboveError).toBe(2);
    });

    it('should handle performance health check errors', async () => {
      (performanceMonitor.getMetricsSummary as jest.Mock).mockImplementation(() => {
        throw new Error('Performance metrics unavailable');
      });

      const result = await manager['checkPerformanceHealth']();
      
      expect(result.status).toBe(HealthStatus.UNHEALTHY);
      expect(result.error).toBe('Performance metrics unavailable');
    });
  });

  describe('Full Health Check', () => {
    it('should run comprehensive health check', async () => {
      (fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200
      });

      const health = await manager.runFullHealthCheck();
      
      expect(health.status).toBeDefined();
      expect(health.timestamp).toBeCloseTo(Date.now(), -3);
      expect(health.version).toBeDefined();
      expect(health.uptime).toBeGreaterThan(0);
      expect(health.checks).toHaveLength(4);
      expect(health.metrics).toBeDefined();
      
      // Check that all expected checks are present
      const checkNames = health.checks.map(check => check.name);
      expect(checkNames).toContain('system_resources');
      expect(checkNames).toContain('website_availability');
      expect(checkNames).toContain('application_health');
      expect(checkNames).toContain('performance_health');
    });

    it('should determine overall status correctly', async () => {
      (fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200
      });

      const health = await manager.runFullHealthCheck();
      
      // With one degraded check (performance), overall should be degraded
      expect(health.status).toBe(HealthStatus.DEGRADED);
    });

    it('should handle errors in full health check', async () => {
      (performanceMonitor.getSystemResourceInfo as jest.Mock).mockImplementation(() => {
        throw new Error('System error');
      });

      await expect(manager.runFullHealthCheck()).rejects.toThrow('System error');
    });
  });

  describe('Configuration Updates', () => {
    it('should update configuration at runtime', () => {
      const newConfig = {
        interval: 120000,
        alertThresholds: {
          responseTime: 2000,
          errorRate: 15,
          memoryUsage: 85
        }
      };

      manager.updateConfig(newConfig);
      const config = manager.getConfig();
      
      expect(config.interval).toBe(120000);
      expect(config.alertThresholds.responseTime).toBe(2000);
      expect(config.alertThresholds.errorRate).toBe(15);
      expect(config.alertThresholds.memoryUsage).toBe(85);
    });

    it('should start health checks when enabled', () => {
      const startSpy = jest.spyOn(manager, 'startPeriodicHealthChecks');
      
      manager.updateConfig({ enabled: true });
      
      expect(startSpy).toHaveBeenCalled();
    });

    it('should stop health checks when disabled', () => {
      const stopSpy = jest.spyOn(manager, 'stopPeriodicHealthChecks');
      
      manager.updateConfig({ enabled: false });
      
      expect(stopSpy).toHaveBeenCalled();
    });
  });

  describe('Status and History', () => {
    it('should track health check history', async () => {
      (fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200
      });

      await manager.runFullHealthCheck();
      await manager.runFullHealthCheck();
      
      const history = manager.getHealthCheckHistory();
      expect(history.length).toBeGreaterThan(0);
    });

    it('should limit history size', async () => {
      (fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200
      });

      // Run many health checks
      for (let i = 0; i < 150; i++) {
        await manager.runFullHealthCheck();
      }
      
      const history = manager.getHealthCheckHistory();
      expect(history.length).toBeLessThanOrEqual(100); // Default max history
    });

    it('should provide system status summary', () => {
      const status = manager.getSystemStatus();
      
      expect(status.isHealthy).toBeDefined();
      expect(status.status).toBeDefined();
      expect(status.checksRunning).toBeDefined();
    });

    it('should get last health check result', async () => {
      (fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200
      });

      const health = await manager.runFullHealthCheck();
      const lastCheck = manager.getLastHealthCheck();
      
      expect(lastCheck).toEqual(health);
    });
  });

  describe('Periodic Health Checks', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should start periodic health checks', () => {
      manager.startPeriodicHealthChecks();
      
      expect(setInterval).toHaveBeenCalledWith(
        expect.any(Function),
        60000
      );
    });

    it('should stop periodic health checks', () => {
      manager.startPeriodicHealthChecks();
      manager.stopPeriodicHealthChecks();
      
      expect(clearInterval).toHaveBeenCalled();
    });

    it('should not start multiple intervals', () => {
      manager.startPeriodicHealthChecks();
      manager.startPeriodicHealthChecks();
      
      expect(setInterval).toHaveBeenCalledTimes(1);
    });
  });

  describe('Manual Health Check Trigger', () => {
    it('should trigger manual health check', async () => {
      (fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200
      });

      const health = await manager.triggerHealthCheck();
      
      expect(health).toBeDefined();
      expect(health.checks).toHaveLength(4);
    });
  });

  describe('Singleton Instance', () => {
    it('should use singleton pattern', () => {
      expect(healthCheckManager).toBeInstanceOf(HealthCheckManager);
    });
  });

  describe('Cleanup', () => {
    it('should clean up resources on dispose', () => {
      manager.startPeriodicHealthChecks();
      manager.dispose();
      
      const history = manager.getHealthCheckHistory();
      const lastCheck = manager.getLastHealthCheck();
      
      expect(history).toHaveLength(0);
      expect(lastCheck).toBeNull();
    });
  });
});