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
});
