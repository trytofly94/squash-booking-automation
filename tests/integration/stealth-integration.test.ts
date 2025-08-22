import { test, expect } from '@playwright/test';
import playwright from 'playwright-extra';
import StealthPlugin from 'playwright-extra-plugin-stealth';

// Add stealth plugin
playwright.chromium.use(StealthPlugin());

describe('Stealth Plugin Integration Tests', () => {
  test('should successfully launch browser with stealth mode', async () => {
    const browser = await playwright.chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu',
      ],
    });

    expect(browser).toBeDefined();
    await browser.close();
  });

  test('should create stealth context with German locale and Berlin geolocation', async () => {
    const browser = await playwright.chromium.launch({ headless: true });
    
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      locale: 'de-DE',
      timezoneId: 'Europe/Berlin',
      permissions: ['geolocation'],
      geolocation: { longitude: 13.4050, latitude: 52.5200 }, // Berlin coordinates
      extraHTTPHeaders: {
        'Accept-Language': 'de-DE,de;q=0.9,en;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
        'DNT': '1',
        'Upgrade-Insecure-Requests': '1',
      },
    });

    const page = await context.newPage();
    
    // Test that the context was created successfully
    expect(page).toBeDefined();
    
    // Navigate to a test page to verify stealth headers
    await page.goto('https://httpbin.org/headers');
    
    const content = await page.textContent('body');
    expect(content).toContain('de-DE');
    expect(content).toContain('Mozilla/5.0');
    
    await browser.close();
  });

  test('should mask WebDriver detection', async () => {
    const browser = await playwright.chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();
    
    // Test WebDriver detection
    const webdriverUndefined = await page.evaluate(() => {
      return window.navigator.webdriver === undefined;
    });
    
    expect(webdriverUndefined).toBe(true);
    
    await browser.close();
  });

  test('should handle real website navigation without detection', async () => {
    const browser = await playwright.chromium.launch({ headless: true });
    
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      locale: 'de-DE',
      timezoneId: 'Europe/Berlin',
      extraHTTPHeaders: {
        'Accept-Language': 'de-DE,de;q=0.9,en;q=0.8',
      },
    });

    const page = await context.newPage();
    
    // Navigate to eversports.de (our target website)
    const response = await page.goto('https://www.eversports.de', {
      waitUntil: 'networkidle',
      timeout: 30000,
    });
    
    // Should successfully navigate without being blocked
    expect(response?.status()).toBeLessThan(400);
    
    // Should contain expected content
    const title = await page.title();
    expect(title).toBeTruthy();
    expect(title.length).toBeGreaterThan(0);
    
    await browser.close();
  });

  test('should maintain consistent browser fingerprint', async () => {
    const browser = await playwright.chromium.launch({ headless: true });
    const context = await browser.newContext({
      locale: 'de-DE',
      timezoneId: 'Europe/Berlin',
    });
    const page = await context.newPage();
    
    // Test timezone consistency
    const timezone = await page.evaluate(() => {
      return Intl.DateTimeFormat().resolvedOptions().timeZone;
    });
    
    expect(timezone).toBe('Europe/Berlin');
    
    // Test locale consistency
    const language = await page.evaluate(() => {
      return navigator.language;
    });
    
    expect(language).toBe('de-DE');
    
    await browser.close();
  });
});