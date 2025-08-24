import type { Page } from '@playwright/test';
import { BasePage } from './BasePage';
import { logger } from '../utils/logger';
import { BookingSuccessResult } from '@/types/booking.types';
import { BookingResponseListener } from '@/utils/BookingResponseListener';
import { SuccessDetectionConfigManager } from '@/utils/SuccessDetectionConfigManager';
import { SuccessDetectionAnalytics } from '@/utils/SuccessDetectionAnalytics';

/**
 * Page Object for the checkout and booking confirmation process
 */
export class CheckoutPage extends BasePage {
  private readonly selectors = {
    // Checkout navigation
    checkoutButton:
      '[data-testid="checkout"], .checkout-btn, .btn-checkout, button:has-text("Checkout")',
    proceedButton:
      '[data-testid="proceed"], .proceed-btn, .btn-proceed, button:has-text("Proceed")',

    // Login section
    loginSection: '.login-section, .auth-section, [data-testid="login"]',
    emailInput: 'input[type="email"], #email, [data-testid="email"]',
    passwordInput: 'input[type="password"], #password, [data-testid="password"]',
    loginButton: 'button[type="submit"], .login-btn, [data-testid="login-submit"]',

    // Guest checkout
    guestCheckoutButton:
      '.guest-checkout, [data-testid="guest-checkout"], button:has-text("Guest")',

    // Personal information
    firstNameInput: 'input[name="firstName"], #firstName, [data-testid="first-name"]',
    lastNameInput: 'input[name="lastName"], #lastName, [data-testid="last-name"]',
    phoneInput: 'input[name="phone"], #phone, [data-testid="phone"]',

    // Booking summary
    bookingSummary: '.booking-summary, .order-summary, [data-testid="booking-summary"]',
    courtInfo: '.court-info, .booking-details, [data-testid="court-info"]',
    timeInfo: '.time-info, .booking-time, [data-testid="time-info"]',
    priceInfo: '.price-info, .booking-price, [data-testid="price-info"]',

    // Payment section
    paymentSection: '.payment-section, [data-testid="payment"]',
    paymentMethodSelector: '.payment-method, [data-testid="payment-method"]',
    cardNumberInput: 'input[name="cardNumber"], #cardNumber, [data-testid="card-number"]',
    expiryInput: 'input[name="expiry"], #expiry, [data-testid="card-expiry"]',
    cvcInput: 'input[name="cvc"], #cvc, [data-testid="card-cvc"]',

    // Terms and conditions
    termsCheckbox: 'input[type="checkbox"][name*="terms"], #terms, [data-testid="terms"]',
    privacyCheckbox: 'input[type="checkbox"][name*="privacy"], #privacy, [data-testid="privacy"]',

    // Final booking
    confirmBookingButton:
      '.confirm-booking, [data-testid="confirm-booking"], button:has-text("Confirm")',
    bookingConfirmation:
      '.booking-confirmation, .success-message, [data-testid="booking-confirmation"]',

    // Error handling
    errorMessage: '.error-message, .alert-error, [data-testid="error"]',
    fieldError: '.field-error, .input-error, .validation-error',

    // Loading states
    loading: '.loading, .spinner, [data-testid="loading"]',
    processingPayment: '.payment-processing, [data-testid="payment-processing"]',
  };

  constructor(page: Page) {
    super(page);
  }

  /**
   * Proceed to checkout from the booking calendar
   */
  async proceedToCheckout(): Promise<void> {
    const component = 'CheckoutPage.proceedToCheckout';

    logger.info('Proceeding to checkout', component);

    try {
      const checkoutSelectors = [this.selectors.checkoutButton, this.selectors.proceedButton];

      const foundSelector = await this.waitForAnySelector(checkoutSelectors);
      await this.safeClick(foundSelector);
      await this.waitForNavigation();

      logger.info('Successfully proceeded to checkout', component);
    } catch (error) {
      logger.error('Error proceeding to checkout', component, {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Check if user is already logged in
   */
  async isUserLoggedIn(): Promise<boolean> {
    try {
      // If login section is not present, user is likely logged in
      return !(await this.elementExists(this.selectors.loginSection, 3000));
    } catch {
      return false;
    }
  }

  /**
   * Perform login with credentials
   */
  async login(email: string, password: string): Promise<void> {
    const component = 'CheckoutPage.login';

    logger.info('Attempting login', component, { email: email.replace(/.(?=.{4})/g, '*') });

    try {
      if (await this.isUserLoggedIn()) {
        logger.info('User already logged in', component);
        return;
      }

      await this.waitForElement(this.selectors.loginSection);

      // Fill login credentials
      await this.safeFill(this.selectors.emailInput, email);
      await this.safeFill(this.selectors.passwordInput, password);

      // Submit login
      await this.safeClick(this.selectors.loginButton);
      await this.waitForNavigation();

      // Check for login errors
      if (await this.elementExists(this.selectors.errorMessage, 3000)) {
        const errorText = await this.getText(this.selectors.errorMessage);
        throw new Error(`Login failed: ${errorText}`);
      }

      logger.info('Login successful', component);
    } catch (error) {
      logger.error('Login failed', component, {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Proceed with guest checkout
   */
  async proceedAsGuest(): Promise<void> {
    const component = 'CheckoutPage.proceedAsGuest';

    logger.info('Proceeding as guest', component);

    try {
      if (await this.elementExists(this.selectors.guestCheckoutButton)) {
        await this.safeClick(this.selectors.guestCheckoutButton);
        await this.waitForNavigation();
        logger.info('Guest checkout initiated', component);
      } else {
        logger.warn('Guest checkout option not found', component);
      }
    } catch (error) {
      logger.error('Error proceeding as guest', component, {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Fill personal information for guest checkout
   */
  async fillPersonalInformation(info: {
    firstName: string;
    lastName: string;
    email: string;
    phone?: string;
  }): Promise<void> {
    const component = 'CheckoutPage.fillPersonalInformation';

    logger.info('Filling personal information', component, {
      firstName: info.firstName,
      lastName: info.lastName,
      email: info.email.replace(/.(?=.{4})/g, '*'),
    });

    try {
      if (await this.elementExists(this.selectors.firstNameInput)) {
        await this.safeFill(this.selectors.firstNameInput, info.firstName);
      }

      if (await this.elementExists(this.selectors.lastNameInput)) {
        await this.safeFill(this.selectors.lastNameInput, info.lastName);
      }

      if (await this.elementExists(this.selectors.emailInput)) {
        await this.safeFill(this.selectors.emailInput, info.email);
      }

      if (info.phone && (await this.elementExists(this.selectors.phoneInput))) {
        await this.safeFill(this.selectors.phoneInput, info.phone);
      }

      logger.info('Personal information filled successfully', component);
    } catch (error) {
      logger.error('Error filling personal information', component, {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Validate booking summary
   */
  async validateBookingSummary(
    expectedCourt: string,
    expectedTime: string,
    expectedDate: string
  ): Promise<boolean> {
    const component = 'CheckoutPage.validateBookingSummary';

    logger.info('Validating booking summary', component, {
      expectedCourt,
      expectedTime,
      expectedDate,
    });

    try {
      await this.waitForElement(this.selectors.bookingSummary);

      let validationPassed = true;
      const validationResults: any = {};

      // Validate court information
      if (await this.elementExists(this.selectors.courtInfo)) {
        const courtText = await this.getText(this.selectors.courtInfo);
        validationResults.court = {
          expected: expectedCourt,
          actual: courtText,
          match: courtText.includes(expectedCourt),
        };
        if (!validationResults.court.match) validationPassed = false;
      }

      // Validate time information
      if (await this.elementExists(this.selectors.timeInfo)) {
        const timeText = await this.getText(this.selectors.timeInfo);
        validationResults.time = {
          expected: expectedTime,
          actual: timeText,
          match: timeText.includes(expectedTime),
        };
        if (!validationResults.time.match) validationPassed = false;
      }

      logger.info('Booking summary validation completed', component, {
        validationPassed,
        results: validationResults,
      });

      return validationPassed;
    } catch (error) {
      logger.error('Error validating booking summary', component, {
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Fill payment information (for testing - use test card numbers only)
   */
  async fillPaymentInformation(paymentInfo: {
    cardNumber: string;
    expiry: string;
    cvc: string;
  }): Promise<void> {
    const component = 'CheckoutPage.fillPaymentInformation';

    logger.info('Filling payment information', component, {
      cardNumber: paymentInfo.cardNumber.replace(/.(?=.{4})/g, '*'),
    });

    try {
      await this.waitForElement(this.selectors.paymentSection);

      if (await this.elementExists(this.selectors.cardNumberInput)) {
        await this.safeFill(this.selectors.cardNumberInput, paymentInfo.cardNumber);
      }

      if (await this.elementExists(this.selectors.expiryInput)) {
        await this.safeFill(this.selectors.expiryInput, paymentInfo.expiry);
      }

      if (await this.elementExists(this.selectors.cvcInput)) {
        await this.safeFill(this.selectors.cvcInput, paymentInfo.cvc);
      }

      logger.info('Payment information filled successfully', component);
    } catch (error) {
      logger.error('Error filling payment information', component, {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Accept terms and conditions
   */
  async acceptTermsAndConditions(): Promise<void> {
    const component = 'CheckoutPage.acceptTermsAndConditions';

    logger.info('Accepting terms and conditions', component);

    try {
      // Accept terms checkbox
      if (await this.elementExists(this.selectors.termsCheckbox)) {
        const isChecked = await this.page.isChecked(this.selectors.termsCheckbox);
        if (!isChecked) {
          await this.safeClick(this.selectors.termsCheckbox);
        }
      }

      // Accept privacy checkbox
      if (await this.elementExists(this.selectors.privacyCheckbox)) {
        const isChecked = await this.page.isChecked(this.selectors.privacyCheckbox);
        if (!isChecked) {
          await this.safeClick(this.selectors.privacyCheckbox);
        }
      }

      logger.info('Terms and conditions accepted', component);
    } catch (error) {
      logger.error('Error accepting terms and conditions', component, {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Complete the booking (final confirmation) with enhanced success detection
   */
  async confirmBooking(): Promise<BookingSuccessResult> {
    const component = 'CheckoutPage.confirmBooking';

    logger.info('Confirming booking with enhanced success detection', component);

    const config = SuccessDetectionConfigManager.getLiveConfig();
    SuccessDetectionConfigManager.validateConfig(config);

    try {
      // Setup network monitoring before clicking if enabled
      const responseListener = new BookingResponseListener();
      if (config.enableNetworkMonitoring) {
        await responseListener.setupNetworkMonitoring(this.page);
      }

      // Perform the booking action
      await this.clickBookingButton();

      // Try detection strategies in order of reliability
      const strategies = [
        () => this.detectByNetworkResponse(responseListener, config.networkTimeout),
        () => this.detectByDomAttribute(config.domTimeout),
        () => this.detectByUrlPattern(config.urlCheckInterval),
        () => config.enableTextFallback ? this.detectByTextFallback() : null
      ];

      for (const strategy of strategies) {
        const result = await strategy();
        if (result && result.success) {
          logger.info('Booking success detected', component, { 
            method: result.method, 
            confirmationId: result.confirmationId 
          });
          
          // Track successful detection for analytics
          SuccessDetectionAnalytics.trackDetectionMethod(result);
          
          return result;
        } else if (result) {
          // Track failed detection attempts
          SuccessDetectionAnalytics.trackDetectionMethod(result);
        }
      }

      // All strategies failed
      logger.error('All success detection strategies failed', component);
      return { 
        success: false, 
        method: 'none', 
        timestamp: new Date() 
      };

    } catch (error) {
      logger.error('Error during booking confirmation', component, {
        error: error instanceof Error ? error.message : String(error),
      });
      return { 
        success: false, 
        method: 'none', 
        timestamp: new Date() 
      };
    }
  }

  /**
   * Legacy method for backward compatibility
   * @deprecated Use confirmBooking() which returns BookingSuccessResult
   */
  async confirmBookingLegacy(): Promise<boolean> {
    const result = await this.confirmBooking();
    return result.success;
  }

  /**
   * Complete the entire checkout process
   */
  async completeCheckout(
    options: {
      userCredentials?: { email: string; password: string };
      guestInfo?: { firstName: string; lastName: string; email: string; phone?: string };
      paymentInfo?: { cardNumber: string; expiry: string; cvc: string };
      dryRun?: boolean;
    } = {}
  ): Promise<boolean> {
    const component = 'CheckoutPage.completeCheckout';

    logger.info('Starting complete checkout process', component, {
      hasCredentials: !!options.userCredentials,
      hasGuestInfo: !!options.guestInfo,
      hasPayment: !!options.paymentInfo,
      dryRun: options.dryRun || false,
    });

    try {
      // Handle authentication
      if (options.userCredentials) {
        await this.login(options.userCredentials.email, options.userCredentials.password);
      } else if (options.guestInfo) {
        await this.proceedAsGuest();
        await this.fillPersonalInformation(options.guestInfo);
      }

      // Fill payment information if provided and not in dry run
      if (options.paymentInfo && !options.dryRun) {
        await this.fillPaymentInformation(options.paymentInfo);
      }

      // Accept terms and conditions
      await this.acceptTermsAndConditions();

      // Complete booking (skip in dry run mode)
      if (options.dryRun) {
        logger.info('Dry run mode - skipping actual booking confirmation', component);
        return true;
      } else {
        const result = await this.confirmBooking();
        return result.success;
      }
    } catch (error) {
      logger.error('Checkout process failed', component, {
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Perform the actual booking button click with processing wait
   */
  private async clickBookingButton(): Promise<void> {
    const component = 'CheckoutPage.clickBookingButton';
    
    // Click confirm booking button
    await this.safeClick(this.selectors.confirmBookingButton);

    // Wait for payment processing
    if (await this.elementExists(this.selectors.processingPayment, 3000)) {
      logger.info('Payment processing detected, waiting for completion', component);
      await this.page
        .locator(this.selectors.processingPayment)
        .waitFor({ state: 'hidden', timeout: 30000 });
    }
  }

  /**
   * Detect booking success via network response monitoring
   */
  private async detectByNetworkResponse(
    listener: BookingResponseListener, 
    timeout: number
  ): Promise<BookingSuccessResult | null> {
    const component = 'CheckoutPage.detectByNetworkResponse';
    const startTime = new Date();
    
    try {
      const response = await listener.waitForBookingResponse(timeout);
      if (response?.success || response?.booking_id || response?.confirmation) {
        const confirmationId = response.booking_id || 
                              response.bookingId ||
                              response.confirmation || 
                              response.confirmationNumber ||
                              'network-confirmed';

        const result = {
          success: true,
          confirmationId: String(confirmationId),
          method: 'network' as const,
          timestamp: new Date(),
          additionalData: { 
            networkResponse: response 
          }
        };

        // Track timing for successful network detection
        SuccessDetectionAnalytics.trackDetectionTiming(
          'network', 
          startTime, 
          result.timestamp, 
          true
        );

        return result;
      }
    } catch (error) {
      logger.warn('Network detection failed', component, { 
        error: error instanceof Error ? error.message : String(error) 
      });
      
      // Track timing for failed network detection
      SuccessDetectionAnalytics.trackDetectionTiming(
        'network', 
        startTime, 
        new Date(), 
        false
      );
    }
    return null;
  }

  /**
   * Detect booking success via DOM attribute detection
   */
  private async detectByDomAttribute(timeout: number): Promise<BookingSuccessResult | null> {
    const component = 'CheckoutPage.detectByDomAttribute';
    
    try {
      // Look for specific elements that only appear on confirmation pages
      const selectors = [
        '[data-booking-id]',
        '[data-confirmation-number]',
        '[data-reservation-id]',
        '.booking-reference',
        '.confirmation-number',
        '[data-testid="booking-confirmation"]'
      ];
      
      for (const selector of selectors) {
        try {
          const element = await this.page.waitForSelector(selector, { 
            timeout: timeout / selectors.length 
          });
          
          if (element) {
            const bookingId = await element.getAttribute('data-booking-id') ||
                             await element.getAttribute('data-confirmation-number') ||
                             await element.getAttribute('data-reservation-id') ||
                             await element.textContent();
            
            return {
              success: true,
              confirmationId: bookingId?.trim() || 'dom-confirmed',
              method: 'dom-attribute',
              timestamp: new Date(),
              additionalData: { 
                domElement: selector 
              }
            };
          }
        } catch (e) {
          // Continue to next selector
        }
      }
    } catch (error) {
      logger.warn('DOM attribute detection failed', component, { 
        error: error instanceof Error ? error.message : String(error) 
      });
    }
    return null;
  }

  /**
   * Detect booking success via URL pattern detection
   */
  private async detectByUrlPattern(checkInterval: number): Promise<BookingSuccessResult | null> {
    const component = 'CheckoutPage.detectByUrlPattern';
    
    try {
      const maxChecks = Math.floor(10000 / checkInterval); // Check for 10 seconds total
      
      for (let i = 0; i < maxChecks; i++) {
        const currentUrl = this.page.url();
        
        const successPatterns = [
          '/booking-confirmed',
          '/confirmation',
          '/success',
          '/booking-complete',
          '/booking-success',
          'booking_success',
          'confirmed=true',
          'status=success'
        ];
        
        for (const pattern of successPatterns) {
          if (currentUrl.toLowerCase().includes(pattern.toLowerCase())) {
            // Extract confirmation ID from URL if present
            const url = new URL(currentUrl);
            const confirmationId = url.searchParams.get('booking_id') || 
                                 url.searchParams.get('confirmation') ||
                                 url.searchParams.get('id') ||
                                 url.searchParams.get('reference') ||
                                 'url-confirmed';
            
            return {
              success: true,
              confirmationId: confirmationId,
              method: 'url-pattern',
              timestamp: new Date(),
              additionalData: { 
                urlPattern: pattern 
              }
            };
          }
        }
        
        await this.page.waitForTimeout(checkInterval);
      }
    } catch (error) {
      logger.warn('URL pattern detection failed', component, { 
        error: error instanceof Error ? error.message : String(error) 
      });
    }
    return null;
  }

  /**
   * Detect booking success via enhanced text-based fallback (testing only)
   */
  private async detectByTextFallback(): Promise<BookingSuccessResult | null> {
    const component = 'CheckoutPage.detectByTextFallback';
    
    try {
      // Multiple selector strategies for text-based detection
      const textSelectors = [
        '.booking-confirmation',
        '.success-message',
        '.confirmation-details',
        '[data-testid="confirmation"]',
        '.reservation-confirmed',
        '.booking-success',
        '.order-confirmation'
      ];
      
      for (const selector of textSelectors) {
        try {
          const element = await this.page.waitForSelector(selector, { timeout: 3000 });
          if (element) {
            const confirmationText = await element.textContent();
            
            if (confirmationText && this.containsSuccessKeywords(confirmationText)) {
              // Enhanced regex patterns for confirmation number extraction
              const confirmationPatterns = [
                /confirmation\s*(?:number|#|id)?\s*:?\s*([A-Z0-9\-]+)/i,
                /booking\s*(?:reference|id|number)\s*:?\s*([A-Z0-9\-]+)/i,
                /reservation\s*(?:number|id)\s*:?\s*([A-Z0-9\-]+)/i,
                /reference\s*:?\s*([A-Z0-9\-]+)/i,
                /order\s*(?:number|id)\s*:?\s*([A-Z0-9\-]+)/i
              ];
              
              for (const pattern of confirmationPatterns) {
                const match = confirmationText.match(pattern);
                if (match?.[1]) {
                  return {
                    success: true,
                    confirmationId: match[1],
                    method: 'text-fallback',
                    timestamp: new Date(),
                    additionalData: { 
                      textMatch: confirmationText.substring(0, 200) 
                    }
                  };
                }
              }
              
              // Success keywords found but no ID extracted
              return {
                success: true,
                confirmationId: 'text-confirmed',
                method: 'text-fallback',
                timestamp: new Date(),
                additionalData: { 
                  textMatch: confirmationText.substring(0, 200) 
                }
              };
            }
          }
        } catch (e) {
          // Continue to next selector
        }
      }
    } catch (error) {
      logger.warn('Text fallback detection failed', component, { 
        error: error instanceof Error ? error.message : String(error) 
      });
    }
    return null;
  }

  /**
   * Check if text contains success keywords
   */
  private containsSuccessKeywords(text: string): boolean {
    const successKeywords = [
      'confirmed', 'successful', 'booked', 'reserved',
      'confirmation', 'thank you', 'completed', 'success',
      'bestätigt', 'erfolgreich', 'gebucht', 'reserviert',
      'buchung erfolgreich', 'booking confirmed'
    ];
    
    const lowerText = text.toLowerCase();
    return successKeywords.some(keyword => lowerText.includes(keyword.toLowerCase()));
  }

  /**
   * Get booking confirmation details
   */
  async getBookingConfirmationDetails(): Promise<{
    confirmationNumber?: string;
    court?: string;
    date?: string;
    time?: string;
    price?: string;
  }> {
    const component = 'CheckoutPage.getBookingConfirmationDetails';

    try {
      await this.waitForElement(this.selectors.bookingConfirmation);

      const confirmationText = await this.getText(this.selectors.bookingConfirmation);

      // Extract confirmation details using regex patterns
      const confirmationNumber = confirmationText.match(
        /confirmation\s*(?:number|#)?\s*:?\s*([A-Z0-9]+)/i
      )?.[1];
      const court = confirmationText.match(/court\s*:?\s*([A-Z0-9\s]+)/i)?.[1];
      const date = confirmationText.match(/date\s*:?\s*(\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4})/i)?.[1];
      const time = confirmationText.match(/time\s*:?\s*(\d{1,2}:\d{2})/i)?.[1];
      const price = confirmationText.match(
        /(?:price|total|amount)\s*:?\s*([€$]\d+(?:[.,]\d{2})?)/i
      )?.[1];

      const details = {
        ...(confirmationNumber && { confirmationNumber }),
        ...(court && { court }),
        ...(date && { date }),
        ...(time && { time }),
        ...(price && { price }),
      };

      logger.info('Extracted booking confirmation details', component, details);
      return details;
    } catch (error) {
      logger.error('Error extracting confirmation details', component, {
        error: error instanceof Error ? error.message : String(error),
      });
      return {};
    }
  }
}
