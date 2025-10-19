#!/usr/bin/env node
/**
 * Apply US/GB international rule
 * 
 * New rule: Songs with origin US or GB are automatically international
 * Rationale: English-language music from major markets has inherent global reach
 */

const fs = require('fs');
const path = require('path');

const DB_FILE = path.join(__dirname, '..', 'cache', 'curated-songs.json');

console.log('='.repeat(80));
console.log('APPLY US/GB INTERNATIONAL RULE');
console.log('='.repeat(80));
console.log();

// Load database
console.log(`Loading database from ${DB_FILE}...`);
const data = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
console.log(`Loaded ${data.length} songs\n`);

// Create backup
const backupFile = DB_FILE.replace('.json', `.backup-us-gb-rule-${Date.now()}.json`);
fs.writeFileSync(backupFile, JSON.stringify(data, null, 2));
console.log(`✓ Backup created: ${backupFile}\n`);

// Statistics
const stats = {
  total: data.length,
  usGbSongs: 0,
  alreadyInternational: 0,
  newlyInternational: 0
};

console.log('Applying US/GB rule...\n');

data.forEach(song => {
  const isUSorGB = song.geography === 'US' || song.geography === 'GB';
  
  if (isUSorGB) {
    stats.usGbSongs++;
    
    if (!song.isInternational) {
      song.isInternational = true;
      stats.newlyInternational++;
    } else {
      stats.alreadyInternational++;
    }
  }
});

// Save updated database
console.log('Saving updated database...');
fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
console.log('✓ Database updated successfully!\n');

// Final statistics
console.log('='.repeat(80));
console.log('STATISTICS');
console.log('='.repeat(80));
console.log();
console.log(`Total songs: ${stats.total}`);
console.log(`US/GB songs: ${stats.usGbSongs}`);
console.log(`  - Already international: ${stats.alreadyInternational}`);
console.log(`  - Newly marked international: ${stats.newlyInternational}`);
console.log();

const totalInternational = data.filter(s => s.isInternational).length;
const totalLocal = data.filter(s => !s.isInternational).length;

console.log('='.repeat(80));
console.log('FINAL TOTALS');
console.log('='.repeat(80));
console.log();
console.log(`International songs: ${totalInternational} (${Math.round(totalInternational/stats.total*100)}%)`);
console.log(`Local-only songs: ${totalLocal} (${Math.round(totalLocal/stats.total*100)}%)`);
console.log();

console.log('='.repeat(80));
console.log('UPDATED CLASSIFICATION RULES');
console.log('='.repeat(80));
console.log();
console.log('isInternational = true IF:');
console.log('  1. Geography is US or GB (inherent international reach), OR');
console.log('  2. isBillboardChart === true (proven US chart success), OR');
console.log('  3. hasMultiCountryCharts === true (3+ countries including US/GB), OR');
console.log('  4. Artist in curated international list');
console.log();
console.log('Otherwise: isInternational = false (local success only)');
console.log();
