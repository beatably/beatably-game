#!/usr/bin/env node
/**
 * Database Version Checker
 * Samples the curated database to check its current state
 */

const fs = require('fs');
const path = require('path');

// Read the database file
const dbPath = path.join(__dirname, '../cache/curated-songs.json');

console.log('=== DATABASE VERSION CHECK ===\n');
console.log('Database path:', dbPath);
console.log('File exists:', fs.existsSync(dbPath));

if (!fs.existsSync(dbPath)) {
  console.log('\n❌ Database file not found!');
  process.exit(1);
}

try {
  const stats = fs.statSync(dbPath);
  console.log('File size:', (stats.size / 1024 / 1024).toFixed(2), 'MB');
  console.log('Last modified:', stats.mtime.toISOString());
  
  const rawData = fs.readFileSync(dbPath, 'utf8');
  const songs = JSON.parse(rawData);
  
  if (!Array.isArray(songs)) {
    console.log('\n❌ Database is not an array!');
    process.exit(1);
  }
  
  console.log('\n=== DATABASE STATS ===');
  console.log('Total songs:', songs.length);
  
  // Sample first and last songs
  console.log('\n=== FIRST SONG ===');
  if (songs.length > 0) {
    const first = songs[0];
    console.log('ID:', first.id);
    console.log('Title:', first.title);
    console.log('Artist:', first.artist);
    console.log('Year:', first.year);
    console.log('Has preview URL:', !!first.previewUrl);
    console.log('Geography:', first.geography);
    console.log('Markets:', first.markets);
    console.log('Genres:', first.genres);
    console.log('Is International:', first.isInternational);
  }
  
  console.log('\n=== LAST SONG ===');
  if (songs.length > 0) {
    const last = songs[songs.length - 1];
    console.log('ID:', last.id);
    console.log('Title:', last.title);
    console.log('Artist:', last.artist);
    console.log('Year:', last.year);
    console.log('Has preview URL:', !!last.previewUrl);
    console.log('Geography:', last.geography);
    console.log('Markets:', last.markets);
    console.log('Genres:', last.genres);
    console.log('Is International:', last.isInternational);
  }
  
  // Check for recently added songs (last 10)
  console.log('\n=== LAST 10 SONGS (Most Recently Added) ===');
  const last10 = songs.slice(-10);
  last10.forEach((song, idx) => {
    console.log(`${idx + 1}. ${song.artist} - "${song.title}" (${song.year})`);
  });
  
  // Stats
  const withPreview = songs.filter(s => s.previewUrl).length;
  const international = songs.filter(s => s.isInternational === true).length;
  const swedish = songs.filter(s => s.geography === 'SE').length;
  
  console.log('\n=== CONTENT STATS ===');
  console.log('Songs with preview URLs:', withPreview, `(${(withPreview/songs.length*100).toFixed(1)}%)`);
  console.log('International songs:', international, `(${(international/songs.length*100).toFixed(1)}%)`);
  console.log('Swedish songs (geography=SE):', swedish, `(${(swedish/songs.length*100).toFixed(1)}%)`);
  
  // Year distribution
  const yearCounts = {};
  songs.forEach(s => {
    const decade = Math.floor(s.year / 10) * 10;
    yearCounts[decade] = (yearCounts[decade] || 0) + 1;
  });
  
  console.log('\n=== YEAR DISTRIBUTION ===');
  Object.keys(yearCounts).sort().forEach(decade => {
    console.log(`${decade}s:`, yearCounts[decade]);
  });
  
  // Recent additions (check for addedDate field)
  const recentlyAdded = songs.filter(s => {
    if (!s.addedDate) return false;
    const added = new Date(s.addedDate);
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    return added > dayAgo;
  }).length;
  
  console.log('\n=== RECENT CHANGES ===');
  console.log('Songs added in last 24h:', recentlyAdded);
  
  // Check for unique identifier to track updates
  const md5sum = require('crypto').createHash('md5').update(rawData).digest('hex');
  console.log('\n=== DATABASE FINGERPRINT ===');
  console.log('MD5 hash:', md5sum.substring(0, 16) + '...');
  console.log('\nUse this hash to verify if the database changed between deployments.');
  
} catch (error) {
  console.error('\n❌ Error reading database:', error.message);
  process.exit(1);
}
