/**
 * Test fixtures for monitoring and observability tests
 * Provides mock data and utilities for consistent testing
 */

import { 
  CorrelationContext, 
  PerformanceMetric, 
  ErrorCategory, 
  StructuredError,
  MonitoringConfig 
} from '@/types/monitoring.types';
import { 
  HealthStatus, 
  HealthCheckResult, 
  SystemHealth, 
  HealthCheckConfig,
  BookingSuccessMetrics,
  BookingAnalytics
} from '@/types/health.types';

/**
 * Mock correlation contexts
 */
export const mockCorrelationContexts: CorrelationContext[] = [
  {
    correlationId: 'test-correlation-001',
    timestamp: 1693920000000,
    component: 'BookingManager',
    userId: 'user123',
    sessionId: 'session456'
  },
  {
    correlationId: 'test-correlation-002',
    timestamp: 1693920060000,
    component: 'SlotSearcher',
    userId: 'user456',
    sessionId: 'session789'
  },
  {
    correlationId: 'test-correlation-003',
    timestamp: 1693920120000,
    component: 'PaymentProcessor'
  }
];

/**
 * Mock performance metrics
 */
export const mockPerformanceMetrics: PerformanceMetric[] = [
  {
    id: 'metric-001',
    name: 'booking_search',
    startTime: BigInt(1693920000000000000),
    endTime: BigInt(1693920000150000000),
    duration: 150,
    correlationId: 'test-correlation-001',
    component: 'SlotSearcher',
    metadata: { searchType: 'availability', courts: 5 }
  },
  {
    id: 'metric-002',
    name: 'payment_processing',
    startTime: BigInt(1693920000000000000),
    endTime: BigInt(1693920001200000000),
    duration: 1200,
    correlationId: 'test-correlation-002',
    component: 'PaymentProcessor',
    metadata: { amount: 25.50, currency: 'EUR' }
  },
  {
    id: 'metric-003',
    name: 'slot_booking',
    startTime: BigInt(1693920000000000000),
    endTime: BigInt(1693920000080000000),
    duration: 80,
    correlationId: 'test-correlation-003',
    component: 'BookingManager',
    metadata: { courtId: 'court-1', timeSlot: '14:00' }
  }
];

/**
 * Mock structured errors
 */
export const mockStructuredErrors: StructuredError[] = [
  {
    category: ErrorCategory.NETWORK,
    code: 'NET_001',
    message: 'Connection timeout while fetching court availability',
    correlationId: 'test-correlation-001',
    component: 'SlotSearcher',
    timestamp: 1693920000000,
    metadata: { url: 'https://api.example.com/courts', timeout: 5000 }
  },
  {
    category: ErrorCategory.VALIDATION,
    code: 'VAL_002',
    message: 'Invalid date format provided',
    correlationId: 'test-correlation-002',
    component: 'DateTimeCalculator',
    timestamp: 1693920060000,
    metadata: { providedDate: '2023-13-45', expectedFormat: 'YYYY-MM-DD' }
  },
  {
    category: ErrorCategory.BUSINESS_LOGIC,
    message: 'Selected court is not available for booking',
    correlationId: 'test-correlation-003',
    component: 'BookingManager',
    timestamp: 1693920120000,
    metadata: { courtId: 'court-3', requestedTime: '14:00', reason: 'maintenance' }
  }
];

/**
 * Mock monitoring configuration
 */
export const mockMonitoringConfig: MonitoringConfig = {
  enableCorrelationId: true,
  enablePerformanceLogging: true,
  performanceThresholdWarning: 1000,
  performanceThresholdError: 5000,
  metricsEnabled: true,
  maxMetricsHistory: 1000
};

/**
 * Mock health check configuration
 */
export const mockHealthCheckConfig: HealthCheckConfig = {
  enabled: true,
  interval: 300000,
  timeout: 30000,
  websiteUrl: 'https://test.example.com',
  retryAttempts: 3,
  alertThresholds: {
    responseTime: 2000,
    errorRate: 10,
    memoryUsage: 80
  }
};

/**
 * Mock health check results
 */
export const mockHealthCheckResults: HealthCheckResult[] = [
  {
    name: 'system_resources',
    status: HealthStatus.HEALTHY,
    timestamp: 1693920000000,
    duration: 25,
    message: 'Memory usage: 45.2%',
    details: {
      memoryUsage: {
        rss: 100000000,
        heapTotal: 50000000,
        heapUsed: 22600000,
        external: 5000000,
        arrayBuffers: 1000000
      },
      uptime: 3600,
      nodeVersion: 'v18.17.0',
      platform: 'linux'
    }
  },
  {
    name: 'website_availability',
    status: HealthStatus.HEALTHY,
    timestamp: 1693920000000,
    duration: 350,
    message: 'Response time: 350ms',
    details: {
      url: 'https://test.example.com',
      statusCode: 200,
      responseTime: 350
    }
  },
  {
    name: 'application_health',
    status: HealthStatus.DEGRADED,
    timestamp: 1693920000000,
    duration: 15,
    message: 'Recent failure rate above threshold',
    details: {
      correlationEnabled: true,
      performanceEnabled: true,
      totalBookingSteps: 100,
      successRate: 85,
      recentFailureRate: 15
    }
  },
  {
    name: 'performance_health',
    status: HealthStatus.HEALTHY,
    timestamp: 1693920000000,
    duration: 10,
    message: 'Average response time: 145.5ms',
    details: {
      totalMetrics: 250,
      averageDuration: 145.5,
      metricsAboveWarning: 12,
      metricsAboveError: 2
    }
  }
];

/**
 * Mock system health
 */
export const mockSystemHealth: SystemHealth = {
  status: HealthStatus.DEGRADED,
  timestamp: 1693920000000,
  version: '1.0.0',
  uptime: 3600,
  checks: mockHealthCheckResults,
  metrics: {
    memoryUsage: 45.2,
    responseTime: 145.5,
    errorRate: 15.0
  }
};

/**
 * Mock booking success metrics
 */
export const mockBookingSuccessMetrics: BookingSuccessMetrics = {
  totalAttempts: 50,
  successfulBookings: 42,
  failedBookings: 8,
  successRate: 84.0,
  averageResponseTime: 285.5,
  errorBreakdown: {
    [ErrorCategory.NETWORK]: 3,
    [ErrorCategory.BUSINESS_LOGIC]: 2,
    [ErrorCategory.TIMEOUT]: 2,
    [ErrorCategory.AUTHENTICATION]: 1
  },
  lastUpdated: 1693920000000
};

/**
 * Mock booking analytics
 */
export const mockBookingAnalytics: BookingAnalytics = {
  timeRange: {
    start: 1693833600000, // 24 hours ago
    end: 1693920000000
  },
  metrics: mockBookingSuccessMetrics,
  patterns: {
    preferredTimeSlots: {
      '14:00': 15,
      '15:00': 12,
      '16:00': 8,
      '13:00': 7
    },
    courtUsage: {
      'court-1': 18,
      'court-2': 12,
      'court-3': 10,
      'court-4': 8,
      'court-5': 4
    },
    dayOfWeekPatterns: {
      'Monday': 5,
      'Tuesday': 8,
      'Wednesday': 10,
      'Thursday': 12,
      'Friday': 15,
      'Saturday': 8,
      'Sunday': 4
    }
  },
  trends: {
    successRateOverTime: [
      { timestamp: 1693833600000, rate: 82.0 },
      { timestamp: 1693837200000, rate: 85.5 },
      { timestamp: 1693840800000, rate: 78.3 },
      { timestamp: 1693844400000, rate: 88.2 },
      { timestamp: 1693848000000, rate: 84.0 }
    ],
    responseTimeOverTime: [
      { timestamp: 1693833600000, time: 295.2 },
      { timestamp: 1693837200000, time: 278.8 },
      { timestamp: 1693840800000, time: 310.5 },
      { timestamp: 1693844400000, time: 265.1 },
      { timestamp: 1693848000000, time: 285.5 }
    ]
  }
};

/**
 * Mock environment variables for testing
 */
export const mockEnvironmentVariables = {
  LOG_CORRELATION_ID: 'true',
  LOG_PERFORMANCE: 'true',
  PERFORMANCE_THRESHOLD_WARNING: '1000',
  PERFORMANCE_THRESHOLD_ERROR: '5000',
  METRICS_ENABLED: 'true',
  MAX_METRICS_HISTORY: '1000',
  HEALTH_CHECK_ENABLED: 'true',
  HEALTH_CHECK_INTERVAL: '300000',
  HEALTH_CHECK_TIMEOUT: '30000',
  WEBSITE_URL: 'https://test.example.com',
  HEALTH_CHECK_RETRIES: '3',
  ALERT_THRESHOLD_RESPONSE_TIME: '2000',
  ALERT_THRESHOLD_ERROR_RATE: '10',
  ALERT_THRESHOLD_MEMORY: '80',
  BOOKING_ANALYTICS_ENABLED: 'true',
  BOOKING_ANALYTICS_HISTORY: '1000'
};

/**
 * Utility functions for test data generation
 */
export class MockDataGenerator {
  /**
   * Generate random correlation ID
   */
  static generateCorrelationId(): string {
    return `test-correlation-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
  }

  /**
   * Generate mock performance metric
   */
  static generatePerformanceMetric(overrides: Partial<PerformanceMetric> = {}): PerformanceMetric {
    const baseTime = BigInt(Date.now() * 1000000);
    const duration = Math.floor(Math.random() * 1000) + 50;
    
    return {
      id: `metric-${Math.random().toString(36).substring(2, 8)}`,
      name: 'test_operation',
      startTime: baseTime,
      endTime: baseTime + BigInt(duration * 1000000),
      duration,
      correlationId: this.generateCorrelationId(),
      component: 'TestComponent',
      metadata: { test: true },
      ...overrides
    };
  }

  /**
   * Generate mock health check result
   */
  static generateHealthCheckResult(overrides: Partial<HealthCheckResult> = {}): HealthCheckResult {
    return {
      name: 'test_check',
      status: HealthStatus.HEALTHY,
      timestamp: Date.now(),
      duration: Math.floor(Math.random() * 100) + 10,
      message: 'Test check passed',
      details: { test: true },
      ...overrides
    };
  }

  /**
   * Generate mock structured error
   */
  static generateStructuredError(overrides: Partial<StructuredError> = {}): StructuredError {
    return {
      category: ErrorCategory.UNKNOWN,
      message: 'Test error occurred',
      correlationId: this.generateCorrelationId(),
      component: 'TestComponent',
      timestamp: Date.now(),
      metadata: { test: true },
      ...overrides
    };
  }

  /**
   * Generate multiple booking attempts for analytics testing
   */
  static generateBookingAttempts(count: number): Array<{
    success: boolean;
    responseTime: number;
    retryCount: number;
    courtId?: string;
    startTime?: string;
    error?: string;
    errorCategory?: ErrorCategory;
  }> {
    return Array.from({ length: count }, (_, _i) => ({
      success: Math.random() > 0.2, // 80% success rate
      responseTime: Math.floor(Math.random() * 500) + 100,
      retryCount: Math.floor(Math.random() * 3),
      courtId: `court-${Math.floor(Math.random() * 5) + 1}`,
      startTime: `${13 + Math.floor(Math.random() * 4)}:00`,
      error: Math.random() > 0.8 ? 'Random test error' : undefined,
      errorCategory: Math.random() > 0.8 ? ErrorCategory.NETWORK : undefined
    }));
  }

  /**
   * Generate performance metrics for load testing
   */
  static generatePerformanceMetrics(count: number): PerformanceMetric[] {
    return Array.from({ length: count }, (_, i) => 
      this.generatePerformanceMetric({
        name: `load_test_operation_${i}`,
        duration: Math.floor(Math.random() * 2000) + 50,
        component: `LoadTestComponent${Math.floor(i / 10)}`
      })
    );
  }
}

/**
 * Test helper functions
 */
export class MonitoringTestHelpers {
  /**
   * Create test environment with specific configuration
   */
  static setTestEnvironment(overrides: Record<string, string> = {}): Record<string, string> {
    const testEnv = {
      ...mockEnvironmentVariables,
      ...overrides
    };

    // Set environment variables
    Object.entries(testEnv).forEach(([key, value]) => {
      process.env[key] = value;
    });

    return testEnv;
  }

  /**
   * Clean up test environment
   */
  static cleanupTestEnvironment(originalEnv: Record<string, string | undefined>): void {
    Object.keys(mockEnvironmentVariables).forEach(key => {
      if (originalEnv[key] !== undefined) {
        process.env[key] = originalEnv[key];
      } else {
        delete process.env[key];
      }
    });
  }

  /**
   * Simulate system load for performance testing
   */
  static async simulateSystemLoad(operations: number = 100, concurrency: number = 10): Promise<void> {
    const batches = Math.ceil(operations / concurrency);
    
    for (let batch = 0; batch < batches; batch++) {
      const batchOperations = Math.min(concurrency, operations - (batch * concurrency));
      
      const promises = Array.from({ length: batchOperations }, async () => {
        // Simulate CPU work
        let sum = 0;
        for (let i = 0; i < 10000; i++) {
          sum += Math.random();
        }
        
        // Simulate async work
        await new Promise(resolve => setTimeout(resolve, Math.random() * 10));
        
        return sum;
      });
      
      await Promise.all(promises);
    }
  }

  /**
   * Wait for condition with timeout
   */
  static async waitForCondition(
    condition: () => boolean | Promise<boolean>,
    timeout: number = 5000,
    interval: number = 100
  ): Promise<void> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      if (await condition()) {
        return;
      }
      await new Promise(resolve => setTimeout(resolve, interval));
    }
    
    throw new Error(`Condition not met within ${timeout}ms`);
  }

  /**
   * Create mock fetch response for health checks
   */
  static createMockFetchResponse(
    ok: boolean = true,
    status: number = 200,
    delay: number = 0
  ): jest.Mock {
    return jest.fn().mockImplementation(() => 
      new Promise(resolve => {
        setTimeout(() => {
          resolve({
            ok,
            status,
            json: () => Promise.resolve({ test: true }),
            text: () => Promise.resolve('OK')
          });
        }, delay);
      })
    );
  }
}

export default {
  mockCorrelationContexts,
  mockPerformanceMetrics,
  mockStructuredErrors,
  mockMonitoringConfig,
  mockHealthCheckConfig,
  mockHealthCheckResults,
  mockSystemHealth,
  mockBookingSuccessMetrics,
  mockBookingAnalytics,
  mockEnvironmentVariables,
  MockDataGenerator,
  MonitoringTestHelpers
};