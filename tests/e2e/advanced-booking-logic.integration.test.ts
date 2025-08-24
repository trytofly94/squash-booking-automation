import { BookingManager } from '../../src/core/BookingManager';
import { CourtScorer } from '../../src/core/CourtScorer';
import { PatternStorage } from '../../src/core/PatternStorage';
import { TimeSlotGenerator } from '../../src/core/TimeSlotGenerator';
import { DateTimeCalculator } from '../../src/core/DateTimeCalculator';
import { ConfigurationManager } from '../../src/utils/ConfigurationManager';
import type { AdvancedBookingConfig, BookingPattern } from '../../src/types/booking.types';
import type { Page } from '@playwright/test';

/// <reference types="node" />

// Mock logger to avoid console output in tests
jest.mock('../../src/utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    logBookingAttempt: jest.fn(),
    logBookingSuccess: jest.fn(),
    logBookingFailure: jest.fn(),
  },
}));

// Mock file system operations for PatternStorage
jest.mock('fs', () => ({
  promises: {
    readFile: jest.fn(),
    writeFile: jest.fn(),
    access: jest.fn(),
    copyFile: jest.fn(),
  }
}));

// Mock Playwright Page
const createMockPage = (): Partial<Page> => ({
  goto: jest.fn().mockResolvedValue(undefined),
  waitForLoadState: jest.fn().mockResolvedValue(undefined),
  waitForTimeout: jest.fn().mockResolvedValue(undefined),
  $: jest.fn().mockResolvedValue(null),
  click: jest.fn().mockResolvedValue(undefined),
  keyboard: {
    press: jest.fn().mockResolvedValue(undefined)
  } as any
});

describe('Advanced Booking Logic Integration Tests', () => {
  let mockPage: Page;
  let originalEnv: typeof process.env;

  beforeAll(() => {
    // Save original environment
    originalEnv = { ...process.env };
  });

  beforeEach(() => {
    mockPage = createMockPage() as Page;
    
    // Reset configuration manager singleton
    (ConfigurationManager as any).instance = undefined;
    
    // Set up test environment variables
    process.env.TIMEZONE = 'Europe/Berlin';
    process.env.PREFERRED_COURTS = '1,3,5';
    process.env.BOOKING_PATTERN_LEARNING = 'true';
    process.env.FALLBACK_TIME_RANGE = '120';
    process.env.DRY_RUN = 'true';
  });

  afterEach(() => {
    // Clean up
    jest.clearAllMocks();
  });

  afterAll(() => {
    // Restore original environment
    process.env = originalEnv;
    (ConfigurationManager as any).instance = undefined;
  });

  describe('End-to-End Advanced Booking Workflow', () => {
    it('should integrate all advanced features in booking process', async () => {
      const advancedConfig: Partial<AdvancedBookingConfig> = {
        daysAhead: 7,
        targetStartTime: '14:00',
        duration: 60,
        timezone: 'Europe/Berlin',
        preferredCourts: ['1', '3'],
        enablePatternLearning: true,
        fallbackTimeRange: 60,
        courtScoringWeights: {
          availability: 0.4,
          historical: 0.3,
          preference: 0.2,
          position: 0.1
        },
        timePreferences: [
          { startTime: '14:00', priority: 10, flexibility: 30 }
        ],
        dryRun: true
      };

      const bookingManager = new BookingManager(mockPage, advancedConfig);
      
      // The BookingManager should be initialized with all advanced features
      expect(bookingManager).toBeDefined();
    });

    it('should demonstrate court scoring with pattern learning', async () => {
      // Set up historical patterns
      const patterns: BookingPattern[] = [
        {
          courtId: '1',
          timeSlot: '14:00',
          dayOfWeek: 1, // Monday
          successRate: 0.8,
          totalAttempts: 10,
          lastUpdated: new Date()
        },
        {
          courtId: '3',
          timeSlot: '14:00',
          dayOfWeek: 1,
          successRate: 0.6,
          totalAttempts: 5,
          lastUpdated: new Date()
        }
      ];

      const courtScorer = new CourtScorer();
      courtScorer.loadPatterns(patterns);

      // Score courts for booking attempt
      const scores = courtScorer.scoreCourts(
        ['1', '2', '3'],
        ['1', '2', '3'], // All available
        ['3', '1'], // Preference order
        '14:00',
        1 // Monday
      );

      expect(scores).toHaveLength(3);
      
      // Court 1 should score higher due to better historical performance
      // despite Court 3 being more preferred
      const court1Score = scores.find(s => s.courtId === '1');
      const court3Score = scores.find(s => s.courtId === '3');
      
      expect(court1Score).toBeDefined();
      expect(court3Score).toBeDefined();
      expect(court1Score!.components.historical).toBeGreaterThan(court3Score!.components.historical);
    });

    it('should generate and prioritize time slot alternatives', () => {
      const generator = new TimeSlotGenerator();
      
      const prioritizedSlots = generator.generatePrioritizedTimeSlots(
        '14:00',
        [
          { startTime: '13:30', priority: 8, flexibility: 15 },
          { startTime: '14:30', priority: 7, flexibility: 20 }
        ],
        90 // 90-minute fallback range
      );

      expect(prioritizedSlots.length).toBeGreaterThan(2);
      
      // Primary time should have highest priority
      const primarySlot = prioritizedSlots.find(s => s.startTime === '14:00');
      expect(primarySlot).toBeDefined();
      expect(primarySlot!.priority).toBe(10);
      
      // Slots should be sorted by priority
      for (let i = 1; i < prioritizedSlots.length; i++) {
        if (prioritizedSlots[i-1].priority !== prioritizedSlots[i].priority) {
          expect(prioritizedSlots[i-1].priority).toBeGreaterThan(prioritizedSlots[i].priority);
        }
      }
    });

    it('should handle timezone-aware date calculations', () => {
      const berlinDate = DateTimeCalculator.calculateBookingDate(7, 'Europe/Berlin');
      const utcDate = DateTimeCalculator.calculateBookingDate(7, 'UTC');
      
      expect(berlinDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(utcDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      
      // Both should be valid dates
      expect(new Date(berlinDate).getTime()).not.toBeNaN();
      expect(new Date(utcDate).getTime()).not.toBeNaN();
    });

    it('should validate business day functionality', () => {
      const monday = '2024-01-08'; // Monday
      const saturday = '2024-01-06'; // Saturday
      const sunday = '2024-01-07'; // Sunday
      
      expect(DateTimeCalculator.isBusinessDay(monday)).toBe(true);
      expect(DateTimeCalculator.isBusinessDay(saturday)).toBe(false);
      expect(DateTimeCalculator.isBusinessDay(sunday)).toBe(false);
      
      const nextBusinessDay = DateTimeCalculator.getNextBusinessDay(saturday);
      expect(nextBusinessDay.getDay()).toBe(1); // Should be Monday
    });

    it('should provide alternative time slots within business hours', () => {
      const alternatives = DateTimeCalculator.generateAlternativeTimeSlots(
        '14:00',
        60, // ±60 minutes
        30  // 30-minute intervals
      );

      expect(alternatives.length).toBeGreaterThan(0);
      
      // All alternatives should be within business hours
      alternatives.forEach(time => {
        expect(DateTimeCalculator.isWithinBusinessHours(time)).toBe(true);
      });
      
      // Should include the original time
      expect(alternatives).toContain('14:00');
    });
  });

  describe('Configuration Management Integration', () => {
    it('should integrate with ConfigurationManager', () => {
      // Set specific environment variables
      process.env.COURT_WEIGHT_AVAILABILITY = '0.5';
      process.env.COURT_WEIGHT_HISTORICAL = '0.3';
      process.env.COURT_WEIGHT_PREFERENCE = '0.15';
      process.env.COURT_WEIGHT_POSITION = '0.05';
      
      // Reset singleton to pick up new env vars
      (ConfigurationManager as any).instance = undefined;
      
      const configManager = ConfigurationManager.getInstance();
      const config = configManager.getConfig();
      
      expect(config.courtScoringWeights.availability).toBe(0.5);
      expect(config.courtScoringWeights.historical).toBe(0.3);
      expect(config.courtScoringWeights.preference).toBe(0.15);
      expect(config.courtScoringWeights.position).toBe(0.05);
      
      // Should pass validation (weights sum to 1.0)
      expect(() => {
        configManager.updateConfig({
          courtScoringWeights: config.courtScoringWeights
        });
      }).not.toThrow();
    });

    it('should handle configuration updates with validation', () => {
      const configManager = ConfigurationManager.getInstance();
      
      // Valid update should succeed
      expect(() => {
        configManager.updateConfig({
          daysAhead: 14,
          preferredCourts: ['2', '4', '6']
        });
      }).not.toThrow();
      
      const updatedConfig = configManager.getConfig();
      expect(updatedConfig.daysAhead).toBe(14);
      expect(updatedConfig.preferredCourts).toEqual(['2', '4', '6']);
      
      // Invalid update should fail and rollback
      expect(() => {
        configManager.updateConfig({
          daysAhead: 500, // Invalid: too high
          targetStartTime: '14:00' // Valid
        });
      }).toThrow(/daysAhead must be between 1 and 365/);
      
      // Configuration should remain unchanged after failed update
      const currentConfig = configManager.getConfig();
      expect(currentConfig.daysAhead).toBe(14); // Should remain 14, not 500
    });
  });

  describe('Pattern Storage Integration', () => {
    it('should integrate with PatternStorage for persistence', async () => {
      const fs = require('fs').promises;
      
      // Mock successful file operations
      const mockPatterns: BookingPattern[] = [
        {
          courtId: '1',
          timeSlot: '14:00',
          dayOfWeek: 1,
          successRate: 0.9,
          totalAttempts: 20,
          lastUpdated: new Date('2024-01-15')
        }
      ];
      
      fs.readFile.mockResolvedValue(JSON.stringify(mockPatterns.map(p => ({
        ...p,
        lastUpdated: p.lastUpdated.toISOString()
      }))));
      fs.writeFile.mockResolvedValue(undefined);
      fs.access.mockResolvedValue(undefined);
      fs.copyFile.mockResolvedValue(undefined);
      
      const patternStorage = new PatternStorage('test-patterns.json');
      
      // Test loading patterns
      const loadedPatterns = await patternStorage.loadPatterns();
      expect(loadedPatterns).toHaveLength(1);
      expect(loadedPatterns[0].courtId).toBe('1');
      expect(loadedPatterns[0].successRate).toBe(0.9);
      
      // Test saving patterns
      const newPattern: BookingPattern = {
        courtId: '2',
        timeSlot: '14:30',
        dayOfWeek: 2,
        successRate: 0.7,
        totalAttempts: 10,
        lastUpdated: new Date()
      };
      
      await expect(patternStorage.savePatterns([...loadedPatterns, newPattern])).resolves.not.toThrow();
    });

    it('should handle pattern storage errors gracefully', async () => {
      const fs = require('fs').promises;
      
      // Mock file read error (file not found)
      fs.readFile.mockRejectedValue({ code: 'ENOENT', message: 'File not found' });
      
      const patternStorage = new PatternStorage('non-existent.json');
      
      // Should return empty array when file doesn't exist
      const patterns = await patternStorage.loadPatterns();
      expect(patterns).toEqual([]);
    });
  });

  describe('Fallback Strategy Integration', () => {
    it('should demonstrate various fallback strategies working together', () => {
      const generator = new TimeSlotGenerator();
      
      // Test multiple strategies
      const strategies = ['gradual', 'symmetric', 'peak-avoidance', 'off-peak'];
      
      strategies.forEach(strategyName => {
        const slots = generator.generateWithStrategies('14:00', [strategyName], 120);
        
        expect(slots.length).toBeGreaterThan(0);
        expect(generator.getAvailableStrategies()).toContain(strategyName);
        
        // All slots should have valid properties
        slots.forEach(slot => {
          expect(slot.startTime).toMatch(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/);
          expect(slot.endTime).toMatch(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/);
          expect(slot.priority).toBeGreaterThanOrEqual(1);
          expect(slot.priority).toBeLessThanOrEqual(10);
          expect(slot.distanceFromPreferred).toBeGreaterThanOrEqual(0);
        });
      });
    });

    it('should add and use custom fallback strategies', () => {
      const generator = new TimeSlotGenerator();
      
      // Add custom strategy
      const customStrategy = {
        name: 'test-strategy',
        execute: (_originalTime: string, _range: number) => {
          return ['12:00', '16:00']; // Fixed alternatives for testing
        }
      };
      
      generator.addFallbackStrategy('test-strategy', customStrategy);
      
      const slots = generator.generateWithStrategies('14:00', ['test-strategy'], 120);
      
      expect(slots.length).toBe(2);
      expect(slots.map(s => s.startTime)).toContain('12:00');
      expect(slots.map(s => s.startTime)).toContain('16:00');
    });
  });

  describe('Date-fns Integration Verification', () => {
    it('should handle timezone conversions correctly', () => {
      const utcDate = new Date('2024-01-01T12:00:00.000Z');
      
      // Test conversion to different timezones
      const berlinDate = DateTimeCalculator.convertToTimezone(utcDate, 'Europe/Berlin');
      const tokyoDate = DateTimeCalculator.convertToTimezone(utcDate, 'Asia/Tokyo');
      
      // Berlin should be UTC+1 in winter
      expect(berlinDate.getHours()).toBe(13);
      
      // Tokyo should be UTC+9
      expect(tokyoDate.getHours()).toBe(21);
      
      // Test reverse conversion
      const backToUtc = DateTimeCalculator.convertToUTC(berlinDate, 'Europe/Berlin');
      expect(backToUtc.getTime()).toBeCloseTo(utcDate.getTime(), -3);
    });

    it('should generate flexible time slots with various durations', () => {
      // Test different slot configurations
      const testCases = [
        { startTime: '14:00', duration: 60, slotSize: 30, expectedSlots: 2 },
        { startTime: '10:00', duration: 90, slotSize: 30, expectedSlots: 3 },
        { startTime: '16:00', duration: 45, slotSize: 15, expectedSlots: 3 }
      ];
      
      testCases.forEach(({ startTime, duration, slotSize, expectedSlots }) => {
        const slots = DateTimeCalculator.generateTimeSlots(startTime, duration, slotSize);
        
        expect(slots).toHaveLength(expectedSlots);
        expect(slots[0]).toBe(startTime);
        
        // Verify slot intervals
        for (let i = 1; i < slots.length; i++) {
          const diff = DateTimeCalculator.getTimeDifferenceInMinutes(slots[i-1], slots[i]);
          expect(diff).toBe(slotSize);
        }
      });
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle invalid time formats gracefully', () => {
      expect(() => DateTimeCalculator.parseTime('25:00')).toThrow('Invalid time format');
      expect(() => DateTimeCalculator.parseTime('14:60')).toThrow('Invalid time format');
      expect(() => DateTimeCalculator.parseTime('invalid')).toThrow('Invalid time format');
      
      // Valid formats should work
      expect(() => DateTimeCalculator.parseTime('14:00')).not.toThrow();
      expect(() => DateTimeCalculator.parseTime('23:59')).not.toThrow();
      expect(() => DateTimeCalculator.parseTime('00:00')).not.toThrow();
    });

    it('should handle edge cases in neighbor slot calculation', () => {
      // Test midnight crossover
      const neighbors = DateTimeCalculator.calculateNeighborSlots('23:30', 60);
      
      expect(neighbors.before).toBe('23:00');
      expect(neighbors.after).toBe('00:30'); // Should handle day crossover
    });

    it('should handle empty or invalid configuration gracefully', () => {
      const courtScorer = new CourtScorer();
      
      // Empty arrays should not cause errors
      const scores = courtScorer.scoreCourts([], [], [], '14:00', 1);
      expect(scores).toEqual([]);
      
      // Should handle null/undefined patterns gracefully
      expect(() => courtScorer.loadPatterns([])).not.toThrow();
    });
  });

  describe('Performance and Scalability', () => {
    it('should handle large pattern datasets efficiently', async () => {
      // Generate large pattern dataset
      const largePatternSet: BookingPattern[] = [];
      
      for (let courtId = 1; courtId <= 20; courtId++) {
        for (let hour = 8; hour <= 22; hour++) {
          for (let day = 0; day <= 6; day++) {
            largePatternSet.push({
              courtId: courtId.toString(),
              timeSlot: `${hour.toString().padStart(2, '0')}:00`,
              dayOfWeek: day,
              successRate: Math.random(),
              totalAttempts: Math.floor(Math.random() * 50) + 1,
              lastUpdated: new Date()
            });
          }
        }
      }
      
      const courtScorer = new CourtScorer();
      
      // Should handle loading large pattern set without errors
      expect(() => courtScorer.loadPatterns(largePatternSet)).not.toThrow();
      
      // Should still score courts efficiently
      const start = Date.now();
      const scores = courtScorer.scoreCourts(
        Array.from({length: 20}, (_, i) => (i + 1).toString()),
        Array.from({length: 20}, (_, i) => (i + 1).toString()),
        ['1', '5', '10'],
        '14:00',
        1
      );
      const duration = Date.now() - start;
      
      expect(scores).toHaveLength(20);
      expect(duration).toBeLessThan(100); // Should complete within 100ms
    });
  });
});