#!/usr/bin/env node
/**
 * Reclassify origin (geography) and genres for curated songs.
 *
 * - Origin:
 *    Uses detectGeographyForArtist to set geography to the artist's origin (e.g., SE).
 *    Ensures markets[] includes the origin code (preserves existing markets like US).
 *
 * - Genres:
 *    Uses Spotify artist genres (via client credentials) to infer canonical game genres.
 *    Populates genres[] (canonical tags: 'hip-hop','rock','electronic','indie','pop'),
 *    falls back to existing single 'genre'. Keeps s.genre in sync with first of s.genres.
 *
 * Safety:
 *    - Backups the DB before writing.
 *    - Caches artist lookups (by name and ID).
 *    - Throttles Spotify calls and retries on 429/5xx.
 *
 * Usage:
 *   node backend/scripts/reclassify-origin.js --dry-run --artists "Veronica Maggio,Oskar Linnros"
 *   node backend/scripts/reclassify-origin.js --artists "Veronica Maggio,Oskar Linnros"
 *   node backend/scripts/reclassify-origin.js --all --concurrency 3
 *   Flags:
 *     --no-genres         Skip genre reclassification (origin only)
 *     --genres            Force enable genre reclassification (default true)
 *     --concurrency N     Parallel workers (1-6, default 2)
 *     --dry-run, -n       Do not write changes, print summary
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const querystring = require('querystring');

// Load environment variables from backend/.env if present (for SPOTIFY_* creds)
try { require('dotenv').config({ path: path.join(__dirname, '..', '.env') }); } catch (e) {}

const { detectGeographyForArtist } = require('../geographyDetection');

// --- CLI args parsing ---
function parseArgs(argv) {
  const args = {
    dryRun: argv.includes('--dry-run') || argv.includes('-n'),
    all: argv.includes('--all'),
    artists: [],
    concurrency: 2,
    doGenres: true
  };
  const aIdx = argv.findIndex(a => a === '--artists' || a === '-a');
  if (aIdx !== -1 && argv[aIdx + 1]) {
    args.artists = String(argv[aIdx + 1]).split(',').map(s => s.trim()).filter(Boolean);
  }
  const cIdx = argv.findIndex(a => a === '--concurrency' || a === '-c');
  if (cIdx !== -1 && argv[cIdx + 1]) {
    const n = Number(argv[cIdx + 1]);
    if (Number.isFinite(n) && n >= 1 && n <= 6) args.concurrency = n;
  }
  if (argv.includes('--no-genres')) args.doGenres = false;
  if (argv.includes('--genres')) args.doGenres = true;
  return args;
}

// --- Helpers ---
function normalizeMarkets(m) {
  if (!m) return [];
  if (Array.isArray(m)) {
    return Array.from(new Set(m.map(x => String(x || '').trim().toUpperCase()).filter(Boolean)));
  }
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
function uniq(arr) { return Array.from(new Set(arr)); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function extractTrackId(uri) {
  // Supports spotify:track:ID or https://open.spotify.com/track/ID
  if (!uri) return null;
  const s = String(uri);
  const m1 = s.match(/spotify:track:([A-Za-z0-9]+)$/);
  if (m1) return m1[1];
  const m2 = s.match(/open\.spotify\.com\/track\/([A-Za-z0-9]+)/);
  if (m2) return m2[1];
  return null;
}

// --- Spotify client credentials + limiter ---
const SPOTIFY_MIN_GAP_MS = Number(process.env.SPOTIFY_MIN_GAP_MS) || 650;
let __lastSpotifyCallAt = 0;
let __clientToken = null;
let __clientTokenExpiry = 0;

async function getClientToken() {
  if (__clientToken && Date.now() < __clientTokenExpiry) return __clientToken;
  const client_id = process.env.SPOTIFY_CLIENT_ID;
  const client_secret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!client_id || !client_secret) {
    throw new Error('SPOTIFY_CLIENT_ID/SECRET missing in environment for genre reclassification');
  }
  const resp = await axios.post('https://accounts.spotify.com/api/token',
    querystring.stringify({
      grant_type: 'client_credentials',
      client_id,
      client_secret
    }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );
  __clientToken = resp.data.access_token;
  __clientTokenExpiry = Date.now() + (resp.data.expires_in * 1000) - 60000;
  return __clientToken;
}

async function spotifyGet(url, opts = {}, label = '') {
  // simple limiter
  const now = Date.now();
  const gap = now - __lastSpotifyCallAt;
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

// Map Spotify artist genres to our canonical buckets
function mapSpotifyGenres(genresArr) {
  const g = (genresArr || []).map(s => String(s || '').toLowerCase());
  const has = (...keys) => keys.some(k => g.some(s => s.includes(k)));
  if (has('hip hop', 'rap', 'trap', 'grime', 'drill')) return 'hip-hop';
  if (has('rock', 'metal', 'punk', 'grunge', 'emo')) return 'rock';
  if (has('electronic', 'edm', 'house', 'techno', 'trance', 'dubstep', 'electro', 'drum and bass', 'dnb')) return 'electronic';
  if (has('indie', 'alt', 'alternative', 'shoegaze', 'lo-fi', 'lofi')) return 'indie';
  if (has('pop', 'k-pop', 'dance pop', 'synthpop', 'electropop', 'teen pop', 'r&amp;b', 'r&b', 'soul', 'funk')) return 'pop';
  return null;
}

// Fetch primary artist's Spotify genres given a track ID
const artistGenresCache = new Map(); // artistId -> raw genres[]
const trackToArtistCache = new Map(); // trackId -> artistId
async function getPrimaryArtistGenresForTrack(trackId) {
  if (!trackId) return [];
  try {
    const token = await getClientToken();

    let artistId = trackToArtistCache.get(trackId);
    if (!artistId) {
      const tr = await spotifyGet(`https://api.spotify.com/v1/tracks/${trackId}`, {
        headers: { Authorization: `Bearer ${token}` }
      }, 'tracks:id');
      artistId = tr?.data?.artists?.[0]?.id || null;
      if (artistId) trackToArtistCache.set(trackId, artistId);
      await sleep(80);
    }

    if (!artistId) return [];

    let genres = artistGenresCache.get(artistId);
    if (!genres) {
      const ar = await spotifyGet(`https://api.spotify.com/v1/artists/${artistId}`, {
        headers: { Authorization: `Bearer ${token}` }
      }, 'artists:id');
      genres = Array.isArray(ar?.data?.genres) ? ar.data.genres : [];
      artistGenresCache.set(artistId, genres);
    }
    return genres;
  } catch (e) {
    try { console.warn('[genreFetch] failed for track', trackId, e.message); } catch {}
    return [];
  }
}

// --- Main ---
async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.all && (!args.artists || !args.artists.length)) {
    console.error('[Reclassify] Provide --artists "A,B" or use --all. Use --dry-run to preview.');
    process.exit(1);
  }

  const DB_FILE = path.join(__dirname, '..', 'cache', 'curated-songs.json');
  if (!fs.existsSync(DB_FILE)) {
    console.error('[Reclassify] curated-songs.json not found:', DB_FILE);
    process.exit(1);
  }

  let data = [];
  try {
    data = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch (e) {
    console.error('[Reclassify] Failed reading DB:', e && e.message);
    process.exit(1);
  }
  if (!Array.isArray(data)) {
    console.error('[Reclassify] DB is not an array');
    process.exit(1);
  }

  const matchArtist = (name) => {
    if (args.all) return true;
    const n = String(name || '').toLowerCase();
    return args.artists.some(a => n.includes(String(a || '').toLowerCase()));
  };

  const targets = data.filter(s => matchArtist(s.artist));
  console.log(`[Reclassify] Loaded ${data.length} songs; targeting ${targets.length} by artist filter.`);
  const artistGeoCache = new Map(); // artist name (lc) -> origin code

  let updated = 0;
  let changedGeo = 0;
  let ensuredOriginInMarkets = 0;
  let genreUpdated = 0;

  const diffs = [];

  let idx = 0;
  const workers = Array.from({ length: Math.max(1, args.concurrency) }, () => (async function worker() {
    while (idx < targets.length) {
      const i = idx++;
      const s = targets[i];

      // Normalize fields
      const currentGeo = String(s.geography || '').trim().toUpperCase();
      let markets = normalizeMarkets(s.markets);
      let genres = normalizeGenresArr(s.genres);
      if (!genres.length && s.genre) genres = normalizeGenresArr([s.genre]);

      // --- Origin detection ---
      const key = String(s.artist || '').toLowerCase();
      let detectedGeo = artistGeoCache.get(key);
      if (typeof detectedGeo === 'undefined') {
        let got = null;
        try {
          got = await detectGeographyForArtist(s.artist || '');
          await sleep(100);
        } catch (e) {
          got = null;
        }
        detectedGeo = String(got && got.geography || '').trim().toUpperCase() || null;
        artistGeoCache.set(key, detectedGeo);
      }

      const before = {
        geography: currentGeo,
        markets: markets.slice(),
        genres: genres.slice(),
        genre: s.genre || ''
      };

      let changed = false;

      if (detectedGeo && detectedGeo.length === 2 && detectedGeo !== currentGeo) {
        s.geography = detectedGeo;
        changed = true;
        changedGeo++;
      }

      // Ensure origin is in markets
      const origin = String(s.geography || detectedGeo || '').toUpperCase();
      if (origin && !markets.includes(origin)) {
        markets.push(origin);
        changed = true;
        ensuredOriginInMarkets++;
      }
      s.markets = normalizeMarkets(markets);

      // --- Genre enrichment (Spotify) ---
      if (args.doGenres) {
        const tid = extractTrackId(s.spotifyUri || s.uri || '');
        const rawArtistGenres = await getPrimaryArtistGenresForTrack(tid);
        const canonical = mapSpotifyGenres(rawArtistGenres);
        if (canonical) {
          if (!genres.includes(canonical)) {
            genres = uniq([...genres, canonical]);
            changed = true;
            genreUpdated++;
          }
        }
        // Keep a minimal set (canonical buckets only if present)
        s.genres = genres;
        // Update single 'genre' to first of genres[] for backward compatibility
        if (s.genres && s.genres.length) {
          s.genre = s.genres[0];
        }
      } else {
        // Ensure genres[] mirrors single field when arrays missing
        if (!genres.length && s.genre) genres = [String(s.genre).toLowerCase()];
        s.genres = genres;
      }

      if (changed) {
        updated++;
        diffs.push({
          id: s.id,
          artist: s.artist,
          title: s.title,
          before,
          after: { geography: s.geography, markets: s.markets.slice(), genres: s.genres.slice(), genre: s.genre || '' }
        });
      }
    }
  })());

  await Promise.all(workers);

  console.log('[Reclassify] Summary:', {
    targeted: targets.length,
    updated,
    changedGeo,
    ensuredOriginInMarkets,
    genreUpdated,
    uniqueArtistsQueriedForOrigin: artistGeoCache.size,
    uniqueArtistsQueriedForGenres: artistGenresCache.size
  });

  if (args.dryRun) {
    console.log('[Reclassify] Dry-run; sample changes (up to 10):');
    diffs.slice(0, 10).forEach(d => {
      console.log(` - ${d.artist} - ${d.title} | geo ${d.before.geography} -> ${d.after.geography} | markets ${d.before.markets.join(',')} -> ${d.after.markets.join(',')} | genres ${d.before.genres.join(',')} -> ${d.after.genres.join(',')}`);
    });
    console.log('[Reclassify] No changes written.');
    process.exit(0);
  }

  // Backup then write
  const ts = new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14);
  const backupFile = path.join(path.dirname(DB_FILE), `curated-songs.reclassify.backup.${ts}.json`);
  try {
    fs.copyFileSync(DB_FILE, backupFile);
    console.log('[Reclassify] Backup created:', backupFile);
  } catch (e) {
    console.warn('[Reclassify] Failed to create backup:', e && e.message);
  }

  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
    console.log('[Reclassify] Saved updated DB.');
  } catch (e) {
    console.error('[Reclassify] Failed to save DB:', e && e.message);
    process.exit(1);
  }

  // Report
  try {
    const reportFile = path.join(path.dirname(DB_FILE), `reclassify-report.${ts}.json`);
    fs.writeFileSync(reportFile, JSON.stringify({ summary: { updated, changedGeo, ensuredOriginInMarkets, genreUpdated }, diffs }, null, 2));
    console.log('[Reclassify] Report written to:', reportFile);
  } catch (e) {
    console.warn('[Reclassify] Failed to write report:', e && e.message);
  }
}

main().catch(err => {
  console.error('[Reclassify] Fatal:', err && (err.stack || err.message || err));
  process.exit(1);
});
