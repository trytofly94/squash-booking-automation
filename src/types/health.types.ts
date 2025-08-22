/**
 * Type definitions for health check and system monitoring features
 */

export enum HealthStatus {
  HEALTHY = 'healthy',
  DEGRADED = 'degraded',
  UNHEALTHY = 'unhealthy'
}

export interface HealthCheckResult {
  name: string;
  status: HealthStatus;
  timestamp: number;
  duration: number; // milliseconds
  message?: string;
  details?: Record<string, unknown>;
  error?: string;
}

export interface SystemHealth {
  status: HealthStatus;
  timestamp: number;
  version: string;
  uptime: number;
  checks: HealthCheckResult[];
  metrics: {
    memoryUsage: number; // percentage
    responseTime: number; // average in ms
    errorRate: number; // percentage
  };
}

export interface WebsiteAvailabilityCheck {
  url: string;
  status: HealthStatus;
  responseTime: number;
  statusCode?: number;
  timestamp: number;
  error?: string;
}

export interface BookingSuccessMetrics {
  totalAttempts: number;
  successfulBookings: number;
  failedBookings: number;
  successRate: number; // percentage
  averageResponseTime: number; // milliseconds
  errorBreakdown: Record<string, number>; // error type -> count
  lastUpdated: number;
}

export interface SystemMetrics {
  memoryUsage: {
    used: number;
    total: number;
    percentage: number;
  };
  uptime: number;
  averageResponseTime: number;
  errorRate: number;
  requestCount: number;
  lastRequestTime: number;
}

export interface HealthCheckConfig {
  enabled: boolean;
  interval: number; // milliseconds
  timeout: number; // milliseconds
  websiteUrl: string;
  retryAttempts: number;
  alertThresholds: {
    responseTime: number; // milliseconds
    errorRate: number; // percentage
    memoryUsage: number; // percentage
  };
}

export interface BookingAnalytics {
  timeRange: {
    start: number;
    end: number;
  };
  metrics: BookingSuccessMetrics;
  patterns: {
    preferredTimeSlots: Record<string, number>; // time -> booking count
    courtUsage: Record<string, number>; // court -> booking count
    dayOfWeekPatterns: Record<string, number>; // day -> booking count
  };
  trends: {
    successRateOverTime: Array<{ timestamp: number; rate: number }>;
    responseTimeOverTime: Array<{ timestamp: number; time: number }>;
  };
}