import type { Page, Locator } from '@playwright/test';
import { logger } from '../utils/logger';
import { getGlobalRetryManager, RetryManager } from '../core/retry';

/**
 * Base page class with common Playwright functionality
 */
export abstract class BasePage {
  protected page: Page;
  protected baseUrl: string;
  protected retryManager: RetryManager;

  constructor(page: Page, baseUrl: string = 'https://www.eversports.de') {
    this.page = page;
    this.baseUrl = baseUrl;
    
    // Use global retry manager instance
    this.retryManager = getGlobalRetryManager();
  }

  /**
   * Navigate to a specific URL with retry logic
   */
  async navigateTo(path: string = ''): Promise<void> {
    const fullUrl = path.startsWith('http') ? path : `${this.baseUrl}${path}`;
    
    await this.retryManager.executeWithBackoff(async () => {
      logger.info('Navigating to URL', 'BasePage', { url: fullUrl });
      await this.page.goto(fullUrl);
      await this.waitForPageLoad();
    }, 'navigate-to-url');
  }

  /**
   * Wait for page to fully load
   */
  async waitForPageLoad(): Promise<void> {
    await this.page.waitForLoadState('networkidle');
    logger.debug('Page load completed', 'BasePage');
  }

  /**
   * Wait for element to be visible
   */
  async waitForElement(selector: string, timeout: number = 10000): Promise<Locator> {
    logger.debug('Waiting for element', 'BasePage', { selector, timeout });
    const locator = this.page.locator(selector);
    await locator.waitFor({ state: 'visible', timeout });
    return locator;
  }

  /**
   * Safe click with robust retry logic
   */
  async safeClick(selector: string): Promise<void> {
    await this.retryManager.executeWithBackoff(async () => {
      await this.waitForElement(selector);
      await this.page.click(selector);
      logger.debug('Clicked element successfully', 'BasePage.safeClick', { selector });
    }, 'safe-click');
  }

  /**
   * Safe fill with validation and retry logic
   */
  async safeFill(selector: string, value: string, validateFill: boolean = true): Promise<void> {
    await this.retryManager.executeWithBackoff(async () => {
      await this.waitForElement(selector);
      await this.page.fill(selector, value);

      if (validateFill) {
        const actualValue = await this.page.inputValue(selector);
        if (actualValue !== value) {
          throw new Error(`Fill validation failed. Expected: ${value}, Actual: ${actualValue}`);
        }
      }

      logger.debug('Filled element successfully', 'BasePage.safeFill', { selector, value });
    }, 'safe-fill');
  }

  /**
   * Get text content of element
   */
  async getText(selector: string): Promise<string> {
    await this.waitForElement(selector);
    const text = await this.page.textContent(selector);
    logger.debug('Retrieved text content', 'BasePage', { selector, text });
    return text || '';
  }

  /**
   * Check if element exists
   */
  async elementExists(selector: string, timeout: number = 5000): Promise<boolean> {
    try {
      await this.page.locator(selector).waitFor({ state: 'attached', timeout });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if element is visible
   */
  async isElementVisible(selector: string, timeout: number = 5000): Promise<boolean> {
    try {
      await this.page.locator(selector).waitFor({ state: 'visible', timeout });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Wait for any of multiple selectors to appear
   */
  async waitForAnySelector(selectors: string[], timeout: number = 10000): Promise<string> {
    const component = 'BasePage.waitForAnySelector';

    logger.debug('Waiting for any selector', component, { selectors, timeout });

    const promises = selectors.map(selector =>
      this.page
        .locator(selector)
        .waitFor({ state: 'visible', timeout })
        .then(() => selector)
    );

    try {
      const foundSelector = await Promise.race(promises);
      logger.debug('Found selector', component, { foundSelector });
      return foundSelector;
    } catch (error) {
      logger.error('No selectors found', component, {
        selectors,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new Error(`None of the selectors found within ${timeout}ms: ${selectors.join(', ')}`);
    }
  }

  /**
   * Take screenshot for debugging
   */
  async takeScreenshot(name: string = 'debug'): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `screenshots/${name}-${timestamp}.png`;

    await this.page.screenshot({ path: filename, fullPage: true });
    logger.info('Screenshot taken', 'BasePage', { filename });

    return filename;
  }

  /**
   * Scroll element into view
   */
  async scrollIntoView(selector: string): Promise<void> {
    await this.waitForElement(selector);
    await this.page.locator(selector).scrollIntoViewIfNeeded();
    logger.debug('Scrolled element into view', 'BasePage', { selector });
  }

  /**
   * Wait for page navigation
   */
  async waitForNavigation(timeout: number = 30000): Promise<void> {
    await this.page.waitForLoadState('networkidle', { timeout });
    logger.debug('Navigation completed', 'BasePage');
  }

  /**
   * Handle cookie consent popups
   */
  async handleCookieConsent(): Promise<void> {
    const component = 'BasePage.handleCookieConsent';

    const cookieSelectors = [
      'button[data-testid="accept-cookies"]',
      '.cookie-accept',
      '.consent-accept',
      'button:has-text("Accept")',
      'button:has-text("Akzeptieren")',
      '#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll',
    ];

    try {
      const foundSelector = await this.waitForAnySelector(cookieSelectors, 5000);
      await this.safeClick(foundSelector);
      logger.info('Cookie consent handled', component, { selector: foundSelector });
    } catch {
      logger.debug('No cookie consent popup found', component);
    }
  }

  /**
   * Get current page URL
   */
  getCurrentUrl(): string {
    return this.page.url();
  }

  /**
   * Get page title
   */
  async getPageTitle(): Promise<string> {
    return await this.page.title();
  }

  /**
   * Reload the current page
   */
  async reload(): Promise<void> {
    await this.page.reload();
    await this.waitForPageLoad();
    logger.debug('Page reloaded', 'BasePage');
  }
}
