# Issue #52: [P0] Cookie-Banner blockiert alle Interaktionen

## 🎯 Objective
Fix the cookie consent banner that blocks all interactions with the booking calendar by ensuring it is automatically handled at the start of the booking flow.

## 📋 Problem Analysis
Based on Issue #52 analysis and codebase review:
- **Current Problem**: Cookie consent banner appears on first page visit and overlays the entire booking interface
- **Impact**: All calendar interactions fail because the banner blocks clicks and user interactions
- **Root Cause**: Existing `handleCookieConsent()` method in `BasePage.ts` (lines 342-364) is available but not being called in the booking flow
- **Current Behavior**: The booking process starts navigation but never handles the cookie banner, causing infinite retry loops

## 🔍 Current State Analysis

### Existing Infrastructure
1. **Cookie Handling Method**: `BasePage.handleCookieConsent()` already exists (lines 342-364)
   - Contains comprehensive selectors for various cookie banner types
   - Includes German language support ('Akzeptieren', 'Accept')
   - Has proper error handling and timeout logic
   - **Issue**: Method exists but is never called in the booking flow

2. **Booking Flow Entry Point**: `BookingManager.navigateToBookingPage()` (line 679)
   - Navigates to eversports.de booking page
   - Waits for page load with `networkidle`
   - Calls `navigateToTargetDate()` but never handles cookie consent
   - **Missing**: Cookie consent handling after page load

3. **Page Navigation**: `BasePage.navigateTo()` (line 54)
   - Handles general page navigation with cache invalidation
   - Waits for page load state
   - **Missing**: Cookie consent as part of post-navigation setup

## 🔧 Implementation Strategy

### Phase 1: Integrate Cookie Consent into Booking Flow
**Primary Fix**: Call `handleCookieConsent()` immediately after page load in booking navigation

**Files to modify:**
- `src/core/BookingManager.ts`: Add cookie consent handling to `navigateToBookingPage()`
- **Optional**: `src/pages/BasePage.ts`: Enhance cookie consent method if needed

### Phase 2: Enhanced Cookie Banner Detection
**Secondary Enhancement**: Improve cookie banner detection for eversports.de specifically

**Potential additional selectors for eversports.de:**
- CMP (Consent Management Platform) specific selectors
- eversports.de specific cookie banner elements
- Overlay/modal dismissal buttons

### Phase 3: Fail-safe Integration
**Robustness**: Ensure cookie handling doesn't break existing flow

**Implementation approach:**
- Non-blocking: Cookie handling failure shouldn't stop booking process
- Timeout handling: Quick timeout to avoid delays if no banner present
- Logging: Comprehensive logging for debugging

## 📝 Detailed Implementation Plan

### Step 1: Primary Integration in BookingManager
**File**: `src/core/BookingManager.ts`
**Method**: `navigateToBookingPage()` (around line 679)

**Change to implement:**
```typescript
private async navigateToBookingPage(targetDate: string): Promise<void> {
  const component = 'BookingManager.navigateToBookingPage';

  try {
    // Navigate to the base booking URL
    const baseUrl = 'https://www.eversports.de/sb/sportcenter-kautz?sport=squash';
    await this.page.goto(baseUrl);

    logger.info('Navigated to booking page', component, { baseUrl });

    // Wait for page to load
    await this.page.waitForLoadState('networkidle');

    // Handle cookie consent banner immediately after page load
    await this.handleCookieConsentForBooking();

    // Look for date selector and navigate to target date
    await this.navigateToTargetDate(targetDate);
  } catch (error) {
    logger.error('Error navigating to booking page', component, {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

private async handleCookieConsentForBooking(): Promise<void> {
  const component = 'BookingManager.handleCookieConsentForBooking';
  
  try {
    logger.debug('Attempting to handle cookie consent for booking flow', component);
    
    // Use existing BasePage cookie handling functionality
    const basePage = new (class extends BasePage {
      constructor(page: Page) {
        super(page);
      }
    })(this.page);
    
    await basePage.handleCookieConsent();
    
    logger.info('Cookie consent handled successfully in booking flow', component);
  } catch (error) {
    // Non-blocking: Don't fail booking process if cookie handling fails
    logger.warn('Cookie consent handling failed, continuing with booking', component, {
      error: error instanceof Error ? error.message : String(error)
    });
  }
}
```

### Step 2: Enhanced BasePage Cookie Selectors (Optional)
**File**: `src/pages/BasePage.ts`
**Method**: `handleCookieConsent()` (line 342)

**Potential additional selectors specific to eversports.de:**
```typescript
const cookieSelectors = [
  // Existing selectors (keep all)
  'button[data-testid="accept-cookies"]',
  '.cookie-accept',
  '.consent-accept',
  'button:has-text("Accept")',
  'button:has-text("Akzeptieren")',
  '#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll',
  
  // Additional eversports.de specific selectors
  '.cmp-accept-all', // Common CMP selector
  '[data-cmp-ab="accept-all"]', // CMP accept all
  'button:has-text("Alle akzeptieren")', // German "Accept All"
  '.cookie-banner button:first-child', // First button in cookie banner
  '.consent-overlay button[type="button"]', // Generic consent overlay button
  '#onetrust-accept-btn-handler', // OneTrust specific
  '.uc-deny-all-button ~ .uc-accept-all-button', // Usercentrics accept all
];
```

### Step 3: Alternative BasePage Navigation Integration
**File**: `src/pages/BasePage.ts`
**Method**: `navigateTo()` (line 54)

**Optional enhancement to handle cookies on any navigation:**
```typescript
async navigateTo(path: string = ''): Promise<void> {
  const fullUrl = path.startsWith('http') ? path : `${this.baseUrl}${path}`;
  const previousUrl = this.page.url();
  const isContextReused = this.isContextReused();
  
  await this.retryManager.executeWithBackoff(async () => {
    logger.info('Navigating to URL', 'BasePage', { 
      url: fullUrl, 
      previousUrl, 
      isContextReused,
      contextAge: Date.now() - this.contextCreationTime 
    });
    
    // For reused contexts, check if we need to clear any state
    if (isContextReused && this.shouldClearContextState(previousUrl, fullUrl)) {
      await this.clearContextState();
    }
    
    await this.page.goto(fullUrl);
    await this.waitForPageLoad();
    
    // Handle cookie consent on new domain navigation
    if (this.shouldHandleCookieConsent(previousUrl, fullUrl)) {
      await this.handleCookieConsent();
    }
    
    // ... rest of existing method
  }, 'navigate-to-url');
}

private shouldHandleCookieConsent(previousUrl: string, newUrl: string): boolean {
  // Handle cookies when navigating to a new domain or first time
  const previousDomain = this.extractDomain(previousUrl);
  const newDomain = this.extractDomain(newUrl);
  
  return previousDomain !== newDomain || !previousUrl;
}
```

## 🧪 Testing Strategy

### Unit Tests
**File**: `tests/unit/BookingManager.test.ts`
- Test cookie consent integration in `navigateToBookingPage()`
- Mock `handleCookieConsent()` to verify it's called
- Test non-blocking behavior when cookie handling fails

**File**: `tests/unit/BasePage.test.ts`
- Test enhanced cookie selectors (if added)
- Test timeout behavior for cookie consent
- Test that booking flow continues if no cookie banner present

### Integration Tests  
**File**: `tests/integration/booking-flow.test.ts`
- Test complete booking flow with cookie banner simulation
- Test cookie banner blocking and successful dismissal
- Test fallback behavior when cookie consent fails

### E2E Tests
**File**: `tests/e2e/booking-with-cookies.spec.ts`
- Test real eversports.de cookie banner handling
- Test booking process continues after cookie acceptance
- Test multiple page navigations with cookie handling

## 🚀 Implementation Priority

### Phase 1 (Critical - P0): Basic Integration
1. Add `handleCookieConsentForBooking()` method to `BookingManager`
2. Call cookie consent handling in `navigateToBookingPage()` after page load
3. Ensure non-blocking behavior (continue booking if cookie handling fails)

### Phase 2 (Enhancement): Selector Optimization
1. Test existing selectors against eversports.de
2. Add eversports.de specific selectors if needed
3. Optimize timeout values for faster execution

### Phase 3 (Polish): General Navigation Integration
1. Consider adding cookie handling to general `BasePage.navigateTo()`
2. Add domain-based cookie handling logic
3. Implement cookie state caching to avoid repeated handling

## ⚡ Success Criteria
- [ ] Cookie banner is automatically detected and dismissed on booking page load
- [ ] Calendar interactions work immediately after page load
- [ ] Booking flow completes successfully without manual intervention
- [ ] No infinite retry loops when cookie banner is present
- [ ] Non-blocking: Booking continues even if cookie handling fails
- [ ] Proper logging for debugging and monitoring
- [ ] All existing tests continue to pass
- [ ] New tests verify cookie handling integration

## 🔍 Risk Assessment

**Low Risk Changes:**
- Adding cookie consent call to existing booking flow
- Non-blocking implementation approach
- Leveraging existing, tested `handleCookieConsent()` method

**Mitigation Strategies:**
- Timeout control to prevent hanging
- Error handling to ensure booking continues
- Logging for debugging and monitoring
- Dry-run mode testing to verify behavior

## 📋 Dependencies
- Existing `BasePage.handleCookieConsent()` method (already implemented)
- Playwright page object and selectors
- Logger utility for monitoring
- RetryManager for robust execution

## 🏁 Expected Outcome
The cookie consent banner will be automatically handled at the beginning of the booking flow, eliminating the interaction blocking issue and allowing the booking automation to proceed without manual intervention.

---
**Status**: Planning Complete
**Next Phase**: Implementation (creator agent)
**Estimated Implementation Time**: 2-3 hours
**Priority**: P0 (Critical) - Blocking all booking functionality