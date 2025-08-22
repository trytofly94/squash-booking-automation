import { ConfigurationManager } from '../../src/utils/ConfigurationManager';

// Mock logger to avoid console output in tests
jest.mock('../../src/utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('ConfigurationManager', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env };
    
    // Clear environment variables
    delete process.env['DAYS_AHEAD'];
    delete process.env['TARGET_START_TIME'];
    delete process.env['DURATION'];
    delete process.env['MAX_RETRIES'];
    delete process.env['DRY_RUN'];
    delete process.env['TIMEZONE'];
    delete process.env['PREFERRED_COURTS'];
    delete process.env['BOOKING_PATTERN_LEARNING'];
    delete process.env['FALLBACK_TIME_RANGE'];
    delete process.env['COURT_WEIGHT_AVAILABILITY'];
    delete process.env['COURT_WEIGHT_HISTORICAL'];
    delete process.env['COURT_WEIGHT_PREFERENCE'];
    delete process.env['COURT_WEIGHT_POSITION'];
    delete process.env['TIME_FLEXIBILITY'];
    delete process.env['ADDITIONAL_TIME_PREFERENCES'];

    // Reset singleton instance
    (ConfigurationManager as any).instance = undefined;
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
    // Reset singleton instance
    (ConfigurationManager as any).instance = undefined;
  });

  describe('singleton pattern', () => {
    it('should return the same instance', () => {
      const instance1 = ConfigurationManager.getInstance();
      const instance2 = ConfigurationManager.getInstance();
      
      expect(instance1).toBe(instance2);
    });
  });

  describe('default configuration loading', () => {
    it('should load default configuration values', () => {
      const config = ConfigurationManager.getInstance().getConfig();
      
      expect(config.daysAhead).toBe(20);
      expect(config.targetStartTime).toBe('14:00');
      expect(config.duration).toBe(60);
      expect(config.maxRetries).toBe(3);
      expect(config.dryRun).toBe(true);
      expect(config.timezone).toBe('Europe/Berlin');
      expect(config.preferredCourts).toEqual([]);
      expect(config.enablePatternLearning).toBe(false);
      expect(config.fallbackTimeRange).toBe(120);
      expect(config.courtScoringWeights).toEqual({
        availability: 0.4,
        historical: 0.3,
        preference: 0.2,
        position: 0.1
      });
      expect(config.timePreferences).toHaveLength(1);
      expect(config.timePreferences[0].startTime).toBe('14:00');
    });
  });

  describe('environment variable parsing', () => {
    it('should parse basic configuration from environment', () => {
      process.env['DAYS_AHEAD'] = '15';
      process.env['TARGET_START_TIME'] = '13:30';
      process.env['DURATION'] = '90';
      process.env['MAX_RETRIES'] = '5';
      process.env['DRY_RUN'] = 'false';

      const config = ConfigurationManager.getInstance().getConfig();
      
      expect(config.daysAhead).toBe(15);
      expect(config.targetStartTime).toBe('13:30');
      expect(config.duration).toBe(90);
      expect(config.maxRetries).toBe(5);
      expect(config.dryRun).toBe(false);
    });

    it('should parse advanced configuration from environment', () => {
      process.env['TIMEZONE'] = 'America/New_York';
      process.env['PREFERRED_COURTS'] = '1,3,5';
      process.env['BOOKING_PATTERN_LEARNING'] = 'true';
      process.env['FALLBACK_TIME_RANGE'] = '180';

      const config = ConfigurationManager.getInstance().getConfig();
      
      expect(config.timezone).toBe('America/New_York');
      expect(config.preferredCourts).toEqual(['1', '3', '5']);
      expect(config.enablePatternLearning).toBe(true);
      expect(config.fallbackTimeRange).toBe(180);
    });

    it('should parse court scoring weights', () => {
      process.env['COURT_WEIGHT_AVAILABILITY'] = '0.5';
      process.env['COURT_WEIGHT_HISTORICAL'] = '0.2';
      process.env['COURT_WEIGHT_PREFERENCE'] = '0.2';
      process.env['COURT_WEIGHT_POSITION'] = '0.1';

      const config = ConfigurationManager.getInstance().getConfig();
      
      expect(config.courtScoringWeights).toEqual({
        availability: 0.5,
        historical: 0.2,
        preference: 0.2,
        position: 0.1
      });
    });

    it('should parse boolean values correctly', () => {
      // Test various boolean representations
      process.env['DRY_RUN'] = 'true';
      expect(ConfigurationManager.getInstance().getConfig().dryRun).toBe(true);
      
      (ConfigurationManager as any).instance = undefined;
      process.env['DRY_RUN'] = '1';
      expect(ConfigurationManager.getInstance().getConfig().dryRun).toBe(true);
      
      (ConfigurationManager as any).instance = undefined;
      process.env['DRY_RUN'] = 'yes';
      expect(ConfigurationManager.getInstance().getConfig().dryRun).toBe(true);
      
      (ConfigurationManager as any).instance = undefined;
      process.env['DRY_RUN'] = 'false';
      expect(ConfigurationManager.getInstance().getConfig().dryRun).toBe(false);
      
      (ConfigurationManager as any).instance = undefined;
      process.env['DRY_RUN'] = '0';
      expect(ConfigurationManager.getInstance().getConfig().dryRun).toBe(false);
    });

    it('should handle malformed preferred courts gracefully', () => {
      process.env['PREFERRED_COURTS'] = '1,,3, ,5,';
      
      const config = ConfigurationManager.getInstance().getConfig();
      expect(config.preferredCourts).toEqual(['1', '3', '5']);
    });

    it('should handle invalid numbers gracefully', () => {
      process.env['DAYS_AHEAD'] = 'invalid';
      process.env['DURATION'] = 'not-a-number';
      
      const config = ConfigurationManager.getInstance().getConfig();
      expect(config.daysAhead).toBe(20); // Default value
      expect(config.duration).toBe(60); // Default value
    });
  });

  describe('configuration validation', () => {
    it('should reject invalid configuration values', () => {
      expect(() => {
        ConfigurationManager.getInstance().updateConfig({
          daysAhead: 0 // Invalid: too low
        });
      }).toThrow(/daysAhead must be between 1 and 365/);

      expect(() => {
        ConfigurationManager.getInstance().updateConfig({
          targetStartTime: '25:00' // Invalid time format
        });
      }).toThrow(/targetStartTime must be in HH:MM format/);

      expect(() => {
        ConfigurationManager.getInstance().updateConfig({
          duration: 5 // Invalid: too short
        });
      }).toThrow(/duration must be between 15 and 240 minutes/);

      expect(() => {
        ConfigurationManager.getInstance().updateConfig({
          maxRetries: 0 // Invalid: too low
        });
      }).toThrow(/maxRetries must be between 1 and 10/);
    });

    it('should validate court scoring weights sum to 1.0', () => {
      expect(() => {
        ConfigurationManager.getInstance().updateConfig({
          courtScoringWeights: {
            availability: 0.5,
            historical: 0.3,
            preference: 0.3, // Sum = 1.1 (invalid)
            position: 0.0
          }
        });
      }).toThrow(/Court scoring weights must sum to 1.0/);
    });

    it('should validate time preferences', () => {
      expect(() => {
        ConfigurationManager.getInstance().updateConfig({
          timePreferences: [{
            startTime: '25:00', // Invalid time
            priority: 5,
            flexibility: 30
          }]
        });
      }).toThrow(/Time preference 0 has invalid startTime/);

      expect(() => {
        ConfigurationManager.getInstance().updateConfig({
          timePreferences: [{
            startTime: '14:00',
            priority: 11, // Invalid: too high
            flexibility: 30
          }]
        });
      }).toThrow(/Time preference 0 priority must be between 1 and 10/);
    });

    it('should validate timezone', () => {
      expect(() => {
        ConfigurationManager.getInstance().updateConfig({
          timezone: 'Invalid/Timezone'
        });
      }).toThrow(/Invalid timezone/);
    });
  });

  describe('configuration updates', () => {
    it('should allow valid configuration updates', () => {
      const manager = ConfigurationManager.getInstance();
      const originalConfig = manager.getConfig();
      
      manager.updateConfig({
        daysAhead: 25,
        targetStartTime: '15:00'
      });
      
      const updatedConfig = manager.getConfig();
      expect(updatedConfig.daysAhead).toBe(25);
      expect(updatedConfig.targetStartTime).toBe('15:00');
      // Other values should remain unchanged
      expect(updatedConfig.duration).toBe(originalConfig.duration);
    });

    it('should rollback on validation errors', () => {
      const manager = ConfigurationManager.getInstance();
      const originalConfig = manager.getConfig();
      
      expect(() => {
        manager.updateConfig({
          daysAhead: 25, // Valid
          targetStartTime: 'invalid' // Invalid
        });
      }).toThrow();
      
      // Configuration should remain unchanged after failed update
      const currentConfig = manager.getConfig();
      expect(currentConfig.daysAhead).toBe(originalConfig.daysAhead);
      expect(currentConfig.targetStartTime).toBe(originalConfig.targetStartTime);
    });
  });

  describe('utility methods', () => {
    it('should export configuration to environment variables format', () => {
      const manager = ConfigurationManager.getInstance();
      manager.updateConfig({
        preferredCourts: ['1', '2', '3'],
        enablePatternLearning: true
      });
      
      const envVars = manager.getEnvironmentVariables();
      
      expect(envVars.PREFERRED_COURTS).toBe('1,2,3');
      expect(envVars.BOOKING_PATTERN_LEARNING).toBe('true');
      expect(envVars.TARGET_START_TIME).toBe('14:00');
    });

    it('should export and import configuration as JSON', () => {
      const manager = ConfigurationManager.getInstance();
      const originalConfig = manager.getConfig();
      
      manager.updateConfig({
        daysAhead: 30,
        preferredCourts: ['7', '8']
      });
      
      const exportedJson = manager.exportConfiguration();
      const parsedConfig = JSON.parse(exportedJson);
      
      expect(parsedConfig.daysAhead).toBe(30);
      expect(parsedConfig.preferredCourts).toEqual(['7', '8']);
      
      // Reset and import
      manager.resetToDefaults();
      manager.importConfiguration(exportedJson);
      
      const importedConfig = manager.getConfig();
      expect(importedConfig.daysAhead).toBe(30);
      expect(importedConfig.preferredCourts).toEqual(['7', '8']);
    });

    it('should provide configuration statistics', () => {
      const manager = ConfigurationManager.getInstance();
      manager.updateConfig({
        preferredCourts: ['1', '2', '3'],
        enablePatternLearning: true,
        fallbackTimeRange: 60,
        dryRun: false
      });
      
      const stats = manager.getConfigurationStats();
      
      expect(stats.totalPreferredCourts).toBe(3);
      expect(stats.patternLearningEnabled).toBe(true);
      expect(stats.hasFallbackRange).toBe(true);
      expect(stats.isProductionMode).toBe(true);
      expect(stats.totalPreferences).toBeGreaterThan(0);
    });

    it('should reset to defaults', () => {
      const manager = ConfigurationManager.getInstance();
      
      manager.updateConfig({
        daysAhead: 99,
        targetStartTime: '10:00'
      });
      
      manager.resetToDefaults();
      const config = manager.getConfig();
      
      expect(config.daysAhead).toBe(20); // Default value
      expect(config.targetStartTime).toBe('14:00'); // Default value
    });
  });

  describe('configuration immutability', () => {
    it('should return a copy of configuration to prevent mutation', () => {
      const manager = ConfigurationManager.getInstance();
      const config1 = manager.getConfig();
      const config2 = manager.getConfig();
      
      expect(config1).not.toBe(config2); // Different objects
      expect(config1).toEqual(config2); // Same content
      
      // Mutating returned config should not affect stored config
      config1.daysAhead = 999;
      expect(manager.getConfig().daysAhead).toBe(20); // Should remain default
    });
  });
});