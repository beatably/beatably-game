#!/usr/bin/env node
/**
 * Analyze Geography Classification Issues
 * Quick analysis to identify songs with potentially incorrect geography
 */

const fs = require('fs');
const path = require('path');

const DB_FILE = path.join(__dirname, '..', 'cache', 'curated-songs.json');

function main() {
  console.log('='.repeat(60));
  console.log('GEOGRAPHY CLASSIFICATION ANALYSIS');
  console.log('='.repeat(60));
  
  const data = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  console.log('\nTotal songs:', data.length);
  
  // Geography distribution
  const geoStats = {};
  data.forEach(s => {
    const geo = s.geography || 'unknown';
    geoStats[geo] = (geoStats[geo] || 0) + 1;
  });
  
  console.log('\nGeography breakdown:');
  Object.entries(geoStats).sort((a, b) => b[1] - a[1]).forEach(([geo, count]) => {
    const pct = (count / data.length * 100).toFixed(1);
    console.log(`  ${geo.padEnd(8)}: ${count.toString().padStart(4)} songs (${pct}%)`);
  });
  
  // Artists with mixed geography
  const artistGeos = {};
  const artistSongs = {};
  data.forEach(s => {
    const artist = s.artist || 'unknown';
    if (!artistGeos[artist]) {
      artistGeos[artist] = new Set();
      artistSongs[artist] = [];
    }
    artistGeos[artist].add(s.geography || 'unknown');
    artistSongs[artist].push(s);
  });
  
  const mixedArtists = Object.entries(artistGeos)
    .filter(([artist, geos]) => geos.size > 1)
    .map(([artist, geos]) => ({
      artist,
      geos: Array.from(geos),
      songCount: artistSongs[artist].length
    }))
    .sort((a, b) => b.songCount - a.songCount);
  
  console.log('\n' + '='.repeat(60));
  console.log('ARTISTS WITH MIXED GEOGRAPHY (SUSPICIOUS)');
  console.log('='.repeat(60));
  console.log(`\nFound ${mixedArtists.length} artists with inconsistent geography:\n`);
  
  mixedArtists.slice(0, 30).forEach(({ artist, geos, songCount }) => {
    console.log(`  ${artist.padEnd(30)} - ${songCount} songs - Geos: ${geos.join(', ')}`);
  });
  
  if (mixedArtists.length > 30) {
    console.log(`\n  ... and ${mixedArtists.length - 30} more artists`);
  }
  
  // Suspicious SE classifications
  const suspiciousSE = data.filter(s => 
    s.geography === 'SE' && 
    s.isBillboardChart === true
  );
  
  console.log('\n' + '='.repeat(60));
  console.log('SUSPICIOUS SE CLASSIFICATIONS (Billboard songs)');
  console.log('='.repeat(60));
  console.log(`\nFound ${suspiciousSE.length} Billboard songs marked as SE:\n`);
  
  suspiciousSE.slice(0, 50).forEach(s => {
    const title = s.title.substring(0, 40).padEnd(40);
    console.log(`  ${s.artist.padEnd(30)} - ${title} (${s.year})`);
  });
  
  if (suspiciousSE.length > 50) {
    console.log(`\n  ... and ${suspiciousSE.length - 50} more`);
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));
  console.log(`Total artists with mixed geography: ${mixedArtists.length}`);
  console.log(`Billboard songs incorrectly marked as SE: ${suspiciousSE.length}`);
  console.log('\nRecommendation: Run reclassify-batched.js to fix these issues');
}

if (require.main === module) {
  main();
}
