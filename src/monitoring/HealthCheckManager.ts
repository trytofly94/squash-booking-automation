/**
 * Health Check Manager for comprehensive system monitoring
 * Provides website availability, system health, and booking analytics
 */

import { Page } from '@playwright/test';
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

class HealthCheckManager {
  private config: HealthCheckConfig;
  private lastHealthCheck: SystemHealth | null = null;
  private healthCheckHistory: HealthCheckResult[] = [];
  private systemMetrics: SystemMetrics;
  private isRunning = false;
  private intervalId: NodeJS.Timer | null = null;

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
}

// Export singleton instance
export const healthCheckManager = new HealthCheckManager();
export { HealthCheckManager };