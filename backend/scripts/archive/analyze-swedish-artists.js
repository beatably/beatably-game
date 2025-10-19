#!/usr/bin/env node
/**
 * Analyze Swedish artists to help curate "international artists" list
 * Shows Swedish artists with statistics to identify truly international acts
 */

const fs = require('fs');
const path = require('path');

const DB_FILE = path.join(__dirname, '..', 'cache', 'curated-songs.json');

console.log('Loading database...');
const data = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));

console.log(`Total songs in database: ${data.length}\n`);

// Filter for Swedish songs
const swedishSongs = data.filter(s => s.geography === 'SE');
console.log(`Swedish songs: ${swedishSongs.length}\n`);

// Group by artist
const artistMap = new Map();

swedishSongs.forEach(song => {
  const artist = song.artist || 'Unknown';
  if (!artistMap.has(artist)) {
    artistMap.set(artist, {
      name: artist,
      songs: [],
      billboardCount: 0,
      maxPopularity: 0,
      genres: new Set()
    });
  }
  
  const artistData = artistMap.get(artist);
  artistData.songs.push(song);
  
  if (song.isBillboardChart) {
    artistData.billboardCount++;
  }
  
  const pop = Number(song.popularity || 0);
  if (pop > artistData.maxPopularity) {
    artistData.maxPopularity = pop;
  }
  
  // Collect genres
  if (Array.isArray(song.genres)) {
    song.genres.forEach(g => artistData.genres.add(g));
  } else if (song.genre) {
    artistData.genres.add(song.genre);
  }
});

// Convert to array and sort
const artists = Array.from(artistMap.values());

// Sort by: 1) Billboard presence, 2) Max popularity, 3) Song count
artists.sort((a, b) => {
  // First, Billboard artists
  if (a.billboardCount !== b.billboardCount) {
    return b.billboardCount - a.billboardCount;
  }
  // Then by max popularity
  if (a.maxPopularity !== b.maxPopularity) {
    return b.maxPopularity - a.maxPopularity;
  }
  // Finally by song count
  return b.songs.length - a.songs.length;
});

console.log('='.repeat(80));
console.log('SWEDISH ARTISTS ANALYSIS');
console.log('='.repeat(80));
console.log('\nFormat: Artist Name (Songs: X, Billboard: Y, Max Pop: Z)');
console.log('  Genre tags | Sample songs\n');

// Display artists
artists.forEach((artist, idx) => {
  const rank = idx + 1;
  
  // Artist summary line
  console.log(`\n${rank}. ${artist.name}`);
  console.log(`   Songs: ${artist.songs.length}, Billboard: ${artist.billboardCount}, Max Popularity: ${artist.maxPopularity}`);
  
  // Genres
  const genreList = Array.from(artist.genres).join(', ') || 'none';
  console.log(`   Genres: ${genreList}`);
  
  // Sample songs (top 3 by popularity)
  const topSongs = artist.songs
    .sort((a, b) => (b.popularity || 0) - (a.popularity || 0))
    .slice(0, 3)
    .map(s => `"${s.title}" (${s.year}, pop: ${s.popularity || 0}${s.isBillboardChart ? ', Billboard' : ''})`)
    .join('\n      ');
  
  console.log(`   Sample songs:\n      ${topSongs}`);
});

// Summary statistics
console.log('\n' + '='.repeat(80));
console.log('SUMMARY STATISTICS');
console.log('='.repeat(80));

const billboardArtists = artists.filter(a => a.billboardCount > 0);
const highPopArtists = artists.filter(a => a.maxPopularity >= 80);
const multiSongArtists = artists.filter(a => a.songs.length >= 5);

console.log(`\nTotal Swedish artists: ${artists.length}`);
console.log(`Artists with Billboard songs: ${billboardArtists.length}`);
console.log(`Artists with popularity >= 80: ${highPopArtists.length}`);
console.log(`Artists with 5+ songs: ${multiSongArtists.length}`);

console.log('\n' + '='.repeat(80));
console.log('RECOMMENDED: LIKELY INTERNATIONAL ARTISTS (Billboard presence)');
console.log('='.repeat(80));

if (billboardArtists.length > 0) {
  billboardArtists.forEach(artist => {
    console.log(`- ${artist.name} (${artist.billboardCount} Billboard songs, max pop: ${artist.maxPopularity})`);
  });
} else {
  console.log('None found');
}

console.log('\n' + '='.repeat(80));
console.log('REVIEW NEEDED: High popularity but no Billboard');
console.log('='.repeat(80));
console.log('(These may be international OR just popular in Sweden)\n');

const reviewNeeded = artists.filter(a => 
  a.billboardCount === 0 && 
  (a.maxPopularity >= 70 || a.songs.length >= 5)
).slice(0, 20);

if (reviewNeeded.length > 0) {
  reviewNeeded.forEach(artist => {
    console.log(`- ${artist.name} (max pop: ${artist.maxPopularity}, ${artist.songs.length} songs)`);
  });
} else {
  console.log('None found');
}

console.log('\n' + '='.repeat(80));
console.log('INSTRUCTIONS');
console.log('='.repeat(80));
console.log(`
Based on this analysis:

1. Artists in "LIKELY INTERNATIONAL" section should probably be marked as international
   (They have Billboard chart presence)

2. Review the "REVIEW NEEDED" section manually:
   - Do you recognize these artists internationally?
   - Have they had success outside Sweden?
   
3. Create a list of international Swedish artists and save it for the migration script

Next step: Run the migration script with your approved list.
`);
