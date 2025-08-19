#!/usr/bin/env node

/**
 * Website Analysis Script
 * Analyzes the live eversports.de website to validate selectors and understand current DOM structure
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const ANALYSIS_OUTPUT_DIR = path.join(__dirname, '..', 'test-results', 'website-analysis');
const BASE_URL = 'https://www.eversports.de/sb/sportcenter-kautz?sport=squash';

async function analyzeWebsite() {
  console.log('🔍 Starting website analysis...');
  
  // Ensure output directory exists
  if (!fs.existsSync(ANALYSIS_OUTPUT_DIR)) {
    fs.mkdirSync(ANALYSIS_OUTPUT_DIR, { recursive: true });
  }

  const browser = await chromium.launch({ 
    headless: false, // Keep visible for debugging
    slowMo: 1000 // Slow down for observation
  });
  
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });

  const page = await context.newPage();

  try {
    console.log('📍 Navigating to booking page...');
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    
    // Take initial screenshot
    await page.screenshot({ 
      path: path.join(ANALYSIS_OUTPUT_DIR, 'initial-page.png'),
      fullPage: true 
    });

    console.log('📸 Screenshot saved: initial-page.png');

    // Analyze page structure
    const pageAnalysis = await analyzePageStructure(page);
    
    // Save analysis results
    const analysisReport = {
      timestamp: new Date().toISOString(),
      url: BASE_URL,
      viewport: { width: 1280, height: 720 },
      analysis: pageAnalysis
    };

    fs.writeFileSync(
      path.join(ANALYSIS_OUTPUT_DIR, 'page-analysis.json'),
      JSON.stringify(analysisReport, null, 2)
    );

    console.log('✅ Analysis complete! Results saved to:', ANALYSIS_OUTPUT_DIR);

    // Keep browser open for manual inspection
    console.log('🔍 Browser kept open for manual inspection. Press Ctrl+C to close.');
    
    // Wait indefinitely until user closes
    await new Promise(() => {});

  } catch (error) {
    console.error('❌ Analysis failed:', error);
  } finally {
    await browser.close();
  }
}

async function analyzePageStructure(page) {
  console.log('🔍 Analyzing page structure...');

  const analysis = {
    dateSelectors: await findDateSelectors(page),
    calendarElements: await findCalendarElements(page),
    slotElements: await findSlotElements(page),
    navigationElements: await findNavigationElements(page),
    formElements: await findFormElements(page),
    interactiveElements: await findInteractiveElements(page)
  };

  return analysis;
}

async function findDateSelectors(page) {
  console.log('  🗓️  Searching for date selectors...');
  
  const dateSelectors = [
    '[data-testid="date-picker"]',
    '.date-picker',
    '.calendar-navigation',
    'input[type="date"]',
    '[class*="date"]',
    '[id*="date"]',
    '.datepicker',
    '.date-input'
  ];

  const found = [];
  
  for (const selector of dateSelectors) {
    try {
      const elements = await page.$$(selector);
      if (elements.length > 0) {
        const elementInfo = await page.evaluate((sel) => {
          const elements = document.querySelectorAll(sel);
          return Array.from(elements).map(el => ({
            tag: el.tagName,
            className: el.className,
            id: el.id,
            text: el.textContent?.trim().substring(0, 50),
            visible: el.offsetParent !== null
          }));
        }, selector);
        
        found.push({
          selector,
          count: elements.length,
          elements: elementInfo
        });
      }
    } catch (error) {
      // Ignore selector errors
    }
  }

  return found;
}

async function findCalendarElements(page) {
  console.log('  📅 Searching for calendar elements...');
  
  const calendarSelectors = [
    '.calendar',
    '.booking-calendar',
    '[class*="calendar"]',
    '[data-testid*="calendar"]',
    '.fc-event', // FullCalendar
    '.day',
    '.time-slot',
    '[class*="slot"]'
  ];

  const found = [];
  
  for (const selector of calendarSelectors) {
    try {
      const elements = await page.$$(selector);
      if (elements.length > 0) {
        const elementInfo = await page.evaluate((sel) => {
          const elements = document.querySelectorAll(sel);
          return {
            count: elements.length,
            sample: Array.from(elements).slice(0, 3).map(el => ({
              tag: el.tagName,
              className: el.className,
              id: el.id,
              text: el.textContent?.trim().substring(0, 30),
              visible: el.offsetParent !== null
            }))
          };
        }, selector);
        
        found.push({
          selector,
          ...elementInfo
        });
      }
    } catch (error) {
      // Ignore selector errors
    }
  }

  return found;
}

async function findSlotElements(page) {
  console.log('  🎯 Searching for slot elements...');
  
  // Look for clickable time slots
  const slotSelectors = [
    '.time-slot',
    '.slot',
    '.booking-slot',
    '[class*="slot"]',
    '.available',
    '.bookable',
    '[data-testid*="slot"]',
    '[role="button"]',
    'button[class*="time"]'
  ];

  const found = [];
  
  for (const selector of slotSelectors) {
    try {
      const elements = await page.$$(selector);
      if (elements.length > 0) {
        const elementInfo = await page.evaluate((sel) => {
          const elements = document.querySelectorAll(sel);
          return {
            count: elements.length,
            sample: Array.from(elements).slice(0, 5).map(el => ({
              tag: el.tagName,
              className: el.className,
              id: el.id,
              text: el.textContent?.trim().substring(0, 30),
              clickable: el.tagName === 'BUTTON' || el.onclick !== null || el.style.cursor === 'pointer',
              visible: el.offsetParent !== null
            }))
          };
        }, selector);
        
        found.push({
          selector,
          ...elementInfo
        });
      }
    } catch (error) {
      // Ignore selector errors
    }
  }

  return found;
}

async function findNavigationElements(page) {
  console.log('  🧭 Searching for navigation elements...');
  
  const navSelectors = [
    '.navigation',
    '.nav',
    '.next',
    '.prev',
    '.arrow',
    '[class*="next"]',
    '[class*="prev"]',
    '[class*="arrow"]',
    'button[aria-label*="next"]',
    'button[aria-label*="previous"]'
  ];

  const found = [];
  
  for (const selector of navSelectors) {
    try {
      const elements = await page.$$(selector);
      if (elements.length > 0) {
        const elementInfo = await page.evaluate((sel) => {
          const elements = document.querySelectorAll(sel);
          return Array.from(elements).slice(0, 3).map(el => ({
            tag: el.tagName,
            className: el.className,
            id: el.id,
            text: el.textContent?.trim(),
            ariaLabel: el.getAttribute('aria-label'),
            visible: el.offsetParent !== null
          }));
        }, selector);
        
        found.push({
          selector,
          count: elements.length,
          elements: elementInfo
        });
      }
    } catch (error) {
      // Ignore selector errors
    }
  }

  return found;
}

async function findFormElements(page) {
  console.log('  📝 Searching for form elements...');
  
  const forms = await page.evaluate(() => {
    const forms = document.querySelectorAll('form');
    return Array.from(forms).map(form => ({
      action: form.action,
      method: form.method,
      className: form.className,
      id: form.id,
      inputCount: form.querySelectorAll('input').length,
      buttonCount: form.querySelectorAll('button').length
    }));
  });

  const inputs = await page.evaluate(() => {
    const inputs = document.querySelectorAll('input');
    return Array.from(inputs).slice(0, 10).map(input => ({
      type: input.type,
      name: input.name,
      id: input.id,
      className: input.className,
      placeholder: input.placeholder,
      required: input.required
    }));
  });

  return { forms, inputs };
}

async function findInteractiveElements(page) {
  console.log('  🖱️  Searching for interactive elements...');
  
  const buttons = await page.evaluate(() => {
    const buttons = document.querySelectorAll('button');
    return Array.from(buttons).slice(0, 10).map(btn => ({
      text: btn.textContent?.trim(),
      className: btn.className,
      id: btn.id,
      type: btn.type,
      disabled: btn.disabled,
      visible: btn.offsetParent !== null
    }));
  });

  const links = await page.evaluate(() => {
    const links = document.querySelectorAll('a[href]');
    return Array.from(links).slice(0, 10).map(link => ({
      text: link.textContent?.trim().substring(0, 50),
      href: link.href,
      className: link.className,
      id: link.id
    }));
  });

  return { buttons, links };
}

// Run the analysis
if (require.main === module) {
  analyzeWebsite().catch(console.error);
}

module.exports = { analyzeWebsite };