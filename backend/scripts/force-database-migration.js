#!/usr/bin/env node
/**
 * Force Database Migration Script
 * Forces migration of the deployed database to production persistent disk
 * regardless of the 10% threshold
 */

const fs = require('fs');
const path = require('path');

console.log('=== FORCE DATABASE MIGRATION ===\n');

// This script updates the production migration logic to force a migration
// by temporarily creating a flag file that the backend will detect

const deployedDbPath = path.join(__dirname, '../cache/curated-songs.json');
const flagPath = path.join(__dirname, '../cache/.force-migration');

console.log('Checking local database:', deployedDbPath);

if (!fs.existsSync(deployedDbPath)) {
  console.error('❌ ERROR: Local database not found at:', deployedDbPath);
  console.error('Make sure you are in the backend directory');
  process.exit(1);
}

try {
  // Read and validate the local database
  const localData = JSON.parse(fs.readFileSync(deployedDbPath, 'utf8'));
  
  if (!Array.isArray(localData)) {
    console.error('❌ ERROR: Database is not a valid array');
    process.exit(1);
  }
  
  console.log('✅ Local database validated:', localData.length, 'songs');
  
  // Create a force migration flag file
  const flagData = {
    timestamp: new Date().toISOString(),
    reason: 'manual_force_migration',
    localSongCount: localData.length,
    message: 'This file triggers forced migration on next deployment'
  };
  
  fs.writeFileSync(flagPath, JSON.stringify(flagData, null, 2));
  console.log('✅ Created force migration flag:', flagPath);
  
  // Create a migration info file to track
  const infoPath = path.join(__dirname, '../cache/.migration-info.json');
  const localHash = require('crypto').createHash('md5').update(JSON.stringify(localData)).digest('hex');
  
  const infoData = {
    lastMigrationRequest: new Date().toISOString(),
    songCount: localData.length,
    hash: localHash.substring(0, 16),
    firstSong: localData[0] ? {
      title: localData[0].title,
      artist: localData[0].artist,
      year: localData[0].year
    } : null,
    lastSong: localData[localData.length - 1] ? {
      title: localData[localData.length - 1].title,
      artist: localData[localData.length - 1].artist,
      year: localData[localData.length - 1].year
    } : null
  };
  
  fs.writeFileSync(infoPath, JSON.stringify(infoData, null, 2));
  console.log('✅ Created migration info:', infoPath);
  
  console.log('\n=== NEXT STEPS ===');
  console.log('1. Commit and push these changes:');
  console.log('   git add backend/cache/');
  console.log('   git commit -m "Force database migration with', localData.length, 'songs"');
  console.log('   git push origin main');
  console.log('');
  console.log('2. Wait for Onrender to deploy');
  console.log('');
  console.log('3. Check Onrender logs for:');
  console.log('   "[CuratedDB] Force migration flag detected - migrating..."');
  console.log('');
  console.log('4. Verify in admin panel that songs are updated');
  console.log('');
  console.log('The backend will automatically detect the .force-migration flag');
  console.log('and perform the migration regardless of the 10% threshold.');
  
} catch (error) {
  console.error('❌ ERROR:', error.message);
  process.exit(1);
}
