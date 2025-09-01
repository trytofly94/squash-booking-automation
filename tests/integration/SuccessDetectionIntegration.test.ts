/**
 * Integration tests for Enhanced Success Detection
 * Tests the complete success detection workflow with BookingManager integration
 */

import { BookingManager } from '@/core/BookingManager';
import { CheckoutPage } from '@/pages/CheckoutPage';
import { SuccessDetectionRetryManager } from '@/utils/SuccessDetectionRetryManager';
import { SuccessDetectionAnalytics } from '@/utils/SuccessDetectionAnalytics';
import { BookingSuccessResult } from '@/types/booking.types';
import { chromium, Browser, Page } from '@playwright/test';

// Mock the logger
jest.mock('@/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// Mock environment variables
const originalEnv = process.env;

describe('Success Detection Integration', () => {
  let browser: Browser;
  let page: Page;
  let checkoutPage: CheckoutPage;
  let retryManager: SuccessDetectionRetryManager;

  beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
  });

  afterAll(async () => {
    await browser.close();
  });

  beforeEach(async () => {
    page = await browser.newPage();
    checkoutPage = new CheckoutPage(page);
    retryManager = new SuccessDetectionRetryManager();
    
    // Reset analytics
    SuccessDetectionAnalytics.reset();

    // Mock environment variables
    process.env = {
      ...originalEnv,
      SUCCESS_DETECTION_NETWORK_TIMEOUT: '5000',
      SUCCESS_DETECTION_DOM_TIMEOUT: '3000',
      SUCCESS_DETECTION_URL_CHECK_INTERVAL: '200',
      SUCCESS_DETECTION_ENABLE_NETWORK: 'true',
      SUCCESS_DETECTION_ENABLE_DOM: 'true',
      SUCCESS_DETECTION_ENABLE_URL: 'true',
      SUCCESS_DETECTION_ENABLE_TEXT_FALLBACK: 'false'
    };
  });

  afterEach(async () => {
    await page.close();
    process.env = originalEnv;
    jest.clearAllMocks();
  });

  describe('Network Detection Integration', () => {
    test('successful live booking with network detection', async () => {
      // Setup a mock server response
      await page.route('**/api/booking/**', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            booking_id: 'BOOK123456',
            confirmation_number: 'CONF789012',
            status: 'confirmed'
          })
        });
      });

      // Navigate to a booking page
      await page.setContent(`
        <html>
          <body>
            <button id="confirm-booking">Confirm Booking</button>
            <div id="result"></div>
            <script>
              document.getElementById('confirm-booking').addEventListener('click', async () => {
                const response = await fetch('/api/booking/confirm', {
                  method: 'POST',
                  body: JSON.stringify({ booking: 'test' })
                });
                const data = await response.json();
                document.getElementById('result').innerHTML = 'Booking confirmed: ' + data.booking_id;
              });
            </script>
          </body>
        </html>
      `);

      // Mock the safeClick method to trigger the API call
      jest.spyOn(checkoutPage as any, 'safeClick').mockImplementation(async () => {
        await page.click('#confirm-booking');
      });

      const result = await checkoutPage.confirmBooking();

      expect(result).toEqual(expect.objectContaining({
        success: true,
        method: 'network',
        confirmationId: expect.stringContaining('BOOK123456')
      }));
    });

    test('network detection timeout handling', async () => {
      // Set very short timeout
      process.env.SUCCESS_DETECTION_NETWORK_TIMEOUT = '100';

      await page.setContent(`
        <html>
          <body>
            <button id="confirm-booking">Confirm Booking</button>
            <script>
              document.getElementById('confirm-booking').addEventListener('click', () => {
                // No network request - should timeout
                setTimeout(() => {
                  document.body.innerHTML += '<div class="booking-confirmation">Success</div>';
                }, 500);
              });
            </script>
          </body>
        </html>
      `);

      jest.spyOn(checkoutPage as any, 'safeClick').mockImplementation(async () => {
        await page.click('#confirm-booking');
      });

      const result = await checkoutPage.confirmBooking();

      // Should fallback to DOM detection
      expect(result).toEqual(expect.objectContaining({
        success: true,
        method: 'dom-attribute'
      }));
    });
  });

  describe('DOM Detection Integration', () => {
    test('successful live booking with DOM detection fallback', async () => {
      await page.setContent(`
        <html>
          <body>
            <button id="confirm-booking">Confirm Booking</button>
            <script>
              document.getElementById('confirm-booking').addEventListener('click', () => {
                setTimeout(() => {
                  document.body.innerHTML += '<div data-booking-id="DOM123456">Booking confirmed!</div>';
                }, 200);
              });
            </script>
          </body>
        </html>
      `);

      jest.spyOn(checkoutPage as any, 'safeClick').mockImplementation(async () => {
        await page.click('#confirm-booking');
      });

      const result = await checkoutPage.confirmBooking();

      expect(result).toEqual(expect.objectContaining({
        success: true,
        method: 'dom-attribute',
        confirmationId: 'DOM123456'
      }));
    });

    test('DOM detection with multiple selector attempts', async () => {
      await page.setContent(`
        <html>
          <body>
            <button id="confirm-booking">Confirm Booking</button>
            <script>
              document.getElementById('confirm-booking').addEventListener('click', () => {
                setTimeout(() => {
                  // Create element that matches second selector in priority list
                  const div = document.createElement('div');
                  div.setAttribute('data-confirmation-number', 'MULTI789');
                  div.textContent = 'Your booking is confirmed';
                  document.body.appendChild(div);
                }, 200);
              });
            </script>
          </body>
        </html>
      `);

      jest.spyOn(checkoutPage as any, 'safeClick').mockImplementation(async () => {
        await page.click('#confirm-booking');
      });

      const result = await checkoutPage.confirmBooking();

      expect(result).toEqual(expect.objectContaining({
        success: true,
        method: 'dom-attribute',
        confirmationId: 'MULTI789'
      }));
    });
  });

  describe('URL Pattern Detection Integration', () => {
    test('successful booking with URL redirect detection', async () => {
      await page.setContent(`
        <html>
          <body>
            <button id="confirm-booking">Confirm Booking</button>
            <script>
              document.getElementById('confirm-booking').addEventListener('click', () => {
                setTimeout(() => {
                  window.location.href = '/booking-confirmed?id=URL456789&status=success';
                }, 300);
              });
            </script>
          </body>
        </html>
      `);

      jest.spyOn(checkoutPage as any, 'safeClick').mockImplementation(async () => {
        await page.click('#confirm-booking');
      });

      const result = await checkoutPage.confirmBooking();

      expect(result).toEqual(expect.objectContaining({
        success: true,
        method: 'url-pattern',
        confirmationId: 'URL456789'
      }));
    });

    test('URL detection with different success patterns', async () => {
      const successUrls = [
        '/confirmation?booking_id=CONF123',
        '/success?id=SUCCESS456',
        '/booking-complete?confirmation=COMPLETE789'
      ];

      for (const url of successUrls) {
        await page.goto('about:blank');
        await page.setContent(`
          <html>
            <body>
              <button id="confirm-booking">Confirm Booking</button>
              <script>
                document.getElementById('confirm-booking').addEventListener('click', () => {
                  setTimeout(() => {
                    window.location.href = '${url}';
                  }, 100);
                });
              </script>
            </body>
          </html>
        `);

        jest.spyOn(checkoutPage as any, 'safeClick').mockImplementation(async () => {
          await page.click('#confirm-booking');
        });

        const result = await checkoutPage.confirmBooking();

        expect(result).toEqual(expect.objectContaining({
          success: true,
          method: 'url-pattern'
        }));

        // Reset mocks for next iteration
        jest.clearAllMocks();
      }
    });
  });

  describe('Retry Integration', () => {
    test('retry cycle with success detection failure', async () => {
      let attemptCount = 0;
      
      const mockBookingFunction = jest.fn().mockImplementation(async (): Promise<BookingSuccessResult> => {
        attemptCount++;
        
        if (attemptCount < 3) {
          return {
            success: false,
            method: 'network',
            timestamp: new Date()
          };
        } else {
          return {
            success: true,
            method: 'dom-attribute',
            confirmationId: 'RETRY123',
            timestamp: new Date()
          };
        }
      });

      const result = await retryManager.retryWithSuccessDetection(mockBookingFunction, 3);

      expect(result).toEqual(expect.objectContaining({
        success: true,
        method: 'dom-attribute',
        confirmationId: 'RETRY123'
      }));

      expect(mockBookingFunction).toHaveBeenCalledTimes(3);
    });

    test('progressive delay between retry attempts', async () => {
      const timestamps: number[] = [];
      
      const mockBookingFunction = jest.fn().mockImplementation(async (): Promise<BookingSuccessResult> => {
        timestamps.push(Date.now());
        
        return {
          success: false,
          method: 'network',
          timestamp: new Date()
        };
      });

      try {
        await retryManager.retryWithSuccessDetection(mockBookingFunction, 2);
      } catch (error) {
        // Expected to throw after max retries
      }

      // Verify progressive delay (should be at least 2000ms and 4000ms)
      if (timestamps.length >= 2) {
        const delay1 = timestamps[1] - timestamps[0];
        expect(delay1).toBeGreaterThan(1800); // Allow some variance
        
        if (timestamps.length >= 3) {
          const delay2 = timestamps[2] - timestamps[1];
          expect(delay2).toBeGreaterThan(3500);
        }
      }
    });

    test('smart retry strategy based on failure method', async () => {
      const retryDelays: number[] = [];
      const originalWait = retryManager['waitBeforeRetry'];
      
      retryManager['waitBeforeRetry'] = jest.fn().mockImplementation(async (ms: number) => {
        retryDelays.push(ms);
        return Promise.resolve();
      });

      let attemptCount = 0;
      const mockBookingFunction = jest.fn().mockImplementation(async (): Promise<BookingSuccessResult> => {
        attemptCount++;
        
        if (attemptCount === 1) {
          return {
            success: false,
            method: 'network',
            timestamp: new Date()
          };
        } else if (attemptCount === 2) {
          return {
            success: false,
            method: 'none',
            timestamp: new Date()
          };
        } else {
          return {
            success: true,
            method: 'url-pattern',
            confirmationId: 'SMART123',
            timestamp: new Date()
          };
        }
      });

      const result = await retryManager.retryWithSuccessDetection(mockBookingFunction, 3);

      expect(result).toEqual(expect.objectContaining({
        success: true,
        confirmationId: 'SMART123'
      }));

      // Verify different delays for different failure types
      expect(retryDelays).toHaveLength(2);
      expect(retryDelays[0]).toBe(2000); // Network failure: attempt * 2000
      expect(retryDelays[1]).toBe(6000); // Complete failure: attempt * 3000
      
      retryManager['waitBeforeRetry'] = originalWait;
    });
  });

  describe('Analytics Integration', () => {
    test('tracks detection method effectiveness', async () => {
      const trackSpy = jest.spyOn(SuccessDetectionAnalytics, 'trackDetectionMethod');
      
      // Simulate multiple bookings with different outcomes
      const scenarios = [
        { method: 'network', success: true, confirmationId: 'NET123' },
        { method: 'network', success: false },
        { method: 'dom-attribute', success: true, confirmationId: 'DOM456' },
        { method: 'url-pattern', success: true, confirmationId: 'URL789' },
        { method: 'network', success: true, confirmationId: 'NET456' }
      ];

      for (const scenario of scenarios) {
        SuccessDetectionAnalytics.trackDetectionMethod({
          success: scenario.success,
          method: scenario.method as any,
          timestamp: new Date(),
          confirmationId: scenario.confirmationId
        });
      }

      const report = SuccessDetectionAnalytics.generateMethodEffectivenessReport();

      expect(report.methods['network']).toEqual(expect.objectContaining({
        attempts: 3,
        successes: 2,
        successRate: expect.closeTo(0.67, 2)
      }));

      expect(report.methods['dom-attribute']).toEqual(expect.objectContaining({
        attempts: 1,
        successes: 1,
        successRate: 1.0
      }));

      expect(report.overallSuccessRate).toEqual(expect.closeTo(0.8, 1)); // 4 successes out of 5 attempts
      expect(trackSpy).toHaveBeenCalledTimes(5);
    });

    test('generates optimization recommendations', async () => {
      // Simulate poor performance for network method
      for (let i = 0; i < 15; i++) {
        SuccessDetectionAnalytics.trackDetectionMethod({
          success: i < 3, // Only 3 out of 15 succeed = 20% success rate
          method: 'network',
          timestamp: new Date(),
          confirmationId: i < 3 ? `NET${i}` : undefined
        });
      }

      const recommendations = SuccessDetectionAnalytics.getOptimizationRecommendations();

      expect(recommendations).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'performance',
            priority: 'high',
            method: 'network',
            issue: expect.stringContaining('Low success rate')
          })
        ])
      );
    });

    test('exports analytics data for external analysis', async () => {
      // Generate some test data
      SuccessDetectionAnalytics.trackDetectionMethod({
        success: true,
        method: 'network',
        timestamp: new Date(),
        confirmationId: 'EXPORT123'
      });

      const exportData = SuccessDetectionAnalytics.exportData();

      expect(exportData).toEqual(expect.objectContaining({
        exportedAt: expect.any(Date),
        metrics: expect.objectContaining({
          network: expect.objectContaining({
            attempts: 1,
            successes: 1,
            failures: 0
          })
        }),
        summary: expect.objectContaining({
          totalAttempts: 1,
          overallSuccessRate: 1.0
        })
      }));
    });
  });

  describe('Configuration-driven Testing', () => {
    test('respects environment-based configuration', async () => {
      // Override configuration
      process.env.SUCCESS_DETECTION_ENABLE_NETWORK = 'false';
      process.env.SUCCESS_DETECTION_ENABLE_DOM = 'false';
      process.env.SUCCESS_DETECTION_ENABLE_URL = 'true';
      process.env.SUCCESS_DETECTION_ENABLE_TEXT_FALLBACK = 'false';

      await page.setContent(`
        <html>
          <body>
            <button id="confirm-booking">Confirm Booking</button>
            <script>
              document.getElementById('confirm-booking').addEventListener('click', () => {
                setTimeout(() => {
                  window.location.href = '/success?id=CONFIG123';
                }, 100);
              });
            </script>
          </body>
        </html>
      `);

      jest.spyOn(checkoutPage as any, 'safeClick').mockImplementation(async () => {
        await page.click('#confirm-booking');
      });

      const result = await checkoutPage.confirmBooking();

      expect(result).toEqual(expect.objectContaining({
        success: true,
        method: 'url-pattern',
        confirmationId: 'CONFIG123'
      }));
    });

    test('validates configuration and logs warnings', async () => {
      // Set invalid configuration values
      process.env.SUCCESS_DETECTION_NETWORK_TIMEOUT = '50'; // Very low
      process.env.SUCCESS_DETECTION_URL_CHECK_INTERVAL = '50'; // Very low

      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      await checkoutPage.confirmBooking();

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Network timeout is very low')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('URL check interval is very low')
      );

      consoleSpy.mockRestore();
    });
  });

  describe('Error Scenarios', () => {
    test('handles network errors gracefully', async () => {
      await page.route('**/api/**', async (route) => {
        await route.abort();
      });

      await page.setContent(`
        <html>
          <body>
            <button id="confirm-booking">Confirm Booking</button>
            <script>
              document.getElementById('confirm-booking').addEventListener('click', async () => {
                try {
                  await fetch('/api/booking/confirm');
                } catch (e) {
                  // Network error - fallback to DOM
                  document.body.innerHTML += '<div data-booking-id="FALLBACK123">Network failed, but booking succeeded</div>';
                }
              });
            </script>
          </body>
        </html>
      `);

      jest.spyOn(checkoutPage as any, 'safeClick').mockImplementation(async () => {
        await page.click('#confirm-booking');
      });

      const result = await checkoutPage.confirmBooking();

      expect(result).toEqual(expect.objectContaining({
        success: true,
        method: 'dom-attribute',
        confirmationId: 'FALLBACK123'
      }));
    });

    test('handles page navigation errors', async () => {
      await page.setContent(`
        <html>
          <body>
            <button id="confirm-booking">Confirm Booking</button>
            <script>
              document.getElementById('confirm-booking').addEventListener('click', () => {
                // Simulate a broken redirect
                setTimeout(() => {
                  try {
                    window.location.href = 'invalid://url';
                  } catch (e) {
                    // Add fallback success indicator
                    document.body.innerHTML += '<div class="booking-confirmation">Booking confirmed despite redirect error</div>';
                  }
                }, 100);
              });
            </script>
          </body>
        </html>
      `);

      jest.spyOn(checkoutPage as any, 'safeClick').mockImplementation(async () => {
        await page.click('#confirm-booking');
      });

      const result = await checkoutPage.confirmBooking();

      // Should still detect success via text fallback or other methods
      expect(result.success).toBe(true);
    });
  });
});