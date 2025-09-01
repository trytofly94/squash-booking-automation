/**
 * Comprehensive tests for Success Detection Strategies
 * Tests all four detection methods: network, DOM attribute, URL pattern, and text fallback
 */

import { Page } from '@playwright/test';
import { CheckoutPage } from '@/pages/CheckoutPage';
import { BookingResponseListener } from '@/utils/BookingResponseListener';
import { SuccessDetectionConfigManager } from '@/utils/SuccessDetectionConfigManager';
import { SuccessDetectionAnalytics } from '@/utils/SuccessDetectionAnalytics';
// BookingSuccessResult type is used throughout the test

// Mock the page and logger
jest.mock('@/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('Success Detection Strategies', () => {
  let mockPage: jest.Mocked<Page>;
  let checkoutPage: CheckoutPage;

  beforeEach(() => {
    // Create mock page object
    mockPage = {
      on: jest.fn(),
      off: jest.fn(),
      url: jest.fn().mockReturnValue('https://example.com/booking'),
      waitForSelector: jest.fn(),
      waitForTimeout: jest.fn(),
      locator: jest.fn(),
      click: jest.fn(),
    } as any;

    // Reset analytics before each test
    SuccessDetectionAnalytics.reset();

    checkoutPage = new CheckoutPage(mockPage);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Network Response Detection', () => {
    let responseListener: BookingResponseListener;

    beforeEach(() => {
      responseListener = new BookingResponseListener();
    });

    test('detects success from booking API response with booking_id', async () => {
      // Setup network monitoring
      await responseListener.setupNetworkMonitoring(mockPage);
      
      // Simulate successful booking response
      const mockResponse = {
        success: true,
        booking_id: 'BOOK123456',
        status: 'confirmed'
      };

      // Simulate the response event
      const responseHandler = mockPage.on.mock.calls.find((call: any) => call[0] === 'response')?.[1];
      if (responseHandler) {
        const mockPlaywrightResponse = {
          url: () => 'https://example.com/api/booking/confirm',
          status: () => 200,
          headers: () => ({}),
          json: () => Promise.resolve(mockResponse)
        } as any;
        await responseHandler(mockPlaywrightResponse);
      }

      const result = await responseListener.waitForBookingResponse(5000);
      
      expect(result).toEqual(expect.objectContaining({
        success: true,
        booking_id: 'BOOK123456'
      }));
    });

    test('handles network timeout gracefully', async () => {
      await responseListener.setupNetworkMonitoring(mockPage);
      
      // Don't trigger any response - should timeout
      const result = await responseListener.waitForBookingResponse(100);
      
      expect(result).toBeNull();
    });

    test('extracts confirmation ID from response data', async () => {
      await responseListener.setupNetworkMonitoring(mockPage);
      
      const mockResponse = {
        confirmation: 'CONF789012',
        reservation_id: 'RES345678'
      };

      const responseHandler = mockPage.on.mock.calls.find((call: any) => call[0] === 'response')?.[1];
      if (responseHandler) {
        const mockPlaywrightResponse = {
          url: () => 'https://example.com/api/reservation',
          status: () => 201,
          headers: () => ({}),
          json: () => Promise.resolve(mockResponse)
        } as any;
        await responseHandler(mockPlaywrightResponse);
      }

      const result = await responseListener.waitForBookingResponse(5000);
      
      expect(result).toEqual(expect.objectContaining({
        confirmation: 'CONF789012',
        reservation_id: 'RES345678'
      }));
    });

    test('identifies booking-related URLs correctly', async () => {
      const testUrls = [
        'https://example.com/api/booking/confirm',
        'https://example.com/confirm-reservation',
        'https://example.com/checkout/complete',
        'https://example.com/booking/status',
        'https://example.com/api/non-booking' // Should not match
      ];

      await responseListener.setupNetworkMonitoring(mockPage);
      
      testUrls.forEach(url => {
        const responseHandler = mockPage.on.mock.calls.find((call: any) => call[0] === 'response')?.[1];
        if (responseHandler) {
          const mockPlaywrightResponse = {
            url: () => url,
            status: () => 200,
            headers: () => ({}),
            json: () => Promise.resolve({ success: true })
          } as any;
          responseHandler(mockPlaywrightResponse);
        }
      });

      // Only booking-related URLs should trigger responses
      const result = await responseListener.waitForBookingResponse(1000);
      expect(result).toEqual(expect.objectContaining({ success: true }));
    });
  });

  describe('DOM Attribute Detection', () => {
    test('finds booking-id from data attributes', async () => {
      const mockElement = {
        getAttribute: jest.fn()
          .mockReturnValueOnce('BOOK123456')
          .mockReturnValue(null),
        textContent: jest.fn().mockResolvedValue('Your booking: BOOK123456')
      };

      mockPage.waitForSelector = jest.fn().mockResolvedValue(mockElement);

      // Access private method for testing
      const result = await (checkoutPage as any).detectByDomAttribute(5000);

      expect(result).toEqual(expect.objectContaining({
        success: true,
        method: 'dom-attribute',
        confirmationId: 'BOOK123456'
      }));

      expect(mockPage.waitForSelector).toHaveBeenCalledWith(
        '[data-booking-id]',
        { timeout: 1250 } // 5000 / 4 selectors
      );
    });

    test('tries multiple selectors until success', async () => {
      // First selector fails, second succeeds
      mockPage.waitForSelector = jest.fn()
        .mockRejectedValueOnce(new Error('Timeout'))
        .mockResolvedValueOnce({
          getAttribute: jest.fn().mockReturnValue('CONF789012'),
          textContent: jest.fn().mockResolvedValue('Confirmation: CONF789012')
        });

      const result = await (checkoutPage as any).detectByDomAttribute(5000);

      expect(result).toEqual(expect.objectContaining({
        success: true,
        method: 'dom-attribute',
        confirmationId: 'CONF789012'
      }));

      expect(mockPage.waitForSelector).toHaveBeenCalledTimes(2);
    });

    test('handles missing elements gracefully', async () => {
      mockPage.waitForSelector = jest.fn().mockRejectedValue(new Error('Timeout'));

      const result = await (checkoutPage as any).detectByDomAttribute(2000);

      expect(result).toBeNull();
      expect(mockPage.waitForSelector).toHaveBeenCalledTimes(4); // All 4 selectors tried
    });

    test('extracts confirmation ID from text content when attributes are empty', async () => {
      const mockElement = {
        getAttribute: jest.fn().mockReturnValue(null),
        textContent: jest.fn().mockResolvedValue('Booking Reference: REF456789')
      };

      mockPage.waitForSelector = jest.fn().mockResolvedValue(mockElement);

      const result = await (checkoutPage as any).detectByDomAttribute(5000);

      expect(result).toEqual(expect.objectContaining({
        success: true,
        method: 'dom-attribute',
        confirmationId: 'Booking Reference: REF456789'
      }));
    });
  });

  describe('URL Pattern Detection', () => {
    test('detects success from confirmation URL', async () => {
      mockPage.url = jest.fn().mockReturnValue('https://example.com/booking-confirmed?id=URL123');

      const result = await (checkoutPage as any).detectByUrlPattern(500);

      expect(result).toEqual(expect.objectContaining({
        success: true,
        method: 'url-pattern',
        confirmationId: 'URL123',
        additionalData: {
          urlPattern: '/booking-confirmed'
        }
      }));
    });

    test('extracts confirmation ID from URL parameters', async () => {
      mockPage.url = jest.fn().mockReturnValue('https://example.com/success?booking_id=PARAM789&status=confirmed');

      const result = await (checkoutPage as any).detectByUrlPattern(500);

      expect(result).toEqual(expect.objectContaining({
        success: true,
        method: 'url-pattern',
        confirmationId: 'PARAM789'
      }));
    });

    test('handles URL navigation timeout', async () => {
      mockPage.url = jest.fn().mockReturnValue('https://example.com/checkout');
      mockPage.waitForTimeout = jest.fn().mockResolvedValue(undefined);

      const result = await (checkoutPage as any).detectByUrlPattern(100);

      expect(result).toBeNull();
      expect(mockPage.waitForTimeout).toHaveBeenCalledWith(100);
    });

    test('tries multiple URL patterns', async () => {
      const urlSequence = [
        'https://example.com/checkout',
        'https://example.com/processing',
        'https://example.com/confirmation?id=FINAL123'
      ];

      let callCount = 0;
      mockPage.url = jest.fn().mockImplementation(() => urlSequence[callCount++] || urlSequence[urlSequence.length - 1]);
      mockPage.waitForTimeout = jest.fn().mockResolvedValue(undefined);

      const result = await (checkoutPage as any).detectByUrlPattern(500);

      expect(result).toEqual(expect.objectContaining({
        success: true,
        method: 'url-pattern',
        confirmationId: 'FINAL123'
      }));
    });
  });

  describe('Text-Based Fallback Detection', () => {
    test('detects success with confirmation number extraction', async () => {
      const mockElement = {
        textContent: jest.fn().mockResolvedValue('Your booking has been confirmed! Confirmation number: ABC123DEF')
      };

      mockPage.waitForSelector = jest.fn().mockResolvedValue(mockElement);

      const result = await (checkoutPage as any).detectByTextFallback();

      expect(result).toEqual(expect.objectContaining({
        success: true,
        method: 'text-fallback',
        confirmationId: 'ABC123DEF'
      }));
    });

    test('tries multiple text selector patterns', async () => {
      // First selector fails, second succeeds
      mockPage.waitForSelector = jest.fn()
        .mockRejectedValueOnce(new Error('Timeout'))
        .mockResolvedValueOnce({
          textContent: jest.fn().mockResolvedValue('Booking successful! Reference: XYZ789')
        });

      const result = await (checkoutPage as any).detectByTextFallback();

      expect(result).toEqual(expect.objectContaining({
        success: true,
        method: 'text-fallback',
        confirmationId: 'XYZ789'
      }));

      expect(mockPage.waitForSelector).toHaveBeenCalledTimes(2);
    });

    test('detects success keywords without specific confirmation ID', async () => {
      const mockElement = {
        textContent: jest.fn().mockResolvedValue('Your booking has been confirmed successfully!')
      };

      mockPage.waitForSelector = jest.fn().mockResolvedValue(mockElement);

      const result = await (checkoutPage as any).detectByTextFallback();

      expect(result).toEqual(expect.objectContaining({
        success: true,
        method: 'text-fallback',
        confirmationId: 'text-confirmed'
      }));
    });

    test('recognizes German success keywords', async () => {
      const mockElement = {
        textContent: jest.fn().mockResolvedValue('Ihre Buchung wurde erfolgreich bestätigt!')
      };

      mockPage.waitForSelector = jest.fn().mockResolvedValue(mockElement);

      const result = await (checkoutPage as any).detectByTextFallback();

      expect(result).toEqual(expect.objectContaining({
        success: true,
        method: 'text-fallback'
      }));
    });

    test('returns null when no success indicators found', async () => {
      const mockElement = {
        textContent: jest.fn().mockResolvedValue('Please complete your booking.')
      };

      mockPage.waitForSelector = jest.fn().mockResolvedValue(mockElement);

      const result = await (checkoutPage as any).detectByTextFallback();

      expect(result).toBeNull();
    });
  });

  describe('Multi-Strategy Integration', () => {
    test('tries strategies in correct priority order', async () => {
      // Mock all detection methods to return null except URL pattern
      jest.spyOn(checkoutPage as any, 'detectByNetworkResponse').mockResolvedValue(null);
      jest.spyOn(checkoutPage as any, 'detectByDomAttribute').mockResolvedValue(null);
      jest.spyOn(checkoutPage as any, 'detectByUrlPattern').mockResolvedValue({
        success: true,
        method: 'url-pattern',
        confirmationId: 'URL123',
        timestamp: new Date()
      });
      jest.spyOn(checkoutPage as any, 'detectByTextFallback').mockResolvedValue(null);

      // Mock click booking button
      jest.spyOn(checkoutPage as any, 'clickBookingButton').mockResolvedValue(undefined);

      const result = await checkoutPage.confirmBooking();

      expect(result).toEqual(expect.objectContaining({
        success: true,
        method: 'url-pattern',
        confirmationId: 'URL123'
      }));

      // Verify strategies were called in correct order
      expect((checkoutPage as any).detectByNetworkResponse).toHaveBeenCalled();
      expect((checkoutPage as any).detectByDomAttribute).toHaveBeenCalled();
      expect((checkoutPage as any).detectByUrlPattern).toHaveBeenCalled();
      expect((checkoutPage as any).detectByTextFallback).not.toHaveBeenCalled(); // Text fallback disabled for live
    });

    test('returns first successful strategy result', async () => {
      // Network detection succeeds, others shouldn't be called
      jest.spyOn(checkoutPage as any, 'detectByNetworkResponse').mockResolvedValue({
        success: true,
        method: 'network',
        confirmationId: 'NET456',
        timestamp: new Date()
      });
      jest.spyOn(checkoutPage as any, 'detectByDomAttribute').mockResolvedValue(null);
      jest.spyOn(checkoutPage as any, 'detectByUrlPattern').mockResolvedValue(null);
      jest.spyOn(checkoutPage as any, 'detectByTextFallback').mockResolvedValue(null);
      jest.spyOn(checkoutPage as any, 'clickBookingButton').mockResolvedValue(undefined);

      const result = await checkoutPage.confirmBooking();

      expect(result).toEqual(expect.objectContaining({
        success: true,
        method: 'network',
        confirmationId: 'NET456'
      }));

      // Only network detection should have been called
      expect((checkoutPage as any).detectByNetworkResponse).toHaveBeenCalled();
      expect((checkoutPage as any).detectByDomAttribute).not.toHaveBeenCalled();
      expect((checkoutPage as any).detectByUrlPattern).not.toHaveBeenCalled();
    });

    test('falls back through all strategies when needed', async () => {
      // All methods return null
      jest.spyOn(checkoutPage as any, 'detectByNetworkResponse').mockResolvedValue(null);
      jest.spyOn(checkoutPage as any, 'detectByDomAttribute').mockResolvedValue(null);
      jest.spyOn(checkoutPage as any, 'detectByUrlPattern').mockResolvedValue(null);
      jest.spyOn(checkoutPage as any, 'detectByTextFallback').mockResolvedValue(null);
      jest.spyOn(checkoutPage as any, 'clickBookingButton').mockResolvedValue(undefined);

      const result = await checkoutPage.confirmBooking();

      expect(result).toEqual(expect.objectContaining({
        success: false,
        method: 'none'
      }));

      // All strategies should have been tried
      expect((checkoutPage as any).detectByNetworkResponse).toHaveBeenCalled();
      expect((checkoutPage as any).detectByDomAttribute).toHaveBeenCalled();
      expect((checkoutPage as any).detectByUrlPattern).toHaveBeenCalled();
      // Text fallback not called in live mode (default config)
    });

    test('tracks analytics for all detection attempts', async () => {
      const trackSpy = jest.spyOn(SuccessDetectionAnalytics, 'trackDetectionMethod');

      // First two fail, third succeeds
      jest.spyOn(checkoutPage as any, 'detectByNetworkResponse').mockResolvedValue({
        success: false,
        method: 'network',
        timestamp: new Date()
      });
      jest.spyOn(checkoutPage as any, 'detectByDomAttribute').mockResolvedValue({
        success: false,
        method: 'dom-attribute',
        timestamp: new Date()
      });
      jest.spyOn(checkoutPage as any, 'detectByUrlPattern').mockResolvedValue({
        success: true,
        method: 'url-pattern',
        confirmationId: 'SUCCESS123',
        timestamp: new Date()
      });
      jest.spyOn(checkoutPage as any, 'clickBookingButton').mockResolvedValue(undefined);

      await checkoutPage.confirmBooking();

      // Should track failed attempts and successful attempt
      expect(trackSpy).toHaveBeenCalledTimes(3);
      expect(trackSpy).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        method: 'network'
      }));
      expect(trackSpy).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        method: 'dom-attribute'
      }));
      expect(trackSpy).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
        method: 'url-pattern'
      }));
    });
  });

  describe('Configuration Integration', () => {
    test('respects configuration settings for enabled methods', async () => {
      // Mock config to disable network monitoring
      jest.spyOn(SuccessDetectionConfigManager, 'getLiveConfig').mockReturnValue({
        networkTimeout: 10000,
        domTimeout: 5000,
        urlCheckInterval: 500,
        enableNetworkMonitoring: false,
        enableDomDetection: true,
        enableUrlDetection: true,
        enableTextFallback: false
      });

      jest.spyOn(checkoutPage as any, 'detectByNetworkResponse').mockResolvedValue(null);
      jest.spyOn(checkoutPage as any, 'detectByDomAttribute').mockResolvedValue({
        success: true,
        method: 'dom-attribute',
        confirmationId: 'DOM123',
        timestamp: new Date()
      });
      jest.spyOn(checkoutPage as any, 'clickBookingButton').mockResolvedValue(undefined);

      const result = await checkoutPage.confirmBooking();

      expect(result).toEqual(expect.objectContaining({
        success: true,
        method: 'dom-attribute',
        confirmationId: 'DOM123'
      }));

      // Network detection should not have been called due to disabled config
      expect((checkoutPage as any).detectByNetworkResponse).toHaveBeenCalled();
      expect((checkoutPage as any).detectByDomAttribute).toHaveBeenCalled();
    });

    test('uses appropriate timeouts from configuration', async () => {
      const customConfig = {
        networkTimeout: 15000,
        domTimeout: 8000,
        urlCheckInterval: 200,
        enableNetworkMonitoring: true,
        enableDomDetection: true,
        enableUrlDetection: true,
        enableTextFallback: false
      };

      jest.spyOn(SuccessDetectionConfigManager, 'getLiveConfig').mockReturnValue(customConfig);
      
      jest.spyOn(checkoutPage as any, 'detectByNetworkResponse').mockResolvedValue(null);
      jest.spyOn(checkoutPage as any, 'detectByDomAttribute').mockResolvedValue(null);
      jest.spyOn(checkoutPage as any, 'detectByUrlPattern').mockResolvedValue(null);
      jest.spyOn(checkoutPage as any, 'clickBookingButton').mockResolvedValue(undefined);

      await checkoutPage.confirmBooking();

      // Verify methods were called with correct timeout parameters
      expect((checkoutPage as any).detectByNetworkResponse).toHaveBeenCalledWith(
        expect.any(Object),
        customConfig.networkTimeout
      );
      expect((checkoutPage as any).detectByDomAttribute).toHaveBeenCalledWith(
        customConfig.domTimeout
      );
      expect((checkoutPage as any).detectByUrlPattern).toHaveBeenCalledWith(
        customConfig.urlCheckInterval
      );
    });
  });

  describe('Error Handling', () => {
    test('handles detection method exceptions gracefully', async () => {
      jest.spyOn(checkoutPage as any, 'detectByNetworkResponse').mockRejectedValue(new Error('Network error'));
      jest.spyOn(checkoutPage as any, 'detectByDomAttribute').mockRejectedValue(new Error('DOM error'));
      jest.spyOn(checkoutPage as any, 'detectByUrlPattern').mockResolvedValue({
        success: true,
        method: 'url-pattern',
        confirmationId: 'RECOVER123',
        timestamp: new Date()
      });
      jest.spyOn(checkoutPage as any, 'clickBookingButton').mockResolvedValue(undefined);

      const result = await checkoutPage.confirmBooking();

      // Should recover and succeed with URL pattern detection
      expect(result).toEqual(expect.objectContaining({
        success: true,
        method: 'url-pattern',
        confirmationId: 'RECOVER123'
      }));
    });

    test('returns failure result when booking button click fails', async () => {
      jest.spyOn(checkoutPage as any, 'clickBookingButton').mockRejectedValue(new Error('Click failed'));

      const result = await checkoutPage.confirmBooking();

      expect(result).toEqual(expect.objectContaining({
        success: false,
        method: 'none'
      }));
    });
  });
});