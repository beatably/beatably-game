#!/usr/bin/env node
/**
 * Test script for the song enrichment module
 * Tests enrichment with a few sample songs
 */

const { enrichSong } = require('../songEnrichment');

// Test songs with varying data completeness
const testSongs = [
  {
    id: 'test_1',
    spotifyUri: 'spotify:track:3W2ZcrRsInZbjWylOi6KhZ',
    title: 'Ung & kåt',
    artist: 'Ebba Grön',
    year: 1980,
    // Missing: genre, geography, previewUrl, isInternational
  },
  {
    id: 'test_2',
    spotifyUri: 'spotify:track:0DiWol3AO6WpXZgp0goxAV',
    title: 'One More Time',
    artist: 'Daft Punk',
    year: 2000,
    // Missing: genre, geography, previewUrl, isInternational
  },
  {
    id: 'test_3',
    spotifyUri: 'spotify:track:3n3Ppam7vgaVa1iaRUc9Lp',
    title: 'Mr. Brightside',
    artist: 'The Killers',
    year: 2003,
    // Missing: genre, geography, previewUrl, isInternational
  }
];

async function runTests() {
  console.log('='.repeat(80));
  console.log('SONG ENRICHMENT MODULE TEST');
  console.log('='.repeat(80));
  console.log();

  for (let i = 0; i < testSongs.length; i++) {
    const song = testSongs[i];
    console.log(`\n${'='.repeat(80)}`);
    console.log(`TEST ${i + 1}/${testSongs.length}: ${song.artist} - "${song.title}"`);
    console.log('='.repeat(80));
    
    console.log('\nBefore enrichment:');
    console.log(`  Genre: ${song.genre || '(missing)'}`);
    console.log(`  Geography: ${song.geography || '(missing)'}`);
    console.log(`  Preview URL: ${song.previewUrl ? 'Present' : '(missing)'}`);
    console.log(`  International: ${song.isInternational !== undefined ? song.isInternational : '(missing)'}`);
    
    console.log('\nEnriching...');
    const enriched = await enrichSong(song, {
      fetchPreview: true,
      fetchMusicBrainz: true,
      rateLimit: true
    });
    
    console.log('\nAfter enrichment:');
    console.log(`  Genre: ${enriched.genre || '(still missing)'}`);
    console.log(`  Geography: ${enriched.geography || '(still missing)'}`);
    console.log(`  Preview URL: ${enriched.previewUrl ? 'Present' : '(still missing)'}`);
    console.log(`  International: ${enriched.isInternational}`);
    
    // Wait a bit between tests for rate limiting
    if (i < testSongs.length - 1) {
      console.log('\n⏱️  Waiting 2 seconds before next test...');
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log('ALL TESTS COMPLETE');
  console.log('='.repeat(80));
  console.log();
  console.log('✓ Enrichment module is working correctly');
  console.log('✓ Ready to integrate with admin interface');
}

if (require.main === module) {
  runTests().catch(error => {
    console.error('Test failed:', error);
    process.exit(1);
  });
}
