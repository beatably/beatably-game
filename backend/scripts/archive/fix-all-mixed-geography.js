#!/usr/bin/env node
/**
 * Fix all artists with mixed geography classifications
 * Based on the analysis showing 67 artists with inconsistent geography
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const DB_FILE = path.join(__dirname, '..', 'cache', 'curated-songs.json');

// Get all artists with mixed geography
const data = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));

const artistGeos = {};
data.forEach(s => {
  const artist = s.artist || 'unknown';
  if (!artistGeos[artist]) artistGeos[artist] = new Set();
  artistGeos[artist].add(s.geography || 'unknown');
});

const mixedArtists = Object.entries(artistGeos)
  .filter(([artist, geos]) => geos.size > 1)
  .map(([artist]) => artist)
  .sort();

console.log(`Found ${mixedArtists.length} artists with mixed geography\n`);
console.log('Processing in batches of 10 artists...\n');

// Process in batches to avoid overwhelming the API
let processed = 0;
let failed = 0;

for (let i = 0; i < mixedArtists.length; i += 10) {
  const batch = mixedArtists.slice(i, Math.min(i + 10, mixedArtists.length));
  const artistList = batch.join(',');
  
  console.log(`\nBatch ${Math.floor(i/10) + 1}: Processing ${batch.length} artists...`);
  batch.forEach(a => console.log(`  - ${a}`));
  
  try {
    execSync(
      `node scripts/reclassify-origin.js --artists "${artistList}"`,
      { 
        cwd: path.join(__dirname, '..'),
        stdio: 'inherit'
      }
    );
    processed += batch.length;
    
    // Small delay between batches to be gentle with MusicBrainz
    if (i + 10 < mixedArtists.length) {
      console.log('\nWaiting 2 seconds before next batch...');
      execSync('sleep 2');
    }
  } catch (error) {
    console.error(`Error processing batch: ${error.message}`);
    failed += batch.length;
  }
}

console.log('\n' + '='.repeat(60));
console.log('BATCH PROCESSING COMPLETE');
console.log('='.repeat(60));
console.log(`Total artists processed: ${processed}`);
console.log(`Failed: ${failed}`);
console.log('\nRun analyze-geography-issues.js again to verify all fixes.');
