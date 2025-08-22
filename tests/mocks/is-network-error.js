// Mock implementation of is-network-error for Jest
const isNetworkError = (error) => {
  if (!error) return false;
  
  // Common network error patterns
  const networkErrorCodes = [
    'ECONNRESET',
    'ECONNREFUSED', 
    'EHOSTUNREACH',
    'ETIMEDOUT',
    'ENOTFOUND'
  ];
  
  return networkErrorCodes.includes(error.code) || 
         error.message?.includes('network') ||
         error.message?.includes('timeout') ||
         error.message?.includes('connection');
};

module.exports = isNetworkError;
module.exports.default = isNetworkError;