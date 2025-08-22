/**
 * Core booking types and interfaces for the squash court booking automation
 */

export interface BookingSlot {
  /** Date in YYYY-MM-DD format */
  date: string;
  /** Start time in HH:MM format */
  startTime: string;
  /** Unique court identifier */
  courtId: string;
  /** Whether the slot is available for booking */
  isAvailable: boolean;
  /** Optional slot element selector for Playwright interaction */
  elementSelector?: string;
}

export interface BookingPair {
  /** First 30-minute slot (14:00) */
  slot1: BookingSlot;
  /** Second 30-minute slot (14:30) */
  slot2: BookingSlot;
  /** Court ID for both slots */
  courtId: string;
}

export interface BookingConfig {
  /** Days ahead to book (default: 20) */
  daysAhead: number;
  /** Target start time in HH:MM format (default: "14:00") */
  targetStartTime: string;
  /** Duration in minutes (default: 60 for two 30-min slots) */
  duration: number;
  /** Maximum retry attempts (default: 3) */
  maxRetries: number;
  /** Whether to run in dry-run mode (no actual booking) */
  dryRun: boolean;
}

export interface AdvancedBookingConfig extends BookingConfig {
  /** Timezone for date calculations (default: 'Europe/Berlin') */
  timezone: string;
  /** Preferred court IDs in order of preference */
  preferredCourts: string[];
  /** Enable pattern learning for booking optimization */
  enablePatternLearning: boolean;
  /** Fallback time range in minutes for alternative slots */
  fallbackTimeRange: number;
  /** Weights for court scoring algorithm */
  courtScoringWeights: CourtScoringWeights;
  /** Time preferences with flexibility */
  timePreferences: TimePreference[];
  /** Holiday provider for business day calculations */
  holidayProvider?: HolidayProvider;
}

export interface BookingResult {
  /** Whether the booking was successful */
  success: boolean;
  /** The booked pair if successful */
  bookedPair?: BookingPair;
  /** Error message if unsuccessful */
  error?: string;
  /** Number of retry attempts made */
  retryAttempts: number;
  /** Timestamp of the booking attempt */
  timestamp: Date;
}

export interface IsolationCheckResult {
  /** Whether the slot pair would create isolation */
  hasIsolation: boolean;
  /** Details about isolated slots found */
  isolatedSlots: BookingSlot[];
  /** Recommendation message */
  recommendation: string;
}

export interface CourtSearchResult {
  /** Available court IDs */
  availableCourts: string[];
  /** Total slots found */
  totalSlots: number;
  /** Available booking pairs */
  availablePairs: BookingPair[];
}

// LogLevel enum removed as it's not being used
export interface LogEntry {
  level: string;
  message: string;
  timestamp: Date;
  component?: string;
  metadata?: Record<string, unknown>;
}

// Advanced Booking Logic Types (Issue #9)

export interface CourtScoringWeights {
  /** Weight for current availability (0.4 default) */
  availability: number;
  /** Weight for historical success rate (0.3 default) */
  historical: number;
  /** Weight for user preference (0.2 default) */
  preference: number;
  /** Weight for court position/number (0.1 default) */
  position: number;
}

export interface TimePreference {
  /** Preferred start time in HH:MM format */
  startTime: string;
  /** Priority level (1-10, higher is better) */
  priority: number;
  /** Flexibility in minutes around the preferred time */
  flexibility: number;
}

export interface BookingPattern {
  /** Court identifier */
  courtId: string;
  /** Time slot in HH:MM format */
  timeSlot: string;
  /** Day of week (0=Sunday, 6=Saturday) */
  dayOfWeek: number;
  /** Success rate (0.0-1.0) */
  successRate: number;
  /** Total booking attempts for this pattern */
  totalAttempts: number;
  /** Last time this pattern was updated */
  lastUpdated: Date;
}

export interface HolidayProvider {
  /** Check if a date is a holiday */
  isHoliday(date: Date): boolean;
  /** Get the next business day after the given date */
  getNextBusinessDay(date: Date): Date;
  /** Get the holiday name if the date is a holiday */
  getHolidayName(date: Date): string | null;
}

export interface CourtScore {
  /** Court identifier */
  courtId: string;
  /** Overall score (0.0-1.0) */
  score: number;
  /** Individual scoring components */
  components: {
    availability: number;
    historical: number;
    preference: number;
    position: number;
  };
  /** Reason for the score */
  reason: string;
}

export interface FallbackStrategy {
  /** Strategy name */
  name: string;
  /** Execute the fallback strategy */
  execute(originalTime: string, fallbackRange: number): string[];
}

export interface TimeSlot {
  /** Start time in HH:MM format */
  startTime: string;
  /** End time in HH:MM format */
  endTime: string;
  /** Priority score for this time slot */
  priority: number;
  /** Distance from preferred time in minutes */
  distanceFromPreferred: number;
}
