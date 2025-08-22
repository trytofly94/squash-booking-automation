import { TimeSlotGenerator } from '../../src/core/TimeSlotGenerator';
import type { TimePreference } from '../../src/types/booking.types';

// Mock logger to avoid console output in tests
jest.mock('../../src/utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// Mock DateTimeCalculator methods used by TimeSlotGenerator
jest.mock('../../src/core/DateTimeCalculator', () => ({
  DateTimeCalculator: {
    isValidTime: jest.fn((time: string) => {
      const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
      return timeRegex.test(time);
    }),
    isWithinBusinessHours: jest.fn((time: string) => {
      const [hours] = time.split(':').map(Number);
      return (hours ?? 0) >= 6 && (hours ?? 0) <= 23;
    }),
    generateAlternativeTimeSlots: jest.fn((preferredTime: string, range: number, _interval: number) => {
      // Mock implementation that generates a few alternatives
      const alternatives = ['13:30', '14:00', '14:30', '15:00'];
      return alternatives.filter(time => {
        const [prefHours, prefMinutes] = preferredTime.split(':').map(Number);
        const [altHours, altMinutes] = time.split(':').map(Number);
        const prefTotal = (prefHours ?? 0) * 60 + (prefMinutes ?? 0);
        const altTotal = (altHours ?? 0) * 60 + (altMinutes ?? 0);
        return Math.abs(altTotal - prefTotal) <= range;
      });
    }),
    getTimeDifferenceInMinutes: jest.fn((time1: string, time2: string) => {
      const [h1, m1] = time1.split(':').map(Number);
      const [h2, m2] = time2.split(':').map(Number);
      const total1 = (h1 ?? 0) * 60 + (m1 ?? 0);
      const total2 = (h2 ?? 0) * 60 + (m2 ?? 0);
      return Math.abs(total2 - total1);
    }),
    parseTime: jest.fn((time: string) => {
      const [hours, minutes] = time.split(':').map(Number);
      return { hours: hours ?? 0, minutes: minutes ?? 0 };
    })
  }
}));

describe('TimeSlotGenerator', () => {
  let generator: TimeSlotGenerator;

  beforeEach(() => {
    generator = new TimeSlotGenerator();
  });

  describe('initialization', () => {
    it('should initialize with default fallback strategies', () => {
      expect(generator).toBeInstanceOf(TimeSlotGenerator);
      
      const strategies = generator.getAvailableStrategies();
      expect(strategies).toContain('gradual');
      expect(strategies).toContain('symmetric');
      expect(strategies).toContain('peak-avoidance');
      expect(strategies).toContain('off-peak');
    });
  });

  describe('generatePrioritizedTimeSlots', () => {
    it('should generate prioritized time slots with primary preference', () => {
      const preferredTime = '14:00';
      const preferences: TimePreference[] = [];
      const fallbackRange = 60;

      const slots = generator.generatePrioritizedTimeSlots(
        preferredTime,
        preferences,
        fallbackRange
      );

      expect(slots.length).toBeGreaterThan(0);
      
      // Primary preferred time should be first (highest priority)
      const primarySlot = slots.find(slot => slot.startTime === preferredTime);
      expect(primarySlot).toBeDefined();
      expect(primarySlot!.priority).toBe(10);
      expect(primarySlot!.distanceFromPreferred).toBe(0);
    });

    it('should include configured time preferences', () => {
      const preferredTime = '14:00';
      const preferences: TimePreference[] = [
        { startTime: '13:30', priority: 8, flexibility: 15 },
        { startTime: '14:30', priority: 7, flexibility: 20 }
      ];
      
      const slots = generator.generatePrioritizedTimeSlots(
        preferredTime,
        preferences,
        60
      );

      // Should include preference times
      const pref1 = slots.find(slot => slot.startTime === '13:30');
      const pref2 = slots.find(slot => slot.startTime === '14:30');
      
      expect(pref1).toBeDefined();
      expect(pref1!.priority).toBe(8);
      
      expect(pref2).toBeDefined();
      expect(pref2!.priority).toBe(7);
    });

    it('should sort slots by priority and distance', () => {
      const preferredTime = '14:00';
      const preferences: TimePreference[] = [
        { startTime: '13:30', priority: 9, flexibility: 15 },
        { startTime: '14:30', priority: 8, flexibility: 20 }
      ];
      
      const slots = generator.generatePrioritizedTimeSlots(
        preferredTime,
        preferences,
        60
      );

      // Slots should be sorted by priority (descending)
      for (let i = 1; i < slots.length; i++) {
        const previousSlot = slots[i-1];
        const currentSlot = slots[i];
        if (previousSlot && currentSlot && previousSlot.priority !== currentSlot.priority) {
          expect(previousSlot.priority).toBeGreaterThan(currentSlot.priority);
        }
      }
    });

    it('should avoid duplicate time slots', () => {
      const preferredTime = '14:00';
      const preferences: TimePreference[] = [
        { startTime: '14:00', priority: 9, flexibility: 15 }, // Same as preferred
      ];
      
      const slots = generator.generatePrioritizedTimeSlots(
        preferredTime,
        preferences,
        60
      );

      const timeSlotCounts = slots.reduce((counts, slot) => {
        counts[slot.startTime] = (counts[slot.startTime] || 0) + 1;
        return counts;
      }, {} as Record<string, number>);

      // No time should appear more than once
      Object.values(timeSlotCounts).forEach(count => {
        expect(count).toBe(1);
      });
    });
  });

  describe('generateWithStrategies', () => {
    it('should generate alternatives using specific strategies', () => {
      const originalTime = '14:00';
      const strategies = ['gradual', 'symmetric'];
      
      const slots = generator.generateWithStrategies(
        originalTime,
        strategies,
        120
      );

      expect(slots.length).toBeGreaterThan(0);
      
      // All slots should have valid start times
      slots.forEach(slot => {
        expect(slot.startTime).toMatch(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/);
        expect(typeof slot.priority).toBe('number');
        expect(slot.priority).toBeGreaterThanOrEqual(1);
        expect(slot.priority).toBeLessThanOrEqual(10);
      });
    });

    it('should handle unknown strategies gracefully', () => {
      const originalTime = '14:00';
      const strategies = ['unknown-strategy', 'gradual'];
      
      // Should not throw error
      expect(() => {
        generator.generateWithStrategies(originalTime, strategies, 60);
      }).not.toThrow();
    });
  });

  describe('generateOptimalBookingWindow', () => {
    it('should generate optimal slots based on success patterns', () => {
      const baseTime = '14:00';
      const windowMinutes = 60;
      const successPatterns = {
        '13:30': 0.8,
        '14:00': 0.9,
        '14:30': 0.7,
        '15:00': 0.6
      };

      const slots = generator.generateOptimalBookingWindow(
        baseTime,
        windowMinutes,
        successPatterns
      );

      expect(slots.length).toBeGreaterThan(0);
      
      // Slots should be sorted by success rate (priority)
      for (let i = 1; i < slots.length; i++) {
        const previousSlot = slots[i-1];
        const currentSlot = slots[i];
        if (previousSlot && currentSlot) {
          expect(previousSlot.priority).toBeGreaterThanOrEqual(currentSlot.priority);
        }
      }
      
      // Slot with highest success rate should have highest priority
      const slot14 = slots.find(s => s.startTime === '14:00');
      if (slot14) {
        expect(slot14.priority).toBeGreaterThanOrEqual(
          slots.find(s => s.startTime === '13:30')?.priority || 0
        );
      }
    });

    it('should handle empty success patterns', () => {
      const baseTime = '14:00';
      const slots = generator.generateOptimalBookingWindow(baseTime, 60, {});
      
      expect(slots.length).toBeGreaterThan(0);
      
      // All slots should have neutral priority when no patterns provided
      // (converted from 0.5 success rate)
      slots.forEach(slot => {
        expect(slot.priority).toBeGreaterThan(0);
      });
    });
  });

  describe('generateBusinessHoursSlots', () => {
    it('should generate slots within business hours', () => {
      const preferredTime = '14:00';
      const duration = 60;
      
      const slots = generator.generateBusinessHoursSlots(
        preferredTime,
        duration,
        '08:00',
        '22:00'
      );

      // All slots should be within business hours and allow for full session duration
      slots.forEach(slot => {
        const [hours, minutes] = slot.startTime.split(':').map(Number);
        const sessionEndHours = (hours ?? 0) + Math.floor(((minutes ?? 0) + duration) / 60);
        
        expect(hours ?? 0).toBeGreaterThanOrEqual(8);
        expect(sessionEndHours).toBeLessThanOrEqual(22);
      });
    });

    it('should use default business hours', () => {
      const preferredTime = '14:00';
      
      const slots = generator.generateBusinessHoursSlots(preferredTime);
      
      expect(slots.length).toBeGreaterThan(0);
      
      // Should respect default business hours (6:00-23:00)
      slots.forEach(slot => {
        const [hours] = slot.startTime.split(':').map(Number);
        expect(hours).toBeGreaterThanOrEqual(6);
        expect(hours).toBeLessThanOrEqual(23);
      });
    });
  });

  describe('addFallbackStrategy', () => {
    it('should allow adding custom fallback strategies', () => {
      const customStrategy = {
        name: 'custom-test',
        execute: (originalTime: string, fallbackRange: number) => {
          return ['13:00', '15:00']; // Simple test implementation
        }
      };

      generator.addFallbackStrategy('custom-test', customStrategy);
      
      const strategies = generator.getAvailableStrategies();
      expect(strategies).toContain('custom-test');
      
      // Test using the custom strategy
      const slots = generator.generateWithStrategies('14:00', ['custom-test'], 120);
      expect(slots.length).toBeGreaterThan(0);
      
      const times = slots.map(s => s.startTime);
      expect(times).toContain('13:00');
      expect(times).toContain('15:00');
    });
  });

  describe('time slot properties', () => {
    it('should calculate correct distance from preferred time', () => {
      const preferredTime = '14:00';
      const preferences: TimePreference[] = [
        { startTime: '13:30', priority: 8, flexibility: 15 },
        { startTime: '14:30', priority: 7, flexibility: 20 }
      ];
      
      const slots = generator.generatePrioritizedTimeSlots(
        preferredTime,
        preferences,
        60
      );

      const slot1330 = slots.find(s => s.startTime === '13:30');
      const slot1430 = slots.find(s => s.startTime === '14:30');
      
      if (slot1330) {
        expect(slot1330.distanceFromPreferred).toBe(30);
      }
      
      if (slot1430) {
        expect(slot1430.distanceFromPreferred).toBe(30);
      }
    });

    it('should calculate end times correctly', () => {
      const slots = generator.generatePrioritizedTimeSlots('14:00', [], 60);
      
      slots.forEach(slot => {
        expect(slot.endTime).toMatch(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/);
        
        // End time should be after start time
        const [startHours, startMinutes] = slot.startTime.split(':').map(Number);
        const [endHours, endMinutes] = slot.endTime.split(':').map(Number);
        const startTotal = startHours * 60 + startMinutes;
        const endTotal = endHours * 60 + endMinutes;
        
        expect(endTotal).toBeGreaterThan(startTotal);
      });
    });
  });
});