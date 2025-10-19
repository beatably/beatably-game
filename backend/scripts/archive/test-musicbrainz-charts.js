#!/usr/bin/env node
/**
 * Test script to explore MusicBrainz chart data availability
 * Tests with known songs to see what chart information we can get
 */

const axios = require('axios');

const MB_BASE = 'https://musicbrainz.org/ws/2';
const USER_AGENT = 'beatably/1.0 (chart-research)';

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function searchRecording(artist, title) {
  try {
    const query = `artist:"${artist}" AND recording:"${title}"`;
    const url = `${MB_BASE}/recording`;
    
    console.log(`\nSearching: ${artist} - "${title}"`);
    console.log(`Query: ${query}`);
    
    const response = await axios.get(url, {
      params: {
        query,
        fmt: 'json',
        limit: 3
      },
      headers: {
        'User-Agent': USER_AGENT
      }
    });
    
    const recordings = response.data.recordings || [];
    console.log(`Found ${recordings.length} recording(s)`);
    
    if (recordings.length === 0) {
      console.log('❌ No recordings found');
      return null;
    }
    
    // Take the best match (highest score)
    const best = recordings[0];
    console.log(`Best match: "${best.title}" by ${best['artist-credit']?.[0]?.name || 'Unknown'}`);
    console.log(`  Recording ID: ${best.id}`);
    console.log(`  Score: ${best.score}`);
    
    return best.id;
  } catch (error) {
    console.error(`Error searching: ${error.message}`);
    return null;
  }
}

async function getRecordingDetails(recordingId) {
  try {
    const url = `${MB_BASE}/recording/${recordingId}`;
    
    console.log(`\nFetching recording details...`);
    
    const response = await axios.get(url, {
      params: {
        fmt: 'json',
        inc: 'releases+artist-credits+tags+ratings+genres'
      },
      headers: {
        'User-Agent': USER_AGENT
      }
    });
    
    const recording = response.data;
    
    console.log(`\nRecording: "${recording.title}"`);
    console.log(`Duration: ${recording.length ? (recording.length / 1000).toFixed(0) + 's' : 'Unknown'}`);
    
    if (recording.tags && recording.tags.length > 0) {
      console.log(`Tags: ${recording.tags.slice(0, 5).map(t => t.name).join(', ')}`);
    }
    
    if (recording.releases && recording.releases.length > 0) {
      console.log(`\nReleases (${recording.releases.length}):`);
      recording.releases.slice(0, 5).forEach(release => {
        const countries = release.country || release['release-events']?.[0]?.area?.['iso-3166-1-codes']?.[0] || 'Unknown';
        console.log(`  - "${release.title}" (${release.date || 'No date'}) [${countries}]`);
      });
    }
    
    return recording;
  } catch (error) {
    console.error(`Error fetching details: ${error.message}`);
    return null;
  }
}

async function searchRelease(artist, title) {
  try {
    const query = `artist:"${artist}" AND release:"${title}"`;
    const url = `${MB_BASE}/release`;
    
    console.log(`\n\n=== Searching for RELEASE (might have chart data) ===`);
    console.log(`Query: ${query}`);
    
    const response = await axios.get(url, {
      params: {
        query,
        fmt: 'json',
        limit: 5
      },
      headers: {
        'User-Agent': USER_AGENT
      }
    });
    
    const releases = response.data.releases || [];
    console.log(`Found ${releases.length} release(s)`);
    
    if (releases.length === 0) {
      console.log('❌ No releases found');
      return null;
    }
    
    for (let i = 0; i < Math.min(3, releases.length); i++) {
      const release = releases[i];
      console.log(`\nRelease ${i+1}: "${release.title}"`);
      console.log(`  ID: ${release.id}`);
      console.log(`  Date: ${release.date || 'Unknown'}`);
      console.log(`  Country: ${release.country || 'Unknown'}`);
      console.log(`  Score: ${release.score}`);
      
      // Check if there's any chart-related data in the release events
      if (release['release-events']) {
        console.log(`  Release events: ${release['release-events'].length}`);
      }
    }
    
    return releases[0].id;
  } catch (error) {
    console.error(`Error searching releases: ${error.message}`);
    return null;
  }
}

async function getReleaseGroup(releaseId) {
  try {
    const url = `${MB_BASE}/release/${releaseId}`;
    
    console.log(`\n\nFetching release details with relationships...`);
    
    const response = await axios.get(url, {
      params: {
        fmt: 'json',
        inc: 'release-groups+recordings+artist-credits+labels+relationships'
      },
      headers: {
        'User-Agent': USER_AGENT
      }
    });
    
    const release = response.data;
    
    console.log(`\nRelease: "${release.title}"`);
    console.log(`Status: ${release.status || 'Unknown'}`);
    console.log(`Barcode: ${release.barcode || 'None'}`);
    
    // Check for any chart-related relationships
    if (release.relationships && release.relationships.length > 0) {
      console.log(`\nRelationships found: ${release.relationships.length}`);
      release.relationships.forEach(rel => {
        console.log(`  - Type: ${rel.type}`);
        if (rel.url) {
          console.log(`    URL: ${rel.url.resource}`);
        }
      });
    } else {
      console.log(`\nNo relationships found (no chart data?)`);
    }
    
    return release;
  } catch (error) {
    console.error(`Error fetching release details: ${error.message}`);
    return null;
  }
}

async function testSong(artist, title) {
  console.log('\n' + '='.repeat(80));
  console.log(`TEST: ${artist} - "${title}"`);
  console.log('='.repeat(80));
  
  // Search for recording
  const recordingId = await searchRecording(artist, title);
  await sleep(1000); // MusicBrainz rate limiting
  
  if (recordingId) {
    await getRecordingDetails(recordingId);
    await sleep(1000);
  }
  
  // Also try searching for release (singles might have chart data)
  const releaseId = await searchRelease(artist, title);
  await sleep(1000);
  
  if (releaseId) {
    await getReleaseGroup(releaseId);
    await sleep(1000);
  }
}

async function main() {
  console.log('='.repeat(80));
  console.log('MUSICBRAINZ CHART DATA RESEARCH');
  console.log('='.repeat(80));
  console.log('Testing with known songs to see what chart data is available\n');
  
  // Test with known international hit
  await testSong('ABBA', 'Dancing Queen');
  await sleep(1500);
  
  // Test with Swedish international artist
  await testSong('Robyn', 'Dancing On My Own');
  await sleep(1500);
  
  // Test with local Swedish song
  await testSong('Ebba Grön', 'Ung & kåt');
  await sleep(1500);
  
  console.log('\n' + '='.repeat(80));
  console.log('RESEARCH COMPLETE');
  console.log('='.repeat(80));
  console.log('\nKEY FINDINGS:');
  console.log('- Check above output to see if MusicBrainz provides chart positions');
  console.log('- Look for "relationships" that might link to chart data');
  console.log('- Note: MusicBrainz may not have comprehensive chart data');
  console.log('\nNEXT STEPS:');
  console.log('- If chart data is limited, consider alternative sources');
  console.log('- May need to use a combination of Billboard + curated lists');
  console.log('- Could integrate with other APIs (Last.fm, Discogs, etc.)');
}

if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}
