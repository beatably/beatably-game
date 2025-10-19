#!/usr/bin/env node
/**
 * Test Web Scraping for Preview URLs (Simple Version)
 * 
 * Uses native fetch to avoid Node version conflicts
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const curatedDb = require('../curatedDb');
const cheerio = require('cheerio');

console.log('='.repeat(60));
console.log('Testing Web Scraping for Preview URLs');
console.log('='.repeat(60));
console.log('');

// Scrape preview URLs from Spotify web page
async function scrapePreviewUrls(spotifyUrl) {
  try {
    const response = await fetch(spotifyUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const html = await response.text();
    const $ = cheerio.load(html);
    const previewUrls = new Set();
    
    // Look for p.scdn.co URLs (Spotify CDN for preview MP3s)
    $('*').each((i, element) => {
      const attrs = element.attribs;
      Object.values(attrs).forEach(value => {
        if (value && value.includes('p.scdn.co') && value.includes('.mp3')) {
          previewUrls.add(value);
        }
      });
    });
    
    // Also search in script tags and page source
    if (previewUrls.size === 0) {
      const matches = html.match(/https:\/\/p\.scdn\.co\/mp3-preview\/[a-zA-Z0-9]+/g);
      if (matches) {
        matches.forEach(url => previewUrls.add(url));
      }
    }
    
    return Array.from(previewUrls);
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
    
    // Take a small sample
    const testSongs = allSongs.slice(0, 10);
    
    console.log(`Found ${allSongs.length} songs in database`);
    console.log(`Testing ${testSongs.length} songs with web scraping`);
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
          console.log(`  ✓ FOUND ${previewUrls.length} PREVIEW URL(S)!`);
          previewUrls.forEach(url => console.log(`    ${url}`));
          foundPreview++;
        } else {
          console.log(`  ✗ No preview URLs in HTML`);
          noPreview++;
        }
        
        // Delay to be respectful
        await new Promise(resolve => setTimeout(resolve, 1000));
        
      } catch (error) {
        console.log(`  ❌ Error: ${error.message}`);
        errors++;
      }
      
      console.log('');
    }
    
    // Summary
    console.log('='.repeat(60));
    console.log('TEST RESULTS');
    console.log('='.repeat(60));
    console.log(`Total tested:       ${testSongs.length}`);
    console.log(`Found previews:     ${foundPreview} (${Math.round(foundPreview / testSongs.length * 100)}%)`);
    console.log(`No previews:        ${noPreview} (${Math.round(noPreview / testSongs.length * 100)}%)`);
    console.log(`Errors:             ${errors}`);
    console.log('');
    
    if (foundPreview > 0) {
      console.log('✅ SUCCESS! Web scraping WORKS!');
      console.log('');
      console.log('This means we can:');
      console.log('  1. Scrape preview URLs for all songs');
      console.log('  2. Store them in the database');
      console.log('  3. Implement Preview Mode with real audio!');
      console.log('');
      console.log('The spotify-preview-finder package approach is viable!');
    } else {
      console.log('❌ FAILURE: Could not scrape preview URLs');
      console.log('  Spotify may have changed their page structure');
      console.log('  Or they may be blocking scraping attempts');
    }
    
  } catch (error) {
    console.error('Fatal error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

testSongs();
