#!/usr/bin/env node
/**
 * Check non-Swedish songs classified as local-only
 * This helps validate classification accuracy
 */

const fs = require('fs');
const path = require('path');

const DB_FILE = path.join(__dirname, '..', 'cache', 'curated-songs.json');

console.log('Loading database...');
const data = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));

// Find non-Swedish songs that are local-only
const localNonSwedish = data.filter(s => 
  s.geography !== 'SE' && 
  !s.isInternational
);

console.log('='.repeat(80));
console.log('NON-SWEDISH SONGS CLASSIFIED AS LOCAL-ONLY');
console.log('='.repeat(80));
console.log();
console.log(`Total: ${localNonSwedish.length} songs`);
console.log();

// Group by geography
const byCountry = {};
localNonSwedish.forEach(s => {
  const country = s.geography || 'Unknown';
  if (!byCountry[country]) {
    byCountry[country] = [];
  }
  byCountry[country].push(s);
});

// Show breakdown by country
console.log('BREAKDOWN BY COUNTRY:');
console.log('-'.repeat(80));
Object.keys(byCountry).sort((a, b) => byCountry[b].length - byCountry[a].length).forEach(country => {
  console.log(`${country}: ${byCountry[country].length} songs`);
});
console.log();

// Show sample from each major country (top 5)
const topCountries = Object.keys(byCountry)
  .sort((a, b) => byCountry[b].length - byCountry[a].length)
  .slice(0, 5);

topCountries.forEach(country => {
  console.log('='.repeat(80));
  console.log(`${country} - LOCAL-ONLY SONGS (showing first 10)`);
  console.log('='.repeat(80));
  console.log();
  
  const songs = byCountry[country]
    .sort((a, b) => (b.popularity || 0) - (a.popularity || 0))
    .slice(0, 10);
  
  songs.forEach(s => {
    console.log(`${s.artist} - "${s.title}" (${s.year || 'N/A'})`);
    console.log(`  Popularity: ${s.popularity || 0}, Genre: ${s.genre || 'N/A'}`);
    console.log(`  Billboard: ${s.isBillboardChart ? 'Yes' : 'No'}, Multi-country: ${s.hasMultiCountryCharts ? 'Yes' : 'No'}`);
    console.log();
  });
});

console.log('='.repeat(80));
console.log('NOTES');
console.log('='.repeat(80));
console.log();
console.log('These songs were classified as local-only because:');
console.log('1. NOT on US Billboard charts');
console.log('2. NOT released in 3+ countries (including US or GB)');
console.log('3. Artist NOT in curated international list');
console.log();
console.log('This may be correct (truly local hits) or indicate:');
console.log('- Missing MusicBrainz data for some releases');
console.log('- Songs that need manual review');
console.log('- Artists that should be added to international list');
