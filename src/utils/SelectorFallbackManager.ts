/**
 * Multi-tier Selector Fallback Manager
 * Implementiert robuste Fallback-Strategien für Website-Selektoren
 */

import { Page, Locator } from '@playwright/test';
import { logger } from './logger';
import type { SelectorCache } from './SelectorCache';

export interface SelectorTier {
  name: string;
  selectors: string[];
  priority: number;
  description: string;
}

export interface FallbackResult {
  success: boolean;
  tier: string;
  selector: string;
  element?: Locator;
  elementsFound: number;
  timeToFind: number;
}

export interface SelectorConfig {
  tiers: SelectorTier[];
  timeout: number;
  maxAttempts: number;
}

/**
 * Multi-tier selector fallback system based on live testing results
 */
export class SelectorFallbackManager {
  private page: Page;
  private cache: SelectorCache | undefined;

  constructor(page: Page, cache?: SelectorCache | undefined) {
    this.page = page;
    this.cache = cache;
  }

  /**
   * Pre-configured selector sets based on live testing
   */
  static getCalendarSelectors(): SelectorConfig {
    return {
      tiers: [
        {
          name: 'live_verified',
          selectors: ['#booking-calendar-container'], // ✅ LIVE VERIFIED - Found 1
          priority: 1,
          description: 'Live-tested working selectors'
        },
        {
          name: 'xpath_patterns',
          selectors: ['xpath=//div[@id="booking-calendar-container"]'], // ✅ LIVE VERIFIED
          priority: 2,
          description: 'ui.vision XPath patterns'
        },
        {
          name: 'generic_fallback',
          selectors: ['.calendar', '[data-testid="calendar"]', '.booking-calendar'],
          priority: 3,
          description: 'Generic calendar selectors'
        }
      ],
      timeout: 10000,
      maxAttempts: 3
    };
  }

  static getCourtSelectors(): SelectorConfig {
    return {
      tiers: [
        {
          name: 'live_verified',
          selectors: ['td[data-court]'], // ✅ LIVE VERIFIED - Found 1477
          priority: 1,
          description: 'Live-tested court selectors'
        },
        {
          name: 'xpath_patterns',
          selectors: ['xpath=//div[@id="booking-calendar-container"]//td[@data-court]'], // ✅ LIVE VERIFIED
          priority: 2,
          description: 'ui.vision XPath court patterns'
        },
        {
          name: 'generic_fallback',
          selectors: ['[data-testid*="court"]', '.court-selector', '.court-list'],
          priority: 3,
          description: 'Generic court selectors'
        }
      ],
      timeout: 5000,
      maxAttempts: 2
    };
  }

  static getTimeSlotSelectors(): SelectorConfig {
    return {
      tiers: [
        {
          name: 'live_verified',
          selectors: [
            'td[data-date][data-start][data-state][data-court]', // ✅ LIVE VERIFIED - Found 1428
            'td[data-date]', // ✅ LIVE VERIFIED - Found 1428
            'td[data-start]' // ✅ LIVE VERIFIED - Found 1428
          ],
          priority: 1,
          description: 'Live-tested time slot selectors'
        },
        {
          name: 'xpath_patterns',
          selectors: [
            'xpath=//div[@id="booking-calendar-container"]//td[@data-date]', // ✅ LIVE VERIFIED
            'xpath=//div[@id="booking-calendar-container"]//td[@data-start]' // ✅ LIVE VERIFIED
          ],
          priority: 2,
          description: 'ui.vision XPath time slot patterns'
        },
        {
          name: 'generic_fallback',
          selectors: ['[data-time]', '.time-slot', '.booking-slot'],
          priority: 3,
          description: 'Generic time slot selectors'
        }
      ],
      timeout: 5000,
      maxAttempts: 2
    };
  }

  static getFreeSlotSelectors(): SelectorConfig {
    return {
      tiers: [
        {
          name: 'live_verified',
          selectors: ['td[data-state="free"]'], // ✅ LIVE VERIFIED - Found 787
          priority: 1,
          description: 'Live-tested free slot selectors'
        },
        {
          name: 'xpath_patterns',
          selectors: ['xpath=//div[@id="booking-calendar-container"]//td[@data-state="free"]'], // ✅ LIVE VERIFIED
          priority: 2,
          description: 'ui.vision XPath free slot patterns'
        },
        {
          name: 'generic_fallback',
          selectors: ['.available', '.slot-available', '[data-available="true"]'],
          priority: 3,
          description: 'Generic availability selectors'
        }
      ],
      timeout: 5000,
      maxAttempts: 2
    };
  }

  /**
   * Dynamic slot selector for specific date, time, and court
   */
  static getSpecificSlotSelectors(date: string, time: string, court?: string): SelectorConfig {
    const timeFormatted = time.replace(':', ''); // "14:00" -> "1400"
    
    const baseSelectors = [
      `td[data-date='${date}'][data-start='${timeFormatted}'][data-state='free']`,
      `td[data-date='${date}'][data-start='${timeFormatted}']`,
      `xpath=//div[@id='booking-calendar-container']//td[@data-date='${date}' and @data-start='${timeFormatted}']`
    ];

    const courtSpecificSelectors = court ? [
      `td[data-date='${date}'][data-start='${timeFormatted}'][data-court='${court}'][data-state='free']`,
      `td[data-date='${date}'][data-start='${timeFormatted}'][data-court='${court}']`,
      `xpath=//div[@id='booking-calendar-container']//td[@data-date='${date}' and @data-start='${timeFormatted}' and @data-court='${court}']`
    ] : [];

    return {
      tiers: [
        {
          name: 'court_specific',
          selectors: courtSpecificSelectors,
          priority: 1,
          description: `Specific slot for court ${court}, date ${date}, time ${time}`
        },
        {
          name: 'time_specific',
          selectors: baseSelectors,
          priority: 2,
          description: `Specific slot for date ${date}, time ${time}`
        },
        {
          name: 'generic_time',
          selectors: [
            `[data-time="${time}"]`,
            `[data-start="${timeFormatted}"]`,
            `.slot-${timeFormatted}`
          ],
          priority: 3,
          description: 'Generic time-based selectors'
        }
      ],
      timeout: 5000,
      maxAttempts: 3
    };
  }

  /**
   * Cache-integrated selector fallback strategy
   */
  async findWithCachedFallback(
    config: SelectorConfig, 
    category: string,
    specificId?: string
  ): Promise<FallbackResult & { fromCache: boolean }> {
    if (!this.cache) {
      const result = await this.findWithFallback(config);
      return { ...result, fromCache: false };
    }
    
    return await this.cache.findWithCache(this.page, this, config, category, specificId);
  }

  /**
   * Execute multi-tier selector fallback strategy
   */
  async findWithFallback(config: SelectorConfig): Promise<FallbackResult> {
    const component = 'SelectorFallbackManager.findWithFallback';
    const startTime = Date.now();

    logger.info('Starting multi-tier selector fallback', component, {
      tiers: config.tiers.length,
      timeout: config.timeout,
      maxAttempts: config.maxAttempts
    });

    // Sort tiers by priority
    const sortedTiers = config.tiers.sort((a, b) => a.priority - b.priority);

    for (const tier of sortedTiers) {
      if (tier.selectors.length === 0) {
        logger.debug('Skipping empty tier', component, { tier: tier.name });
        continue;
      }

      logger.debug('Trying tier', component, { tier: tier.name, selectors: tier.selectors.length });

      for (const selector of tier.selectors) {
        try {
          const tierStartTime = Date.now();
          
          // Try to find elements with this selector
          const elements = await this.page.locator(selector).all();
          const timeToFind = Date.now() - tierStartTime;
          
          if (elements.length > 0) {
            const result: FallbackResult = {
              success: true,
              tier: tier.name,
              selector,
              element: this.page.locator(selector).first(),
              elementsFound: elements.length,
              timeToFind
            };

            logger.info('Selector fallback succeeded', component, {
              tier: tier.name,
              selector,
              elementsFound: elements.length,
              timeToFind,
              totalTime: Date.now() - startTime
            });

            return result;
          } else {
            logger.debug('Selector found no elements', component, {
              tier: tier.name,
              selector,
              timeToFind
            });
          }
        } catch (error) {
          logger.debug('Selector failed with error', component, {
            tier: tier.name,
            selector,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }
    }

    // All tiers failed
    const result: FallbackResult = {
      success: false,
      tier: 'none',
      selector: '',
      elementsFound: 0,
      timeToFind: Date.now() - startTime
    };

    logger.warn('All selector tiers failed', component, {
      tiersAttempted: sortedTiers.length,
      totalTime: result.timeToFind,
      config
    });

    return result;
  }

  /**
   * Find multiple elements with cache-aware fallback strategy
   */
  async findAllWithCachedFallback(
    config: SelectorConfig,
    category: string,
    specificId?: string
  ): Promise<FallbackResult & { elements: Locator[]; fromCache: boolean }> {
    const result = await this.findWithCachedFallback(config, category, specificId);
    
    if (result.success && result.selector) {
      const elements = await this.page.locator(result.selector).all();
      return { ...result, elements };
    }
    
    return { ...result, elements: [] };
  }

  /**
   * Find multiple elements with fallback strategy
   */
  async findAllWithFallback(config: SelectorConfig): Promise<FallbackResult & { elements: Locator[] }> {
    const result = await this.findWithFallback(config);
    
    if (result.success && result.selector) {
      const elements = await this.page.locator(result.selector).all();
      return { ...result, elements };
    }
    
    return { ...result, elements: [] };
  }

  /**
   * Wait for element using cache-aware fallback strategy
   */
  async waitForWithCachedFallback(
    config: SelectorConfig,
    category: string,
    specificId?: string
  ): Promise<FallbackResult & { fromCache: boolean }> {
    // For waiting, we first check if we have a cached selector
    if (this.cache) {
      const result = await this.cache.findWithCache(this.page, this, config, category, specificId);
      if (result.success && result.element) {
        try {
          await result.element.waitFor({ 
            state: 'visible', 
            timeout: Math.min(config.timeout, 5000) 
          });
          return result;
        } catch {
          // If cached selector fails to wait, fall through to regular wait logic
        }
      }
    }

    const result = await this.waitForWithFallback(config);
    return { ...result, fromCache: false };
  }

  /**
   * Wait for element using fallback strategy
   */
  async waitForWithFallback(config: SelectorConfig): Promise<FallbackResult> {
    const component = 'SelectorFallbackManager.waitForWithFallback';
    const startTime = Date.now();

    logger.info('Waiting for element with fallback', component, {
      timeout: config.timeout
    });

    // Sort tiers by priority
    const sortedTiers = config.tiers.sort((a, b) => a.priority - b.priority);

    for (const tier of sortedTiers) {
      for (const selector of tier.selectors) {
        try {
          const tierStartTime = Date.now();
          
          // Wait for element to be visible
          await this.page.locator(selector).first().waitFor({ 
            state: 'visible', 
            timeout: Math.min(config.timeout, 5000) // Don't wait too long per selector
          });
          
          const timeToFind = Date.now() - tierStartTime;
          const elements = await this.page.locator(selector).all();

          const result: FallbackResult = {
            success: true,
            tier: tier.name,
            selector,
            element: this.page.locator(selector).first(),
            elementsFound: elements.length,
            timeToFind
          };

          logger.info('Wait with fallback succeeded', component, {
            tier: tier.name,
            selector,
            timeToFind,
            totalTime: Date.now() - startTime
          });

          return result;
        } catch (error) {
          logger.debug('Wait selector failed', component, {
            tier: tier.name,
            selector,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }
    }

    // All failed
    return {
      success: false,
      tier: 'none',
      selector: '',
      elementsFound: 0,
      timeToFind: Date.now() - startTime
    };
  }

  /**
   * Test all selector tiers and return performance report
   */
  async testAllTiers(config: SelectorConfig): Promise<{
    results: Array<FallbackResult & { tier: string }>;
    summary: {
      workingTiers: number;
      fastestTier: string;
      slowestTier: string;
      recommendedTier: string;
    };
  }> {
    const component = 'SelectorFallbackManager.testAllTiers';
    const results: Array<FallbackResult & { tier: string }> = [];

    logger.info('Testing all selector tiers', component, {
      tiers: config.tiers.length
    });

    for (const tier of config.tiers) {
      for (const selector of tier.selectors) {
        try {
          const startTime = Date.now();
          const elements = await this.page.locator(selector).all();
          const timeToFind = Date.now() - startTime;

          results.push({
            success: elements.length > 0,
            tier: tier.name,
            selector,
            elementsFound: elements.length,
            timeToFind
          });
        } catch (error) {
          results.push({
            success: false,
            tier: tier.name,
            selector,
            elementsFound: 0,
            timeToFind: -1
          });
        }
      }
    }

    const workingResults = results.filter(r => r.success);
    const workingTiers = new Set(workingResults.map(r => r.tier)).size;
    
    const fastestResult = workingResults.reduce((prev, curr) => 
      prev.timeToFind < curr.timeToFind ? prev : curr
    );
    
    const slowestResult = workingResults.reduce((prev, curr) => 
      prev.timeToFind > curr.timeToFind ? prev : curr
    );

    // Recommend tier with best balance of reliability and speed
    const tierPerformance = new Map<string, { count: number, avgTime: number, success: number }>();
    
    results.forEach(result => {
      const existing = tierPerformance.get(result.tier) || { count: 0, avgTime: 0, success: 0 };
      existing.count++;
      existing.avgTime = (existing.avgTime * (existing.count - 1) + result.timeToFind) / existing.count;
      if (result.success) existing.success++;
      tierPerformance.set(result.tier, existing);
    });

    let recommendedTier = 'none';
    let bestScore = -1;
    
    for (const [tier, perf] of tierPerformance) {
      const successRate = perf.success / perf.count;
      const speed = perf.avgTime > 0 ? 1000 / perf.avgTime : 0; // Operations per second
      const score = successRate * 0.7 + speed * 0.3; // Weighted score
      
      if (score > bestScore) {
        bestScore = score;
        recommendedTier = tier;
      }
    }

    const summary = {
      workingTiers,
      fastestTier: fastestResult?.tier || 'none',
      slowestTier: slowestResult?.tier || 'none',
      recommendedTier
    };

    logger.info('Selector tier testing completed', component, { summary, resultsCount: results.length });

    return { results, summary };
  }
}