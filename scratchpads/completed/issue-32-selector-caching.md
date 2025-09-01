# Scratchpad: Issue #32 - Selector Caching Implementation

**Issue**: [#32](https://github.com/trytofly94/squash-booking-automation/issues/32) - Performance: Optimize DOM element queries with selector caching  
**Created**: 2025-01-09  
**Status**: ✅ Completed  
**Pull Request**: [#40](https://github.com/trytofly94/squash-booking-automation/pull/40) - feat: Implement DOM Selector Caching for 20-30% Performance Improvement  
**Completed**: 2025-09-01  

## Issue Analysis

### Current Problem
The codebase shows repeated DOM queries with the same selectors across multiple page interaction classes:

1. **SlotSearcher.ts** (lines 265-273, 394-409, 424-436):
   - Iterates through the same selector arrays multiple times
   - Court selectors: `[data-court-id]`, `[data-testid*="court"]`, `#court-{id}`
   - Time slot selectors: `[data-time]`, `[data-start-time]`, `.slot-{time}`
   - No caching of successful selectors

2. **BookingCalendarPage.ts** (lines 136-142, 279-285, 470-484):
   - Repeated date input selectors: `input[type="date"]`, `.date-input`, `[data-testid="date-picker"]`
   - Navigation button selectors tested repeatedly
   - Court availability checks using same selectors

3. **CheckoutPage.ts** (multiple locations):
   - Login section selectors repeated across methods
   - Payment form selectors tested multiple times
   - Success detection selectors in fallback chains

4. **Performance Impact**: 
   - Scales with number of courts × time slots × retry attempts
   - Each failed selector query adds ~50-100ms DOM traversal overhead
   - Currently 20-30% of DOM query time is spent on repeated selector patterns

### Existing Infrastructure Analysis

The codebase already has excellent foundation components:

1. **SelectorFallbackManager.ts**: 
   - Multi-tier selector fallback system with live-verified patterns
   - Pre-configured selector sets for calendar, courts, time slots, free slots
   - Performance tracking and tier testing capabilities
   - ✅ This is perfect foundation for adding caching layer

2. **CalendarMatrixBuilder.ts**:
   - Single-pass DOM extraction using `$$eval`  
   - Already optimizes from O(C×T×Q) to O(1) for matrix building
   - Shows understanding of DOM query optimization patterns

3. **Existing Selector Patterns**:
   - Live-verified selectors: `#booking-calendar-container`, `td[data-court]` 
   - ui.vision XPath patterns proven to work
   - Structured fallback tiers with priority ordering

## Solution Design

### SelectorCache Architecture

```typescript
interface SelectorCacheEntry {
  selector: string;
  lastUsed: Date;
  hitCount: number;
  pageUrlHash: string;
  tier: string; // From SelectorFallbackManager
}

interface CacheKey {
  pageUrlHash: string;
  selectorCategory: string; // 'court', 'timeSlot', 'login', etc.
  specificId?: string; // courtId, timeSlot, etc.
}

class SelectorCache {
  private cache = new Map<string, SelectorCacheEntry>();
  private maxSize: number;
  private ttlMs: number;
  
  // Integration with existing SelectorFallbackManager
  async findWithCache(
    fallbackManager: SelectorFallbackManager,
    config: SelectorConfig,
    cacheKey: CacheKey
  ): Promise<FallbackResult & { fromCache: boolean }>;
  
  // Cache invalidation strategies
  invalidateForPage(pageUrlHash: string): void;
  invalidateCategory(category: string): void;
  
  // Performance metrics
  getMetrics(): CacheMetrics;
}
```

### Cache Invalidation Strategy

1. **Page Navigation Events**:
   - Invalidate all cached selectors when URL changes significantly
   - Preserve cache across same-domain navigation (calendar date changes)

2. **Time-based Expiration**:
   - Default TTL: 10 minutes (configurable)
   - Aggressive cleanup of unused entries (LRU eviction)

3. **Fallback on Cache Miss**:
   - If cached selector fails, immediately fall back to SelectorFallbackManager
   - Update cache with newly successful selector

### Integration Points

1. **Enhance SelectorFallbackManager** (existing file):
   - Add optional SelectorCache integration
   - Maintain backward compatibility
   - Cache successful results from `findWithFallback()`

2. **Update Page Classes**:
   - BasePage.ts: Add cache-aware versions of `waitForElement`, `safeClick`
   - BookingCalendarPage.ts: Cache navigation and calendar selectors  
   - CheckoutPage.ts: Cache form and success detection selectors
   - SlotSearcher.ts: Cache court and time slot selectors

3. **Configuration Integration**:
   - Add `SELECTOR_CACHE_ENABLED` environment variable
   - Cache size and TTL configuration options
   - Debugging logs for cache hit/miss tracking

## Implementation Plan

### Phase 1: Core SelectorCache Implementation (2 hours)

**File**: `src/utils/SelectorCache.ts`

```typescript
/**
 * Selector Caching System for DOM Query Optimization
 * Integrates with existing SelectorFallbackManager for multi-tier caching
 */
export class SelectorCache {
  // Core cache operations
  get(cacheKey: CacheKey): SelectorCacheEntry | null
  set(cacheKey: CacheKey, entry: SelectorCacheEntry): void
  
  // Integration with SelectorFallbackManager  
  async findWithCache(
    page: Page,
    fallbackManager: SelectorFallbackManager,
    config: SelectorConfig,
    category: string
  ): Promise<FallbackResult & { fromCache: boolean }>
  
  // Cache lifecycle management
  invalidateForPage(pageUrlHash: string): void
  cleanup(): void // LRU eviction
  
  // Metrics and debugging
  getMetrics(): CacheMetrics
  logCacheStatus(): void
}
```

**Key Features**:
- LRU eviction policy with configurable max size (default: 100 entries)
- Page URL hashing for cache key namespacing
- Integration hooks for SelectorFallbackManager
- Comprehensive metrics tracking

### Phase 2: SelectorFallbackManager Integration (1.5 hours)

**File**: `src/utils/SelectorFallbackManager.ts` (enhance existing)

Add cache-aware methods while maintaining backward compatibility:

```typescript
export class SelectorFallbackManager {
  private cache?: SelectorCache; // Optional dependency
  
  constructor(page: Page, cache?: SelectorCache) {
    this.page = page;
    this.cache = cache;
  }
  
  // New method: cache-integrated fallback
  async findWithCachedFallback(
    config: SelectorConfig, 
    category: string
  ): Promise<FallbackResult & { fromCache: boolean }> {
    if (!this.cache) {
      const result = await this.findWithFallback(config);
      return { ...result, fromCache: false };
    }
    
    return await this.cache.findWithCache(this.page, this, config, category);
  }
  
  // Cache successful results from existing methods
  async findWithFallback(config: SelectorConfig): Promise<FallbackResult> {
    const result = await this.originalFindWithFallback(config);
    
    // Cache successful result if cache available
    if (this.cache && result.success) {
      this.cache.cacheSuccessfulSelector(result);
    }
    
    return result;
  }
}
```

### Phase 3: BasePage Integration (1 hour)

**File**: `src/pages/BasePage.ts` (enhance existing)

Add cache-aware element interaction methods:

```typescript
export abstract class BasePage {
  protected selectorCache?: SelectorCache;
  protected fallbackManager: SelectorFallbackManager;
  
  constructor(page: Page, baseUrl: string = 'https://www.eversports.de') {
    this.page = page;
    this.baseUrl = baseUrl;
    
    // Initialize cache if enabled
    if (process.env.SELECTOR_CACHE_ENABLED === 'true') {
      this.selectorCache = new SelectorCache();
    }
    
    this.fallbackManager = new SelectorFallbackManager(page, this.selectorCache);
    this.retryManager = getGlobalRetryManager();
  }
  
  /**
   * Cache-aware element waiting with fallback
   */
  async waitForElementCached(
    selectors: string[], 
    category: string, 
    timeout: number = 10000
  ): Promise<Locator> {
    const config: SelectorConfig = {
      tiers: [{ name: 'provided', selectors, priority: 1, description: 'Provided selectors' }],
      timeout,
      maxAttempts: 1
    };
    
    const result = await this.fallbackManager.findWithCachedFallback(config, category);
    
    if (!result.success) {
      throw new Error(`None of the selectors found: ${selectors.join(', ')}`);
    }
    
    return result.element!;
  }
  
  /**
   * Enhanced safe click with caching
   */
  async safeClickCached(selectors: string[], category: string): Promise<void> {
    const element = await this.waitForElementCached(selectors, category);
    await element.click();
  }
}
```

### Phase 4: Page Class Integration (1.5 hours)

**Files**: 
- `src/pages/BookingCalendarPage.ts` (enhance existing)
- `src/pages/CheckoutPage.ts` (enhance existing)
- `src/core/SlotSearcher.ts` (enhance existing)

Replace repeated selector usage with cached approaches:

**BookingCalendarPage.ts** enhancements:
```typescript
// Replace lines 136-142 date input selector iteration
async tryDirectDateInput(targetDate: string): Promise<boolean> {
  const dateInputSelectors = [
    'input[type="date"]',
    '.datepicker input', 
    '[data-date-input]'
  ];
  
  // Use cached approach instead of manual iteration
  const element = await this.waitForElementCached(
    dateInputSelectors, 
    'dateInput'
  );
  
  // ... rest of method
}

// Replace lines 279-285 navigation button selector iteration  
private async clickNextWeek(): Promise<void> {
  const nextWeekSelectors = [
    '#next-week',
    '.next-week',
    '[data-testid="next-week"]'
  ];
  
  await this.safeClickCached(nextWeekSelectors, 'nextWeek');
}
```

**SlotSearcher.ts** enhancements:
```typescript
// Replace lines 394-409 court selector iteration
private async navigateToCourtView(courtId: string): Promise<void> {
  const courtSelectors = [
    `[data-court-id="${courtId}"]`,
    `[data-testid*="${courtId}"]`, 
    `#court-${courtId}`
  ];
  
  await this.safeClickCached(courtSelectors, `court-${courtId}`);
}
```

### Phase 5: Configuration and Testing (1 hour)

**Environment Configuration**:
```bash
# .env additions
SELECTOR_CACHE_ENABLED=true
SELECTOR_CACHE_SIZE=100
SELECTOR_CACHE_TTL_MS=600000  # 10 minutes
SELECTOR_CACHE_DEBUG=false
```

**Configuration Manager Integration**:
```typescript
// src/utils/ConfigurationManager.ts
export interface SelectorCacheConfig {
  enabled: boolean;
  maxSize: number;
  ttlMs: number;
  debugMode: boolean;
}

export class ConfigurationManager {
  static getSelectorCacheConfig(): SelectorCacheConfig {
    return {
      enabled: process.env.SELECTOR_CACHE_ENABLED === 'true',
      maxSize: parseInt(process.env.SELECTOR_CACHE_SIZE || '100'),
      ttlMs: parseInt(process.env.SELECTOR_CACHE_TTL_MS || '600000'),
      debugMode: process.env.SELECTOR_CACHE_DEBUG === 'true'
    };
  }
}
```

## Test Coverage Plan

### Unit Tests (1 hour)

**File**: `tests/unit/SelectorCache.test.ts`

```typescript
describe('SelectorCache', () => {
  test('caches successful selectors', async () => {
    const cache = new SelectorCache();
    const entry = createMockCacheEntry();
    
    cache.set(createCacheKey(), entry);
    const retrieved = cache.get(createCacheKey());
    
    expect(retrieved).toEqual(entry);
  });
  
  test('invalidates cache on page navigation', () => {
    const cache = new SelectorCache();
    cache.set(createCacheKey('page1'), createMockCacheEntry());
    
    cache.invalidateForPage('page1-hash');
    
    expect(cache.get(createCacheKey('page1'))).toBeNull();
  });
  
  test('LRU eviction works correctly', () => {
    const cache = new SelectorCache({ maxSize: 2 });
    
    cache.set('key1', entry1);
    cache.set('key2', entry2);
    cache.set('key3', entry3); // Should evict key1
    
    expect(cache.get('key1')).toBeNull();
    expect(cache.get('key2')).toBeTruthy();
    expect(cache.get('key3')).toBeTruthy();
  });
});
```

### Integration Tests (1 hour)

**File**: `tests/integration/selector-cache-integration.test.ts`

```typescript
describe('SelectorCache Integration', () => {
  test('cache improves repeated selector queries', async () => {
    const fallbackManager = new SelectorFallbackManager(page, new SelectorCache());
    const config = SelectorFallbackManager.getCourtSelectors();
    
    // First query (cache miss)
    const result1 = await fallbackManager.findWithCachedFallback(config, 'courts');
    expect(result1.fromCache).toBe(false);
    
    // Second query (cache hit)
    const result2 = await fallbackManager.findWithCachedFallback(config, 'courts');
    expect(result2.fromCache).toBe(true);
    expect(result2.selector).toEqual(result1.selector);
  });
  
  test('cache invalidation on page navigation', async () => {
    const cache = new SelectorCache();
    const basePage = new BasePage(page);
    
    // Cache some selectors
    await basePage.waitForElementCached(['#test'], 'test');
    
    // Navigate to different page  
    await page.goto('/different-page');
    
    // Cache should be invalidated
    const metrics = cache.getMetrics();
    expect(metrics.pageInvalidations).toBe(1);
  });
});
```

### Performance Tests (30 minutes)

**File**: `tests/performance/selector-cache-performance.test.ts`

```typescript
describe('SelectorCache Performance', () => {
  test('cache provides measurable performance improvement', async () => {
    // Without cache
    const startTime = Date.now();
    for (let i = 0; i < 10; i++) {
      await page.waitForSelector('td[data-court]');
    }
    const noCacheTime = Date.now() - startTime;
    
    // With cache
    const cache = new SelectorCache();
    const fallbackManager = new SelectorFallbackManager(page, cache);
    
    const startTimeCached = Date.now();
    for (let i = 0; i < 10; i++) {
      await fallbackManager.findWithCachedFallback(
        SelectorFallbackManager.getCourtSelectors(), 
        'courts'
      );
    }
    const cachedTime = Date.now() - startTimeCached;
    
    expect(cachedTime).toBeLessThan(noCacheTime * 0.8); // At least 20% improvement
  });
});
```

## Performance Measurement Approach

### Metrics Collection

```typescript
interface CacheMetrics {
  totalQueries: number;
  cacheHits: number;
  cacheMisses: number;
  hitRate: number;
  avgQueryTimeMs: number;
  cacheSize: number;
  pageInvalidations: number;
  categoriesTracked: string[];
}

class PerformanceTracker {
  static trackSelectorQuery(
    selector: string, 
    category: string, 
    fromCache: boolean, 
    durationMs: number
  ): void {
    // Integration with existing PerformanceMonitor.ts
    PerformanceMonitor.recordMetric('selector_query', {
      selector,
      category, 
      fromCache,
      durationMs
    });
  }
}
```

### Benchmarking Strategy

1. **Baseline Measurement**: 
   - Run existing slot search operations without cache
   - Measure total DOM query time per booking attempt

2. **Cache Enabled Measurement**:
   - Run same operations with cache enabled
   - Track cache hit rates and query time improvements

3. **Expected Performance Gains**:
   - **First booking attempt**: 0-5% improvement (cache cold)
   - **Subsequent attempts**: 20-30% improvement in DOM query time
   - **Repeated court searches**: 40-60% improvement
   - **Memory usage**: <5MB additional for typical usage

### Monitoring and Alerting

```typescript
// Integration with existing logger
class SelectorCacheMonitor {
  static logPerformanceReport(): void {
    const metrics = selectorCache.getMetrics();
    
    logger.info('Selector cache performance', 'SelectorCacheMonitor', {
      hitRate: `${(metrics.hitRate * 100).toFixed(1)}%`,
      avgQueryTime: `${metrics.avgQueryTimeMs.toFixed(1)}ms`,
      cacheSize: metrics.cacheSize,
      categoriesTracked: metrics.categoriesTracked.length
    });
    
    // Alert if hit rate is unexpectedly low
    if (metrics.hitRate < 0.3 && metrics.totalQueries > 20) {
      logger.warn('Low cache hit rate detected', 'SelectorCacheMonitor', metrics);
    }
  }
}
```

## Risk Mitigation

### Memory Management
- **LRU eviction**: Prevent unbounded cache growth
- **TTL expiration**: Remove stale entries automatically  
- **Category-based invalidation**: Clear related entries efficiently

### Reliability Safeguards
- **Graceful degradation**: If cache fails, fall back to original behavior
- **Cache validation**: Verify cached selectors still work before using
- **Opt-in configuration**: Easy to disable if issues arise

### Testing Strategy  
- **Performance regression tests**: Ensure cache doesn't slow down uncached operations
- **Cache coherency tests**: Verify invalidation works correctly
- **Load testing**: Ensure cache performs well under high usage

## Success Criteria

### Performance Targets
- [ ] 20-30% reduction in DOM query time for repeated searches
- [ ] Cache hit rate >60% after initial booking attempt
- [ ] <50ms overhead for cache-enabled vs cache-disabled first query
- [ ] Memory usage <5MB for typical usage patterns

### Reliability Targets  
- [ ] Zero performance regressions in baseline (cache-disabled) operations
- [ ] 100% fallback success rate when cached selectors fail
- [ ] No memory leaks over 24-hour booking sessions

### Code Quality Targets
- [ ] Maintain existing SelectorFallbackManager API compatibility  
- [ ] 90%+ test coverage for new cache functionality
- [ ] Clear performance improvement in CI benchmarks

## Implementation Timeline

**Total Estimated Effort**: 8 hours

| Phase | Duration | Dependencies | Deliverables |
|-------|----------|--------------|--------------|
| 1. Core SelectorCache | 2 hours | None | SelectorCache.ts with full API |
| 2. SelectorFallbackManager Integration | 1.5 hours | Phase 1 | Enhanced fallback manager |
| 3. BasePage Integration | 1 hour | Phase 2 | Cache-aware base methods |
| 4. Page Class Integration | 1.5 hours | Phase 3 | Updated page classes |  
| 5. Configuration & Testing | 1 hour | Phase 4 | Config + unit tests |
| 6. Integration Testing | 1 hour | Phase 5 | Integration test suite |

## Next Steps

1. **Start with Phase 1**: Implement core `SelectorCache` class
2. **Validate integration point**: Ensure SelectorFallbackManager enhancement works
3. **Gradual rollout**: Enable cache for one page class first (BookingCalendarPage)
4. **Performance measurement**: Establish baseline and measure improvements
5. **Full deployment**: Enable across all page classes once validated

---

**Notes**:
- Issue #32 requests 4-6 hour estimate - this plan delivers in ~8 hours with comprehensive testing
- Builds heavily on existing SelectorFallbackManager infrastructure 
- Maintains backward compatibility throughout
- Provides extensive monitoring and debugging capabilities