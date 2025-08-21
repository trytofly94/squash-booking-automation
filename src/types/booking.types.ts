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
  /** Retry configuration */
  retryConfig: RetryConfig;
}

export interface RetryConfig {
  /** Initial delay in milliseconds (default: 1000) */
  initialDelay: number;
  /** Maximum delay in milliseconds (default: 30000) */
  maxDelay: number;
  /** Multiplier for exponential backoff (default: 2) */
  backoffMultiplier: number;
  /** Maximum jitter as percentage of delay (default: 0.1) */
  maxJitter: number;
  /** Circuit breaker threshold - failures before stopping (default: 5) */
  circuitBreakerThreshold: number;
  /** Circuit breaker timeout in milliseconds before retry (default: 300000) */
  circuitBreakerTimeout: number;
  /** Retry on network errors (default: true) */
  retryOnNetworkError: boolean;
  /** Retry on timeout errors (default: true) */
  retryOnTimeout: boolean;
  /** Retry on rate limiting (429 errors) (default: true) */
  retryOnRateLimit: boolean;
  /** Retry on server errors (5xx) (default: true) */
  retryOnServerError: boolean;
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
