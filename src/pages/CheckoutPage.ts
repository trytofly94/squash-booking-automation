import { Page } from '@playwright/test';
import { BasePage } from './BasePage';
import { logger } from '../utils/logger';

/**
 * Page Object for the checkout and booking confirmation process
 */
export class CheckoutPage extends BasePage {
  private readonly selectors = {
    // Checkout navigation
    checkoutButton: '[data-testid="checkout"], .checkout-btn, .btn-checkout, button:has-text("Checkout")',
    proceedButton: '[data-testid="proceed"], .proceed-btn, .btn-proceed, button:has-text("Proceed")',
    
    // Login section
    loginSection: '.login-section, .auth-section, [data-testid="login"]',
    emailInput: 'input[type="email"], #email, [data-testid="email"]',
    passwordInput: 'input[type="password"], #password, [data-testid="password"]',
    loginButton: 'button[type="submit"], .login-btn, [data-testid="login-submit"]',
    
    // Guest checkout
    guestCheckoutButton: '.guest-checkout, [data-testid="guest-checkout"], button:has-text("Guest")',
    
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
    confirmBookingButton: '.confirm-booking, [data-testid="confirm-booking"], button:has-text("Confirm")',
    bookingConfirmation: '.booking-confirmation, .success-message, [data-testid="booking-confirmation"]',
    
    // Error handling
    errorMessage: '.error-message, .alert-error, [data-testid="error"]',
    fieldError: '.field-error, .input-error, .validation-error',
    
    // Loading states
    loading: '.loading, .spinner, [data-testid="loading"]',
    processingPayment: '.payment-processing, [data-testid="payment-processing"]'
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
      const checkoutSelectors = [
        this.selectors.checkoutButton,
        this.selectors.proceedButton
      ];
      
      const foundSelector = await this.waitForAnySelector(checkoutSelectors);
      await this.safeClick(foundSelector);
      await this.waitForNavigation();
      
      logger.info('Successfully proceeded to checkout', component);
    } catch (error) {
      logger.error('Error proceeding to checkout', component, { error: error.message });
      throw error;
    }
  }

  /**
   * Check if user is already logged in
   */
  async isUserLoggedIn(): Promise<boolean> {
    try {
      // If login section is not present, user is likely logged in
      return !await this.elementExists(this.selectors.loginSection, 3000);
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
      logger.error('Login failed', component, { error: error.message });
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
      logger.error('Error proceeding as guest', component, { error: error.message });
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
      email: info.email.replace(/.(?=.{4})/g, '*')
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
      
      if (info.phone && await this.elementExists(this.selectors.phoneInput)) {
        await this.safeFill(this.selectors.phoneInput, info.phone);
      }
      
      logger.info('Personal information filled successfully', component);
    } catch (error) {
      logger.error('Error filling personal information', component, { error: error.message });
      throw error;
    }
  }

  /**
   * Validate booking summary
   */
  async validateBookingSummary(expectedCourt: string, expectedTime: string, expectedDate: string): Promise<boolean> {
    const component = 'CheckoutPage.validateBookingSummary';
    
    logger.info('Validating booking summary', component, {
      expectedCourt,
      expectedTime,
      expectedDate
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
          match: courtText.includes(expectedCourt)
        };
        if (!validationResults.court.match) validationPassed = false;
      }
      
      // Validate time information
      if (await this.elementExists(this.selectors.timeInfo)) {
        const timeText = await this.getText(this.selectors.timeInfo);
        validationResults.time = {
          expected: expectedTime,
          actual: timeText,
          match: timeText.includes(expectedTime)
        };
        if (!validationResults.time.match) validationPassed = false;
      }
      
      logger.info('Booking summary validation completed', component, {
        validationPassed,
        results: validationResults
      });
      
      return validationPassed;
    } catch (error) {
      logger.error('Error validating booking summary', component, { error: error.message });
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
      cardNumber: paymentInfo.cardNumber.replace(/.(?=.{4})/g, '*')
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
      logger.error('Error filling payment information', component, { error: error.message });
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
      logger.error('Error accepting terms and conditions', component, { error: error.message });
      throw error;
    }
  }

  /**
   * Complete the booking (final confirmation)
   */
  async confirmBooking(): Promise<boolean> {
    const component = 'CheckoutPage.confirmBooking';
    
    logger.info('Confirming booking', component);
    
    try {
      // Click confirm booking button
      await this.safeClick(this.selectors.confirmBookingButton);
      
      // Wait for payment processing
      if (await this.elementExists(this.selectors.processingPayment, 3000)) {
        await this.page.locator(this.selectors.processingPayment).waitFor({ state: 'hidden', timeout: 30000 });
      }
      
      // Check for booking confirmation
      const confirmationExists = await this.elementExists(this.selectors.bookingConfirmation, 15000);
      
      if (confirmationExists) {
        logger.info('Booking confirmed successfully', component);
        return true;
      } else {
        // Check for error messages
        if (await this.elementExists(this.selectors.errorMessage)) {
          const errorText = await this.getText(this.selectors.errorMessage);
          throw new Error(`Booking confirmation failed: ${errorText}`);
        }
        
        throw new Error('Booking confirmation not received');
      }
    } catch (error) {
      logger.error('Error confirming booking', component, { error: error.message });
      return false;
    }
  }

  /**
   * Complete the entire checkout process
   */
  async completeCheckout(options: {
    userCredentials?: { email: string; password: string };
    guestInfo?: { firstName: string; lastName: string; email: string; phone?: string };
    paymentInfo?: { cardNumber: string; expiry: string; cvc: string };
    dryRun?: boolean;
  } = {}): Promise<boolean> {
    const component = 'CheckoutPage.completeCheckout';
    
    logger.info('Starting complete checkout process', component, {
      hasCredentials: !!options.userCredentials,
      hasGuestInfo: !!options.guestInfo,
      hasPayment: !!options.paymentInfo,
      dryRun: options.dryRun || false
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
        return await this.confirmBooking();
      }
    } catch (error) {
      logger.error('Checkout process failed', component, { error: error.message });
      return false;
    }
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
      const confirmationNumber = confirmationText.match(/confirmation\s*(?:number|#)?\s*:?\s*([A-Z0-9]+)/i)?.[1];
      const court = confirmationText.match(/court\s*:?\s*([A-Z0-9\s]+)/i)?.[1];
      const date = confirmationText.match(/date\s*:?\s*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/i)?.[1];
      const time = confirmationText.match(/time\s*:?\s*(\d{1,2}:\d{2})/i)?.[1];
      const price = confirmationText.match(/(?:price|total|amount)\s*:?\s*([€$]\d+(?:[.,]\d{2})?)/i)?.[1];
      
      const details = { confirmationNumber, court, date, time, price };
      
      logger.info('Extracted booking confirmation details', component, details);
      return details;
    } catch (error) {
      logger.error('Error extracting confirmation details', component, { error: error.message });
      return {};
    }
  }
}