#!/usr/bin/env npx ts-node

/**
 * Live DOM Explorer for eversports.de Website Analysis
 * 
 * This script performs real-time analysis of the eversports.de website structure
 * to identify the actual DOM selectors for court detection and booking functionality.
 * 
 * Usage: npm run analyze or npx ts-node scripts/live-dom-explorer.ts
 */

import { chromium, Browser, Page } from '@playwright/test';
import * as fs from 'fs/promises';
import * as path from 'path';
import { logger } from '../src/utils/logger';

interface DOMElement {
  tagName: string;
  attributes: Record<string, string>;
  textContent: string;
  children: DOMElement[];
  selector: string;
  xpath: string;
}

interface WebsiteMap {
  url: string;
  timestamp: string;
  pageTitle: string;
  screenshots: string[];
  domStructure: {
    courtSelectors: DOMElement[];
    calendarElements: DOMElement[];
    timeSlots: DOMElement[];
    navigationElements: DOMElement[];
  };
  interactionElements: {
    clickable: DOMElement[];
    forms: DOMElement[];
    buttons: DOMElement[];
  };
  loadingTimings: {
    pageLoad: number;
    domContentLoaded: number;
    networkIdle: number;
  };
}

class LiveDOMExplorer {
  private browser!: Browser;
  private page!: Page;
  private baseUrl = 'https://www.eversports.de/sb/sportcenter-kautz?sport=squash';
  private outputDir = path.join(process.cwd(), 'analysis-output');

  async initialize(): Promise<void> {
    logger.info('[CREATOR] Initializing Live DOM Explorer...');
    
    // Create output directory
    await fs.mkdir(this.outputDir, { recursive: true });
    
    // Launch browser with detailed debugging options
    this.browser = await chromium.launch({
      headless: false, // Show browser for visual inspection
      slowMo: 1000,    // Slow down for better observation
      devtools: true   // Open devtools
    });

    this.page = await this.browser.newPage();
    
    // Set viewport for consistent analysis
    await this.page.setViewportSize({ width: 1920, height: 1080 });
    
    // Enable request interception for performance monitoring
    await this.page.route('**/*', route => {
      logger.debug(`[CREATOR] Request: ${route.request().method()} ${route.request().url()}`);
      route.continue();
    });
  }

  async analyzeWebsite(): Promise<WebsiteMap> {
    logger.info('[CREATOR] Starting comprehensive website analysis...');
    
    const startTime = Date.now();
    
    // Navigate to the website
    logger.info(`[CREATOR] Navigating to ${this.baseUrl}`);
    const navigationPromise = this.page.goto(this.baseUrl, { 
      waitUntil: 'networkidle',
      timeout: 30000 
    });
    
    const pageLoadTime = Date.now() - startTime;
    await navigationPromise;
    
    // Wait for DOM content to be loaded
    const domLoadTime = Date.now() - startTime;
    await this.page.waitForLoadState('domcontentloaded');
    
    // Wait for network to be idle
    const networkIdleTime = Date.now() - startTime;
    await this.page.waitForLoadState('networkidle');
    
    // Take initial screenshot
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const screenshotPath = path.join(this.outputDir, `initial-page-${timestamp}.png`);
    await this.page.screenshot({ path: screenshotPath, fullPage: true });
    
    logger.info('[CREATOR] Analyzing DOM structure for court elements...');
    
    // Comprehensive DOM analysis
    const websiteMap: WebsiteMap = {
      url: this.baseUrl,
      timestamp: new Date().toISOString(),
      pageTitle: await this.page.title(),
      screenshots: [screenshotPath],
      domStructure: {
        courtSelectors: await this.findCourtElements(),
        calendarElements: await this.findCalendarElements(),
        timeSlots: await this.findTimeSlotElements(),
        navigationElements: await this.findNavigationElements()
      },
      interactionElements: {
        clickable: await this.findClickableElements(),
        forms: await this.findFormElements(),
        buttons: await this.findButtonElements()
      },
      loadingTimings: {
        pageLoad: pageLoadTime,
        domContentLoaded: domLoadTime,
        networkIdle: networkIdleTime
      }
    };

    return websiteMap;
  }

  private async findCourtElements(): Promise<DOMElement[]> {
    logger.info('[CREATOR] Searching for court-related elements...');
    
    const courtSelectors = [
      // Current failing selectors
      '[data-testid="court-selector"]',
      '.court-list',
      '.calendar-view',
      
      // Potential Eversports-specific selectors
      '[data-court]',
      '[data-court-id]',
      '.court',
      '.court-item',
      '.court-selection',
      '.booking-court',
      
      // Calendar/grid selectors
      'td[data-court]',
      'td[data-date]',
      'td[data-start]',
      'td[data-state]',
      '.calendar-cell',
      '.time-slot',
      '.booking-slot',
      
      // Generic court-related text
      '*:has-text("Court")',
      '*:has-text("Platz")',
      '*:has-text("Squash")',
      
      // Layout containers
      '.calendar',
      '.booking-calendar',
      '.court-calendar',
      '.timetable',
      '.schedule'
    ];

    const foundElements: DOMElement[] = [];
    
    for (const selector of courtSelectors) {
      try {
        const elements = await this.page.locator(selector).all();
        
        for (const element of elements) {
          if (await element.isVisible()) {
            const domElement = await this.extractElementInfo(element);
            if (domElement) {
              domElement.selector = selector;
              foundElements.push(domElement);
              logger.info(`[CREATOR] Found court element with selector: ${selector}`);
            }
          }
        }
      } catch (error) {
        // Selector not found or invalid - this is expected
        logger.debug(`[CREATOR] Selector not found: ${selector}`);
      }
    }

    return foundElements;
  }

  private async findCalendarElements(): Promise<DOMElement[]> {
    logger.info('[CREATOR] Searching for calendar-related elements...');
    
    const calendarSelectors = [
      '.calendar',
      '.calendar-container',
      '.calendar-grid',
      '.calendar-table',
      'table',
      '.timetable',
      '.schedule',
      '.booking-calendar',
      '.week-view',
      '.day-view',
      '[role="grid"]',
      '[role="table"]'
    ];

    return await this.findElementsBySelectors(calendarSelectors);
  }

  private async findTimeSlotElements(): Promise<DOMElement[]> {
    logger.info('[CREATOR] Searching for time slot elements...');
    
    const timeSlotSelectors = [
      'td[data-start]',
      'td[data-time]',
      '.time-slot',
      '.booking-slot',
      '.available-slot',
      '.slot',
      '.time-cell',
      '.calendar-cell',
      '.hour-slot',
      '*:has-text("14:00")',
      '*:has-text("15:00")',
      '*:has-text("16:00")'
    ];

    return await this.findElementsBySelectors(timeSlotSelectors);
  }

  private async findNavigationElements(): Promise<DOMElement[]> {
    logger.info('[CREATOR] Searching for navigation elements...');
    
    const navigationSelectors = [
      '.date-navigation',
      '.calendar-navigation',
      '.week-navigation',
      'button:has-text("Next")',
      'button:has-text("Previous")',
      'button:has-text("Weiter")',
      'button:has-text("Zurück")',
      '.nav-button',
      '.calendar-nav',
      '[aria-label*="next"]',
      '[aria-label*="previous"]'
    ];

    return await this.findElementsBySelectors(navigationSelectors);
  }

  private async findClickableElements(): Promise<DOMElement[]> {
    const clickableSelectors = [
      'button',
      'a',
      '[role="button"]',
      '[tabindex="0"]',
      '.clickable',
      '.btn'
    ];

    return await this.findElementsBySelectors(clickableSelectors);
  }

  private async findFormElements(): Promise<DOMElement[]> {
    const formSelectors = [
      'form',
      'input',
      'select',
      'textarea',
      '[role="form"]'
    ];

    return await this.findElementsBySelectors(formSelectors);
  }

  private async findButtonElements(): Promise<DOMElement[]> {
    const buttonSelectors = [
      'button',
      'input[type="button"]',
      'input[type="submit"]',
      '[role="button"]'
    ];

    return await this.findElementsBySelectors(buttonSelectors);
  }

  private async findElementsBySelectors(selectors: string[]): Promise<DOMElement[]> {
    const foundElements: DOMElement[] = [];
    
    for (const selector of selectors) {
      try {
        const elements = await this.page.locator(selector).all();
        
        for (const element of elements) {
          if (await element.isVisible()) {
            const domElement = await this.extractElementInfo(element);
            if (domElement) {
              domElement.selector = selector;
              foundElements.push(domElement);
            }
          }
        }
      } catch (error) {
        // Selector not found - this is expected
      }
    }

    return foundElements;
  }

  private async extractElementInfo(element: any): Promise<DOMElement | null> {
    try {
      const tagName = await element.evaluate((el: any) => el.tagName.toLowerCase());
      const attributes: Record<string, string> = {};
      
      // Extract all attributes
      const attributeNames = await element.evaluate((el: any) => 
        Array.from(el.attributes).map((attr: any) => attr.name)
      );
      
      for (const attrName of attributeNames) {
        const attrValue = await element.getAttribute(attrName);
        if (attrValue !== null) {
          attributes[attrName] = attrValue;
        }
      }
      
      const textContent = (await element.textContent()) || '';
      const xpath = await element.evaluate((el: any) => {
        // Generate simple XPath for the element
        try {
          if (el.id) {
            return `id("${el.id}")`;
          }
          let path = '';
          let current = el;
          while (current && current.tagName) {
            let tagName = current.tagName.toLowerCase();
            if (current.parentNode) {
              let siblings = Array.from(current.parentNode.children).filter(
                (child: any) => child.tagName === current.tagName
              );
              if (siblings.length > 1) {
                let index = siblings.indexOf(current) + 1;
                tagName += `[${index}]`;
              }
            }
            path = '/' + tagName + path;
            current = current.parentNode;
          }
          return path || '/unknown';
        } catch (error) {
          return '/error-generating-xpath';
        }
      });

      return {
        tagName,
        attributes,
        textContent: textContent.trim().substring(0, 100), // Limit text content
        children: [], // We'll skip children for now to avoid deep recursion
        selector: '', // Will be set by caller
        xpath
      };
    } catch (error) {
      logger.warn(`[CREATOR] Failed to extract element info: ${error}`);
      return null;
    }
  }

  async saveAnalysisResults(websiteMap: WebsiteMap): Promise<void> {
    const timestamp = websiteMap.timestamp.replace(/[:.]/g, '-');
    const outputFile = path.join(this.outputDir, `website-analysis-${timestamp}.json`);
    
    await fs.writeFile(outputFile, JSON.stringify(websiteMap, null, 2));
    
    logger.info(`[CREATOR] Analysis results saved to: ${outputFile}`);
    
    // Create a simplified report for quick review
    const reportFile = path.join(this.outputDir, `analysis-report-${timestamp}.md`);
    const report = this.generateAnalysisReport(websiteMap);
    await fs.writeFile(reportFile, report);
    
    logger.info(`[CREATOR] Analysis report saved to: ${reportFile}`);
  }

  private generateAnalysisReport(websiteMap: WebsiteMap): string {
    return `# Live Website Analysis Report

**URL**: ${websiteMap.url}
**Timestamp**: ${websiteMap.timestamp}
**Page Title**: ${websiteMap.pageTitle}

## Performance Metrics
- Page Load Time: ${websiteMap.loadingTimings.pageLoad}ms
- DOM Content Loaded: ${websiteMap.loadingTimings.domContentLoaded}ms
- Network Idle: ${websiteMap.loadingTimings.networkIdle}ms

## Court Elements Found
${websiteMap.domStructure.courtSelectors.map(element => 
  `- **${element.tagName}** (${element.selector}): "${element.textContent.substring(0, 50)}..."`
).join('\n')}

## Calendar Elements Found
${websiteMap.domStructure.calendarElements.map(element => 
  `- **${element.tagName}** (${element.selector}): "${element.textContent.substring(0, 50)}..."`
).join('\n')}

## Time Slot Elements Found
${websiteMap.domStructure.timeSlots.map(element => 
  `- **${element.tagName}** (${element.selector}): "${element.textContent.substring(0, 50)}..."`
).join('\n')}

## Navigation Elements Found
${websiteMap.domStructure.navigationElements.map(element => 
  `- **${element.tagName}** (${element.selector}): "${element.textContent.substring(0, 50)}..."`
).join('\n')}

## Recommended Actions
1. Update court selectors in \`src/pages/BookingCalendarPage.ts\`
2. Implement fallback strategies for detected elements
3. Optimize timeout values based on loading timings
4. Test cross-browser compatibility for found selectors

## Critical Findings
${websiteMap.domStructure.courtSelectors.length === 0 ? '⚠️ **NO COURT ELEMENTS FOUND** - Critical issue requiring immediate attention' : '✅ Court elements detected successfully'}
${websiteMap.domStructure.calendarElements.length === 0 ? '⚠️ **NO CALENDAR ELEMENTS FOUND** - Calendar navigation may fail' : '✅ Calendar elements detected successfully'}
${websiteMap.domStructure.timeSlots.length === 0 ? '⚠️ **NO TIME SLOT ELEMENTS FOUND** - Booking functionality at risk' : '✅ Time slot elements detected successfully'}
`;
  }

  async cleanup(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
    }
    logger.info('[CREATOR] Live DOM Explorer cleanup completed');
  }
}

// Main execution function
async function main() {
  const explorer = new LiveDOMExplorer();
  
  try {
    await explorer.initialize();
    const websiteMap = await explorer.analyzeWebsite();
    await explorer.saveAnalysisResults(websiteMap);
    
    logger.info('[CREATOR] ✅ Live website analysis completed successfully!');
    logger.info(`[CREATOR] Found ${websiteMap.domStructure.courtSelectors.length} court elements`);
    logger.info(`[CREATOR] Found ${websiteMap.domStructure.calendarElements.length} calendar elements`);
    logger.info(`[CREATOR] Found ${websiteMap.domStructure.timeSlots.length} time slot elements`);
    
  } catch (error) {
    logger.error(`[CREATOR] ❌ Live website analysis failed: ${error}`);
    throw error;
  } finally {
    await explorer.cleanup();
  }
}

// Execute if run directly
if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { LiveDOMExplorer, WebsiteMap, DOMElement };