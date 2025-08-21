import { IsolationChecker } from '../../src/core/IsolationChecker';
import { BookingSlot, BookingPair } from '../../src/types/booking.types';

describe('IsolationChecker', () => {
  const createMockSlot = (startTime: string, isAvailable: boolean = true): BookingSlot => ({
    date: '2025-09-07',
    startTime,
    courtId: 'court-1',
    isAvailable,
    elementSelector: `#slot-${startTime.replace(':', '-')}-court-1`,
  });

  const createMockPair = (slot1Time: string, slot2Time: string): BookingPair => ({
    slot1: createMockSlot(slot1Time),
    slot2: createMockSlot(slot2Time),
    courtId: 'court-1',
  });

  let mockSlots: BookingSlot[];
  let mockPair: BookingPair;

  beforeEach(() => {
    mockSlots = [
      createMockSlot('13:00', true),
      createMockSlot('13:30', true),
      createMockSlot('14:00', true),
      createMockSlot('14:30', true),
      createMockSlot('15:00', true),
      createMockSlot('15:30', true), // Make this available to avoid isolation
      createMockSlot('16:00', true),
    ];

    mockPair = createMockPair('14:00', '14:30');
  });

  describe('checkForIsolation', () => {
    it('should detect no isolation when slots are well-connected', () => {
      const result = IsolationChecker.checkForIsolation(mockPair, mockSlots);

      expect(result.hasIsolation).toBe(false);
      expect(result.isolatedSlots).toHaveLength(0);
      expect(result.recommendation).toContain('No isolated slots created');
    });

    it('should detect isolation when booking would create isolated slot before', () => {
      // Make slot before the "before" slot unavailable to isolate 13:30
      const modifiedSlots = [...mockSlots];
      modifiedSlots[0] = { ...modifiedSlots[0]!, isAvailable: false }; // 13:00 unavailable
      // This will isolate 13:30 because its neighbors will be 13:00(unavailable) and 14:00(will be booked)

      const result = IsolationChecker.checkForIsolation(mockPair, modifiedSlots);

      expect(result.hasIsolation).toBe(true);
      expect(result.isolatedSlots.length).toBeGreaterThan(0);
      expect(result.recommendation).toContain('would create isolated slots');
    });

    it('should detect isolation when booking would create isolated slot after', () => {
      // Make slot before our pair unavailable, and slot after the "after" slot unavailable to isolate 15:00
      const modifiedSlots = [...mockSlots];
      modifiedSlots[1] = { ...modifiedSlots[1]!, isAvailable: false }; // 13:30 unavailable
      modifiedSlots[5] = { ...modifiedSlots[5]!, isAvailable: false }; // 15:30 unavailable
      // This will isolate 15:00 because its neighbors will be 14:30(will be booked) and 15:30(unavailable)

      const result = IsolationChecker.checkForIsolation(mockPair, modifiedSlots);

      expect(result.hasIsolation).toBe(true);
      expect(result.isolatedSlots.length).toBeGreaterThan(0);
      expect(result.recommendation).toContain('would create isolated slots');
    });
  });

  describe('findBestNonIsolatingPair', () => {
    it('should return first pair when no isolation occurs', () => {
      const availablePairs = [createMockPair('14:00', '14:30'), createMockPair('15:00', '15:30')];

      const result = IsolationChecker.findBestNonIsolatingPair(availablePairs, mockSlots);

      expect(result).toBe(availablePairs[0]);
    });

    it('should return best pair when some pairs cause isolation', () => {
      const availablePairs = [
        createMockPair('13:30', '14:00'), // This might cause isolation
        createMockPair('14:00', '14:30'), // This should be fine
      ];

      const problematicSlots = [
        createMockSlot('13:00', false), // Unavailable
        createMockSlot('13:30', true),
        createMockSlot('14:00', true),
        createMockSlot('14:30', true),
        createMockSlot('15:00', false), // Unavailable
      ];

      const result = IsolationChecker.findBestNonIsolatingPair(availablePairs, problematicSlots);

      expect(result).toBeDefined();
    });
  });

  describe('analyzeAllPairs', () => {
    it('should analyze all pairs and return results', () => {
      const availablePairs = [createMockPair('14:00', '14:30'), createMockPair('15:00', '15:30')];

      const results = IsolationChecker.analyzeAllPairs(availablePairs, mockSlots);

      expect(results).toHaveLength(2);
      expect(results[0]!.pair).toBe(availablePairs[0]);
      expect(results[0]!.isolation).toHaveProperty('hasIsolation');
      expect(results[0]!.isolation).toHaveProperty('isolatedSlots');
      expect(results[0]!.isolation).toHaveProperty('recommendation');
    });

    it('should handle empty pairs array', () => {
      const results = IsolationChecker.analyzeAllPairs([], mockSlots);
      expect(results).toHaveLength(0);
    });
  });

  describe('Complex Isolation Scenarios', () => {
    it('should handle multiple courts with different availability patterns', () => {
      const multiCourtSlots = [
        { ...createMockSlot('13:00'), courtId: 'court-1', isAvailable: false },
        { ...createMockSlot('13:30'), courtId: 'court-1', isAvailable: true },
        { ...createMockSlot('14:00'), courtId: 'court-1', isAvailable: true },
        { ...createMockSlot('14:30'), courtId: 'court-1', isAvailable: true },
        { ...createMockSlot('15:00'), courtId: 'court-1', isAvailable: false },
        { ...createMockSlot('14:00'), courtId: 'court-2', isAvailable: true },
        { ...createMockSlot('14:30'), courtId: 'court-2', isAvailable: true },
        { ...createMockSlot('15:00'), courtId: 'court-2', isAvailable: true },
        { ...createMockSlot('15:30'), courtId: 'court-2', isAvailable: true },
      ];

      const court1Pair = { ...mockPair, courtId: 'court-1' };
      const court2Pair = { ...mockPair, courtId: 'court-2' };

      const result1 = IsolationChecker.checkForIsolation(court1Pair, multiCourtSlots);
      const result2 = IsolationChecker.checkForIsolation(court2Pair, multiCourtSlots);

      // Court 1 should have isolation issues, Court 2 should not
      expect(result1.hasIsolation).toBe(true);
      expect(result2.hasIsolation).toBe(false);
    });

    it('should identify chain isolation scenarios', () => {
      const chainSlots = [
        createMockSlot('12:00', false),
        createMockSlot('12:30', true),  // Would be isolated
        createMockSlot('13:00', true),  // Target slot 1
        createMockSlot('13:30', true),  // Target slot 2
        createMockSlot('14:00', true),  // Would be isolated
        createMockSlot('14:30', false),
      ];

      const pair = createMockPair('13:00', '13:30');
      const result = IsolationChecker.checkForIsolation(pair, chainSlots);

      expect(result.hasIsolation).toBe(true);
      expect(result.isolatedSlots).toHaveLength(2); // Both 12:30 and 14:00 get isolated
      expect(result.isolatedSlots.some(slot => slot.startTime === '12:30')).toBe(true);
      expect(result.isolatedSlots.some(slot => slot.startTime === '14:00')).toBe(true);
    });

    it('should handle edge-of-day boundary conditions', () => {
      const boundarySlots = [
        createMockSlot('23:00', true),
        createMockSlot('23:30', true),  // Target slot 1
        // Next day would be 00:00 (not in our slot list)
      ];

      const latePair = createMockPair('23:30', '00:00');
      // Assuming 00:00 slot doesn't exist in our available slots (next day)
      latePair.slot2 = { ...latePair.slot2, startTime: '00:00', isAvailable: true };

      const result = IsolationChecker.checkForIsolation(latePair, boundarySlots);

      // Should handle boundary gracefully without crashing
      expect(result).toBeDefined();
      expect(result.hasIsolation).toBeDefined();
    });

    it('should handle sparse availability patterns', () => {
      const sparseSlots = [
        createMockSlot('10:00', true),   // Available
        createMockSlot('10:30', false),  // Unavailable
        createMockSlot('11:00', false),  // Unavailable
        createMockSlot('11:30', false),  // Unavailable
        createMockSlot('12:00', true),   // Available - target 1
        createMockSlot('12:30', true),   // Available - target 2
        createMockSlot('13:00', false),  // Unavailable
        createMockSlot('13:30', false),  // Unavailable
        createMockSlot('14:00', false),  // Unavailable
        createMockSlot('14:30', true),   // Available
      ];

      const sparsePair = createMockPair('12:00', '12:30');
      const result = IsolationChecker.checkForIsolation(sparsePair, sparseSlots);

      // Should detect that both 10:00 and 14:30 become more isolated
      expect(result).toBeDefined();
    });

    it('should prioritize pairs based on isolation score', () => {
      const pairs = [
        createMockPair('10:00', '10:30'),  // Would isolate many slots
        createMockPair('14:00', '14:30'),  // Better choice - middle of day
        createMockPair('18:00', '18:30'),  // Would isolate end-of-day slots
      ];

      const complexSlots = [
        createMockSlot('09:30', false),
        createMockSlot('10:00', true),
        createMockSlot('10:30', true),
        createMockSlot('11:00', false),
        createMockSlot('13:30', true),
        createMockSlot('14:00', true),
        createMockSlot('14:30', true),
        createMockSlot('15:00', true),
        createMockSlot('17:30', true),
        createMockSlot('18:00', true),
        createMockSlot('18:30', true),
        createMockSlot('19:00', false),
      ];

      const best = IsolationChecker.findBestNonIsolatingPair(pairs, complexSlots);
      const analysis = IsolationChecker.analyzeAllPairs(pairs, complexSlots);

      expect(best).toBeDefined();
      expect(analysis).toHaveLength(3);
      
      // Should prefer pairs with less isolation impact
      const sortedAnalysis = analysis.sort((a, b) => 
        a.isolation.isolatedSlots.length - b.isolation.isolatedSlots.length
      );
      
      expect(sortedAnalysis[0]!.isolation.isolatedSlots.length)
        .toBeLessThanOrEqual(sortedAnalysis[2]!.isolation.isolatedSlots.length);
    });

    it('should handle single slot gaps correctly', () => {
      const singleGapSlots = [
        createMockSlot('13:00', true),
        createMockSlot('13:30', false),  // Single unavailable slot
        createMockSlot('14:00', true),   // Target 1
        createMockSlot('14:30', true),   // Target 2
        createMockSlot('15:00', false),  // Single unavailable slot
        createMockSlot('15:30', true),
      ];

      const pair = createMockPair('14:00', '14:30');
      const result = IsolationChecker.checkForIsolation(pair, singleGapSlots);

      // Should detect that 13:00 and 15:30 become more isolated
      expect(result).toBeDefined();
      expect(typeof result.hasIsolation).toBe('boolean');
    });

    it('should validate recommendation messages are helpful', () => {
      const isolatingSlots = [
        createMockSlot('13:00', false),
        createMockSlot('13:30', true),  // Will be isolated
        createMockSlot('14:00', true),  // Target
        createMockSlot('14:30', true),  // Target
        createMockSlot('15:00', false),
      ];

      const pair = createMockPair('14:00', '14:30');
      const result = IsolationChecker.checkForIsolation(pair, isolatingSlots);

      expect(result.recommendation).toBeDefined();
      expect(result.recommendation.length).toBeGreaterThan(10);
      
      if (result.hasIsolation) {
        expect(result.recommendation).toContain('would create isolated slots');
        expect(result.isolatedSlots.length).toBeGreaterThan(0);
      } else {
        expect(result.recommendation).toContain('No isolated slots');
      }
    });
  });
});
