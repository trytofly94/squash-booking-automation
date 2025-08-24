import { SuccessDetectionConfig } from '@/types/booking.types';

/**
 * Configuration manager for success detection settings
 * Handles environment-based configuration for success detection strategies
 */
export class SuccessDetectionConfigManager {
  /**
   * Get success detection configuration from environment variables with sensible defaults
   */
  static getConfig(): SuccessDetectionConfig {
    return {
      networkTimeout: parseInt(process.env.SUCCESS_DETECTION_NETWORK_TIMEOUT || '10000'),
      domTimeout: parseInt(process.env.SUCCESS_DETECTION_DOM_TIMEOUT || '5000'),
      urlCheckInterval: parseInt(process.env.SUCCESS_DETECTION_URL_CHECK_INTERVAL || '500'),
      enableNetworkMonitoring: process.env.SUCCESS_DETECTION_ENABLE_NETWORK !== 'false',
      enableDomDetection: process.env.SUCCESS_DETECTION_ENABLE_DOM !== 'false',
      enableUrlDetection: process.env.SUCCESS_DETECTION_ENABLE_URL !== 'false',
      enableTextFallback: process.env.SUCCESS_DETECTION_ENABLE_TEXT_FALLBACK === 'true'
    };
  }

  /**
   * Get configuration optimized for live bookings (no text fallback)
   */
  static getLiveConfig(): SuccessDetectionConfig {
    const config = this.getConfig();
    // Force text fallback to false for live bookings to avoid false positives
    config.enableTextFallback = false;
    return config;
  }

  /**
   * Get configuration optimized for testing (includes text fallback)
   */
  static getTestConfig(): SuccessDetectionConfig {
    const config = this.getConfig();
    // Enable text fallback for testing scenarios
    config.enableTextFallback = true;
    return config;
  }

  /**
   * Validate configuration values and log warnings for suspicious settings
   */
  static validateConfig(config: SuccessDetectionConfig): void {
    // Validate timeouts
    if (config.networkTimeout < 1000) {
      console.warn('SUCCESS_DETECTION: Network timeout is very low (< 1s), may cause false negatives');
    }
    if (config.networkTimeout > 30000) {
      console.warn('SUCCESS_DETECTION: Network timeout is very high (> 30s), may cause slow failures');
    }
    
    if (config.domTimeout < 1000) {
      console.warn('SUCCESS_DETECTION: DOM timeout is very low (< 1s), may cause false negatives');
    }
    
    if (config.urlCheckInterval < 100) {
      console.warn('SUCCESS_DETECTION: URL check interval is very low (< 100ms), may cause high CPU usage');
    }
    if (config.urlCheckInterval > 2000) {
      console.warn('SUCCESS_DETECTION: URL check interval is very high (> 2s), may miss quick redirects');
    }

    // Validate at least one detection method is enabled
    const enabledMethods = [
      config.enableNetworkMonitoring,
      config.enableDomDetection,
      config.enableUrlDetection,
      config.enableTextFallback
    ].filter(Boolean).length;

    if (enabledMethods === 0) {
      throw new Error('SUCCESS_DETECTION: At least one detection method must be enabled');
    }

    if (enabledMethods === 1 && config.enableTextFallback) {
      console.warn('SUCCESS_DETECTION: Only text fallback is enabled, this may cause false positives in live bookings');
    }
  }
}