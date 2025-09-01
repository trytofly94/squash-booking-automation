import { logger } from './logger';
import type { 
  AdvancedBookingConfig, 
  CourtScoringWeights, 
  TimePreference
} from '../types/booking.types';
import type { MonitoringConfig } from '../types/monitoring.types';
import type { HealthCheckConfig } from '../types/health.types';
import type { RetryConfig } from '../types/retry.types';
import type { SelectorCacheConfig } from './SelectorCache';

/**
 * Configuration manager for advanced booking features
 * Handles environment variable parsing, validation, and default value assignment
 */
export class ConfigurationManager {
  private static instance: ConfigurationManager;
  private config: AdvancedBookingConfig;
  private monitoringConfig: MonitoringConfig;
  private healthCheckConfig: HealthCheckConfig;
  private retryConfig: RetryConfig;
  private selectorCacheConfig: SelectorCacheConfig;

  private constructor() {
    this.config = this.loadConfiguration();
    this.monitoringConfig = this.loadMonitoringConfiguration();
    this.healthCheckConfig = this.loadHealthCheckConfiguration();
    this.retryConfig = this.loadRetryConfiguration();
    this.selectorCacheConfig = this.loadSelectorCacheConfiguration();
    this.validateConfiguration();
  }

  /**
   * Get singleton instance
   */
  static getInstance(): ConfigurationManager {
    if (!ConfigurationManager.instance) {
      ConfigurationManager.instance = new ConfigurationManager();
    }
    return ConfigurationManager.instance;
  }

  /**
   * Get the current configuration
   */
  getConfig(): AdvancedBookingConfig {
    return { ...this.config }; // Return a copy to prevent mutation
  }

  /**
   * Get monitoring configuration
   */
  getMonitoringConfig(): MonitoringConfig {
    return { ...this.monitoringConfig };
  }

  /**
   * Get health check configuration
   */
  getHealthCheckConfig(): HealthCheckConfig {
    return { ...this.healthCheckConfig };
  }

  /**
   * Get retry configuration
   */
  getRetryConfig(): RetryConfig {
    return { ...this.retryConfig };
  }

  /**
   * Get selector cache configuration
   */
  getSelectorCacheConfig(): SelectorCacheConfig {
    return { ...this.selectorCacheConfig };
  }

  /**
   * Update configuration at runtime
   */
  updateConfig(updates: Partial<AdvancedBookingConfig>): void {
    const oldConfig = { ...this.config };
    this.config = { ...this.config, ...updates };
    
    // Validate updated configuration
    try {
      this.validateConfiguration();
      logger.info('Configuration updated successfully', 'ConfigurationManager', {
        updatedFields: Object.keys(updates),
        oldConfig: this.sanitizeConfigForLogging(oldConfig),
        newConfig: this.sanitizeConfigForLogging(this.config)
      });
    } catch (error) {
      // Rollback on validation error
      this.config = oldConfig;
      logger.error('Configuration update failed, rolled back', 'ConfigurationManager', {
        error: (error as Error).message,
        attemptedUpdates: updates
      });
      throw error;
    }
  }

  /**
   * Update monitoring configuration
   */
  updateMonitoringConfig(updates: Partial<MonitoringConfig>): void {
    const oldConfig = { ...this.monitoringConfig };
    this.monitoringConfig = { ...this.monitoringConfig, ...updates };
    
    logger.info('Monitoring configuration updated', 'ConfigurationManager', {
      updatedFields: Object.keys(updates),
      oldConfig,
      newConfig: this.monitoringConfig
    });
  }

  /**
   * Update health check configuration
   */
  updateHealthCheckConfig(updates: Partial<HealthCheckConfig>): void {
    const oldConfig = { ...this.healthCheckConfig };
    this.healthCheckConfig = { ...this.healthCheckConfig, ...updates };
    
    logger.info('Health check configuration updated', 'ConfigurationManager', {
      updatedFields: Object.keys(updates),
      oldConfig,
      newConfig: this.healthCheckConfig
    });
  }

  /**
   * Update retry configuration
   */
  updateRetryConfig(updates: Partial<RetryConfig>): void {
    const oldConfig = { ...this.retryConfig };
    this.retryConfig = { ...this.retryConfig, ...updates };
    
    logger.info('Retry configuration updated', 'ConfigurationManager', {
      updatedFields: Object.keys(updates),
      oldConfig,
      newConfig: this.retryConfig
    });
  }

  /**
   * Update selector cache configuration
   */
  updateSelectorCacheConfig(updates: Partial<SelectorCacheConfig>): void {
    const oldConfig = { ...this.selectorCacheConfig };
    this.selectorCacheConfig = { ...this.selectorCacheConfig, ...updates };
    
    logger.info('Selector cache configuration updated', 'ConfigurationManager', {
      updatedFields: Object.keys(updates),
      oldConfig,
      newConfig: this.selectorCacheConfig
    });
  }

  /**
   * Load configuration from environment variables with defaults
   */
  private loadConfiguration(): AdvancedBookingConfig {
    const config: AdvancedBookingConfig = {
      // Basic configuration
      daysAhead: this.parseNumber(process.env['DAYS_AHEAD'], 20),
      targetStartTime: process.env['TARGET_START_TIME'] || '14:00',
      duration: this.parseNumber(process.env['DURATION'], 60),
      maxRetries: this.parseNumber(process.env['MAX_RETRIES'], 3),
      dryRun: this.parseBoolean(process.env['DRY_RUN'], true), // Default to true for safety
      
      // Advanced configuration
      timezone: process.env['TIMEZONE'] || 'Europe/Berlin',
      preferredCourts: this.parsePreferredCourts(process.env['PREFERRED_COURTS']),
      enablePatternLearning: this.parseBoolean(process.env['BOOKING_PATTERN_LEARNING'], false),
      fallbackTimeRange: this.parseNumber(process.env['FALLBACK_TIME_RANGE'], 120),
      courtScoringWeights: this.parseCourtScoringWeights(),
      timePreferences: this.parseTimePreferences()
    };

    logger.info('Configuration loaded from environment', 'ConfigurationManager', {
      config: this.sanitizeConfigForLogging(config)
    });

    return config;
  }

  /**
   * Load monitoring configuration from environment variables
   */
  private loadMonitoringConfiguration(): MonitoringConfig {
    const config: MonitoringConfig = {
      enableCorrelationId: this.parseBoolean(process.env['LOG_CORRELATION_ID'], true),
      enablePerformanceLogging: this.parseBoolean(process.env['LOG_PERFORMANCE'], true),
      performanceThresholdWarning: this.parseNumber(process.env['PERFORMANCE_THRESHOLD_WARNING'], 5000),
      performanceThresholdError: this.parseNumber(process.env['PERFORMANCE_THRESHOLD_ERROR'], 10000),
      metricsEnabled: this.parseBoolean(process.env['METRICS_ENABLED'], false),
      maxMetricsHistory: this.parseNumber(process.env['MAX_METRICS_HISTORY'], 1000)
    };

    logger.info('Monitoring configuration loaded', 'ConfigurationManager', { config });
    return config;
  }

  /**
   * Load health check configuration from environment variables
   */
  private loadHealthCheckConfiguration(): HealthCheckConfig {
    const config: HealthCheckConfig = {
      enabled: this.parseBoolean(process.env['HEALTH_CHECK_ENABLED'], true),
      interval: this.parseNumber(process.env['HEALTH_CHECK_INTERVAL'], 300000), // 5 minutes
      timeout: this.parseNumber(process.env['HEALTH_CHECK_TIMEOUT'], 30000), // 30 seconds
      websiteUrl: process.env['WEBSITE_URL'] || 'https://www.eversports.de/sb/sportcenter-kautz?sport=squash',
      retryAttempts: this.parseNumber(process.env['HEALTH_CHECK_RETRIES'], 3),
      alertThresholds: {
        responseTime: this.parseNumber(process.env['ALERT_THRESHOLD_RESPONSE_TIME'], 5000),
        errorRate: this.parseNumber(process.env['ALERT_THRESHOLD_ERROR_RATE'], 10),
        memoryUsage: this.parseNumber(process.env['ALERT_THRESHOLD_MEMORY'], 80)
      }
    };

    logger.info('Health check configuration loaded', 'ConfigurationManager', { config });
    return config;
  }

  /**
   * Load retry configuration from environment variables
   */
  private loadRetryConfiguration(): RetryConfig {
    const config: RetryConfig = {
      enabled: this.parseBoolean(process.env['RETRY_ENABLED'], true),
      maxAttempts: this.parseNumber(process.env['RETRY_MAX_ATTEMPTS'], 5),
      minDelay: this.parseNumber(process.env['RETRY_MIN_DELAY'], 1000),
      maxDelay: this.parseNumber(process.env['RETRY_MAX_DELAY'], 30000),
      jitterEnabled: this.parseBoolean(process.env['RETRY_JITTER_ENABLED'], true),
      
      circuitBreaker: {
        failureThreshold: this.parseNumber(process.env['CIRCUIT_BREAKER_FAILURE_THRESHOLD'], 5),
        recoveryTimeout: this.parseNumber(process.env['CIRCUIT_BREAKER_RECOVERY_TIMEOUT'], 60000),
        requestVolumeThreshold: this.parseNumber(process.env['CIRCUIT_BREAKER_REQUEST_VOLUME_THRESHOLD'], 10),
        rollingWindow: this.parseNumber(process.env['CIRCUIT_BREAKER_ROLLING_WINDOW'], 60000),
        successThreshold: this.parseNumber(process.env['CIRCUIT_BREAKER_SUCCESS_THRESHOLD'], 3)
      },
      
      errorSpecific: {
        networkAttempts: this.parseNumber(process.env['RETRY_NETWORK_ATTEMPTS'], 5),
        rateLimitAttempts: this.parseNumber(process.env['RETRY_RATE_LIMIT_ATTEMPTS'], 3),
        serverErrorAttempts: this.parseNumber(process.env['RETRY_SERVER_ERROR_ATTEMPTS'], 2),
        timeoutAttempts: this.parseNumber(process.env['RETRY_TIMEOUT_ATTEMPTS'], 4)
      },
      
      exponentialBackoff: {
        enabled: this.parseBoolean(process.env['RETRY_EXPONENTIAL_BACKOFF'], true),
        base: this.parseNumber(process.env['RETRY_EXPONENTIAL_BASE'], 2)
      },
      
      abortOnClientErrors: this.parseBoolean(process.env['RETRY_ABORT_ON_CLIENT_ERRORS'], true)
    };

    logger.info('Retry configuration loaded', 'ConfigurationManager', { config });
    return config;
  }

  /**
   * Load selector cache configuration from environment variables
   */
  private loadSelectorCacheConfiguration(): SelectorCacheConfig {
    const config: SelectorCacheConfig = {
      enabled: this.parseBoolean(process.env['SELECTOR_CACHE_ENABLED'], true),
      maxSize: this.parseNumber(process.env['SELECTOR_CACHE_SIZE'], 100),
      ttlMs: this.parseNumber(process.env['SELECTOR_CACHE_TTL_MS'], 600000), // 10 minutes default
      debugMode: this.parseBoolean(process.env['SELECTOR_CACHE_DEBUG'], false)
    };

    logger.info('Selector cache configuration loaded', 'ConfigurationManager', { config });
    return config;
  }

  /**
   * Validate the configuration
   */
  private validateConfiguration(): void {
    const errors: string[] = [];

    // Validate basic configuration
    if (this.config.daysAhead < 1 || this.config.daysAhead > 365) {
      errors.push(`daysAhead must be between 1 and 365, got: ${this.config.daysAhead}`);
    }

    if (!this.isValidTimeFormat(this.config.targetStartTime)) {
      errors.push(`targetStartTime must be in HH:MM format, got: ${this.config.targetStartTime}`);
    }

    if (this.config.duration < 15 || this.config.duration > 240) {
      errors.push(`duration must be between 15 and 240 minutes, got: ${this.config.duration}`);
    }

    if (this.config.maxRetries < 1 || this.config.maxRetries > 10) {
      errors.push(`maxRetries must be between 1 and 10, got: ${this.config.maxRetries}`);
    }

    // Validate advanced configuration
    if (!this.isValidTimezone(this.config.timezone)) {
      errors.push(`Invalid timezone: ${this.config.timezone}`);
    }

    if (this.config.fallbackTimeRange < 0 || this.config.fallbackTimeRange > 480) {
      errors.push(`fallbackTimeRange must be between 0 and 480 minutes, got: ${this.config.fallbackTimeRange}`);
    }

    // Validate court scoring weights
    const weights = this.config.courtScoringWeights;
    const totalWeight = weights.availability + weights.historical + weights.preference + weights.position;
    if (Math.abs(totalWeight - 1.0) > 0.01) {
      errors.push(`Court scoring weights must sum to 1.0, got: ${totalWeight.toFixed(3)}`);
    }

    // Validate time preferences
    this.config.timePreferences.forEach((pref, index) => {
      if (!this.isValidTimeFormat(pref.startTime)) {
        errors.push(`Time preference ${index} has invalid startTime: ${pref.startTime}`);
      }
      if (pref.priority < 1 || pref.priority > 10) {
        errors.push(`Time preference ${index} priority must be between 1 and 10, got: ${pref.priority}`);
      }
      if (pref.flexibility < 0 || pref.flexibility > 120) {
        errors.push(`Time preference ${index} flexibility must be between 0 and 120 minutes, got: ${pref.flexibility}`);
      }
    });

    if (errors.length > 0) {
      throw new Error(`Configuration validation failed: ${errors.join(', ')}`);
    }

    logger.debug('Configuration validation passed', 'ConfigurationManager');
  }

  /**
   * Parse preferred courts from environment string
   */
  private parsePreferredCourts(courtString?: string): string[] {
    if (!courtString || courtString.trim() === '') {
      return [];
    }

    return courtString
      .split(',')
      .map(court => court.trim())
      .filter(court => court.length > 0);
  }

  /**
   * Parse court scoring weights from environment variables
   */
  private parseCourtScoringWeights(): CourtScoringWeights {
    return {
      availability: this.parseNumber(process.env['COURT_WEIGHT_AVAILABILITY'], 0.4),
      historical: this.parseNumber(process.env['COURT_WEIGHT_HISTORICAL'], 0.3),
      preference: this.parseNumber(process.env['COURT_WEIGHT_PREFERENCE'], 0.2),
      position: this.parseNumber(process.env['COURT_WEIGHT_POSITION'], 0.1)
    };
  }

  /**
   * Parse time preferences from environment variables
   */
  private parseTimePreferences(): TimePreference[] {
    const preferences: TimePreference[] = [];
    
    // Parse primary preference (always included)
    const targetTime = process.env['TARGET_START_TIME'] || '14:00';
    preferences.push({
      startTime: targetTime,
      priority: 10,
      flexibility: this.parseNumber(process.env['TIME_FLEXIBILITY'], 30)
    });

    // Parse additional preferences from environment
    const additionalPrefs = process.env['ADDITIONAL_TIME_PREFERENCES'];
    if (additionalPrefs) {
      try {
        const parsedPrefs = JSON.parse(additionalPrefs) as TimePreference[];
        if (Array.isArray(parsedPrefs)) {
          preferences.push(...parsedPrefs);
        }
      } catch (error) {
        logger.warn('Failed to parse additional time preferences', 'ConfigurationManager', {
          error: (error as Error).message,
          rawValue: additionalPrefs
        });
      }
    }

    return preferences;
  }

  /**
   * Parse number from environment variable with fallback
   */
  private parseNumber(value: string | undefined, defaultValue: number): number {
    if (!value || value.trim() === '') {
      return defaultValue;
    }

    const parsed = parseFloat(value);
    return isNaN(parsed) ? defaultValue : parsed;
  }

  /**
   * Parse boolean from environment variable with fallback
   */
  private parseBoolean(value: string | undefined, defaultValue: boolean): boolean {
    if (!value || value.trim() === '') {
      return defaultValue;
    }

    const lowerValue = value.toLowerCase().trim();
    return lowerValue === 'true' || lowerValue === '1' || lowerValue === 'yes';
  }

  /**
   * Validate time format (HH:MM)
   */
  private isValidTimeFormat(time: string): boolean {
    const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
    return timeRegex.test(time);
  }

  /**
   * Basic timezone validation
   */
  private isValidTimezone(timezone: string): boolean {
    try {
      // Test if timezone is valid by trying to create a date with it
      new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(new Date());
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Remove sensitive information from config for logging
   */
  private sanitizeConfigForLogging(config: AdvancedBookingConfig): Record<string, any> {
    return {
      daysAhead: config.daysAhead,
      targetStartTime: config.targetStartTime,
      duration: config.duration,
      maxRetries: config.maxRetries,
      dryRun: config.dryRun,
      timezone: config.timezone,
      preferredCourts: config.preferredCourts,
      enablePatternLearning: config.enablePatternLearning,
      fallbackTimeRange: config.fallbackTimeRange,
      courtScoringWeights: config.courtScoringWeights,
      timePreferencesCount: config.timePreferences.length,
      hasHolidayProvider: !!config.holidayProvider
    };
  }

  /**
   * Get configuration as environment variable format
   */
  getEnvironmentVariables(): Record<string, string> {
    return {
      // Booking configuration
      DAYS_AHEAD: this.config.daysAhead.toString(),
      TARGET_START_TIME: this.config.targetStartTime,
      DURATION: this.config.duration.toString(),
      MAX_RETRIES: this.config.maxRetries.toString(),
      DRY_RUN: this.config.dryRun.toString(),
      TIMEZONE: this.config.timezone,
      PREFERRED_COURTS: this.config.preferredCourts.join(','),
      BOOKING_PATTERN_LEARNING: this.config.enablePatternLearning.toString(),
      FALLBACK_TIME_RANGE: this.config.fallbackTimeRange.toString(),
      COURT_WEIGHT_AVAILABILITY: this.config.courtScoringWeights.availability.toString(),
      COURT_WEIGHT_HISTORICAL: this.config.courtScoringWeights.historical.toString(),
      COURT_WEIGHT_PREFERENCE: this.config.courtScoringWeights.preference.toString(),
      COURT_WEIGHT_POSITION: this.config.courtScoringWeights.position.toString(),
      
      // Monitoring configuration
      LOG_CORRELATION_ID: this.monitoringConfig.enableCorrelationId.toString(),
      LOG_PERFORMANCE: this.monitoringConfig.enablePerformanceLogging.toString(),
      PERFORMANCE_THRESHOLD_WARNING: this.monitoringConfig.performanceThresholdWarning.toString(),
      PERFORMANCE_THRESHOLD_ERROR: this.monitoringConfig.performanceThresholdError.toString(),
      METRICS_ENABLED: this.monitoringConfig.metricsEnabled.toString(),
      MAX_METRICS_HISTORY: this.monitoringConfig.maxMetricsHistory.toString(),
      
      // Health check configuration
      HEALTH_CHECK_ENABLED: this.healthCheckConfig.enabled.toString(),
      HEALTH_CHECK_INTERVAL: this.healthCheckConfig.interval.toString(),
      HEALTH_CHECK_TIMEOUT: this.healthCheckConfig.timeout.toString(),
      WEBSITE_URL: this.healthCheckConfig.websiteUrl,
      HEALTH_CHECK_RETRIES: this.healthCheckConfig.retryAttempts.toString(),
      ALERT_THRESHOLD_RESPONSE_TIME: this.healthCheckConfig.alertThresholds.responseTime.toString(),
      ALERT_THRESHOLD_ERROR_RATE: this.healthCheckConfig.alertThresholds.errorRate.toString(),
      ALERT_THRESHOLD_MEMORY: this.healthCheckConfig.alertThresholds.memoryUsage.toString(),
      
      // Retry configuration
      RETRY_ENABLED: this.retryConfig.enabled.toString(),
      RETRY_MAX_ATTEMPTS: this.retryConfig.maxAttempts.toString(),
      RETRY_MIN_DELAY: this.retryConfig.minDelay.toString(),
      RETRY_MAX_DELAY: this.retryConfig.maxDelay.toString(),
      RETRY_JITTER_ENABLED: this.retryConfig.jitterEnabled.toString(),
      CIRCUIT_BREAKER_FAILURE_THRESHOLD: this.retryConfig.circuitBreaker.failureThreshold.toString(),
      CIRCUIT_BREAKER_RECOVERY_TIMEOUT: this.retryConfig.circuitBreaker.recoveryTimeout.toString(),
      CIRCUIT_BREAKER_REQUEST_VOLUME_THRESHOLD: this.retryConfig.circuitBreaker.requestVolumeThreshold.toString(),
      CIRCUIT_BREAKER_ROLLING_WINDOW: this.retryConfig.circuitBreaker.rollingWindow.toString(),
      CIRCUIT_BREAKER_SUCCESS_THRESHOLD: this.retryConfig.circuitBreaker.successThreshold.toString(),
      RETRY_NETWORK_ATTEMPTS: this.retryConfig.errorSpecific.networkAttempts.toString(),
      RETRY_RATE_LIMIT_ATTEMPTS: this.retryConfig.errorSpecific.rateLimitAttempts.toString(),
      RETRY_SERVER_ERROR_ATTEMPTS: this.retryConfig.errorSpecific.serverErrorAttempts.toString(),
      RETRY_TIMEOUT_ATTEMPTS: this.retryConfig.errorSpecific.timeoutAttempts.toString(),
      RETRY_EXPONENTIAL_BACKOFF: this.retryConfig.exponentialBackoff.enabled.toString(),
      RETRY_EXPONENTIAL_BASE: this.retryConfig.exponentialBackoff.base.toString(),
      RETRY_ABORT_ON_CLIENT_ERRORS: this.retryConfig.abortOnClientErrors.toString(),

      // Selector cache configuration
      SELECTOR_CACHE_ENABLED: this.selectorCacheConfig.enabled.toString(),
      SELECTOR_CACHE_SIZE: this.selectorCacheConfig.maxSize.toString(),
      SELECTOR_CACHE_TTL_MS: this.selectorCacheConfig.ttlMs.toString(),
      SELECTOR_CACHE_DEBUG: this.selectorCacheConfig.debugMode.toString()
    };
  }

  /**
   * Export configuration to JSON for backup/analysis
   */
  exportConfiguration(): string {
    return JSON.stringify(this.config, null, 2);
  }

  /**
   * Import configuration from JSON
   */
  importConfiguration(jsonConfig: string): void {
    try {
      const importedConfig = JSON.parse(jsonConfig) as Partial<AdvancedBookingConfig>;
      this.updateConfig(importedConfig);
    } catch (error) {
      throw new Error(`Failed to import configuration: ${(error as Error).message}`);
    }
  }

  /**
   * Reset configuration to defaults
   */
  resetToDefaults(): void {
    this.config = this.loadConfiguration();
    this.monitoringConfig = this.loadMonitoringConfiguration();
    this.healthCheckConfig = this.loadHealthCheckConfiguration();
    this.retryConfig = this.loadRetryConfiguration();
    this.selectorCacheConfig = this.loadSelectorCacheConfiguration();
    logger.info('All configurations reset to defaults', 'ConfigurationManager');
  }

  /**
   * Get configuration statistics
   */
  getConfigurationStats(): {
    totalPreferences: number;
    totalPreferredCourts: number;
    patternLearningEnabled: boolean;
    hasFallbackRange: boolean;
    isProductionMode: boolean;
    monitoringEnabled: boolean;
    healthChecksEnabled: boolean;
    correlationTrackingEnabled: boolean;
    performanceTrackingEnabled: boolean;
  } {
    return {
      totalPreferences: this.config.timePreferences.length,
      totalPreferredCourts: this.config.preferredCourts.length,
      patternLearningEnabled: this.config.enablePatternLearning,
      hasFallbackRange: this.config.fallbackTimeRange > 0,
      isProductionMode: !this.config.dryRun,
      monitoringEnabled: this.monitoringConfig.enableCorrelationId || this.monitoringConfig.enablePerformanceLogging,
      healthChecksEnabled: this.healthCheckConfig.enabled,
      correlationTrackingEnabled: this.monitoringConfig.enableCorrelationId,
      performanceTrackingEnabled: this.monitoringConfig.enablePerformanceLogging
    };
  }

  /**
   * Get all configurations combined
   */
  getAllConfigurations(): {
    booking: AdvancedBookingConfig;
    monitoring: MonitoringConfig;
    healthCheck: HealthCheckConfig;
    retry: RetryConfig;
    selectorCache: SelectorCacheConfig;
  } {
    return {
      booking: this.getConfig(),
      monitoring: this.getMonitoringConfig(),
      healthCheck: this.getHealthCheckConfig(),
      retry: this.getRetryConfig(),
      selectorCache: this.getSelectorCacheConfig()
    };
  }
}
