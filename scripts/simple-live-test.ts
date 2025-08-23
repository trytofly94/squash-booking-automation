#!/usr/bin/env npx ts-node

/**
 * Einfacher Live-Test für eversports.de
 * Testet die Website direkt und sammelt Struktur-Informationen
 */

import { chromium } from '@playwright/test';
import { logger } from '../src/utils/logger';

async function main() {
  logger.info('🚀 Starting Simple Live Test', 'SimpleLiveTest');

  const browser = await chromium.launch({ 
    headless: false,
    slowMo: 2000 
  });
  
  const page = await browser.newPage();

  try {
    // 1. Navigation zur Website
    console.log('\n📍 Step 1: Navigate to eversports.de');
    await page.goto('https://www.eversports.de/sb/sportcenter-kautz?sport=squash');
    await page.waitForLoadState('networkidle');
    
    console.log('✅ Website loaded successfully');
    console.log(`📋 Page Title: ${await page.title()}`);

    // Screenshot
    await page.screenshot({ path: './test-step-1-navigation.png', fullPage: true });

    // 2. Suche nach Kalender-Container
    console.log('\n📅 Step 2: Search for calendar container');
    
    const calendarSelectors = [
      '#booking-calendar-container',
      '[data-testid="calendar"]',
      '.calendar-container', 
      '.booking-calendar',
      '.calendar-view',
      '[class*="calendar"]'
    ];

    let calendarFound = false;
    for (const selector of calendarSelectors) {
      try {
        const element = page.locator(selector).first();
        const count = await element.count();
        console.log(`  Testing ${selector}: ${count > 0 ? `✅ Found ${count}` : '❌ Not found'}`);
        
        if (count > 0 && !calendarFound) {
          calendarFound = true;
          console.log(`  🎯 Using ${selector} as calendar container`);
          
          // Analysiere Struktur
          const html = await element.innerHTML();
          console.log(`  📝 Calendar HTML length: ${html.length} characters`);
        }
      } catch (error) {
        console.log(`  ❌ ${selector}: Error - ${(error as Error).message.substring(0, 50)}...`);
      }
    }

    // 3. Suche nach Time-Slots mit data-Attributen
    console.log('\n⏰ Step 3: Search for time slots');
    
    const timeSlotSelectors = [
      'td[data-date]',
      'td[data-start]', 
      'td[data-time]',
      'td[data-court]',
      'td[data-state]',
      '[data-date][data-start][data-state][data-court]'
    ];

    for (const selector of timeSlotSelectors) {
      try {
        const elements = await page.locator(selector).all();
        console.log(`  ${selector}: ${elements.length > 0 ? `✅ Found ${elements.length}` : '❌ Not found'}`);
        
        if (elements.length > 0 && elements.length <= 5) {
          // Analysiere erste paar Elemente
          for (let i = 0; i < Math.min(2, elements.length); i++) {
            try {
              const element = elements[i];
              if (element) {
                const attrs = await element.evaluate((el: any) => {
                  const result: Record<string, string> = {};
                  if (el && el.attributes) {
                    for (const attr of el.attributes) {
                      result[attr.name] = attr.value;
                    }
                  }
                  return result;
                });
                console.log(`    Element ${i + 1} attributes:`, JSON.stringify(attrs, null, 2));
              }
            } catch (evalError) {
              console.log(`    Element ${i + 1}: Could not evaluate attributes`);
            }
          }
        }
      } catch (error) {
        console.log(`  ❌ ${selector}: Error`);
      }
    }

    // 4. Teste ui.vision XPath-Patterns
    console.log('\n🛠️ Step 4: Test ui.vision XPath patterns');
    
    const uiVisionXPaths = [
      "//div[@id='booking-calendar-container']",
      "//div[@id='booking-calendar-container']//td[@data-date]",
      "//div[@id='booking-calendar-container']//td[@data-start]",
      "//div[@id='booking-calendar-container']//td[@data-state='free']",
      "//div[@id='booking-calendar-container']//td[@data-court]"
    ];

    for (const xpath of uiVisionXPaths) {
      try {
        const elements = await page.locator(`xpath=${xpath}`).all();
        console.log(`  ${xpath}: ${elements.length > 0 ? `✅ Found ${elements.length}` : '❌ Not found'}`);
      } catch (error) {
        console.log(`  ❌ ${xpath}: Error`);
      }
    }

    // 5. Teste Login-Elemente
    console.log('\n🔐 Step 5: Test login elements');
    
    const loginSelectors = [
      '#email',
      '#password', 
      'input[type="email"]',
      'input[type="password"]',
      'button[type="submit"]'
    ];

    for (const selector of loginSelectors) {
      try {
        const element = page.locator(selector).first();
        const count = await element.count();
        console.log(`  ${selector}: ${count > 0 ? `✅ Found ${count}` : '❌ Not found'}`);
      } catch (error) {
        console.log(`  ❌ ${selector}: Error`);
      }
    }

    // 6. Versuche Login (falls Felder gefunden)
    console.log('\n🔑 Step 6: Attempt login');
    
    try {
      const emailField = page.locator('#email').first();
      const passwordField = page.locator('#password').first();
      const loginButton = page.locator('button[type="submit"]').first();

      if (await emailField.isVisible()) {
        await emailField.fill('contact@lennart.de');
        console.log('  ✅ Email entered');
      }

      if (await passwordField.isVisible()) {
        await passwordField.fill('Columbus94!');
        console.log('  ✅ Password entered');
      }

      if (await loginButton.isVisible()) {
        await loginButton.click();
        await page.waitForLoadState('networkidle');
        console.log('  ✅ Login submitted');
        
        // Screenshot nach Login
        await page.screenshot({ path: './test-step-6-after-login.png', fullPage: true });
      }
    } catch (error) {
      console.log('  ⚠️ Login not available or failed:', (error as Error).message);
    }

    // 7. Post-Login-Analyse
    console.log('\n🔍 Step 7: Post-login analysis');
    
    // Re-teste Kalender-Container nach Login
    for (const selector of calendarSelectors) {
      try {
        const element = page.locator(selector).first();
        const count = await element.count();
        if (count > 0) {
          console.log(`  📅 Post-login calendar ${selector}: ✅ Found ${count}`);
        }
      } catch (error) {
        // Silent
      }
    }

    // 8. Finale Zusammenfassung
    console.log('\n📊 SUMMARY ANALYSIS:');
    console.log('========================================');
    
    const summary = {
      calendarFound,
      url: 'https://www.eversports.de/sb/sportcenter-kautz?sport=squash',
      timestamp: new Date().toISOString()
    };

    console.log('🎯 Next Steps Based on Analysis:');
    if (calendarFound) {
      console.log('  ✅ Calendar container found - proceed with slot detection');
    } else {
      console.log('  ❌ Calendar container NOT found - investigate page structure');
    }

    console.log('\n✅ Live test completed successfully');
    logger.info('✅ Simple Live Test completed', 'SimpleLiveTest', summary);

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('❌ Live test failed:', errorMessage);
    logger.error('❌ Simple Live Test failed', 'SimpleLiveTest', { error: errorMessage });
  } finally {
    await browser.close();
  }
}

main().catch(error => {
  console.error('💥 Fatal error:', error);
  process.exit(1);
});