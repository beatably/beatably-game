#!/usr/bin/env node
/**
 * Add hasMultiCountryCharts flag for ALL songs based on MusicBrainz release data
 * Criteria: 3+ release countries including US or GB
 * 
 * This will take approximately 60-90 minutes for ~3,700 songs
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');

const DB_FILE = path.join(__dirname, '..', 'cache', 'curated-songs.json');
const MB_BASE = 'https://musicbrainz.org/ws/2';
const USER_AGENT = 'beatably/1.0 (chart-detection)';
const RATE_LIMIT_MS = 1100; // MusicBrainz requires 1 req/sec

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function searchMusicBrainzReleases(artist, title) {
  try {
    const query = `artist:"${artist}" AND release:"${title}"`;
    
    const response = await axios.get(`${MB_BASE}/release`, {
      params: {
        query,
        fmt: 'json',
        limit: 10
      },
      headers: {
        'User-Agent': USER_AGENT
      },
      timeout: 10000
    });
    
    const releases = response.data.releases || [];
    
    // Extract unique countries from all releases
    const countries = new Set();
    releases.forEach(release => {
      if (release.country) {
        countries.add(release.country);
      }
    });
    
    return Array.from(countries);
  } catch (error) {
    if (error.response?.status === 503) {
      console.log('  Rate limited, waiting 5s...');
      await sleep(5000);
      return searchMusicBrainzReleases(artist, title); // Retry
    }
    return [];
  }
}

function meetsMultiCountryCriteria(countries) {
  if (countries.length < 3) return false;
  const hasUSorGB = countries.includes('US') || countries.includes('GB');
  if (!hasUSorGB) return false;
  return true;
}

async function processAllSongs() {
  console.log('='.repeat(80));
  console.log('ADD MULTI-COUNTRY CHARTS FLAG - ALL SONGS');
  console.log('='.repeat(80));
  console.log();

  // Load database
  console.log(`Loading database from ${DB_FILE}...`);
  const data = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  console.log(`Loaded ${data.length} songs\n`);

  // Filter out songs that already have the flag OR have Billboard flag (already international)
  const songsToProcess = data.filter(s => 
    s.hasMultiCountryCharts === undefined && !s.isBillboardChart
  );
  const alreadyProcessed = data.length - songsToProcess.length;
  const billboardSkipped = data.filter(s => s.isBillboardChart).length;
  
  console.log(`Already processed: ${alreadyProcessed - billboardSkipped}`);
  console.log(`Billboard songs (skipped): ${billboardSkipped}`);
  console.log(`To process: ${songsToProcess.length}\n`);
  
  // Mark Billboard songs as false for hasMultiCountryCharts (they're already international via Billboard)
  data.forEach(song => {
    if (song.isBillboardChart && song.hasMultiCountryCharts === undefined) {
      song.hasMultiCountryCharts = false; // Not needed, already international via Billboard
    }
  });
  
  if (songsToProcess.length === 0) {
    console.log('All non-Billboard songs already processed!');
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
    console.log('✓ Marked Billboard songs with hasMultiCountryCharts = false');
    return;
  }
  
  // Create backup
  const backupFile = DB_FILE.replace('.json', `.backup-multicountry-all-${Date.now()}.json`);
  fs.writeFileSync(backupFile, JSON.stringify(data, null, 2));
  console.log(`✓ Backup created: ${backupFile}\n`);

  // Estimate time
  const estimatedMinutes = Math.ceil(songsToProcess.length * RATE_LIMIT_MS / 1000 / 60);
  console.log(`Estimated time: ~${estimatedMinutes} minutes`);
  console.log(`Started at: ${new Date().toLocaleTimeString()}\n`);

  // Statistics
  const stats = {
    total: songsToProcess.length,
    processed: 0,
    foundMultiCountry: 0,
    alreadyInternational: 0,
    newlyInternational: 0,
    errors: 0
  };

  const startTime = Date.now();

  for (let i = 0; i < songsToProcess.length; i++) {
    const song = songsToProcess[i];
    stats.processed++;
    
    // Progress every 50 songs
    if (stats.processed % 50 === 0) {
      const elapsed = Math.floor((Date.now() - startTime) / 1000 / 60);
      const remaining = Math.ceil((songsToProcess.length - stats.processed) * RATE_LIMIT_MS / 1000 / 60);
      console.log(`\nProgress: ${stats.processed}/${stats.total} (${Math.round(stats.processed/stats.total*100)}%)`);
      console.log(`  Elapsed: ${elapsed} min, Remaining: ~${remaining} min`);
      console.log(`  Multi-country found so far: ${stats.foundMultiCountry}`);
      console.log(`  Newly international: ${stats.newlyInternational}\n`);
    }
    
    // Show brief progress for each song
    if (stats.processed % 10 === 0) {
      process.stdout.write('.');
    }
    
    try {
      const countries = await searchMusicBrainzReleases(song.artist, song.title);
      
      if (countries.length > 0) {
        const hasMultiCountry = meetsMultiCountryCriteria(countries);
        song.hasMultiCountryCharts = hasMultiCountry;
        
        if (hasMultiCountry) {
          stats.foundMultiCountry++;
          
          const wasInternational = song.isInternational;
          song.isInternational = true;
          
          if (!wasInternational) {
            stats.newlyInternational++;
          } else {
            stats.alreadyInternational++;
          }
        } else {
          song.hasMultiCountryCharts = false;
        }
      } else {
        song.hasMultiCountryCharts = false;
      }
      
      // Save progress every 100 songs
      if (stats.processed % 100 === 0) {
        fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
        console.log(`\n  ✓ Progress saved (${stats.processed}/${stats.total})`);
      }
      
      await sleep(RATE_LIMIT_MS);
      
    } catch (error) {
      stats.errors++;
      console.error(`\n  ERROR [${stats.processed}]: ${song.artist} - "${song.title}": ${error.message}`);
      song.hasMultiCountryCharts = false;
    }
  }

  console.log('\n\n' + '='.repeat(80));
  console.log('SAVING FINAL DATABASE');
  console.log('='.repeat(80));
  
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
  console.log('✓ Database updated successfully!\n');

  // Final statistics
  const totalMinutes = Math.floor((Date.now() - startTime) / 1000 / 60);
  console.log('='.repeat(80));
  console.log('FINAL STATISTICS');
  console.log('='.repeat(80));
  console.log();
  console.log(`Total songs processed: ${stats.total}`);
  console.log(`Songs with multi-country charts: ${stats.foundMultiCountry}`);
  console.log(`  - Already international: ${stats.alreadyInternational}`);
  console.log(`  - Newly international: ${stats.newlyInternational}`);
  console.log(`Errors: ${stats.errors}`);
  console.log(`Time taken: ${totalMinutes} minutes`);
  console.log();

  console.log('='.repeat(80));
  console.log('COMPLETE');
  console.log('='.repeat(80));
  console.log();
  console.log('Summary:');
  console.log(`- ${data.filter(s => s.hasMultiCountryCharts).length} songs total with multi-country charts`);
  console.log(`- ${data.filter(s => s.isInternational).length} songs total marked as international`);
  console.log(`- ${data.filter(s => !s.isInternational).length} songs marked as local-only`);
  console.log();
  console.log('Next steps:');
  console.log('1. Review results in admin interface');
  console.log('2. Update backend/frontend to use isInternational field for game modes');
}

if (require.main === module) {
  processAllSongs().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}
