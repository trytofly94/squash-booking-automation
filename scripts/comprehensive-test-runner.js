#!/usr/bin/env node

/**
 * Comprehensive Test Runner
 * Orchestrates all test types: unit, integration, e2e, and website analysis
 */

const { spawn, exec } = require('child_process');
const fs = require('fs');
const path = require('path');

class TestRunner {
  constructor() {
    this.testResults = {
      unit: null,
      integration: null,
      e2e: null,
      websiteAnalysis: null,
      overall: null
    };
    
    this.outputDir = path.join(__dirname, '..', 'test-results');
    this.ensureOutputDir();
  }

  ensureOutputDir() {
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }

  async runCommand(command, args = [], options = {}) {
    return new Promise((resolve, reject) => {
      console.log(`🚀 Running: ${command} ${args.join(' ')}`);
      
      const process = spawn(command, args, {
        stdio: ['inherit', 'pipe', 'pipe'],
        shell: true,
        ...options
      });

      let stdout = '';
      let stderr = '';

      process.stdout.on('data', (data) => {
        const output = data.toString();
        stdout += output;
        console.log(output);
      });

      process.stderr.on('data', (data) => {
        const output = data.toString();
        stderr += output;
        console.error(output);
      });

      process.on('close', (code) => {
        resolve({
          code,
          stdout,
          stderr,
          success: code === 0
        });
      });

      process.on('error', (error) => {
        reject(error);
      });
    });
  }

  async runUnitTests() {
    console.log('\n📋 Running Unit Tests...');
    
    try {
      const result = await this.runCommand('npm', ['run', 'test:unit']);
      
      this.testResults.unit = {
        success: result.success,
        output: result.stdout,
        errors: result.stderr,
        timestamp: new Date().toISOString()
      };

      if (result.success) {
        console.log('✅ Unit tests passed');
      } else {
        console.log('❌ Unit tests failed');
      }

      return result.success;
    } catch (error) {
      console.error('❌ Unit tests failed with error:', error.message);
      this.testResults.unit = {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
      return false;
    }
  }

  async runIntegrationTests() {
    console.log('\n🔗 Running Integration Tests...');
    
    try {
      const result = await this.runCommand('npm', ['run', 'test:integration']);
      
      this.testResults.integration = {
        success: result.success,
        output: result.stdout,
        errors: result.stderr,
        timestamp: new Date().toISOString()
      };

      if (result.success) {
        console.log('✅ Integration tests passed');
      } else {
        console.log('❌ Integration tests failed');
      }

      return result.success;
    } catch (error) {
      console.error('❌ Integration tests failed with error:', error.message);
      this.testResults.integration = {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
      return false;
    }
  }

  async runE2ETests() {
    console.log('\n🌐 Running End-to-End Tests...');
    
    try {
      const result = await this.runCommand('npm', ['run', 'test:e2e']);
      
      this.testResults.e2e = {
        success: result.success,
        output: result.stdout,
        errors: result.stderr,
        timestamp: new Date().toISOString()
      };

      if (result.success) {
        console.log('✅ E2E tests passed');
      } else {
        console.log('❌ E2E tests failed');
      }

      return result.success;
    } catch (error) {
      console.error('❌ E2E tests failed with error:', error.message);
      this.testResults.e2e = {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
      return false;
    }
  }

  async runWebsiteAnalysis() {
    console.log('\n🔍 Running Website Analysis...');
    
    try {
      const result = await this.runCommand('npm', ['run', 'analyze:website']);
      
      this.testResults.websiteAnalysis = {
        success: result.success,
        output: result.stdout,
        errors: result.stderr,
        timestamp: new Date().toISOString()
      };

      if (result.success) {
        console.log('✅ Website analysis completed');
      } else {
        console.log('⚠️ Website analysis completed with issues');
      }

      return result.success;
    } catch (error) {
      console.error('❌ Website analysis failed with error:', error.message);
      this.testResults.websiteAnalysis = {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
      return false;
    }
  }

  async runTypeChecking() {
    console.log('\n🔎 Running TypeScript Type Checking...');
    
    try {
      const result = await this.runCommand('npm', ['run', 'type-check']);
      
      if (result.success) {
        console.log('✅ Type checking passed');
      } else {
        console.log('❌ Type checking failed');
      }

      return result.success;
    } catch (error) {
      console.error('❌ Type checking failed with error:', error.message);
      return false;
    }
  }

  async runLinting() {
    console.log('\n📝 Running ESLint...');
    
    try {
      const result = await this.runCommand('npm', ['run', 'lint']);
      
      if (result.success) {
        console.log('✅ Linting passed');
      } else {
        console.log('❌ Linting failed');
      }

      return result.success;
    } catch (error) {
      console.error('❌ Linting failed with error:', error.message);
      return false;
    }
  }

  generateTestReport() {
    const report = {
      summary: {
        timestamp: new Date().toISOString(),
        totalTests: Object.keys(this.testResults).length - 1, // -1 for 'overall'
        passedTests: Object.values(this.testResults).filter(r => r && r.success).length,
        failedTests: Object.values(this.testResults).filter(r => r && !r.success).length
      },
      results: this.testResults,
      recommendations: this.generateRecommendations()
    };

    // Calculate overall success
    const allTestsRan = Object.values(this.testResults).filter(r => r !== null).length > 0;
    const allTestsPassed = Object.values(this.testResults).every(r => r === null || r.success);
    
    report.summary.overall = allTestsRan && allTestsPassed;
    this.testResults.overall = {
      success: report.summary.overall,
      timestamp: new Date().toISOString()
    };

    // Save report
    const reportPath = path.join(this.outputDir, 'comprehensive-test-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

    console.log('\n📊 Test Report Generated:', reportPath);
    return report;
  }

  generateRecommendations() {
    const recommendations = [];

    if (this.testResults.unit && !this.testResults.unit.success) {
      recommendations.push('Fix unit test failures before proceeding with integration tests');
    }

    if (this.testResults.integration && !this.testResults.integration.success) {
      recommendations.push('Review integration test failures - may indicate component interaction issues');
    }

    if (this.testResults.e2e && !this.testResults.e2e.success) {
      recommendations.push('E2E test failures may indicate website changes or selector updates needed');
    }

    if (this.testResults.websiteAnalysis && !this.testResults.websiteAnalysis.success) {
      recommendations.push('Website analysis issues may require manual verification of selectors');
    }

    return recommendations;
  }

  printSummary(report) {
    console.log('\n' + '='.repeat(60));
    console.log('📊 COMPREHENSIVE TEST SUMMARY');
    console.log('='.repeat(60));
    
    console.log(`⏰ Completed at: ${report.summary.timestamp}`);
    console.log(`✅ Passed: ${report.summary.passedTests}/${report.summary.totalTests}`);
    console.log(`❌ Failed: ${report.summary.failedTests}/${report.summary.totalTests}`);
    console.log(`🎯 Overall: ${report.summary.overall ? 'SUCCESS' : 'FAILED'}`);

    if (report.recommendations.length > 0) {
      console.log('\n💡 Recommendations:');
      report.recommendations.forEach((rec, i) => {
        console.log(`   ${i + 1}. ${rec}`);
      });
    }

    console.log('\n📁 Detailed results saved to:', path.join(this.outputDir, 'comprehensive-test-report.json'));
    console.log('='.repeat(60));
  }

  async runAll() {
    console.log('🎯 Starting Comprehensive Test Suite...');
    console.log('This will run: Unit → Integration → E2E → Website Analysis');
    
    const startTime = Date.now();

    // Run tests in order
    const typeCheckPassed = await this.runTypeChecking();
    const lintPassed = await this.runLinting();
    const unitPassed = await this.runUnitTests();
    const integrationPassed = await this.runIntegrationTests();
    
    // E2E and website analysis can run even if earlier tests fail
    // (they test different aspects)
    const e2ePassed = await this.runE2ETests();
    const analysisPassed = await this.runWebsiteAnalysis();

    const endTime = Date.now();
    const duration = Math.round((endTime - startTime) / 1000);

    console.log(`\n⏱️ Total test duration: ${duration} seconds`);

    // Generate and display report
    const report = this.generateTestReport();
    this.printSummary(report);

    // Exit with appropriate code
    const overallSuccess = report.summary.overall;
    process.exit(overallSuccess ? 0 : 1);
  }

  async runQuick() {
    console.log('⚡ Running Quick Test Suite (Unit + Type Check + Lint)...');
    
    const typeCheckPassed = await this.runTypeChecking();
    const lintPassed = await this.runLinting();
    const unitPassed = await this.runUnitTests();

    const report = this.generateTestReport();
    this.printSummary(report);

    process.exit(report.summary.overall ? 0 : 1);
  }

  async runE2EOnly() {
    console.log('🌐 Running E2E Tests and Website Analysis only...');
    
    const e2ePassed = await this.runE2ETests();
    const analysisPassed = await this.runWebsiteAnalysis();

    const report = this.generateTestReport();
    this.printSummary(report);

    process.exit(report.summary.overall ? 0 : 1);
  }
}

// CLI interface
const args = process.argv.slice(2);
const command = args[0] || 'all';

const runner = new TestRunner();

switch (command) {
  case 'all':
    runner.runAll();
    break;
  case 'quick':
    runner.runQuick();
    break;
  case 'e2e':
    runner.runE2EOnly();
    break;
  case 'unit':
    runner.runUnitTests().then(success => process.exit(success ? 0 : 1));
    break;
  case 'integration':
    runner.runIntegrationTests().then(success => process.exit(success ? 0 : 1));
    break;
  case 'analyze':
    runner.runWebsiteAnalysis().then(success => process.exit(success ? 0 : 1));
    break;
  default:
    console.log('Usage: node comprehensive-test-runner.js [all|quick|e2e|unit|integration|analyze]');
    console.log('  all         - Run complete test suite (default)');
    console.log('  quick       - Run unit tests, type check, and lint only');
    console.log('  e2e         - Run E2E tests and website analysis only');
    console.log('  unit        - Run unit tests only');
    console.log('  integration - Run integration tests only');
    console.log('  analyze     - Run website analysis only');
    process.exit(1);
}

module.exports = TestRunner;