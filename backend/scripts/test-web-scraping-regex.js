#!/usr/bin/env node
/**
 * Test Web Scraping for Preview URLs (Pure Regex)
 * 
 * No external dependencies except curatedDb
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const curatedDb = require('../curatedDb');
const https = require('https');

console.log('='.repeat(60));
console.log('Testing Web Scraping for Preview URLs (Regex)');
console.log('='.repeat(60));
console.log('');

// Simple HTTP GET using https module (no dependencies)
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

// Scrape preview URLs using regex
async function scrapePreviewUrls(spotifyUrl) {
  try {
    const html = await httpsGet(spotifyUrl);
    
    // Look for p.scdn.co/mp3-preview URLs
    const regex = /https?:\/\/p\.scdn\.co\/mp3-preview\/[a-zA-Z0-9]+(\?[^"'\s]*)?/g;
    const matches = html.match(regex);
    
    if (matches) {
      // Remove duplicates
      return [...new Set(matches)];
    }
    
    return [];
  } catch (error) {
    throw new Error(`Scraping failed: ${error.message}`);
  }
}

async function testSongs() {
  try {
    // Load database
    console.log('Loading curated database...');
    curatedDb.load(true);
    const { items: allSongs } = curatedDb.list({ limit: 10000 });
    
    // Take a larger sample to verify hit rate
    const testSongs = allSongs.slice(0, 100);
    
    console.log(`Found ${allSongs.length} songs in database`);
    console.log(`Testing ${testSongs.length} songs with regex scraping`);
    console.log('This will take ~2-3 minutes with rate limiting...');
    console.log('');
    
    let foundPreview = 0;
    let noPreview = 0;
    let errors = 0;
    
    for (let i = 0; i < testSongs.length; i++) {
      const song = testSongs[i];
      const num = i + 1;
      
      try {
        // Convert spotify:track:ID to URL
        const trackId = song.spotifyUri.replace('spotify:track:', '');
        const spotifyUrl = `https://open.spotify.com/track/${trackId}`;
        
        console.log(`[${num}/${testSongs.length}] "${song.title}" by ${song.artist} (${song.year})`);
        
        const previewUrls = await scrapePreviewUrls(spotifyUrl);
        
        if (previewUrls.length > 0) {
          console.log(`  ✅ FOUND ${previewUrls.length} PREVIEW URL(S)!`);
          previewUrls.forEach(url => console.log(`     ${url}`));
          foundPreview++;
        } else {
          console.log(`  ❌ No preview URLs found`);
          noPreview++;
        }
        
        // Delay to be respectful
        await new Promise(resolve => setTimeout(resolve, 1500));
        
      } catch (error) {
        console.log(`  ⚠️  Error: ${error.message}`);
        errors++;
      }
      
      console.log('');
    }
    
    // Summary
    console.log('='.repeat(60));
    console.log('FINAL RESULTS');
    console.log('='.repeat(60));
    console.log(`Total tested:       ${testSongs.length}`);
    console.log(`Found previews:     ${foundPreview} (${Math.round(foundPreview / testSongs.length * 100)}%)`);
    console.log(`No previews:        ${noPreview} (${Math.round(noPreview / testSongs.length * 100)}%)`);
    console.log(`Errors:             ${errors}`);
    console.log('');
    
    if (foundPreview > 0) {
      console.log('🎉 SUCCESS! WEB SCRAPING WORKS!');
      console.log('');
      console.log('✅ Preview Mode is VIABLE!');
      console.log('');
      console.log('Next Steps:');
      console.log('  1. Create script to scrape all songs in database');
      console.log('  2. Store preview URLs in database (previewUrl field)');
      console.log('  3. Implement full Preview Mode with these URLs');
      console.log('  4. GameFooter uses PreviewModeContext for playback');
      console.log('');
      console.log(`Success rate: ${Math.round(foundPreview / testSongs.length * 100)}%`);
    } else {
      console.log('❌ FAILURE: Could not scrape any preview URLs');
      console.log('');
      console.log('Possible reasons:');
      console.log('  - Spotify changed their page structure');
      console.log('  - Spotify is blocking scraping');
      console.log('  - Preview URLs no longer embedded in HTML');
    }
    
  } catch (error) {
    console.error('');
    console.error('Fatal error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

testSongs();
