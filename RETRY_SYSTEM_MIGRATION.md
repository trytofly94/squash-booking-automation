# Retry System Migration Guide

## Overview
This guide covers the migration from the primitive retry logic to the new robust retry system with p-retry integration, circuit breaker pattern, and error-specific strategies.

## What Changed

### Before (Primitive Retry System)
```typescript
// Old BookingManager retry logic
while (attempt < this.config.maxRetries) {
  attempt++;
  try {
    const result = await this.attemptBooking();
    if (result.success) {
      return result;
    }
    // Simple exponential backoff
    const waitTime = Math.pow(2, attempt) * 1000;
    await this.page.waitForTimeout(waitTime);
  } catch (error) {
    if (attempt < this.config.maxRetries) {
      await this.page.waitForTimeout(2000);
    }
  }
}
```

### After (Robust Retry System)
```typescript
// New RetryManager with p-retry integration
const retryResult = await this.retryManager.execute(
  () => this.attemptBookingWithValidation(),
  'booking-process'
);
```

## New Architecture

### Core Components
```
src/core/retry/
├── RetryManager.ts          # Main orchestrator with p-retry
├── RetryStrategies.ts       # Error-specific strategies
├── CircuitBreaker.ts        # Circuit breaker implementation
└── index.ts                 # Exports and global instance
```

### Key Features
1. **p-retry Integration**: Professional retry library with advanced features
2. **Circuit Breaker**: Prevents cascading failures
3. **Error Classification**: Different strategies for different error types
4. **Exponential Backoff with Jitter**: Prevents thundering herd
5. **Comprehensive Monitoring**: Integration with existing monitoring system

## Configuration Changes

### New Environment Variables
```bash
# Retry Configuration
RETRY_ENABLED=true
RETRY_MAX_ATTEMPTS=5
RETRY_MIN_DELAY=1000
RETRY_MAX_DELAY=30000
RETRY_JITTER_ENABLED=true

# Circuit Breaker Configuration  
CIRCUIT_BREAKER_FAILURE_THRESHOLD=5
CIRCUIT_BREAKER_RECOVERY_TIMEOUT=60000
CIRCUIT_BREAKER_REQUEST_VOLUME_THRESHOLD=10

# Error-specific Retry Settings
RETRY_NETWORK_ATTEMPTS=5
RETRY_RATE_LIMIT_ATTEMPTS=3
RETRY_SERVER_ERROR_ATTEMPTS=2
RETRY_TIMEOUT_ATTEMPTS=4

# Advanced Features
RETRY_EXPONENTIAL_BACKOFF=true
RETRY_EXPONENTIAL_BASE=2
RETRY_ABORT_ON_CLIENT_ERRORS=true
```

## Breaking Changes

### 1. BookingResult Interface
The `retryAttempts` field is now correctly populated with actual retry attempts made by the p-retry system.

### 2. Error Handling
- Client errors (4xx) now abort immediately by default
- Different error types use different retry strategies
- Circuit breaker can reject requests when open

### 3. Page Object Methods
BasePage methods like `safeClick()` no longer accept a `retries` parameter - they use the global retry configuration instead.

```typescript
// Before
await basePage.safeClick('#button', 5);

// After  
await basePage.safeClick('#button'); // Uses global retry config
```

## Migration Steps

### 1. Update Configuration
Copy new environment variables from `.env.example` to your `.env` file.

### 2. Code Changes (if any custom retry logic)
Replace manual retry loops with RetryManager:

```typescript
// Before
for (let i = 0; i < maxRetries; i++) {
  try {
    const result = await operation();
    return result;
  } catch (error) {
    if (i === maxRetries - 1) throw error;
    await delay(1000 * Math.pow(2, i));
  }
}

// After
import { getGlobalRetryManager } from '@/core/retry';

const retryManager = getGlobalRetryManager();
const result = await retryManager.executeWithBackoff(operation, 'operation-name');
```

### 3. Test Updates
Some tests may need updates due to changed error handling behavior.

## Error Strategy Reference

| Error Type | Default Attempts | Strategy | Jitter | Notes |
|------------|------------------|----------|---------|--------|
| Network | 5 | Exponential backoff | Yes | ECONNRESET, ENOTFOUND, etc. |
| Rate Limit (429) | 3 | Longer delays | Yes | Respects rate limiting |
| Server Error (5xx) | 2 | Conservative retry | No | Internal server errors |
| Timeout | 4 | Quick retry | Yes | Request/navigation timeouts |
| Client Error (4xx) | 0 | No retry | No | Aborts immediately |
| Authentication | 1 | Single retry | No | 401, 403 errors |

## Circuit Breaker Behavior

- **CLOSED**: Normal operation, requests pass through
- **OPEN**: High failure rate detected, requests rejected immediately  
- **HALF_OPEN**: Testing recovery, limited requests allowed

Default thresholds:
- Failure threshold: 5 consecutive failures
- Recovery timeout: 60 seconds
- Request volume threshold: 10 requests minimum for statistics

## Monitoring Integration

The retry system integrates with existing monitoring:
- Correlation IDs propagated through retry attempts
- Performance metrics tracked for each retry
- Circuit breaker state included in health checks
- Structured error logging with retry context

## Troubleshooting

### Common Issues

1. **Too many retries**: Adjust `RETRY_MAX_ATTEMPTS` or error-specific attempts
2. **Circuit breaker opening**: Check `CIRCUIT_BREAKER_FAILURE_THRESHOLD` 
3. **Slow performance**: Review delay settings and jitter configuration
4. **Client errors being retried**: Ensure `RETRY_ABORT_ON_CLIENT_ERRORS=true`

### Debug Configuration
```bash
# Enable detailed retry logging
LOG_LEVEL=debug
LOG_PERFORMANCE=true
LOG_CORRELATION_ID=true
```

## Performance Considerations

- Jitter prevents thundering herd but adds randomness to delays
- Circuit breaker reduces load during failures but may reject valid requests
- Correlation ID tracking adds minimal overhead
- Performance monitoring measures retry impact

## Testing

The system includes comprehensive test coverage:
- Unit tests for individual components
- Integration tests for end-to-end scenarios  
- Performance tests for high-concurrency situations
- Circuit breaker state transition tests

Run retry-specific tests:
```bash
npm test -- --testPathPattern=retry
```

## Future Enhancements

Planned improvements:
1. Prometheus metrics integration
2. Custom retry strategies per operation type
3. Adaptive retry timing based on success rates
4. Dashboard for retry system monitoring