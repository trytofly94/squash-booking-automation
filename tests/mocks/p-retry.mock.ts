/**
 * Mock for p-retry module
 * Provides simplified retry functionality for testing
 */

export class AbortError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AbortError';
  }
}

const mockRetry = jest.fn().mockImplementation(async (fn: () => any, options: any = {}) => {
  const maxAttempts = options.retries || 3;
  let lastError: any;
  
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (error instanceof AbortError) {
        throw error;
      }
      if (options.onFailedAttempt) {
        options.onFailedAttempt(error);
      }
    }
  }
  
  throw lastError;
});

export default mockRetry;