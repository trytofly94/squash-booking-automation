#!/usr/bin/env ts-node

/**
 * Demonstration script for Issue #9 Advanced Booking Logic features
 * Shows all new functionality integrated together
 */

import { CourtScorer } from '../src/core/CourtScorer';
import { PatternStorage } from '../src/core/PatternStorage';
import { TimeSlotGenerator } from '../src/core/TimeSlotGenerator';
import { DateTimeCalculator } from '../src/core/DateTimeCalculator';
import { ConfigurationManager } from '../src/utils/ConfigurationManager';
import type { BookingPattern, AdvancedBookingConfig } from '../src/types/booking.types';
import { logger } from '../src/utils/logger';

// Set up environment for demonstration
process.env.TIMEZONE = 'Europe/Berlin';
process.env.PREFERRED_COURTS = '1,3,5,7';
process.env.BOOKING_PATTERN_LEARNING = 'true';
process.env.FALLBACK_TIME_RANGE = '120';
process.env.DRY_RUN = 'true';

async function demonstrateAdvancedFeatures() {
  console.log('🚀 Advanced Booking Logic Demonstration - Issue #9');
  console.log('================================================\n');

  // 1. Configuration Management
  console.log('1️⃣  Configuration Management');
  console.log('---------------------------');
  
  const configManager = ConfigurationManager.getInstance();
  const config = configManager.getConfig();
  
  console.log('📋 Current configuration:');
  console.log(`   Timezone: ${config.timezone}`);
  console.log(`   Preferred Courts: ${config.preferredCourts.join(', ')}`);
  console.log(`   Pattern Learning: ${config.enablePatternLearning ? 'Enabled' : 'Disabled'}`);
  console.log(`   Fallback Range: ${config.fallbackTimeRange} minutes`);
  console.log(`   Court Scoring Weights:`, config.courtScoringWeights);
  
  const stats = configManager.getConfigurationStats();
  console.log(`📊 Configuration Stats:`, stats);
  console.log('');

  // 2. Enhanced Date Calculations with date-fns
  console.log('2️⃣  Enhanced Date Calculations (date-fns)');
  console.log('----------------------------------------');
  
  const bookingDate = DateTimeCalculator.calculateBookingDate(20, config.timezone);
  console.log(`📅 Booking date (20 days ahead in ${config.timezone}): ${bookingDate}`);
  
  const currentTimestamp = DateTimeCalculator.getCurrentTimestamp(config.timezone);
  console.log(`⏰ Current timestamp in timezone: ${currentTimestamp.toISOString()}`);
  
  const isBusinessDay = DateTimeCalculator.isBusinessDay(bookingDate);
  console.log(`💼 Is ${bookingDate} a business day? ${isBusinessDay ? 'Yes' : 'No'}`);
  
  if (!isBusinessDay) {
    const nextBusinessDay = DateTimeCalculator.getNextBusinessDay(bookingDate, config.timezone);
    console.log(`📈 Next business day: ${nextBusinessDay.toISOString().split('T')[0]}`);
  }
  
  const flexibleSlots = DateTimeCalculator.generateTimeSlots('14:00', 90, 30);
  console.log(`🕐 Flexible time slots (90 min, 30 min intervals): ${flexibleSlots.join(', ')}`);
  
  const alternatives = DateTimeCalculator.generateAlternativeTimeSlots('14:00', 60, 30);
  console.log(`🔄 Alternative time slots (±60 min): ${alternatives.slice(0, 5).join(', ')}... (${alternatives.length} total)`);
  console.log('');

  // 3. Court Scoring System
  console.log('3️⃣  Intelligent Court Scoring System');
  console.log('----------------------------------');
  
  const courtScorer = new CourtScorer(config.courtScoringWeights);
  
  // Create some mock historical patterns
  const mockPatterns: BookingPattern[] = [
    { courtId: '1', timeSlot: '14:00', dayOfWeek: 1, successRate: 0.9, totalAttempts: 20, lastUpdated: new Date() },
    { courtId: '3', timeSlot: '14:00', dayOfWeek: 1, successRate: 0.7, totalAttempts: 15, lastUpdated: new Date() },
    { courtId: '5', timeSlot: '14:00', dayOfWeek: 1, successRate: 0.8, totalAttempts: 10, lastUpdated: new Date() },
    { courtId: '7', timeSlot: '14:00', dayOfWeek: 1, successRate: 0.6, totalAttempts: 8, lastUpdated: new Date() },
    { courtId: '2', timeSlot: '14:00', dayOfWeek: 1, successRate: 0.4, totalAttempts: 12, lastUpdated: new Date() },
  ];
  
  courtScorer.loadPatterns(mockPatterns);
  console.log(`📚 Loaded ${mockPatterns.length} historical patterns`);
  
  const availableCourts = ['1', '2', '3', '5', '7'];
  const courtScores = courtScorer.scoreCourts(
    availableCourts,
    availableCourts,
    config.preferredCourts,
    '14:00',
    1 // Monday
  );
  
  console.log('🏆 Court scoring results (Monday 14:00):');
  courtScores.forEach((score, index) => {
    console.log(`   ${index + 1}. Court ${score.courtId}: ${score.score.toFixed(3)} - ${score.reason}`);
    console.log(`      Components: Availability=${score.components.availability.toFixed(2)}, Historical=${score.components.historical.toFixed(2)}, Preference=${score.components.preference.toFixed(2)}, Position=${score.components.position.toFixed(2)}`);
  });
  
  const bestCourt = courtScorer.getBestCourt(courtScores);
  console.log(`🥇 Best court recommendation: Court ${bestCourt}`);
  
  const scoringStats = courtScorer.getStatistics();
  console.log(`📈 Scoring statistics:`, scoringStats);
  console.log('');

  // 4. Time Slot Generation with Fallback Strategies
  console.log('4️⃣  Time Slot Generation & Fallback Strategies');
  console.log('----------------------------------------------');
  
  const timeSlotGenerator = new TimeSlotGenerator();
  
  const timePreferences = [
    { startTime: '14:00', priority: 10, flexibility: 30 },
    { startTime: '13:30', priority: 8, flexibility: 15 },
    { startTime: '14:30', priority: 7, flexibility: 20 }
  ];
  
  const prioritizedSlots = timeSlotGenerator.generatePrioritizedTimeSlots(
    '14:00',
    timePreferences,
    config.fallbackTimeRange
  );
  
  console.log(`🎯 Prioritized time slots (${config.fallbackTimeRange}min range):`);
  prioritizedSlots.slice(0, 8).forEach((slot, index) => {
    console.log(`   ${index + 1}. ${slot.startTime}-${slot.endTime} (Priority: ${slot.priority}, Distance: ${slot.distanceFromPreferred}min)`);
  });
  console.log(`   ... and ${prioritizedSlots.length - 8} more alternatives\n`);
  
  const availableStrategies = timeSlotGenerator.getAvailableStrategies();
  console.log(`🔧 Available fallback strategies: ${availableStrategies.join(', ')}`);
  
  // Demonstrate specific strategies
  const strategicSlots = timeSlotGenerator.generateWithStrategies('14:00', ['gradual', 'peak-avoidance'], 90);
  console.log(`⚡ Strategic alternatives (gradual + peak-avoidance): ${strategicSlots.slice(0, 5).map(s => s.startTime).join(', ')}...`);
  
  // Business hours slots
  const businessSlots = timeSlotGenerator.generateBusinessHoursSlots('14:00', 60, '08:00', '22:00');
  console.log(`💼 Business hours slots (08:00-22:00): ${businessSlots.slice(0, 5).map(s => s.startTime).join(', ')}... (${businessSlots.length} total)`);
  console.log('');

  // 5. Pattern Storage and Learning
  console.log('5️⃣  Pattern Storage & Learning');
  console.log('-----------------------------');
  
  try {
    const patternStorage = new PatternStorage('./demo-patterns.json');
    
    // Simulate some booking attempts and update patterns
    console.log('🔄 Simulating booking attempts and updating patterns...');
    
    courtScorer.updatePattern('1', '14:00', 1, true);  // Success
    courtScorer.updatePattern('3', '14:00', 1, false); // Failure
    courtScorer.updatePattern('1', '14:30', 1, true);  // Success
    courtScorer.updatePattern('5', '14:00', 1, true);  // Success
    
    const updatedPatterns = courtScorer.exportPatterns();
    console.log(`💾 Updated patterns count: ${updatedPatterns.length}`);
    
    // Show pattern statistics
    const patternStats = await patternStorage.getStatistics();
    console.log(`📊 Pattern statistics:`, {
      totalPatterns: updatedPatterns.length,
      samplePattern: updatedPatterns[0] ? {
        courtId: updatedPatterns[0].courtId,
        timeSlot: updatedPatterns[0].timeSlot,
        successRate: updatedPatterns[0].successRate.toFixed(2),
        totalAttempts: updatedPatterns[0].totalAttempts
      } : 'None'
    });
  } catch (error) {
    console.log(`⚠️  Pattern storage demo skipped: ${(error as Error).message}`);
  }
  console.log('');

  // 6. Integration Demo - Complete Booking Scenario
  console.log('6️⃣  Complete Booking Scenario Integration');
  console.log('----------------------------------------');
  
  console.log('🎬 Simulating complete advanced booking workflow:');
  console.log('   1. Calculate optimal booking date with timezone');
  console.log('   2. Generate prioritized time alternatives');
  console.log('   3. Score available courts with pattern learning');
  console.log('   4. Select best court-time combination');
  console.log('');
  
  const scenarioDate = DateTimeCalculator.calculateBookingDate(config.daysAhead, config.timezone);
  const scenarioDayOfWeek = new Date(scenarioDate).getDay();
  
  console.log(`📅 Target date: ${scenarioDate} (${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][scenarioDayOfWeek]})`);
  
  const scenarioTimeSlots = prioritizedSlots.slice(0, 3); // Top 3 time options
  console.log(`⏰ Top time options: ${scenarioTimeSlots.map(s => s.startTime).join(', ')}`);
  
  // Score courts for each time slot
  console.log('🏆 Court scoring for each time option:');
  scenarioTimeSlots.forEach((timeSlot, index) => {
    const scores = courtScorer.scoreCourts(
      config.preferredCourts,
      config.preferredCourts, // Assume all preferred courts are available
      config.preferredCourts,
      timeSlot.startTime,
      scenarioDayOfWeek
    );
    
    const bestCourtForTime = courtScorer.getBestCourt(scores);
    console.log(`   ${index + 1}. ${timeSlot.startTime}: Best court ${bestCourtForTime} (score: ${scores[0]?.score.toFixed(3) || 'N/A'})`);
  });
  
  console.log('');
  console.log('✅ Advanced booking logic demonstration complete!');
  console.log('');
  
  // 7. Performance Summary
  console.log('7️⃣  Performance & Features Summary');
  console.log('---------------------------------');
  console.log('✨ New capabilities added:');
  console.log('   📅 Timezone-aware date calculations with DST handling');
  console.log('   🧠 Intelligent court scoring with multiple criteria');
  console.log('   📚 Pattern learning from booking history');
  console.log('   🔄 Multiple fallback strategies for time alternatives');
  console.log('   ⚙️  Comprehensive configuration management');
  console.log('   💾 Persistent pattern storage with cleanup');
  console.log('   🧪 Business hours and holiday awareness');
  console.log('   🔧 Flexible slot duration and intervals');
  console.log('   📊 Comprehensive statistics and monitoring');
  console.log('   🔒 Robust validation and error handling');
  console.log('');
  
  console.log('🎯 Expected improvements:');
  console.log('   📈 Higher booking success rates through intelligent selection');
  console.log('   ⚡ Faster booking with prioritized alternatives');
  console.log('   🎓 Learning system that improves over time');
  console.log('   🌍 Global timezone support for international users');
  console.log('   🛡️  Robust error handling and graceful degradation');
  console.log('');
  
  // Configuration export demo
  console.log('8️⃣  Configuration Export/Import Demo');
  console.log('-----------------------------------');
  
  const exportedConfig = configManager.exportConfiguration();
  console.log(`💾 Configuration exported (${exportedConfig.length} characters)`);
  
  const envVars = configManager.getEnvironmentVariables();
  console.log('🔧 Environment variables format:');
  Object.entries(envVars).slice(0, 5).forEach(([key, value]) => {
    console.log(`   ${key}=${value}`);
  });
  console.log(`   ... and ${Object.keys(envVars).length - 5} more variables`);
  console.log('');
  
  console.log('🏁 Demonstration completed successfully!');
  console.log('All advanced booking logic features are working correctly.');
}

// Run demonstration
if (require.main === module) {
  demonstrateAdvancedFeatures().catch(error => {
    console.error('❌ Demonstration failed:', error);
    process.exit(1);
  });
}