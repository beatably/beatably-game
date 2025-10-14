#!/usr/bin/env node
/**
 * Test spotify-preview-finder package
 * 
 * Tests whether the spotify-preview-finder npm package can find
 * preview URLs for songs in our curated database.
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const curatedDb = require('../curatedDb');
const spotifyPreviewFinder = require('spotify-preview-finder');

console.log('='.repeat(60));
console.log('Testing spotify-preview-finder Package');
console.log('='.repeat(60));
console.log('');

async function testSongs() {
  try {
    // Load database
    console.log('Loading curated database...');
    curatedDb.load(true);
    const { items: allSongs } = curatedDb.list({ limit: 10000 });
    
    // Take a sample - 10 recent songs and 10 older songs
    const recentSongs = allSongs.filter(s => s.year >= 2020).slice(0, 10);
    const olderSongs = allSongs.filter(s => s.year >= 1980 && s.year < 2020).slice(0, 10);
    const testSongs = [...recentSongs, ...olderSongs];
    
    console.log(`Found ${allSongs.length} songs in database`);
    console.log(`Testing ${testSongs.length} songs (${recentSongs.length} recent, ${olderSongs.length} older)`);
    console.log('');
    
    let foundPreview = 0;
    let noPreview = 0;
    let errors = 0;
    
    for (let i = 0; i < testSongs.length; i++) {
      const song = testSongs[i];
      const num = i + 1;
      
      try {
        console.log(`[${num}/${testSongs.length}] Testing: "${song.title}" by ${song.artist} (${song.year})`);
        
        // Try with artist name for better accuracy
        const result = await spotifyPreviewFinder(song.title, song.artist, 1);
        
        if (result.success && result.results.length > 0) {
          const firstResult = result.results[0];
          
          if (firstResult.previewUrls && firstResult.previewUrls.length > 0) {
            console.log(`  ✓ FOUND PREVIEW!`);
            console.log(`    Preview URL: ${firstResult.previewUrls[0]}`);
            console.log(`    Track: ${firstResult.name}`);
            console.log(`    Album: ${firstResult.albumName}`);
            foundPreview++;
          } else {
            console.log(`  ✗ No preview URL in result`);
            noPreview++;
          }
        } else {
          console.log(`  ✗ No results found`);
          noPreview++;
        }
        
        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 200));
        
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
      console.log('✓ SUCCESS! The package CAN find preview URLs!');
      console.log('  Recommendation: Proceed with full implementation');
    } else {
      console.log('✗ FAILURE: Package found 0 preview URLs');
      console.log('  Recommendation: Choose alternative approach (visual-only or different API)');
    }
    
  } catch (error) {
    console.error('Fatal error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the test
testSongs();
