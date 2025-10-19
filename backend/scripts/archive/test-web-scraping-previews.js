#!/usr/bin/env node
/**
 * Test Web Scraping for Preview URLs
 * 
 * Tests if we can scrape preview URLs from Spotify's web pages
 * (This is what spotify-preview-finder does internally)
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const curatedDb = require('../curatedDb');
const axios = require('axios');
const cheerio = require('cheerio');

console.log('='.repeat(60));
console.log('Testing Web Scraping for Preview URLs');
console.log('='.repeat(60));
console.log('');

// Scrape preview URLs from Spotify web page
async function scrapePreviewUrls(spotifyUrl) {
  try {
    const response = await axios.get(spotifyUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
      }
    });
    
    const html = response.data;
    const $ = cheerio.load(html);
    const previewUrls = new Set();
    
    // Look for p.scdn.co URLs (Spotify CDN for preview MP3s)
    $('*').each((i, element) => {
      const attrs = element.attribs;
      Object.values(attrs).forEach(value => {
        if (value && value.includes('p.scdn.co')) {
          previewUrls.add(value);
        }
      });
    });
    
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
        
        console.log(`[${num}/${testSongs.length}] Testing: "${song.title}" by ${song.artist} (${song.year})`);
        console.log(`  URL: ${spotifyUrl}`);
        
        const previewUrls = await scrapePreviewUrls(spotifyUrl);
        
        if (previewUrls.length > 0) {
          console.log(`  ✓ FOUND ${previewUrls.length} PREVIEW URL(S)!`);
          previewUrls.forEach(url => console.log(`    ${url}`));
          foundPreview++;
        } else {
          console.log(`  ✗ No preview URLs found in HTML`);
          noPreview++;
        }
        
        // Delay to be respectful to Spotify's servers
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
      console.log('✓ SUCCESS! Web scraping WORKS for getting preview URLs!');
      console.log('  We can use this approach to populate our database with previews.');
      console.log('');
      console.log('Next steps:');
      console.log('  1. Create script to scrape previews for all songs in database');
      console.log('  2. Store scraped preview URLs in database');
      console.log('  3. Implement PreviewMode with these URLs');
    } else {
      console.log('✗ FAILURE: Web scraping found 0 preview URLs');
      console.log('  Spotify may have changed their page structure');
    }
    
  } catch (error) {
    console.error('Fatal error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Check if axios and cheerio are installed
try {
  require.resolve('axios');
  require.resolve('cheerio');
  testSongs();
} catch (e) {
  console.error('Error: axios and cheerio are required');
  console.error('Run: npm install axios cheerio');
  process.exit(1);
}
