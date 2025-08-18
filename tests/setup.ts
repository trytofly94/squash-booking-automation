/**
 * Jest setup file for global test configuration
 */

// Mock console methods in test environment to reduce noise
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

beforeAll(() => {
  // Suppress console.error and console.warn in tests unless explicitly needed
  console.error = jest.fn();
  console.warn = jest.fn();
});

afterAll(() => {
  // Restore original console methods
  console.error = originalConsoleError;
  console.warn = originalConsoleWarn;
});

// Mock environment variables for testing
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error'; // Reduce log noise in tests

// Global test utilities
global.testUtils = {
  /**
   * Create a mock booking slot
   */
  createMockBookingSlot: (overrides = {}) => ({
    date: '2025-09-07',
    startTime: '14:00',
    courtId: 'court-1',
    isAvailable: true,
    elementSelector: '#slot-14-00-court-1',
    ...overrides
  }),

  /**
   * Create a mock booking pair
   */
  createMockBookingPair: (overrides = {}) => {
    const slot1 = global.testUtils.createMockBookingSlot({ startTime: '14:00' });
    const slot2 = global.testUtils.createMockBookingSlot({ startTime: '14:30' });
    
    return {
      slot1,
      slot2,
      courtId: 'court-1',
      ...overrides
    };
  },

  /**
   * Create mock Playwright page object
   */
  createMockPage: () => ({
    goto: jest.fn().mockResolvedValue(undefined),
    waitForLoadState: jest.fn().mockResolvedValue(undefined),
    waitForSelector: jest.fn().mockResolvedValue(undefined),
    click: jest.fn().mockResolvedValue(undefined),
    fill: jest.fn().mockResolvedValue(undefined),
    textContent: jest.fn().mockResolvedValue(''),
    $: jest.fn().mockResolvedValue(null),
    $$: jest.fn().mockResolvedValue([]),
    waitForTimeout: jest.fn().mockResolvedValue(undefined),
    keyboard: {
      press: jest.fn().mockResolvedValue(undefined)
    },
    locator: jest.fn().mockReturnValue({
      waitFor: jest.fn().mockResolvedValue(undefined),
      scrollIntoViewIfNeeded: jest.fn().mockResolvedValue(undefined)
    }),
    screenshot: jest.fn().mockResolvedValue(Buffer.from('')),
    url: jest.fn().mockReturnValue('https://test.example.com'),
    title: jest.fn().mockResolvedValue('Test Page'),
    reload: jest.fn().mockResolvedValue(undefined),
    inputValue: jest.fn().mockResolvedValue(''),
    isChecked: jest.fn().mockResolvedValue(false),
    getAttribute: jest.fn().mockResolvedValue(null)
  }),

  /**
   * Wait for a specified amount of time (for testing async operations)
   */
  wait: (ms: number) => new Promise(resolve => setTimeout(resolve, ms)),

  /**
   * Mock date to a specific value
   */
  mockDate: (dateString: string) => {
    const mockDate = new Date(dateString);
    jest.spyOn(global, 'Date').mockImplementation(() => mockDate);
    return mockDate;
  },

  /**
   * Restore date mocking
   */
  restoreDate: () => {
    jest.restoreAllMocks();
  }
};

// Add type declarations for global test utilities
declare global {
  namespace globalThis {
    var testUtils: {
      createMockBookingSlot: (overrides?: any) => any;
      createMockBookingPair: (overrides?: any) => any;
      createMockPage: () => any;
      wait: (ms: number) => Promise<void>;
      mockDate: (dateString: string) => Date;
      restoreDate: () => void;
    };
  }
}

export {};