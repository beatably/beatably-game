#!/usr/bin/env node
/**
 * Populate Preview URLs for All Songs
 * 
 * Scrapes Spotify web pages to get preview URLs for all songs in the database.
 * This is a one-time operation (or run when adding many new songs).
 * 
 * Usage:
 *   node scripts/populate-preview-urls.js [options]
 * 
 * Options:
 *   --dry-run       Show what would be updated without saving
 *   --limit=N       Only process first N songs (for testing)
 *   --force         Re-scrape songs that already have preview URLs
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const curatedDb = require('../curatedDb');
const https = require('https');

// Parse command line arguments
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const isForce = args.includes('--force');
const limitArg = args.find(arg => arg.startsWith('--limit='));
const limitSongs = limitArg ? parseInt(limitArg.split('=')[1], 10) : null;

console.log('='.repeat(60));
console.log('Populate Preview URLs for Curated Database');
console.log('='.repeat(60));
console.log('Mode:', isDryRun ? 'DRY RUN (no changes)' : 'LIVE');
console.log('Force re-scrape:', isForce ? 'YES' : 'NO');
if (limitSongs) {
  console.log('Limit:', `${limitSongs} songs (testing)`);
}
console.log('');

// Simple HTTPS GET
function httpsGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

// Scrape preview URLs from Spotify web page
async function scrapePreviewUrl(spotifyUrl) {
  try {
    const html = await httpsGet(spotifyUrl);
    const regex = /https?:\/\/p\.scdn\.co\/mp3-preview\/[a-zA-Z0-9]+(\?[^"'\s]*)?/g;
    const matches = html.match(regex);
    
    if (matches && matches.length > 0) {
      // Return first match (they're usually the same)
      return matches[0];
    }
    
    return null;
  } catch (error) {
    throw new Error(`Scraping failed: ${error.message}`);
  }
}

// Process songs in batches
async function processSongs() {
  try {
    console.log('Loading curated database...');
    curatedDb.load(true);
    let { items: allSongs } = curatedDb.list({ limit: 10000 });
    
    // Filter songs that need processing
    let songsToProcess = allSongs;
    if (!isForce) {
      songsToProcess = allSongs.filter(s => !s.previewUrl);
      console.log(`Found ${allSongs.length} total songs`);
      console.log(`${songsToProcess.length} songs need preview URLs`);
      console.log(`${allSongs.length - songsToProcess.length} songs already have preview URLs (skipping)`);
    } else {
      console.log(`Found ${allSongs.length} songs in database`);
      console.log('Force mode: will re-scrape all songs');
    }
    
    // Apply limit if specified
    if (limitSongs && songsToProcess.length > limitSongs) {
      console.log(`Limiting to first ${limitSongs} songs for testing`);
      songsToProcess = songsToProcess.slice(0, limitSongs);
    }
    
    if (songsToProcess.length === 0) {
      console.log('');
      console.log('✓ All songs already have preview URLs!');
      console.log('  Use --force to re-scrape');
      return;
    }
    
    console.log('');
    console.log(`Processing ${songsToProcess.length} songs...`);
    console.log(`Estimated time: ${Math.round(songsToProcess.length * 1.5 / 60)} minutes`);
    console.log('');
    
    let foundPreview = 0;
    let noPreview = 0;
    let errors = 0;
    const updates = [];
    
    const startTime = Date.now();
    
    for (let i = 0; i < songsToProcess.length; i++) {
      const song = songsToProcess[i];
      const num = i + 1;
      
      try {
        const trackId = song.spotifyUri.replace('spotify:track:', '');
        const spotifyUrl = `https://open.spotify.com/track/${trackId}`;
        
        // Progress indicator every 50 songs
        if (num % 50 === 0) {
          const elapsed = Math.round((Date.now() - startTime) / 1000 / 60);
          const rate = num / elapsed;
          const remaining = Math.round((songsToProcess.length - num) / rate);
          console.log(`[${num}/${songsToProcess.length}] Progress: ${Math.round(num/songsToProcess.length*100)}% | Elapsed: ${elapsed}m | Remaining: ~${remaining}m`);
        }
        
        const previewUrl = await scrapePreviewUrl(spotifyUrl);
        
        if (previewUrl) {
          foundPreview++;
          updates.push({
            id: song.id,
            previewUrl: previewUrl,
            hasPreview: true
          });
        } else {
          noPreview++;
          updates.push({
            id: song.id,
            previewUrl: null,
            hasPreview: false
          });
        }
        
        // Rate limiting: 2 seconds between requests (conservative to avoid detection)
        // For 3690 songs, this takes ~2 hours but is much safer
        await new Promise(resolve => setTimeout(resolve, 2000));
        
      } catch (error) {
        console.log(`[${num}/${songsToProcess.length}] Error: "${song.title}" - ${error.message}`);
        errors++;
      }
    }
    
    // Update database if not dry run
    if (!isDryRun && updates.length > 0) {
      console.log('');
      console.log('Updating database...');
      
      let updateCount = 0;
      for (const update of updates) {
        const success = curatedDb.update(update.id, {
          previewUrl: update.previewUrl,
          hasPreview: update.hasPreview
        });
        
        if (success) {
          updateCount++;
        }
      }
      
      console.log(`✓ Updated ${updateCount} songs in database`);
    }
    
    // Summary
    console.log('');
    console.log('='.repeat(60));
    console.log('SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total processed:    ${songsToProcess.length}`);
    console.log(`Found previews:     ${foundPreview} (${Math.round(foundPreview / songsToProcess.length * 100)}%)`);
    console.log(`No previews:        ${noPreview} (${Math.round(noPreview / songsToProcess.length * 100)}%)`);
    console.log(`Errors:             ${errors}`);
    console.log(`Time elapsed:       ${Math.round((Date.now() - startTime) / 1000 / 60)} minutes`);
    console.log('');
    
    if (isDryRun) {
      console.log('DRY RUN: No changes were made to the database');
      console.log('Run without --dry-run to save changes');
    } else {
      console.log('✓ Database updated successfully');
      console.log('');
      console.log('Next steps:');
      console.log('  1. Restart backend server to load new preview URLs');
      console.log('  2. Test Preview Mode: http://localhost:5173/?preview-mode=true');
    }
    
  } catch (error) {
    console.error('');
    console.error('Fatal error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the script
processSongs();
