#!/usr/bin/env node
/**
 * Modern Playwright Development Tools
 * Interactive CLI for enhanced development experience
 */

const { execSync, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const EVERSPORTS_URL = 'https://www.eversports.de/sb/sportcenter-kautz?sport=squash';

class PlaywrightTools {
  constructor() {
    this.ensurePlaywrightInstalled();
  }

  ensurePlaywrightInstalled() {
    try {
      execSync('npx playwright --version', { stdio: 'pipe' });
    } catch (error) {
      console.log('Installing Playwright browsers...');
      execSync('npx playwright install', { stdio: 'inherit', cwd: PROJECT_ROOT });
    }
  }

  /**
   * Launch interactive UI mode for test development
   */
  launchUIMode(testFile = '') {
    console.log('🚀 Launching Playwright UI Mode...');
    console.log('Features available:');
    console.log('  - Interactive test runner');
    console.log('  - Real-time debugging');
    console.log('  - Test recording and editing');
    console.log('  - Visual test results');
    
    const command = `npx playwright test --ui ${testFile}`;
    spawn('sh', ['-c', command], {
      stdio: 'inherit',
      cwd: PROJECT_ROOT,
      env: { ...process.env, PLAYWRIGHT_UI_MODE: '1' }
    });
  }

  /**
   * Launch debug mode with Playwright Inspector
   */
  launchDebugMode(testFile = '') {
    console.log('🔍 Launching Playwright Debug Mode...');
    console.log('Use the Playwright Inspector to:');
    console.log('  - Step through test execution');
    console.log('  - Inspect selectors');
    console.log('  - Modify test on the fly');
    
    const command = `npx playwright test --debug ${testFile}`;
    spawn('sh', ['-c', command], {
      stdio: 'inherit',
      cwd: PROJECT_ROOT
    });
  }

  /**
   * Generate selectors for the eversports website
   */
  generateSelectors(url = EVERSPORTS_URL) {
    console.log('🎯 Launching Codegen for selector generation...');
    console.log(`Target URL: ${url}`);
    console.log('Use codegen to:');
    console.log('  - Record user interactions');
    console.log('  - Generate robust selectors');
    console.log('  - Create test scaffolding');
    
    const command = `npx playwright codegen "${url}"`;
    spawn('sh', ['-c', command], {
      stdio: 'inherit',
      cwd: PROJECT_ROOT
    });
  }

  /**
   * Mobile-specific codegen
   */
  generateMobileSelectors(url = EVERSPORTS_URL) {
    console.log('📱 Launching Mobile Codegen...');
    const command = `npx playwright codegen --device="iPhone 13" "${url}"`;
    spawn('sh', ['-c', command], {
      stdio: 'inherit',
      cwd: PROJECT_ROOT
    });
  }

  /**
   * Run comprehensive test with full tracing
   */
  runProfiledTests() {
    console.log('📊 Running tests with full profiling...');
    console.log('This will generate:');
    console.log('  - Execution traces');
    console.log('  - Performance timelines');
    console.log('  - Network activity logs');
    console.log('  - Screenshots and videos');
    
    const command = 'npx playwright test --trace=on --video=on --screenshot=on';
    spawn('sh', ['-c', command], {
      stdio: 'inherit',
      cwd: PROJECT_ROOT
    });
  }

  /**
   * Show the latest test report
   */
  showReport() {
    console.log('📋 Opening latest test report...');
    const command = 'npx playwright show-report test-results/html-report';
    spawn('sh', ['-c', command], {
      stdio: 'inherit',
      cwd: PROJECT_ROOT
    });
  }

  /**
   * Interactive trace viewer
   */
  showTrace(traceFile = '') {
    if (!traceFile) {
      // Find the latest trace file
      const traceDir = path.join(PROJECT_ROOT, 'test-results');
      if (fs.existsSync(traceDir)) {
        const files = fs.readdirSync(traceDir, { recursive: true })
          .filter(file => file.toString().endsWith('.zip'))
          .map(file => path.join(traceDir, file.toString()))
          .sort((a, b) => fs.statSync(b).mtime - fs.statSync(a).mtime);
        
        if (files.length > 0) {
          traceFile = files[0];
        }
      }
    }
    
    if (traceFile) {
      console.log(`🔬 Opening trace viewer for: ${traceFile}`);
      const command = `npx playwright show-trace "${traceFile}"`;
      spawn('sh', ['-c', command], {
        stdio: 'inherit',
        cwd: PROJECT_ROOT
      });
    } else {
      console.log('No trace files found. Run tests with --trace=on first.');
    }
  }

  /**
   * Website analysis mode
   */
  analyzeWebsite() {
    console.log('🔍 Analyzing eversports website...');
    console.log('This will check:');
    console.log('  - Current DOM structure');
    console.log('  - Available selectors');
    console.log('  - Performance metrics');
    console.log('  - Mobile responsiveness');
    
    if (fs.existsSync(path.join(PROJECT_ROOT, 'scripts', 'website-analysis.js'))) {
      spawn('node', ['scripts/website-analysis.js'], {
        stdio: 'inherit',
        cwd: PROJECT_ROOT
      });
    } else {
      console.log('Website analysis script not found. Creating one...');
      this.generateSelectors();
    }
  }

  /**
   * Show available commands
   */
  showHelp() {
    console.log('🛠️  Modern Playwright Development Tools');
    console.log('');
    console.log('Available commands:');
    console.log('  ui [test-file]     - Launch interactive UI mode');
    console.log('  debug [test-file]  - Launch debug mode with inspector');
    console.log('  codegen [url]      - Generate selectors for website');
    console.log('  mobile [url]       - Generate selectors for mobile');
    console.log('  profile            - Run tests with full profiling');
    console.log('  report             - Show latest test report');
    console.log('  trace [file]       - Open trace viewer');
    console.log('  analyze            - Analyze target website');
    console.log('  help               - Show this help');
    console.log('');
    console.log('Examples:');
    console.log('  node scripts/playwright-tools.js ui');
    console.log('  node scripts/playwright-tools.js codegen');
    console.log('  node scripts/playwright-tools.js debug tests/e2e/booking-flow.spec.ts');
  }
}

// CLI interface
const [,, command, ...args] = process.argv;
const tools = new PlaywrightTools();

switch (command) {
  case 'ui':
    tools.launchUIMode(args[0]);
    break;
  case 'debug':
    tools.launchDebugMode(args[0]);
    break;
  case 'codegen':
    tools.generateSelectors(args[0]);
    break;
  case 'mobile':
    tools.generateMobileSelectors(args[0]);
    break;
  case 'profile':
    tools.runProfiledTests();
    break;
  case 'report':
    tools.showReport();
    break;
  case 'trace':
    tools.showTrace(args[0]);
    break;
  case 'analyze':
    tools.analyzeWebsite();
    break;
  case 'help':
  default:
    tools.showHelp();
    break;
}