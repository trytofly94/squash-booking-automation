/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  
  // Root directory for tests
  rootDir: '.',
  
  // Test file patterns - unit and pure Jest integration tests
  testMatch: [
    '<rootDir>/tests/unit/**/*.test.ts',
    '<rootDir>/tests/unit/**/*.spec.ts',
    '<rootDir>/tests/integration/**/*.test.ts',
    '<rootDir>/tests/integration/**/*.spec.ts'
  ],
  
  // Module file extensions
  moduleFileExtensions: ['ts', 'js', 'json'],
  
  
  // Module name mapping for path aliases
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@/core/(.*)$': '<rootDir>/src/core/$1',
    '^@/pages/(.*)$': '<rootDir>/src/pages/$1',
    '^@/types/(.*)$': '<rootDir>/src/types/$1',
    '^@/utils/(.*)$': '<rootDir>/src/utils/$1',
    '^@/monitoring/(.*)$': '<rootDir>/src/monitoring/$1',
    '^p-retry$': '<rootDir>/tests/mocks/p-retry.mock.ts'
  },
  
  // Setup files
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  
  // Coverage configuration
  collectCoverage: false,
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/*.test.ts',
    '!src/**/*.spec.ts'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    }
  },
  
  // Test timeout
  testTimeout: 30000,
  
  // Clear mocks between tests
  clearMocks: true,
  restoreMocks: true,
  
  // Verbose output
  verbose: true,
  
  // TypeScript configuration for ts-jest
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      tsconfig: 'tsconfig.test.json'
    }]
  },
  
  // Transform ESM modules
  transformIgnorePatterns: [
    'node_modules/(?!(p-retry|retry)/)'
  ],
  
  // Test environment options
  testEnvironmentOptions: {
    NODE_ENV: 'test'
  },
  
  // Error on deprecated features
  errorOnDeprecated: true
};