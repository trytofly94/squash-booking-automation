module.exports = {
  root: true,
  env: {
    node: true,
    es2022: true,
    jest: true,
    browser: true
  },
  extends: [
    'eslint:recommended'
  ],
  plugins: ['@typescript-eslint'],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module'
  },
  rules: {
    // General ESLint rules
    'no-console': 'warn',
    'no-debugger': 'error',
    'no-var': 'error',
    'prefer-const': 'error',
    'no-unused-vars': 'off', // Disable base rule as it conflicts with TypeScript version
    '@typescript-eslint/no-unused-vars': ['error', {
      argsIgnorePattern: '^_', 
      varsIgnorePattern: '^_',
      ignoreRestSiblings: true 
    }],
    'no-undef': 'off' // Disable since TypeScript handles this
  },
  overrides: [
    {
      files: ['tests/**/*.ts', '**/*.test.ts', '**/*.spec.ts'],
      env: {
        browser: true,
        jest: true
      },
      rules: {
        'no-console': 'off',
        'no-unused-vars': 'off',
        '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }]
      }
    }
  ],
  ignorePatterns: [
    'node_modules/',
    'dist/',
    'coverage/',
    'test-results/',
    'playwright-report/',
    '*.js' // Ignore JS files for now since we focus on TS
  ]
};