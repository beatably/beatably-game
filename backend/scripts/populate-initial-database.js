/**
 * Populate Initial Database Script
 * - Phase 1: Import comprehensive Billboard Hot 100 history (resolve to Spotify)
 * - Phase 2: Supplement with genre-based Spotify searches to fill gaps
 * - Writes into backend/cache/curated-songs.json via curatedDb.add (file-backed)
 *
 * Usage examples:
 *   node backend/scripts/populate-initial-database.js --billboard --search --billboardLimit=4000 --searchLimit=2000 --yearMin=1960 --yearMax=2024 --markets=US --genres=pop,rock,hip-hop,electronic,indie
 *   node backend/scripts/populate-initial-database.js --billboard --billboardLimit=5000 --dryRun
 *
 * Env requirements:
 *   SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET (client credentials)
 *   Optional: SPOTIFY_MIN_GAP_MS (default 650ms)
 */

'use strict';

const fs = require('fs');
const path = require('path');
const axios = require('axios');

const projectRoot = path.resolve(__dirname, '..'); // backend/
const envPath = path.resolve(projectRoot, '.env');
if (process.env.NODE_ENV !== 'production') {
  try {
    require('dotenv').config({ path: envPath });
  } catch {}
}

const curatedDb = require('../curatedDb');
const { getChartEntries } = require('../chartProvider');
const { config } = require('../config');
let mb = null;
try {
  mb = require('../musicbrainz');
} catch {
  // Optional (enrichment)
  mb = null;
}

// --- CLI args parsing ---
const args = process.argv.slice(2);
function getArg(name, def) {
  const key = `--${name}`;
  const match = args.find((a) => a === key || a.startsWith(`${key}=`));
  if (!match) return def;
  if (match === key) return true;
  const [, v] = match.split('=');
  return v ?? true;
}

const opt = {
  includeBillboard: !!getArg('billboard', true),
  includeSearch: !!getArg('search', true),
  billboardLimit: Number(getArg('billboardLimit', 4000)) || 4000,
  searchLimit: Number(getArg('searchLimit', 2000)) || 2000,
  yearMin: Number(getArg('yearMin', '')) || null,
  yearMax: Number(getArg('yearMax', '')) || null,
  markets: String(getArg('markets', 'US')).split(',').map(s => s.trim().toUpperCase()).filter(Boolean),
  genres: String(getArg('genres', 'pop,rock,hip-hop,electronic,indie')).split(',').map(s => s.trim().toLowerCase()).filter(Boolean),
  dryRun: !!getArg('dryRun', false),
  difficulty: String(getArg('difficulty', 'hard')).toLowerCase(), // 'easy'|'normal'|'hard' -- use 'hard' to include up to rank 100
};

// --- Safety checks ---
if (!process.env.SPOTIFY_CLIENT_ID || !process.env.SPOTIFY_CLIENT_SECRET) {
  console.error('[INIT] Spotify client credentials missing. Set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET in backend/.env');
  process.exit(1);
}

const SPOTIFY_MIN_GAP_MS = Number(process.env.SPOTIFY_MIN_GAP_MS) || 650;
let __lastSpotifyCallAt = 0;
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

// Rate-limited GET with retries (429/5xx)
async function spotifyGet(url, opts = {}, label = '') {
  const now = Date.now();
  const gap = now - __lastSpotifyCallAt;
  if (gap < SPOTIFY_MIN_GAP_MS) {
    await sleep(SPOTIFY_MIN_GAP_MS - gap);
  }

  let attempt = 0;
  while (attempt < 6) {
    try {
      const res = await axios.get(url, opts);
      __lastSpotifyCallAt = Date.now();
      return res;
    } catch (e) {
      const status = e?.response?.status;
      if (status === 429 || (status >= 500 && status < 600)) {
        const retryAfterHeader = e?.response?.headers?.['retry-after'];
        let delay = retryAfterHeader ? Number(retryAfterHeader) * 1000 : Math.min(30000, (2 ** attempt) * SPOTIFY_MIN_GAP_MS);
        if (!Number.isFinite(delay) || delay <= 0) delay = Math.min(30000, (2 ** attempt) * SPOTIFY_MIN_GAP_MS);
        attempt++;
        try {
          console.warn('[SpotifyLimiter]', { status, attempt, delay, label: label || url });
        } catch {}
        await sleep(delay);
        continue;
      }
      throw e;
    }
  }
  throw new Error('Spotify API request failed after retries: ' + (label || url));
}

let clientToken = null;
let clientTokenExpiry = null;
async function getClientToken() {
  if (clientToken && clientTokenExpiry && Date.now() < clientTokenExpiry) {
    return clientToken;
  }
  const resp = await axios.post('https://accounts.spotify.com/api/token',
    new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: process.env.SPOTIFY_CLIENT_ID,
      client_secret: process.env.SPOTIFY_CLIENT_SECRET,
    }).toString(),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );
  clientToken = resp.data.access_token;
  clientTokenExpiry = Date.now() + (resp.data.expires_in * 1000) - 60000;
  return clientToken;
}

// Billboard genre mapping via Spotify artist genres
function mapSpotifyGenres(genresArr) {
  const g = (genresArr || []).map(s => String(s || '').toLowerCase());
  const has = (...keys) => keys.some(k => g.some(s => s.includes(k)));
  if (has('hip hop', 'rap', 'trap', 'grime', 'drill')) return 'hip-hop';
  if (has('rock', 'metal', 'punk', 'grunge', 'emo')) return 'rock';
  if (has('electronic', 'edm', 'house', 'techno', 'trance', 'dubstep', 'electro', 'drum and bass', 'dnb')) return 'electronic';
  if (has('indie', 'alt', 'alternative', 'shoegaze', 'lo-fi', 'lofi')) return 'indie';
  if (has('pop', 'k-pop', 'dance pop', 'synthpop', 'electropop', 'teen pop')) return 'pop';
  if (has('r&b', 'rnb', 'soul', 'funk')) return 'pop';
  return null;
}

function isSuspiciousTrack({ title, album }) {
  const t = `${title || ''}`.toLowerCase();
  const a = `${album || ''}`.toLowerCase();
  const hasRemaster = /\b(remaster|remastered|re[-\s]?record|live|karaoke|tribute|instrumental)\b/.test(t) || /\b(remaster|remastered|re[-\s]?record|live|karaoke|tribute|instrumental)\b/.test(a);
  // Prefer using musicbrainz.isRemasterMarker if available
  if (mb && typeof mb.isRemasterMarker === 'function') {
    return mb.isRemasterMarker(t) || mb.isRemasterMarker(a) || /\blive\b/.test(t);
  }
  return hasRemaster;
}

// Year-based searches to diversify Spotify results (replicated from backend)
function createYearBasedSearches(yearRange, genres) {
  const { min: minYear, max: maxYear } = yearRange;
  if (!minYear || !maxYear) return [];
  const searches = [];
  // Decade-based
  for (let y = Math.floor(minYear / 10) * 10; y <= maxYear; y += 10) {
    const decadeStart = Math.max(y, minYear);
    const decadeEnd = Math.min(y + 9, maxYear);
    if (decadeStart > decadeEnd) continue;
    const yr = `year:${decadeStart}-${decadeEnd}`;
    searches.push(yr, `${yr} hits`, `${yr} popular`);
    genres.forEach((g) => searches.push(`${yr} genre:${g}`));
  }
  // 5-year windows
  for (let y = minYear; y <= maxYear; y += 5) {
    const end = Math.min(y + 4, maxYear);
    const yr = `year:${y}-${end}`;
    searches.push(yr);
    const pick = [...genres].sort(() => 0.5 - Math.random()).slice(0, 2);
    pick.forEach((g) => searches.push(`${yr} genre:${g}`));
  }
  return searches;
}

function backupCuratedDb() {
  try {
    const dbFile = path.resolve(projectRoot, 'cache', 'curated-songs.json');
    if (!fs.existsSync(dbFile)) {
      console.log('[Backup] No curated DB yet, skipping backup.');
      return;
    }
    const backupDir = path.resolve(projectRoot, 'cache', 'backups');
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const dest = path.join(backupDir, `curated-songs.backup.${stamp}.json`);
    fs.copyFileSync(dbFile, dest);
    console.log('[Backup] Saved backup to', dest);
  } catch (e) {
    console.warn('[Backup] Failed:', e?.message);
  }
}

async function importFromBillboard({ cap, difficulty, yearMin, yearMax, market }) {
  console.log('\n[Phase 1] Importing from Billboard (historical)...');
  let entries = [];
  try {
    entries = await getChartEntries({
      mode: 'all',
      difficulty: difficulty || 'hard',
      yearMin: Number.isFinite(yearMin) ? yearMin : undefined,
      yearMax: Number.isFinite(yearMax) ? yearMax : undefined
    });
  } catch (e) {
    console.warn('[Billboard] getChartEntries failed:', e?.message);
    entries = [];
  }
  console.log(`[Billboard] Entries after normalize/dedupe/difficulty: ${entries.length}`);

  const token = await getClientToken();
  const items = [];
  const seen = new Set(); // by spotifyUri
  const artistGenresCache = new Map();
  let processed = 0, saved = 0, updated = 0, skipped = 0;

  for (const entry of entries) {
    if (items.length >= cap) break;
    processed++;
    try {
      const q = `artist:"${entry.artist}" track:"${entry.title}"${entry.year ? ` year:${entry.year}` : ''}`;
      const resp = await spotifyGet('https://api.spotify.com/v1/search', {
        headers: { Authorization: `Bearer ${token}` },
        params: { q, type: 'track', limit: 5, market: market || 'US' }
      }, 'search:billboard');
      const t = (resp.data.tracks.items || [])[0];
      if (!t) { skipped++; continue; }

      const spotifyUri = t.uri;
      if (seen.has(spotifyUri)) { skipped++; continue; }
      seen.add(spotifyUri);

      // Remaster/live filter (optional)
      if (config.featureFlags?.enableRemasterFilter) {
        if (isSuspiciousTrack({ title: t.name, album: t.album?.name || '' })) {
          skipped++;
          continue;
        }
      }

      // Determine mapped genre
      let genreTag = null;
      try {
        const artistId = t.artists?.[0]?.id || null;
        if (artistId) {
          let artistGenres = artistGenresCache.get(artistId);
          if (!artistGenres) {
            const artResp = await spotifyGet(`https://api.spotify.com/v1/artists/${artistId}`, {
              headers: { Authorization: `Bearer ${token}` }
            }, 'artist:genres');
            artistGenres = artResp?.data?.genres || [];
            artistGenresCache.set(artistId, artistGenres);
          }
          genreTag = mapSpotifyGenres(artistGenres);
        }
      } catch {}

      const year = new Date(t.album.release_date).getFullYear();
      const popularity = t.popularity;
      const albumArt = t.album.images?.[0]?.url || null;
      const previewUrl = t.preview_url || null;

      // Optional MusicBrainz enrichment for year anomalies
      let finalYear = year;
      if (mb && config.featureFlags?.enableMusicBrainz) {
        const suspicious = /remaster|remastered/i.test(t.name);
        if (suspicious) {
          try {
            const enr = await mb.resolveOriginalYear({ artist: t.artists[0]?.name || entry.artist, title: t.name });
            if (enr?.earliestYear && enr.confidence >= (config.musicbrainz?.minConfidence || 0.6)) {
              if (!finalYear || Math.abs(finalYear - enr.earliestYear) >= (config.musicbrainz?.yearDiffThreshold || 2)) {
                finalYear = enr.earliestYear;
              }
            }
          } catch {}
        }
      }

      const record = {
        spotifyUri,
        title: t.name,
        artist: t.artists[0]?.name || entry.artist,
        year: finalYear,
        genre: genreTag || 'chart',
        geography: (market || 'US'),
        difficultyLevel: (() => {
          // Map rank/popularity to 1-5 scale consistent with backend logic
          if (Number.isFinite(entry.rank)) {
            if (entry.rank <= 10) return 2;
            if (entry.rank <= 50) return 3;
            if (entry.rank <= 100) return 4;
          }
          const p = Number(popularity || 0);
          if (p >= 85) return 2;
          if (p >= 70) return 3;
          if (p >= 55) return 4;
          return 5;
        })(),
        popularity,
        albumArt,
        previewUrl,
        tags: [],
        addedBy: 'script:populate',
        verified: true,
        isBillboardChart: true,
        chartInfo: {
          rank: entry.rank ?? null,
          peakPos: entry.peakPos ?? null,
          weeksOnChart: entry.weeksOnChart ?? null,
          chartDate: entry.chartDate ?? null
        }
      };

      if (opt.dryRun) {
        items.push(record);
      } else {
        const beforeLen = curatedDb.list({ limit: 1e9 }).total;
        const rec = curatedDb.add(record);
        const afterLen = curatedDb.list({ limit: 1e9 }).total;
        if (afterLen > beforeLen) saved++;
        else if (rec && rec.updatedAt) updated++;
        items.push(rec);
      }

      if (processed % 100 === 0) {
        console.log(`[Billboard] Processed: ${processed}, Saved: ${saved}, Updated: ${updated}, Skipped: ${skipped}, Collected: ${items.length}/${cap}`);
      }
    } catch (e) {
      skipped++;
      if (processed % 50 === 0) {
        console.warn('[Billboard] Minor error, continuing:', e?.message);
      }
    }
  }

  console.log(`[Billboard] Done. Processed=${processed}, Saved=${saved}, Updated=${updated}, Skipped=${skipped}, Collected=${items.length}`);
  return { collected: items.length, processed, saved, updated, skipped };
}

async function supplementByGenres({ cap, yearMin, yearMax, markets, genres }) {
  console.log('\n[Phase 2] Supplementing by genres via Spotify search...');
  const token = await getClientToken();
  const items = [];
  const seen = new Set();
  let processed = 0, saved = 0, updated = 0, skipped = 0;

  const yr = {
    min: Number.isFinite(yearMin) ? yearMin : 1960,
    max: Number.isFinite(yearMax) ? yearMax : new Date().getFullYear(),
  };
  const searches = createYearBasedSearches(yr, genres);
  const shuffledSearches = [...searches].sort(() => 0.5 - Math.random());

  for (const market of markets) {
    for (const query of shuffledSearches) {
      if (items.length >= cap) break;
      try {
        let q = query;
        if (!q.includes('year:')) {
          q += ` year:${yr.min}-${yr.max}`;
        }
        const resp = await spotifyGet('https://api.spotify.com/v1/search', {
          headers: { Authorization: `Bearer ${token}` },
          params: { q, type: 'track', limit: 20, market }
        }, 'search:genre');

        let tracks = (resp.data.tracks.items || []);
        // Shuffle to avoid alphabetical bias
        tracks = tracks.sort(() => 0.5 - Math.random());

        for (const t of tracks) {
          if (items.length >= cap) break;
          processed++;

          const trackYear = new Date(t.album.release_date).getFullYear();
          if ((Number.isFinite(yr.min) && trackYear < yr.min) || (Number.isFinite(yr.max) && trackYear > yr.max)) {
            skipped++; continue;
          }
          if (config.featureFlags?.enableRemasterFilter) {
            if (isSuspiciousTrack({ title: t.name, album: t.album?.name || '' })) { skipped++; continue; }
          }

          const spotifyUri = t.uri;
          if (seen.has(spotifyUri)) { skipped++; continue; }
          seen.add(spotifyUri);

          const popularity = t.popularity;
          const albumArt = t.album.images?.[0]?.url || null;
          const previewUrl = t.preview_url || null;

          const record = {
            spotifyUri,
            title: t.name,
            artist: t.artists[0]?.name || '',
            year: trackYear,
            genre: (q.includes('genre:') ? q.split('genre:')[1].split(' ')[0] : (genres[0] || 'general')),
            geography: market,
            difficultyLevel: (() => {
              const p = Number(popularity || 0);
              if (p >= config.thresholds?.nonChart?.easy) return 2;
              if (p >= config.thresholds?.nonChart?.normal) return 3;
              return 4;
            })(),
            popularity,
            albumArt,
            previewUrl,
            tags: [],
            addedBy: 'script:populate',
            verified: false,
            isBillboardChart: false,
            chartInfo: null
          };

          if (opt.dryRun) {
            items.push(record);
          } else {
            const beforeLen = curatedDb.list({ limit: 1e9 }).total;
            const rec = curatedDb.add(record);
            const afterLen = curatedDb.list({ limit: 1e9 }).total;
            if (afterLen > beforeLen) saved++;
            else if (rec && rec.updatedAt) updated++;
            items.push(rec);
          }

          if (processed % 200 === 0) {
            console.log(`[Supplement] Processed: ${processed}, Saved: ${saved}, Updated: ${updated}, Skipped: ${skipped}, Collected: ${items.length}/${cap}`);
          }
        }
      } catch (e) {
        if (items.length >= cap) break;
        console.warn('[Supplement] Search error (continuing):', e?.message);
      }
    }
    if (items.length >= cap) break;
  }

  console.log(`[Supplement] Done. Processed=${processed}, Saved=${saved}, Updated=${updated}, Skipped=${skipped}, Collected=${items.length}`);
  return { collected: items.length, processed, saved, updated, skipped };
}

async function main() {
  console.log('=== Populate Initial Database ===');
  console.log('Options:', opt);

  // Backup existing curated DB
  if (!opt.dryRun) backupCuratedDb();

  curatedDb.load();

  const report = {
    billboard: null,
    supplement: null,
    startedAt: new Date().toISOString()
  };

  // Ensure reasonable defaults
  const yearMin = Number.isFinite(opt.yearMin) ? opt.yearMin : 1960;
  const yearMax = Number.isFinite(opt.yearMax) ? opt.yearMax : new Date().getFullYear();
  const market = (opt.markets[0] || 'US');

  if (opt.includeBillboard) {
    report.billboard = await importFromBillboard({
      cap: opt.billboardLimit,
      difficulty: opt.difficulty,
      yearMin,
      yearMax,
      market
    });
  }

  if (opt.includeSearch) {
    report.supplement = await supplementByGenres({
      cap: opt.searchLimit,
      yearMin,
      yearMax,
      markets: opt.markets,
      genres: opt.genres
    });
  }

  const dbSummary = curatedDb.list({ limit: 1e9 });
  report.finishedAt = new Date().toISOString();
  report.finalDbCount = dbSummary.total;

  console.log('\n=== Population Report ===');
  console.log(JSON.stringify(report, null, 2));

  if (opt.dryRun) {
    console.log('\n[DRY RUN] No changes were written to the curated DB.');
  } else {
    console.log('\n[OK] Curated DB saved at backend/cache/curated-songs.json');
  }
}

// Run
if (require.main === module) {
  main().catch((e) => {
    console.error('[FATAL] Population failed:', e?.stack || e?.message || e);
    process.exit(1);
  });
}
