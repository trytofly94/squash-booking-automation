import { logger } from './logger';
import type { BookingPair, BookingResult } from '../types/booking.types';

/**
 * Enhanced Dry-Run Validation Framework
 * Provides comprehensive validation and safety mechanisms for booking automation
 */

export interface DryRunValidationResult {
  isValid: boolean;
  warnings: string[];
  errors: string[];
  safetyChecks: SafetyCheckResult[];
  recommendations: string[];
}

export interface SafetyCheckResult {
  checkName: string;
  passed: boolean;
  message: string;
  severity: 'info' | 'warning' | 'error';
}

export interface ValidationPoint {
  stepName: string;
  timestamp: string;
  status: 'pending' | 'success' | 'warning' | 'error';
  message: string;
  data?: any;
}

export class DryRunValidator {
  private validationPoints: ValidationPoint[] = [];
  private safetyLevel: 'minimal' | 'standard' | 'strict' = 'standard';

  constructor(safetyLevel: 'minimal' | 'standard' | 'strict' = 'standard') {
    this.safetyLevel = safetyLevel;
    logger.info('DryRunValidator initialized', 'DryRunValidator', { safetyLevel });
  }

  /**
   * Add a validation checkpoint
   */
  addValidationPoint(point: Omit<ValidationPoint, 'timestamp'>): void {
    const validationPoint: ValidationPoint = {
      ...point,
      timestamp: new Date().toISOString(),
    };

    this.validationPoints.push(validationPoint);

    logger.info(`Validation point: ${point.stepName}`, 'DryRunValidator', {
      status: point.status,
      message: point.message,
    });
  }

  /**
   * Validate booking configuration before execution
   */
  validateBookingConfig(config: any): DryRunValidationResult {
    const component = 'DryRunValidator.validateBookingConfig';
    const warnings: string[] = [];
    const errors: string[] = [];
    const safetyChecks: SafetyCheckResult[] = [];
    const recommendations: string[] = [];

    // Safety Check 1: Dry Run Mode
    const dryRunCheck = this.checkDryRunMode(config);
    safetyChecks.push(dryRunCheck);
    if (!dryRunCheck.passed) {
      errors.push(dryRunCheck.message);
    }

    // Safety Check 2: Days Ahead Validation
    const daysAheadCheck = this.validateDaysAhead(config.daysAhead);
    safetyChecks.push(daysAheadCheck);
    if (!daysAheadCheck.passed && daysAheadCheck.severity === 'error') {
      errors.push(daysAheadCheck.message);
    } else if (!daysAheadCheck.passed && daysAheadCheck.severity === 'warning') {
      warnings.push(daysAheadCheck.message);
    }

    // Safety Check 3: Time Format Validation
    const timeFormatCheck = this.validateTimeFormat(config.targetStartTime);
    safetyChecks.push(timeFormatCheck);
    if (!timeFormatCheck.passed) {
      errors.push(timeFormatCheck.message);
    }

    // Safety Check 4: Duration Validation
    const durationCheck = this.validateDuration(config.duration);
    safetyChecks.push(durationCheck);
    if (!durationCheck.passed && durationCheck.severity === 'error') {
      errors.push(durationCheck.message);
    } else if (!durationCheck.passed && durationCheck.severity === 'warning') {
      warnings.push(durationCheck.message);
    }

    // Safety Check 5: Retry Configuration
    const retryCheck = this.validateRetryConfig(config.maxRetries);
    safetyChecks.push(retryCheck);
    if (!retryCheck.passed && retryCheck.severity === 'warning') {
      warnings.push(retryCheck.message);
      recommendations.push('Consider increasing maxRetries for better reliability');
    }

    // Environment-specific checks
    if (this.safetyLevel === 'strict') {
      const envCheck = this.performEnvironmentChecks();
      safetyChecks.push(...envCheck);
    }

    const isValid = errors.length === 0;

    this.addValidationPoint({
      stepName: 'Configuration Validation',
      status: isValid ? 'success' : 'error',
      message: `Configuration validation ${isValid ? 'passed' : 'failed'}`,
      data: { warnings: warnings.length, errors: errors.length },
    });

    logger.info('Configuration validation completed', component, {
      isValid,
      warningCount: warnings.length,
      errorCount: errors.length,
      safetyChecksPassed: safetyChecks.filter(c => c.passed).length,
      totalSafetyChecks: safetyChecks.length,
    });

    return {
      isValid,
      warnings,
      errors,
      safetyChecks,
      recommendations,
    };
  }

  /**
   * Validate booking pair before selection
   */
  validateBookingPair(pair: BookingPair): DryRunValidationResult {
    const warnings: string[] = [];
    const errors: string[] = [];
    const safetyChecks: SafetyCheckResult[] = [];
    const recommendations: string[] = [];

    // Check pair structure
    if (!pair.courtId || !pair.slot1 || !pair.slot2) {
      errors.push('Invalid booking pair structure');
      safetyChecks.push({
        checkName: 'Pair Structure',
        passed: false,
        message: 'Booking pair missing required properties',
        severity: 'error',
      });
    } else {
      safetyChecks.push({
        checkName: 'Pair Structure',
        passed: true,
        message: 'Booking pair structure is valid',
        severity: 'info',
      });
    }

    // Check time continuity
    const slot1Time = this.parseTime(pair.slot1.startTime);
    const slot2Time = this.parseTime(pair.slot2.startTime);

    if (slot1Time && slot2Time) {
      const timeDiff = slot2Time.getTime() - slot1Time.getTime();
      const expectedDiff = 60 * 60 * 1000; // 1 hour in milliseconds

      if (Math.abs(timeDiff - expectedDiff) > 5 * 60 * 1000) {
        // 5 minute tolerance
        warnings.push('Time slots are not consecutive (expected 1-hour difference)');
        safetyChecks.push({
          checkName: 'Time Continuity',
          passed: false,
          message: `Time gap is ${Math.round(timeDiff / (60 * 1000))} minutes instead of 60`,
          severity: 'warning',
        });
        recommendations.push('Verify that consecutive slots are selected for seamless booking');
      } else {
        safetyChecks.push({
          checkName: 'Time Continuity',
          passed: true,
          message: 'Time slots are properly consecutive',
          severity: 'info',
        });
      }
    }

    // Check element selectors
    if (!pair.slot1.elementSelector || !pair.slot2.elementSelector) {
      warnings.push('Missing element selectors for slot interaction');
      safetyChecks.push({
        checkName: 'Element Selectors',
        passed: false,
        message: 'Missing element selectors - may impact booking reliability',
        severity: 'warning',
      });
      recommendations.push('Update slot detection to include element selectors');
    } else {
      safetyChecks.push({
        checkName: 'Element Selectors',
        passed: true,
        message: 'Element selectors are available',
        severity: 'info',
      });
    }

    const isValid = errors.length === 0;

    this.addValidationPoint({
      stepName: 'Booking Pair Validation',
      status: isValid ? (warnings.length > 0 ? 'warning' : 'success') : 'error',
      message: `Pair validation for ${pair.courtId} at ${pair.slot1.startTime}`,
      data: { courtId: pair.courtId, slot1: pair.slot1.startTime, slot2: pair.slot2.startTime },
    });

    return {
      isValid,
      warnings,
      errors,
      safetyChecks,
      recommendations,
    };
  }

  /**
   * Validate final booking result
   */
  validateBookingResult(result: BookingResult): DryRunValidationResult {
    const warnings: string[] = [];
    const errors: string[] = [];
    const safetyChecks: SafetyCheckResult[] = [];
    const recommendations: string[] = [];

    // Check result structure
    if (typeof result.success !== 'boolean') {
      errors.push('Invalid booking result structure - missing success flag');
    }

    if (!result.timestamp) {
      warnings.push('Missing timestamp in booking result');
    }

    if (typeof result.retryAttempts !== 'number') {
      warnings.push('Missing or invalid retry attempts count');
    }

    // Success-specific validations
    if (result.success) {
      if (!result.bookedPair) {
        errors.push('Successful booking result missing booked pair data');
        safetyChecks.push({
          checkName: 'Success Data Integrity',
          passed: false,
          message: 'Successful result lacks booking details',
          severity: 'error',
        });
      } else {
        safetyChecks.push({
          checkName: 'Success Data Integrity',
          passed: true,
          message: 'Successful result contains complete booking details',
          severity: 'info',
        });
      }
    } else {
      // Failure-specific validations
      if (!result.error) {
        warnings.push('Failed booking result missing error message');
        safetyChecks.push({
          checkName: 'Failure Data Integrity',
          passed: false,
          message: 'Failed result lacks error details',
          severity: 'warning',
        });
        recommendations.push('Include detailed error messages for better debugging');
      } else {
        safetyChecks.push({
          checkName: 'Failure Data Integrity',
          passed: true,
          message: 'Failed result contains error details',
          severity: 'info',
        });
      }
    }

    // Retry attempts validation
    if (result.retryAttempts > 10) {
      warnings.push('Unusually high number of retry attempts');
      recommendations.push('Review retry logic and network conditions');
    }

    const isValid = errors.length === 0;

    this.addValidationPoint({
      stepName: 'Booking Result Validation',
      status: isValid ? 'success' : 'error',
      message: `Result validation for ${result.success ? 'successful' : 'failed'} booking`,
      data: {
        success: result.success,
        retryAttempts: result.retryAttempts,
        hasError: !!result.error,
        hasBookedPair: !!result.bookedPair,
      },
    });

    return {
      isValid,
      warnings,
      errors,
      safetyChecks,
      recommendations,
    };
  }

  /**
   * Generate comprehensive validation report
   */
  generateValidationReport(): any {
    const totalPoints = this.validationPoints.length;
    const successPoints = this.validationPoints.filter(p => p.status === 'success').length;
    const warningPoints = this.validationPoints.filter(p => p.status === 'warning').length;
    const errorPoints = this.validationPoints.filter(p => p.status === 'error').length;

    const report = {
      summary: {
        totalValidationPoints: totalPoints,
        successfulPoints: successPoints,
        warningPoints: warningPoints,
        errorPoints: errorPoints,
        successRate: totalPoints > 0 ? Math.round((successPoints / totalPoints) * 100) : 0,
      },
      validationPoints: this.validationPoints,
      generatedAt: new Date().toISOString(),
      safetyLevel: this.safetyLevel,
    };

    logger.info('Validation report generated', 'DryRunValidator', report.summary);

    return report;
  }

  /**
   * Reset validation state
   */
  reset(): void {
    this.validationPoints = [];
    logger.info('Validation state reset', 'DryRunValidator');
  }

  // Private helper methods

  private checkDryRunMode(config: any): SafetyCheckResult {
    const isDryRun = config.dryRun === true;

    return {
      checkName: 'Dry Run Mode',
      passed: isDryRun,
      message: isDryRun
        ? 'Running in safe dry-run mode'
        : 'WARNING: Running in PRODUCTION mode - real bookings will be made',
      severity: isDryRun ? 'info' : 'error',
    };
  }

  private validateDaysAhead(daysAhead: number): SafetyCheckResult {
    if (!Number.isInteger(daysAhead) || daysAhead < 0) {
      return {
        checkName: 'Days Ahead',
        passed: false,
        message: 'Days ahead must be a positive integer',
        severity: 'error',
      };
    }

    if (daysAhead > 30) {
      return {
        checkName: 'Days Ahead',
        passed: false,
        message: 'Days ahead is unusually high (>30 days)',
        severity: 'warning',
      };
    }

    if (daysAhead < 1) {
      return {
        checkName: 'Days Ahead',
        passed: false,
        message: 'Booking for same day may not be possible',
        severity: 'warning',
      };
    }

    return {
      checkName: 'Days Ahead',
      passed: true,
      message: `Booking ${daysAhead} days ahead is valid`,
      severity: 'info',
    };
  }

  private validateTimeFormat(time: string): SafetyCheckResult {
    const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;

    if (!timeRegex.test(time)) {
      return {
        checkName: 'Time Format',
        passed: false,
        message: 'Time format must be HH:MM (24-hour format)',
        severity: 'error',
      };
    }

    return {
      checkName: 'Time Format',
      passed: true,
      message: 'Time format is valid',
      severity: 'info',
    };
  }

  private validateDuration(duration: number): SafetyCheckResult {
    if (!Number.isInteger(duration) || duration <= 0) {
      return {
        checkName: 'Duration',
        passed: false,
        message: 'Duration must be a positive integer (minutes)',
        severity: 'error',
      };
    }

    if (duration < 30) {
      return {
        checkName: 'Duration',
        passed: false,
        message: 'Duration less than 30 minutes may not be practical',
        severity: 'warning',
      };
    }

    if (duration > 180) {
      return {
        checkName: 'Duration',
        passed: false,
        message: 'Duration over 3 hours is unusually long',
        severity: 'warning',
      };
    }

    return {
      checkName: 'Duration',
      passed: true,
      message: `Duration of ${duration} minutes is valid`,
      severity: 'info',
    };
  }

  private validateRetryConfig(maxRetries: number): SafetyCheckResult {
    if (!Number.isInteger(maxRetries) || maxRetries < 0) {
      return {
        checkName: 'Retry Configuration',
        passed: false,
        message: 'Max retries must be a non-negative integer',
        severity: 'error',
      };
    }

    if (maxRetries < 1) {
      return {
        checkName: 'Retry Configuration',
        passed: false,
        message: 'No retries configured - may reduce reliability',
        severity: 'warning',
      };
    }

    return {
      checkName: 'Retry Configuration',
      passed: true,
      message: `Retry configuration with ${maxRetries} attempts is valid`,
      severity: 'info',
    };
  }

  private performEnvironmentChecks(): SafetyCheckResult[] {
    const checks: SafetyCheckResult[] = [];

    // Check for production environment variables
    const prodEnvVars = ['PRODUCTION', 'PROD', 'NODE_ENV'];
    const hasProdEnv = prodEnvVars.some(
      envVar => process.env[envVar] === 'production' || process.env[envVar] === 'prod'
    );

    checks.push({
      checkName: 'Environment Variables',
      passed: !hasProdEnv,
      message: hasProdEnv
        ? 'Production environment detected - extra caution required'
        : 'Development environment detected',
      severity: hasProdEnv ? 'warning' : 'info',
    });

    return checks;
  }

  private parseTime(timeStr: string): Date | null {
    try {
      const [hours, minutes] = timeStr.split(':').map(Number);
      const date = new Date();
      date.setHours(hours ?? 0, minutes ?? 0, 0, 0);
      return date;
    } catch {
      return null;
    }
  }
}
