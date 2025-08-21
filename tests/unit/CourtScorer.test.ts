import { CourtScorer } from '../../src/core/CourtScorer';
import type { BookingPattern, CourtScoringWeights } from '../../src/types/booking.types';

// Mock logger to avoid console output in tests
jest.mock('../../src/utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('CourtScorer', () => {
  let courtScorer: CourtScorer;
  
  const defaultWeights: CourtScoringWeights = {
    availability: 0.4,
    historical: 0.3,
    preference: 0.2,
    position: 0.1
  };

  beforeEach(() => {
    courtScorer = new CourtScorer(defaultWeights);
  });

  describe('initialization', () => {
    it('should initialize with default weights', () => {
      const scorer = new CourtScorer();
      expect(scorer).toBeInstanceOf(CourtScorer);
    });

    it('should initialize with custom weights', () => {
      const customWeights: Partial<CourtScoringWeights> = {
        availability: 0.5,
        historical: 0.5
      };
      const scorer = new CourtScorer(customWeights);
      expect(scorer).toBeInstanceOf(CourtScorer);
    });
  });

  describe('scoreCourts', () => {
    it('should score courts correctly with basic input', () => {
      const courtIds = ['1', '2', '3'];
      const availableCourts = ['1', '3']; // Court 2 is not available
      const preferredCourts = ['1', '2'];
      const timeSlot = '14:00';
      const dayOfWeek = 1; // Monday

      const scores = courtScorer.scoreCourts(
        courtIds,
        availableCourts,
        preferredCourts,
        timeSlot,
        dayOfWeek
      );

      expect(scores).toHaveLength(3);
      expect(scores[0].score).toBeGreaterThan(scores[2].score); // Should be sorted by score
      
      // Available courts should score higher than unavailable ones
      const court1Score = scores.find(s => s.courtId === '1')!;
      const court2Score = scores.find(s => s.courtId === '2')!;
      expect(court1Score.score).toBeGreaterThan(court2Score.score);
    });

    it('should handle empty preferred courts', () => {
      const courtIds = ['1', '2'];
      const availableCourts = ['1', '2'];
      const preferredCourts: string[] = [];
      const timeSlot = '14:00';
      const dayOfWeek = 1;

      const scores = courtScorer.scoreCourts(
        courtIds,
        availableCourts,
        preferredCourts,
        timeSlot,
        dayOfWeek
      );

      expect(scores).toHaveLength(2);
      // Both should have neutral preference scores
      scores.forEach(score => {
        expect(score.components.preference).toBe(0.5);
      });
    });

    it('should prioritize preferred courts', () => {
      const courtIds = ['1', '2', '3'];
      const availableCourts = ['1', '2', '3'];
      const preferredCourts = ['3', '1']; // Court 3 is most preferred, then 1
      const timeSlot = '14:00';
      const dayOfWeek = 1;

      const scores = courtScorer.scoreCourts(
        courtIds,
        availableCourts,
        preferredCourts,
        timeSlot,
        dayOfWeek
      );

      const court1Score = scores.find(s => s.courtId === '1')!;
      const court2Score = scores.find(s => s.courtId === '2')!;
      const court3Score = scores.find(s => s.courtId === '3')!;

      // Court 3 should have highest preference score
      expect(court3Score.components.preference).toBeGreaterThan(court1Score.components.preference);
      expect(court1Score.components.preference).toBeGreaterThan(court2Score.components.preference);
    });
  });

  describe('pattern learning', () => {
    it('should update patterns correctly', () => {
      const courtId = '1';
      const timeSlot = '14:00';
      const dayOfWeek = 1;

      // Update with successful booking
      courtScorer.updatePattern(courtId, timeSlot, dayOfWeek, true);
      
      const patterns = courtScorer.exportPatterns();
      expect(patterns).toHaveLength(1);
      
      const pattern = patterns[0];
      expect(pattern.courtId).toBe(courtId);
      expect(pattern.timeSlot).toBe(timeSlot);
      expect(pattern.dayOfWeek).toBe(dayOfWeek);
      expect(pattern.successRate).toBe(1.0);
      expect(pattern.totalAttempts).toBe(1);
    });

    it('should accumulate pattern statistics', () => {
      const courtId = '1';
      const timeSlot = '14:00';
      const dayOfWeek = 1;

      // Add successful booking
      courtScorer.updatePattern(courtId, timeSlot, dayOfWeek, true);
      // Add failed booking
      courtScorer.updatePattern(courtId, timeSlot, dayOfWeek, false);
      // Add another successful booking
      courtScorer.updatePattern(courtId, timeSlot, dayOfWeek, true);

      const patterns = courtScorer.exportPatterns();
      const pattern = patterns[0];
      
      expect(pattern.totalAttempts).toBe(3);
      expect(pattern.successRate).toBeCloseTo(2/3, 2); // 2 successes out of 3 attempts
    });

    it('should load patterns correctly', () => {
      const mockPatterns: BookingPattern[] = [
        {
          courtId: '1',
          timeSlot: '14:00',
          dayOfWeek: 1,
          successRate: 0.8,
          totalAttempts: 10,
          lastUpdated: new Date()
        },
        {
          courtId: '2',
          timeSlot: '14:00',
          dayOfWeek: 1,
          successRate: 0.4,
          totalAttempts: 5,
          lastUpdated: new Date()
        }
      ];

      courtScorer.loadPatterns(mockPatterns);

      // Now score courts - court 1 should score higher due to better historical performance
      const scores = courtScorer.scoreCourts(
        ['1', '2'],
        ['1', '2'],
        [],
        '14:00',
        1
      );

      const court1Score = scores.find(s => s.courtId === '1')!;
      const court2Score = scores.find(s => s.courtId === '2')!;

      expect(court1Score.components.historical).toBeGreaterThan(court2Score.components.historical);
    });
  });

  describe('getBestCourt', () => {
    it('should return the highest scoring available court', () => {
      const courtIds = ['1', '2', '3'];
      const availableCourts = ['1', '3']; // Court 2 is not available
      const preferredCourts = ['3', '1'];
      const timeSlot = '14:00';
      const dayOfWeek = 1;

      const scores = courtScorer.scoreCourts(
        courtIds,
        availableCourts,
        preferredCourts,
        timeSlot,
        dayOfWeek
      );

      const bestCourt = courtScorer.getBestCourt(scores);
      expect(bestCourt).toBe('3'); // Most preferred and available court
    });

    it('should return null when no courts are available', () => {
      const courtIds = ['1', '2', '3'];
      const availableCourts: string[] = []; // No courts available
      const preferredCourts = ['1', '2', '3'];
      const timeSlot = '14:00';
      const dayOfWeek = 1;

      const scores = courtScorer.scoreCourts(
        courtIds,
        availableCourts,
        preferredCourts,
        timeSlot,
        dayOfWeek
      );

      const bestCourt = courtScorer.getBestCourt(scores);
      expect(bestCourt).toBeNull();
    });
  });

  describe('updateWeights', () => {
    it('should update scoring weights', () => {
      const newWeights: Partial<CourtScoringWeights> = {
        availability: 0.5,
        preference: 0.3
      };

      courtScorer.updateWeights(newWeights);

      // Score courts to see if new weights are applied
      const scores = courtScorer.scoreCourts(
        ['1', '2'],
        ['1'], // Only court 1 available
        ['2'], // Court 2 preferred but not available
        '14:00',
        1
      );

      // With higher availability weight, available courts should score even higher
      const court1Score = scores.find(s => s.courtId === '1')!;
      expect(court1Score.components.availability).toBe(1.0);
    });
  });

  describe('getStatistics', () => {
    it('should return correct statistics', () => {
      // Add some patterns
      courtScorer.updatePattern('1', '14:00', 1, true);
      courtScorer.updatePattern('1', '14:00', 1, false);
      courtScorer.updatePattern('2', '14:00', 1, true);

      const stats = courtScorer.getStatistics();

      expect(stats.totalPatterns).toBe(2); // Two unique patterns
      expect(stats.averageSuccessRate).toBeCloseTo(0.75, 2); // (0.5 + 1.0) / 2
      expect(stats.mostSuccessfulCourt).toBe('2');
      expect(stats.leastSuccessfulCourt).toBe('1');
    });

    it('should handle empty patterns', () => {
      const stats = courtScorer.getStatistics();

      expect(stats.totalPatterns).toBe(0);
      expect(stats.averageSuccessRate).toBe(0);
      expect(stats.mostSuccessfulCourt).toBeNull();
      expect(stats.leastSuccessfulCourt).toBeNull();
    });
  });

  describe('scoring components', () => {
    it('should calculate availability score correctly', () => {
      const scores = courtScorer.scoreCourts(
        ['1', '2'],
        ['1'], // Only court 1 available
        [],
        '14:00',
        1
      );

      const court1Score = scores.find(s => s.courtId === '1')!;
      const court2Score = scores.find(s => s.courtId === '2')!;

      expect(court1Score.components.availability).toBe(1.0);
      expect(court2Score.components.availability).toBe(0.0);
    });

    it('should calculate position score based on court number', () => {
      const scores = courtScorer.scoreCourts(
        ['1', '8'],
        ['1', '8'],
        [],
        '14:00',
        1
      );

      const court1Score = scores.find(s => s.courtId === '1')!;
      const court8Score = scores.find(s => s.courtId === '8')!;

      // Lower numbered courts should have higher position scores
      expect(court1Score.components.position).toBeGreaterThan(court8Score.components.position);
    });

    it('should provide meaningful score reasons', () => {
      const scores = courtScorer.scoreCourts(
        ['1', '2'],
        ['1'],
        ['1'],
        '14:00',
        1
      );

      scores.forEach(score => {
        expect(typeof score.reason).toBe('string');
        expect(score.reason.length).toBeGreaterThan(0);
        expect(score.reason).toContain(`Court ${score.courtId}`);
      });
    });
  });
});