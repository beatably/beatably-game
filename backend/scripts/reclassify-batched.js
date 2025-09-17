#!/usr/bin/env node
/**
 * Reclassify (batched with progress + resume)
 *
 * Goals:
 *  - Reclassify origin (geography) for all curated songs using detectGeographyForArtist
 *  - Ensure markets[] includes the origin
 *  - Optional: Genre enrichment using Spotify (can be slow; off by default)
 *  - Write progress file every batch so we can monitor/resume
 *  - Write DB after each batch to avoid long single-run risk
 *
 * Usage examples:
 *  node backend/scripts/reclassify-batched.js --dry-run
 *  node backend/scripts/reclassify-batched.js --all --batch-size 200 --concurrency 3
 *  node backend/scripts/reclassify-batched.js --resume
 *  node backend/scripts/reclassify-batched.js --include-genres --batch-size 100
 *
 * Flags:
 *  --all                  Process all artists (default true if no filters)
 *  --chart-only           Only process songs with genre="chart" (faster, targets problem songs)
 *  --resume               Resume from progress file if present
 *  --batch-size N         How many unique artists per batch (default 200)
 *  --concurrency N        Parallel workers inside batch (1-6, default 3)
 *  --include-genres       Also enrich genres using hybrid MusicBrainz+Spotify (recommended)
 *  --no-write             Do not write DB/progress (for testing flow)
 *  --dry-run              Alias for --no-write (does not change DB)
 *
 * Monitoring:
 *   tail -f backend/cache/reclassify-progress.json
 *   cat backend/cache/reclassify-progress.json | jq
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const querystring = require('querystring');

// Load env for SPOTIFY_* if needed
try { require('dotenv').config({ path: path.join(__dirname, '..', '.env') }); } catch (_) {}

const { detectGeographyForArtist, detectGenresForArtist } = require('../geographyDetection');

function parseArgs(argv) {
  const args = {
    all: argv.includes('--all') || (!argv.includes('--chart-only')),
    chartOnly: argv.includes('--chart-only'),
    resume: argv.includes('--resume'),
    batchSize: (() => {
      const i = argv.findIndex(a => a === '--batch-size');
      if (i !== -1 && argv[i + 1]) {
        const n = Number(argv[i + 1]);
        if (Number.isFinite(n) && n >= 10 && n <= 1000) return n;
      }
      return 200;
    })(),
    concurrency: (() => {
      const i = argv.findIndex(a => a === '--concurrency');
      if (i !== -1 && argv[i + 1]) {
        const n = Number(argv[i + 1]);
        if (Number.isFinite(n) && n >= 1 && n <= 6) return n;
      }
      return 3;
    })(),
    includeGenres: argv.includes('--include-genres'),
    noWrite: argv.includes('--no-write') || argv.includes('--dry-run')
  };
  return args;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function uniq(arr) { return Array.from(new Set(arr)); }
function normalizeMarkets(m) {
  if (!m) return [];
  if (Array.isArray(m)) return Array.from(new Set(m.map(x => String(x || '').trim().toUpperCase()).filter(Boolean)));
  if (typeof m === 'string') {
    const one = String(m).trim().toUpperCase();
    return one ? [one] : [];
  }
  return [];
}
function normalizeGenresArr(gen) {
  if (!gen) return [];
  if (Array.isArray(gen)) return Array.from(new Set(gen.map(g => String(g || '').toLowerCase()).filter(Boolean)));
  if (typeof gen === 'string') return [String(gen).toLowerCase()].filter(Boolean);
  return [];
}

const CACHE_DIR = path.join(__dirname, '..', 'cache');
const DB_FILE = path.join(CACHE_DIR, 'curated-songs.json');
const PROG_FILE = path.join(CACHE_DIR, 'reclassify-progress.json');

// Spotify helpers (only used when includeGenres = true)
let __clientToken = null;
let __clientTokenExpiry = 0;
const SPOTIFY_MIN_GAP_MS = Number(process.env.SPOTIFY_MIN_GAP_MS) || 650;
let __lastSpotifyCallAt = 0;
async function getClientToken() {
  if (__clientToken && Date.now() < __clientTokenExpiry) return __clientToken;
  const client_id = process.env.SPOTIFY_CLIENT_ID;
  const client_secret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!client_id || !client_secret) throw new Error('SPOTIFY_CLIENT_ID/SECRET missing for --include-genres');
  const resp = await axios.post('https://accounts.spotify.com/api/token',
    querystring.stringify({ grant_type: 'client_credentials', client_id, client_secret }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );
  __clientToken = resp.data.access_token;
  __clientTokenExpiry = Date.now() + (resp.data.expires_in * 1000) - 60000;
  return __clientToken;
}
async function spotifyGet(url, opts = {}, label = '') {
  const gap = Date.now() - __lastSpotifyCallAt;
  if (gap < SPOTIFY_MIN_GAP_MS) await sleep(SPOTIFY_MIN_GAP_MS - gap);
  let attempt = 0;
  while (attempt < 6) {
    try {
      const res = await axios.get(url, opts);
      __lastSpotifyCallAt = Date.now();
      return res;
    } catch (e) {
      const status = e?.response?.status || 0;
      if (status === 429 || (status >= 500 && status < 600)) {
        const retryAfter = Number(e?.response?.headers?.['retry-after'] || 0) * 1000;
        const delay = retryAfter > 0 ? retryAfter : Math.min(30000, (2 ** attempt) * SPOTIFY_MIN_GAP_MS);
        attempt++;
        try { console.warn('[spotifyGet]', label || url, 'retry', attempt, 'delay', delay, 'status', status); } catch {}
        await sleep(delay);
        continue;
      }
      throw e;
    }
  }
  throw new Error('Spotify GET failed after retries: ' + (label || url));
}
function extractTrackId(uri) {
  if (!uri) return null;
  const s = String(uri);
  const m1 = s.match(/spotify:track:([A-Za-z0-9]+)$/);
  if (m1) return m1[1];
  const m2 = s.match(/open\.spotify\.com\/track\/([A-Za-z0-9]+)/);
  if (m2) return m2[1];
  return null;
}
const artistGenresCache = new Map();
const trackToArtistCache = new Map();
function mapSpotifyGenres(genresArr) {
  const g = (genresArr || []).map(s => String(s || '').toLowerCase());
  const has = (...keys) => keys.some(k => g.some(s => s.includes(k)));
  if (has('hip hop', 'rap', 'trap', 'grime', 'drill')) return 'hip-hop';
  if (has('rock', 'metal', 'punk', 'grunge', 'emo')) return 'rock';
  if (has('electronic', 'edm', 'house', 'techno', 'trance', 'dubstep', 'electro', 'drum and bass', 'dnb')) return 'electronic';
  if (has('indie', 'alt', 'alternative', 'shoegaze', 'lo-fi', 'lofi')) return 'indie';
  if (has('pop', 'k-pop', 'dance pop', 'synthpop', 'electropop', 'teen pop', 'r&b', 'soul', 'funk')) return 'pop';
  return null;
}
async function getPrimaryArtistGenresForTrack(trackId) {
  if (!trackId) return [];
  try {
    const token = await getClientToken();
    let artistId = trackToArtistCache.get(trackId);
    if (!artistId) {
      const tr = await spotifyGet(`https://api.spotify.com/v1/tracks/${trackId}`, { headers: { Authorization: `Bearer ${token}` } }, 'tracks:id');
      artistId = tr?.data?.artists?.[0]?.id || null;
      if (artistId) trackToArtistCache.set(trackId, artistId);
      await sleep(80);
    }
    if (!artistId) return [];
    let genres = artistGenresCache.get(artistId);
    if (!genres) {
      const ar = await spotifyGet(`https://api.spotify.com/v1/artists/${artistId}`, { headers: { Authorization: `Bearer ${token}` } }, 'artists:id');
      genres = Array.isArray(ar?.data?.genres) ? ar.data.genres : [];
      artistGenresCache.set(artistId, genres);
    }
    return genres;
  } catch (e) {
    try { console.warn('[genreFetch] failed for track', trackId, e.message); } catch {}
    return [];
  }
}

// Progress helpers
function readProgress() {
  try {
    if (!fs.existsSync(PROG_FILE)) return null;
    return JSON.parse(fs.readFileSync(PROG_FILE, 'utf8'));
  } catch (_) { return null; }
}
function writeProgress(p) {
  try {
    fs.writeFileSync(PROG_FILE, JSON.stringify(p, null, 2), 'utf8');
  } catch (_) {}
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!fs.existsSync(DB_FILE)) throw new Error('curated-songs.json not found: ' + DB_FILE);
  const db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  if (!Array.isArray(db)) throw new Error('curated-songs.json is not an array');

  // Filter songs if chart-only mode
  let targetSongs = db;
  if (args.chartOnly) {
    targetSongs = db.filter(s => String(s.genre || '').toLowerCase() === 'chart');
    console.log(`[ReclassifyBatched] Chart-only mode: targeting ${targetSongs.length} songs with genre="chart"`);
  }

  // Build list of unique artists from target songs
  const artists = uniq(targetSongs.map(s => String(s.artist || '').trim()).filter(Boolean));
  const totalArtists = artists.length;

  // Resume logic
  let progress = args.resume ? readProgress() : null;
  if (!progress) {
    progress = {
      startedAt: new Date().toISOString(),
      finishedAt: null,
      includeGenres: !!args.includeGenres,
      batchSize: args.batchSize,
      concurrency: args.concurrency,
      totalSongs: db.length,
      totalArtists,
      processedArtists: 0,
      processedSongs: 0,
      lastBatch: null
    };
    writeProgress(progress);
  }

  // Helper: detect geo once per artist (cache)
  const geoCache = new Map();

  // Slice artists into batches
  for (let start = progress.processedArtists; start < totalArtists; start += args.batchSize) {
    const end = Math.min(totalArtists, start + args.batchSize);
    const batchArtists = artists.slice(start, end);

    // Build tasks per artist
    let idx = 0;
    const tasks = Array.from({ length: Math.max(1, args.concurrency) }, () => (async function worker() {
      while (idx < batchArtists.length) {
        const i = idx++;
        const artist = batchArtists[i];

        // Get geo (from cache or detect)
        let code = geoCache.get(artist);
        if (typeof code === 'undefined') {
          try {
            const res = await detectGeographyForArtist(artist);
            code = String(res?.geography || '').toUpperCase();
            await sleep(100);
          } catch (_) {
            code = null;
          }
          geoCache.set(artist, code);
        }

        // Update songs for this artist
        const affected = db.filter(s => (s.artist || '').trim() === artist);
        for (const s of affected) {
          const beforeGeo = String(s.geography || '').toUpperCase();
          let markets = normalizeMarkets(s.markets);
          let changed = false;

          if (code && code.length === 2 && code !== beforeGeo) {
            s.geography = code;
            changed = true;
          }
          const origin = String(s.geography || code || '').toUpperCase();
          if (origin && !markets.includes(origin)) {
            markets.push(origin);
            changed = true;
          }
          s.markets = normalizeMarkets(markets);

          // Optional genre enrichment using hybrid MusicBrainz + Spotify
          if (args.includeGenres && (args.chartOnly ? String(s.genre || '').toLowerCase() === 'chart' : true)) {
            try {
              const genreResult = await detectGenresForArtist(artist);
              if (genreResult && genreResult.genres.length > 0) {
                const newGenres = genreResult.genres;
                const currentGenres = normalizeGenresArr(s.genres);
                
                // Update all songs to ensure consistent genre standards across the entire database
                s.genres = newGenres;
                s.genre = newGenres[0];
                changed = true;
                console.log(`[GenreUpdate] ${artist} - ${s.title}: ${newGenres.join(', ')} (source: ${genreResult.sources.map(src => src.source).join(', ')})`);
              }
              await sleep(200); // Be gentle with MusicBrainz
            } catch (e) {
              console.warn(`[GenreUpdate] Failed for ${artist}:`, e.message);
            }
          }

          if (changed) progress.processedSongs++;
        }
        progress.processedArtists++;
        console.log(`[DEBUG] Processed artist ${progress.processedArtists}/${totalArtists}: ${artist}`);
      }
    }));
    await Promise.all(tasks);

    progress.lastBatch = {
      startArtistIndex: start,
      endArtistIndex: end - 1,
      timestamp: new Date().toISOString()
    };

    // Write DB + progress after each batch
    if (!args.noWrite) {
      // Backup only on first write
      if (start === 0) {
        const ts = new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14);
        const backupFile = path.join(CACHE_DIR, `curated-songs.reclassify-batched.backup.${ts}.json`);
        try {
          fs.copyFileSync(DB_FILE, backupFile);
          console.log('[ReclassifyBatched] Backup created:', backupFile);
        } catch (e) {
          console.warn('[ReclassifyBatched] Backup failed:', e && e.message);
        }
      }
      fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8');
    }
    writeProgress(progress);
    console.log(`[ReclassifyBatched] Batch ${Math.floor(start / args.batchSize) + 1}: artists ${start}-${end - 1}/${totalArtists - 1} | processedArtists=${progress.processedArtists} processedSongs=${progress.processedSongs}`);
  }

  progress.finishedAt = new Date().toISOString();
  writeProgress(progress);
  console.log('[ReclassifyBatched] Completed. Total processed artists:', progress.processedArtists, 'songs:', progress.processedSongs);
}

main().catch(err => {
  console.error('[ReclassifyBatched] Fatal:', err && (err.stack || err.message || err));
  process.exit(1);
});
