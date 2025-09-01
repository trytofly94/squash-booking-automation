import { BasePage } from '../../src/pages/BasePage';
import type { Page, Locator } from '@playwright/test';

// Mock the logger
jest.mock('../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }
}));

// Mock other dependencies
jest.mock('../../src/core/retry', () => ({
  getGlobalRetryManager: jest.fn().mockReturnValue({
    executeWithBackoff: jest.fn().mockImplementation(async (fn) => await fn())
  })
}));

jest.mock('../../src/utils/SelectorFallbackManager', () => ({
  SelectorFallbackManager: jest.fn().mockImplementation(() => ({}))
}));

jest.mock('../../src/utils/SelectorCache', () => ({
  getGlobalSelectorCache: jest.fn().mockImplementation(() => {
    throw new Error('Cache not initialized');
  })
}));

jest.mock('../../src/utils/BrowserContextPool', () => ({
  CONTEXT_POOL_CONSTANTS: {
    ESTIMATED_REUSED_CONTEXT_AGE: 5000,
    CONTEXT_REUSE_DETECTION_THRESHOLD: 1000
  }
}));

// Create a test class that extends BasePage
class TestPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }
}

describe('BasePage Cookie Consent Handling', () => {
  let mockPage: Partial<Page>;
  let mockLocator: Partial<Locator>;
  let testPage: TestPage;

  beforeEach(() => {
    mockLocator = {
      waitFor: jest.fn().mockResolvedValue(undefined),
      click: jest.fn().mockResolvedValue(undefined)
    };

    mockPage = {
      goto: jest.fn().mockResolvedValue(undefined),
      waitForLoadState: jest.fn().mockResolvedValue(undefined),
      locator: jest.fn().mockReturnValue(mockLocator),
      click: jest.fn().mockResolvedValue(undefined),
      url: jest.fn().mockReturnValue('https://www.eversports.de/test'),
      context: jest.fn().mockReturnValue({
        pages: jest.fn().mockReturnValue([mockPage]),
        clearCookies: jest.fn().mockResolvedValue(undefined)
      })
    };

    testPage = new TestPage(mockPage as Page);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('handleCookieConsent', () => {
    test('should handle cookie consent when banner is found', async () => {
      // Mock successful cookie banner detection
      (testPage as any).waitForAnySelector = jest.fn().mockResolvedValue('button:has-text("Accept")');
      (testPage as any).safeClick = jest.fn().mockResolvedValue(undefined);

      await testPage.handleCookieConsent();

      expect((testPage as any).waitForAnySelector).toHaveBeenCalledWith(
        expect.arrayContaining([
          'button[data-testid="accept-cookies"]',
          '.cookie-accept',
          'button:has-text("Accept")',
          'button:has-text("Akzeptieren")',
          'button:has-text("Alle akzeptieren")',
        ]),
        5000
      );
      expect((testPage as any).safeClick).toHaveBeenCalledWith('button:has-text("Accept")');
    });

    test('should not throw error when no cookie consent banner is found', async () => {
      // Mock no cookie banner found
      (testPage as any).waitForAnySelector = jest.fn().mockRejectedValue(new Error('No selectors found'));

      // Should not throw
      await expect(testPage.handleCookieConsent()).resolves.toBeUndefined();
    });

    test('should include enhanced cookie selectors', async () => {
      // Mock successful cookie banner detection with a specific enhanced selector
      (testPage as any).waitForAnySelector = jest.fn().mockResolvedValue('.cmp-accept-all');
      (testPage as any).safeClick = jest.fn().mockResolvedValue(undefined);

      await testPage.handleCookieConsent();

      expect((testPage as any).waitForAnySelector).toHaveBeenCalledWith(
        expect.arrayContaining([
          '.cmp-accept-all',
          '[data-cmp-ab="accept-all"]',
          'button:has-text("Alle akzeptieren")',
          '#onetrust-accept-btn-handler',
          '.uc-deny-all-button ~ .uc-accept-all-button',
          'button:has-text("Zustimmen")',
          '.gdpr-accept-button',
          'button[id*="accept"]',
          'button[class*="accept"]',
        ]),
        5000
      );
    });

    test('should handle German language cookie banners', async () => {
      // Test German-specific selectors
      (testPage as any).waitForAnySelector = jest.fn().mockResolvedValue('button:has-text("Zustimmen")');
      (testPage as any).safeClick = jest.fn().mockResolvedValue(undefined);

      await testPage.handleCookieConsent();

      expect((testPage as any).waitForAnySelector).toHaveBeenCalledWith(
        expect.arrayContaining([
          'button:has-text("Akzeptieren")',
          'button:has-text("Alle akzeptieren")',
          'button:has-text("Zustimmen")',
        ]),
        5000
      );
      expect((testPage as any).safeClick).toHaveBeenCalledWith('button:has-text("Zustimmen")');
    });

    test('should use 5 second timeout for cookie detection', async () => {
      (testPage as any).waitForAnySelector = jest.fn().mockResolvedValue('button:has-text("Accept")');
      (testPage as any).safeClick = jest.fn().mockResolvedValue(undefined);

      await testPage.handleCookieConsent();

      expect((testPage as any).waitForAnySelector).toHaveBeenCalledWith(
        expect.any(Array),
        5000 // Verify 5 second timeout
      );
    });
  });
});