/**
 * Health Check Manager for comprehensive system monitoring
 * Provides website availability, system health, and booking analytics
 */

import { 
  SystemHealth, 
  HealthCheckConfig, 
  SystemMetrics,
  HealthCheckResult,
  HealthStatus
} from '@/types/health.types';
import { performanceMonitor } from '@/utils/PerformanceMonitor';
import { logger } from '@/utils/logger';

class HealthCheckManager {
  private config: HealthCheckConfig;
  private lastHealthCheck: SystemHealth | null = null;
  private isRunning = false;
  private systemMetrics: SystemMetrics;
  private healthCheckHistory: SystemHealth[] = [];
  private periodicHealthCheckInterval?: NodeJS.Timeout;

  constructor() {
    this.config = {
      enabled: process.env['HEALTH_CHECK_ENABLED']?.toLowerCase() === 'true' || true,
      interval: parseInt(process.env['HEALTH_CHECK_INTERVAL'] || '300000', 10), // 5 minutes
      timeout: parseInt(process.env['HEALTH_CHECK_TIMEOUT'] || '30000', 10), // 30 seconds
      websiteUrl: process.env['WEBSITE_URL'] || 'https://www.eversports.de/sb/sportcenter-kautz?sport=squash',
      retryAttempts: parseInt(process.env['HEALTH_CHECK_RETRIES'] || '3', 10),
      alertThresholds: {
        responseTime: parseInt(process.env['ALERT_THRESHOLD_RESPONSE_TIME'] || '5000', 10),
        errorRate: parseFloat(process.env['ALERT_THRESHOLD_ERROR_RATE'] || '10'),
        memoryUsage: parseFloat(process.env['ALERT_THRESHOLD_MEMORY'] || '80')
      }
    };

    this.systemMetrics = this.initializeSystemMetrics();
    
    if (this.config.enabled) {
      this.startPeriodicHealthChecks();
    }
  }

  /**
   * Start periodic health checks
   */
  startPeriodicHealthChecks(): void {
    if (this.isRunning || !this.config.enabled) {
      return;
    }

    this.isRunning = true;
    
    // Set up periodic health checks
    this.periodicHealthCheckInterval = setInterval(() => {
      this.runFullHealthCheck().catch(error => {
        logger.error('Periodic health check failed', 'HealthCheckManager', { error: error.message });
      });
    }, this.config.interval);
    
    logger.info('Starting periodic health checks', 'HealthCheckManager', {
      interval: this.config.interval,
      websiteUrl: this.config.websiteUrl
    });
  }

  /**
   * Stop periodic health checks
   */
  stopPeriodicHealthChecks(): void {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    
    if (this.periodicHealthCheckInterval) {
      clearInterval(this.periodicHealthCheckInterval);
      this.periodicHealthCheckInterval = undefined;
    }

    logger.info('Stopped periodic health checks', 'HealthCheckManager');
  }

  /**
   * Initialize system metrics
   */
  private initializeSystemMetrics(): SystemMetrics {
    const resourceInfo = performanceMonitor.getSystemResourceInfo();
    
    return {
      memoryUsage: {
        used: resourceInfo.memoryUsage.heapUsed,
        total: resourceInfo.memoryUsage.heapTotal,
        percentage: (resourceInfo.memoryUsage.heapUsed / resourceInfo.memoryUsage.heapTotal) * 100
      },
      uptime: resourceInfo.uptime,
      averageResponseTime: 0,
      errorRate: 0,
      requestCount: 0,
      lastRequestTime: Date.now()
    };
  }

  /**
   * Get last health check result
   */
  getLastHealthCheck(): SystemHealth | null {
    return this.lastHealthCheck;
  }

  /**
   * Get current configuration
   */
  getConfig(): HealthCheckConfig {
    return { ...this.config };
  }

  /**
   * Get current system metrics
   */
  getSystemMetrics(): SystemMetrics {
    return { ...this.systemMetrics };
  }

  /**
   * Run full health check
   */
  async runFullHealthCheck(): Promise<SystemHealth> {
    const startTime = Date.now();
    const checks: HealthCheckResult[] = [];

    try {
      // System resource check
      const systemCheck = await this.checkSystemResources();
      checks.push(systemCheck);

      // Website availability check
      const websiteCheck = await this.checkWebsiteAvailability();
      checks.push(websiteCheck);

      // Application health check
      const appCheck = await this.checkApplicationHealth();
      checks.push(appCheck);

      // Performance health check
      const perfCheck = await this.checkPerformanceHealth();
      checks.push(perfCheck);

      // Determine overall status
      let overallStatus = HealthStatus.HEALTHY;
      if (checks.some(check => check.status === HealthStatus.UNHEALTHY)) {
        overallStatus = HealthStatus.UNHEALTHY;
      } else if (checks.some(check => check.status === HealthStatus.DEGRADED)) {
        overallStatus = HealthStatus.DEGRADED;
      }

      const systemHealth: SystemHealth = {
        status: overallStatus,
        timestamp: startTime,
        version: process.env['npm_package_version'] || '1.0.0',
        uptime: process.uptime(),
        checks,
        metrics: {
          memoryUsage: this.systemMetrics.memoryUsage.percentage,
          responseTime: this.systemMetrics.averageResponseTime,
          errorRate: this.systemMetrics.errorRate
        }
      };

      this.lastHealthCheck = systemHealth;
      this.healthCheckHistory.push(systemHealth);
      
      // Keep only last 100 health checks
      if (this.healthCheckHistory.length > 100) {
        this.healthCheckHistory = this.healthCheckHistory.slice(-100);
      }

      return systemHealth;
    } catch (error) {
      logger.error('Full health check failed', 'HealthCheckManager', { error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  /**
   * Trigger health check manually
   */
  async triggerHealthCheck(): Promise<SystemHealth> {
    return await this.runFullHealthCheck();
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<HealthCheckConfig>): void {
    this.config = { ...this.config, ...newConfig };
    
    // Restart periodic checks if configuration changed
    if (this.isRunning && (newConfig.interval || newConfig.enabled !== undefined)) {
      this.stopPeriodicHealthChecks();
      if (this.config.enabled) {
        this.startPeriodicHealthChecks();
      }
    }

    logger.info('HealthCheckManager configuration updated', 'HealthCheckManager', {
      updatedKeys: Object.keys(newConfig)
    });
  }

  /**
   * Get health check history
   */
  getHealthCheckHistory(): SystemHealth[] {
    return [...this.healthCheckHistory];
  }

  /**
   * Get system status summary
   */
  getSystemStatus(): { status: HealthStatus; lastCheck: SystemHealth | null; isRunning: boolean } {
    return {
      status: this.lastHealthCheck?.status || HealthStatus.HEALTHY,
      lastCheck: this.lastHealthCheck,
      isRunning: this.isRunning
    };
  }

  /**
   * Dispose and clean up
   */
  dispose(): void {
    this.stopPeriodicHealthChecks();
    this.healthCheckHistory = [];
    this.lastHealthCheck = null;
  }

  /**
   * Private method to check system resources
   */
  private async checkSystemResources(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    
    try {
      const resourceInfo = performanceMonitor.getSystemResourceInfo();
      const memoryUsagePercentage = (resourceInfo.memoryUsage.heapUsed / resourceInfo.memoryUsage.heapTotal) * 100;

      let status = HealthStatus.HEALTHY;
      if (memoryUsagePercentage > this.config.alertThresholds.memoryUsage) {
        status = HealthStatus.DEGRADED;
      }
      if (memoryUsagePercentage > 90) {
        status = HealthStatus.UNHEALTHY;
      }

      return {
        name: 'system_resources',
        status,
        timestamp: startTime,
        duration: Date.now() - startTime,
        details: {
          memoryUsage: {
            used: resourceInfo.memoryUsage.heapUsed,
            total: resourceInfo.memoryUsage.heapTotal,
            percentage: memoryUsagePercentage
          },
          uptime: resourceInfo.uptime
        }
      };
    } catch (error) {
      return {
        name: 'system_resources',
        status: HealthStatus.UNHEALTHY,
        timestamp: startTime,
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Private method to check website availability
   */
  private async checkWebsiteAvailability(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    
    try {
      const response = await fetch(this.config.websiteUrl, {
        method: 'HEAD',
        signal: AbortSignal.timeout(this.config.timeout)
      });

      let status = HealthStatus.HEALTHY;
      if (!response.ok) {
        status = response.status >= 500 ? HealthStatus.DEGRADED : HealthStatus.UNHEALTHY;
      }

      return {
        name: 'website_availability',
        status,
        timestamp: startTime,
        duration: Date.now() - startTime,
        details: {
          statusCode: response.status,
          url: this.config.websiteUrl
        }
      };
    } catch (error) {
      return {
        name: 'website_availability',
        status: HealthStatus.UNHEALTHY,
        timestamp: startTime,
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Private method to check application health
   */
  private async checkApplicationHealth(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    
    try {
      const loggerStats = logger.getStats();
      const bookingMetrics = loggerStats.bookingMetrics;

      let status = HealthStatus.HEALTHY;
      const failureRate = 100 - bookingMetrics.successRate;
      
      if (failureRate > this.config.alertThresholds.errorRate) {
        status = HealthStatus.DEGRADED;
      }
      if (failureRate > 50) {
        status = HealthStatus.UNHEALTHY;
      }

      return {
        name: 'application_health',
        status,
        timestamp: startTime,
        duration: Date.now() - startTime,
        details: {
          totalBookingSteps: bookingMetrics.totalSteps,
          successRate: bookingMetrics.successRate,
          recentFailureRate: failureRate
        }
      };
    } catch (error) {
      return {
        name: 'application_health',
        status: HealthStatus.UNHEALTHY,
        timestamp: startTime,
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Private method to check performance health
   */
  private async checkPerformanceHealth(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    
    try {
      const performanceMetrics = performanceMonitor.getMetricsSummary();

      let status = HealthStatus.HEALTHY;
      if (performanceMetrics.metricsAboveWarningThreshold > 0) {
        status = HealthStatus.DEGRADED;
      }
      if (performanceMetrics.metricsAboveErrorThreshold > 0) {
        status = HealthStatus.UNHEALTHY;
      }

      return {
        name: 'performance_health',
        status,
        timestamp: startTime,
        duration: Date.now() - startTime,
        details: {
          totalMetrics: performanceMetrics.totalMetrics,
          averageDuration: performanceMetrics.averageDuration,
          metricsAboveWarning: performanceMetrics.metricsAboveWarningThreshold,
          metricsAboveError: performanceMetrics.metricsAboveErrorThreshold
        }
      };
    } catch (error) {
      return {
        name: 'performance_health',
        status: HealthStatus.UNHEALTHY,
        timestamp: startTime,
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
}

// Export singleton instance
export const healthCheckManager = new HealthCheckManager();
export { HealthCheckManager };