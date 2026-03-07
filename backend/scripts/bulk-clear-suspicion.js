#!/usr/bin/env node
/**
 * bulk-clear-suspicion.js
 *
 * One-time script: marks all currently suspicious songs as suspicionCleared=true.
 * Run this after you've already manually deleted the real bad apples from production,
 * so the remaining false positives stop showing in the ⚠ filter.
 *
 * Usage:
 *   node backend/scripts/bulk-clear-suspicion.js --dry-run   (preview only)
 *   node backend/scripts/bulk-clear-suspicion.js             (apply changes)
 */

'use strict';

const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '../cache/curated-songs.json');
const BACKUPS_DIR = path.join(__dirname, '../cache/backups');

const dryRun = process.argv.includes('--dry-run');

// ── Same detection patterns as admin.html getSuspiciousReason() ──────────────

const CHILDREN_GENRE = /\b(children|kids?|nursery|lullaby|lullabies|baby|toddler)\b/i;
const CHILDREN_TITLE = /\b(nursery rhyme|lullaby|lullabies|white noise|rain sounds?|ambient sounds?|baby sleep|baby songs?|kids?\s+songs?)\b/i;
const TRIBUTE_ARTIST = /\b(tribute|karaoke|performed by|as made famous|in the style of|soundalike|cover band|cover versions?)\b/i;
const VARIANT_TITLE  = /\b(remix|cover|live|remaster(ed)?|acoustic|instrumental|tribute|karaoke|medley|extended|radio edit|demo|stripped|piano version|slowed|sped[ -]up|nightcore|bootleg|club mix|vip mix)\b/i;
const SUSPICIOUS_POP_THRESHOLD = 20;

function isSuspicious(s) {
  const title  = s.title  || '';
  const artist = s.artist || '';
  const genres = [s.genre, s.genreSecondary, ...(s.genres || [])].filter(Boolean).join(' ');
  if (CHILDREN_GENRE.test(genres))   return true;
  if (CHILDREN_TITLE.test(title))    return true;
  if (TRIBUTE_ARTIST.test(artist))   return true;
  if (VARIANT_TITLE.test(title))     return true;
  if (s.isBillboardChart && (s.popularity || 0) < SUSPICIOUS_POP_THRESHOLD) return true;
  return false;
}

// ── Main ──────────────────────────────────────────────────────────────────────

if (!fs.existsSync(DB_PATH)) {
  console.error('Database not found:', DB_PATH);
  process.exit(1);
}

const db = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
const songs = Array.isArray(db) ? db : (db.songs || Object.values(db));
const isArray = Array.isArray(db);

const toUpdate = songs.filter(s => isSuspicious(s) && !s.suspicionCleared);

console.log(`Total songs      : ${songs.length}`);
console.log(`Suspicious found : ${songs.filter(isSuspicious).length}`);
console.log(`Already cleared  : ${songs.filter(s => s.suspicionCleared).length}`);
console.log(`Will mark OK     : ${toUpdate.length}`);

if (toUpdate.length === 0) {
  console.log('\nNothing to do.');
  process.exit(0);
}

if (dryRun) {
  console.log('\n[DRY RUN] First 20 songs that would be marked OK:');
  toUpdate.slice(0, 20).forEach(s =>
    console.log(`  [pop:${s.popularity ?? '??'}] "${s.title}" — ${s.artist}`)
  );
  console.log('\nRe-run without --dry-run to apply.');
  process.exit(0);
}

// Backup
if (!fs.existsSync(BACKUPS_DIR)) fs.mkdirSync(BACKUPS_DIR, { recursive: true });
const ts = new Date().toISOString().replace(/[:.]/g, '-');
const backupPath = path.join(BACKUPS_DIR, `curated-songs-before-bulk-clear-${ts}.json`);
fs.copyFileSync(DB_PATH, backupPath);
console.log(`\nBackup: ${backupPath}`);

// Apply
const now = new Date().toISOString();
const idSet = new Set(toUpdate.map(s => s.id));
const updated = songs.map(s =>
  idSet.has(s.id) ? { ...s, suspicionCleared: true, updatedAt: now } : s
);

const output = isArray ? updated : { ...db, songs: updated };
fs.writeFileSync(DB_PATH, JSON.stringify(output, null, 2), 'utf8');

console.log(`\nDone. ${toUpdate.length} songs marked as suspicionCleared=true.`);
