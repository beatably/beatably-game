#!/usr/bin/env node
/**
 * Test Web Scraping for Preview URLs - 1980s Songs
 * 
 * Tests older songs to verify scraping works across different eras
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const curatedDb = require('../curatedDb');
const https = require('https');

console.log('='.repeat(60));
console.log('Testing Web Scraping - 1980s/1990s Songs');
console.log('='.repeat(60));
console.log('');

// Simple HTTP GET using https module
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
    const regex = /https?:\/\/p\.scdn\.co\/mp3-preview\/[a-zA-Z0-9]+(\?[^"'\s]*)?/g;
    const matches = html.match(regex);
    
    if (matches) {
      return [...new Set(matches)];
    }
    
    return [];
  } catch (error) {
    throw new Error(`Scraping failed: ${error.message}`);
  }
}

async function testSongs() {
  try {
    console.log('Loading curated database...');
    curatedDb.load(true);
    const { items: allSongs } = curatedDb.list({ limit: 10000 });
    
    // Filter for 1980s and 1990s songs
    const oldSongs = allSongs.filter(s => s.year >= 1980 && s.year < 2000);
    const testSongs = oldSongs.slice(0, 40);
    
    console.log(`Found ${allSongs.length} songs in database`);
    console.log(`Found ${oldSongs.length} songs from 1980-1999`);
    console.log(`Testing ${testSongs.length} older songs`);
    console.log('This will take ~1 minute...');
    console.log('');
    
    let foundPreview = 0;
    let noPreview = 0;
    let errors = 0;
    
    for (let i = 0; i < testSongs.length; i++) {
      const song = testSongs[i];
      const num = i + 1;
      
      try {
        const trackId = song.spotifyUri.replace('spotify:track:', '');
        const spotifyUrl = `https://open.spotify.com/track/${trackId}`;
        
        console.log(`[${num}/${testSongs.length}] "${song.title}" by ${song.artist} (${song.year})`);
        
        const previewUrls = await scrapePreviewUrls(spotifyUrl);
        
        if (previewUrls.length > 0) {
          console.log(`  ✅ FOUND!`);
          foundPreview++;
        } else {
          console.log(`  ❌ No preview`);
          noPreview++;
        }
        
        await new Promise(resolve => setTimeout(resolve, 1000));
        
      } catch (error) {
        console.log(`  ⚠️  Error: ${error.message}`);
        errors++;
      }
    }
    
    // Summary
    console.log('');
    console.log('='.repeat(60));
    console.log('FINAL RESULTS - 1980s/1990s SONGS');
    console.log('='.repeat(60));
    console.log(`Total tested:       ${testSongs.length}`);
    console.log(`Found previews:     ${foundPreview} (${Math.round(foundPreview / testSongs.length * 100)}%)`);
    console.log(`No previews:        ${noPreview} (${Math.round(noPreview / testSongs.length * 100)}%)`);
    console.log(`Errors:             ${errors}`);
    console.log('');
    
    if (foundPreview / testSongs.length >= 0.7) {
      console.log('✅ EXCELLENT! 70%+ success rate');
      console.log('   Web scraping works great for older songs too!');
      console.log('');
      console.log('📊 Combined Results:');
      console.log('   - 2020s songs: 52/52 (100%)');
      console.log(`   - 1980s/1990s: ${foundPreview}/${testSongs.length} (${Math.round(foundPreview / testSongs.length * 100)}%)`);
      console.log('');
      console.log('✅ RECOMMENDATION: Proceed with implementation!');
      console.log('   Use simple regex scraper - it works great!');
    } else {
      console.log(`⚠️  Only ${Math.round(foundPreview / testSongs.length * 100)}% success rate`);
      console.log('   Consider upgrading Node 20 to use spotify-preview-finder package');
    }
    
  } catch (error) {
    console.error('Fatal error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

testSongs();
