import type { Page, Locator } from '@playwright/test';
import { logger } from '../utils/logger';
import { getGlobalRetryManager, RetryManager } from '../core/retry';
import { SelectorFallbackManager, type SelectorConfig } from '../utils/SelectorFallbackManager';
import { getGlobalSelectorCache, type SelectorCache } from '../utils/SelectorCache';

/**
 * Base page class with common Playwright functionality
 */
export abstract class BasePage {
  protected page: Page;
  protected baseUrl: string;
  protected retryManager: RetryManager;
  protected selectorCache: SelectorCache | undefined;
  protected fallbackManager: SelectorFallbackManager;

  constructor(page: Page, baseUrl: string = 'https://www.eversports.de') {
    this.page = page;
    this.baseUrl = baseUrl;
    
    // Use global retry manager instance
    this.retryManager = getGlobalRetryManager();

    // Initialize cache if available
    try {
      this.selectorCache = getGlobalSelectorCache();
    } catch {
      // Cache not initialized, that's okay - will work without caching
      this.selectorCache = undefined;
    }

    // Initialize fallback manager with optional cache
    this.fallbackManager = new SelectorFallbackManager(page, this.selectorCache);
  }

  /**
   * Navigate to a specific URL with retry logic and cache invalidation
   */
  async navigateTo(path: string = ''): Promise<void> {
    const fullUrl = path.startsWith('http') ? path : `${this.baseUrl}${path}`;
    const previousUrl = this.page.url();
    
    await this.retryManager.executeWithBackoff(async () => {
      logger.info('Navigating to URL', 'BasePage', { url: fullUrl, previousUrl });
      await this.page.goto(fullUrl);
      await this.waitForPageLoad();
      
      // Invalidate cache if URL changed significantly
      if (this.selectorCache && this.hasSignificantUrlChange(previousUrl, fullUrl)) {
        const pageUrlHash = this.generatePageUrlHash(previousUrl);
        this.selectorCache.invalidateForPage(pageUrlHash);
        logger.debug('Cache invalidated for page navigation', 'BasePage.navigateTo', {
          previousUrl,
          newUrl: fullUrl,
          pageUrlHash
        });
      }
    }, 'navigate-to-url');
  }

  /**
   * Generate page URL hash for cache operations
   */
  private generatePageUrlHash(url: string): string {
    if (!url) {
      return 'unknown-page';
    }
    const baseUrl = url.split('?')[0]?.split('#')[0] || 'unknown-url';
    return require('crypto').createHash('sha256').update(baseUrl).digest('hex').substring(0, 16);
  }

  /**
   * Check if URL change is significant enough to invalidate cache
   */
  private hasSignificantUrlChange(oldUrl: string, newUrl: string): boolean {
    const oldBase = oldUrl.split('?')[0]?.split('#')[0] || '';
    const newBase = newUrl.split('?')[0]?.split('#')[0] || '';
    
    // Different base URL means we should invalidate
    if (oldBase !== newBase) {
      return true;
    }
    
    // Same base URL but with significant parameter changes
    const oldParams = new URLSearchParams(oldUrl.split('?')[1] || '');
    const newParams = new URLSearchParams(newUrl.split('?')[1] || '');
    
    // If specific parameters that affect page structure change
    const significantParams = ['sport', 'venue', 'date', 'court'];
    return significantParams.some(param => oldParams.get(param) !== newParams.get(param));
  }

  /**
   * Wait for page to fully load
   */
  async waitForPageLoad(): Promise<void> {
    await this.page.waitForLoadState('networkidle');
    logger.debug('Page load completed', 'BasePage');
  }

  /**
   * Cache-aware element waiting with fallback
   */
  async waitForElementCached(
    selectors: string[], 
    category: string, 
    timeout: number = 10000,
    specificId?: string
  ): Promise<Locator> {
    const config: SelectorConfig = {
      tiers: [{ name: 'provided', selectors, priority: 1, description: 'Provided selectors' }],
      timeout,
      maxAttempts: 1
    };
    
    const result = await this.fallbackManager.findWithCachedFallback(config, category, specificId);
    
    if (!result.success || !result.element) {
      throw new Error(`None of the selectors found: ${selectors.join(', ')}`);
    }
    
    logger.debug('Element found with cache-aware approach', 'BasePage.waitForElementCached', {
      category,
      selector: result.selector,
      tier: result.tier,
      fromCache: result.fromCache,
      specificId
    });
    
    return result.element;
  }

  /**
   * Wait for element to be visible (backward compatibility)
   */
  async waitForElement(selector: string, timeout: number = 10000): Promise<Locator> {
    logger.debug('Waiting for element', 'BasePage', { selector, timeout });
    const locator = this.page.locator(selector);
    await locator.waitFor({ state: 'visible', timeout });
    return locator;
  }

  /**
   * Enhanced safe click with caching
   */
  async safeClickCached(
    selectors: string[], 
    category: string, 
    specificId?: string
  ): Promise<void> {
    await this.retryManager.executeWithBackoff(async () => {
      const element = await this.waitForElementCached(selectors, category, 10000, specificId);
      await element.click();
      logger.debug('Clicked element successfully with cache', 'BasePage.safeClickCached', { 
        category, 
        specificId,
        selectors: selectors.length 
      });
    }, 'safe-click-cached');
  }

  /**
   * Safe click with robust retry logic (backward compatibility)
   */
  async safeClick(selector: string): Promise<void> {
    await this.retryManager.executeWithBackoff(async () => {
      await this.waitForElement(selector);
      await this.page.click(selector);
      logger.debug('Clicked element successfully', 'BasePage.safeClick', { selector });
    }, 'safe-click');
  }

  /**
   * Enhanced safe fill with caching
   */
  async safeFillCached(
    selectors: string[], 
    category: string, 
    value: string, 
    validateFill: boolean = true,
    specificId?: string
  ): Promise<void> {
    await this.retryManager.executeWithBackoff(async () => {
      const element = await this.waitForElementCached(selectors, category, 10000, specificId);
      await element.fill(value);

      if (validateFill) {
        const actualValue = await element.inputValue();
        if (actualValue !== value) {
          throw new Error(`Fill validation failed. Expected: ${value}, Actual: ${actualValue}`);
        }
      }

      logger.debug('Filled element successfully with cache', 'BasePage.safeFillCached', { 
        category, 
        value,
        specificId,
        selectors: selectors.length 
      });
    }, 'safe-fill-cached');
  }

  /**
   * Safe fill with validation and retry logic (backward compatibility)
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
