import { FullConfig } from '@playwright/test';
import dotenv from 'dotenv';

/**
 * Global setup for Playwright tests
 * Ensures environment is properly configured for E2E testing
 */
async function globalSetup(config: FullConfig) {
  // Load environment variables
  dotenv.config();

  // Ensure dry run mode is enabled for safety
  if (!process.env.DRY_RUN || process.env.DRY_RUN !== 'true') {
    console.warn('⚠️  DRY_RUN not explicitly set to true. Enabling safety mode.');
    process.env.DRY_RUN = 'true';
  }

  // Log configuration for debugging
  console.log('🔧 Playwright Global Setup:');
  console.log('   Base URL:', config.use?.baseURL);
  console.log('   Dry Run Mode:', process.env.DRY_RUN);
  console.log('   Workers:', config.workers);
  console.log('   Retries:', config.retries);
}

export default globalSetup;
