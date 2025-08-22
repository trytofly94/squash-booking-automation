/**
 * Health Check Manager for comprehensive system monitoring
 * Provides website availability, system health, and booking analytics
 */

// Page import removed as it's unused
import { 
  HealthStatus, 
  HealthCheckResult, 
  SystemHealth, 
  WebsiteAvailabilityCheck, 
  HealthCheckConfig, 
  SystemMetrics 
} from '@/types/health.types';
import { performanceMonitor } from '@/utils/PerformanceMonitor';
import { correlationManager } from '@/utils/CorrelationManager';
import { logger } from '@/utils/logger';
import { ErrorCategory } from '@/types/monitoring.types';

class HealthCheckManager {
  private config: HealthCheckConfig;
  private lastHealthCheck: SystemHealth | null = null;
  private healthCheckHistory: HealthCheckResult[] = [];
  private systemMetrics: SystemMetrics;
  private isRunning = false;
  private intervalId: NodeJS.Timeout | null = null;

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
    logger.info('Starting periodic health checks', 'HealthCheckManager', {
      interval: this.config.interval,
      websiteUrl: this.config.websiteUrl
    });

    // Run initial health check
    this.runFullHealthCheck().catch(error => {
      logger.logStructuredError(error, ErrorCategory.SYSTEM, 'HealthCheckManager', {
        operation: 'initial_health_check'
      });
    });

    // Schedule periodic checks
    this.intervalId = setInterval(() => {
      this.runFullHealthCheck().catch(error => {
        logger.logStructuredError(error, ErrorCategory.SYSTEM, 'HealthCheckManager', {
          operation: 'periodic_health_check'
        });
      });
    }, this.config.interval);
  }

  /**
   * Stop periodic health checks
   */
  stopPeriodicHealthChecks(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
    logger.info('Stopped periodic health checks', 'HealthCheckManager');
  }

  /**
   * Run comprehensive health check
   */
  async runFullHealthCheck(): Promise<SystemHealth> {
    const correlationId = correlationManager.getCurrentCorrelationId() || correlationManager.generateCorrelationId();
    const timerId = logger.startTiming('full_health_check', 'HealthCheckManager');

    try {
      logger.info('Running full health check', 'HealthCheckManager', { correlationId });

      const checks: HealthCheckResult[] = [];

      // System resource check
      checks.push(await this.checkSystemResources());

      // Website availability check
      checks.push(await this.checkWebsiteAvailability());

      // Application health check
      checks.push(await this.checkApplicationHealth());

      // Performance health check
      checks.push(await this.checkPerformanceHealth());

      // Determine overall status
      const overallStatus = this.determineOverallStatus(checks);
      
      // Update metrics
      this.updateSystemMetrics();

      const health: SystemHealth = {
        status: overallStatus,
        timestamp: Date.now(),
        version: process.env['npm_package_version'] || '1.0.0',
        uptime: process.uptime(),
        checks,
        metrics: {
          memoryUsage: this.systemMetrics.memoryUsage.percentage,
          responseTime: this.systemMetrics.averageResponseTime,
          errorRate: this.systemMetrics.errorRate
        }
      };

      this.lastHealthCheck = health;
      this.addToHistory(checks);

      logger.info('Health check completed', 'HealthCheckManager', {
        status: overallStatus,
        checksCount: checks.length,
        failedChecks: checks.filter(c => c.status === HealthStatus.UNHEALTHY).length
      });

      return health;
    } catch (error) {
      logger.logStructuredError(error instanceof Error ? error : String(error), ErrorCategory.SYSTEM, 'HealthCheckManager', {
        operation: 'full_health_check'
      });
      throw error;
    } finally {
      logger.endTiming(timerId);
    }
  }

  /**
   * Check system resources
   */
  async checkSystemResources(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    
    try {
      const resourceInfo = performanceMonitor.getSystemResourceInfo();
      const memoryUsagePercent = (resourceInfo.memoryUsage.heapUsed / resourceInfo.memoryUsage.heapTotal) * 100;
      
      const status = memoryUsagePercent > this.config.alertThresholds.memoryUsage 
        ? HealthStatus.DEGRADED 
        : HealthStatus.HEALTHY;

      return {
        name: 'system_resources',
        status,
        timestamp: Date.now(),
        duration: Date.now() - startTime,
        message: `Memory usage: ${memoryUsagePercent.toFixed(2)}%`,
        details: {
          memoryUsage: resourceInfo.memoryUsage,
          uptime: resourceInfo.uptime,
          nodeVersion: resourceInfo.nodeVersion,
          platform: resourceInfo.platform
        }
      };
    } catch (error) {
      return {
        name: 'system_resources',
        status: HealthStatus.UNHEALTHY,
        timestamp: Date.now(),
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Check website availability
   */
  async checkWebsiteAvailability(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    
    try {
      const availabilityCheck = await this.performWebsiteCheck();
      
      const status = availabilityCheck.status === HealthStatus.HEALTHY 
        ? HealthStatus.HEALTHY 
        : availabilityCheck.responseTime > this.config.alertThresholds.responseTime
        ? HealthStatus.DEGRADED
        : HealthStatus.UNHEALTHY;

      return {
        name: 'website_availability',
        status,
        timestamp: Date.now(),
        duration: Date.now() - startTime,
        message: `Response time: ${availabilityCheck.responseTime}ms`,
        details: {
          url: availabilityCheck.url,
          statusCode: availabilityCheck.statusCode,
          responseTime: availabilityCheck.responseTime
        },
        ...(availabilityCheck.error !== undefined && { error: availabilityCheck.error })
      };
    } catch (error) {
      return {
        name: 'website_availability',
        status: HealthStatus.UNHEALTHY,
        timestamp: Date.now(),
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Check application health
   */
  async checkApplicationHealth(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    
    try {
      // Check if core components are healthy
      const correlationEnabled = correlationManager.isEnabled();
      const performanceEnabled = performanceMonitor.isEnabled();
      const loggerStats = logger.getStats();
      
      // Check if any critical errors occurred recently
      const bookingMetrics = loggerStats.bookingMetrics;
      const recentFailureRate = bookingMetrics.totalSteps > 0 
        ? ((bookingMetrics.failedSteps / bookingMetrics.totalSteps) * 100)
        : 0;

      const status = recentFailureRate > this.config.alertThresholds.errorRate
        ? HealthStatus.DEGRADED
        : HealthStatus.HEALTHY;

      return {
        name: 'application_health',
        status,
        timestamp: Date.now(),
        duration: Date.now() - startTime,
        message: `Application components operational`,
        details: {
          correlationEnabled,
          performanceEnabled,
          totalBookingSteps: bookingMetrics.totalSteps,
          successRate: bookingMetrics.successRate,
          recentFailureRate
        }
      };
    } catch (error) {
      return {
        name: 'application_health',
        status: HealthStatus.UNHEALTHY,
        timestamp: Date.now(),
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Check performance health
   */
  async checkPerformanceHealth(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    
    try {
      const performanceSummary = performanceMonitor.getMetricsSummary();
      
      const status = performanceSummary.metricsAboveErrorThreshold > 0
        ? HealthStatus.UNHEALTHY
        : performanceSummary.metricsAboveWarningThreshold > 0
        ? HealthStatus.DEGRADED
        : HealthStatus.HEALTHY;

      return {
        name: 'performance_health',
        status,
        timestamp: Date.now(),
        duration: Date.now() - startTime,
        message: `Average response time: ${performanceSummary.averageDuration.toFixed(2)}ms`,
        details: {
          totalMetrics: performanceSummary.totalMetrics,
          averageDuration: performanceSummary.averageDuration,
          metricsAboveWarning: performanceSummary.metricsAboveWarningThreshold,
          metricsAboveError: performanceSummary.metricsAboveErrorThreshold
        }
      };
    } catch (error) {
      return {
        name: 'performance_health',
        status: HealthStatus.UNHEALTHY,
        timestamp: Date.now(),
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Perform website availability check using fetch
   */
  private async performWebsiteCheck(): Promise<WebsiteAvailabilityCheck> {
    const startTime = Date.now();
    
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);
      
      const response = await fetch(this.config.websiteUrl, {
        method: 'HEAD',
        signal: controller.signal,
        headers: {
          'User-Agent': 'SquashBooking-HealthCheck/1.0'
        }
      });
      
      clearTimeout(timeoutId);
      const responseTime = Date.now() - startTime;
      
      return {
        url: this.config.websiteUrl,
        status: response.ok ? HealthStatus.HEALTHY : HealthStatus.DEGRADED,
        responseTime,
        statusCode: response.status,
        timestamp: Date.now()
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      return {
        url: this.config.websiteUrl,
        status: HealthStatus.UNHEALTHY,
        responseTime,
        timestamp: Date.now(),
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Determine overall health status from individual checks
   */
  private determineOverallStatus(checks: HealthCheckResult[]): HealthStatus {
    const unhealthyCount = checks.filter(c => c.status === HealthStatus.UNHEALTHY).length;
    const degradedCount = checks.filter(c => c.status === HealthStatus.DEGRADED).length;
    
    if (unhealthyCount > 0) {
      return HealthStatus.UNHEALTHY;
    } else if (degradedCount > 0) {
      return HealthStatus.DEGRADED;
    } else {
      return HealthStatus.HEALTHY;
    }
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
   * Update system metrics
   */
  private updateSystemMetrics(): void {
    const resourceInfo = performanceMonitor.getSystemResourceInfo();
    const performanceSummary = performanceMonitor.getMetricsSummary();
    const bookingMetrics = performanceMonitor.getBookingStepsSummary();
    
    this.systemMetrics = {
      memoryUsage: {
        used: resourceInfo.memoryUsage.heapUsed,
        total: resourceInfo.memoryUsage.heapTotal,
        percentage: (resourceInfo.memoryUsage.heapUsed / resourceInfo.memoryUsage.heapTotal) * 100
      },
      uptime: resourceInfo.uptime,
      averageResponseTime: performanceSummary.averageDuration,
      errorRate: bookingMetrics.totalSteps > 0 ? ((bookingMetrics.failedSteps / bookingMetrics.totalSteps) * 100) : 0,
      requestCount: performanceSummary.totalMetrics,
      lastRequestTime: Date.now()
    };
  }

  /**
   * Add health check results to history
   */
  private addToHistory(checks: HealthCheckResult[]): void {
    this.healthCheckHistory.push(...checks);
    
    // Keep only last 100 checks
    if (this.healthCheckHistory.length > 100) {
      this.healthCheckHistory = this.healthCheckHistory.slice(-100);
    }
  }

  /**
   * Get last health check result
   */
  getLastHealthCheck(): SystemHealth | null {
    return this.lastHealthCheck;
  }

  /**
   * Get health check history
   */
  getHealthCheckHistory(): HealthCheckResult[] {
    return [...this.healthCheckHistory];
  }

  /**
   * Get current configuration
   */
  getConfig(): HealthCheckConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<HealthCheckConfig>): void {
    this.config = { ...this.config, ...newConfig };
    
    if (this.config.enabled && !this.isRunning) {
      this.startPeriodicHealthChecks();
    } else if (!this.config.enabled && this.isRunning) {
      this.stopPeriodicHealthChecks();
    }
  }

  /**
   * Manual health check trigger
   */
  async triggerHealthCheck(): Promise<SystemHealth> {
    logger.info('Manual health check triggered', 'HealthCheckManager');
    return await this.runFullHealthCheck();
  }

  /**
   * Get system status summary
   */
  getSystemStatus(): {
    isHealthy: boolean;
    status: HealthStatus;
    lastCheckTime: number | null;
    nextCheckTime: number | null;
    checksRunning: boolean;
  } {
    return {
      isHealthy: this.lastHealthCheck?.status === HealthStatus.HEALTHY,
      status: this.lastHealthCheck?.status || HealthStatus.UNHEALTHY,
      lastCheckTime: this.lastHealthCheck?.timestamp || null,
      nextCheckTime: this.isRunning ? Date.now() + this.config.interval : null,
      checksRunning: this.isRunning
    };
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    this.stopPeriodicHealthChecks();
    this.healthCheckHistory = [];
    this.lastHealthCheck = null;
  }
}

// Export singleton instance
export const healthCheckManager = new HealthCheckManager();
export { HealthCheckManager };