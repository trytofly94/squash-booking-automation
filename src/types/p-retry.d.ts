declare module 'p-retry' {
  export class AbortError extends Error {
    constructor(message?: string);
  }

  export interface RetryOptions {
    retries?: number;
    minTimeout?: number;
    maxTimeout?: number;
    onFailedAttempt?: (error: { attemptNumber: number; retriesLeft: number; error: Error }) => void | Promise<void>;
    signal?: AbortSignal;
  }

  export default function pRetry<T>(
    input: (attemptNumber: number) => Promise<T>,
    options?: RetryOptions
  ): Promise<T>;
}