#!/usr/bin/env node
/**
 * Enrich a single song by ID or Spotify URI
 * 
 * Usage:
 *   node enrich-song.js <song-id-or-uri>
 *   node enrich-song.js cur_123456
 *   node enrich-song.js spotify:track:3W2ZcrRsInZbjWylOi6KhZ
 */

const path = require('path');
const curatedDb = require('../curatedDb');
const { enrichSong } = require('../songEnrichment');

async function main() {
  const songIdOrUri = process.argv[2];
  
  if (!songIdOrUri) {
    console.error('Usage: node enrich-song.js <song-id-or-uri>');
    process.exit(1);
  }

  console.log('='.repeat(80));
  console.log('SONG ENRICHMENT');
  console.log('='.repeat(80));
  console.log();

  // Load database
  console.log('Loading database...');
  curatedDb.load();

  // Find song
  let song = null;
  if (songIdOrUri.startsWith('spotify:track:')) {
    // Search by Spotify URI
    const { items } = curatedDb.list({ limit: 10000 });
    song = items.find(s => s.spotifyUri === songIdOrUri);
  } else {
    // Search by ID
    song = curatedDb.get(songIdOrUri);
  }

  if (!song) {
    console.error(`Song not found: ${songIdOrUri}`);
    process.exit(1);
  }

  console.log(`Found song: ${song.artist} - "${song.title}"`);
  console.log();

  // Show before state
  console.log('Before enrichment:');
  console.log(`  Genre: ${song.genre || '(missing)'}`);
  console.log(`  Geography: ${song.geography || '(missing)'}`);
  console.log(`  Preview URL: ${song.previewUrl ? 'Present' : '(missing)'}`);
  console.log(`  International: ${song.isInternational !== undefined ? song.isInternational : '(missing)'}`);
  console.log();

  // Enrich
  console.log('Enriching...');
  const enriched = await enrichSong(song, {
    fetchPreview: true,
    fetchMusicBrainz: true,
    rateLimit: true
  });

  // Update in database
  const updated = curatedDb.update(song.id, enriched);
  
  console.log();
  console.log('After enrichment:');
  console.log(`  Genre: ${updated.genre || '(still missing)'}`);
  console.log(`  Geography: ${updated.geography || '(still missing)'}`);
  console.log(`  Preview URL: ${updated.previewUrl ? 'Present' : '(still missing)'}`);
  console.log(`  International: ${updated.isInternational}`);
  console.log();

  console.log('='.repeat(80));
  console.log('✓ Song enriched and saved successfully!');
  console.log('='.repeat(80));
}

if (require.main === module) {
  main().catch(error => {
    console.error('Enrichment failed:', error);
    process.exit(1);
  });
}
