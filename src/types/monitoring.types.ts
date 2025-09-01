/**
 * Type definitions for enhanced monitoring and observability features
 */

export interface CorrelationContext {
  correlationId: string;
  timestamp: number;
  component?: string;
  userId?: string;
  sessionId?: string;
}

export interface PerformanceMetric {
  id: string;
  name: string;
  startTime: bigint;
  endTime?: bigint;
  duration?: number; // in milliseconds
  correlationId: string;
  component: string;
  metadata?: Record<string, unknown>;
}

export interface TimerResult {
  duration: number;
  metric: PerformanceMetric;
}

export enum ErrorCategory {
  NETWORK = 'network',
  RATE_LIMIT = 'rate_limit',
  SERVER_ERROR = 'server_error',
  CLIENT_ERROR = 'client_error',
  VALIDATION = 'validation',
  BUSINESS_LOGIC = 'business_logic',
  SYSTEM = 'system',
  AUTHENTICATION = 'authentication',
  TIMEOUT = 'timeout',
  UNKNOWN = 'unknown'
}

export interface StructuredError {
  category: ErrorCategory;
  code?: string;
  message: string;
  correlationId: string;
  component: string;
  stack?: string;
  metadata?: Record<string, unknown>;
  timestamp: number;
}

export interface LogMetadata extends Record<string, unknown> {
  correlationId?: string;
  component?: string;
  performanceMetric?: Partial<PerformanceMetric>;
  error?: StructuredError;
  userId?: string;
  sessionId?: string;
}

export interface MonitoringConfig {
  enableCorrelationId: boolean;
  enablePerformanceLogging: boolean;
  performanceThresholdWarning: number; // milliseconds
  performanceThresholdError: number; // milliseconds
  metricsEnabled: boolean;
  maxMetricsHistory: number;
}

export interface BookingStepMetrics {
  step: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  success: boolean;
  error?: string;
  correlationId: string;
}

export interface SystemResourceInfo {
  memoryUsage: {
    rss: number;
    heapTotal: number;
    heapUsed: number;
    external: number;
    arrayBuffers: number;
  };
  uptime: number;
  cpuUsage?: NodeJS.CpuUsage;
  nodeVersion: string;
  platform: string;
}