#!/usr/bin/env node
/**
 * Batch enrich songs that are missing data
 * 
 * Usage:
 *   node enrich-batch.js [options]
 * 
 * Options:
 *   --missing-genre    Only enrich songs missing genre
 *   --missing-geo      Only enrich songs missing geography
 *   --missing-preview  Only enrich songs missing preview URL
 *   --limit N          Limit to N songs (default: all)
 *   --dry-run          Show what would be enriched without saving
 */

const curatedDb = require('../curatedDb');
const { enrichBatch } = require('../songEnrichment');

async function main() {
  const args = process.argv.slice(2);
  const options = {
    missingGenre: args.includes('--missing-genre'),
    missingGeo: args.includes('--missing-geo'),
    missingPreview: args.includes('--missing-preview'),
    dryRun: args.includes('--dry-run'),
    limit: null
  };

  // Parse limit
  const limitIdx = args.indexOf('--limit');
  if (limitIdx !== -1 && args[limitIdx + 1]) {
    options.limit = parseInt(args[limitIdx + 1]);
  }

  console.log('='.repeat(80));
  console.log('BATCH SONG ENRICHMENT');
  console.log('='.repeat(80));
  console.log();

  // Load database
  console.log('Loading database...');
  curatedDb.load();

  // Get all songs
  const { items: allSongs } = curatedDb.list({ limit: 10000 });
  console.log(`Total songs in database: ${allSongs.length}`);
  console.log();

  // Filter songs that need enrichment
  let songsToEnrich = allSongs;

  if (options.missingGenre) {
    songsToEnrich = songsToEnrich.filter(s => !s.genre);
    console.log(`Filtering to songs missing genre: ${songsToEnrich.length}`);
  }

  if (options.missingGeo) {
    songsToEnrich = songsToEnrich.filter(s => !s.geography);
    console.log(`Filtering to songs missing geography: ${songsToEnrich.length}`);
  }

  if (options.missingPreview) {
    songsToEnrich = songsToEnrich.filter(s => !s.previewUrl);
    console.log(`Filtering to songs missing preview URL: ${songsToEnrich.length}`);
  }

  if (options.limit) {
    songsToEnrich = songsToEnrich.slice(0, options.limit);
    console.log(`Limiting to first ${options.limit} songs`);
  }

  console.log();
  console.log(`Songs to enrich: ${songsToEnrich.length}`);
  console.log();

  if (songsToEnrich.length === 0) {
    console.log('No songs need enrichment!');
    return;
  }

  if (options.dryRun) {
    console.log('DRY RUN - showing first 10 songs that would be enriched:');
    songsToEnrich.slice(0, 10).forEach((s, i) => {
      console.log(`${i + 1}. ${s.artist} - "${s.title}"`);
      console.log(`   Missing: ${!s.genre ? 'genre ' : ''}${!s.geography ? 'geography ' : ''}${!s.previewUrl ? 'preview' : ''}`);
    });
    console.log();
    console.log(`... and ${Math.max(0, songsToEnrich.length - 10)} more`);
    return;
  }

  // Enrich in batch
  console.log('Starting enrichment...');
  console.log('(This may take a while due to rate limiting)');
  console.log();

  const enriched = await enrichBatch(songsToEnrich, {
    fetchPreview: true,
    fetchMusicBrainz: true,
    rateLimit: true
  }, (current, total) => {
    if (current % 10 === 0) {
      console.log(`Progress: ${current}/${total} (${Math.round(current/total*100)}%)`);
    }
  });

  // Update database
  console.log();
  console.log('Updating database...');
  let updated = 0;
  enriched.forEach(song => {
    curatedDb.update(song.id, song);
    updated++;
  });

  console.log();
  console.log('='.repeat(80));
  console.log('BATCH ENRICHMENT COMPLETE');
  console.log('='.repeat(80));
  console.log();
  console.log(`Songs processed: ${enriched.length}`);
  console.log(`Songs updated: ${updated}`);
  console.log();
}

if (require.main === module) {
  main().catch(error => {
    console.error('Batch enrichment failed:', error);
    process.exit(1);
  });
}
