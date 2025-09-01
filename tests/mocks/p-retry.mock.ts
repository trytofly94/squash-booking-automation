/**
 * Mock for p-retry module to enable testing without actual retry delays
 * Provides controllable retry behavior for unit tests
 */

export class AbortError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AbortError';
  }
}

/**
 * Mock p-retry function that can be controlled for testing
 */
export default function pRetry<T>(
  input: (attemptCount: number) => Promise<T> | T,
  options: {
    retries?: number;
    factor?: number;
    minTimeout?: number;
    maxTimeout?: number;
    randomize?: boolean;
    onFailedAttempt?: (error: any) => void;
  } = {}
): Promise<T> {
  const { retries = 2, onFailedAttempt } = options;
  let lastError: Error;
  
  return new Promise<T>(async (resolve, reject) => {
    for (let attempt = 1; attempt <= retries + 1; attempt++) {
      try {
        const result = await Promise.resolve(input(attempt));
        resolve(result);
        return;
      } catch (error: any) {
        lastError = error;
        
        // If it's an AbortError, stop retrying immediately
        if (error instanceof AbortError) {
          reject(error);
          return;
        }
        
        // If this was the last attempt, reject
        if (attempt === retries + 1) {
          reject(lastError);
          return;
        }
        
        // Add retry information to error for onFailedAttempt callback
        const errorWithInfo = {
          ...error,
          attemptNumber: attempt,
          retriesLeft: retries - attempt + 1
        };
        
        // Call onFailedAttempt callback if provided
        if (onFailedAttempt) {
          try {
            onFailedAttempt(errorWithInfo);
          } catch (callbackError) {
            // Ignore callback errors in mock
          }
        }
        
        // In mock, we don't add actual delays for faster test execution
        // Real p-retry would wait here based on backoff strategy
      }
    }
  });
}

/**
 * Export the mock as both default and named export for compatibility
 */
export { pRetry };