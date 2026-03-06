#!/usr/bin/env node
/**
 * clean-easy-mode.js
 *
 * Cleanup script for Easy mode bad apples. Reads an audit report produced by
 * audit-easy-mode.js and applies bulk actions to the song database.
 *
 * ALWAYS creates a timestamped backup before any write.
 *
 * Usage:
 *   node backend/scripts/clean-easy-mode.js --dry-run
 *     Show what would change, no writes.
 *
 *   node backend/scripts/clean-easy-mode.js --delete --categories children_or_novelty,tribute_artist
 *     Delete songs in those categories from the database entirely.
 *
 *   node backend/scripts/clean-easy-mode.js --demote --categories version_variant,low_popularity_chart
 *     Set difficultyLevel=3 on songs in those categories (keeps them in DB but removes from Easy pool).
 *
 *   node backend/scripts/clean-easy-mode.js --delete --ids cur_abc123,cur_def456
 *     Target specific song IDs (comma-separated).
 *
 *   node backend/scripts/clean-easy-mode.js --delete --ids-file path/to/ids.txt
 *     Load IDs from a newline-separated file.
 *
 * Flags can be combined:
 *   node backend/scripts/clean-easy-mode.js \
 *     --delete --categories children_or_novelty,tribute_artist \
 *     --demote --categories version_variant,low_popularity_chart \
 *     --dry-run
 *
 * Available categories (from audit script):
 *   children_or_novelty  — baby songs, white noise, nursery rhymes
 *   tribute_artist       — karaoke, tribute bands, "as made famous by"
 *   version_variant      — remixes, covers, live versions, remasters
 *   low_popularity_chart — Billboard-flagged but popularity < threshold
 */

const fs = require('fs');
const path = require('path');

// ── Config ────────────────────────────────────────────────────────────────────

const DB_PATH = path.join(__dirname, '../cache/curated-songs.json');
const AUDIT_PATH = path.join(__dirname, '../cache/audit-easy-mode-results.json');
const BACKUPS_DIR = path.join(__dirname, '../cache/backups');

const VALID_CATEGORIES = ['children_or_novelty', 'tribute_artist', 'version_variant', 'low_popularity_chart'];

// ── Arg parsing ───────────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    dryRun: args.includes('--dry-run'),
    deleteAction: args.includes('--delete'),
    demoteAction: args.includes('--demote'),
    deleteCategories: [],
    demoteCategories: [],
    targetIds: new Set(),
    auditPath: AUDIT_PATH,
  };

  // --audit path/to/audit.json
  if (args.includes('--audit')) {
    opts.auditPath = args[args.indexOf('--audit') + 1];
  }

  // --categories for --delete and --demote
  // We parse left-to-right: the --categories immediately after --delete applies to delete,
  // the --categories immediately after --demote applies to demote.
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--delete' && args[i + 1] === '--categories') {
      opts.deleteCategories = args[i + 2]?.split(',').map((c) => c.trim()).filter(Boolean) || [];
      i += 2;
    } else if (args[i] === '--demote' && args[i + 1] === '--categories') {
      opts.demoteCategories = args[i + 2]?.split(',').map((c) => c.trim()).filter(Boolean) || [];
      i += 2;
    }
  }

  // Fallback: if --delete has no --categories after it, use all clear-bad-apple categories
  if (opts.deleteAction && opts.deleteCategories.length === 0 && !args.includes('--ids') && !args.includes('--ids-file')) {
    opts.deleteCategories = ['children_or_novelty', 'tribute_artist'];
  }
  if (opts.demoteAction && opts.demoteCategories.length === 0 && !args.includes('--ids') && !args.includes('--ids-file')) {
    opts.demoteCategories = ['version_variant', 'low_popularity_chart'];
  }

  // --ids cur_abc,cur_def
  if (args.includes('--ids')) {
    const raw = args[args.indexOf('--ids') + 1] || '';
    raw.split(',').forEach((id) => id.trim() && opts.targetIds.add(id.trim()));
  }

  // --ids-file path/to/ids.txt
  if (args.includes('--ids-file')) {
    const filePath = args[args.indexOf('--ids-file') + 1];
    if (filePath && fs.existsSync(filePath)) {
      fs.readFileSync(filePath, 'utf8')
        .split('\n')
        .forEach((id) => id.trim() && opts.targetIds.add(id.trim()));
    } else {
      console.error(`--ids-file: file not found: ${filePath}`);
      process.exit(1);
    }
  }

  return opts;
}

// ── Backup ────────────────────────────────────────────────────────────────────

function createBackup(dbPath) {
  if (!fs.existsSync(BACKUPS_DIR)) {
    fs.mkdirSync(BACKUPS_DIR, { recursive: true });
  }
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(BACKUPS_DIR, `curated-songs-before-clean-${ts}.json`);
  fs.copyFileSync(dbPath, backupPath);
  return backupPath;
}

// ── Main ──────────────────────────────────────────────────────────────────────

function main() {
  const opts = parseArgs();

  if (!opts.deleteAction && !opts.demoteAction) {
    console.error('Error: specify --delete and/or --demote (use --dry-run to preview).');
    console.error('Run with --help or read the script header for usage.');
    process.exit(1);
  }

  // Load audit report
  if (!fs.existsSync(opts.auditPath)) {
    console.error(`Audit report not found: ${opts.auditPath}`);
    console.error('Run audit-easy-mode.js first.');
    process.exit(1);
  }
  const audit = JSON.parse(fs.readFileSync(opts.auditPath, 'utf8'));

  // Load database
  if (!fs.existsSync(DB_PATH)) {
    console.error(`Database not found: ${DB_PATH}`);
    process.exit(1);
  }
  const db = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  const songs = Array.isArray(db) ? db : db.songs || Object.values(db);
  const isArray = Array.isArray(db);

  // Build ID sets from audit categories
  const toDelete = new Set(opts.targetIds);
  const toDemote = new Set();

  // If --ids were provided, those IDs get the requested action
  if (opts.targetIds.size > 0) {
    if (opts.deleteAction) opts.targetIds.forEach((id) => toDelete.add(id));
    if (opts.demoteAction) opts.targetIds.forEach((id) => toDemote.add(id));
  }

  // Collect from audit categories
  for (const cat of opts.deleteCategories) {
    if (!VALID_CATEGORIES.includes(cat)) {
      console.warn(`Warning: unknown category "${cat}", skipping.`);
      continue;
    }
    (audit.categories[cat] || []).forEach((s) => toDelete.add(s.id));
  }
  for (const cat of opts.demoteCategories) {
    if (!VALID_CATEGORIES.includes(cat)) {
      console.warn(`Warning: unknown category "${cat}", skipping.`);
      continue;
    }
    (audit.categories[cat] || []).forEach((s) => {
      if (!toDelete.has(s.id)) toDemote.add(s.id);
    });
  }

  if (toDelete.size === 0 && toDemote.size === 0) {
    console.log('Nothing to do — no songs matched the specified categories/IDs.');
    process.exit(0);
  }

  // Preview
  console.log(`\n── Planned Actions ────────────────────────────────────────────`);
  console.log(`  Delete : ${toDelete.size} songs`);
  console.log(`  Demote : ${toDemote.size} songs (difficultyLevel → 3)`);
  console.log(`  Mode   : ${opts.dryRun ? 'DRY RUN (no writes)' : 'LIVE'}`);

  if (opts.dryRun) {
    // Show what would be deleted
    if (toDelete.size > 0) {
      console.log('\n[DELETE] First 20 songs that would be removed:');
      songs
        .filter((s) => toDelete.has(s.id))
        .slice(0, 20)
        .forEach((s) => console.log(`  "${s.title}" — ${s.artist} (pop:${s.popularity ?? '??'})`));
    }
    if (toDemote.size > 0) {
      console.log('\n[DEMOTE] First 20 songs that would have difficultyLevel set to 3:');
      songs
        .filter((s) => toDemote.has(s.id))
        .slice(0, 20)
        .forEach((s) => console.log(`  "${s.title}" — ${s.artist} (pop:${s.popularity ?? '??'})`));
    }
    console.log('\nDry run complete. Re-run without --dry-run to apply changes.');
    return;
  }

  // Backup
  const backupPath = createBackup(DB_PATH);
  console.log(`\nBackup created: ${backupPath}`);

  // Apply changes
  let deleted = 0;
  let demoted = 0;

  const updatedSongs = songs
    .filter((s) => {
      if (toDelete.has(s.id)) {
        deleted++;
        return false;
      }
      return true;
    })
    .map((s) => {
      if (toDemote.has(s.id)) {
        demoted++;
        return { ...s, difficultyLevel: 3, updatedAt: new Date().toISOString() };
      }
      return s;
    });

  // Write back in the same format
  const output = isArray ? updatedSongs : { ...db, songs: updatedSongs };
  fs.writeFileSync(DB_PATH, JSON.stringify(output, null, 2), 'utf8');

  console.log(`\n── Done ───────────────────────────────────────────────────────`);
  console.log(`  Deleted : ${deleted} songs`);
  console.log(`  Demoted : ${demoted} songs`);
  console.log(`  Remaining: ${updatedSongs.length} songs in database`);
  console.log('\nNext: run node backend/scripts/curated-stats.js to verify the new Easy pool size.');
}

main();
