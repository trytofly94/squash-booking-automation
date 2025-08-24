import type { Page } from '@playwright/test';
import { logger } from './logger';

/**
 * Network response listener for booking confirmation detection
 * Monitors network responses for booking-related endpoints
 */
export class BookingResponseListener {
  private bookingResponse: any = null;
  private responsePromise: Promise<any> | null = null;
  private readonly component = 'BookingResponseListener';

  /**
   * Setup network monitoring to listen for booking confirmation responses
   */
  async setupNetworkMonitoring(page: Page): Promise<void> {
    logger.info('Setting up network monitoring for booking responses', this.component);
    
    this.responsePromise = new Promise((resolve) => {
      page.on('response', async (response) => {
        const url = response.url();
        
        // Check if this is a booking-related response
        if (this.isBookingResponse(url)) {
          logger.debug('Booking response detected', this.component, { 
            url,
            status: response.status(),
            headers: response.headers()
          });
          
          try {
            // Try to parse JSON response
            const data = await response.json();
            
            // Check for success indicators in the response
            if (this.isSuccessResponse(data)) {
              logger.info('Successful booking response detected', this.component, { 
                url,
                data: this.sanitizeResponseData(data)
              });
              resolve(data);
              return;
            }
          } catch (error) {
            // Response might not be JSON, check status code instead
            logger.debug('Non-JSON response, checking status code', this.component, { 
              url,
              status: response.status(),
              error: error instanceof Error ? error.message : String(error)
            });
            
            if (response.status() === 200 || response.status() === 201) {
              const successData = { 
                success: true, 
                statusCode: response.status(),
                url 
              };
              logger.info('Successful booking response by status code', this.component, successData);
              resolve(successData);
              return;
            }
          }
        }
      });
    });
  }

  /**
   * Check if URL indicates a booking-related endpoint
   */
  private isBookingResponse(url: string): boolean {
    const bookingPatterns = [
      '/booking',
      '/confirm',
      '/reservation',
      '/checkout',
      '/purchase',
      '/complete',
      '/finalize',
      '/payment/success'
    ];
    
    return bookingPatterns.some(pattern => 
      url.toLowerCase().includes(pattern.toLowerCase())
    );
  }

  /**
   * Check if response data indicates successful booking
   */
  private isSuccessResponse(data: any): boolean {
    if (!data || typeof data !== 'object') {
      return false;
    }

    // Check common success indicators
    const successIndicators = [
      'success',
      'confirmed',
      'booking_id',
      'bookingId',
      'confirmation',
      'confirmationNumber',
      'reservation_id',
      'reservationId',
      'order_id',
      'orderId'
    ];

    return successIndicators.some(indicator => {
      const value = data[indicator];
      return value === true || (typeof value === 'string' && value.length > 0) || 
             (typeof value === 'number' && value > 0);
    });
  }

  /**
   * Sanitize response data for logging (remove sensitive information)
   */
  private sanitizeResponseData(data: any): any {
    if (!data || typeof data !== 'object') {
      return data;
    }

    const sanitized = { ...data };
    
    // Remove sensitive fields
    const sensitiveFields = [
      'payment', 'card', 'token', 'password', 'secret',
      'creditCard', 'paymentMethod', 'billingAddress'
    ];
    
    sensitiveFields.forEach(field => {
      if (field in sanitized) {
        sanitized[field] = '[REDACTED]';
      }
    });

    return sanitized;
  }

  /**
   * Wait for a booking response with timeout
   */
  async waitForBookingResponse(timeout: number = 10000): Promise<any> {
    if (!this.responsePromise) {
      logger.warn('Network monitoring not set up, returning null', this.component);
      return null;
    }
    
    try {
      logger.debug('Waiting for booking response', this.component, { timeout });
      
      const response = await Promise.race([
        this.responsePromise,
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Network response timeout')), timeout)
        )
      ]);
      
      logger.info('Booking response received within timeout', this.component);
      return response;
    } catch (error) {
      if (error instanceof Error && error.message.includes('timeout')) {
        logger.warn('Network response timeout reached', this.component, { timeout });
      } else {
        logger.warn('Network response monitoring failed', this.component, { 
          error: error instanceof Error ? error.message : String(error)
        });
      }
      return null;
    }
  }

  /**
   * Reset the response listener for a new booking attempt
   */
  reset(): void {
    this.bookingResponse = null;
    this.responsePromise = null;
    logger.debug('Response listener reset', this.component);
  }
}