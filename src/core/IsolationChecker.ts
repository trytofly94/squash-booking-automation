import { BookingSlot, BookingPair, IsolationCheckResult } from '../types/booking.types';
import { DateTimeCalculator } from './DateTimeCalculator';
import { logger } from '../utils/logger';

/**
 * Enhanced isolation checker with flexible duration support
 * Checks for isolated slots to prevent fragmenting the booking schedule
 * Supports variable slot durations and improved neighbor calculation using date-fns
 */
export class IsolationChecker {
  /**
   * Check if booking a pair would create isolated slots
   */
  static checkForIsolation(
    targetPair: BookingPair,
    allSlotsForDate: BookingSlot[]
  ): IsolationCheckResult {
    const component = 'IsolationChecker';

    logger.debug('Starting isolation check', component, {
      courtId: targetPair.courtId,
      slot1Time: targetPair.slot1.startTime,
      slot2Time: targetPair.slot2.startTime,
      totalSlotsToCheck: allSlotsForDate.length,
    });

    const courtSlots = allSlotsForDate.filter(slot => slot.courtId === targetPair.courtId);
    const neighborSlots = DateTimeCalculator.calculateNeighborSlots(targetPair.slot1.startTime);

    const isolatedSlots: BookingSlot[] = [];
    let hasIsolation = false;

    // Check slot before target pair
    const slotBefore = courtSlots.find(slot => slot.startTime === neighborSlots.before);
    if (slotBefore && slotBefore.isAvailable) {
      // Check if this slot would become isolated
      if (this.wouldBeIsolated(slotBefore, courtSlots, [targetPair.slot1, targetPair.slot2])) {
        isolatedSlots.push(slotBefore);
        hasIsolation = true;
        logger.warn('Found isolated slot before target pair', component, {
          isolatedSlot: slotBefore.startTime,
          courtId: targetPair.courtId,
        });
      }
    }

    // Check slot after target pair
    const slotAfter = courtSlots.find(slot => slot.startTime === neighborSlots.after);
    if (slotAfter && slotAfter.isAvailable) {
      // Check if this slot would become isolated
      if (this.wouldBeIsolated(slotAfter, courtSlots, [targetPair.slot1, targetPair.slot2])) {
        isolatedSlots.push(slotAfter);
        hasIsolation = true;
        logger.warn('Found isolated slot after target pair', component, {
          isolatedSlot: slotAfter.startTime,
          courtId: targetPair.courtId,
        });
      }
    }

    const recommendation = this.generateRecommendation(hasIsolation, isolatedSlots, targetPair);

    logger.info('Isolation check completed', component, {
      hasIsolation,
      isolatedSlotsCount: isolatedSlots.length,
      recommendation,
    });

    return {
      hasIsolation,
      isolatedSlots,
      recommendation,
    };
  }

  /**
   * Check if a slot would become isolated after booking certain slots
   */
  private static wouldBeIsolated(
    slot: BookingSlot,
    allCourtSlots: BookingSlot[],
    slotsToBook: BookingSlot[]
  ): boolean {
    const slotTime = DateTimeCalculator.parseTime(slot.startTime);

    // Calculate adjacent slot times
    const prevSlotTime = new Date();
    prevSlotTime.setHours(slotTime.hours, slotTime.minutes - 30, 0, 0);
    const prevSlotTimeStr = `${prevSlotTime.getHours().toString().padStart(2, '0')}:${prevSlotTime.getMinutes().toString().padStart(2, '0')}`;

    const nextSlotTime = new Date();
    nextSlotTime.setHours(slotTime.hours, slotTime.minutes + 30, 0, 0);
    const nextSlotTimeStr = `${nextSlotTime.getHours().toString().padStart(2, '0')}:${nextSlotTime.getMinutes().toString().padStart(2, '0')}`;

    // Find adjacent slots
    const prevSlot = allCourtSlots.find(s => s.startTime === prevSlotTimeStr);
    const nextSlot = allCourtSlots.find(s => s.startTime === nextSlotTimeStr);

    // Check if adjacent slots will be unavailable (either already booked or about to be booked)
    const prevWillBeUnavailable = Boolean(
      prevSlot &&
        (!prevSlot.isAvailable || slotsToBook.some(s => s.startTime === prevSlot.startTime))
    );
    const nextWillBeUnavailable = Boolean(
      nextSlot &&
        (!nextSlot.isAvailable || slotsToBook.some(s => s.startTime === nextSlot.startTime))
    );

    // Slot is isolated if both adjacent slots are unavailable
    return prevWillBeUnavailable && nextWillBeUnavailable;
  }

  /**
   * Generate recommendation based on isolation check results
   */
  private static generateRecommendation(
    hasIsolation: boolean,
    isolatedSlots: BookingSlot[],
    targetPair: BookingPair
  ): string {
    if (!hasIsolation) {
      return `✅ Safe to book ${targetPair.courtId} at ${targetPair.slot1.startTime}-${targetPair.slot2.startTime}. No isolated slots created.`;
    }

    const isolatedTimes = isolatedSlots.map(slot => slot.startTime).join(', ');
    return `⚠️  Booking ${targetPair.courtId} at ${targetPair.slot1.startTime}-${targetPair.slot2.startTime} would create isolated slots: ${isolatedTimes}. Consider alternative courts or times.`;
  }

  /**
   * Find the best booking pair that doesn't create isolation
   */
  static findBestNonIsolatingPair(
    availablePairs: BookingPair[],
    allSlotsForDate: BookingSlot[]
  ): BookingPair | null {
    const component = 'IsolationChecker';

    logger.info('Finding best non-isolating pair', component, {
      availablePairsCount: availablePairs.length,
    });

    for (const pair of availablePairs) {
      const isolationResult = this.checkForIsolation(pair, allSlotsForDate);

      if (!isolationResult.hasIsolation) {
        logger.info('Found non-isolating pair', component, {
          courtId: pair.courtId,
          startTime: pair.slot1.startTime,
        });
        return pair;
      }
    }

    logger.warn('No non-isolating pairs found', component, {
      checkedPairs: availablePairs.length,
    });

    return null;
  }

  /**
   * Get detailed isolation analysis for all available pairs
   */
  static analyzeAllPairs(
    availablePairs: BookingPair[],
    allSlotsForDate: BookingSlot[]
  ): Array<{ pair: BookingPair; isolation: IsolationCheckResult }> {
    return availablePairs.map(pair => ({
      pair,
      isolation: this.checkForIsolation(pair, allSlotsForDate),
    }));
  }
}
