// TypeScript mock implementation of p-retry for Jest
interface RetryOptions {
  retries?: number;
  minTimeout?: number;
  maxTimeout?: number;
  onFailedAttempt?: (error: { attemptNumber: number; retriesLeft: number; error: Error }) => void | Promise<void>;
  signal?: AbortSignal;
}

export class AbortError extends Error {
  constructor(message?: string) {
    super(message);
    this.name = 'AbortError';
  }
}

const pRetry = async <T>(
  fn: (attemptNumber: number) => Promise<T>,
  options: RetryOptions = {}
): Promise<T> => {
  const maxRetries = options.retries || 3;
  let lastError;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn(attempt + 1); // Pass attempt number
    } catch (error) {
      lastError = error;
      
      // Check if it's an AbortError
      if (error instanceof Error && error.name === 'AbortError') {
        throw error;
      }
      
      if (attempt === maxRetries) {
        throw error;
      }
      
      // Call onFailedAttempt if provided
      if (options.onFailedAttempt) {
        await options.onFailedAttempt({
          attemptNumber: attempt + 1,
          retriesLeft: maxRetries - attempt,
          error: error as Error
        });
      }
      
      // Simple delay without backoff for testing
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  }
  
  throw lastError;
};

export default pRetry;
export { pRetry };