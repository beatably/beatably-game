#!/usr/bin/env node
/**
 * Simple test script to debug the reclassification issue
 */

const fs = require('fs');
const path = require('path');

// Load env
try { require('dotenv').config({ path: path.join(__dirname, '..', '.env') }); } catch (_) {}

const { detectGeographyForArtist, detectGenresForArtist } = require('../geographyDetection');

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function uniq(arr) { return Array.from(new Set(arr)); }

const CACHE_DIR = path.join(__dirname, '..', 'cache');
const DB_FILE = path.join(CACHE_DIR, 'curated-songs.json');

async function main() {
  console.log('Loading database...');
  const db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  console.log(`Total songs: ${db.length}`);
  
  // Get first 5 unique artists
  const artists = uniq(db.map(s => String(s.artist || '').trim()).filter(Boolean)).slice(0, 5);
  console.log(`Testing with ${artists.length} artists:`, artists);
  
  let processedSongs = 0;
  
  for (const artist of artists) {
    console.log(`\n--- Processing: ${artist} ---`);
    
    try {
      // Test genre detection
      const genreResult = await detectGenresForArtist(artist);
      console.log(`Genre result:`, genreResult);
      
      if (genreResult && genreResult.genres.length > 0) {
        // Find songs by this artist
        const affected = db.filter(s => (s.artist || '').trim() === artist);
        console.log(`Found ${affected.length} songs by ${artist}`);
        
        for (const song of affected) {
          console.log(`  - ${song.title}: ${song.genre} -> ${genreResult.genres.join(', ')}`);
          song.genres = genreResult.genres;
          song.genre = genreResult.genres[0];
          processedSongs++;
        }
      }
      
      await sleep(200); // Be gentle with MusicBrainz
    } catch (e) {
      console.error(`Failed for ${artist}:`, e.message);
    }
  }
  
  console.log(`\nProcessed ${processedSongs} songs`);
  
  // Show some results
  console.log('\nSample updated songs:');
  db.filter(s => Array.isArray(s.genres) && s.genres.length > 0).slice(0, 10).forEach(s => {
    console.log(`  ${s.artist} - ${s.title}: ${s.genres.join(', ')}`);
  });
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
