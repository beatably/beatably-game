#!/usr/bin/env node
/**
 * Check Preview URL Population Status
 */

const curatedDb = require('../curatedDb');

console.log('Checking preview URL status...\n');

curatedDb.load(true);
const { items } = curatedDb.list({ limit: 10000 });

const withPreview = items.filter(s => s.previewUrl);
const withoutPreview = items.filter(s => !s.previewUrl);

console.log('='.repeat(60));
console.log('PREVIEW URL STATUS');
console.log('='.repeat(60));
console.log(`Total songs:             ${items.length}`);
console.log(`With preview URLs:       ${withPreview.length} (${Math.round(withPreview.length / items.length * 100)}%)`);
console.log(`Without preview URLs:    ${withoutPreview.length} (${Math.round(withoutPreview.length / items.length * 100)}%)`);
console.log('='.repeat(60));
console.log('');

if (withoutPreview.length > 0) {
  const estimatedMinutes = Math.round(withoutPreview.length * 2 / 60);
  console.log(`Estimated time to complete: ~${estimatedMinutes} minutes (${Math.round(estimatedMinutes / 60)} hours)`);
  console.log('');
  console.log('To continue populating:');
  console.log('  node scripts/populate-preview-urls.js');
} else {
  console.log('✓ All songs have preview URLs!');
}
