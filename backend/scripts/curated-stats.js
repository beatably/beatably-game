#!/usr/bin/env node
/**
 * Curated DB Stats
 * Quick, safe read-only stats to monitor population progress.
 *
 * Usage:
 *   node backend/scripts/curated-stats.js
 * Optional flags:
 *   --file=backend/cache/curated-songs.json
 */

const fs = require('fs');
const path = require('path');

function readArg(name, def) {
  const p = `--${name}=`;
  const hit = process.argv.find(a => a.startsWith(p));
  return hit ? hit.slice(p.length) : def;
}

const file = readArg('file', path.resolve(__dirname, '..', 'cache', 'curated-songs.json'));

function main() {
  try {
    if (!fs.existsSync(file)) {
      console.log(JSON.stringify({ ok: false, error: 'missing_file', file }, null, 2));
      process.exit(0);
    }
    const raw = fs.readFileSync(file, 'utf8');
    let data;
    try {
      data = JSON.parse(raw);
    } catch (e) {
      console.log(JSON.stringify({ ok: false, error: 'parse_error', message: e.message, file }, null, 2));
      process.exit(0);
    }
    if (!Array.isArray(data)) {
      console.log(JSON.stringify({ ok: false, error: 'not_array', file }, null, 2));
      process.exit(0);
    }

    const total = data.length;
    const withArt = data.reduce((a, s) => a + ((s && s.albumArt) ? 1 : 0), 0);
    const withPreview = data.reduce((a, s) => a + ((s && s.previewUrl) ? 1 : 0), 0);

    const genres = {};
    const decades = {};
    for (const s of data) {
      const g = ((s && s.genre) ? String(s.genre) : 'unknown').toLowerCase() || 'unknown';
      genres[g] = (genres[g] || 0) + 1;

      const y = Number(s && s.year);
      let dk = 'unknown';
      if (Number.isFinite(y)) dk = (Math.floor(y / 10) * 10) + 's';
      decades[dk] = (decades[dk] || 0) + 1;
    }

    const topGenres = Object.entries(genres).sort((a, b) => b[1] - a[1]).slice(0, 10);
    const decadeEntries = Object.entries(decades).sort((a, b) => {
      if (a[0] === 'unknown') return 1;
      if (b[0] === 'unknown') return -1;
      return parseInt(a[0]) - parseInt(b[0]);
    });

    const result = {
      ok: true,
      file,
      totals: {
        curatedCount: total,
        withAlbumArt: withArt,
        withPreview: withPreview,
        albumArtPct: total ? Math.round(withArt / total * 100) : 0,
        previewPct: total ? Math.round(withPreview / total * 100) : 0,
      },
      topGenres,
      decades: decadeEntries,
      timestamp: new Date().toISOString()
    };

    console.log(JSON.stringify(result, null, 2));
  } catch (e) {
    console.log(JSON.stringify({ ok: false, error: 'unexpected', message: e.message, file }, null, 2));
  }
}

if (require.main === module) {
  main();
}
