#!/usr/bin/env node
/**
 * Test Spotify Search API for Preview URLs
 * 
 * Tests if Spotify's Search API returns preview URLs
 * (This is what spotify-preview-finder does internally)
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const curatedDb = require('../curatedDb');

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;

console.log('='.repeat(60));
console.log('Testing Spotify Search API for Preview URLs');
console.log('='.repeat(60));
console.log('');

// Get Spotify access token
async function getSpotifyToken() {
  const auth = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
  
  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: 'grant_type=client_credentials'
  });
  
  const data = await response.json();
  return data.access_token;
}

// Search for track using Spotify Search API
async function searchTrack(artist, title, token) {
  const query = `artist:"${artist}" track:"${title}"`;
  
  const response = await fetch(`https://api.spotify.com/v1/search?` + new URLSearchParams({
    q: query,
    type: 'track',
    limit: 1,
    market: 'SE'
  }), {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  
  const data = await response.json();
  const tracks = data.tracks?.items || [];
  
  if (tracks.length > 0) {
    const track = tracks[0];
    return {
      found: true,
      name: track.name,
      artists: track.artists.map(a => a.name).join(', '),
      album: track.album.name,
      previewUrl: track.preview_url,
      spotifyUrl: track.external_urls.spotify
    };
  }
  
  return { found: false };
}

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
    
    // Get token
    console.log('Getting Spotify access token...');
    const token = await getSpotifyToken();
    console.log('✓ Token obtained');
    console.log('');
    
    let foundPreview = 0;
    let noPreview = 0;
    let errors = 0;
    
    for (let i = 0; i < testSongs.length; i++) {
      const song = testSongs[i];
      const num = i + 1;
      
      try {
        console.log(`[${num}/${testSongs.length}] Testing: "${song.title}" by ${song.artist} (${song.year})`);
        
        const result = await searchTrack(song.artist, song.title, token);
        
        if (result.found) {
          if (result.previewUrl) {
            console.log(`  ✓ FOUND PREVIEW!`);
            console.log(`    Preview URL: ${result.previewUrl}`);
            console.log(`    Track: ${result.name} - ${result.artists}`);
            console.log(`    Album: ${result.album}`);
            foundPreview++;
          } else {
            console.log(`  ✗ No preview URL (track found but preview_url is null)`);
            noPreview++;
          }
        } else {
          console.log(`  ✗ No results found in search`);
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
      console.log('✓ SUCCESS! Spotify Search API returns preview URLs!');
      console.log('  Recommendation: spotify-preview-finder package would work (if Node version compatible)');
      console.log('  Alternative: We can build our own search-based solution');
    } else {
      console.log('✗ FAILURE: Spotify Search API returns 0 preview URLs');
      console.log('  Recommendation: Choose alternative approach (visual-only or different API)');
      console.log('  Note: This confirms Spotify has deprecated/removed preview URLs');
    }
    
  } catch (error) {
    console.error('Fatal error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the test
testSongs();
