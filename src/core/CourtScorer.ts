import { logger } from '../utils/logger';
import type { 
  CourtScore, 
  CourtScoringWeights, 
  BookingPattern 
} from '../types/booking.types';

/**
 * Court scoring system for intelligent court selection based on multiple criteria
 * Provides probability-based scoring for booking success optimization
 */
export class CourtScorer {
  private readonly weights: CourtScoringWeights;
  private readonly patterns: Map<string, BookingPattern>;
  
  constructor(weights?: Partial<CourtScoringWeights>) {
    // Default scoring weights
    this.weights = {
      availability: 0.4,
      historical: 0.3,
      preference: 0.2,
      position: 0.1,
      ...weights
    };
    
    this.patterns = new Map();
    
    logger.info('CourtScorer initialized with weights', 'CourtScorer', {
      weights: this.weights
    });
  }

  /**
   * Score multiple courts and return them sorted by score (highest first)
   * @param courtIds Array of court IDs to score
   * @param availableCourts Currently available courts
   * @param preferredCourts User's preferred courts in order
   * @param timeSlot Target time slot
   * @param dayOfWeek Day of week (0=Sunday, 6=Saturday)
   * @returns Array of court scores sorted by score descending
   */
  scoreCourts(
    courtIds: string[],
    availableCourts: string[],
    preferredCourts: string[] = [],
    timeSlot: string,
    dayOfWeek: number
  ): CourtScore[] {
    const scores = courtIds.map(courtId => 
      this.scoreIndividualCourt(
        courtId, 
        availableCourts, 
        preferredCourts, 
        timeSlot, 
        dayOfWeek
      )
    );

    // Sort by score descending
    const sortedScores = scores.sort((a, b) => b.score - a.score);

    logger.debug('Scored and sorted courts', 'CourtScorer', {
      totalCourts: courtIds.length,
      availableCourts: availableCourts.length,
      preferredCourts: preferredCourts.length,
      timeSlot,
      dayOfWeek,
      topScore: sortedScores[0]?.score || 0,
      scores: sortedScores.map(s => ({
        courtId: s.courtId,
        score: s.score
      }))
    });

    return sortedScores;
  }

  /**
   * Score an individual court based on all criteria
   * @param courtId Court identifier
   * @param availableCourts Currently available courts
   * @param preferredCourts User's preferred courts
   * @param timeSlot Target time slot
   * @param dayOfWeek Day of week
   * @returns Court score object
   */
  private scoreIndividualCourt(
    courtId: string,
    availableCourts: string[],
    preferredCourts: string[],
    timeSlot: string,
    dayOfWeek: number
  ): CourtScore {
    const components = {
      availability: this.calculateAvailabilityScore(courtId, availableCourts),
      historical: this.calculateHistoricalScore(courtId, timeSlot, dayOfWeek),
      preference: this.calculatePreferenceScore(courtId, preferredCourts),
      position: this.calculatePositionScore(courtId)
    };

    // Calculate weighted total score
    const score = 
      (components.availability * this.weights.availability) +
      (components.historical * this.weights.historical) +
      (components.preference * this.weights.preference) +
      (components.position * this.weights.position);

    const reason = this.buildScoreReason(components, courtId);

    return {
      courtId,
      score,
      components,
      reason
    };
  }

  /**
   * Calculate availability score (1.0 if available, 0.0 if not)
   */
  private calculateAvailabilityScore(
    courtId: string, 
    availableCourts: string[]
  ): number {
    return availableCourts.includes(courtId) ? 1.0 : 0.0;
  }

  /**
   * Calculate historical success score based on past booking patterns
   */
  private calculateHistoricalScore(
    courtId: string,
    timeSlot: string,
    dayOfWeek: number
  ): number {
    const patternKey = this.getPatternKey(courtId, timeSlot, dayOfWeek);
    const pattern = this.patterns.get(patternKey);
    
    if (!pattern || pattern.totalAttempts < 3) {
      // Not enough historical data, return neutral score
      return 0.5;
    }

    // Return success rate directly
    return pattern.successRate;
  }

  /**
   * Calculate preference score based on user's preferred courts order
   */
  private calculatePreferenceScore(
    courtId: string,
    preferredCourts: string[]
  ): number {
    if (preferredCourts.length === 0) {
      return 0.5; // Neutral if no preferences set
    }

    const index = preferredCourts.indexOf(courtId);
    if (index === -1) {
      return 0.3; // Lower score for non-preferred courts
    }

    // Higher score for higher preference (earlier in list)
    // First preference gets 1.0, last gets 0.6
    const preferenceScore = 1.0 - (index / preferredCourts.length) * 0.4;
    return preferenceScore;
  }

  /**
   * Calculate position score based on court number/position
   * Lower court numbers often have better locations
   */
  private calculatePositionScore(courtId: string): number {
    // Extract numeric part from court ID if possible
    const numericPart = courtId.match(/\d+/);
    if (!numericPart) {
      return 0.5; // Neutral score for non-numeric courts
    }

    const courtNumber = parseInt(numericPart[0], 10);
    
    // Assume courts 1-8, give higher scores to lower numbers
    // Court 1 gets ~1.0, Court 8 gets ~0.3
    const maxCourt = 8;
    const minCourt = 1;
    
    if (courtNumber < minCourt || courtNumber > maxCourt) {
      return 0.5; // Neutral for out-of-range courts
    }

    const positionScore = 1.0 - ((courtNumber - minCourt) / (maxCourt - minCourt)) * 0.7;
    return Math.max(0.3, positionScore); // Minimum score of 0.3
  }

  /**
   * Build a human-readable reason for the score
   */
  private buildScoreReason(
    components: CourtScore['components'],
    courtId: string
  ): string {
    const reasons: string[] = [];

    if (components.availability === 1.0) {
      reasons.push('available');
    } else {
      reasons.push('not available');
    }

    if (components.historical > 0.7) {
      reasons.push('high historical success');
    } else if (components.historical < 0.3) {
      reasons.push('low historical success');
    }

    if (components.preference > 0.7) {
      reasons.push('preferred court');
    } else if (components.preference < 0.4) {
      reasons.push('non-preferred court');
    }

    if (components.position > 0.7) {
      reasons.push('good position');
    }

    return `Court ${courtId}: ${reasons.join(', ')}`;
  }

  /**
   * Update booking pattern based on booking attempt result
   * @param courtId Court that was attempted
   * @param timeSlot Time slot that was attempted
   * @param dayOfWeek Day of week
   * @param success Whether the booking was successful
   */
  updatePattern(
    courtId: string,
    timeSlot: string,
    dayOfWeek: number,
    success: boolean
  ): void {
    const patternKey = this.getPatternKey(courtId, timeSlot, dayOfWeek);
    const existingPattern = this.patterns.get(patternKey);

    if (existingPattern) {
      // Update existing pattern
      const totalAttempts = existingPattern.totalAttempts + 1;
      const successfulAttempts = existingPattern.successRate * existingPattern.totalAttempts + (success ? 1 : 0);
      const successRate = successfulAttempts / totalAttempts;

      const updatedPattern: BookingPattern = {
        ...existingPattern,
        totalAttempts,
        successRate,
        lastUpdated: new Date()
      };

      this.patterns.set(patternKey, updatedPattern);

      logger.debug('Updated booking pattern', 'CourtScorer', {
        courtId,
        timeSlot,
        dayOfWeek,
        success,
        totalAttempts,
        successRate
      });
    } else {
      // Create new pattern
      const newPattern: BookingPattern = {
        courtId,
        timeSlot,
        dayOfWeek,
        successRate: success ? 1.0 : 0.0,
        totalAttempts: 1,
        lastUpdated: new Date()
      };

      this.patterns.set(patternKey, newPattern);

      logger.debug('Created new booking pattern', 'CourtScorer', {
        courtId,
        timeSlot,
        dayOfWeek,
        success
      });
    }
  }

  /**
   * Load patterns from external storage (e.g., JSON file)
   * @param patterns Array of booking patterns to load
   */
  loadPatterns(patterns: BookingPattern[]): void {
    this.patterns.clear();
    
    patterns.forEach(pattern => {
      const key = this.getPatternKey(pattern.courtId, pattern.timeSlot, pattern.dayOfWeek);
      this.patterns.set(key, pattern);
    });

    logger.info('Loaded booking patterns', 'CourtScorer', {
      totalPatterns: patterns.length
    });
  }

  /**
   * Export current patterns for external storage
   * @returns Array of current booking patterns
   */
  exportPatterns(): BookingPattern[] {
    return Array.from(this.patterns.values());
  }

  /**
   * Get the best court recommendation from scored courts
   * @param scores Array of court scores
   * @returns Best court ID or null if no courts available
   */
  getBestCourt(scores: CourtScore[]): string | null {
    const availableScores = scores.filter(s => s.components.availability === 1.0);
    
    if (availableScores.length === 0) {
      return null;
    }

    const bestCourt = availableScores[0];
    
    logger.info('Selected best court', 'CourtScorer', {
      courtId: bestCourt.courtId,
      score: bestCourt.score,
      reason: bestCourt.reason
    });

    return bestCourt.courtId;
  }

  /**
   * Update scoring weights during runtime
   * @param newWeights New weights to apply
   */
  updateWeights(newWeights: Partial<CourtScoringWeights>): void {
    Object.assign(this.weights, newWeights);
    
    logger.info('Updated scoring weights', 'CourtScorer', {
      weights: this.weights
    });
  }

  /**
   * Get current scoring statistics
   * @returns Statistics about patterns and scoring
   */
  getStatistics(): {
    totalPatterns: number;
    averageSuccessRate: number;
    mostSuccessfulCourt: string | null;
    leastSuccessfulCourt: string | null;
  } {
    const patterns = Array.from(this.patterns.values());
    
    if (patterns.length === 0) {
      return {
        totalPatterns: 0,
        averageSuccessRate: 0,
        mostSuccessfulCourt: null,
        leastSuccessfulCourt: null
      };
    }

    const averageSuccessRate = patterns.reduce((sum, p) => sum + p.successRate, 0) / patterns.length;
    
    const sortedByCourt = patterns.reduce((acc, pattern) => {
      if (!acc[pattern.courtId]) {
        acc[pattern.courtId] = [];
      }
      acc[pattern.courtId].push(pattern);
      return acc;
    }, {} as Record<string, BookingPattern[]>);

    let mostSuccessfulCourt: string | null = null;
    let leastSuccessfulCourt: string | null = null;
    let highestRate = -1;
    let lowestRate = 2;

    Object.entries(sortedByCourt).forEach(([courtId, courtPatterns]) => {
      const courtRate = courtPatterns.reduce((sum, p) => sum + p.successRate, 0) / courtPatterns.length;
      
      if (courtRate > highestRate) {
        highestRate = courtRate;
        mostSuccessfulCourt = courtId;
      }
      
      if (courtRate < lowestRate) {
        lowestRate = courtRate;
        leastSuccessfulCourt = courtId;
      }
    });

    return {
      totalPatterns: patterns.length,
      averageSuccessRate,
      mostSuccessfulCourt,
      leastSuccessfulCourt
    };
  }

  /**
   * Generate a unique key for booking patterns
   */
  private getPatternKey(courtId: string, timeSlot: string, dayOfWeek: number): string {
    return `${courtId}:${timeSlot}:${dayOfWeek}`;
  }
}