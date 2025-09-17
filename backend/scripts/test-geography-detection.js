#!/usr/bin/env node
/**
 * Test Geography Detection (POC)
 * 
 * Usage examples:
 *   node backend/scripts/test-geography-detection.js --q="abba" --limit=10
 *   node backend/scripts/test-geography-detection.js --artists="ABBA, Avicii, Roxette, Zara Larsson, Ace of Base"
 *   node backend/scripts/test-geography-detection.js --ids="cur_123,cur_456"
 *   node backend/scripts/test-geography-detection.js --limit=5
 * 
 * Notes:
 * - Reads curated songs via curatedDb when using --q/--ids/--limit (defaults to first N songs).
 * - Falls back to artist list when using --artists directly.
 * - Does NOT modify the DB; prints suggested geography with confidence and reasoning.
 */

const path = require('path');

// Load backend .env for Spotify credentials
try {
  require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
} catch (_) {}

const curatedDb = require('../curatedDb');
const { detectGeographyForItem } = require('../geographyDetection');

// Simple CLI args parser
function parseArgs(argv) {
  const out = {};
  for (const arg of argv.slice(2)) {
    const m = arg.match(/^--([^=]+)=(.*)$/);
    if (m) {
      out[m[1]] = m[2];
    } else if (arg.startsWith('--')) {
      out[arg.slice(2)] = true;
    }
  }
  return out;
}

function pickUniqueByArtist(songs) {
  const seen = new Set();
  const out = [];
  for (const s of songs) {
    const key = (s.artist || '').toLowerCase().trim();
    if (!key) continue;
    if (!seen.has(key)) {
      out.push(s);
      seen.add(key);
    }
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv);
  const limit = Math.max(1, Math.min(50, Number(args.limit) || 10));
  const artistsArg = args.artists ? String(args.artists) : null;
  const idsArg = args.ids ? String(args.ids) : null;
  const query = args.q ? String(args.q) : null;

  const items = [];

  if (artistsArg) {
    const artists = artistsArg.split(',').map(s => s.trim()).filter(Boolean);
    for (const a of artists) {
      items.push({ title: '(artist-only)', artist: a, geography: null, id: `artist:${a}` });
    }
  } else {
    // Use curated DB
    curatedDb.load();

    if (idsArg) {
      const ids = idsArg.split(',').map(s => s.trim()).filter(Boolean);
      for (const id of ids) {
        const rec = curatedDb.get(id);
        if (rec) items.push(rec);
      }
    } else if (query) {
      const res = curatedDb.list({ q: query, limit: limit, offset: 0 });
      items.push(...res.items);
    } else {
      // Default: first N songs
      const res = curatedDb.list({ limit: limit, offset: 0 });
      items.push(...res.items);
    }
  }

  const unique = pickUniqueByArtist(items);
  if (!unique.length) {
    console.log('No items found to test.');
    process.exit(0);
  }

  console.log(`Testing geography detection for ${unique.length} item(s):`);
  for (const it of unique) {
    try {
      const suggestion = await detectGeographyForItem(it);
      const before = it.geography || '(none)';
      const after = suggestion.geography || '(unknown)';
      const conf = Math.round((suggestion.confidence || 0) * 100);
      const src = suggestion.source || '(n/a)';
      console.log('---');
      console.log(`Artist: ${it.artist}`);
      console.log(`Title : ${it.title}`);
      console.log(`Current geography: ${before}`);
      console.log(`Suggested        : ${after} [${conf}%] via ${src}`);
      if (suggestion.details && Array.isArray(suggestion.details.candidates)) {
        suggestion.details.candidates.forEach((c, idx) => {
          const cConf = Math.round((c.confidence || 0) * 100);
          console.log(`  - Candidate ${idx + 1}: ${c.code} [${cConf}%] from ${c.source}${c.reason ? ` (${c.reason})` : ''}`);
        });
      }
    } catch (e) {
      console.log('---');
      console.log(`Artist: ${it.artist}`);
      console.log(`Title : ${it.title}`);
      console.log(`ERROR: ${e && e.message}`);
    }
  }

  console.log('\nDone.');
}

main().catch((e) => {
  console.error('Fatal error:', e && e.message);
  process.exit(1);
});
