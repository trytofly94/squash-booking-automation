// Mock implementation of p-retry for Jest
const pRetry = async (fn, options = {}) => {
  const maxRetries = options.retries || 3;
  let lastError;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt === maxRetries) {
        throw error;
      }
      // Simple delay without backoff for testing
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  }
  
  throw lastError;
};

class AbortError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AbortError';
  }
}

module.exports = pRetry;
module.exports.default = pRetry;
module.exports.AbortError = AbortError;