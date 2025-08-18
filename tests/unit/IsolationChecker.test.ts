import { IsolationChecker } from '../../src/core/IsolationChecker';
import { BookingSlot, BookingPair } from '../../src/types/booking.types';

describe('IsolationChecker', () => {
  let mockSlots: BookingSlot[];
  let mockPair: BookingPair;

  beforeEach(() => {
    // Create a typical scenario with multiple slots
    mockSlots = [
      global.testUtils.createMockBookingSlot({ startTime: '13:00', isAvailable: true }),
      global.testUtils.createMockBookingSlot({ startTime: '13:30', isAvailable: true }),
      global.testUtils.createMockBookingSlot({ startTime: '14:00', isAvailable: true }),
      global.testUtils.createMockBookingSlot({ startTime: '14:30', isAvailable: true }),
      global.testUtils.createMockBookingSlot({ startTime: '15:00', isAvailable: true }),
      global.testUtils.createMockBookingSlot({ startTime: '15:30', isAvailable: false }), // Already booked
      global.testUtils.createMockBookingSlot({ startTime: '16:00', isAvailable: true }),
    ];

    mockPair = global.testUtils.createMockBookingPair({
      slot1: mockSlots[2], // 14:00
      slot2: mockSlots[3], // 14:30
    });
  });

  describe('checkForIsolation', () => {
    it('should detect no isolation when adjacent slots are available or booked', () => {
      const result = IsolationChecker.checkForIsolation(mockPair, mockSlots);
      
      expect(result.hasIsolation).toBe(false);
      expect(result.isolatedSlots).toHaveLength(0);
      expect(result.recommendation).toContain('Safe to book');
    });

    it('should detect isolation when booking would create isolated slot before', () => {
      // Make slot after our pair unavailable, but keep slot before available
      const modifiedSlots = [...mockSlots];
      modifiedSlots[4] = { ...modifiedSlots[4], isAvailable: false }; // 15:00 unavailable
      
      const result = IsolationChecker.checkForIsolation(mockPair, modifiedSlots);
      
      expect(result.hasIsolation).toBe(true);
      expect(result.isolatedSlots.length).toBeGreaterThan(0);
      expect(result.recommendation).toContain('would create isolated slots');
    });

    it('should detect isolation when booking would create isolated slot after', () => {
      // Make slot before our pair unavailable, but keep slot after available  
      const modifiedSlots = [...mockSlots];
      modifiedSlots[1] = { ...modifiedSlots[1], isAvailable: false }; // 13:30 unavailable
      
      const result = IsolationChecker.checkForIsolation(mockPair, modifiedSlots);
      
      expect(result.hasIsolation).toBe(true);
      expect(result.isolatedSlots.length).toBeGreaterThan(0);
      expect(result.recommendation).toContain('would create isolated slots');
    });

    it('should handle edge case with no adjacent slots', () => {
      // Test with minimal slots where no neighbors exist
      const minimalSlots = [mockPair.slot1, mockPair.slot2];
      
      const result = IsolationChecker.checkForIsolation(mockPair, minimalSlots);
      
      expect(result.hasIsolation).toBe(false);
      expect(result.isolatedSlots).toHaveLength(0);
    });

    it('should only check slots for the same court', () => {
      // Add slots for different court
      const multiCourtSlots = [
        ...mockSlots,
        global.testUtils.createMockBookingSlot({ 
          courtId: 'court-2', 
          startTime: '13:30', 
          isAvailable: true 
        }),
      ];

      const result = IsolationChecker.checkForIsolation(mockPair, multiCourtSlots);
      
      // Should not consider slots from other courts
      expect(result.hasIsolation).toBe(false);
    });
  });

  describe('findBestNonIsolatingPair', () => {
    it('should return first non-isolating pair when multiple options exist', () => {
      const availablePairs = [
        mockPair, // This should be safe
        global.testUtils.createMockBookingPair({
          slot1: mockSlots[0], // 13:00
          slot2: mockSlots[1], // 13:30
        }),
      ];

      const result = IsolationChecker.findBestNonIsolatingPair(availablePairs, mockSlots);
      
      expect(result).toBeTruthy();
      expect(result?.courtId).toBe(mockPair.courtId);
    });

    it('should return null when all pairs would create isolation', () => {
      // Create scenario where all pairs would cause isolation
      const problematicSlots = [
        global.testUtils.createMockBookingSlot({ startTime: '13:00', isAvailable: false }),
        global.testUtils.createMockBookingSlot({ startTime: '13:30', isAvailable: true }),
        global.testUtils.createMockBookingSlot({ startTime: '14:00', isAvailable: true }),
        global.testUtils.createMockBookingSlot({ startTime: '14:30', isAvailable: true }),
        global.testUtils.createMockBookingSlot({ startTime: '15:00', isAvailable: false }),
      ];

      const problematicPair = global.testUtils.createMockBookingPair({
        slot1: problematicSlots[2], // 14:00
        slot2: problematicSlots[3], // 14:30
      });

      const result = IsolationChecker.findBestNonIsolatingPair([problematicPair], problematicSlots);
      
      expect(result).toBeNull();
    });

    it('should handle empty available pairs array', () => {
      const result = IsolationChecker.findBestNonIsolatingPair([], mockSlots);
      expect(result).toBeNull();
    });
  });

  describe('analyzeAllPairs', () => {
    it('should analyze all provided pairs and return detailed results', () => {
      const availablePairs = [
        mockPair,
        global.testUtils.createMockBookingPair({
          slot1: mockSlots[0], // 13:00
          slot2: mockSlots[1], // 13:30
        }),
      ];

      const results = IsolationChecker.analyzeAllPairs(availablePairs, mockSlots);
      
      expect(results).toHaveLength(2);
      expect(results[0].pair).toBe(availablePairs[0]);
      expect(results[0].isolation).toHaveProperty('hasIsolation');
      expect(results[0].isolation).toHaveProperty('isolatedSlots');
      expect(results[0].isolation).toHaveProperty('recommendation');
    });

    it('should handle empty pairs array', () => {
      const results = IsolationChecker.analyzeAllPairs([], mockSlots);
      expect(results).toHaveLength(0);
    });
  });
});