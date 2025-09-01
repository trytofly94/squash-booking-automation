/**
 * Mock implementation of p-retry for testing
 */

export class AbortError extends Error {
  override readonly name = 'AbortError';
  
  constructor(message: string) {
    super(message);
  }
}

// Mock p-retry function
const pRetry = jest.fn().mockImplementation(async (fn: Function, options?: any) => {
  const maxAttempts = options?.retries ?? 3;
  let lastError: Error | undefined;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      // Call onFailedAttempt callback if provided
      if (lastError && options?.onFailedAttempt) {
        const errorWithAttempt = lastError as any;
        errorWithAttempt.attemptNumber = attempt - 1;
        options.onFailedAttempt(errorWithAttempt);
      }
      
      const result = await fn(attempt);
      return result;
    } catch (error) {
      lastError = error as Error;
      
      // If it's an AbortError, don't retry
      if (error instanceof AbortError) {
        throw error;
      }
      
      // If this is the last attempt, throw the error
      if (attempt === maxAttempts) {
        const errorWithAttempt = error as any;
        errorWithAttempt.attemptNumber = attempt;
        throw error;
      }
      
      // Wait before retrying (simplified backoff)
      if (options?.minTimeout) {
        await new Promise(resolve => setTimeout(resolve, options.minTimeout));
      }
    }
  }
  
  throw lastError!;
});

export default pRetry;
export { pRetry };