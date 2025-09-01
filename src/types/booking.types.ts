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
  elementSelector?: string | undefined;
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

export interface BookingSuccessResult {
  /** Whether the booking confirmation was successful */
  success: boolean;
  /** Detection method used (e.g., 'url', 'dom', 'text') */
  method: string;
  /** Timestamp when success was detected */
  timestamp: Date;
  /** Optional confirmation ID if available */
  confirmationId?: string;
  /** Optional additional metadata */
  metadata?: Record<string, unknown>;
  /** Optional additional data for extended success information */
  additionalData?: Record<string, unknown>;
}

export interface SuccessDetectionConfig {
  /** Network monitoring timeout in milliseconds */
  networkTimeout: number;
  /** DOM detection timeout in milliseconds */
  domTimeout: number;
  /** URL check interval in milliseconds */
  urlCheckInterval: number;
  /** Enable network request monitoring */
  enableNetworkMonitoring: boolean;
  /** Enable DOM element detection */
  enableDomDetection: boolean;
  /** Enable URL pattern detection */
  enableUrlDetection: boolean;
  /** Enable text content fallback detection */
  enableTextFallback: boolean;
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

// Calendar Matrix Types (Issue #20 - Single-Pass Performance Optimization)

export interface CalendarCell {
  /** Court identifier */
  court: string;
  /** Date in YYYY-MM-DD format */
  date: string;
  /** Start time in HH:MM format */
  start: string;
  /** Cell state */
  state: 'free' | 'booked' | 'unavailable' | 'unknown';
  /** CSS class name for state identification */
  className: string;
  /** Element selector for interaction (optional for matrix-only operations) */
  elementSelector?: string;
  /** Raw element data for debugging */
  rawData?: Record<string, string>;
}

export interface CalendarMatrix {
  /** Nested map structure: court -> time -> cell for O(1) lookup */
  cells: Map<string, Map<string, CalendarCell>>;
  /** Date range covered by this matrix */
  dateRange: { start: string; end: string };
  /** All court IDs found in the matrix */
  courts: string[];
  /** All time slots found in the matrix */
  timeSlots: string[];
  /** Matrix creation timestamp */
  createdAt: Date;
  /** Data source information */
  source: 'dom' | 'network' | 'hybrid';
  /** Matrix validation metrics */
  metrics: CalendarMatrixMetrics;
}

export interface CalendarMatrixMetrics {
  /** Total number of cells extracted */
  totalCells: number;
  /** Number of free cells */
  freeCells: number;
  /** Number of booked cells */
  bookedCells: number;
  /** Number of unavailable cells */
  unavailableCells: number;
  /** Number of courts with data */
  courtsWithData: number;
  /** Number of time slots with data */
  timeSlotsWithData: number;
  /** Extraction duration in milliseconds */
  extractionDurationMs: number;
  /** Whether the matrix appears complete */
  isComplete: boolean;
  /** Validation warnings */
  warnings: string[];
}

export interface HybridCalendarMatrix extends CalendarMatrix {
  /** Network availability data for validation */
  networkData?: Map<string, NetworkAvailabilityData> | undefined;
  /** Conflicts between DOM and network data */
  conflicts: MatrixConflict[];
}

export interface NetworkAvailabilityData {
  /** Court identifier */
  courtId: string;
  /** Date in YYYY-MM-DD format */
  date: string;
  /** Available time slots */
  availableSlots: string[];
  /** Source timestamp */
  timestamp: Date;
  /** Data reliability score */
  reliability: number;
}

export interface MatrixConflict {
  /** Court and time identifying the conflict */
  location: { court: string; date: string; start: string };
  /** DOM state */
  domState: string;
  /** Network state */
  networkState: string;
  /** Conflict resolution strategy used */
  resolution: 'prefer-dom' | 'prefer-network' | 'mark-uncertain';
  /** Additional context */
  reason: string;
}
