#!/usr/bin/env node
/**
 * Backfill markets[] and genres[] for curated songs.
 * - Markets represent commercial success regions (e.g., ["SE"], ["US", "SE", "INTL"])
 * - Genres support multi-genre arrays (e.g., ["pop", "rock"])
 *
 * Heuristics:
 * - If isBillboardChart: ensure "US" in markets
 * - If popularity >= 85: ensure "INTL" in markets (globally recognized)
 * - Always include prior geography as a market (backward compatibility)
 * - Preserve existing markets[]/genres[] when present; normalize and dedupe
 * - Keep single fields (geography, genre) as first of arrays for backward compatibility
 *
 * Usage:
 *   node backend/scripts/backfill-markets-genres.js [--dry-run]
 */

const fs = require('fs');
const path = require('path');

const DRY_RUN = process.argv.includes('--dry-run');

const DB_FILE = path.join(__dirname, '..', 'cache', 'curated-songs.json');
const BACKUP_DIR = path.join(__dirname, '..', 'cache');

function readJson(file) {
  try {
    if (!fs.existsSync(file)) return null;
    const raw = fs.readFileSync(file, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    console.error('[Backfill] Failed to read JSON:', e && e.message);
    return null;
  }
}

function writeJson(file, data) {
  try {
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (e) {
    console.error('[Backfill] Failed to write JSON:', e && e.message);
    return false;
  }
}

function ensureDir(dir) {
  try {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  } catch (e) {
    console.warn('[Backfill] Failed to ensure dir:', dir, e && e.message);
  }
}

function normalizeGenres(gen) {
  if (!gen) return [];
  if (Array.isArray(gen)) {
    return Array.from(
      new Set(
        gen.map((g) => String(g || '').trim().toLowerCase()).filter(Boolean)
      )
    );
  }
  if (typeof gen === 'string') {
    return [String(gen).trim().toLowerCase()].filter(Boolean);
  }
  return [];
}

function normalizeMarkets(m) {
  if (!m) return [];
  if (Array.isArray(m)) {
    return Array.from(
      new Set(
        m.map((x) => String(x || '').trim().toUpperCase()).filter(Boolean)
      )
    );
  }
  if (typeof m === 'string') {
    const one = String(m).trim().toUpperCase();
    return one ? [one] : [];
  }
  return [];
}

function backfill(s) {
  let changed = false;

  // Normalize arrays from existing fields
  let markets = normalizeMarkets(s.markets);
  const legacyGeo = String(s.geography || '').trim().toUpperCase();
  if (legacyGeo) {
    if (!markets.includes(legacyGeo)) {
      markets.push(legacyGeo);
      changed = true;
    }
  }

  // Heuristics
  if (s.isBillboardChart) {
    if (!markets.includes('US')) {
      markets.push('US');
      changed = true;
    }
  }
  const pop = Number(s.popularity || 0);
  if (Number.isFinite(pop) && pop >= 85) {
    if (!markets.includes('INTL')) {
      markets.push('INTL');
      changed = true;
    }
  }

  // Genres
  let genres = normalizeGenres(
    Array.isArray(s.genres) ? s.genres : (typeof s.genre === 'string' ? [s.genre] : [])
  );
  // Keep 'chart' if it's the only available signal; otherwise keep existing genres
  // (We avoid trying to guess real genres here to keep backfill safe/non-destructive)
  if (!Array.isArray(s.genres)) {
    // if original had a single genre string, we already added it above
    // nothing else to do
  }

  // Update single fields for backward compatibility
  const firstMarket = markets[0] || (legacyGeo || '');
  const firstGenre = genres[0] || (typeof s.genre === 'string' ? s.genre : '');

  // Apply updates if changed or arrays missing
  const priorMarketsStr = JSON.stringify(s.markets || null);
  const priorGenresStr = JSON.stringify(s.genres || null);

  if (!Array.isArray(s.markets) || JSON.stringify(markets) !== priorMarketsStr) {
    s.markets = markets;
    changed = true;
  }
  if (!Array.isArray(s.genres) || JSON.stringify(genres) !== priorGenresStr) {
    s.genres = genres;
    changed = true;
  }

  if ((s.geography || '') !== firstMarket) {
    s.geography = firstMarket;
    changed = true;
  }
  if ((s.genre || '') !== firstGenre) {
    s.genre = firstGenre;
    changed = true;
  }

  // Optional: ensure 'billboard' tag for chart imports
  if (s.isBillboardChart) {
    const tags = Array.isArray(s.tags) ? s.tags.slice() : [];
    if (!tags.map(String).map(t => t.toLowerCase()).includes('billboard')) {
      tags.push('billboard');
      s.tags = tags;
      changed = true;
    }
  }

  return changed;
}

function main() {
  ensureDir(BACKUP_DIR);

  const data = readJson(DB_FILE);
  if (!Array.isArray(data)) {
    console.error('[Backfill] Database file is missing or not an array:', DB_FILE);
    process.exit(1);
  }

  console.log(`[Backfill] Loaded ${data.length} curated songs from ${DB_FILE}`);

  let updated = 0;
  let addedINTL = 0;
  let ensuredUS = 0;
  let ensuredLegacy = 0;

  const beforeDump = JSON.stringify(data);

  for (const s of data) {
    const before = { markets: s.markets ? s.markets.slice() : null, genres: s.genres ? s.genres.slice() : null, geography: s.geography, genre: s.genre };
    const changed = backfill(s);
    if (changed) {
      updated++;
    }
    // Track counters for quick diagnostics
    const afterMarkets = normalizeMarkets(s.markets);
    if (s.isBillboardChart && afterMarkets.includes('US') && !(before.markets || []).includes('US')) ensuredUS++;
    if (Number(s.popularity || 0) >= 85 && afterMarkets.includes('INTL') && !(before.markets || []).includes('INTL')) addedINTL++;
    if (String(before.geography || '').toUpperCase() && afterMarkets.includes(String(before.geography || '').toUpperCase())) ensuredLegacy++;
  }

  if (DRY_RUN) {
    console.log('[Backfill] Dry run complete. No changes written.');
    console.log('[Backfill] Would update:', { updated, ensuredUS, addedINTL, ensuredLegacy });
    process.exit(0);
  }

  // Create backup before writing
  const ts = new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14);
  const backupFile = path.join(BACKUP_DIR, `curated-songs.backup.${ts}.json`);
  try {
    fs.copyFileSync(DB_FILE, backupFile);
    console.log('[Backfill] Backup created:', backupFile);
  } catch (e) {
    console.warn('[Backfill] Failed to create backup:', e && e.message);
  }

  const ok = writeJson(DB_FILE, data);
  if (!ok) {
    console.error('[Backfill] Failed to save updated DB');
    process.exit(1);
  }

  console.log('[Backfill] Saved updated DB.');
  console.log('[Backfill] Summary:', { updated, ensuredUS, addedINTL, ensuredLegacy });
}

if (require.main === module) {
  main();
}
