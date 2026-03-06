#!/usr/bin/env node
/**
 * audit-easy-mode.js
 *
 * Read-only audit of the Easy mode song pool. Categorizes suspect songs
 * into groups and outputs a report for manual review before any cleanup.
 *
 * Usage:
 *   node backend/scripts/audit-easy-mode.js
 *   node backend/scripts/audit-easy-mode.js --output path/to/output.json
 *   node backend/scripts/audit-easy-mode.js --minPop 20   (change low-popularity threshold)
 */

const fs = require('fs');
const path = require('path');

// ── Config ────────────────────────────────────────────────────────────────────

const DB_PATH = path.join(__dirname, '../cache/curated-songs.json');
const DEFAULT_OUTPUT = path.join(__dirname, '../cache/audit-easy-mode-results.json');

const args = process.argv.slice(2);
const outputPath = args.includes('--output')
  ? args[args.indexOf('--output') + 1]
  : DEFAULT_OUTPUT;
const minPopThreshold = args.includes('--minPop')
  ? Number(args[args.indexOf('--minPop') + 1])
  : 20;

// ── Detection Patterns ────────────────────────────────────────────────────────

// Title keywords that indicate a non-original recording
const VERSION_VARIANT_PATTERNS = [
  /\bremix\b/i,
  /\bcover\b/i,
  /\blive\b/i,
  /\bremaster(ed)?\b/i,
  /\bacoustic\b/i,
  /\binstrumental\b/i,
  /\btribute\b/i,
  /\bkaraoke\b/i,
  /\bmedley\b/i,
  /\bextended\b/i,
  /\bradio edit\b/i,
  /\bdemo\b/i,
  /\bstripped\b/i,
  /\bpiano version\b/i,
  /\borchestral\b/i,
  /\bslowed\b/i,
  /\bsped[ -]up\b/i,
  /\bnightcore\b/i,
  /\bbootleg\b/i,
  /\bsoundtrack\b/i,
  /\bsingle version\b/i,
  /\balbum version\b/i,
  /\boriginal mix\b/i,
  /\bclub mix\b/i,
  /\bvip mix\b/i,
];

// Artist name patterns that are definitively not original artists
const TRIBUTE_ARTIST_PATTERNS = [
  /\btribute\b/i,
  /\bkaraoke\b/i,
  /\bperformed by\b/i,
  /\bas made famous\b/i,
  /\bin the style of\b/i,
  /\bsoundalike\b/i,
  /\bcoverband\b/i,
  /\bcover band\b/i,
  /\bcover versions?\b/i,
];

// Genre patterns for clearly non-hit content
const CHILDREN_GENRE_PATTERNS = [
  /\bchildren\b/i,
  /\bkids?\b/i,
  /\bnursery\b/i,
  /\blullaby\b/i,
  /\blullabies\b/i,
  /\bbaby\b/i,
  /\btoddler\b/i,
  /\beducational\b/i,
];

// Title patterns for clearly non-hit content
const CHILDREN_TITLE_PATTERNS = [
  /\bnursery rhyme\b/i,
  /\blullaby\b/i,
  /\blullabies\b/i,
  /\bwhite noise\b/i,
  /\brain sounds?\b/i,
  /\bambient sounds?\b/i,
  /\bbaby sleep\b/i,
  /\bbaby songs?\b/i,
  /\bkids?\s+songs?\b/i,
  /\bchildren'?s?\s+songs?\b/i,
  /\btwinkle twinkle\b/i,
  /\bwheels on the bus\b/i,
  /\brow row row\b/i,
  /\bhumpty dumpty\b/i,
  /\bjack and jill\b/i,
  /\bminecraft\b/i,
  /\bcocomelon\b/i,
  /\bpaw patrol\b/i,
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function isEasyEligible(song) {
  const lvl = Number(song.difficultyLevel || 2);
  return song.isBillboardChart === true || (lvl <= 2 && (song.popularity || 0) >= 70);
}

function matchesAny(str, patterns) {
  if (!str) return null;
  for (const p of patterns) {
    if (p.test(str)) return p.source;
  }
  return null;
}

function summarizeSong(song, category, reason) {
  return {
    id: song.id,
    title: song.title,
    artist: song.artist,
    year: song.year,
    genre: song.genre,
    genres: song.genres,
    popularity: song.popularity,
    isBillboardChart: song.isBillboardChart,
    difficultyLevel: song.difficultyLevel,
    chartInfo: song.chartInfo,
    verified: song.verified,
    spotifyUri: song.spotifyUri,
    category,
    reason,
  };
}

// ── Main ──────────────────────────────────────────────────────────────────────

function main() {
  if (!fs.existsSync(DB_PATH)) {
    console.error(`Database not found at: ${DB_PATH}`);
    process.exit(1);
  }

  const db = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  const songs = Array.isArray(db) ? db : db.songs || Object.values(db);

  console.log(`\nLoaded ${songs.length} total songs from database.`);

  const easyPool = songs.filter(isEasyEligible);
  console.log(`Easy-eligible songs: ${easyPool.length} (${((easyPool.length / songs.length) * 100).toFixed(1)}% of DB)\n`);

  const results = {
    summary: {
      totalSongs: songs.length,
      easyEligible: easyPool.length,
      generatedAt: new Date().toISOString(),
      minPopThreshold,
    },
    categories: {
      version_variant: [],
      tribute_artist: [],
      children_or_novelty: [],
      low_popularity_chart: [],
    },
    clean: [],
  };

  const flagged = new Set();

  for (const song of easyPool) {
    const title = song.title || '';
    const artist = song.artist || '';
    const genres = [song.genre, song.genreSecondary, ...(song.genres || [])].filter(Boolean);
    const genreStr = genres.join(' ');

    // 1. Children / novelty content (highest priority — these are clear bad apples)
    const childrenGenreMatch = matchesAny(genreStr, CHILDREN_GENRE_PATTERNS);
    const childrenTitleMatch = matchesAny(title, CHILDREN_TITLE_PATTERNS);
    const childrenArtistMatch = matchesAny(artist, CHILDREN_TITLE_PATTERNS);
    if (childrenGenreMatch || childrenTitleMatch || childrenArtistMatch) {
      const reason = childrenGenreMatch
        ? `Genre matches children/novelty pattern: "${childrenGenreMatch}"`
        : childrenTitleMatch
        ? `Title matches children/novelty pattern: "${childrenTitleMatch}"`
        : `Artist matches children/novelty pattern: "${childrenArtistMatch}"`;
      results.categories.children_or_novelty.push(summarizeSong(song, 'children_or_novelty', reason));
      flagged.add(song.id);
      continue;
    }

    // 2. Tribute / karaoke artist
    const tributeArtistMatch = matchesAny(artist, TRIBUTE_ARTIST_PATTERNS);
    if (tributeArtistMatch) {
      results.categories.tribute_artist.push(
        summarizeSong(song, 'tribute_artist', `Artist matches tribute pattern: "${tributeArtistMatch}"`)
      );
      flagged.add(song.id);
      continue;
    }

    // 3. Version variant in title (remix, live, cover, etc.)
    const variantMatch = matchesAny(title, VERSION_VARIANT_PATTERNS);
    if (variantMatch) {
      results.categories.version_variant.push(
        summarizeSong(song, 'version_variant', `Title contains variant keyword: "${variantMatch}"`)
      );
      flagged.add(song.id);
      continue;
    }

    // 4. Chart song with suspiciously low popularity
    if (song.isBillboardChart === true && (song.popularity || 0) < minPopThreshold) {
      const reason = `Billboard chart song but popularity is ${song.popularity ?? 'null'} (threshold: ${minPopThreshold})`;
      results.categories.low_popularity_chart.push(
        summarizeSong(song, 'low_popularity_chart', reason)
      );
      flagged.add(song.id);
      continue;
    }

    // Clean
    results.clean.push(summarizeSong(song, 'clean', null));
  }

  // ── Summary ────────────────────────────────────────────────────────────────

  const totalFlagged = flagged.size;
  results.summary.flagged = totalFlagged;
  results.summary.clean = results.clean.length;
  results.summary.byCategory = Object.fromEntries(
    Object.entries(results.categories).map(([k, v]) => [k, v.length])
  );

  console.log('── Audit Results ─────────────────────────────────────────────');
  console.log(`Total flagged: ${totalFlagged} / ${easyPool.length} Easy-eligible songs (${((totalFlagged / easyPool.length) * 100).toFixed(1)}%)`);
  console.log('');
  console.log(`  children_or_novelty  : ${results.categories.children_or_novelty.length}`);
  console.log(`  tribute_artist       : ${results.categories.tribute_artist.length}`);
  console.log(`  version_variant      : ${results.categories.version_variant.length}`);
  console.log(`  low_popularity_chart : ${results.categories.low_popularity_chart.length}`);
  console.log(`  clean                : ${results.clean.length}`);
  console.log('');

  // Show a few examples from each category
  for (const [cat, list] of Object.entries(results.categories)) {
    if (list.length === 0) continue;
    console.log(`── ${cat} (${list.length} songs, showing first 10) ──`);
    list.slice(0, 10).forEach((s) => {
      console.log(`  [pop:${s.popularity ?? '??'}] "${s.title}" — ${s.artist} (${s.year})`);
    });
    console.log('');
  }

  // Write report
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2), 'utf8');
  console.log(`Full report written to: ${outputPath}`);
  console.log('\nNext step: Review the report, then run clean-easy-mode.js to apply changes.');
}

main();
