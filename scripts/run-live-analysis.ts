#!/usr/bin/env npx ts-node

/**
 * Live DOM Analysis Script
 * Führt eine sofortige Live-Analyse der eversports.de Website durch
 */

import { runLiveAnalysis } from '../src/utils/LiveDOMAnalyzer';
import { logger } from '../src/utils/logger';
import { mkdirSync } from 'fs';

async function main() {
  logger.info('🚀 Starting Live DOM Analysis of eversports.de', 'LiveAnalysisScript');

  // Erstelle notwendige Verzeichnisse
  try {
    mkdirSync('./live-analysis-screenshots', { recursive: true });
    mkdirSync('./live-analysis-results', { recursive: true });
  } catch (error) {
    // Verzeichnisse existieren bereits
  }

  try {
    const result = await runLiveAnalysis({
      url: 'https://www.eversports.de/sb/sportcenter-kautz?sport=squash',
      headless: false, // Sichtbarer Browser für Debugging
      credentials: {
        email: 'contact@lennart.de',
        password: 'Columbus94!'
      }
    });

    // Zusammenfassung ausgeben
    console.log('\n📊 LIVE ANALYSIS RESULTS 📊');
    console.log('========================================');
    
    console.log(`\n🌐 Website: ${result.url}`);
    console.log(`📅 Timestamp: ${result.timestamp}`);
    console.log(`📋 Page Title: ${result.pageTitle}`);

    console.log('\n📅 Calendar Structure:');
    console.log(`  Found: ${result.calendarStructure.found ? '✅' : '❌'}`);
    if (result.calendarStructure.found) {
      console.log(`  Selector: ${result.calendarStructure.selector}`);
    }

    console.log('\n🏟️ Court Elements:');
    console.log(`  Found: ${result.courtElements.found ? '✅' : '❌'}`);
    console.log(`  Count: ${result.courtElements.count}`);
    console.log(`  Working Selectors: ${result.courtElements.selectors.join(', ')}`);

    console.log('\n⏰ Time Slots:');
    console.log(`  Found: ${result.timeSlots.found ? '✅' : '❌'}`);
    console.log(`  Count: ${result.timeSlots.count}`);
    console.log(`  Date Attributes: ${result.timeSlots.dateAttributes.join(', ')}`);
    console.log(`  Time Attributes: ${result.timeSlots.timeAttributes.join(', ')}`);
    console.log(`  State Attributes: ${result.timeSlots.stateAttributes.join(', ')}`);
    console.log(`  Court Attributes: ${result.timeSlots.courtAttributes.join(', ')}`);

    console.log('\n🔐 Login Elements:');
    console.log(`  Email Field: ${result.loginElements.emailField.found ? '✅' : '❌'} (${result.loginElements.emailField.selector})`);
    console.log(`  Password Field: ${result.loginElements.passwordField.found ? '✅' : '❌'} (${result.loginElements.passwordField.selector})`);
    console.log(`  Login Button: ${result.loginElements.loginButton.found ? '✅' : '❌'} (${result.loginElements.loginButton.selector})`);

    console.log('\n🧭 Navigation Elements:');
    console.log(`  Next Week Button: ${result.navigationElements.nextWeekButton.found ? '✅' : '❌'} (${result.navigationElements.nextWeekButton.selector})`);
    console.log(`  Checkout Button: ${result.navigationElements.checkoutButton.found ? '✅' : '❌'} (${result.navigationElements.checkoutButton.selector})`);

    console.log('\n🛠️ Working XPath Patterns:');
    console.log(`  Slot Selection: ${result.workingXPaths.slotSelection.length} patterns`);
    result.workingXPaths.slotSelection.forEach(xpath => console.log(`    ✅ ${xpath}`));
    console.log(`  Navigation: ${result.workingXPaths.navigation.length} patterns`);
    result.workingXPaths.navigation.forEach(xpath => console.log(`    ✅ ${xpath}`));
    console.log(`  Checkout: ${result.workingXPaths.checkout.length} patterns`);
    result.workingXPaths.checkout.forEach(xpath => console.log(`    ✅ ${xpath}`));

    // Kritische Probleme identifizieren
    console.log('\n🚨 CRITICAL ISSUES IDENTIFIED:');
    if (!result.calendarStructure.found) {
      console.log('  ❌ Calendar container not found - BLOCKING ISSUE');
    }
    if (!result.courtElements.found) {
      console.log('  ❌ Court elements not found - BLOCKING ISSUE');
    }
    if (!result.timeSlots.found) {
      console.log('  ❌ Time slots not found - BLOCKING ISSUE');
    }
    if (!result.loginElements.emailField.found) {
      console.log('  ⚠️ Email field not found - may impact authentication');
    }

    // Empfohlene nächste Schritte
    console.log('\n📋 RECOMMENDED NEXT STEPS:');
    if (!result.calendarStructure.found) {
      console.log('  1. 🔍 Inspect calendar structure manually');
      console.log('  2. 🛠️ Update BookingCalendarPage.ts selectors');
    }
    if (result.workingXPaths.slotSelection.length > 0) {
      console.log('  3. ✅ Migrate to working XPath patterns from ui.vision');
    }
    if (result.courtElements.found) {
      console.log('  4. 🏟️ Update court detection logic with working selectors');
    }

    logger.info('✅ Live DOM Analysis completed successfully', 'LiveAnalysisScript');

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('❌ Live DOM Analysis failed', 'LiveAnalysisScript', { error: errorMessage });
    console.error('\n🚨 ANALYSIS FAILED:', errorMessage);
    process.exit(1);
  }
}

// Führe das Script aus
main().catch(error => {
  console.error('💥 Fatal error:', error);
  process.exit(1);
});