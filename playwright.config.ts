import { defineConfig, devices, Project } from '@playwright/test';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

/**
 * Project groups for different testing scenarios
 */
const PROJECT_GROUPS = {
  dev: ['Google Chrome'],
  cross: ['Google Chrome', 'firefox', 'webkit'],
  full: ['Google Chrome', 'firefox', 'webkit', 'Mobile Chrome', 'Mobile Safari', 'Microsoft Edge'],
  ci: ['Google Chrome', 'firefox', 'webkit', 'Mobile Chrome', 'Mobile Safari', 'Microsoft Edge']
};

/**
 * Get selected projects based on PLAYWRIGHT_PROJECTS environment variable
 */
function getSelectedProjects(): string[] {
  const projectsEnv = process.env.PLAYWRIGHT_PROJECTS;
  
  if (!projectsEnv) {
    // Default to 'dev' for development, 'ci' for CI environment
    return PROJECT_GROUPS[process.env.CI ? 'ci' : 'dev'];
  }
  
  const requested = projectsEnv.toLowerCase();
  
  if (PROJECT_GROUPS[requested as keyof typeof PROJECT_GROUPS]) {
    return PROJECT_GROUPS[requested as keyof typeof PROJECT_GROUPS];
  }
  
  // Support custom comma-separated project names
  const customProjects = projectsEnv.split(',').map(p => p.trim());
  console.log(`[PLAYWRIGHT] Using custom project selection: ${customProjects.join(', ')}`);
  return customProjects;
}

/**
 * Filter projects array based on selected project names
 */
function filterProjects(allProjects: Project[], selectedNames: string[]): Project[] {
  const filtered = allProjects.filter(project => selectedNames.includes(project.name));
  
  console.log(`[PLAYWRIGHT] Selected projects (${filtered.length}/${allProjects.length}): ${filtered.map(p => p.name).join(', ')}`);
  
  if (filtered.length === 0) {
    console.warn(`[PLAYWRIGHT] WARNING: No projects matched selection "${selectedNames.join(', ')}". Available: ${allProjects.map(p => p.name).join(', ')}`);
    // Fallback to Chrome if no matches
    return allProjects.filter(project => project.name === 'Google Chrome');
  }
  
  return filtered;
}

/**
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './tests/e2e',
  /* Run tests in files in parallel */
  fullyParallel: false, // Disable for booking tests to avoid conflicts
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 1,
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : 1, // Single worker for booking automation
  /* Timeout for each test */
  timeout: 120000, // 2 minutes per test
  /* Expect timeout */
  expect: {
    timeout: 10000 // 10 seconds for assertions
  },
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: [
    ['html', { outputFolder: 'test-reports/html-report', open: 'never' }],
    ['junit', { outputFile: 'test-reports/junit-results.xml' }],
    ['json', { outputFile: 'test-reports/test-results.json' }],
    ['line'], // More concise console output
    // Modern blob reporter for advanced analysis
    ['blob', { outputDir: 'test-reports/blob-report' }]
  ],
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: 'https://www.eversports.de',
    
    /* Collect trace with modern options */
    trace: process.env.CI ? 'on-first-retry' : 'retain-on-failure',
    
    /* Screenshots for all test results in development */
    screenshot: process.env.CI ? 'only-on-failure' : 'on',
    
    /* Video recording - enhanced for debugging */
    video: {
      mode: process.env.CI ? 'retain-on-failure' : 'on',
      size: { width: 1280, height: 720 }
    },
    
    /* Global timeout for all tests */
    actionTimeout: 45000,
    navigationTimeout: 90000,
    
    /* Additional settings for booking automation */
    ignoreHTTPSErrors: true,
    colorScheme: 'light',
    
    /* Emulate real user behavior */
    extraHTTPHeaders: {
      'Accept-Language': 'de-DE,de;q=0.9,en;q=0.8'
    },
  },

  /* Configure projects for major browsers - optimized for performance */
  projects: (() => {
    const allProjects: Project[] = [
      {
        name: 'Google Chrome',
        use: { 
          ...devices['Desktop Chrome'], 
          channel: 'chrome',
          // Optimized for booking automation
          viewport: { width: 1920, height: 1080 }
        },
      },

      {
        name: 'firefox',
        use: { 
          ...devices['Desktop Firefox'],
          // Consistent viewport for cross-browser testing
          viewport: { width: 1920, height: 1080 }
        },
      },

      {
        name: 'webkit',
        use: { 
          ...devices['Desktop Safari'],
          // Consistent viewport for cross-browser testing
          viewport: { width: 1920, height: 1080 }
        },
      },

      {
        name: 'Microsoft Edge',
        use: { 
          ...devices['Desktop Edge'], 
          channel: 'msedge',
          viewport: { width: 1920, height: 1080 }
        },
      },

      /* Mobile testing - optional based on project selection */
      {
        name: 'Mobile Chrome',
        use: { 
          ...devices['Pixel 5'],
          // Mobile-optimized settings for booking automation
          isMobile: true,
          hasTouch: true
        },
      },
      {
        name: 'Mobile Safari',
        use: { 
          ...devices['iPhone 12'],
          // Mobile-optimized settings for booking automation  
          isMobile: true,
          hasTouch: true
        },
      },
    ];

    const selectedProjects = getSelectedProjects();
    return filterProjects(allProjects, selectedProjects);
  })(),

  /* Run your local dev server before starting the tests */
  // webServer: {
  //   command: 'npm run start',
  //   url: 'http://127.0.0.1:3000',
  //   reuseExistingServer: !process.env.CI,
  // },
  
  /* Output directories - separate artifact and report directories */
  outputDir: 'test-artifacts/',
  
  /* Global setup and teardown */
  globalSetup: require.resolve('./tests/playwright-setup.ts'),
  // globalTeardown: require.resolve('./tests/global-teardown'),
  
  /* Modern Playwright features */
  metadata: {
    project: 'Squash Booking Automation',
    version: '2.0',
    environment: process.env.NODE_ENV || 'development'
  },
  
  /* Enable UI mode and debug features */
  webServer: process.env.PLAYWRIGHT_UI_MODE ? {
    command: 'echo "UI Mode enabled for interactive development"',
    port: 0, // Don't start actual server in UI mode
    reuseExistingServer: true,
  } : undefined,
});