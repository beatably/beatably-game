#!/usr/bin/env node
/**
 * Add hasMultiCountryCharts flag based on MusicBrainz release data
 * Processes Swedish songs first (can extend to all songs later)
 * 
 * Criteria: 3+ release countries including US or GB
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
        limit: 10 // Get more releases to find all countries
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
    console.error(`  Error: ${error.message}`);
    return [];
  }
}

function meetsMultiCountryCriteria(countries) {
  if (countries.length < 3) return false;
  
  // Must include US or GB
  const hasUSorGB = countries.includes('US') || countries.includes('GB');
  if (!hasUSorGB) return false;
  
  return true;
}

async function processSwedishSongs() {
  console.log('='.repeat(80));
  console.log('ADD MULTI-COUNTRY CHARTS FLAG');
  console.log('='.repeat(80));
  console.log();

  // Load database
  console.log(`Loading database from ${DB_FILE}...`);
  const data = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  console.log(`Loaded ${data.length} songs\n`);

  // Filter for Swedish songs
  const swedishSongs = data.filter(s => s.geography === 'SE');
  console.log(`Found ${swedishSongs.length} Swedish songs to process\n`);
  
  // Create backup
  const backupFile = DB_FILE.replace('.json', `.backup-multicountry-${Date.now()}.json`);
  fs.writeFileSync(backupFile, JSON.stringify(data, null, 2));
  console.log(`✓ Backup created: ${backupFile}\n`);

  // Statistics
  const stats = {
    total: swedishSongs.length,
    processed: 0,
    foundMultiCountry: 0,
    alreadyInternational: 0,
    newlyInternational: 0,
    errors: 0,
    skipped: 0
  };

  const results = [];
  
  console.log('Processing Swedish songs (1 request/second due to rate limits)...');
  console.log('This will take approximately', Math.ceil(swedishSongs.length * RATE_LIMIT_MS / 1000 / 60), 'minutes\n');

  for (let i = 0; i < swedishSongs.length; i++) {
    const song = swedishSongs[i];
    stats.processed++;
    
    // Show progress every 10 songs
    if (stats.processed % 10 === 0) {
      console.log(`Progress: ${stats.processed}/${stats.total} (${Math.round(stats.processed/stats.total*100)}%)`);
    }
    
    // Skip if already has multicountry flag (resumable)
    if (song.hasMultiCountryCharts !== undefined) {
      stats.skipped++;
      continue;
    }
    
    console.log(`\n[${stats.processed}/${stats.total}] ${song.artist} - "${song.title}"`);
    
    try {
      // Query MusicBrainz
      const countries = await searchMusicBrainzReleases(song.artist, song.title);
      
      if (countries.length > 0) {
        console.log(`  Countries: ${countries.join(', ')} (${countries.length})`);
        
        const hasMultiCountry = meetsMultiCountryCriteria(countries);
        song.hasMultiCountryCharts = hasMultiCountry;
        
        if (hasMultiCountry) {
          stats.foundMultiCountry++;
          console.log(`  ✓ Multi-country: YES (${countries.length} countries, includes US/GB)`);
          
          // Update isInternational
          const wasInternational = song.isInternational;
          song.isInternational = true;
          
          if (!wasInternational) {
            stats.newlyInternational++;
            console.log(`  ✓ Now marked as INTERNATIONAL`);
          } else {
            stats.alreadyInternational++;
          }
        } else {
          console.log(`  ✗ Multi-country: NO (${countries.length} countries, missing US/GB or < 3)`);
          song.hasMultiCountryCharts = false;
        }
        
        results.push({
          artist: song.artist,
          title: song.title,
          countries: countries,
          hasMultiCountry,
          wasInternational: song.isInternational
        });
      } else {
        console.log(`  No releases found in MusicBrainz`);
        song.hasMultiCountryCharts = false;
      }
      
      // Rate limiting
      await sleep(RATE_LIMIT_MS);
      
    } catch (error) {
      stats.errors++;
      console.error(`  ERROR: ${error.message}`);
      song.hasMultiCountryCharts = false;
    }
  }

  // Save updated database
  console.log('\n' + '='.repeat(80));
  console.log('SAVING DATABASE');
  console.log('='.repeat(80));
  console.log();
  
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
  console.log('✓ Database updated successfully!\n');

  // Statistics
  console.log('='.repeat(80));
  console.log('STATISTICS');
  console.log('='.repeat(80));
  console.log();
  console.log(`Total Swedish songs: ${stats.total}`);
  console.log(`Processed: ${stats.processed}`);
  console.log(`Skipped (already had flag): ${stats.skipped}`);
  console.log(`Found multi-country: ${stats.foundMultiCountry}`);
  console.log(`  - Already international: ${stats.alreadyInternational}`);
  console.log(`  - Newly international: ${stats.newlyInternational}`);
  console.log(`Errors: ${stats.errors}`);
  console.log();

  // Show newly international Swedish songs
  const newlyIntl = results.filter(r => r.hasMultiCountry && !r.wasInternational);
  if (newlyIntl.length > 0) {
    console.log('='.repeat(80));
    console.log('NEWLY INTERNATIONAL SWEDISH SONGS');
    console.log('='.repeat(80));
    console.log();
    newlyIntl.forEach(r => {
      console.log(`${r.artist} - "${r.title}"`);
      console.log(`  Countries: ${r.countries.join(', ')}`);
    });
    console.log();
  }

  console.log('='.repeat(80));
  console.log('COMPLETE');
  console.log('='.repeat(80));
  console.log();
  console.log('Next steps:');
  console.log('1. Review the newly international songs above');
  console.log('2. Update admin interface to show hasMultiCountryCharts flag');
  console.log('3. (Optional) Run this script on all songs later');
}

if (require.main === module) {
  processSwedishSongs().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}
