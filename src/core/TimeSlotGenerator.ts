import { logger } from '../utils/logger';
import { DateTimeCalculator } from './DateTimeCalculator';
import type { TimeSlot, TimePreference, FallbackStrategy } from '../types/booking.types';

/**
 * Time slot generator with flexible alternative generation and priority ranking
 * Supports multiple fallback strategies for optimized booking success
 */
export class TimeSlotGenerator {
  private readonly fallbackStrategies: Map<string, FallbackStrategy>;

  constructor() {
    this.fallbackStrategies = new Map();
    this.initializeFallbackStrategies();
    
    logger.info('TimeSlotGenerator initialized with fallback strategies', 'TimeSlotGenerator', {
      strategies: Array.from(this.fallbackStrategies.keys())
    });
  }

  /**
   * Generate prioritized time slots with alternatives
   * @param preferredTime Primary preferred time in HH:MM format
   * @param preferences Array of time preferences with priorities
   * @param fallbackRange Range in minutes for fallback times
   * @param slotInterval Interval between generated slots (default: 30)
   * @returns Array of time slots sorted by priority (highest first)
   */
  generatePrioritizedTimeSlots(
    preferredTime: string,
    preferences: TimePreference[] = [],
    fallbackRange: number = 120,
    slotInterval: number = 30
  ): TimeSlot[] {
    const slots: TimeSlot[] = [];

    // Add primary preferred time
    const primarySlot = this.createTimeSlot(preferredTime, preferredTime, 10);
    slots.push(primarySlot);

    // Add configured preference times
    preferences.forEach(pref => {
      if (pref.startTime !== preferredTime) { // Avoid duplicates
        const slot = this.createTimeSlot(pref.startTime, preferredTime, pref.priority);
        slots.push(slot);
      }
    });

    // Generate fallback alternatives
    const fallbacks = this.generateFallbackSlots(
      preferredTime,
      fallbackRange,
      slotInterval
    );
    slots.push(...fallbacks);

    // Sort by priority (descending) then by distance from preferred time (ascending)
    const sortedSlots = slots.sort((a, b) => {
      if (a.priority !== b.priority) {
        return b.priority - a.priority; // Higher priority first
      }
      return a.distanceFromPreferred - b.distanceFromPreferred; // Closer to preferred first
    });

    // Remove duplicates
    const uniqueSlots = this.removeDuplicateSlots(sortedSlots);

    logger.debug('Generated prioritized time slots', 'TimeSlotGenerator', {
      preferredTime,
      fallbackRange,
      slotInterval,
      totalGenerated: slots.length,
      totalUnique: uniqueSlots.length,
      topSlots: uniqueSlots.slice(0, 5).map(s => ({
        time: s.startTime,
        priority: s.priority,
        distance: s.distanceFromPreferred
      }))
    });

    return uniqueSlots;
  }

  /**
   * Generate alternative time slots using specific fallback strategies
   * @param originalTime Original preferred time
   * @param strategyNames Array of strategy names to use
   * @param fallbackRange Range for fallback generation
   * @returns Array of alternative time slots
   */
  generateWithStrategies(
    originalTime: string,
    strategyNames: string[],
    fallbackRange: number = 120
  ): TimeSlot[] {
    const alternatives: string[] = [];

    strategyNames.forEach(strategyName => {
      const strategy = this.fallbackStrategies.get(strategyName);
      if (strategy) {
        const strategyAlternatives = strategy.execute(originalTime, fallbackRange);
        alternatives.push(...strategyAlternatives);
      } else {
        logger.warn('Unknown fallback strategy', 'TimeSlotGenerator', {
          strategyName,
          availableStrategies: Array.from(this.fallbackStrategies.keys())
        });
      }
    });

    // Convert to TimeSlot objects with calculated priorities
    const slots = alternatives.map(time => 
      this.createTimeSlot(time, originalTime, this.calculateFallbackPriority(time, originalTime))
    );

    return this.removeDuplicateSlots(slots);
  }

  /**
   * Generate optimal booking window times based on success patterns
   * @param baseTime Base time to calculate around
   * @param windowMinutes Size of the booking window in minutes
   * @param successPatterns Historical success data by time
   * @returns Array of optimal time slots within the window
   */
  generateOptimalBookingWindow(
    baseTime: string,
    windowMinutes: number = 60,
    successPatterns: Record<string, number> = {}
  ): TimeSlot[] {
    const alternatives = DateTimeCalculator.generateAlternativeTimeSlots(
      baseTime,
      windowMinutes / 2, // Range is split both ways
      15 // 15-minute intervals for more granular options
    );

    const slots = alternatives.map(time => {
      const successRate = successPatterns[time] || 0.5; // Default neutral success rate
      const priority = this.convertSuccessRateToPriority(successRate);
      return this.createTimeSlot(time, baseTime, priority);
    });

    // Sort by success rate (priority) and return
    const sortedSlots = slots.sort((a, b) => b.priority - a.priority);

    logger.debug('Generated optimal booking window', 'TimeSlotGenerator', {
      baseTime,
      windowMinutes,
      totalAlternatives: alternatives.length,
      withSuccessPatterns: Object.keys(successPatterns).length,
      topSlot: sortedSlots[0]
    });

    return sortedSlots;
  }

  /**
   * Add a custom fallback strategy
   * @param name Strategy name
   * @param strategy Strategy implementation
   */
  addFallbackStrategy(name: string, strategy: FallbackStrategy): void {
    this.fallbackStrategies.set(name, strategy);
    
    logger.info('Added custom fallback strategy', 'TimeSlotGenerator', {
      strategyName: name
    });
  }

  /**
   * Get available fallback strategy names
   * @returns Array of strategy names
   */
  getAvailableStrategies(): string[] {
    return Array.from(this.fallbackStrategies.keys());
  }

  /**
   * Generate business-hours-aware time slots
   * @param preferredTime Preferred start time
   * @param duration Session duration in minutes
   * @param businessStart Business hours start (default: 06:00)
   * @param businessEnd Business hours end (default: 23:00)
   * @returns Array of valid time slots within business hours
   */
  generateBusinessHoursSlots(
    preferredTime: string,
    duration: number = 60,
    businessStart: string = '06:00',
    businessEnd: string = '23:00'
  ): TimeSlot[] {
    const alternatives = DateTimeCalculator.generateAlternativeTimeSlots(
      preferredTime,
      180, // 3 hours range
      30 // 30-minute intervals
    );

    // Filter for business hours and ensure session fits
    const validSlots = alternatives
      .filter(time => DateTimeCalculator.isWithinBusinessHours(time, businessStart, businessEnd))
      .filter(time => {
        // Check if the entire session fits within business hours
        const endTime = this.calculateEndTime(time, duration);
        return DateTimeCalculator.isWithinBusinessHours(endTime, businessStart, businessEnd);
      })
      .map(time => this.createTimeSlot(time, preferredTime, this.calculateFallbackPriority(time, preferredTime)));

    return this.removeDuplicateSlots(validSlots);
  }

  /**
   * Create a TimeSlot object with calculated properties
   */
  private createTimeSlot(
    startTime: string,
    preferredTime: string,
    priority: number,
    duration: number = 60
  ): TimeSlot {
    const endTime = this.calculateEndTime(startTime, duration);
    const distanceFromPreferred = Math.abs(
      DateTimeCalculator.getTimeDifferenceInMinutes(preferredTime, startTime)
    );

    return {
      startTime,
      endTime,
      priority,
      distanceFromPreferred
    };
  }

  /**
   * Calculate end time for a given start time and duration
   */
  private calculateEndTime(startTime: string, duration: number): string {
    // Time slots available if needed
    const { hours, minutes } = DateTimeCalculator.parseTime(startTime);
    
    // Calculate end time
    const totalMinutes = (hours * 60) + minutes + duration;
    const endHours = Math.floor(totalMinutes / 60) % 24;
    const endMinutes = totalMinutes % 60;
    
    return `${endHours.toString().padStart(2, '0')}:${endMinutes.toString().padStart(2, '0')}`;
  }

  /**
   * Generate fallback slots around a preferred time
   */
  private generateFallbackSlots(
    preferredTime: string,
    fallbackRange: number,
    _slotInterval: number
  ): TimeSlot[] {
    // Use multiple strategies to get diverse alternatives
    const strategyNames = ['gradual', 'symmetric', 'peak-avoidance'];
    const fallbackSlots: TimeSlot[] = [];

    strategyNames.forEach(strategyName => {
      const slots = this.generateWithStrategies(
        preferredTime,
        [strategyName],
        fallbackRange
      );
      fallbackSlots.push(...slots);
    });

    return this.removeDuplicateSlots(fallbackSlots);
  }

  /**
   * Calculate priority for fallback times based on distance from preferred
   */
  private calculateFallbackPriority(time: string, preferredTime: string): number {
    const distance = Math.abs(
      DateTimeCalculator.getTimeDifferenceInMinutes(preferredTime, time)
    );
    
    // Priority decreases with distance (max 8, min 1)
    // 0 minutes = priority 8, 120 minutes = priority 1
    const maxDistance = 120;
    const priority = Math.max(1, 8 - Math.floor((distance / maxDistance) * 7));
    
    return priority;
  }

  /**
   * Convert success rate (0-1) to priority (1-10)
   */
  private convertSuccessRateToPriority(successRate: number): number {
    return Math.max(1, Math.min(10, Math.round(successRate * 9) + 1));
  }

  /**
   * Remove duplicate time slots from array
   */
  private removeDuplicateSlots(slots: TimeSlot[]): TimeSlot[] {
    const seen = new Set<string>();
    return slots.filter(slot => {
      if (seen.has(slot.startTime)) {
        return false;
      }
      seen.add(slot.startTime);
      return true;
    });
  }

  /**
   * Initialize built-in fallback strategies
   */
  private initializeFallbackStrategies(): void {
    // Gradual expansion strategy
    this.fallbackStrategies.set('gradual', {
      name: 'gradual',
      execute: (originalTime: string, fallbackRange: number) => {
        const alternatives: string[] = [];
        const increments = [15, 30, 45, 60, 90, 120];
        
        increments.forEach(increment => {
          if (increment <= fallbackRange) {
            try {
              const earlier = this.addMinutesToTime(originalTime, -increment);
              const later = this.addMinutesToTime(originalTime, increment);
              
              if (DateTimeCalculator.isWithinBusinessHours(earlier)) {
                alternatives.push(earlier);
              }
              if (DateTimeCalculator.isWithinBusinessHours(later)) {
                alternatives.push(later);
              }
            } catch (error) {
              // Skip invalid times
            }
          }
        });
        
        return alternatives;
      }
    });

    // Symmetric strategy
    this.fallbackStrategies.set('symmetric', {
      name: 'symmetric',
      execute: (originalTime: string, fallbackRange: number) => {
        const alternatives: string[] = [];
        const interval = 30;
        
        for (let offset = interval; offset <= fallbackRange; offset += interval) {
          try {
            const earlier = this.addMinutesToTime(originalTime, -offset);
            const later = this.addMinutesToTime(originalTime, offset);
            
            if (DateTimeCalculator.isWithinBusinessHours(earlier)) {
              alternatives.push(earlier);
            }
            if (DateTimeCalculator.isWithinBusinessHours(later)) {
              alternatives.push(later);
            }
          } catch (error) {
            // Skip invalid times
          }
        }
        
        return alternatives;
      }
    });

    // Peak avoidance strategy (avoid popular times)
    this.fallbackStrategies.set('peak-avoidance', {
      name: 'peak-avoidance',
      execute: (originalTime: string, fallbackRange: number) => {
        // Alternatives array available if needed
        const peakTimes = ['12:00', '13:00', '18:00', '19:00', '20:00']; // Common peak times
        
        // Generate alternatives that avoid peak times
        const allAlternatives = DateTimeCalculator.generateAlternativeTimeSlots(
          originalTime,
          fallbackRange / 2,
          30
        );
        
        return allAlternatives.filter(time => {
          return !peakTimes.some(peakTime => {
            const diff = Math.abs(DateTimeCalculator.getTimeDifferenceInMinutes(time, peakTime));
            return diff <= 30; // Avoid 30 minutes around peak times
          });
        });
      }
    });

    // Off-peak strategy (prefer off-peak times)
    this.fallbackStrategies.set('off-peak', {
      name: 'off-peak',
      execute: (originalTime: string, fallbackRange: number) => {
        const offPeakTimes = [
          '09:00', '09:30', '10:00', '10:30', '11:00',
          '14:30', '15:00', '15:30', '16:00', '16:30',
          '21:00', '21:30', '22:00'
        ];
        
        return offPeakTimes.filter(time => {
          const diff = Math.abs(DateTimeCalculator.getTimeDifferenceInMinutes(originalTime, time));
          return diff <= fallbackRange && DateTimeCalculator.isWithinBusinessHours(time);
        });
      }
    });
  }

  /**
   * Helper method to add minutes to a time string
   */
  private addMinutesToTime(time: string, minutes: number): string {
    const { hours, minutes: currentMinutes } = DateTimeCalculator.parseTime(time);
    const totalMinutes = (hours * 60) + currentMinutes + minutes;
    
    // Handle negative times and day overflow
    const normalizedMinutes = ((totalMinutes % (24 * 60)) + (24 * 60)) % (24 * 60);
    const newHours = Math.floor(normalizedMinutes / 60);
    const newMinutes = normalizedMinutes % 60;
    
    return `${newHours.toString().padStart(2, '0')}:${newMinutes.toString().padStart(2, '0')}`;
  }
}