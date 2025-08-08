/**
 * MusicBrainz WS2 integration:
 * - Rate-limited queries for recordings/releases
 * - Resolve earliest original year for a given artist/title (+optional duration/isrc)
 * - In-memory + persistent JSON cache
 */
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { config, ensureCacheDir } = require('./config');

const MB_BASE = 'https://musicbrainz.org/ws/2';

// Simple in-memory cache
const memoryCache = new Map();

// Persistent cache
ensureCacheDir();
const PERSIST_PATH = config.musicbrainz.cachePath;
let persistent = {};
try {
  if (fs.existsSync(PERSIST_PATH)) {
    const raw = fs.readFileSync(PERSIST_PATH, 'utf-8');
    persistent = JSON.parse(raw || '{}');
  }
} catch (e) {
  console.warn('[MusicBrainz] Failed to load persistent cache:', e.message);
  persistent = {};
}

function savePersistent() {
  try {
    fs.writeFileSync(PERSIST_PATH, JSON.stringify(persistent, null, 2), 'utf-8');
  } catch (e) {
    console.warn('[MusicBrainz] Failed to save persistent cache:', e.message);
  }
}

// Rate limiter (token bucket: 1 request per X ms based on RPS)
const rps = Math.max(0.1, Number(config.musicbrainz.rateLimitRPS) || 1);
const intervalMs = Math.ceil(1000 / rps);
let lastCall = 0;
async function rateLimit() {
  const now = Date.now();
  const wait = Math.max(0, lastCall + intervalMs - now);
  if (wait > 0) {
    await new Promise((res) => setTimeout(res, wait));
  }
  lastCall = Date.now();
}

// Normalization helpers
function normalizeTitle(title) {
  return (title || '')
    .toLowerCase()
    .trim()
    .replace(/\([^)]*\)/g, '') // remove parentheticals
    .replace(/\s*[-–—]\s*.*$/, '') // remove dash and suffix
    .replace(/\s*(feat\.?|ft\.?|featuring)\s+.*$/i, '') // remove featuring
    .replace(/\s+/g, ' ')
    .trim();
}
function normalizeArtist(artist) {
  return (artist || '')
    .toLowerCase()
    .trim()
    .replace(/\s*(feat\.?|ft\.?|featuring)\s+.*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isRemasterMarker(str) {
  if (!str) return false;
  const s = str.toLowerCase();
  return (
    /remaster|remastered|reissue|deluxe|anniversary|mono|stereo version|expanded|digitally remastered/.test(
      s
    ) || /\b(19|20)\d{2}\s*remaster/.test(s)
  );
}

function buildCacheKey({ artist, title, durationMs, isrc }) {
  const base = `${normalizeArtist(artist)}|${normalizeTitle(title)}`;
  const durBucket = durationMs ? Math.round(Number(durationMs) / 3000) : '';
  const isrcPart = isrc ? `|${String(isrc).toUpperCase()}` : '';
  return `${base}|${durBucket}${isrcPart}`;
}

function confidenceScore({ artistMatch, titleMatch, durWithin, isrcMatch }) {
  let score = 0;
  if (artistMatch) score += 0.35;
  if (titleMatch) score += 0.35;
  if (durWithin) score += 0.2;
  if (isrcMatch) score += 0.3;
  return Math.min(1, score);
}

async function mbGet(url, params = {}) {
  await rateLimit();
  const headers = {
    'User-Agent': config.musicbrainz.userAgent,
  };
  const fullUrl = `${MB_BASE}${url}`;
  const response = await axios.get(fullUrl, {
    headers,
    params: { ...params, fmt: 'json' },
    timeout: 12000,
  });
  return response.data;
}

/**
 * Search recordings by artist and track title.
 */
async function searchRecordingByArtistTrack(artist, title, { isrc } = {}) {
  const normArtist = normalizeArtist(artist);
  const normTitle = normalizeTitle(title);

  // Construct query
  let query = `artist:"${artist}" AND recording:"${title}"`;
  if (isrc) {
    query += ` AND isrc:${isrc}`;
  }

  try {
    const data = await mbGet('/recording', { query, limit: 25, offset: 0 });
    if (!data || !Array.isArray(data.recordings)) return [];
    // Filter very roughly by normalized fields
    return data.recordings.map((r) => ({
      id: r.id,
      title: r.title,
      length: r.length, // ms
      isrcs: r.isrcs || [],
      releases: r.releases || [],
      releaseGroups: r['release-groups'] || [],
      _artistCredit: r['artist-credit'] || [],
      _score: r.score,
      _norm: {
        artistMatch:
          (r['artist-credit'] || []).some((ac) =>
            normalizeArtist(ac.name || ac.artist?.name) === normArtist
          ) || false,
        titleMatch: normalizeTitle(r.title) === normTitle,
      },
    }));
  } catch (e) {
    console.warn('[MusicBrainz] search error:', e.message);
    return [];
  }
}

function extractEarliestDateFromRecording(rec) {
  // Prefer release-group.first-release-date if present on any linked release group
  let dates = [];

  if (Array.isArray(rec.releases)) {
    for (const rel of rec.releases) {
      if (rel.date) dates.push(rel.date);
      if (rel['release-group'] && rel['release-group']['first-release-date']) {
        dates.push(rel['release-group']['first-release-date']);
      }
    }
  }
  if (Array.isArray(rec['release-groups'])) {
    for (const rg of rec['release-groups']) {
      if (rg['first-release-date']) dates.push(rg['first-release-date']);
    }
  }

  // Normalize to years
  const years = dates
    .map((d) => {
      const m = String(d).match(/^(\d{4})/);
      return m ? Number(m[1]) : null;
    })
    .filter((y) => Number.isFinite(y));

  if (years.length === 0) return null;
  return Math.min(...years);
}

/**
 * Given candidate recordings, compute a scored result with earliest year.
 */
function pickBestRecording(recordings, { durationMs, isrc }) {
  const DUR_TOL = 3000;
  let best = null;

  for (const r of recordings) {
    const durWithin =
      Number.isFinite(durationMs) && Number.isFinite(r.length)
        ? Math.abs(Number(durationMs) - Number(r.length)) <= DUR_TOL
        : false;
    const isrcMatch = isrc ? (r.isrcs || []).includes(isrc) : false;

    const score = confidenceScore({
      artistMatch: !!r._norm.artistMatch,
      titleMatch: !!r._norm.titleMatch,
      durWithin,
      isrcMatch,
    });

    const earliest = extractEarliestDateFromRecording(r);

    const candidate = {
      recordingId: r.id,
      earliestYear: earliest,
      confidence: score,
      durWithin,
      isrcMatch,
      artistMatch: !!r._norm.artistMatch,
      titleMatch: !!r._norm.titleMatch,
    };

    if (!best) best = candidate;
    else {
      // Prefer higher confidence; tie-breaker by earlier year if available
      if (candidate.confidence > best.confidence) best = candidate;
      else if (
        candidate.confidence === best.confidence &&
        Number.isFinite(candidate.earliestYear) &&
        Number.isFinite(best.earliestYear) &&
        candidate.earliestYear < best.earliestYear
      ) {
        best = candidate;
      }
    }
  }

  return best;
}

/**
 * Resolve original year with caching and thresholds.
 */
async function resolveOriginalYear({ artist, title, durationMs, isrc }) {
  const key = buildCacheKey({ artist, title, durationMs, isrc });

  // Memory cache
  if (memoryCache.has(key)) {
    return memoryCache.get(key);
  }
  // Persistent cache
  if (persistent[key]) {
    memoryCache.set(key, persistent[key]);
    return persistent[key];
  }

  // Query MB
  const recs = await searchRecordingByArtistTrack(artist, title, { isrc });
  if (!recs || recs.length === 0) {
    const miss = { earliestYear: null, confidence: 0, source: 'musicbrainz', recordingId: null, lookedUpAt: new Date().toISOString() };
    memoryCache.set(key, miss);
    persistent[key] = miss;
    savePersistent();
    return miss;
  }

  const best = pickBestRecording(recs, { durationMs, isrc });
  const result = {
    earliestYear: best?.earliestYear ?? null,
    confidence: best?.confidence ?? 0,
    recordingId: best?.recordingId ?? null,
    source: 'musicbrainz',
    lookedUpAt: new Date().toISOString(),
  };

  memoryCache.set(key, result);
  persistent[key] = result;
  savePersistent();
  return result;
}

module.exports = {
  resolveOriginalYear,
  normalizeArtist,
  normalizeTitle,
  isRemasterMarker,
};
