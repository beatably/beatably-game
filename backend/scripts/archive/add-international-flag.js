#!/usr/bin/env node
/**
 * Migration script to add isInternational field
 * 
 * Classification rules:
 * - isBillboardChart === true → isInternational = true
 * - Artist in curated international artists list → isInternational = true
 * - Otherwise → isInternational = false
 * 
 * Also fixes incorrect origin tags and removes markets array
 */

const fs = require('fs');
const path = require('path');

const DB_FILE = path.join(__dirname, '..', 'cache', 'curated-songs.json');

// Approved international Swedish artists
const INTERNATIONAL_SWEDISH_ARTISTS = [
  'roxette',
  'ace of base',
  'neneh cherry',
  'avicii',
  'swedish house mafia',
  'abba',
  'dr. alban',
  'dr alban',
  'rednex',
  'a touch of class',
  'alesso',
  'peter bjorn and john',
  'robyn',
  'the cardigans',
  'europe',
  'the hives',
  'josé gonzález',
  'jose gonzalez',
  'sabaton'
];

// Known incorrect origin classifications (should not be SE)
const INCORRECT_SE_ORIGINS = {
  'the goo goo dolls': 'US',
  'calvin harris': 'GB',
  'sting': 'GB',
  'florence + the machine': 'GB'
};

function normalizeArtistName(name) {
  return String(name || '').toLowerCase().trim();
}

function isInternationalArtist(artistName) {
  const normalized = normalizeArtistName(artistName);
  return INTERNATIONAL_SWEDISH_ARTISTS.includes(normalized);
}

function getCorrectOrigin(artistName, currentOrigin) {
  const normalized = normalizeArtistName(artistName);
  
  // Check if this artist has been incorrectly tagged as Swedish
  if (currentOrigin === 'SE' && INCORRECT_SE_ORIGINS[normalized]) {
    return INCORRECT_SE_ORIGINS[normalized];
  }
  
  return currentOrigin;
}

function main() {
  console.log('='.repeat(80));
  console.log('MIGRATION: Add isInternational field');
  console.log('='.repeat(80));
  console.log();

  // Load database
  console.log(`Loading database from ${DB_FILE}...`);
  const data = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  console.log(`Loaded ${data.length} songs\n`);

  // Create backup
  const backupFile = DB_FILE.replace('.json', `.backup-${Date.now()}.json`);
  fs.writeFileSync(backupFile, JSON.stringify(data, null, 2));
  console.log(`✓ Backup created: ${backupFile}\n`);

  // Statistics
  let stats = {
    total: data.length,
    addedIsInternational: 0,
    markedInternational: 0,
    markedLocal: 0,
    fixedOrigin: 0,
    removedMarkets: 0,
    byReason: {
      billboard: 0,
      artistList: 0,
      local: 0
    }
  };

  // Process each song
  console.log('Processing songs...\n');
  
  data.forEach((song, idx) => {
    let changed = false;
    const originalOrigin = song.geography;
    
    // Fix incorrect origin first
    const correctOrigin = getCorrectOrigin(song.artist, song.geography);
    if (correctOrigin !== song.geography) {
      console.log(`  Fixing origin: ${song.artist} - "${song.title}": ${song.geography} → ${correctOrigin}`);
      song.geography = correctOrigin;
      stats.fixedOrigin++;
      changed = true;
    }
    
    // Determine isInternational
    let isInternational = false;
    let reason = 'local';
    
    if (song.isBillboardChart) {
      isInternational = true;
      reason = 'billboard';
      stats.byReason.billboard++;
    } else if (isInternationalArtist(song.artist)) {
      isInternational = true;
      reason = 'artistList';
      stats.byReason.artistList++;
    } else {
      isInternational = false;
      reason = 'local';
      stats.byReason.local++;
    }
    
    // Add the field if it doesn't exist or update if different
    if (song.isInternational !== isInternational) {
      song.isInternational = isInternational;
      stats.addedIsInternational++;
      changed = true;
      
      if (isInternational) {
        stats.markedInternational++;
      } else {
        stats.markedLocal++;
      }
    }
    
    // Remove markets array (it was causing confusion)
    if (song.markets) {
      delete song.markets;
      stats.removedMarkets++;
      changed = true;
    }
    
    // Progress indicator
    if ((idx + 1) % 500 === 0) {
      console.log(`  Processed ${idx + 1}/${data.length} songs...`);
    }
  });

  console.log('\n' + '='.repeat(80));
  console.log('MIGRATION STATISTICS');
  console.log('='.repeat(80));
  console.log();
  console.log(`Total songs processed: ${stats.total}`);
  console.log(`Songs with isInternational added/updated: ${stats.addedIsInternational}`);
  console.log(`  - Marked as international: ${stats.markedInternational}`);
  console.log(`  - Marked as local: ${stats.markedLocal}`);
  console.log();
  console.log('Classification breakdown:');
  console.log(`  - Billboard chart: ${stats.byReason.billboard}`);
  console.log(`  - International artist list: ${stats.byReason.artistList}`);
  console.log(`  - Local only: ${stats.byReason.local}`);
  console.log();
  console.log(`Origin corrections: ${stats.fixedOrigin}`);
  console.log(`Markets arrays removed: ${stats.removedMarkets}`);
  console.log();

  // Save updated database
  console.log(`Saving updated database to ${DB_FILE}...`);
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
  console.log('✓ Database updated successfully!\n');

  // Show sample results
  console.log('='.repeat(80));
  console.log('SAMPLE RESULTS');
  console.log('='.repeat(80));
  console.log();
  
  // Show some international Swedish songs
  const internationalSwedish = data.filter(s => 
    s.geography === 'SE' && s.isInternational
  ).slice(0, 5);
  
  if (internationalSwedish.length > 0) {
    console.log('International Swedish songs (sample):');
    internationalSwedish.forEach(s => {
      console.log(`  - ${s.artist} - "${s.title}" (${s.year})`);
    });
    console.log();
  }
  
  // Show some local Swedish songs
  const localSwedish = data.filter(s => 
    s.geography === 'SE' && !s.isInternational
  ).slice(0, 5);
  
  if (localSwedish.length > 0) {
    console.log('Local Swedish songs (sample):');
    localSwedish.forEach(s => {
      console.log(`  - ${s.artist} - "${s.title}" (${s.year})`);
    });
    console.log();
  }

  console.log('='.repeat(80));
  console.log('MIGRATION COMPLETE');
  console.log('='.repeat(80));
  console.log();
  console.log('Next steps:');
  console.log('1. Review the sample results above');
  console.log('2. Test the gameplay filtering with the new isInternational field');
  console.log('3. Update backend/frontend to use isInternational for game modes');
  console.log();
}

if (require.main === module) {
  main();
}

module.exports = { INTERNATIONAL_SWEDISH_ARTISTS, INCORRECT_SE_ORIGINS };
