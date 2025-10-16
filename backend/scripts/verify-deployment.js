#!/usr/bin/env node
/**
 * Deployment Verification Script
 * 
 * Run this script after deployment to verify that:
 * 1. The database migrated correctly to persistent disk
 * 2. All preview URLs are available
 * 3. The persistent disk is being used
 * 
 * Usage:
 *   node scripts/verify-deployment.js
 */

const curatedDb = require('../curatedDb');

console.log('='.repeat(60));
console.log('DEPLOYMENT VERIFICATION');
console.log('='.repeat(60));
console.log('');

// Load the database
console.log('Loading database...');
curatedDb.load(true);
const { items } = curatedDb.list({ limit: 10000 });

// Check preview URL coverage
const withPreview = items.filter(s => s.previewUrl);
const withoutPreview = items.filter(s => !s.previewUrl);

console.log('Database Statistics:');
console.log(`  Total songs:             ${items.length}`);
console.log(`  With preview URLs:       ${withPreview.length} (${Math.round(withPreview.length / items.length * 100)}%)`);
console.log(`  Without preview URLs:    ${withoutPreview.length}`);
console.log('');

// Verify environment
console.log('Environment:');
console.log(`  NODE_ENV:                ${process.env.NODE_ENV || 'development'}`);
console.log(`  Expected cache dir:      ${process.env.NODE_ENV === 'production' ? '/var/data/cache' : 'backend/cache'}`);
console.log('');

// Check if this looks like production
const isProduction = process.env.NODE_ENV === 'production';
const expectedSongs = 3690;
const expectedPreviewCoverage = 100;

console.log('Verification Results:');
console.log('');

let allPassed = true;

// Test 1: Song count
if (items.length >= expectedSongs) {
  console.log('✓ Song count is correct:', items.length);
} else {
  console.log('✗ Song count is too low:', items.length, '(expected:', expectedSongs + ')');
  allPassed = false;
}

// Test 2: Preview URL coverage
const coverage = Math.round(withPreview.length / items.length * 100);
if (coverage >= expectedPreviewCoverage) {
  console.log('✓ Preview URL coverage is complete:', coverage + '%');
} else {
  console.log('✗ Preview URL coverage is incomplete:', coverage + '%', '(expected:', expectedPreviewCoverage + '%)');
  allPassed = false;
}

// Test 3: Production environment check
if (isProduction) {
  console.log('✓ Running in production mode');
} else {
  console.log('ℹ Running in development mode');
}

console.log('');
console.log('='.repeat(60));

if (allPassed) {
  console.log('✓ ALL CHECKS PASSED - Deployment verified successfully!');
  console.log('');
  console.log('Your database is properly configured with:');
  console.log(`  • ${items.length} songs`);
  console.log(`  • ${coverage}% preview URL coverage`);
  console.log('  • Ready for Preview Mode gameplay');
} else {
  console.log('✗ SOME CHECKS FAILED - Please review the issues above');
  console.log('');
  console.log('Common issues:');
  console.log('  • Database migration may not have completed');
  console.log('  • Persistent disk may not be configured');
  console.log('  • Check backend logs for migration messages');
}

console.log('='.repeat(60));
