#!/usr/bin/env node
/**
 * Full Production Genre Reclassification
 * 
 * This script applies consistent genre standards to ALL tracks in the database
 * using the hybrid MusicBrainz + Spotify genre detection system.
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
  console.log('=== FULL PRODUCTION GENRE RECLASSIFICATION ===');
  console.log('Loading database...');
  
  const db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  console.log(`Total songs: ${db.length}`);
  
  // Create backup
  const ts = new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14);
  const backupFile = path.join(CACHE_DIR, `curated-songs.full-reclassify.backup.${ts}.json`);
  fs.copyFileSync(DB_FILE, backupFile);
  console.log(`Backup created: ${backupFile}`);
  
  // Get all unique artists
  const artists = uniq(db.map(s => String(s.artist || '').trim()).filter(Boolean));
  console.log(`Processing ${artists.length} unique artists...`);
  
  let processedArtists = 0;
  let processedSongs = 0;
  let updatedSongs = 0;
  
  const startTime = Date.now();
  
  for (const artist of artists) {
    processedArtists++;
    
    // Progress logging every 50 artists
    if (processedArtists % 50 === 0) {
      const elapsed = (Date.now() - startTime) / 1000;
      const rate = processedArtists / elapsed;
      const eta = (artists.length - processedArtists) / rate;
      console.log(`Progress: ${processedArtists}/${artists.length} artists (${(processedArtists/artists.length*100).toFixed(1)}%) | ETA: ${Math.round(eta/60)}min | Updated: ${updatedSongs} songs`);
    }
    
    try {
      // Get genre data for this artist
      const genreResult = await detectGenresForArtist(artist);
      
      if (genreResult && genreResult.genres.length > 0) {
        // Find all songs by this artist
        const affected = db.filter(s => (s.artist || '').trim() === artist);
        
        for (const song of affected) {
          processedSongs++;
          
          // Update genres for ALL songs to ensure consistency
          const oldGenres = Array.isArray(song.genres) ? song.genres.join(', ') : song.genre || 'unknown';
          song.genres = genreResult.genres;
          song.genre = genreResult.genres[0];
          updatedSongs++;
          
          // Log significant changes (from chart or different genres)
          if (String(song.genre || '').toLowerCase() === 'chart' || oldGenres !== genreResult.genres.join(', ')) {
            console.log(`[Update] ${artist} - ${song.title}: ${oldGenres} -> ${genreResult.genres.join(', ')} (${genreResult.sources.map(s => s.source).join(', ')})`);
          }
        }
      }
      
      // Be gentle with APIs
      await sleep(200);
      
    } catch (e) {
      console.warn(`[Error] Failed for ${artist}:`, e.message);
    }
  }
  
  // Save updated database
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8');
  
  const totalTime = (Date.now() - startTime) / 1000;
  
  console.log('\n=== RECLASSIFICATION COMPLETE ===');
  console.log(`Processed: ${processedArtists} artists, ${processedSongs} songs`);
  console.log(`Updated: ${updatedSongs} songs with new genres`);
  console.log(`Time: ${Math.round(totalTime/60)} minutes`);
  console.log(`Database saved: ${DB_FILE}`);
  console.log(`Backup available: ${backupFile}`);
  
  // Show final genre distribution
  console.log('\n=== FINAL GENRE DISTRIBUTION ===');
  const genreStats = {};
  db.forEach(song => {
    const genre = song.genre || 'unknown';
    genreStats[genre] = (genreStats[genre] || 0) + 1;
  });
  
  Object.entries(genreStats)
    .sort(([,a], [,b]) => b - a)
    .forEach(([genre, count]) => {
      console.log(`${genre}: ${count} songs (${(count/db.length*100).toFixed(1)}%)`);
    });
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
