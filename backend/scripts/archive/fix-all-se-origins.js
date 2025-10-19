#!/usr/bin/env node
/**
 * Fix all songs with geography=SE where the artist is NOT Swedish
 * This catches artists where ALL songs are incorrectly marked as SE
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const DB_FILE = path.join(__dirname, '..', 'cache', 'curated-songs.json');

// Known Swedish artists to exclude from fixes
const KNOWN_SWEDISH = [
  'ABBA', 'Roxette', 'Ace of Base', 'Avicii', 'Swedish House Mafia',
  'Veronica Maggio', 'Oskar Linnros', 'Dr. Alban', 'Army of Lovers',
  'Europe', 'The Cardigans', 'Robyn'
];

const data = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));

// Get all unique artists with geography=SE
const seArtists = new Set();
data.forEach(s => {
  if (s.geography === 'SE') {
    seArtists.add(s.artist);
  }
});

console.log(`Found ${seArtists.length} unique artists with geography=SE\n`);

// Filter out known Swedish artists
const artistsToCheck = Array.from(seArtists).filter(artist => {
  const isSwedish = KNOWN_SWEDISH.some(known => 
    artist.toLowerCase().includes(known.toLowerCase())
  );
  return !isSwedish;
});

console.log(`After excluding known Swedish artists: ${artistsToCheck.length} to check\n`);
console.log('Artists to fix (first 50):');
artistsToCheck.slice(0, 50).forEach(a => console.log(`  - ${a}`));
if (artistsToCheck.length > 50) {
  console.log(`  ... and ${artistsToCheck.length - 50} more`);
}

console.log('\nProcessing in batches of 10...\n');

let processed = 0;
let failed = 0;

for (let i = 0; i < artistsToCheck.length; i += 10) {
  const batch = artistsToCheck.slice(i, Math.min(i + 10, artistsToCheck.length));
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
    
    if (i + 10 < artistsToCheck.length) {
      console.log('\nWaiting 2 seconds...');
      execSync('sleep 2');
    }
  } catch (error) {
    console.error(`Error processing batch: ${error.message}`);
    failed += batch.length;
  }
}

console.log('\n' + '='.repeat(60));
console.log('FIX COMPLETE');
console.log('='.repeat(60));
console.log(`Total artists processed: ${processed}`);
console.log(`Failed: ${failed}`);
console.log('\nRun analyze-geography-issues.js to verify fixes.');
