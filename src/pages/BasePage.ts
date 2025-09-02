import type { Page, Locator } from '@playwright/test';
import { logger } from '../utils/logger';
import { getGlobalRetryManager, RetryManager } from '../core/retry';
import { SelectorFallbackManager, type SelectorConfig } from '../utils/SelectorFallbackManager';
import { getGlobalSelectorCache, type SelectorCache } from '../utils/SelectorCache';
import { CONTEXT_POOL_CONSTANTS } from '../utils/BrowserContextPool';

/**
 * Base page class with common Playwright functionality
 * Enhanced for browser context pooling with reuse detection
 */
export abstract class BasePage {
  protected page: Page;
  protected baseUrl: string;
  protected retryManager: RetryManager;
  protected selectorCache: SelectorCache | undefined;
  protected fallbackManager: SelectorFallbackManager;
  private contextCreationTime: number;
  private sessionStartTime: number;
  private contextId: string | undefined;

  constructor(page: Page, baseUrl: string = 'https://www.eversports.de') {
    this.page = page;
    this.baseUrl = baseUrl;
    
    // Track session timing for context reuse optimization
    this.sessionStartTime = Date.now();
    const contextDetection = this.detectContextInfo();
    this.contextCreationTime = contextDetection.creationTime;
    this.contextId = contextDetection.contextId;
    
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

    // Log context reuse information
    this.logContextReuseInfo();
  }

  /**
   * Navigate to a specific URL with retry logic and cache invalidation
   * Enhanced for context reuse optimization
   */
  async navigateTo(path: string = ''): Promise<void> {
    const fullUrl = path.startsWith('http') ? path : `${this.baseUrl}${path}`;
    const previousUrl = this.page.url();
    const isContextReused = this.isContextReused();
    
    await this.retryManager.executeWithBackoff(async () => {
      logger.info('Navigating to URL', 'BasePage', { 
        url: fullUrl, 
        previousUrl, 
        isContextReused,
        contextAge: Date.now() - this.contextCreationTime 
      });
      
      // For reused contexts, check if we need to clear any state
      if (isContextReused && this.shouldClearContextState(previousUrl, fullUrl)) {
        await this.clearContextState();
      }
      
      await this.page.goto(fullUrl);
      await this.waitForPageLoad();
      
      // Invalidate cache if URL changed significantly
      if (this.selectorCache && this.hasSignificantUrlChange(previousUrl, fullUrl)) {
        const pageUrlHash = this.generatePageUrlHash(previousUrl);
        this.selectorCache.invalidateForPage(pageUrlHash);
        logger.debug('Cache invalidated for page navigation', 'BasePage.navigateTo', {
          previousUrl,
          newUrl: fullUrl,
          pageUrlHash,
          isContextReused
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
      'button:has-text("Alle akzeptieren")',
      'button:has-text("Accept All")',
      '#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll',
      '.cmp-accept-all',
      '[data-cmp-ab="accept-all"]',
      '.cookie-banner button:first-child',
      '.consent-overlay button[type="button"]',
      '#onetrust-accept-btn-handler',
      '.uc-deny-all-button ~ .uc-accept-all-button',
      '[data-testid="cookie-accept-all"]',
      '.cookie-notice-accept-button',
      '.privacy-notice-accept',
      'button:has-text("Zustimmen")',
      '.gdpr-accept-button',
      'button[id*="accept"]',
      'button[class*="accept"]',
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

  /**
   * Detect context information including age and ID
   */
  private detectContextInfo(): { creationTime: number; contextId: string | undefined } {
    try {
      // Check if page has context method (might be mocked in tests)
      if (typeof this.page.context !== 'function') {
        return { creationTime: Date.now(), contextId: undefined };
      }
      
      const context = this.page.context();
      if (!context || typeof context.pages !== 'function') {
        return { creationTime: Date.now(), contextId: undefined };
      }
      
      const allPages = context.pages();
      
      // Try to extract context ID from any existing metadata
      let contextId: string | undefined;
      try {
        // Check if context has any custom properties we can use
        contextId = (context as any)._contextId || (context as any).contextId;
      } catch {
        // Ignore if not available
      }
      
      // More sophisticated context age detection
      if (allPages.length > 1) {
        // Multiple pages suggest reuse - check if any have navigation history
        let hasNavigationHistory = false;
        let oldestPageTime = Date.now();
        
        for (const page of allPages) {
          try {
            // Check if page has been navigated (not just about:blank)
            const url = page.url();
            if (url && url !== 'about:blank' && !url.startsWith('data:')) {
              hasNavigationHistory = true;
              // Try to estimate when this page might have been created
              // This is still an estimate, but more sophisticated
              const estimatedAge = Math.min(oldestPageTime, Date.now() - CONTEXT_POOL_CONSTANTS.ESTIMATED_REUSED_CONTEXT_AGE);
              oldestPageTime = estimatedAge;
            }
          } catch {
            // Ignore individual page errors
          }
        }
        
        if (hasNavigationHistory) {
          return { creationTime: oldestPageTime, contextId };
        }
      }
      
      // Fresh context or no clear history
      return { creationTime: Date.now(), contextId };
    } catch {
      // Fallback to current time if detection fails
      return { creationTime: Date.now(), contextId: undefined };
    }
  }

  /**
   * Check if this context is being reused from a pool
   */
  private isContextReused(): boolean {
    const contextAge = Date.now() - this.contextCreationTime;
    
    // Check if page has context method (might be mocked in tests)
    if (typeof this.page.context !== 'function') {
      return contextAge > CONTEXT_POOL_CONSTANTS.CONTEXT_REUSE_DETECTION_THRESHOLD;
    }
    
    const context = this.page.context();
    if (!context || typeof context.pages !== 'function') {
      return contextAge > CONTEXT_POOL_CONSTANTS.CONTEXT_REUSE_DETECTION_THRESHOLD;
    }
    
    const allPages = context.pages();
    
    // Multiple indicators of context reuse:
    // 1. Age threshold
    const ageIndicatesReuse = contextAge > CONTEXT_POOL_CONSTANTS.CONTEXT_REUSE_DETECTION_THRESHOLD;
    
    // 2. Multiple existing pages
    const multiplePages = allPages.length > 1;
    
    // 3. Existing navigation history in other pages
    let hasExistingNavigation = false;
    for (const page of allPages) {
      if (page !== this.page) {
        try {
          const url = page.url();
          if (url && url !== 'about:blank' && !url.startsWith('data:')) {
            hasExistingNavigation = true;
            break;
          }
        } catch {
          // Ignore errors checking individual pages
        }
      }
    }
    
    return ageIndicatesReuse || (multiplePages && hasExistingNavigation);
  }

  /**
   * Log context reuse information for monitoring
   */
  private logContextReuseInfo(): void {
    const isReused = this.isContextReused();
    const contextAge = Date.now() - this.contextCreationTime;
    
    let pageCount = 1; // Default to 1 if we can't detect
    try {
      if (typeof this.page.context === 'function') {
        const context = this.page.context();
        if (context && typeof context.pages === 'function') {
          pageCount = context.pages().length;
        }
      }
    } catch {
      // Ignore errors in context detection for logging
    }
    
    logger.debug('BasePage initialized with context info', 'BasePage', {
      isContextReused: isReused,
      contextAge,
      contextId: this.contextId,
      pageCount,
      sessionStartTime: this.sessionStartTime,
    });
  }

  /**
   * Determine if context state should be cleared for navigation
   */
  private shouldClearContextState(previousUrl: string, newUrl: string): boolean {
    // Clear state if switching to a completely different domain
    const previousDomain = this.extractDomain(previousUrl);
    const newDomain = this.extractDomain(newUrl);
    
    if (previousDomain !== newDomain) {
      return true;
    }
    
    // Clear state if moving from authenticated to non-authenticated areas
    const wasAuthenticated = previousUrl.includes('/login') || previousUrl.includes('/booking');
    const isAuthenticated = newUrl.includes('/login') || newUrl.includes('/booking');
    
    if (wasAuthenticated && !isAuthenticated) {
      return true;
    }
    
    return false;
  }

  /**
   * Clear browser context state (cookies, localStorage, etc.)
   */
  private async clearContextState(): Promise<void> {
    try {
      // Clear browser storage
      await this.page.evaluate(() => {
        try {
          (globalThis as any).localStorage?.clear();
          (globalThis as any).sessionStorage?.clear();
        } catch {
          // Ignore storage clearing errors
        }
      });
      
      // Clear cookies for the domain
      const context = this.page.context();
      await context.clearCookies();
      
      logger.debug('Context state cleared for reused context', 'BasePage');
    } catch (error) {
      logger.warn('Failed to clear context state', 'BasePage', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Extract domain from URL
   */
  private extractDomain(url: string): string {
    try {
      return new URL(url).hostname;
    } catch {
      return '';
    }
  }

  /**
   * Get context reuse metrics for monitoring
   */
  protected getContextReuseMetrics(): {
    isReused: boolean;
    contextAge: number;
    sessionDuration: number;
  } {
    return {
      isReused: this.isContextReused(),
      contextAge: Date.now() - this.contextCreationTime,
      sessionDuration: Date.now() - this.sessionStartTime,
    };
  }
}
