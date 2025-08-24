import { SuccessDetectionAnalytics } from '../SuccessDetectionAnalytics';
import { BookingSuccessResult } from '@/types/booking.types';

// Mock logger to avoid console output during tests
jest.mock('../logger', () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }
}));

describe('SuccessDetectionAnalytics', () => {
  beforeEach(() => {
    // Reset analytics data before each test
    SuccessDetectionAnalytics.reset();
  });

  describe('trackDetectionMethod', () => {
    test('tracks successful network detection', () => {
      const result: BookingSuccessResult = {
        success: true,
        confirmationId: 'TEST123',
        method: 'network',
        timestamp: new Date(),
        additionalData: {
          networkResponse: { booking_id: 'TEST123' }
        }
      };

      // Should not throw
      expect(() => {
        SuccessDetectionAnalytics.trackDetectionMethod(result);
      }).not.toThrow();
    });

    test('tracks failed detection attempts', () => {
      const result: BookingSuccessResult = {
        success: false,
        method: 'dom-attribute',
        timestamp: new Date()
      };

      expect(() => {
        SuccessDetectionAnalytics.trackDetectionMethod(result);
      }).not.toThrow();
    });
  });

  describe('trackDetectionTiming', () => {
    test('tracks timing data for detection methods', () => {
      const startTime = new Date();
      const endTime = new Date(startTime.getTime() + 1000); // 1 second later

      expect(() => {
        SuccessDetectionAnalytics.trackDetectionTiming(
          'network', 
          startTime, 
          endTime, 
          true
        );
      }).not.toThrow();
    });
  });

  describe('generateMethodEffectivenessReport', () => {
    test('generates report with no data', () => {
      const report = SuccessDetectionAnalytics.generateMethodEffectivenessReport();
      
      expect(report).toMatchObject({
        totalAttempts: 0,
        overallSuccessRate: 0,
        methods: {}
      });
      expect(report.generatedAt).toBeInstanceOf(Date);
    });

    test('generates report with tracked data', () => {
      // Track some successful detections
      SuccessDetectionAnalytics.trackDetectionMethod({
        success: true,
        method: 'network',
        timestamp: new Date(),
        confirmationId: 'TEST1'
      });

      SuccessDetectionAnalytics.trackDetectionMethod({
        success: false,
        method: 'network',
        timestamp: new Date()
      });

      const report = SuccessDetectionAnalytics.generateMethodEffectivenessReport();
      
      expect(report.totalAttempts).toBe(2);
      expect(report.overallSuccessRate).toBe(0.5);
      expect(report.methods['network']).toMatchObject({
        attempts: 2,
        successes: 1,
        successRate: 0.5
      });
    });
  });

  describe('getOptimizationRecommendations', () => {
    test('returns recommendations for poor performing methods', () => {
      // Track many failed attempts to trigger low success rate recommendation
      for (let i = 0; i < 15; i++) {
        SuccessDetectionAnalytics.trackDetectionMethod({
          success: i < 5, // Only first 5 succeed = 33% success rate
          method: 'dom-attribute',
          timestamp: new Date(),
          ...(i < 5 && { confirmationId: `TEST${i}` })
        });
      }

      const recommendations = SuccessDetectionAnalytics.getOptimizationRecommendations();
      
      expect(recommendations.length).toBeGreaterThan(0);
      expect(recommendations[0]).toMatchObject({
        type: 'performance',
        priority: 'high',
        method: 'dom-attribute'
      });
      expect(recommendations[0]?.issue).toContain('Low success rate');
    });

    test('returns empty recommendations for good performance', () => {
      // Track successful attempts
      for (let i = 0; i < 5; i++) {
        SuccessDetectionAnalytics.trackDetectionMethod({
          success: true,
          method: 'network',
          timestamp: new Date(),
          confirmationId: `TEST${i}`
        });
      }

      const recommendations = SuccessDetectionAnalytics.getOptimizationRecommendations();
      
      // Should be empty or only low priority recommendations
      const highPriorityRecs = recommendations.filter(r => r.priority === 'high');
      expect(highPriorityRecs).toHaveLength(0);
    });
  });

  describe('exportData', () => {
    test('exports analytics data correctly', () => {
      SuccessDetectionAnalytics.trackDetectionMethod({
        success: true,
        method: 'url-pattern',
        timestamp: new Date(),
        confirmationId: 'TEST123'
      });

      const exportData = SuccessDetectionAnalytics.exportData();
      
      expect(exportData).toHaveProperty('exportedAt');
      expect(exportData).toHaveProperty('metrics');
      expect(exportData).toHaveProperty('summary');
      expect(exportData.metrics['url-pattern']).toMatchObject({
        attempts: 1,
        successes: 1,
        failures: 0
      });
    });
  });
});