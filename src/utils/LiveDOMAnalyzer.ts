/**
 * Live DOM Analyzer für eversports.de Website-Struktur-Analysis
 * Extrahiert echte Website-Strukturen und validiert Selektoren
 */

import { Page, Browser } from '@playwright/test';
import { chromium } from 'playwright';
import { writeFileSync } from 'fs';
import { join } from 'path';
import { logger } from '@/utils/logger';

export interface DOMAnalysisResult {
  timestamp: string;
  url: string;
  pageTitle: string;
  calendarStructure: {
    found: boolean;
    html: string | null;
    selector: string;
  };
  courtElements: {
    found: boolean;
    count: number;
    selectors: string[];
    samples: Array<{
      html: string;
      attributes: Record<string, string>;
    }>;
  };
  timeSlots: {
    found: boolean;
    count: number;
    dateAttributes: string[];
    timeAttributes: string[];
    stateAttributes: string[];
    courtAttributes: string[];
  };
  loginElements: {
    emailField: { found: boolean; selector: string };
    passwordField: { found: boolean; selector: string };
    loginButton: { found: boolean; selector: string };
  };
  navigationElements: {
    nextWeekButton: { found: boolean; selector: string };
    checkoutButton: { found: boolean; selector: string };
  };
  workingXPaths: {
    slotSelection: string[];
    navigation: string[];
    checkout: string[];
  };
}

export class LiveDOMAnalyzer {
  private browser: Browser | null = null;
  private page: Page | null = null;

  /**
   * Führt eine umfassende Live-Analysis der eversports.de Website durch
   */
  async analyzeLiveWebsite(options: {
    url?: string;
    headless?: boolean;
    screenshotDir?: string;
    credentials?: { email: string; password: string };
  } = {}): Promise<DOMAnalysisResult> {
    const {
      url = 'https://www.eversports.de/sb/sportcenter-kautz?sport=squash',
      headless = false,
      screenshotDir = './live-analysis-screenshots',
      credentials = { email: 'contact@lennart.de', password: 'Columbus94!' }
    } = options;

    logger.info('[LiveDOMAnalyzer] Starting live website analysis', { url, headless });

    try {
      // Browser und Page initialisieren
      this.browser = await chromium.launch({ 
        headless,
        slowMo: 1000 // Langsamere Ausführung für bessere Sichtbarkeit
      });
      
      this.page = await this.browser.newPage();
      
      // Navigation zur Website
      await this.page.goto(url);
      await this.page.waitForLoadState('networkidle');
      
      logger.info('[LiveDOMAnalyzer] Page loaded, starting analysis');

      // Initial screenshot
      await this.takeScreenshot('01-initial-page', screenshotDir);

      const result: DOMAnalysisResult = {
        timestamp: new Date().toISOString(),
        url,
        pageTitle: await this.page.title(),
        calendarStructure: await this.analyzeCalendarStructure(),
        courtElements: await this.analyzeCourtElements(),
        timeSlots: await this.analyzeTimeSlots(),
        loginElements: await this.analyzeLoginElements(),
        navigationElements: await this.analyzeNavigationElements(),
        workingXPaths: await this.extractWorkingXPaths()
      };

      // Versuche Login wenn möglich
      try {
        if (credentials.email && credentials.password) {
          await this.attemptLogin(credentials);
          await this.takeScreenshot('02-after-login-attempt', screenshotDir);
        }
      } catch (error) {
        logger.warn('[LiveDOMAnalyzer] Login attempt failed', { error: error.message });
      }

      // Analysiere Post-Login-Struktur
      try {
        await this.analyzePostLoginStructure(result);
        await this.takeScreenshot('03-post-login-analysis', screenshotDir);
      } catch (error) {
        logger.warn('[LiveDOMAnalyzer] Post-login analysis failed', { error: error.message });
      }

      // Speichere Analyse-Ergebnisse
      await this.saveAnalysisResults(result);

      logger.info('[LiveDOMAnalyzer] Analysis completed successfully');
      return result;

    } catch (error) {
      logger.error('[LiveDOMAnalyzer] Analysis failed', { error: error.message });
      throw error;
    } finally {
      await this.cleanup();
    }
  }

  /**
   * Analysiert die Kalender-Container-Struktur
   */
  private async analyzeCalendarStructure() {
    logger.info('[LiveDOMAnalyzer] Analyzing calendar structure');

    const selectors = [
      '#booking-calendar-container',
      '[data-testid="calendar"]',
      '.calendar-container',
      '.booking-calendar',
      '.calendar-view'
    ];

    for (const selector of selectors) {
      try {
        const element = this.page!.locator(selector).first();
        if (await element.isVisible()) {
          return {
            found: true,
            html: await element.innerHTML(),
            selector
          };
        }
      } catch (error) {
        logger.debug(`[LiveDOMAnalyzer] Calendar selector failed: ${selector}`, { error: error.message });
      }
    }

    return { found: false, html: null, selector: '' };
  }

  /**
   * Analysiert Court-Elemente und deren Attribute
   */
  private async analyzeCourtElements() {
    logger.info('[LiveDOMAnalyzer] Analyzing court elements');

    const courtSelectors = [
      '[data-court]',
      '.court',
      '[class*="court"]',
      'td[data-court]',
      '.booking-slot[data-court]'
    ];

    const results = {
      found: false,
      count: 0,
      selectors: [] as string[],
      samples: [] as Array<{ html: string; attributes: Record<string, string> }>
    };

    for (const selector of courtSelectors) {
      try {
        const elements = await this.page!.locator(selector).all();
        if (elements.length > 0) {
          results.found = true;
          results.count += elements.length;
          results.selectors.push(selector);

          // Sammle Samples der ersten 3 Elemente
          for (let i = 0; i < Math.min(3, elements.length); i++) {
            const html = await elements[i].innerHTML();
            const attributes: Record<string, string> = {};
            
            // Extrahiere alle Attribute
            const allAttributes = await elements[i].evaluate(el => {
              const attrs: Record<string, string> = {};
              for (const attr of el.attributes) {
                attrs[attr.name] = attr.value;
              }
              return attrs;
            });

            results.samples.push({ html, attributes: allAttributes });
          }
        }
      } catch (error) {
        logger.debug(`[LiveDOMAnalyzer] Court selector failed: ${selector}`, { error: error.message });
      }
    }

    return results;
  }

  /**
   * Analysiert Time-Slot-Elemente mit data-Attributen
   */
  private async analyzeTimeSlots() {
    logger.info('[LiveDOMAnalyzer] Analyzing time slots');

    const result = {
      found: false,
      count: 0,
      dateAttributes: [] as string[],
      timeAttributes: [] as string[],
      stateAttributes: [] as string[],
      courtAttributes: [] as string[]
    };

    // Suche nach Elementen mit time-slot-relevanten data-Attributen
    const timeSlotSelector = 'td[data-date], td[data-start], td[data-time], [data-slot], .time-slot';
    
    try {
      const elements = await this.page!.locator(timeSlotSelector).all();
      result.count = elements.length;
      result.found = elements.length > 0;

      // Analysiere Attribute-Patterns
      for (const element of elements.slice(0, 10)) { // Erste 10 analysieren
        const attributes = await element.evaluate(el => {
          const attrs: Record<string, string> = {};
          for (const attr of el.attributes) {
            attrs[attr.name] = attr.value;
          }
          return attrs;
        });

        // Sammle verschiedene Attribut-Typen
        Object.keys(attributes).forEach(attrName => {
          if (attrName.includes('date') && !result.dateAttributes.includes(attrName)) {
            result.dateAttributes.push(attrName);
          }
          if ((attrName.includes('time') || attrName.includes('start')) && !result.timeAttributes.includes(attrName)) {
            result.timeAttributes.push(attrName);
          }
          if (attrName.includes('state') && !result.stateAttributes.includes(attrName)) {
            result.stateAttributes.push(attrName);
          }
          if (attrName.includes('court') && !result.courtAttributes.includes(attrName)) {
            result.courtAttributes.push(attrName);
          }
        });
      }
    } catch (error) {
      logger.debug('[LiveDOMAnalyzer] Time slot analysis failed', { error: error.message });
    }

    return result;
  }

  /**
   * Analysiert Login-Elemente
   */
  private async analyzeLoginElements() {
    logger.info('[LiveDOMAnalyzer] Analyzing login elements');

    const findElement = async (selectors: string[]) => {
      for (const selector of selectors) {
        try {
          const element = this.page!.locator(selector).first();
          if (await element.isVisible()) {
            return { found: true, selector };
          }
        } catch (error) {
          // Continue to next selector
        }
      }
      return { found: false, selector: '' };
    };

    return {
      emailField: await findElement(['#email', 'input[type="email"]', 'input[name="email"]', '[data-testid="email"]']),
      passwordField: await findElement(['#password', 'input[type="password"]', 'input[name="password"]', '[data-testid="password"]']),
      loginButton: await findElement(['button[type="submit"]', '.login-button', '[data-testid="login"]', 'button:has-text("Login")', 'button:has-text("Anmelden")'])
    };
  }

  /**
   * Analysiert Navigation-Elemente
   */
  private async analyzeNavigationElements() {
    logger.info('[LiveDOMAnalyzer] Analyzing navigation elements');

    const findElement = async (selectors: string[]) => {
      for (const selector of selectors) {
        try {
          const element = this.page!.locator(selector).first();
          if (await element.isVisible()) {
            return { found: true, selector };
          }
        } catch (error) {
          // Continue to next selector
        }
      }
      return { found: false, selector: '' };
    };

    return {
      nextWeekButton: await findElement([
        'button:has-text("Nächste Woche")', 
        'button:has-text("Next")', 
        '.next-week',
        '[data-testid="next-week"]'
      ]),
      checkoutButton: await findElement([
        'button:has-text("Weiter zum Checkout")',
        'button:has-text("Checkout")',
        '.checkout-button',
        '[data-testid="checkout"]'
      ])
    };
  }

  /**
   * Extrahiert funktionierende XPath-Patterns basierend auf ui.vision JSON
   */
  private async extractWorkingXPaths() {
    logger.info('[LiveDOMAnalyzer] Extracting working XPath patterns');

    // Proven XPath-Patterns aus ui.vision JSON
    const workingXPaths = {
      slotSelection: [
        "//div[@id='booking-calendar-container']//td[@data-date='{{date}}' and @data-start='{{time}}' and @data-state='free' and @data-court='{{court}}']",
        "//td[@data-date and @data-start and @data-state='free' and @data-court]",
        "//div[@id='booking-calendar-container']//td[@data-state='free']"
      ],
      navigation: [
        "//*[@id=\"root\"]/div/div/form/div/div/div/div[3]/button/p", // Login-Button
        "//*[@id=\"root\"]/div/div[3]/aside/div/div/button" // Navigation-Button
      ],
      checkout: [
        "//*[@id=\"root\"]/div/div[3]/main/div[2]/div/div[3]/form/div[3]/div/div/div", // Checkout-Form
        "//*[@id=\"root\"]/div/div[3]/main/div[2]/div/div[3]/form/div[4]/button", // Submit-Button
        "/html/body/div[3]/div[3]" // Dialog-Close
      ]
    };

    // Teste welche XPaths auf der aktuellen Seite funktionieren
    for (const category in workingXPaths) {
      const xpaths = workingXPaths[category as keyof typeof workingXPaths];
      const workingOnes: string[] = [];

      for (const xpath of xpaths) {
        try {
          const elements = await this.page!.locator(`xpath=${xpath}`).all();
          if (elements.length > 0) {
            workingOnes.push(xpath);
            logger.info(`[LiveDOMAnalyzer] Working XPath found in ${category}`, { xpath, count: elements.length });
          }
        } catch (error) {
          logger.debug(`[LiveDOMAnalyzer] XPath failed in ${category}`, { xpath, error: error.message });
        }
      }

      workingXPaths[category as keyof typeof workingXPaths] = workingOnes;
    }

    return workingXPaths;
  }

  /**
   * Versucht Login mit den bereitgestellten Credentials
   */
  private async attemptLogin(credentials: { email: string; password: string }) {
    logger.info('[LiveDOMAnalyzer] Attempting login');

    try {
      // Email eingeben
      const emailField = this.page!.locator('#email').first();
      if (await emailField.isVisible()) {
        await emailField.fill(credentials.email);
        logger.info('[LiveDOMAnalyzer] Email entered successfully');
      }

      // Password eingeben
      const passwordField = this.page!.locator('#password').first();
      if (await passwordField.isVisible()) {
        await passwordField.fill(credentials.password);
        logger.info('[LiveDOMAnalyzer] Password entered successfully');
      }

      // Login-Button klicken
      const loginButton = this.page!.locator('button[type="submit"]').first();
      if (await loginButton.isVisible()) {
        await loginButton.click();
        await this.page!.waitForLoadState('networkidle');
        logger.info('[LiveDOMAnalyzer] Login submitted successfully');
      }
    } catch (error) {
      logger.warn('[LiveDOMAnalyzer] Login attempt failed', { error: error.message });
    }
  }

  /**
   * Analysiert die Struktur nach dem Login
   */
  private async analyzePostLoginStructure(result: DOMAnalysisResult) {
    logger.info('[LiveDOMAnalyzer] Analyzing post-login structure');

    // Re-analysiere nach dem Login
    result.calendarStructure = await this.analyzeCalendarStructure();
    result.courtElements = await this.analyzeCourtElements();
    result.timeSlots = await this.analyzeTimeSlots();
  }

  /**
   * Macht einen Screenshot mit Timestamp
   */
  private async takeScreenshot(name: string, dir: string) {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `${timestamp}-${name}.png`;
      const path = join(dir, filename);
      
      await this.page!.screenshot({ path, fullPage: true });
      logger.info('[LiveDOMAnalyzer] Screenshot captured', { path });
    } catch (error) {
      logger.warn('[LiveDOMAnalyzer] Screenshot failed', { error: error.message });
    }
  }

  /**
   * Speichert die Analyse-Ergebnisse als JSON
   */
  private async saveAnalysisResults(result: DOMAnalysisResult) {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `live-dom-analysis-${timestamp}.json`;
      const path = join('./live-analysis-results', filename);
      
      writeFileSync(path, JSON.stringify(result, null, 2));
      logger.info('[LiveDOMAnalyzer] Analysis results saved', { path });
    } catch (error) {
      logger.warn('[LiveDOMAnalyzer] Could not save analysis results', { error: error.message });
    }
  }

  /**
   * Cleanup Browser-Ressourcen
   */
  private async cleanup() {
    try {
      if (this.page) {
        await this.page.close();
      }
      if (this.browser) {
        await this.browser.close();
      }
      logger.info('[LiveDOMAnalyzer] Cleanup completed');
    } catch (error) {
      logger.warn('[LiveDOMAnalyzer] Cleanup failed', { error: error.message });
    }
  }
}

/**
 * Standalone-Funktion für schnelle Live-Analysis
 */
export async function runLiveAnalysis(options?: {
  url?: string;
  headless?: boolean;
  credentials?: { email: string; password: string };
}): Promise<DOMAnalysisResult> {
  const analyzer = new LiveDOMAnalyzer();
  return await analyzer.analyzeLiveWebsite(options);
}