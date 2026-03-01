const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
// Only load .env in development
if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}
const axios = require('axios');
const querystring = require('querystring');
const curatedDb = require('./curatedDb');
const analytics = require('./analytics');

// Initialize curated database at startup to trigger migration if needed
console.log('[Startup] ===== CURATED DATABASE INITIALIZATION START =====');
console.log('[Startup] NODE_ENV:', process.env.NODE_ENV);
console.log('[Startup] Current working directory:', process.cwd());
console.log('[Startup] __dirname:', __dirname);

try {
  console.log('[Startup] About to call curatedDb.load()...');
  curatedDb.load(); // This will trigger getCacheDir() and any migration logic
  console.log('[Startup] curatedDb.load() completed successfully');
} catch (error) {
  console.error('[Startup] ERROR during curatedDb.load():', error.message);
  console.error('[Startup] Stack trace:', error.stack);
}

console.log('[Startup] ===== CURATED DATABASE INITIALIZATION COMPLETE =====');
const { detectGeographyForArtist, detectGenresForArtist } = require('./geographyDetection');

// --- Spotify API Rate Limiting Helpers (to avoid 429s during bulk import) ---
const SPOTIFY_MIN_GAP_MS = Number(process.env.SPOTIFY_MIN_GAP_MS) || 650; // ~100 req/min default
let __lastSpotifyCallAt = 0;
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

/**
 * Rate-limited wrapper for axios.get against Spotify APIs.
 * - Enforces a minimum gap between calls
 * - Retries on 429 and 5xx with exponential backoff or Retry-After
 */
async function spotifyGet(url, opts = {}, label = '') {
  // Enforce minimum gap between any Spotify calls
  const now = Date.now();
  const gap = now - __lastSpotifyCallAt;
  if (gap < SPOTIFY_MIN_GAP_MS) {
    await sleep(SPOTIFY_MIN_GAP_MS - gap);
  }

  let attempt = 0;
  while (attempt < 6) { // up to 6 attempts with backoff
    try {
      const res = await axios.get(url, opts);
      __lastSpotifyCallAt = Date.now();
      return res;
    } catch (e) {
      const status = e?.response?.status;
      if (status === 429 || (status >= 500 && status < 600)) {
        // Respect Retry-After if provided; otherwise exponential backoff capped at 30s
        const retryAfterHeader = e?.response?.headers?.['retry-after'];
        let delay = retryAfterHeader ? Number(retryAfterHeader) * 1000 : Math.min(30000, (2 ** attempt) * SPOTIFY_MIN_GAP_MS);
        if (!Number.isFinite(delay) || delay <= 0) {
          delay = Math.min(30000, (2 ** attempt) * SPOTIFY_MIN_GAP_MS);
        }
        attempt++;
        try {
          console.warn('[SpotifyLimiter]', { status, attempt, delay, label: label || url });
        } catch (_) {}
        await sleep(delay);
        continue;
      }
      // Non-retriable errors bubble up
      throw e;
    }
  }
  throw new Error('Spotify API request failed after retries: ' + (label || url));
}

// Feature flags, thresholds, and providers
const { config } = require('./config');
const { resolveOriginalYear, isRemasterMarker, normalizeTitle } = require('./musicbrainz');
const { getChartEntries } = require('./chartProvider');

const app = express();
const discovery = require('./discovery');

// --- Persistent state (lobbies/games) across backend restarts ---
const fs = require('fs');
const path = require('path');

// Use persistent disk in production if available, otherwise fall back to deployed cache
function getStateDir() {
  if (process.env.NODE_ENV === 'production') {
    const persistentPath = '/var/data/cache';
    const deployedPath = path.join(__dirname, 'cache');
    
    // Check if persistent disk is available
    if (fs.existsSync(persistentPath)) {
      console.log('[State] Using persistent disk state directory:', persistentPath);
      return persistentPath;
    }
    
    // Fall back to deployed cache directory
    console.log('[State] Using deployed state directory:', deployedPath);
    return deployedPath;
  }
  
  // Development: use local cache
  const localPath = path.join(__dirname, 'cache');
  console.log('[State] Using local state directory:', localPath);
  return localPath;
}

const STATE_DIR = getStateDir();
const STATE_FILE = path.join(STATE_DIR, 'state.json');

function sanitizeForSave(obj) {
  // JSON-safe deep clone with Set support
  const replacer = (key, value) => {
    if (value instanceof Set) {
      return { __type: 'Set', values: Array.from(value) };
    }
    return value;
  };
  try {
    return JSON.parse(JSON.stringify(obj, replacer));
  } catch (e) {
    console.warn('[State] sanitizeForSave failed:', e && e.message);
    return null;
  }
}

function reviveAfterLoad(data) {
  if (!data || typeof data !== 'object') return data;

  // Helper to revive Set saved as { __type: 'Set', values: [...] } or plain array
  const reviveMaybeSet = (val) => {
    if (!val) return new Set();
    if (val instanceof Set) return val;
    if (Array.isArray(val)) return new Set(val);
    if (typeof val === 'object' && val.__type === 'Set' && Array.isArray(val.values)) {
      return new Set(val.values);
    }
    return val;
  };

  try {
    const gamesObj = data.games || {};
    Object.keys(gamesObj).forEach(code => {
      const game = gamesObj[code];
      if (!game) return;
      game.playedCards = reviveMaybeSet(game.playedCards);
      game.challengeResponses = reviveMaybeSet(game.challengeResponses);
    });
  } catch (e) {
    console.warn('[State] reviveAfterLoad failed:', e && e.message);
  }
  return data;
}

function persistState() {
  try {
    if (!fs.existsSync(STATE_DIR)) fs.mkdirSync(STATE_DIR, { recursive: true });
    const payload = {
      lobbies,
      games,
      playerSessions,
      savedAt: new Date().toISOString()
    };
    const serializable = sanitizeForSave(payload);
    if (!serializable) return;
    fs.writeFileSync(STATE_FILE, JSON.stringify(serializable));
    console.log('[State] Saved to', STATE_FILE);
  } catch (e) {
    console.warn('[State] Save failed:', e && e.message);
  }
}

function loadStateFromDisk() {
  try {
    if (!fs.existsSync(STATE_FILE)) {
      console.log('[State] No prior state file, starting fresh');
      return false;
    }
    const raw = fs.readFileSync(STATE_FILE, 'utf8');
    const revived = reviveAfterLoad(JSON.parse(raw));
    if (!revived || !revived.lobbies || !revived.games) {
      console.warn('[State] Invalid state file format, ignoring');
      return false;
    }
    // Populate existing containers
    Object.keys(revived.lobbies).forEach(code => { lobbies[code] = revived.lobbies[code]; });
    Object.keys(revived.games).forEach(code => { games[code] = revived.games[code]; });
    
    // Restore playerSessions if they exist
    if (revived.playerSessions && typeof revived.playerSessions === 'object') {
      Object.keys(revived.playerSessions).forEach(sessionId => { 
        playerSessions[sessionId] = revived.playerSessions[sessionId]; 
      });
      console.log('[State] Loaded playerSessions from disk. Sessions:', Object.keys(playerSessions).length);
    }
    
    console.log('[State] Loaded lobbies/games from disk. Rooms:', {
      lobbies: Object.keys(lobbies),
      games: Object.keys(games),
      sessions: Object.keys(playerSessions).length
    });
    return true;
  } catch (e) {
    console.warn('[State] Load failed:', e && e.message);
    return false;
  }
}

// Debounced saver, called after any mutating event
let __saveScheduled = false;
function schedulePersist() {
  if (__saveScheduled) return;
  __saveScheduled = true;
  setTimeout(() => {
    __saveScheduled = false;
    persistState();
  }, 250);
}

// Safety: periodic snapshot in case of long idle periods
setInterval(() => {
  try { persistState(); } catch (e) {}
}, 15000);

// Safety: persist state on common termination signals
['SIGINT', 'SIGTERM', 'SIGHUP'].forEach(sig => {
  try {
    process.on(sig, () => {
      try {
        console.log('[State] Signal received:', sig, '- saving state');
        persistState();
      } catch (e) {
        console.warn('[State] Failed to save on signal:', e && e.message);
      } finally {
        process.exit(0);
      }
    });
  } catch (e) {
    // ignore if not supported
  }
});

// Safety: persist on uncaught exceptions
try {
  process.on('uncaughtException', (err) => {
    console.error('[State] Uncaught exception - saving state:', err && err.stack || err);
    try { persistState(); } catch (e) {}
    process.exit(1);
  });
} catch (e) {
  // ignore
}

// Store client credentials token
let clientToken = null;
let clientTokenExpiry = null;

// Get client credentials token for app-only requests
async function getClientToken() {
  if (clientToken && clientTokenExpiry && Date.now() < clientTokenExpiry) {
    return clientToken;
  }

  try {
    const response = await axios.post('https://accounts.spotify.com/api/token',
      querystring.stringify({
        grant_type: 'client_credentials',
        client_id: process.env.SPOTIFY_CLIENT_ID,
        client_secret: process.env.SPOTIFY_CLIENT_SECRET,
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    clientToken = response.data.access_token;
    clientTokenExpiry = Date.now() + (response.data.expires_in * 1000) - 60000; // 1 minute buffer
    console.log('[Spotify] Client credentials token obtained');
    return clientToken;
  } catch (error) {
    console.error('[Spotify] Error getting client token:', error);
    throw error;
  }
}

// Spotify OAuth login endpoint
app.get('/login', (req, res) => {
  console.log('[Spotify] Login endpoint called');
  console.log('[Spotify] Environment check:', {
    NODE_ENV: process.env.NODE_ENV,
    SPOTIFY_CLIENT_ID: process.env.SPOTIFY_CLIENT_ID ? 'SET' : 'MISSING',
    SPOTIFY_CLIENT_SECRET: process.env.SPOTIFY_CLIENT_SECRET ? 'SET' : 'MISSING',
    SPOTIFY_REDIRECT_URI: process.env.SPOTIFY_REDIRECT_URI,
    FRONTEND_URI: process.env.FRONTEND_URI
  });
  
  if (!process.env.SPOTIFY_CLIENT_ID || !process.env.SPOTIFY_CLIENT_SECRET) {
    console.error('[Spotify] Missing required environment variables');
    return res.status(500).send('Spotify configuration error - missing credentials');
  }
  
  const scope = 'user-read-private user-read-email streaming user-read-playback-state user-modify-playback-state';
  const params = querystring.stringify({
    client_id: process.env.SPOTIFY_CLIENT_ID,
    response_type: 'code',
    redirect_uri: process.env.SPOTIFY_REDIRECT_URI,
    scope,
  });
  
  const spotifyUrl = `https://accounts.spotify.com/authorize?${params}`;
  console.log('[Spotify] Redirecting to:', spotifyUrl);
  res.redirect(spotifyUrl);
});

  // Spotify OAuth callback endpoint
  app.get('/callback', async (req, res) => {
    const code = req.query.code || null;
    const redirectUrl = req.query.redirect || process.env.FRONTEND_URI;
    try {
      const tokenResponse = await axios.post('https://accounts.spotify.com/api/token',
        querystring.stringify({
          grant_type: 'authorization_code',
          code,
          redirect_uri: process.env.SPOTIFY_REDIRECT_URI,
          client_id: process.env.SPOTIFY_CLIENT_ID,
          client_secret: process.env.SPOTIFY_CLIENT_SECRET,
        }),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
      );
      const access_token = tokenResponse.data.access_token;
      // Redirect back to frontend with token, using provided redirect URL
      res.redirect(`${redirectUrl}?access_token=${access_token}`);
    } catch (error) {
      console.error('Error fetching Spotify token', error);
      res.status(500).send('Authentication failed');
    }
  });

// CORS configuration for production
const corsOptions = {
  origin: process.env.NODE_ENV === 'production' 
    ? [
        process.env.FRONTEND_URI, 
        'https://beatably-frontend.netlify.app',
        'https://beatably.app',
        'https://www.beatably.app'
      ].filter(Boolean) // Remove any undefined values
    : ['http://127.0.0.1:5173', 'http://localhost:5173'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-admin-secret']
};

app.use(cors(corsOptions));
app.use(express.json()); // Add JSON body parser

// --- Admin password middleware for curated DB ---
function requireAdmin(req, res, next) {
  try {
    const secret =
      req.headers['x-admin-secret'] || req.query.admin_secret || (req.body && req.body.admin_secret);
    if (!process.env.ADMIN_PASSWORD) {
      return res.status(500).json({ ok: false, error: 'ADMIN_PASSWORD not set on server' });
    }
    if (secret !== process.env.ADMIN_PASSWORD) {
      return res.status(401).json({ ok: false, error: 'Unauthorized' });
    }
    next();
  } catch (e) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }
}

// --- Curated DB Admin Endpoints ---
app.get('/api/admin/curated-songs', requireAdmin, (req, res) => {
  try {
    // Force reload database to ensure we have latest migrated data
    console.log('[Admin] Force reloading curated database for admin request');
    curatedDb.load(true); // Pass true to force reload
    
    const { q, genre, geography, yearMin, yearMax, difficulty, limit, offset } = req.query || {};
    const result = curatedDb.list({
      q: q || '',
      genre,
      geography,
      yearMin: Number.isFinite(Number(yearMin)) ? Number(yearMin) : undefined,
      yearMax: Number.isFinite(Number(yearMax)) ? Number(yearMax) : undefined,
      difficulty: Number.isFinite(Number(difficulty)) ? Number(difficulty) : undefined,
      limit: Number.isFinite(Number(limit)) ? Number(limit) : 100,
      offset: Number.isFinite(Number(offset)) ? Number(offset) : 0
    });
    
    // Add diagnostic information
    const diagnostics = {
      databasePath: process.env.NODE_ENV === 'production' ? '/var/data/cache/curated-songs.json' : 'local',
      totalSongs: result.total || 0,
      environment: process.env.NODE_ENV || 'development',
      timestamp: new Date().toISOString()
    };
    
    console.log('[Admin] Curated songs list request:', {
      totalFound: result.total,
      itemsReturned: result.items?.length || 0,
      filters: { q, genre, geography, yearMin, yearMax, difficulty },
      pagination: { limit, offset }
    });
    
    res.json({ ok: true, ...result, diagnostics });
  } catch (e) {
    console.error('[Admin] Curated songs list failed:', e?.message, e?.stack);
    res.status(500).json({ ok: false, error: e?.message || 'List failed' });
  }
});

app.post('/api/admin/curated-songs', requireAdmin, (req, res) => {
  try {
    const song = curatedDb.add(req.body || {});
    res.json({ ok: true, song });
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || 'Add failed' });
  }
});

app.put('/api/admin/curated-songs/:id', requireAdmin, (req, res) => {
  try {
    const song = curatedDb.update(req.params.id, req.body || {});
    if (!song) return res.status(404).json({ ok: false, error: 'Not found' });
    res.json({ ok: true, song });
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || 'Update failed' });
  }
});

app.delete('/api/admin/curated-songs/:id', requireAdmin, (req, res) => {
  try {
    const removed = curatedDb.remove(req.params.id);
    res.json({ ok: true, removed });
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || 'Delete failed' });
  }
});

// Enrich single song (admin)
app.post('/api/admin/curated-songs/enrich/:id', requireAdmin, async (req, res) => {
  try {
    // Force reload database to ensure we have latest data
    curatedDb.load(true);
    
    const songId = req.params.id;
    const song = curatedDb.get(songId);
    
    if (!song) {
      return res.status(404).json({ ok: false, error: 'Song not found' });
    }

    console.log(`[Admin] Enriching song: ${song.artist} - "${song.title}" (current geography: ${song.geography || 'none'})`);

    // Import enrichment module
    const { enrichSong } = require('./songEnrichment');

    // Enrich the song
    const enriched = await enrichSong(song, {
      fetchPreview: true,
      fetchMusicBrainz: true,
      rateLimit: true
    });

    // Update in database
    const updated = curatedDb.update(songId, enriched);

    console.log(`[Admin] Song enriched successfully (new geography: ${updated.geography || 'none'})`);

    res.json({ 
      ok: true, 
      song: updated,
      changes: {
        genre: song.genre !== updated.genre,
        geography: song.geography !== updated.geography,
        previewUrl: song.previewUrl !== updated.previewUrl,
        isInternational: song.isInternational !== updated.isInternational
      }
    });

  } catch (e) {
    console.error('[Admin] Enrichment failed:', e?.message, e?.stack);
    res.status(500).json({ ok: false, error: e?.message || 'Enrichment failed' });
  }
});

// --- Curated DB Analytics (admin) ---
app.get('/api/admin/analytics', requireAdmin, (req, res) => {
  try {
    // Force reload database to ensure we have latest migrated data
    console.log('[Admin] Force reloading curated database for analytics request');
    curatedDb.load(true); // Pass true to force reload
    
    // Get all curated songs
    const first = curatedDb.list({ limit: 1, offset: 0 });
    const total = Number(first.total || 0);
    const all = total > 0 ? curatedDb.list({ limit: Math.max(1, total), offset: 0 }).items : [];
    
    console.log('[Admin] Analytics request:', {
      totalSongs: total,
      itemsAnalyzed: all.length
    });

    const toDecade = (y) => {
      const n = Number(y);
      if (!Number.isFinite(n)) return 'unknown';
      return `${Math.floor(n / 10) * 10}s`;
    };
    const lc = (s, def = 'unknown') => {
      if (!s || typeof s !== 'string') return def;
      const val = s.trim().toLowerCase();
      return val || def;
    };

    // Aggregations
    const counts = {
      byGenre: {},
      byDecade: {},
      byYear: {},
      byDifficulty: {},
      byGeography: {},
      billboard: { billboard: 0, nonBillboard: 0 },
      tags: {},
    };
    let withAlbumArt = 0;
    let withPreview = 0;

    // Crosstabs
    const genreByDecade = {}; // { decade: { genre: count } }

    // Allowed genres for game settings (used for gap analysis)
    const allowedGenres = ['pop', 'rock', 'hip-hop', 'electronic', 'indie', 'chart'];

    for (const s of all) {
      const genreList = (Array.isArray(s.genres) && s.genres.length ? s.genres : [s.genre]).map((g) => lc(g));
      const decade = toDecade(s.year);
      const year = Number(s.year);
      const diff = Number.isFinite(Number(s.difficultyLevel)) ? String(Number(s.difficultyLevel)) : 'unknown';
      const geography = lc(s.geography, 'unknown');

      for (const g of genreList) {
        counts.byGenre[g] = (counts.byGenre[g] || 0) + 1;
      }
      counts.byDecade[decade] = (counts.byDecade[decade] || 0) + 1;
      if (Number.isFinite(year)) counts.byYear[String(year)] = (counts.byYear[String(year)] || 0) + 1;
      counts.byDifficulty[diff] = (counts.byDifficulty[diff] || 0) + 1;
      counts.byGeography[geography] = (counts.byGeography[geography] || 0) + 1;

      if (s && s.isBillboardChart) counts.billboard.billboard += 1;
      else counts.billboard.nonBillboard += 1;

      if (s && s.albumArt) withAlbumArt += 1;
      if (s && s.previewUrl) withPreview += 1;

      // Tags
      if (Array.isArray(s.tags)) {
        for (const t of s.tags) {
          const tag = lc(String(t));
          counts.tags[tag] = (counts.tags[tag] || 0) + 1;
        }
      }

      // Crosstab
      if (!genreByDecade[decade]) genreByDecade[decade] = {};
      for (const g of genreList) {
        genreByDecade[decade][g] = (genreByDecade[decade][g] || 0) + 1;
      }
    }

    // Sort helpers
    const sortEntriesDesc = (obj) => Object.entries(obj).sort((a, b) => b[1] - a[1]);
    const sortDecadesAsc = (obj) => {
      return Object.entries(obj).sort((a, b) => {
        if (a[0] === 'unknown') return 1;
        if (b[0] === 'unknown') return -1;
        return parseInt(a[0]) - parseInt(b[0]);
      });
    };

    // Build arrays for charts
    const decadesSorted = sortDecadesAsc(counts.byDecade);
    const topGenres = sortEntriesDesc(counts.byGenre).slice(0, 12);
    const difficultySorted = Object.keys(counts.byDifficulty)
      .sort((a, b) => (a === 'unknown') ? 1 : (b === 'unknown') ? -1 : Number(a) - Number(b))
      .map(k => [k, counts.byDifficulty[k]]);
    const topGeographies = sortEntriesDesc(counts.byGeography).slice(0, 12);

    // Gap analysis: default threshold (can override via query ?gapThreshold=30)
    const gapThreshold = Math.max(1, Number(req.query.gapThreshold) || 30);
    const gapSegments = [];
    // Only consider allowed genres and "known" decades (not 'unknown')
    const allDecades = decadesSorted.map(([d]) => d).filter(d => d !== 'unknown');
    for (const d of allDecades) {
      for (const g of allowedGenres) {
        const n = (genreByDecade[d] && genreByDecade[d][g]) ? genreByDecade[d][g] : 0;
        if (n < gapThreshold) {
          gapSegments.push({ decade: d, genre: g, count: n, deficit: gapThreshold - n });
        }
      }
    }
    // Sort gap segments by lowest counts first
    gapSegments.sort((a, b) => a.count - b.count || a.decade.localeCompare(b.decade) || a.genre.localeCompare(b.genre));

    const result = {
      ok: true,
      totals: {
        curatedCount: total,
        withAlbumArt,
        withPreview,
        albumArtPct: total ? Math.round((withAlbumArt / total) * 100) : 0,
        previewPct: total ? Math.round((withPreview / total) * 100) : 0,
      },
      counts: {
        byDecade: decadesSorted,     // [ [decade, count], ... ]
        byGenre: topGenres,          // [ [genre, count], ... ]
        byDifficulty: difficultySorted, // [ [level, count], ... ]
        byGeography: topGeographies, // [ [geography, count], ... ]
        billboard: counts.billboard,
        byYear: sortEntriesDesc(counts.byYear).sort((a, b) => Number(a[0]) - Number(b[0])), // chronological
        tags: sortEntriesDesc(counts.tags).slice(0, 20),
      },
      crosstabs: {
        genreByDecade, // { "1980s": { "pop": 10, ... }, ... }
      },
      gapAnalysis: {
        threshold: gapThreshold,
        allowedGenres,
        segmentsNeedingAttention: gapSegments.slice(0, 50) // cap for UI
      },
      timestamp: new Date().toISOString(),
    };

    res.json(result);
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || 'Analytics failed' });
  }
});

/**
 * Admin Bulk Import - Preview
 * Body: {
 *   mode: 'billboard' | 'search',
 *   filters: {
 *     yearMin?: number,
 *     yearMax?: number,
 *     genres?: string[] | string,   // comma-separated string allowed
 *     markets?: string[] | string,  // comma-separated string allowed
 *     market?: string               // single code allowed
 *   },
 *   limit?: number
 * }
 * Returns curated-like items without saving to DB.
 */
app.post('/api/admin/import/preview', requireAdmin, async (req, res) => {
  try {
    // Force reload database to ensure we have latest migrated data
    console.log('[Admin] Force reloading curated database for import preview request');
    curatedDb.load();
    
    const body = req.body || {};
    const mode = (body.mode || 'billboard').toLowerCase();
    const filters = body.filters || {};
    const cap = Math.max(1, Math.min(500, Number(body.limit) || 100));

    const yearMin = Number.isFinite(Number(filters.yearMin)) ? Number(filters.yearMin)
      : (Number.isFinite(Number(filters.yearRange?.min)) ? Number(filters.yearRange.min) : undefined);
    const yearMax = Number.isFinite(Number(filters.yearMax)) ? Number(filters.yearMax)
      : (Number.isFinite(Number(filters.yearRange?.max)) ? Number(filters.yearRange.max) : undefined);

    let genres = [];
    if (Array.isArray(filters.genres)) {
      genres = filters.genres;
    } else if (typeof filters.genres === 'string') {
      genres = filters.genres.split(',').map(s => s.trim()).filter(Boolean);
    } else if (typeof filters.genre === 'string') {
      genres = filters.genre.split(',').map(s => s.trim()).filter(Boolean);
    }

    let markets = [];
    if (Array.isArray(filters.markets)) {
      markets = filters.markets;
    } else if (typeof filters.markets === 'string') {
      markets = filters.markets.split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
    } else if (typeof filters.market === 'string') {
      markets = [filters.market.trim().toUpperCase()];
    }
    if (!markets.length) markets = ['US'];

    const toDifficultyFromRankPop = (rank, pop) => {
      // Map to curated difficultyLevel (1-5); we keep 2-4 range primary
      if (Number.isFinite(rank)) {
        if (rank <= 10) return 2;
        if (rank <= 50) return 3;
        if (rank <= 100) return 4;
      }
      const p = Number(pop || 0);
      if (p >= 85) return 2;
      if (p >= 70) return 3;
      if (p >= 55) return 4;
      return 5;
    };

    const items = [];
    const seen = new Set(); // by spotifyUri

    // Genre mapping: map Spotify's detailed genres to game categories used in game settings
    const artistGenresCache = new Map();
    function mapSpotifyGenres(genresArr) {
      const g = (genresArr || []).map(s => String(s || '').toLowerCase());
      const has = (...keys) => keys.some(k => g.some(s => s.includes(k)));
      if (has('hip hop', 'rap', 'trap', 'grime', 'drill')) return 'hip-hop';
      if (has('rock', 'metal', 'punk', 'grunge', 'emo')) return 'rock';
      if (has('electronic', 'edm', 'house', 'techno', 'trance', 'dubstep', 'electro', 'drum and bass', 'dnb')) return 'electronic';
      if (has('indie', 'alt', 'alternative', 'shoegaze', 'lo-fi', 'lofi')) return 'indie';
      if (has('pop', 'k-pop', 'dance pop', 'synthpop', 'electropop', 'teen pop')) return 'pop';
      // Map RnB/Soul to closest available game bucket
      if (has('r&b', 'rnb', 'soul', 'funk')) return 'pop';
      return null;
    }

    if (mode === 'billboard') {
      // Fetch chart entries and resolve to Spotify
      let chartEntries = await getChartEntries({
        mode: 'recent',
        difficulty: 'normal',
        yearMin: Number.isFinite(yearMin) ? yearMin : undefined,
        yearMax: Number.isFinite(yearMax) ? yearMax : undefined
      });
      if (!chartEntries || !chartEntries.length) {
        chartEntries = await getChartEntries({ mode: 'all', difficulty: 'normal' });
      }

      const token = await getClientToken();
      for (const entry of chartEntries) {
        if (items.length >= cap) break;
        try {
          const q = `artist:"${entry.artist}" track:"${entry.title}"${entry.year ? ` year:${entry.year}` : ''}`;
          const resp = await spotifyGet('https://api.spotify.com/v1/search', {
            headers: { Authorization: `Bearer ${token}` },
            params: { q, type: 'track', limit: 5, market: markets[0] || 'US' }
          }, 'search:billboard');
          const t = (resp.data.tracks.items || [])[0];
          if (!t) continue;

          const spotifyUri = t.uri;
          if (seen.has(spotifyUri)) continue;
          seen.add(spotifyUri);

          const year = new Date(t.album.release_date).getFullYear();
          const popularity = t.popularity;
          const difficultyLevel = toDifficultyFromRankPop(entry.rank, popularity);

          // Enhanced genre detection using hybrid MusicBrainz + Spotify system
          let genreTag = null;
          let genresArr = [];
          try {
            const genreResult = await detectGenresForArtist(t.artists[0]?.name || entry.artist);
            if (genreResult && genreResult.genres.length > 0) {
              genresArr = genreResult.genres;
              genreTag = genreResult.genres[0]; // Primary genre
              console.log(`[AdminImport] Enhanced genre detection for ${entry.artist}: ${genresArr.join(', ')} (sources: ${genreResult.sources.map(s => s.source).join(', ')})`);
            }
          } catch (e) {
            console.warn(`[AdminImport] Enhanced genre detection failed for ${entry.artist}:`, e.message);
          }
          
          // Fallback to Spotify artist genres if MusicBrainz didn't provide results
          if (!genreTag) {
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
                if (genreTag) {
                  genresArr = [genreTag];
                }
              }
            } catch (e) {
              // ignore genre fetch failure; we'll fallback below
            }
          }
          
          // Final fallback
          if (!genreTag) {
            genreTag = genres[0] || 'chart';
            genresArr = [genreTag];
          }

          // Detect origin country (artist-based)
          let origin = markets[0] || 'US';
          try {
            const geoRes = await detectGeographyForArtist(t.artists[0]?.name || entry.artist);
            if (geoRes && geoRes.geography) origin = geoRes.geography;
          } catch (e) {}

          // Compute markets (success regions): selected market, artist origin, and INTL for very high popularity
          const marketsArr = Array.from(new Set([
            (markets[0] || 'US').toUpperCase(),
            origin ? String(origin).toUpperCase() : null,
            (Number(popularity) >= 85 ? 'INTL' : null)
          ].filter(Boolean)));

          // Use the genresArr from enhanced detection, or fallback to single genre
          if (!genresArr.length) {
            genresArr = Array.from(new Set([genreTag].filter(Boolean)));
          }

          items.push({
            spotifyUri,
            title: t.name,
            artist: t.artists[0]?.name || entry.artist,
            year,
            genre: genreTag,
            genres: genresArr,
            geography: origin,
            markets: marketsArr,
            searchMarket: markets[0] || 'US',
            difficultyLevel,
            popularity,
            albumArt: t.album.images?.[0]?.url || null,
            previewUrl: t.preview_url || null,
            tags: [],
            verified: true,
            addedBy: 'import',
            isBillboardChart: true,
            chartInfo: {
              rank: entry.rank ?? null,
              peakPos: entry.peakPos ?? null,
              weeksOnChart: entry.weeksOnChart ?? null,
              chartDate: entry.chartDate ?? null
            }
          });
        } catch (e) {
          // ignore individual failures
        }
      }
    } else {
      // Generic Spotify search mode
      const token = await getClientToken();
      const yrRange = {
        min: Number.isFinite(yearMin) ? yearMin : 1960,
        max: Number.isFinite(yearMax) ? yearMax : 2025
      };
      const gen = genres.length ? genres : ['pop', 'rock', 'hip-hop', 'electronic', 'indie'];
      const queries = createYearBasedSearches(yrRange, gen, markets).sort(() => 0.5 - Math.random());

      for (const market of markets) {
        for (const q of queries) {
          if (items.length >= cap) break;
          try {
            let query = q;
            if (!q.includes('year:') && Number.isFinite(yrRange.min) && Number.isFinite(yrRange.max)) {
              query += ` year:${yrRange.min}-${yrRange.max}`;
            }
            const resp = await spotifyGet('https://api.spotify.com/v1/search', {
              headers: { Authorization: `Bearer ${token}` },
              params: { q: query, type: 'track', limit: 20, market }
            }, 'search:generic');
            for (const track of resp.data.tracks.items || []) {
              if (items.length >= cap) break;

              const trackYear = new Date(track.album.release_date).getFullYear();
              if ((Number.isFinite(yrRange.min) && trackYear < yrRange.min) ||
                  (Number.isFinite(yrRange.max) && trackYear > yrRange.max)) continue;

              if (config.featureFlags.enableRemasterFilter) {
                if (isSuspiciousTrack({ title: track.name, album: track.album?.name || '' })) continue;
              }

              const spotifyUri = track.uri;
              if (seen.has(spotifyUri)) continue;
              seen.add(spotifyUri);

              const popularity = track.popularity;
              const difficultyLevel = toDifficultyFromRankPop(null, popularity);
              const genreTag = q.includes('genre:') ? q.split('genre:')[1].split(' ')[0] : (genres[0] || 'general');

              items.push({
                spotifyUri,
                title: track.name,
                artist: track.artists[0]?.name || '',
                year: trackYear,
                genre: genreTag,
                genres: Array.from(new Set([genreTag].filter(Boolean))),
                geography: (await (async () => { try { const r = await detectGeographyForArtist(track.artists[0]?.name || ''); return r?.geography || market; } catch (_) { return market; }})()),
                markets: Array.from(new Set([String(market).toUpperCase(), (Number(popularity) >= 85 ? 'INTL' : null)].filter(Boolean))),
                searchMarket: market,
                difficultyLevel,
                popularity,
                albumArt: track.album.images?.[0]?.url || null,
                previewUrl: track.preview_url || null,
                tags: [],
                verified: false,
                addedBy: 'import',
                isBillboardChart: false,
                chartInfo: null
              });
            }
          } catch (e) {
            // ignore this query
          }
        }
      }

      // diversify by artist and cap
      const diversified = diversifyByArtist(items, 1);
      items.length = 0;
      items.push(...diversified.slice(0, cap));
    }

    // Deduplication: filter out songs already in database
    const existing = curatedDb.list({ limit: 10000 }).items;
    const existingUris = new Set(existing.map(s => s.spotifyUri).filter(Boolean));
    
    const newItems = items.filter(item => !existingUris.has(item.spotifyUri));
    const duplicateCount = items.length - newItems.length;
    
    console.log(`[AdminImport] Filtered ${duplicateCount} duplicates, ${newItems.length} new songs`);

    res.json({ 
      ok: true, 
      mode, 
      total: newItems.length, 
      items: newItems,
      duplicatesFiltered: duplicateCount 
    });
  } catch (e) {
    console.error('[AdminImport][preview] failed:', e && e.message);
    res.status(500).json({ ok: false, error: e?.message || 'Preview failed' });
  }
});

/**
 * Admin Bulk Import - Commit
 * Body: { items: CuratedItem[] }
 * Saves items into curated DB (dedup by spotifyUri).
 */
app.post('/api/admin/import/commit', requireAdmin, async (req, res) => {
  try {
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    let added = 0;
    let updated = 0;
    const seen = new Set();
    const enrichQueue = [];

    // Step 1: Add all songs to database immediately
    for (const raw of items) {
      const spotifyUri = raw.spotifyUri || raw.uri || null;
      if (!spotifyUri || seen.has(spotifyUri)) continue;
      seen.add(spotifyUri);

      const rec = curatedDb.add({
        spotifyUri,
        title: raw.title,
        artist: raw.artist,
        year: Number.isFinite(Number(raw.year)) ? Number(raw.year) : null,
        genre: raw.genre || '',
        // Multi-field arrays with backward compatibility handled inside curatedDb.add
        genres: Array.isArray(raw.genres) ? raw.genres : (raw.genre ? [raw.genre] : []),
        markets: Array.isArray(raw.markets) ? raw.markets : (raw.searchMarket ? [String(raw.searchMarket).toUpperCase()] : []),
        geography: raw.geography || raw.origin || '',
        difficultyLevel: Number.isFinite(Number(raw.difficultyLevel)) ? Number(raw.difficultyLevel) : 2,
        popularity: Number.isFinite(Number(raw.popularity)) ? Number(raw.popularity) : null,
        albumArt: raw.albumArt || null,
        previewUrl: raw.previewUrl || null,
        tags: Array.isArray(raw.tags) ? raw.tags : [],
        addedBy: 'admin-import',
        verified: !!raw.verified,
        isBillboardChart: !!raw.isBillboardChart,
        chartInfo: raw.chartInfo || null
      });

      // Heuristic: curatedDb.add sets updatedAt on updates
      if (rec && rec.updatedAt) {
        updated++;
      } else {
        added++;
      }
      
      // Queue for background enrichment if rec exists
      if (rec && rec.id) {
        enrichQueue.push(rec.id);
      }
    }

    // Step 2: Return immediately so user doesn't wait
    res.json({ 
      ok: true, 
      attempted: items.length, 
      saved: added + updated, 
      added, 
      updated,
      enriching: enrichQueue.length 
    });

    // Step 3: Enrich in background (don't await - runs async)
    if (enrichQueue.length > 0) {
      console.log(`[Import] Starting background enrichment for ${enrichQueue.length} songs`);
      
      // Import enrichment module
      const { enrichSong } = require('./songEnrichment');
      
      // Enrich each song asynchronously (with rate limiting built into enrichSong)
      (async () => {
        for (const songId of enrichQueue) {
          try {
            const song = curatedDb.get(songId);
            if (song) {
              const enriched = await enrichSong(song, {
                fetchPreview: true,
                fetchMusicBrainz: true, // FIXED: Re-check geography in case preview was wrong
                rateLimit: true
              });
              curatedDb.update(songId, enriched);
            }
          } catch (e) {
            console.error(`[Import] Background enrichment failed for ${songId}:`, e.message);
          }
        }
        console.log(`[Import] Background enrichment complete for ${enrichQueue.length} songs`);
      })();
    }
  } catch (e) {
    console.error('[AdminImport][commit] failed:', e && e.message);
    res.status(500).json({ ok: false, error: e?.message || 'Commit failed' });
  }
});

/**
 * Admin One-time Population
 * Body: {
 *   yearMin?: number, yearMax?: number,
 *   genres?: string[]|string,
 *   markets?: string[]|string,
 *   limits?: { billboard?: number, search?: number },
 *   includeBillboard?: boolean, includeSearch?: boolean
 * }
 */
app.post('/api/admin/populate/one-time', requireAdmin, async (req, res) => {
  try {
    const {
      yearMin, yearMax, genres, markets,
      limits = { billboard: 300, search: 300 },
      includeBillboard = true,
      includeSearch = true
    } = req.body || {};

    const filters = {
      yearMin, yearMax, genres, markets
    };

    let totalAdded = 0, totalUpdated = 0, totalAttempted = 0;

    if (includeBillboard) {
      const prev = await (async () => {
        return await axios.post(`${req.protocol}://${req.get('host')}/api/admin/import/preview`, {
          mode: 'billboard',
          filters,
          limit: Number(limits.billboard) || 300
        }, { headers: { 'x-admin-secret': process.env.ADMIN_PASSWORD } }).then(r => r.data).catch(() => ({ items: [] }));
      })();

      const com = await (async () => {
        return await axios.post(`${req.protocol}://${req.get('host')}/api/admin/import/commit`, {
          items: prev.items || []
        }, { headers: { 'x-admin-secret': process.env.ADMIN_PASSWORD } }).then(r => r.data).catch(() => ({ added: 0, updated: 0, attempted: 0 }));
      })();

      totalAttempted += com.attempted || 0;
      totalAdded += com.added || 0;
      totalUpdated += com.updated || 0;
    }

    if (includeSearch) {
      const prev = await (async () => {
        return await axios.post(`${req.protocol}://${req.get('host')}/api/admin/import/preview`, {
          mode: 'search',
          filters,
          limit: Number(limits.search) || 300
        }, { headers: { 'x-admin-secret': process.env.ADMIN_PASSWORD } }).then(r => r.data).catch(() => ({ items: [] }));
      })();

      const com = await (async () => {
        return await axios.post(`${req.protocol}://${req.get('host')}/api/admin/import/commit`, {
          items: prev.items || []
        }, { headers: { 'x-admin-secret': process.env.ADMIN_PASSWORD } }).then(r => r.data).catch(() => ({ added: 0, updated: 0, attempted: 0 }));
      })();

      totalAttempted += com.attempted || 0;
      totalAdded += com.added || 0;
      totalUpdated += com.updated || 0;
    }

    res.json({ ok: true, attempted: totalAttempted, added: totalAdded, updated: totalUpdated });
  } catch (e) {
    console.error('[AdminPopulate][one-time] failed:', e && e.message);
    res.status(500).json({ ok: false, error: e?.message || 'Populate failed' });
  }
});

// --- Curated Selection Endpoint (public for game creator) ---
app.post('/api/curated/select', (req, res) => {
  try {
    const {
      musicPreferences = {},
      difficulty = (config.difficulty || 'normal'),
      playerCount = 2,
      previewMode = false
    } = req.body || {};

    const {
      genres = ['pop', 'rock', 'hip-hop', 'electronic', 'indie'],
      yearRange = { min: 1980, max: 2024 },
      markets = ['US']
    } = musicPreferences || {};

    const result = curatedDb.selectForGame({
      yearRange,
      genres,
      markets,
      difficulty,
      playerCount,
      previewMode
    });
    res.json(result);
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || 'Selection failed' });
  }
});

// Store fetched songs for debugging (in production, consider using Redis or database)
let lastFetchedSongs = null;
let lastFetchMetadata = null;
let fetchHistory = [];

// Function to create systematic year-based searches for better distribution
function createYearBasedSearches(yearRange, genres, markets) {
  const { min: minYear, max: maxYear } = yearRange;
  if (!minYear || !maxYear) return [];
  
  const searches = [];
  const yearSpan = maxYear - minYear + 1;
  
  // Create decade-based searches for better distribution
  const decades = [];
  for (let year = Math.floor(minYear / 10) * 10; year <= maxYear; year += 10) {
    const decadeStart = Math.max(year, minYear);
    const decadeEnd = Math.min(year + 9, maxYear);
    if (decadeStart <= decadeEnd) {
      decades.push({ start: decadeStart, end: decadeEnd });
    }
  }
  
  console.log(`[Spotify] Creating searches for decades:`, decades);
  
  // For each decade, create searches with different genres
  decades.forEach(decade => {
    const yearQuery = `year:${decade.start}-${decade.end}`;
    
    // Add general decade searches
    searches.push(yearQuery);
    searches.push(`${yearQuery} hits`);
    searches.push(`${yearQuery} popular`);
    
    // Add genre-specific decade searches
    genres.forEach(genre => {
      searches.push(`${yearQuery} genre:${genre}`);
    });
  });
  
  // Add some 5-year period searches for finer granularity
  for (let year = minYear; year <= maxYear; year += 5) {
    const periodEnd = Math.min(year + 4, maxYear);
    if (year <= periodEnd) {
      const yearQuery = `year:${year}-${periodEnd}`;
      searches.push(yearQuery);
      
      // Add a few genre searches for this period
      const randomGenres = genres.sort(() => 0.5 - Math.random()).slice(0, 2);
      randomGenres.forEach(genre => {
        searches.push(`${yearQuery} genre:${genre}`);
      });
    }
  }
  
  console.log(`[Spotify] Created ${searches.length} year-based searches`);
  return searches;
}

// Function to ensure diverse artist representation
function diversifyByArtist(tracks, maxPerArtist = 1) {
  const tracksByArtist = {};
  const diversifiedTracks = [];
  
  // Group tracks by artist
  tracks.forEach(track => {
    const artist = track.artist.toLowerCase();
    if (!tracksByArtist[artist]) {
      tracksByArtist[artist] = [];
    }
    tracksByArtist[artist].push(track);
  });
  
  // Log artist distribution before diversification
  const artistCounts = Object.fromEntries(
    Object.entries(tracksByArtist)
      .filter(([artist, tracks]) => tracks.length > 1)
      .map(([artist, tracks]) => [artist, tracks.length])
  );
  console.log(`[Spotify] Artists with multiple tracks before diversification:`, artistCounts);
  
  // Take up to maxPerArtist tracks from each artist, prioritizing by popularity
  Object.values(tracksByArtist).forEach(artistTracks => {
    const selectedTracks = artistTracks
      .sort((a, b) => (b.popularity || 0) - (a.popularity || 0))
      .slice(0, maxPerArtist);
    diversifiedTracks.push(...selectedTracks);
  });
  
  // Log final artist distribution
  const finalArtistCounts = {};
  diversifiedTracks.forEach(track => {
    const artist = track.artist.toLowerCase();
    finalArtistCounts[artist] = (finalArtistCounts[artist] || 0) + 1;
  });
  
  const multipleArtists = Object.fromEntries(
    Object.entries(finalArtistCounts)
      .filter(([artist, count]) => count > 1)
  );
  console.log(`[Spotify] Artists with multiple tracks after diversification:`, multipleArtists);
  console.log(`[Spotify] Diversification: ${tracks.length} -> ${diversifiedTracks.length} tracks`);
  
  return diversifiedTracks;
}

/**
 * Determine if a track is suspicious (remaster/live markers).
 */
function isSuspiciousTrack(track) {
  const t = `${track.title || ''}`.toLowerCase();
  const a = `${track.album || ''}`.toLowerCase();
  return isRemasterMarker(t) || isRemasterMarker(a) || /\blive\b/.test(t);
}

/**
 * Apply popularity thresholds for non-chart mode.
 */
function applyNonChartDifficulty(tracks, difficulty) {
  const thr = config.thresholds.nonChart;
  let floor = thr.normal;
  if (difficulty === 'easy') floor = thr.easy;
  else if (difficulty === 'hard') floor = thr.hard;
  return tracks.filter((t) => (t.popularity || 0) >= floor);
}

// Enhanced fetch songs from Spotify with filtering support and MB enrichment (Phase 1-2)
app.post('/api/fetch-songs', async (req, res) => {
  const { musicPreferences = {}, difficulty = (config.difficulty || 'normal'), playerCount = 2, useChartMode } = req.body || {};
  const chartMode = typeof useChartMode === 'boolean' ? useChartMode : config.featureFlags.enableChartMode;
  console.log('[FetchSongs] Incoming request:', {
    requestedChartMode: useChartMode,
    effectiveChartMode: chartMode,
    difficulty,
    yearRange: musicPreferences?.yearRange
  });

  // Default preferences if none provided
  let {
    genres = ['pop', 'rock', 'hip-hop', 'electronic', 'indie'],
    yearRange = { min: 1980, max: 2024 },
    markets = ['US']
  } = musicPreferences || {};

  // Defensive normalization: lowercase + dedupe genres; uppercase + dedupe markets
  genres = Array.from(new Set((genres || []).map(g => String(g || '').toLowerCase()).filter(Boolean)));
  markets = Array.from(new Set((markets || []).map(m => String(m || '').toUpperCase()).filter(Boolean)));
  
  // Calculate minimum songs needed: playerCount * 20
  const minSongsNeeded = playerCount * 20;

  try {
    // If chart mode: build from chart provider and then resolve to Spotify
    if (chartMode) {
      console.log('[ChartMode] Enabled. Fetching chart entries...');

      // Honor yearRange in chart mode with a minimum span of 10 years
      let minY = Number(yearRange?.min) || null;
      let maxY = Number(yearRange?.max) || null;
      let effectiveRange = null;

      if (Number.isFinite(minY) && Number.isFinite(maxY) && minY <= maxY) {
        const span = maxY - minY + 1;
        const MIN_SPAN = 10;
        if (span < MIN_SPAN) {
          const deficit = MIN_SPAN - span;
          const expandLeft = Math.floor(deficit / 2);
          const expandRight = deficit - expandLeft;
          minY = minY - expandLeft;
          maxY = maxY + expandRight;
          console.log('[ChartMode] Expanded narrow year range to meet 10-year minimum:', { minY, maxY });
          effectiveRange = { min: minY, max: maxY, expanded: true, minSpan: MIN_SPAN };
        } else {
          effectiveRange = { min: minY, max: maxY, expanded: false, minSpan: MIN_SPAN };
        }
      }

      // Ask chartProvider to filter by yearMin/yearMax, with our enforced 10-year minimum
      let chartEntries = await getChartEntries({
        mode: 'recent',
        difficulty,
        yearMin: effectiveRange ? effectiveRange.min : undefined,
        yearMax: effectiveRange ? effectiveRange.max : undefined
      });

      console.log('[ChartMode] Entries after difficulty (pre-resolve):', chartEntries.length);

      // Extra fallback: if still zero, try 'all' mode unfiltered to ensure we get items
      if (!chartEntries || chartEntries.length === 0) {
        console.log('[ChartMode] No entries from recent. Trying ALL archive without year filter as fallback.');
        chartEntries = await getChartEntries({ mode: 'all', difficulty });
        console.log('[ChartMode] Entries from ALL (pre-resolve):', chartEntries.length);
      }

      // Cap chart entries to a reasonable number before Spotify resolution to avoid long delays
      const MAX_TO_RESOLVE = 300; // Adjust as needed
      if (chartEntries.length > MAX_TO_RESOLVE) {
        console.log(`[ChartMode] Capping chart entries to ${MAX_TO_RESOLVE} for Spotify resolution (was ${chartEntries.length})`);
        chartEntries = chartEntries.slice(0, MAX_TO_RESOLVE);
      }

      // Resolve each chart entry to a Spotify track
      const clientToken = await getClientToken();
      const resolved = [];
      for (const entry of chartEntries) {
        try {
          const q = `artist:"${entry.artist}" track:"${entry.title}"${entry.year ? ` year:${entry.year}` : ''}`;
          const resp = await axios.get('https://api.spotify.com/v1/search', {
            headers: { Authorization: `Bearer ${clientToken}` },
            params: { q: q, type: 'track', limit: 5, market: markets[0] || 'US' },
          });
          const item = (resp.data.tracks.items || [])[0];
          if (item) {
            resolved.push({
              id: item.id,
              title: item.name,
              artist: item.artists[0]?.name || entry.artist,
              year: new Date(item.album.release_date).getFullYear(),
              uri: item.uri,
              preview_url: item.preview_url,
              external_url: item.external_urls.spotify,
              album_art: item.album.images?.[0]?.url || null,
              market: markets[0] || 'US',
              genre: 'chart',
              popularity: item.popularity,
              rank: entry.rank,
              peakPos: entry.peakPos ?? null,
              weeksOnChart: entry.weeksOnChart ?? null,
              lastWeek: entry.lastWeek ?? null,
              source: 'chart',
              sourceDetails: {
                chartDate: entry.chartDate || null,
                rank: entry.rank ?? null,
                peakPos: entry.peakPos ?? null,
                weeksOnChart: entry.weeksOnChart ?? null
              }
            });
          }
        } catch (e) {
          console.warn('[ChartMode] Resolve failed for entry:', entry.title, 'by', entry.artist, e.message);
        }
      }

      // Optional remaster filter
      let processed = resolved;
      if (config.featureFlags.enableRemasterFilter) {
        processed = processed.filter((t) => !isSuspiciousTrack({ title: t.title, album: t.album_art ? '' : '' }));
      }

      // MusicBrainz enrichment for suspicious or big year anomalies
      if (config.featureFlags.enableMusicBrainz) {
        for (const t of processed) {
          if (isSuspiciousTrack({ title: t.title, album: '' })) {
            try {
              const mb = await resolveOriginalYear({ artist: t.artist, title: t.title });
              if (mb.earliestYear && mb.confidence >= config.musicbrainz.minConfidence) {
                if (!t.year || Math.abs(t.year - mb.earliestYear) >= config.musicbrainz.yearDiffThreshold) {
                  t.year = mb.earliestYear;
                  t.mbEnriched = true;
                }
              }
            } catch (e) {
              console.warn('[ChartMode][MB] Enrichment failed:', e.message);
            }
          }
        }
      }

      const diversified = diversifyByArtist(processed, 1);
      const minSongs = Math.max(60, minSongsNeeded);
      const shuffled = diversified.sort(() => 0.5 - Math.random()).slice(0, 120);

      // Annotate tracks with debug source and difficulty bucket
      const difficultyBucket = (rank, pop) => {
        // In chart mode use rank ceilings from config, fallback to nonChart if no rank
        if (Number.isFinite(rank)) {
          if (rank <= config.thresholds.chart.easy) return 'easy';
          if (rank <= config.thresholds.chart.normal) return 'normal';
          if (rank <= config.thresholds.chart.hard) return 'hard';
        }
        const p = Number(pop || 0);
        if (p >= config.thresholds.nonChart.easy) return 'easy';
        if (p >= config.thresholds.nonChart.normal) return 'normal';
        return 'hard';
      };
      const annotated = shuffled.map(t => ({
        ...t,
        debugSource: t.source || 'chart', // 'chart' when resolved from Billboard flow
        debugDifficulty: difficultyBucket(t.rank, t.popularity)
      }));

      const fetchResult = {
        tracks: annotated,
        metadata: {
          mode: 'chart',
          chartEntries: chartEntries.length,
          afterResolve: processed.length,
          finalCount: annotated.length,
          difficulty,
          preferences: musicPreferences,
          honoredSettings: {
            difficulty: true,
            genres: false,
            markets: true,
            yearRange: true
          },
          chartYearRangeApplied: effectiveRange ? {
            min: effectiveRange.min,
            max: effectiveRange.max,
            expanded: effectiveRange.expanded,
            minSpan: effectiveRange.minSpan
          } : null,
          marketsSearched: markets,
          playerCount,
          minSongsNeeded,
          timestamp: new Date().toISOString(),
          fetchId: Date.now().toString(),
        }
      };

      lastFetchedSongs = fetchResult;
      lastFetchMetadata = fetchResult.metadata;
      fetchHistory.unshift({
        ...fetchResult.metadata,
        trackCount: annotated.length,
        sampleTracks: annotated.slice(0, 5).map(t => ({ title: t.title, artist: t.artist, year: t.year, rank: t.rank }))
      });
      if (fetchHistory.length > 10) fetchHistory = fetchHistory.slice(0, 10);

      console.log(`[ChartMode] Returning ${annotated.length} tracks (difficulty: ${difficulty})`);
      return res.json(fetchResult);
    }

    // Non-chart mode: Spotify search as before
    // Get client credentials token for unbiased market results
    const clientToken = await getClientToken();
    
    console.log(`[Spotify] Fetching songs with preferences:`, {
      genres: genres.length,
      yearRange,
      markets,
      playerCount,
      minSongsNeeded,
      difficulty
    });

    const allTracks = [];
    
    // NEW APPROACH: Use systematic year-based searches for better distribution
    const yearBasedSearches = createYearBasedSearches(yearRange, genres, markets);
    
    // Add some general searches for additional variety
    const generalSearches = [
      'hits', 'popular', 'chart', 'top', 'best', 'classic', 'greatest'
    ];
    
    // Combine year-based and general searches
    const allSearches = [...yearBasedSearches, ...generalSearches];
    
    // Shuffle all searches to randomize order
    const shuffledSearches = allSearches.sort(() => 0.5 - Math.random());
    
    // Search in each market with systematic approach
    for (const market of markets) {
      for (const search of shuffledSearches) {
        try {
          // Year-based searches already include year filters, don't add more
          let query = search;
          
          // Only add year filter for general searches that don't already have year constraints
          if (!search.includes('year:') && yearRange.min && yearRange.max) {
            query += ` year:${yearRange.min}-${yearRange.max}`;
          }

          // Use smaller random offset to get more consistent results per search
          const randomOffset = Math.floor(Math.random() * 50); // Smaller offset for more predictable results

          const response = await axios.get('https://api.spotify.com/v1/search', {
            headers: {
              'Authorization': `Bearer ${clientToken}`
            },
            params: {
              q: query,
              type: 'track',
              limit: 20, // Larger limit per search to get more songs
              market: market,
              offset: randomOffset
            }
          });

          let tracks = response.data.tracks.items
            .filter(track => {
              // Additional year filtering for precision
              const trackYear = new Date(track.album.release_date).getFullYear();
              return (!yearRange.min || trackYear >= yearRange.min) && 
                     (!yearRange.max || trackYear <= yearRange.max);
            })
            .map(track => ({
              id: track.id,
              title: track.name,
              artist: track.artists[0].name,
              year: new Date(track.album.release_date).getFullYear(),
              uri: track.uri,
              preview_url: track.preview_url,
              external_url: track.external_urls.spotify,
              album_art: track.album.images && track.album.images.length > 0 ? track.album.images[0].url : null,
              market: market,
              genre: search.includes('genre:') ? search.split('genre:')[1].split(' ')[0] : 'general',
              popularity: track.popularity,
              album_name: track.album?.name || '',
              source: 'spotify',
              sourceDetails: {
                query: query,
                market: market
              }
            }));

          // CRITICAL FIX: Shuffle tracks to counteract alphabetical bias from Spotify
          // This prevents artists starting with numbers/early letters from being favored
          tracks = tracks.sort(() => 0.5 - Math.random());

          allTracks.push(...tracks);
          console.log(`[Spotify] Found ${tracks.length} tracks for "${query}" in ${market} (offset: ${randomOffset})`);
        } catch (searchError) {
          console.error(`[Spotify] Error searching for "${search}" in ${market}:`, searchError.message);
        }
      }
    }

    // Remove duplicates by ID
    const uniqueTracks = allTracks.filter((track, index, self) => 
      index === self.findIndex(t => t.id === track.id)
    );

    console.log(`[Spotify] Found ${uniqueTracks.length} unique tracks before filtering`);

    // If we don't have enough tracks, try more aggressive fallback searches
    if (uniqueTracks.length < Math.max(60, minSongsNeeded)) {
      console.log(`[Spotify] Not enough tracks (${uniqueTracks.length}), trying fallback searches...`);
      
      const fallbackSearches = [
        'popular', 'hits', 'chart', 'top', 'best', 'classic', 'greatest',
        'rock', 'pop', 'dance', 'indie', 'alternative', 'hip hop', 'electronic'
      ];
      
      // Shuffle fallback searches for randomization
      const shuffledFallbacks = fallbackSearches.sort(() => 0.5 - Math.random());
      
      for (const market of markets) {
        for (const search of shuffledFallbacks) {
          if (uniqueTracks.length >= Math.max(60, minSongsNeeded)) break; // Stop when we have enough
          
          try {
            // Use random offset for fallback searches too
            const randomOffset = Math.floor(Math.random() * 200);
            
            const response = await axios.get('https://api.spotify.com/v1/search', {
              headers: {
                'Authorization': `Bearer ${clientToken}`
              },
              params: {
                q: search,
                type: 'track',
                limit: 20,
                market: market,
                offset: randomOffset
              }
            });

            let tracks = response.data.tracks.items
              .filter(track => {
                const trackYear = new Date(track.album.release_date).getFullYear();
                return (!yearRange.min || trackYear >= yearRange.min) && 
                       (!yearRange.max || trackYear <= yearRange.max) &&
                       !uniqueTracks.some(existing => existing.id === track.id);
              })
              .map(track => ({
                id: track.id,
                title: track.name,
                artist: track.artists[0].name,
                year: new Date(track.album.release_date).getFullYear(),
                uri: track.uri,
                preview_url: track.preview_url,
                external_url: track.external_urls.spotify,
                album_art: track.album.images && track.album.images.length > 0 ? track.album.images[0].url : null,
                market: market,
                genre: 'fallback',
                popularity: track.popularity,
                album_name: track.album?.name || ''
              }));

            // CRITICAL FIX: Shuffle fallback tracks to counteract alphabetical bias
            tracks = tracks.sort(() => 0.5 - Math.random());

            uniqueTracks.push(...tracks);
            console.log(`[Spotify] Added ${tracks.length} fallback tracks from "${search}" in ${market} (offset: ${randomOffset})`);
          } catch (fallbackError) {
            console.error(`[Spotify] Fallback search error:`, fallbackError.message);
          }
        }
      }
    }

    // Phase 1: Remaster/live filtering (Spotify-only)
    let filtered = uniqueTracks;
    if (config.featureFlags.enableRemasterFilter) {
      filtered = uniqueTracks.filter(t => {
        const suspicious = isSuspiciousTrack({ title: t.title, album: t.album_name || '' });
        return !suspicious;
      });
      console.log(`[Filters] Remaster/live filter removed ${uniqueTracks.length - filtered.length} tracks`);
    }

    // Phase 2: MusicBrainz enrichment on suspicious candidates (we already removed most; optionally enrich subset)
    if (config.featureFlags.enableMusicBrainz) {
      let adjustedCount = 0;
      for (const t of filtered) {
        // Heuristic: if normalized title differs a lot (contains remaster words originally), or if missing year
        if (!t.year || /remaster|remastered/i.test(t.title)) {
          try {
            const mb = await resolveOriginalYear({ artist: t.artist, title: t.title });
            if (mb.earliestYear && mb.confidence >= config.musicbrainz.minConfidence) {
              if (!t.year || Math.abs(t.year - mb.earliestYear) >= config.musicbrainz.yearDiffThreshold) {
                t.year = mb.earliestYear;
                t.mbEnriched = true;
                adjustedCount++;
              }
            }
          } catch (e) {
            console.warn('[MB] Enrichment failed:', e.message);
          }
        }
      }
      console.log(`[MB] Adjusted years for ${adjustedCount} tracks (minConfidence=${config.musicbrainz.minConfidence})`);
    }

    // Apply difficulty-based filtering (non-chart using popularity thresholds)
    let filteredTracks = applyNonChartDifficulty(filtered, difficulty);
    console.log(`[Spotify] ${difficulty} mode: filtered to ${filteredTracks.length} tracks by popularity thresholds`);

    // Apply artist diversification to prevent too many songs from same artist
    const artistDiversifiedTracks = diversifyByArtist(filteredTracks, 1); // Max 1 song per artist
    
    // Ensure we have enough songs for the game
    const minSongs = Math.max(60, minSongsNeeded);
    
    // Check if we have enough songs for the game
    const hasEnoughSongs = artistDiversifiedTracks.length >= minSongsNeeded;
    const warning = !hasEnoughSongs ? 
      `Only found ${artistDiversifiedTracks.length} songs, but need at least ${minSongsNeeded} for ${playerCount} players. Consider broadening your music preferences (more genres, wider year range, or additional markets).` : 
      null;
    
    if (warning) {
      console.warn(`[Spotify] ${warning}`);
    }
    
    // Use all available songs but cap at maximum of 120 for faster loading
    const maxSongs = 120;
    const shuffled = artistDiversifiedTracks
      .sort(() => 0.5 - Math.random())
      .slice(0, maxSongs); // Cap at maximum 120 songs
    
    // Store for debugging purposes
    // Annotate non-chart tracks with debug source and difficulty bucket
    const ncDifficultyBucket = (pop) => {
      const p = Number(pop || 0);
      if (p >= config.thresholds.nonChart.easy) return 'easy';
      if (p >= config.thresholds.nonChart.normal) return 'normal';
      return 'hard';
    };
    const annotatedNC = shuffled.map(t => ({
      ...t,
      debugSource: t.source || 'spotify',
      debugDifficulty: ncDifficultyBucket(t.popularity)
    }));

    const fetchResult = {
      tracks: annotatedNC,
      metadata: {
        mode: 'non-chart',
        totalFound: uniqueTracks.length,
        afterRemasterFilter: filtered.length,
        filteredByDifficulty: filteredTracks.length,
        afterArtistDiversification: artistDiversifiedTracks.length,
        finalCount: annotatedNC.length,
        difficulty: difficulty,
        preferences: musicPreferences,
        honoredSettings: {
          difficulty: true,
          genres: true,
          markets: true,
          yearRange: true
        },
        marketsSearched: markets,
        genresSearched: genres,
        playerCount: playerCount,
        minSongsNeeded: minSongsNeeded,
        hasEnoughSongs: hasEnoughSongs,
        warning: warning,
        timestamp: new Date().toISOString(),
        fetchId: Date.now().toString()
      }
    };
    
    lastFetchedSongs = fetchResult;
    lastFetchMetadata = fetchResult.metadata;
    
    // Keep history of last 10 fetches
    fetchHistory.unshift({
      ...fetchResult.metadata,
      trackCount: shuffled.length,
      sampleTracks: shuffled.slice(0, 5).map(t => ({ title: t.title, artist: t.artist, year: t.year }))
    });
    if (fetchHistory.length > 10) {
      fetchHistory = fetchHistory.slice(0, 10);
    }
    
    console.log(`[Spotify] Returning ${shuffled.length} tracks with difficulty: ${difficulty} (non-chart mode)`);
    console.log(`[Spotify DEBUG] Sample tracks:`, shuffled.slice(0, 5).map(t => `${t.title} by ${t.artist} (${t.year})`));
    
    res.json(fetchResult);
  } catch (error) {
    console.error('Error fetching tracks:', error);
    res.status(500).json({ error: 'Failed to fetch tracks' });
  }
});
const server = http.createServer(app);
const io = new Server(server, { 
  cors: {
    origin: process.env.NODE_ENV === 'production' 
      ? [
          process.env.FRONTEND_URI, 
          'https://beatably-frontend.netlify.app',
          'https://beatably.app',
          'https://www.beatably.app'
        ].filter(Boolean) // Remove any undefined values
      : ['http://127.0.0.1:5173', 'http://localhost:5173'],
    credentials: true,
    methods: ['GET', 'POST']
  }
});

const lobbies = {}; // { code: { players: [], settings: {}, status: "waiting"|"playing" } }

// Store game state per room: { [code]: { timeline, deck, currentPlayerIdx, phase, ... } }
const games = {};

// Store player sessions for reconnection: { sessionId: { playerId, roomCode, playerName, isCreator, timestamp } }
const playerSessions = {};

// PERSISTENT PLAYER ID SYSTEM
// Map socket IDs to persistent player IDs: { socketId: persistentId }
const socketToPlayerMap = {};

// Generate unique persistent player ID
function generatePersistentPlayerId() {
  return `player_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

// Helper function to get persistent ID from socket ID
function getPersistentId(socketId) {
  return socketToPlayerMap[socketId] || null;
}

// Helper function to get socket ID from persistent ID (search through mapping)
function getSocketId(persistentId) {
  for (const [socketId, pId] of Object.entries(socketToPlayerMap)) {
    if (pId === persistentId) {
      return socketId;
    }
  }
  return null;
}

// Attempt to load prior state (lobbies/games) from disk on startup
loadStateFromDisk();

// Session timeout (30 minutes)
const SESSION_TIMEOUT = 30 * 60 * 1000;

// Clean up expired sessions periodically
setInterval(() => {
  const now = Date.now();
  Object.keys(playerSessions).forEach(sessionId => {
    if (now - playerSessions[sessionId].timestamp > SESSION_TIMEOUT) {
      console.log('[Sessions] Cleaning up expired session:', sessionId);
      delete playerSessions[sessionId];
    }
  });
}, 5 * 60 * 1000); // Clean up every 5 minutes

io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  // Session reconnection
  socket.on('reconnect_session', ({ sessionId, roomCode, playerName }, callback) => {
    console.log('[Sessions] Reconnection attempt:', { sessionId, roomCode, playerName, socketId: socket.id });
    
    // Check if we have a valid session
    const session = playerSessions[sessionId];
    const hasValidSession = session && 
      session.roomCode === roomCode && 
      session.playerName === playerName;

    if (hasValidSession) {
      // CRITICAL: Update socket-to-persistent-ID mapping
      const persistentId = session.persistentPlayerId;
      if (persistentId) {
        socketToPlayerMap[socket.id] = persistentId;
        console.log('[PersistentID] Reconnection: mapped socket', socket.id, 'to persistent ID', persistentId);
      }
      
      // Update session with new socket ID
      session.playerId = socket.id;
      session.timestamp = Date.now();
      console.log('[Sessions] Valid session found, updating socket ID');
    }

    // CRITICAL FIX: Check both memory and persisted state
    let lobby = lobbies[roomCode];
    let game = games[roomCode];
    
    // CRITICAL FIX: If lobby exists and player was a member, allow reconnection even without valid session
    if (lobby && !hasValidSession) {
      const existingPlayer = lobby.players.find(p => p.name === playerName);
      if (existingPlayer) {
        console.log('[Sessions] Found existing player in lobby without valid session, allowing rejoin');
        // Create/update session for this player
        if (!playerSessions[sessionId]) {
          playerSessions[sessionId] = {
            sessionId,
            playerId: socket.id,
            persistentPlayerId: existingPlayer.persistentId,
            roomCode,
            playerName,
            isCreator: existingPlayer.isCreator,
            timestamp: Date.now()
          };
        }
        // Update socket mapping
        if (existingPlayer.persistentId) {
          socketToPlayerMap[socket.id] = existingPlayer.persistentId;
        }
      }
    }
    
    // CRITICAL FIX: Only create minimal lobby if NO lobby exists at all
    // This prevents overwriting existing lobbies with other players
    if (!lobby && !game) {
      console.log('[Sessions] No active room found in memory');
      
      // Only create minimal lobby structure for valid sessions as last resort
      // This handles server restarts but should NOT overwrite existing lobbies
      if (hasValidSession) {
        console.log('[Sessions] Creating minimal lobby structure for valid session (server restart scenario)');
        
        // CRITICAL FIX: Get or generate persistent ID for the player
        const persistentId = session.persistentPlayerId || generatePersistentPlayerId();
        
        // Update socket mapping
        if (persistentId) {
          socketToPlayerMap[socket.id] = persistentId;
        }
        
        lobby = {
          players: [{
            id: socket.id,
            persistentId: persistentId,
            name: playerName,
            isCreator: session.isCreator,
            isReady: true
          }],
          settings: {
            difficulty: "normal",
            winCondition: 10,
            musicPreferences: {
              genres: ['pop', 'rock', 'hip-hop', 'electronic', 'r&b'],
              yearRange: { min: 1960, max: 2025 },
              markets: ['US']
            }
          },
          status: "waiting"
        };
        lobbies[roomCode] = lobby;
        
        // Update session with persistent ID
        if (!session.persistentPlayerId) {
          session.persistentPlayerId = persistentId;
        }
        
        schedulePersist();
      } else {
        console.log('[Sessions] No valid session and no room found:', roomCode);
        return callback({ error: "Game no longer exists" });
      }
    }

    // Helper function to handle game reconnection
    const reconnectToGame = (game, isStateless = false) => {
      const existingPlayerIndex = game.players.findIndex(p => p.name === playerName);
      if (existingPlayerIndex === -1) {
        console.log('[Sessions] Player not found in game:', { roomCode, playerName });
        return callback({ error: "Player not found in game" });
      }

      const oldPlayerId = game.players[existingPlayerIndex].id;
      socket.join(roomCode);
      console.log('[Sessions] Reconnected to game:', { roomCode, isStateless, oldPlayerId, newSocketId: socket.id });

      // Get current game state
      const currentPlayerId = game.playerOrder[game.currentPlayerIdx];
      const currentCard = game.sharedDeck[game.currentCardIndex];

      // Update player's socket ID without affecting other players
      game.players[existingPlayerIndex].id = socket.id;

      // RESTART FIX: Also update lobby.players to keep IDs in sync.
      // Without this, lobby.players gets stale socket IDs after game reconnections,
      // which breaks restart_game (start_game) since it iterates over lobby.players.
      const lobbyForSync = lobbies[roomCode];
      if (lobbyForSync) {
        const lobbyPlayerIdx = lobbyForSync.players.findIndex(p => p.name === playerName);
        if (lobbyPlayerIdx !== -1 && lobbyForSync.players[lobbyPlayerIdx].id !== socket.id) {
          console.log('[Sessions] Syncing lobby player ID during game reconnection:', {
            name: playerName,
            oldId: lobbyForSync.players[lobbyPlayerIdx].id,
            newId: socket.id
          });
          lobbyForSync.players[lobbyPlayerIdx].id = socket.id;
        }
      }

      // Update playerOrder mapping
      for (let i = 0; i < game.playerOrder.length; i++) {
        if (game.playerOrder[i] === oldPlayerId) {
          game.playerOrder[i] = socket.id;
          console.log('[Sessions] Updated player order:', { index: i, from: oldPlayerId, to: socket.id });
        }
      }

      // Update timeline mapping
      if (game.timelines[oldPlayerId]) {
        if (oldPlayerId !== socket.id) {
          game.timelines[socket.id] = game.timelines[oldPlayerId];
          delete game.timelines[oldPlayerId];
          console.log('[Sessions] Moved timeline mapping:', {
            from: oldPlayerId,
            to: socket.id,
            timelineLength: game.timelines[socket.id].length
          });
        }
      } else {
        console.warn('[Sessions] No existing timeline found, creating empty one');
        game.timelines[socket.id] = [];
      }

      // Validate current player pointer
      const finalCurrentPlayerId = game.playerOrder[game.currentPlayerIdx];
      if (!finalCurrentPlayerId || !game.players.find(p => p.id === finalCurrentPlayerId)) {
        console.error('[Sessions] Invalid current player, attempting repair');
        const validPlayer = game.players.find(p => game.playerOrder.includes(p.id));
        if (validPlayer) {
          game.currentPlayerIdx = game.playerOrder.indexOf(validPlayer.id);
        }
      }

      // Recreate session if this was stateless
      if (isStateless) {
        try {
          playerSessions[sessionId] = {
            sessionId,
            playerId: socket.id,
            roomCode,
            playerName,
            isCreator: !!game.players[existingPlayerIndex].isCreator,
            timestamp: Date.now()
          };
          console.log('[Sessions] Recreated session after stateless rejoin:', sessionId);
        } catch (e) {
          console.warn('[Sessions] Failed to recreate session:', e?.message);
        }
      }

      // Send the current player's timeline (the one whose turn it is)
      const currentPlayerTimeline = game.timelines[currentPlayerId] || [];

      callback({
        success: true,
        view: 'game',
        gameState: {
          timeline: currentPlayerTimeline, // Send current player's timeline
          deck: [currentCard],
          players: game.players,
          phase: game.phase,
          feedback: game.feedback,
          lastPlaced: game.lastPlaced,
          removingId: game.removingId,
          currentPlayerIdx: game.currentPlayerIdx,
          currentPlayerId: game.playerOrder[game.currentPlayerIdx],
          challenge: game.challenge
        }
      });

      // Broadcast updated state to all players
      setTimeout(() => {
        const broadcastCurrentPlayerId = game.playerOrder[game.currentPlayerIdx];
        game.players.forEach((p) => {
          io.to(p.id).emit('game_update', {
            timeline: game.timelines[broadcastCurrentPlayerId] || [],
            deck: [currentCard],
            players: game.players,
            phase: game.phase,
            feedback: game.feedback,
            lastPlaced: game.lastPlaced,
            removingId: game.removingId,
            currentPlayerIdx: game.currentPlayerIdx,
            currentPlayerId: broadcastCurrentPlayerId,
            challenge: game.challenge
          });
        });
      }, 100);

      // Notify other players of reconnection
      socket.to(roomCode).emit('player_reconnected', {
        playerName,
        playerId: socket.id
      });
    };

    // Helper function to handle lobby reconnection
    const reconnectToLobby = (lobby, isStateless = false) => {
      const existingPlayerIndex = lobby.players.findIndex(p => p.name === playerName);
      let isCreator = false;
      let persistentId = null;
      
      if (existingPlayerIndex !== -1) {
        isCreator = !!lobby.players[existingPlayerIndex].isCreator;
        persistentId = lobby.players[existingPlayerIndex].persistentId;
        lobby.players[existingPlayerIndex].id = socket.id;
        
        // CRITICAL FIX: Update socket-to-persistent-ID mapping for lobby reconnections
        if (persistentId) {
          socketToPlayerMap[socket.id] = persistentId;
          console.log('[Sessions] Restored persistent ID mapping for lobby reconnection:', { 
            socketId: socket.id, 
            persistentId, 
            playerName, 
            isCreator 
          });
        }
        
        console.log('[Sessions] Updated existing player in lobby:', { playerName, isCreator });
      } else {
        // Check if this should be the creator
        const shouldBeCreator = lobby.players.length === 0 || (hasValidSession && session.isCreator);
        isCreator = shouldBeCreator;
        
        // Generate persistent ID for new player
        persistentId = generatePersistentPlayerId();
        socketToPlayerMap[socket.id] = persistentId;
        
        lobby.players.push({
          id: socket.id,
          persistentId: persistentId,  // CRITICAL FIX: Include persistent ID for new players
          name: playerName,
          isCreator,
          isReady: true
        });
        console.log('[Sessions] Added new player to lobby:', { playerName, isCreator, persistentId });
      }

      socket.join(roomCode);

      // Recreate session if this was stateless
      if (isStateless) {
        try {
          playerSessions[sessionId] = {
            sessionId,
            playerId: socket.id,
            persistentPlayerId: persistentId,  // CRITICAL FIX: Include persistent ID in recreated session
            roomCode,
            playerName,
            isCreator,
            timestamp: Date.now()
          };
          console.log('[Sessions] Recreated session for lobby:', sessionId);
        } catch (e) {
          console.warn('[Sessions] Failed to recreate session for lobby:', e?.message);
        }
      }

      callback({
        success: true,
        view: 'waiting',
        lobby,
        player: lobby.players.find(p => p.id === socket.id)
      });
      io.to(roomCode).emit('lobby_update', lobby);
    };

    // CRITICAL FIX: Always prioritize game over lobby
    if (game) {
      console.log('[Sessions] Active game found, reconnecting to game');
      reconnectToGame(game, !hasValidSession);
    } else if (lobby) {
      console.log('[Sessions] Lobby found, reconnecting to lobby');
      reconnectToLobby(lobby, !hasValidSession);
    } else {
      console.log('[Sessions] No room found after all checks:', roomCode);
      callback({ error: "Game no longer exists" });
    }
  });

  // Create session for new players
  socket.on('create_session', ({ roomCode, playerName, isCreator }, callback) => {
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
    
    playerSessions[sessionId] = {
      sessionId,
      playerId: socket.id,
      roomCode,
      playerName,
      isCreator,
      timestamp: Date.now()
    };
    
    console.log('[Sessions] Created session:', sessionId, 'for player:', playerName);
    callback({ sessionId });
  });

  // Create lobby
  socket.on('create_lobby', ({ name, code, settings, sessionId }, callback) => {
    if (lobbies[code]) {
      callback({ error: "Lobby already exists" });
      return;
    }
    
    // Generate persistent player ID
    const persistentId = generatePersistentPlayerId();
    socketToPlayerMap[socket.id] = persistentId;
    
    const player = { 
      id: socket.id,
      persistentId: persistentId,  // NEW: Persistent ID
      name, 
      isCreator: true, 
      isReady: true 
    };
    lobbies[code] = {
      players: [player],
      settings: settings || { difficulty: "normal" },
      status: "waiting"
    };
    socket.join(code);
    
    // Create or update session
    if (sessionId) {
      playerSessions[sessionId] = {
        sessionId,
        playerId: socket.id,
        persistentPlayerId: persistentId,  // NEW: Store persistent ID in session
        roomCode: code,
        playerName: name,
        isCreator: true,
        timestamp: Date.now()
      };
    }
    
    console.log('[PersistentID] Created lobby with persistent player ID:', { socketId: socket.id, persistentId, name });
    
    callback({ lobby: lobbies[code], player, sessionId });
    io.to(code).emit('lobby_update', lobbies[code]);
  });

  // Join lobby
  socket.on('join_lobby', ({ name, code }, callback) => {
    console.log('[Backend] Player joining lobby:', { name, code, playerId: socket.id });
    console.log('[Backend] Available lobbies:', Object.keys(lobbies));
    console.log('[Backend] Lobby details for code', code, ':', lobbies[code]);
    
    const lobby = lobbies[code];
    if (!lobby) {
      console.log('[Backend] No lobby found for code:', code);
      callback({ error: "No lobby found or game already started" });
      return;
    }
    if (lobby.status !== "waiting") {
      console.log('[Backend] Lobby not in waiting status:', lobby.status);
      callback({ error: "No lobby found or game already started" });
      return;
    }
    if (lobby.players.length >= 4) {
      console.log('[Backend] Lobby is full:', lobby.players.length);
      callback({ error: "Lobby is full (maximum 4 players)" });
      return;
    }
    
    // Generate persistent player ID
    const persistentId = generatePersistentPlayerId();
    socketToPlayerMap[socket.id] = persistentId;
    
    const player = { 
      id: socket.id,
      persistentId: persistentId,  // NEW: Persistent ID
      name, 
      isCreator: false, 
      isReady: true 
    };
    lobby.players.push(player);
    socket.join(code);
    
    console.log('[PersistentID] Player joined with persistent ID:', { socketId: socket.id, persistentId, name });
    console.log('[Backend] Player joined room:', code, 'Socket rooms:', Array.from(socket.rooms));
    console.log('[Backend] Updated lobby players:', lobby.players.map(p => ({ id: p.id, name: p.name })));
    callback({ lobby, player });
    io.to(code).emit('lobby_update', lobby);
  });

  // Leave lobby
socket.on('leave_lobby', ({ code }, callback) => {
const lobby = lobbies[code];
    if (!lobby) return;

    // Find the leaving player to check if they're the creator
    const leavingPlayer = lobby.players.find(p => p.id === socket.id);
    const isCreatorLeaving = leavingPlayer && leavingPlayer.isCreator;
    const hasActiveGame = !!games[code];

    // If there's an active game in progress, notify ALL remaining players BEFORE removing from room
    if (hasActiveGame && lobby.players.length > 1) {
      // Also try to find the player in the game's player list (more reliable for socket ID matching)
      const gamePlayer = games[code]?.players?.find(p => p.id === socket.id);
      const leaverName = leavingPlayer?.name || gamePlayer?.name || 'A player';
      
      console.log(`[Leave] Player "${leaverName}" left during active game in room ${code}. Ending game for everyone.`);
      
      // Mark the lobby/game as ending to prevent disconnect handler from also sending notifications
      lobby._ending = true;
      
      const notification = {
        message: `${leaverName} has left the game. The game has ended for everyone.`,
        playerName: leaverName,
        wasCreator: isCreatorLeaving
      };
      
      // ROBUST: Emit to EACH remaining player individually using game's player list
      // This is more reliable than room-based broadcasting since it doesn't depend on room membership
      const game = games[code];
      if (game && game.players) {
        game.players.forEach(p => {
          if (p.id !== socket.id) {
            console.log(`[Leave] Sending player_left_game to ${p.name} (${p.id})`);
            io.to(p.id).emit('player_left_game', notification);
          }
        });
      }
      
      // Also broadcast via room as a fallback
      socket.to(code).emit('player_left_game', notification);

      // Now remove the leaving player and leave the room
      lobby.players = lobby.players.filter(p => p.id !== socket.id);
      socket.leave(code);

      // Clean up the game and lobby after a short delay to allow notification to be received
      setTimeout(() => {
        delete games[code];
        delete lobbies[code];
        schedulePersist();
      }, 2000);
    } else {
      // Remove the leaving player and leave the room
      lobby.players = lobby.players.filter(p => p.id !== socket.id);
      socket.leave(code);
      
      if (isCreatorLeaving && lobby.players.length > 0) {
        // Creator left from waiting room (no active game) - notify remaining players
        io.to(code).emit('host_left', {
          message: 'The host has left the game. You will be returned to the lobby.',
          hostName: leavingPlayer.name
        });

        // Clean up the lobby after a short delay to allow notification to be received
        setTimeout(() => {
          delete lobbies[code];
          schedulePersist();
        }, 1000);
      } else if (lobby.players.length === 0) {
        // No players left, delete lobby and game
        delete games[code];
        delete lobbies[code];
        schedulePersist();
      } else {
        // Normal leave from waiting room (non-creator), update remaining players
        io.to(code).emit('lobby_update', lobby);
        schedulePersist();
      }
    }

    callback && callback();
  });

  // Update ready status (no-op, always ready)
  socket.on('set_ready', ({ code, isReady }) => {
    // No-op: all players are always ready
  });

  // Kick player (host only)
  socket.on('kick_player', ({ code, playerId }) => {
    const lobby = lobbies[code];
    if (!lobby) return;
    lobby.players = lobby.players.filter(p => p.id !== playerId);
    io.to(code).emit('lobby_update', lobby);
    // Optionally, notify kicked player
    io.to(playerId).emit('kicked');
  });

  // Update settings (host only)
  socket.on('update_settings', ({ code, settings }) => {
    const lobby = lobbies[code];
    if (!lobby) return;
    lobby.settings = settings;
    io.to(code).emit('lobby_update', lobby);
  });

  // --- Game state management ---
  // Fake song data for prototyping (should be moved to DB in production)
  const fakeSongs = [
    { id: 1, title: "Billie Jean", artist: "Michael Jackson", year: 1983 },
    { id: 2, title: "Rolling in the Deep", artist: "Adele", year: 2010 },
    { id: 3, title: "Shape of You", artist: "Ed Sheeran", year: 2017 },
    { id: 4, title: "Smells Like Teen Spirit", artist: "Nirvana", year: 1991 },
    { id: 5, title: "Like a Prayer", artist: "Madonna", year: 1989 },
    { id: 6, title: "Hey Ya!", artist: "Outkast", year: 2003 },
    { id: 7, title: "Uptown Funk", artist: "Mark Ronson ft. Bruno Mars", year: 2014 },
    { id: 8, title: "Bohemian Rhapsody", artist: "Queen", year: 1975 },
    { id: 9, title: "Poker Face", artist: "Lady Gaga", year: 2008 },
    { id: 10, title: "Wonderwall", artist: "Oasis", year: 1995 },
    { id: 11, title: "Hips Don't Lie", artist: "Shakira", year: 2006 },
    { id: 12, title: "Viva La Vida", artist: "Coldplay", year: 2008 },
    { id: 13, title: "I Gotta Feeling", artist: "Black Eyed Peas", year: 2009 },
    { id: 14, title: "Old Town Road", artist: "Lil Nas X", year: 2019 },
    { id: 15, title: "Take On Me", artist: "a-ha", year: 1985 },
  ];

  // Beatably cards - special action cards
  const beatablyCards = [
    { id: 'h1', type: 'beatably', action: 'extra_turn', description: 'Take another turn' },
    { id: 'h2', type: 'beatably', action: 'steal_token', description: 'Steal a token from another player' },
    { id: 'h3', type: 'beatably', action: 'bonus_token', description: 'Gain an extra token' },
    { id: 'h4', type: 'beatably', action: 'skip_challenge', description: 'Skip next challenge against you' },
    { id: 'h5', type: 'beatably', action: 'double_points', description: 'Next correct guess counts double' },
  ];

  // Start game (host only)
  socket.on('start_game', ({ code, realSongs }) => {
    console.log('[Backend] Starting game for code:', code);
    console.log('[Backend] Real songs provided:', realSongs ? realSongs.length : 0);
    const lobby = lobbies[code];
    console.log('[Backend] Lobby settings at start:', lobby?.settings);
    if (!lobby) {
      console.log('[Backend] No lobby found for code:', code);
      return;
    }

    // RESTART FIX: If a game already exists (restart scenario), sync lobby player IDs
    // from game players to ensure we use the most up-to-date socket IDs.
    // During gameplay, reconnectToGame() updates game.players[].id but NOT lobby.players[].id,
    // so lobby.players can have stale socket IDs after reconnections.
    const existingGame = games[code];
    if (existingGame) {
      console.log('[Backend] Existing game found - this is a RESTART. Syncing lobby player IDs from game players.');
      existingGame.players.forEach(gamePlayer => {
        const lobbyPlayer = lobby.players.find(p => p.persistentId === gamePlayer.persistentId);
        if (lobbyPlayer) {
          if (lobbyPlayer.id !== gamePlayer.id) {
            console.log('[Backend] Syncing lobby player ID:', { name: gamePlayer.name, oldId: lobbyPlayer.id, newId: gamePlayer.id });
            lobbyPlayer.id = gamePlayer.id;
          }
        } else {
          // Player exists in game but not in lobby - add them back
          console.log('[Backend] Adding missing player back to lobby:', { name: gamePlayer.name, id: gamePlayer.id });
          lobby.players.push({
            id: gamePlayer.id,
            persistentId: gamePlayer.persistentId,
            name: gamePlayer.name,
            isCreator: gamePlayer.isCreator,
            isReady: true
          });
        }
      });
    }

    console.log('[Backend] Lobby players:', lobby.players.map(p => ({ id: p.id, persistentId: p.persistentId, name: p.name })));
    lobby.status = "playing";

    // Shuffle the song pool for fairness
    function shuffle(arr) {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    }

    // Use real songs if available, otherwise fall back to fake songs
    const songsToUse = realSongs && realSongs.length > 0 ? realSongs : fakeSongs;
    console.log('[Backend] Using', songsToUse.length, 'songs for game');
    
    // Create a shared shuffled deck for all players
    const shuffledSongs = shuffle([...songsToUse]);
    
    // Each player gets their own timeline starting with one random card
    const timelines = {};
    // NEW: Use persistent IDs for player order instead of socket IDs
    // Host (creator) always plays last
    const nonHostPlayers = lobby.players.filter((p) => !p.isCreator);
    const hostPlayer = lobby.players.find((p) => p.isCreator);
    const orderedPlayers = hostPlayer ? [...nonHostPlayers, hostPlayer] : nonHostPlayers;
    const playerOrder = orderedPlayers.map((p) => p.persistentId);
    
    // Give each player a unique starting card for their timeline
    const usedStartCards = new Set();
    playerOrder.forEach((persistentId, index) => {
      let startCard;
      do {
        startCard = shuffledSongs[Math.floor(Math.random() * shuffledSongs.length)];
      } while (usedStartCards.has(startCard.id));
      usedStartCards.add(startCard.id);
      // NEW: Use persistent ID as key for timelines
      timelines[persistentId] = [startCard];
    });

    // Create shared deck excluding the starting cards
    const sharedDeck = shuffledSongs.filter(song => !usedStartCards.has(song.id));

    // Determine win condition from lobby settings (default 10)
    const winCondition = (lobby.settings && Number.isFinite(lobby.settings.winCondition))
      ? Math.max(1, Math.min(50, parseInt(lobby.settings.winCondition, 10)))
      : 10;
    console.log('[Backend] Using winCondition:', winCondition);

    // Record analytics for game start
    const musicMode = (realSongs && realSongs.length > 0 && realSongs[0]?.source) 
      ? (realSongs[0].source === 'curated' ? 'curated' : realSongs[0].debugSource || 'spotify')
      : 'unknown';
    
    analytics.recordSessionStart({
      roomCode: code,
      playerCount: lobby.players.length,
      playerNames: lobby.players.map(p => p.name),
      difficulty: lobby.settings?.difficulty || 'normal',
      musicMode: musicMode,
      winCondition: winCondition
    });

    games[code] = {
      timelines, // { [playerId]: [cards] } - each player has their own timeline
      sharedDeck, // All players draw from the same deck
      beatablyDeck: shuffle([...beatablyCards]), // Shuffled beatably cards
      currentCardIndex: 0, // Index of current card in shared deck
      lastPlaced: null,
      feedback: null,
      removingId: null,
      challenge: null, // { challengerId, targetId, cardId, phase: 'waiting'|'resolved' }
      songGuess: null, // { playerId, title, artist, phase: 'waiting'|'resolved' }
      players: orderedPlayers.map((p, idx) => ({
        id: p.id,
        persistentId: p.persistentId,  // NEW: Include persistent ID in player object
        name: p.name,
        score: 1, // Start with 1 point for the initial card
        tokens: 3,
        beatablyCards: [], // Player's beatably cards
        bonusTokens: 0, // Bonus tokens from correct song guesses
        doublePoints: false, // Next correct guess counts double
        skipChallenge: false, // Skip next challenge against this player
        isCreator: p.isCreator,
      })),
      currentPlayerIdx: 0,
      phase: "player-turn", // player-turn, reveal, challenge, song-guess, game-over
      playerOrder: playerOrder,  // NEW: Use persistent IDs for player order
      winCondition: winCondition, // First to N cards in timeline wins (configurable)
      // CRITICAL FIX: Track played cards to prevent cycling back to already-played cards
      playedCards: new Set(), // Track which cards have been played
    };

    // Send initial game state to all players
    const currentPlayerId = games[code].playerOrder[0];
    const currentCard = sharedDeck[0];
    
    lobby.players.forEach((p, idx) => {
      io.to(p.id).emit('game_started', {
        timeline: timelines[currentPlayerId], // Show current player's timeline to all
        deck: [currentCard], // Everyone sees the same current card
        players: games[code].players,
        phase: "player-turn",
        feedback: null,
        lastPlaced: null,
        removingId: null,
        currentPlayerIdx: 0,
        currentPlayerId: currentPlayerId,
      });
    });
  });

  // Handle card placement (turn-based, only current player can act)
  socket.on('place_card', ({ code, index }) => {
    console.log('[Backend] Received place_card:', { code, index, socketId: socket.id });
    console.log('[Backend] Socket rooms:', Array.from(socket.rooms));
    console.log('[Backend] Available games:', Object.keys(games));
    console.log('[Backend] Available lobbies:', Object.keys(lobbies));
    
    // Force rejoin the room if not already in it
    if (!socket.rooms.has(code)) {
      console.log('[Backend] Socket not in room, rejoining:', code);
      socket.join(code);
    }
    
    const game = games[code];
    if (!game) {
      console.log('[Backend] No game found for code:', code);
      console.log('[Backend] All games:', games);
      return;
    }
    console.log('[Backend] Game found, current player order:', game.playerOrder);
    console.log('[Backend] Current player index:', game.currentPlayerIdx);
    
    // PERSISTENT ID FIX: Use persistent IDs for comparison
    const persistentId = getPersistentId(socket.id);
    const currentPersistentId = game.playerOrder[game.currentPlayerIdx];
    console.log('[Backend] Player validation:', { 
      socketId: socket.id, 
      persistentId, 
      currentPersistentId, 
      match: persistentId === currentPersistentId 
    });
    
    if (persistentId !== currentPersistentId) {
      console.log('[Backend] Not current player:', { persistentId, currentPersistentId });
      return;
    }
    console.log('[Backend] All validations passed, processing card placement...');

    const timeline = game.timelines[persistentId] || [];
    const currentCard = game.sharedDeck[game.currentCardIndex];
    if (!currentCard) return;

    // Record round played for analytics
    analytics.recordRound(code);
    
    // Place card in timeline
    let newTimeline = [...timeline];
    newTimeline.splice(index, 0, currentCard);

    // Check correctness - CRITICAL FIX: Properly handle all placement scenarios
    let prevYear, nextYear;
    
    if (index === 0) {
      // Placing at the beginning
      prevYear = -Infinity;
      nextYear = timeline.length > 0 ? timeline[0].year : Infinity;
    } else if (index >= timeline.length) {
      // Placing at the end (beyond current timeline)
      prevYear = timeline.length > 0 ? timeline[timeline.length - 1].year : -Infinity;
      nextYear = Infinity;
    } else {
      // Placing in the middle
      prevYear = timeline[index - 1].year;
      nextYear = timeline[index].year;
    }
    
    const correct = prevYear <= currentCard.year && currentCard.year <= nextYear;
    
    // Add debug logging for original placement
    console.log('[Backend] Original placement debug:', {
      cardYear: currentCard.year,
      placementIndex: index,
      timeline: timeline.map(c => c.year),
      timelineLength: timeline.length,
      prevYear,
      nextYear,
      correct,
      calculation: `${prevYear} <= ${currentCard.year} <= ${nextYear}`
    });

    // IMPORTANT: Do NOT commit the placed card to the player's timeline yet.
    // We only commit permanently after reveal/continue logic confirms it's correct
    // or after challenge resolution. For now, keep the committed timeline intact.
    // We'll only send a visual timeline-with-placed-card to clients.

    // Compute visual timeline for display (non-committed)
    const displayTimeline = [...timeline];
    displayTimeline.splice(index, 0, { ...currentCard, preview: true });

    // Track lastPlaced for UI and later resolution
    game.lastPlaced = { 
      id: currentCard.id, 
      correct, 
      playerId: persistentId,  // PERSISTENT ID FIX: Use persistent ID
      index: index,
      phase: 'placed' // placed, challenged, resolved
    };
    game.feedback = { correct, year: currentCard.year, title: currentCard.title, artist: currentCard.artist };
    game.removingId = null;
    game.phase = "song-guess";
    game.lastSongGuess = null; // Clear previous round's song guess
    game.challengeWindowStart = Date.now();

    // Normalize scores to committed timeline lengths before broadcasting
    updatePlayerScores(game);

    // Broadcast song guess state to all players with a visual-only timeline
    game.players.forEach((p, idx) => {
      io.to(p.id).emit('game_update', {
        timeline: displayTimeline, // Visual timeline includes the tentative card
        deck: [currentCard], // Everyone sees the same current card
        players: game.players,
        phase: "song-guess",
        feedback: null, // No feedback shown yet
        lastPlaced: game.lastPlaced,
        removingId: null,
        currentPlayerIdx: game.currentPlayerIdx,
        currentPlayerId: currentPersistentId,  // PERSISTENT ID FIX: Use persistent ID
      });
    });

  });

  // CRITICAL FIX: Unified function to safely get the next card and advance turn
  const advanceTurn = (game, code) => {
    // CRITICAL: Ensure we have a valid card to play
    if (game.currentCardIndex >= game.sharedDeck.length) {
      console.log('[Backend] ERROR: Reached end of shared deck, game should end');
      return false;
    }
    
    // Mark current card as played
    const currentCard = game.sharedDeck[game.currentCardIndex];
    if (currentCard) {
      game.playedCards.add(currentCard.id);
    }
    
    // Advance to next player
    game.currentPlayerIdx = (game.currentPlayerIdx + 1) % game.players.length;
    
    // Find next unplayed card
    let nextCardIndex = game.currentCardIndex + 1;
    while (nextCardIndex < game.sharedDeck.length && game.playedCards.has(game.sharedDeck[nextCardIndex].id)) {
      nextCardIndex++;
    }
    
    if (nextCardIndex >= game.sharedDeck.length) {
      console.log('[Backend] ERROR: No more unplayed cards available');
      return false;
    }
    
    game.currentCardIndex = nextCardIndex;
    game.phase = "player-turn";
    
    return true;
  };

  // Helper to emit new_song_loaded with concrete URI for the next card
  function emitNewSongLoaded(io, code, game, reasonTag = 'next_turn') {
    try {
      const nextCard = game.sharedDeck[game.currentCardIndex];
      const payload = { reason: reasonTag };
      if (nextCard && nextCard.uri) {
        payload.uri = nextCard.uri;
        payload.card = {
          id: nextCard.id,
          title: nextCard.title,
          artist: nextCard.artist,
          year: nextCard.year,
          uri: nextCard.uri,
          preview_url: nextCard.preview_url || null,
          album_art: nextCard.album_art || null
        };
      }
      io.to(code).emit('new_song_loaded', payload);
      console.log('[Backend] Emitted new_song_loaded:', { room: code, reason: reasonTag, hasUri: !!payload.uri });
    } catch (e) {
      console.log('[Backend] Failed to emit new_song_loaded:', e.message);
    }
  }

  // Handle continue after feedback (any player can trigger)
  socket.on('continue_game', ({ code }) => {
    console.log('[Backend] Continue game called for code:', code, 'from socket:', socket.id);
    console.log('[Backend] Socket rooms:', Array.from(socket.rooms));
    console.log('[Backend] Available games:', Object.keys(games));
    
    // Get fresh reference to game object
    let game = games[code];
    if (!game) {
      console.log('[Backend] No game found in continue_game for code:', code);
      console.log('[Backend] Available games:', Object.keys(games));
      return;
    }
    console.log('[Backend] Game found in continue_game, phase:', game.phase);
    console.log('[Backend] Current player:', game.playerOrder[game.currentPlayerIdx]);
    console.log('[Backend] Feedback:', game.feedback);
    
    // PERSISTENT ID FIX: currentPlayerId from playerOrder is already a persistent ID
    const currentPersistentId = game.playerOrder[game.currentPlayerIdx];
    // Allow any player to continue, not just the current player
    console.log('[Backend] Processing continue_game, current player persistent ID:', currentPersistentId);

    // Emit music stop event to all players (creator will handle it)
    io.to(code).emit('stop_music', { reason: 'continue_to_next_turn' });

    // Store feedback before clearing it
    const wasCorrect = game.feedback && game.feedback.correct;
    const wasIncorrect = game.feedback && !game.feedback.correct;
    
    // Update all player scores to match their timeline lengths
    updatePlayerScores(game);
    
    // CRITICAL FIX: Handle incorrect card removal BEFORE advancing turn
    if (wasIncorrect) {
      // For incorrect, the card was never committed; just animate removal on UI
      game.removingId = game.lastPlaced?.id;
      setTimeout(() => {
        // Get fresh reference again
        const gameInTimeout = games[code];
        if (!gameInTimeout) {
          console.log('[Backend] Game disappeared in timeout!');
          return;
        }
        
        // Ensure no accidental commit exists; keep committed timelines unchanged
        gameInTimeout.timelines[currentPersistentId] = (gameInTimeout.timelines[currentPersistentId] || []).filter((c) => c.id !== gameInTimeout.lastPlaced?.id);
        gameInTimeout.removingId = null;
        gameInTimeout.lastPlaced = null;
        gameInTimeout.feedback = null;

        // Normalize scores after removal
        updatePlayerScores(gameInTimeout);
        
        // CRITICAL FIX: Use unified advanceTurn function
        if (!advanceTurn(gameInTimeout, code)) {
          // Game should end
          gameInTimeout.phase = "game-over";
          const maxScore = Math.max(...gameInTimeout.players.map(p => p.score));
          const winners = gameInTimeout.players.filter(p => p.score === maxScore);
          gameInTimeout.winner = winners[0];
          
          gameInTimeout.players.forEach((p) => {
            io.to(p.id).emit('game_update', {
              timeline: gameInTimeout.timelines[gameInTimeout.winner?.id] || [],
              deck: [],
              players: gameInTimeout.players,
              phase: "game-over",
              feedback: null,
              lastPlaced: null,
              removingId: null,
              currentPlayerIdx: gameInTimeout.currentPlayerIdx,
              currentPlayerId: null,
              winner: gameInTimeout.winner,
            });
          });
          return;
        }
        
        const nextPlayerId = gameInTimeout.playerOrder[gameInTimeout.currentPlayerIdx];
        const nextCard = gameInTimeout.sharedDeck[gameInTimeout.currentCardIndex];

        // Normalize scores before broadcast
        updatePlayerScores(gameInTimeout);

        // NEW: Evaluate win condition at end-of-round after incorrect placement
        if (checkGameEnd(gameInTimeout)) {
          gameInTimeout.players.forEach((p) => {
            io.to(p.id).emit('game_update', {
              timeline: gameInTimeout.timelines[gameInTimeout.winner?.id] || [],
              deck: [],
              players: gameInTimeout.players,
              phase: gameInTimeout.phase,
              feedback: null,
              lastPlaced: null,
              removingId: null,
              currentPlayerIdx: gameInTimeout.currentPlayerIdx,
              currentPlayerId: null,
              winner: gameInTimeout.winner,
            });
          });
          return;
        }
        
        // Broadcast updated state to all players
        gameInTimeout.players.forEach((p, idx) => {
          const logInfo = {
            player: p.name,
            cardIndex: gameInTimeout.currentCardIndex,
            timelineLength: gameInTimeout.timelines[nextPlayerId]?.length,
            phase: gameInTimeout.phase,
            currentPlayerIdx: gameInTimeout.currentPlayerIdx,
            currentPlayerId: nextPlayerId,
          };
          console.log("[game_update]", logInfo);
          io.to(p.id).emit('game_update', {
            timeline: gameInTimeout.timelines[nextPlayerId],
            deck: [nextCard],
            players: gameInTimeout.players,
            phase: "player-turn",
            feedback: null,
            lastPlaced: null,
            removingId: null,
            currentPlayerIdx: gameInTimeout.currentPlayerIdx,
            currentPlayerId: nextPlayerId,
          });
        });
      }, 400);
      return;
    }
    
    // For correct placement: now COMMIT the card to the player's timeline
    const playerTimelineCommitted = game.timelines[currentPersistentId] || [];
    // Insert at the recorded index
    const commitTimeline = [...playerTimelineCommitted];
    // CRITICAL FIX: Check if lastPlaced exists and has a valid index before accessing it
    if (game.lastPlaced && game.lastPlaced.index !== undefined) {
      commitTimeline.splice(game.lastPlaced.index, 0, game.sharedDeck[game.currentCardIndex]);
      game.timelines[currentPersistentId] = commitTimeline;
    } else {
      console.error('[Backend] ERROR: game.lastPlaced is null or missing index in continue_game. Cannot commit card.', {
        lastPlaced: game.lastPlaced,
        currentCardIndex: game.currentCardIndex,
        code
      });
      // Don't commit the card if we don't have valid placement info
      game.timelines[currentPersistentId] = playerTimelineCommitted;
    }

    // Now advance turn
    if (!advanceTurn(game, code)) {
      // Game should end
      game.phase = "game-over";
      const maxScore = Math.max(...game.players.map(p => p.score));
      const winners = game.players.filter(p => p.score === maxScore);
      game.winner = winners[0];
      
      game.players.forEach((p) => {
        io.to(p.id).emit('game_update', {
          timeline: game.timelines[game.winner?.id] || [],
          deck: [],
          players: game.players,
          phase: "game-over",
          feedback: null,
          lastPlaced: null,
          removingId: null,
          currentPlayerIdx: game.currentPlayerIdx,
          currentPlayerId: null,
          winner: game.winner,
        });
      });
      return;
    }
    
    // Clear state after correct placement was committed
    game.feedback = null;
    game.lastPlaced = null;
    game.removingId = null;

    // Normalize scores after committing correct placement
    updatePlayerScores(game);
    
    // Check if game should end with new win condition logic
    if (checkGameEnd(game)) {
      // Game has ended, broadcast final state
      game.players.forEach((p, idx) => {
        io.to(p.id).emit('game_update', {
          timeline: game.timelines[game.winner?.id] || [],
          deck: [],
          players: game.players,
          phase: game.phase,
          feedback: null,
          lastPlaced: null,
          removingId: null,
          currentPlayerIdx: game.currentPlayerIdx,
          currentPlayerId: null,
          winner: game.winner,
        });
      });
      return;
    }
    
    const nextPlayerId = game.playerOrder[game.currentPlayerIdx];
    const nextCard = game.sharedDeck[game.currentCardIndex];
    
    // Emit new song loaded event for automatic playback, include concrete URI if available
    setTimeout(() => {
      emitNewSongLoaded(io, code, game, 'next_turn');
    }, 400);
    
    // Normalize scores before broadcasting correct placement advance
    updatePlayerScores(game);

    // Broadcast updated state to all players immediately for correct placements
    game.players.forEach((p, idx) => {
      const logInfo = {
        player: p.name,
        cardIndex: game.currentCardIndex,
        timelineLength: game.timelines[nextPlayerId]?.length,
        phase: game.phase,
        currentPlayerIdx: game.currentPlayerIdx,
        currentPlayerId: nextPlayerId,
      };
      console.log("[game_update]", logInfo);
      io.to(p.id).emit('game_update', {
        timeline: game.timelines[nextPlayerId],
        deck: game.phase === "game-over" ? [] : [nextCard],
        players: game.players,
        phase: game.phase,
        feedback: null,
        lastPlaced: null,
        removingId: null,
        currentPlayerIdx: game.currentPlayerIdx,
        currentPlayerId: nextPlayerId,
      });
    });
  });

  // Token actions
  socket.on('use_token', ({ code, action, targetPlayerId }) => {
    const game = games[code];
    if (!game) return;
    
    // PERSISTENT ID FIX: Get persistent ID from socket ID
    const persistentId = getPersistentId(socket.id);
    const playerIdx = game.players.findIndex(p => p.persistentId === persistentId);
    if (playerIdx === -1 || game.players[playerIdx].tokens <= 0) return;
    
    // Spend token
    game.players[playerIdx].tokens -= 1;
    
    switch (action) {
      case 'skip_song':
        // Allow any player to skip song, not just the current player
        // Emit music stop event to all players (creator will handle it)
        io.to(code).emit('stop_music', { reason: 'new_song' });
        
        // Skip current song but stay with same player
        game.currentCardIndex = (game.currentCardIndex + 1) % game.sharedDeck.length;
        // Don't advance currentPlayerIdx - same player gets the next song
        // PERSISTENT ID FIX: currentPlayerId in playerOrder is already a persistent ID
        const currentPersistentId = game.playerOrder[game.currentPlayerIdx];
        const nextCard = game.sharedDeck[game.currentCardIndex];
        
        // Broadcast update
        game.players.forEach((p) => {
          io.to(p.id).emit('game_update', {
            timeline: game.timelines[currentPersistentId],
            deck: [nextCard],
            players: game.players,
            phase: "player-turn",
            feedback: null,
            lastPlaced: null,
            removingId: null,
            currentPlayerIdx: game.currentPlayerIdx,
            currentPlayerId: currentPersistentId,
          });
        });
        
        // Emit new song loaded event for automatic playback, include concrete URI if available
        setTimeout(() => {
          const payload = { reason: 'skip_song' };
          if (nextCard && nextCard.uri) {
            payload.uri = nextCard.uri;
            payload.card = {
              id: nextCard.id,
              title: nextCard.title,
              artist: nextCard.artist,
              year: nextCard.year,
              uri: nextCard.uri,
              preview_url: nextCard.preview_url || null,
              album_art: nextCard.album_art || null
            };
          }
          io.to(code).emit('new_song_loaded', payload);
        }, 500);
        break;
        
    }
  });

  // Skip challenge - any player can skip during challenge-window phase
  socket.on('skip_challenge', ({ code }) => {
    const game = games[code];
    if (!game || game.phase !== 'challenge-window') return;
    
    const playerId = socket.id;
    
    // Initialize challenge responses tracking if not exists
    if (!game.challengeResponses) {
      game.challengeResponses = new Set();
    }
    
    // Track that this player has responded (using socket ID is fine here)
    game.challengeResponses.add(playerId);
    
    // PERSISTENT ID FIX: Get current persistent ID from playerOrder
    const currentPersistentId = game.playerOrder[game.currentPlayerIdx];
    // Find eligible challengers by comparing persistent IDs
    const eligibleChallengers = game.players.filter(p => 
      p.persistentId !== currentPersistentId && p.tokens > 0
    ).map(p => p.id); // Return socket IDs for response tracking
    
    // Check if all eligible challengers have responded
    const allResponded = eligibleChallengers.every(id => game.challengeResponses.has(id));
    
    if (allResponded || eligibleChallengers.length === 0) {
      // All eligible players have responded, move to reveal phase
      game.phase = "reveal";
      game.lastPlaced.phase = 'resolved';
      game.challengeResponses = null; // Clear responses
      
      const currentCard = game.sharedDeck[game.currentCardIndex];
      
    // Broadcast reveal state with visual-only timeline (non-committed)
    const currentPersistentIdForReveal = game.playerOrder[game.currentPlayerIdx];
    const revealTimeline = [...game.timelines[currentPersistentIdForReveal]];
    // Insert the placed card visually for reveal only
    // CRITICAL FIX: Check if lastPlaced exists and has a valid index before accessing it
    if (game.lastPlaced && game.lastPlaced.index !== undefined && currentCard) {
      revealTimeline.splice(game.lastPlaced.index, 0, { ...currentCard, preview: true });
    } else {
      console.error('[Backend] ERROR: game.lastPlaced is null or missing index in skip_challenge reveal. Cannot show card placement.', {
        lastPlaced: game.lastPlaced,
        hasCurrentCard: !!currentCard,
        code
      });
    }
    
    updatePlayerScores(game); // scores from committed timelines only

    game.players.forEach((p) => {
      io.to(p.id).emit('game_update', {
        timeline: revealTimeline,
        deck: [currentCard],
        players: game.players,
        phase: "reveal",
        feedback: game.feedback,
        lastPlaced: game.lastPlaced,
        removingId: null,
        currentPlayerIdx: game.currentPlayerIdx,
        currentPlayerId: currentPersistentIdForReveal,
        lastSongGuess: game.lastSongGuess || null,
      });
    });
    } else {
      // Still waiting for other players to respond
      // Broadcast updated challenge window state with progress indicator
      const respondedCount = game.challengeResponses.size;
      const totalEligible = eligibleChallengers.length;
      
// CRITICAL: Include the newly placed card visually while showing challenge progress
      {
        const currentPersistentIdForChallenge = game.playerOrder[game.currentPlayerIdx];
        const originalTimeline = game.timelines[currentPersistentIdForChallenge] || [];
        const displayTimeline = [...originalTimeline];
        const currentCardForDisplay = game.sharedDeck[game.currentCardIndex];
        if (game.lastPlaced && game.lastPlaced.index !== undefined && currentCardForDisplay) {
          displayTimeline.splice(game.lastPlaced.index, 0, { ...currentCardForDisplay, preview: true, challengeCard: true });
        }
        // DEBUG: Log detailed state right before broadcasting challenge-window progress (skip_challenge)
        try {
          console.log('[DEBUG] challenge-window progress (skip_challenge) broadcast', {
            code,
            currentPlayerId,
            lastPlaced: game.lastPlaced,
            currentCard: currentCardForDisplay ? { id: currentCardForDisplay.id, year: currentCardForDisplay.year, title: currentCardForDisplay.title } : null,
            originalTimelineLen: originalTimeline.length,
            displayTimelineLen: displayTimeline.length,
            displayTimelineYears: displayTimeline.map(c => c.year),
            displayTimelineIds: displayTimeline.map(c => c.id),
            respondedCount,
            totalEligible
          });
        } catch (e) {
          console.log('[DEBUG] challenge-window progress (skip_challenge) logging failed', e && e.message);
        }
        game.players.forEach((p) => {
          io.to(p.id).emit('game_update', {
            timeline: displayTimeline,
            deck: [game.sharedDeck[game.currentCardIndex]],
            players: game.players,
            phase: "challenge-window",
            feedback: null,
            lastPlaced: game.lastPlaced,
            removingId: null,
            currentPlayerIdx: game.currentPlayerIdx,
            currentPlayerId: currentPersistentId,  // PERSISTENT ID FIX: Use currentPersistentId which is defined in this handler
            challengeWindow: {
              respondedCount,
              totalEligible,
              waitingFor: eligibleChallengers.filter(id => !game.challengeResponses.has(id))
            }
          });
        });
      }
    }
  });

  // Challenge initiation - any player can challenge during challenge-window phase
  socket.on('initiate_challenge', ({ code }) => {
    const game = games[code];
    if (!game || game.phase !== 'challenge-window') return;
    
    const playerId = socket.id;
    const playerIdx = game.players.findIndex(p => p.id === playerId);
    
    // PERSISTENT ID FIX: Check if player has tokens and is not the current player
    const persistentId = getPersistentId(playerId);
    const currentPersistentId = game.playerOrder[game.currentPlayerIdx];
    if (playerIdx === -1 || game.players[playerIdx].tokens <= 0 || persistentId === currentPersistentId) return;
    
    // Define currentPlayerId for timeline access
    const currentPlayerId = currentPersistentId;
    
    // Check if challenge is already in progress
    if (game.challenge) return;
    
    // Spend token for challenge
    game.players[playerIdx].tokens -= 1;
    
    // Set up challenge state
    game.challenge = {
      challengerId: playerId, // Socket ID (for backwards compatibility)
      challengerPersistentId: persistentId, // Persistent ID for comparisons
      originalPlayerId: currentPlayerId, // This is already a persistent ID
      cardId: game.lastPlaced?.id,
      originalIndex: game.lastPlaced?.index,
      phase: 'challenger-turn'
    };
    game.phase = 'challenge';
    game.lastPlaced.phase = 'challenged';
    
    // Clear challenge responses since we're moving to challenge phase
    game.challengeResponses = null;
    
    // Normalize scores before broadcasting challenge state
    updatePlayerScores(game);

// Broadcast challenge state - challenger places on original player's timeline
    {
      // Build a visual timeline that includes the placed card so challengers see what they're challenging
      const originalTimeline = game.timelines[currentPlayerId] || [];
      const displayTimeline = [...originalTimeline];
      const currentCardForDisplay = game.sharedDeck[game.currentCardIndex];
      if (game.lastPlaced && game.lastPlaced.index !== undefined && currentCardForDisplay) {
        displayTimeline.splice(game.lastPlaced.index, 0, { ...currentCardForDisplay, preview: true, challengeCard: true });
      }

      // DEBUG: Log state sent for challenge phase
      try {
        console.log('[DEBUG] challenge (initiate_challenge) broadcast', {
          code,
          currentPlayerId,
          challengerId: playerId,
          lastPlaced: game.lastPlaced,
          currentCard: currentCardForDisplay ? { id: currentCardForDisplay.id, year: currentCardForDisplay.year, title: currentCardForDisplay.title } : null,
          originalTimelineLen: originalTimeline.length,
          displayTimelineLen: displayTimeline.length,
          displayTimelineYears: displayTimeline.map(c => c.year),
          displayTimelineIds: displayTimeline.map(c => c.id)
        });
      } catch (e) {
        console.log('[DEBUG] challenge (initiate_challenge) logging failed', e && e.message);
      }

      // Keep currentPlayerId as original player's persistent ID
      // Frontend will use challenge.challengerPersistentId to determine who can interact
      
      game.players.forEach((p) => {
        io.to(p.id).emit('game_update', {
          timeline: displayTimeline, // show visual timeline including placed card
          deck: [game.sharedDeck[game.currentCardIndex]], // Same card
          players: game.players,
          phase: "challenge",
          challenge: game.challenge,  // Contains challengerPersistentId for frontend to identify who can place
          feedback: null,
          lastPlaced: game.lastPlaced,
          removingId: null,
          currentPlayerIdx: game.currentPlayerIdx,
          currentPlayerId: currentPlayerId, // Keep as original player's persistent ID
        });
      });
    }
  });

  // Challenge card placement
  socket.on('challenge_place_card', ({ code, index }) => {
    console.log('[CHALLENGE] ===== CHALLENGE PLACE CARD START =====');
    console.log('[CHALLENGE] Received challenge_place_card for code:', code, 'from socket:', socket.id, 'at index:', index);
    const game = games[code];
    if (!game || !game.challenge || game.challenge.phase !== 'challenger-turn') {
      console.log('[CHALLENGE] Invalid challenge_place_card state:', {
        gameExists: !!game,
        challengeExists: !!game?.challenge,
        challengePhase: game?.challenge?.phase
      });
      return;
    }
    
    const playerId = socket.id;
    if (playerId !== game.challenge.challengerId) {
      console.log('[CHALLENGE] Wrong challenger for challenge_place_card:', {
        playerId,
        expectedChallenger: game.challenge.challengerId
      });
      return;
    }
    console.log('[CHALLENGE] Processing challenge_place_card...');
    
    // PERSISTENT ID FIX: Get persistent IDs for timeline access, socket IDs for broadcasts
    const challengerPersistentId = getPersistentId(playerId);
    const originalPersistentId = game.challenge.originalPlayerId;
    const originalTimeline = game.timelines[originalPersistentId] || [];
    const currentCard = game.sharedDeck[game.currentCardIndex];
    
    console.log('[CHALLENGE] Current state:', {
      challengerSocketId: playerId,
      challengerPersistentId,
      originalPersistentId,
      originalTimeline: originalTimeline.map(c => ({ id: c.id, year: c.year })),
      currentCard: { id: currentCard?.id, year: currentCard?.year, title: currentCard?.title },
      originalIndex: game.challenge.originalIndex,
      challengerIndex: index
    });
    
    if (!currentCard) {
      console.log('[CHALLENGE] ERROR: No current card!');
      return;
    }

    // Remove the original placement first
    const timelineWithoutOriginal = originalTimeline.filter(c => c.id !== currentCard.id);
    console.log('[CHALLENGE] Timeline without original:', timelineWithoutOriginal.map(c => ({ id: c.id, year: c.year })));
    
    // CRITICAL FIX: Adjust challenger's index to account for the original card's position
    // The challenger sees a timeline WITH the original card, but we process against timeline WITHOUT it
    let adjustedIndex = index;
    if (index > game.challenge.originalIndex) {
      // If challenger placed after the original card's position, subtract 1 from index
      adjustedIndex = index - 1;
    }
    
    // Place challenger's card in timeline for correctness checking (not committed yet)
    let newTimeline = [...timelineWithoutOriginal];
    newTimeline.splice(adjustedIndex, 0, currentCard);

    // CRITICAL FIX: Check challenger's correctness using proper bounds calculation
    // The challenger sees the timeline WITH the original card and chooses a position
    // We need to validate against the timeline WITHOUT the original card
    let prevYear, nextYear;
    
    // For first round (single card timeline), handle the special case
    if (timelineWithoutOriginal.length === 0) {
      // Empty timeline after removing original - challenger can place anywhere
      prevYear = -Infinity;
      nextYear = Infinity;
    } else if (index === 0) {
      // Challenger chose to place at the very beginning
      prevYear = -Infinity;
      nextYear = timelineWithoutOriginal[0].year;
    } else if (index >= timelineWithoutOriginal.length) {
      // CRITICAL FIX: Use >= instead of > to handle placing at the end correctly
      // Challenger chose to place at or beyond the end of the timeline
      prevYear = timelineWithoutOriginal[timelineWithoutOriginal.length - 1].year;
      nextYear = Infinity;
    } else {
      // Challenger chose to place in the middle
      prevYear = timelineWithoutOriginal[index - 1].year;
      nextYear = timelineWithoutOriginal[index].year;
    }
    
    const challengerCorrect = prevYear <= currentCard.year && currentCard.year <= nextYear;
    
    // Add debug logging to understand what's happening
    console.log('[Backend] Challenge placement debug:', {
      cardYear: currentCard.year,
      challengerIndex: index,
      timelineWithoutOriginal: timelineWithoutOriginal.map(c => c.year),
      timelineLength: timelineWithoutOriginal.length,
      prevYear,
      nextYear,
      challengerCorrect,
      calculation: `${prevYear} <= ${currentCard.year} <= ${nextYear}`
    });
    
    // Get original player's placement result
    const originalCorrect = game.lastPlaced?.correct || false;
    
    // Update challenge state
    game.challenge.challengerIndex = index;
    game.challenge.challengerCorrect = challengerCorrect;
    game.challenge.originalCorrect = originalCorrect;
    game.challenge.phase = 'resolved';
    game.lastPlaced.phase = 'resolved';
    
    // CRITICAL: Update the main game phase to challenge-resolved
    game.phase = 'challenge-resolved';
    
    // VISUAL TIMELINE APPROACH: Create a clean visual representation for the reveal phase
    // This separates the backend correctness logic from the UI display logic
    
    console.log('[CHALLENGE] Building visual timeline for reveal phase');
    console.log('[CHALLENGE] Base timeline:', originalTimeline.map(c => c.year));
    console.log('[CHALLENGE] Card year:', currentCard.year);
    console.log('[CHALLENGE] Original player clicked at visual index:', game.challenge.originalIndex);
    console.log('[CHALLENGE] Challenger clicked at visual index:', index);
    
    // Start with the base timeline that both players saw (WITH the card they were challenging)
    const visualTimelineBase = [...originalTimeline];
    
    // Create marked cards
    const originalDisplayCard = { ...currentCard, originalCard: true, visualPosition: game.challenge.originalIndex };
    const challengerDisplayCard = { ...currentCard, challengerCard: true, visualPosition: index };
    
    // Build visual timeline by inserting both guesses at their clicked positions
    // The key insight: both players saw the SAME timeline when they clicked, so we use those exact indices
    let displayTimeline = [...visualTimelineBase];
    
    // Insert both cards at their visual positions
    // Always insert the lower index first to avoid position shifts
    if (game.challenge.originalIndex <= index) {
      displayTimeline.splice(game.challenge.originalIndex, 0, originalDisplayCard);
      displayTimeline.splice(index + 1, 0, challengerDisplayCard); // +1 because original was inserted first
    } else {
      displayTimeline.splice(index, 0, challengerDisplayCard);
      displayTimeline.splice(game.challenge.originalIndex + 1, 0, originalDisplayCard); // +1 because challenger was inserted first
    }
    
    console.log('[CHALLENGE] Visual timeline for reveal:', displayTimeline.map(c => ({ 
      year: c.year, 
      isOriginal: c.originalCard || false, 
      isChallenger: c.challengerCard || false,
      visualPosition: c.visualPosition
    })));
    console.log('[CHALLENGE] ===== CHALLENGE PLACE CARD END =====');
    
    // Determine challenge outcome and update actual timelines
    let challengeWon = false;
    
    // Add comprehensive debug logging for challenge outcome
    console.log('[Backend] Challenge outcome debug:', {
      challengerCorrect,
      originalCorrect,
      challengerId: playerId,
      originalPersistentId,  // FIXED: Use the correct variable name
      cardYear: currentCard.year,
      cardId: currentCard.id
    });
    
    if (challengerCorrect && !originalCorrect) {
      // Challenger wins - card goes to challenger's timeline in correct chronological position
      challengeWon = true;
      console.log('[Backend] Challenge outcome: Challenger wins (challenger correct, original wrong)');
      const challengerTimeline = game.timelines[challengerPersistentId] || [];
      
      // Find correct position in challenger's timeline
      let insertIndex = challengerTimeline.length;
      for (let i = 0; i < challengerTimeline.length; i++) {
        if (currentCard.year < challengerTimeline[i].year) {
          insertIndex = i;
          break;
        }
      }
      
      // Insert card at correct position
      const newChallengerTimeline = [...challengerTimeline];
      newChallengerTimeline.splice(insertIndex, 0, currentCard);
      game.timelines[challengerPersistentId] = newChallengerTimeline;
      game.timelines[originalPersistentId] = timelineWithoutOriginal; // Remove from original
      game.players[game.players.findIndex(p => p.id === playerId)].score += 1;
    } else if (!challengerCorrect && originalCorrect) {
      // Original player wins - keep original placement
      challengeWon = false;
      console.log('[Backend] Challenge outcome: Original player wins (challenger wrong, original correct)');
      // PERSISTENT ID FIX: Use persistent ID for timeline access
      game.timelines[originalPersistentId].splice(game.challenge.originalIndex, 0, currentCard);
    } else if (challengerCorrect && originalCorrect) {
      // Both correct - original player keeps it (went first)
      challengeWon = false;
      console.log('[Backend] Challenge outcome: Both correct, original player keeps card');
      // PERSISTENT ID FIX: Use persistent ID for timeline access
      game.timelines[originalPersistentId].splice(game.challenge.originalIndex, 0, currentCard);
    } else {
      // CRITICAL FIX: Both wrong - nobody gets the card, remove from all timelines
      challengeWon = false;
      console.log('[Backend] Challenge outcome: Both wrong, nobody gets the card');
      game.timelines[originalPersistentId] = timelineWithoutOriginal; // Remove from original
      // PERSISTENT ID FIX: Ensure card is not in challenger's timeline either
      game.timelines[challengerPersistentId] = (game.timelines[challengerPersistentId] || []).filter(c => c.id !== currentCard.id);
    }
    
    // Set challenge result
    game.challenge.result = {
      challengerCorrect,
      originalCorrect,
      challengeWon,
      challengerPlacement: { index, correct: challengerCorrect }
    };
    
    // Normalize scores after challenge resolution before broadcasting
    updatePlayerScores(game);

    // Broadcast challenge result with display timeline showing both cards
    // Mark cards with player-specific ownership for UI labels
    // PERSISTENT ID FIX: Get socket ID from persistent ID for player comparison
    const originalSocketId = getSocketId(originalPersistentId);
    
    game.players.forEach((p) => {
      // Create a player-specific timeline where each card knows if it belongs to this player
      const playerSpecificTimeline = displayTimeline.map(card => {
        const cardCopy = { ...card };
        
        // Mark which card is "yours" for this specific player
        if (card.originalCard && p.id === originalSocketId) {
          cardCopy.isYourGuess = true;
        } else if (card.challengerCard && p.id === playerId) {
          cardCopy.isYourGuess = true;
        }
        
        return cardCopy;
      });
      
      io.to(p.id).emit('game_update', {
        timeline: playerSpecificTimeline, // Show both cards with ownership markers
        deck: [currentCard],
        players: game.players,
        phase: "challenge-resolved",
        challenge: game.challenge,
        feedback: game.feedback,
        lastPlaced: game.lastPlaced,
        removingId: null,
        currentPlayerIdx: game.currentPlayerIdx,
        currentPlayerId: originalPersistentId,  // PERSISTENT ID FIX: Use persistent ID
        lastSongGuess: game.lastSongGuess || null,
      });
    });
  });

  // Helper function to update all player scores to match their timeline lengths
  const updatePlayerScores = (game) => {
    game.players.forEach((player) => {
      // PERSISTENT ID FIX: Use persistent ID to access timelines
      const persistentId = player.persistentId;
      const timelineLength = (game.timelines[persistentId] || []).length;
      player.score = timelineLength;
    });
  };

  // Helper function to check if game should end and determine winner
  const checkGameEnd = (game) => {
    const target = Number.isFinite(game.winCondition) ? game.winCondition : 10;

    // Build score snapshot for robust logging and evaluation
    const scores = game.players.map(p => ({ id: p.id, name: p.name, score: p.score }));
    const maxScore = Math.max(...scores.map(s => s.score));
    const playersWithMaxScore = scores.filter(s => s.score === maxScore);

    // We only consider end-of-round after advanceTurn (i.e., when currentPlayerIdx wrapped to 0)
    const isEndOfRound = game.currentPlayerIdx === 0;

    console.log('[WinCheck]', {
      target,
      currentPlayerIdx: game.currentPlayerIdx,
      isEndOfRound,
      scores,
      maxScore,
      leaders: playersWithMaxScore.map(p => ({ name: p.name, score: p.score }))
    });

    // Declare winner ONLY at end-of-round when there is a strict leader at/above target
    if (maxScore >= target && isEndOfRound) {
      if (playersWithMaxScore.length === 1) {
        const winnerId = playersWithMaxScore[0].id;
        const winnerPlayer = game.players.find(p => p.id === winnerId) || game.players.find(p => p.score === maxScore) || null;
        game.phase = "game-over";
        game.winner = winnerPlayer;
        console.log('[WinCheck] Winner decided at end-of-round:', { winner: game.winner?.name, score: maxScore });
        
        // Record game completion for analytics
        const roomCode = Object.keys(games).find(code => games[code] === game);
        if (roomCode) {
          analytics.recordSessionEnd({
            roomCode,
            winnerName: winnerPlayer?.name,
            completedNormally: true
          });
        }
        
        return true;
      }
      // Tie at/above target at end-of-round -> keep playing further rounds until a leader exists
      console.log('[WinCheck] Tie at/above target at end-of-round. Continue.');
    }

    // Deck exhaustion fallback: end immediately and select highest score
    if (game.currentCardIndex >= game.sharedDeck.length) {
      const endMax = Math.max(...game.players.map(p => p.score));
      const winners = game.players.filter(p => p.score === endMax);
      game.phase = "game-over";
      game.winner = winners[0] || null;
      console.log('[WinCheck] Deck exhausted. Winner:', game.winner?.name, 'score:', endMax);
      
      // Record game completion for analytics
      const roomCode = Object.keys(games).find(code => games[code] === game);
      if (roomCode) {
        analytics.recordSessionEnd({
          roomCode,
          winnerName: game.winner?.name,
          completedNormally: true
        });
      }
      
      return true;
    }

    return false;
  };

  // Handle challengerId update after reconnection
  socket.on('update_challenger_id', ({ code, oldChallengerId, newChallengerId }) => {
    console.log('[Backend] Received update_challenger_id:', { code, oldChallengerId, newChallengerId });
    
    const game = games[code];
    if (!game || !game.challenge) {
      console.log('[Backend] No game or challenge found for update_challenger_id');
      return;
    }
    
    // Update the challengerId if it matches the old ID
    if (game.challenge.challengerId === oldChallengerId) {
      console.log('[Backend] Updating challengerId from', oldChallengerId, 'to', newChallengerId);
      game.challenge.challengerId = newChallengerId;
      
      // Also update currentPlayerId if in challenge phase
      if (game.phase === 'challenge') {
        const currentPlayerId = game.playerOrder[game.currentPlayerIdx];
        
        // Broadcast updated state to all players
        const currentCard = game.sharedDeck[game.currentCardIndex];
        const originalTimeline = game.timelines[game.challenge.originalPlayerId] || [];
        const displayTimeline = [...originalTimeline];
        if (game.lastPlaced && game.lastPlaced.index !== undefined && currentCard) {
          displayTimeline.splice(game.lastPlaced.index, 0, { ...currentCard, preview: true, challengeCard: true });
        }
        
        game.players.forEach((p) => {
          io.to(p.id).emit('game_update', {
            timeline: displayTimeline,
            deck: [currentCard],
            players: game.players,
            phase: "challenge",
            challenge: game.challenge,
            feedback: null,
            lastPlaced: game.lastPlaced,
            removingId: null,
            currentPlayerIdx: game.currentPlayerIdx,
            currentPlayerId: newChallengerId, // Updated to new challenger ID
          });
        });
      }
    } else {
      console.log('[Backend] ChallengerId mismatch, not updating:', {
        current: game.challenge.challengerId,
        expected: oldChallengerId
      });
    }
  });

  // Continue after challenge resolution - anyone can continue
  socket.on('continue_after_challenge', ({ code }) => {
    console.log('[Backend] Received continue_after_challenge for code:', code, 'from socket:', socket.id);
    console.log('[Backend] Socket rooms:', Array.from(socket.rooms));
    
    // Force rejoin the room if not already in it
    if (!socket.rooms.has(code)) {
      console.log('[Backend] Socket not in room, rejoining:', code);
      socket.join(code);
    }
    
    const game = games[code];
    if (!game) {
      console.log('[Backend] No game found for continue_after_challenge, code:', code);
      console.log('[Backend] Available games:', Object.keys(games));
      return;
    }
    if (game.phase !== 'challenge-resolved') {
      console.log('[Backend] Wrong phase for continue_after_challenge, current phase:', game.phase);
      console.log('[Backend] Expected phase: challenge-resolved');
      return;
    }
    console.log('[Backend] Processing continue_after_challenge...');
    
    // Emit music stop event to all players (creator will handle it)
    io.to(code).emit('stop_music', { reason: 'continue_to_next_turn' });
    
    // Update all player scores to match their timeline lengths
    updatePlayerScores(game);
    
    // Emit new song loaded event for automatic playback, include concrete URI if available
    setTimeout(() => {
      emitNewSongLoaded(io, code, game, 'next_turn');
    }, 400);
    
    // CRITICAL FIX: Use unified advanceTurn function for challenge resolution
    game.challenge = null;
    game.feedback = null;
    game.lastPlaced = null;
    
    if (!advanceTurn(game, code)) {
      // Game should end
      game.phase = "game-over";
      const maxScore = Math.max(...game.players.map(p => p.score));
      const winners = game.players.filter(p => p.score === maxScore);
      game.winner = winners[0];
      
      game.players.forEach((p) => {
        io.to(p.id).emit('game_update', {
          timeline: game.timelines[game.winner?.id] || [],
          deck: [],
          players: game.players,
          phase: "game-over",
          feedback: null,
          lastPlaced: null,
          removingId: null,
          currentPlayerIdx: game.currentPlayerIdx,
          currentPlayerId: null,
          winner: game.winner,
        });
      });
      return;
    }
    
    // Check if game should end with new win condition logic
    if (checkGameEnd(game)) {
      // Game has ended, broadcast final state
      game.players.forEach((p, idx) => {
        io.to(p.id).emit('game_update', {
          timeline: game.timelines[game.winner?.id] || [],
          deck: [],
          players: game.players,
          phase: game.phase,
          feedback: null,
          lastPlaced: null,
          removingId: null,
          currentPlayerIdx: game.currentPlayerIdx,
          currentPlayerId: null,
          winner: game.winner,
        });
      });
      return;
    }
    
    const nextPlayerId = game.playerOrder[game.currentPlayerIdx];
    const nextCard = game.sharedDeck[game.currentCardIndex];
    
    // Normalize scores before broadcasting next turn
    updatePlayerScores(game);

    // Broadcast next turn
    game.players.forEach((p) => {
      io.to(p.id).emit('game_update', {
        timeline: game.timelines[nextPlayerId],
        deck: [nextCard],
        players: game.players,
        phase: "player-turn",
        challenge: null,
        feedback: null,
        lastPlaced: null,
        removingId: null,
        currentPlayerIdx: game.currentPlayerIdx,
        currentPlayerId: nextPlayerId,
      });
    });
  });

  // Levenshtein distance function for fuzzy matching
  const levenshteinDistance = (str1, str2) => {
    if (!str1 || !str2) return Math.max(str1?.length || 0, str2?.length || 0);
    
    const matrix = [];
    
    // Initialize first row and column
    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }
    
    // Fill the matrix
    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1, // substitution
            matrix[i][j - 1] + 1,     // insertion
            matrix[i - 1][j] + 1      // deletion
          );
        }
      }
    }
    
    return matrix[str2.length][str1.length];
  };

  // Helper function to check if two strings are fuzzy matches
  const isFuzzyMatch = (str1, str2) => {
    if (!str1 || !str2) return false;
    
    const distance = levenshteinDistance(str1, str2);
    const maxLength = Math.max(str1.length, str2.length);
    
    // Allow more errors for longer strings
    let threshold;
    if (maxLength <= 4) {
      threshold = 1; // Very short words: allow 1 error
    } else if (maxLength <= 8) {
      threshold = 2; // Medium words: allow 2 errors
    } else {
      threshold = Math.min(3, Math.floor(maxLength * 0.25)); // Longer words: allow up to 25% errors, max 3
    }
    
    return distance <= threshold;
  };

  // Helper function to check if any variants match (exact or fuzzy)
  const checkVariantMatch = (guessVariants, actualVariants, allowFuzzy = true) => {
    // First try exact matches
    const exactMatch = guessVariants.some(guessVariant => 
      actualVariants.some(actualVariant => guessVariant === actualVariant)
    );
    
    if (exactMatch) return { match: true, type: 'exact' };
    
    // If no exact match and fuzzy is allowed, try fuzzy matching
    if (allowFuzzy) {
      const fuzzyMatch = guessVariants.some(guessVariant => 
        actualVariants.some(actualVariant => isFuzzyMatch(guessVariant, actualVariant))
      );
      
      if (fuzzyMatch) return { match: true, type: 'fuzzy' };
    }
    
    return { match: false, type: 'none' };
  };

  // Helper function to normalize text for comparison
  const normalizeText = (text) => {
    if (!text) return '';
    
    return text
      .toLowerCase()
      .trim()
      // Normalize accented characters
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      // Handle apostrophes and quotes - normalize all to standard apostrophe
      .replace(/[''`]/g, "'")
      .replace(/[""]/g, '"')
    // Handle common abbreviations and symbols BEFORE removing punctuation
    .replace(/\s*&\s*/g, ' and ')
      .replace(/\bw\//g, 'with')
      .replace(/\bst\./g, 'saint')
      .replace(/\bdr\./g, 'doctor')
      .replace(/\bmr\./g, 'mister')
      .replace(/\bms\./g, 'miss')
      // Handle number-word equivalents
      .replace(/\b2\b/g, 'two')
      .replace(/\b4\b/g, 'four')
      .replace(/\b8\b/g, 'eight')
      .replace(/\btwo\b/g, '2')
      .replace(/\bfour\b/g, '4')
      .replace(/\beight\b/g, '8')
      // Remove articles at the beginning
      .replace(/^(the|a|an)\s+/i, '')
      // Remove most punctuation but keep apostrophes in contractions
      .replace(/[^\w\s']/g, ' ')
      // Normalize apostrophes in contractions (remove spaces around them)
      .replace(/\s*'\s*/g, '')
      // Remove extra whitespace
      .replace(/\s+/g, ' ')
      .trim();
  };

  // Helper function to extract alternative titles from parentheses
  const extractAlternativeTitles = (title) => {
    if (!title) return [];
    
    const alternatives = [];
    
    // Extract main title (before parentheses)
    const mainTitle = title.replace(/\s*\([^)]*\)/g, '').trim();
    if (mainTitle) {
      alternatives.push(mainTitle);
    }
    
    // Extract content from parentheses
    const parenthesesMatches = title.match(/\(([^)]+)\)/g);
    if (parenthesesMatches) {
      parenthesesMatches.forEach(match => {
        const content = match.replace(/[()]/g, '').trim();
        if (content) {
          alternatives.push(content);
        }
      });
    }
    
    return alternatives;
  };

  // Enhanced function to normalize song titles for comparison
  const normalizeSongTitle = (title) => {
    if (!title) return [];
    
    const alternatives = extractAlternativeTitles(title);
    const normalizedAlternatives = [];
    
    // If no alternatives found, use the original title
    if (alternatives.length === 0) {
      alternatives.push(title);
    }
    
    alternatives.forEach(alt => {
      let normalized = normalizeText(alt);
      
      // Remove common version indicators but be more selective
      normalized = normalized
        .replace(/\s*(radio edit|album version|single version|extended|acoustic|live|demo|instrumental)\s*.*$/i, '')
        .replace(/\s*(feat\.?|ft\.?|featuring)\s+.*$/i, '')
        .replace(/\s*[-–—]\s*.*$/, '')
        .replace(/\s+/g, ' ')
        .trim();
      
      // Don't filter out "remaster/remastered" from parenthetical content as it might be the alternative title
      if (!alt.toLowerCase().includes('remaster')) {
        normalized = normalized.replace(/\s*(remaster|remastered)\s*.*$/i, '');
      }
      
      if (normalized) {
        normalizedAlternatives.push(normalized);
      }
    });
    
    // Remove duplicates
    return [...new Set(normalizedAlternatives)];
  };

  // Enhanced function to normalize artist names for comparison
  const normalizeArtistName = (artist) => {
    if (!artist) return [];
    
    const alternatives = [artist];
    const normalizedAlternatives = [];
    
    alternatives.forEach(alt => {
      let normalized = normalizeText(alt);
      
      // Remove featuring artists
      normalized = normalized
        .replace(/\s*(feat\.?|ft\.?|featuring)\s+.*$/i, '')
        .replace(/\s+/g, ' ')
        .trim();
      
      if (normalized) {
        normalizedAlternatives.push(normalized);
      }
    });
    
    // Remove duplicates
    return [...new Set(normalizedAlternatives)];
  };

  // Song guess - only current player during song-guess phase
  socket.on('guess_song', ({ code, title, artist }) => {
    const game = games[code];
    if (!game || game.phase !== 'song-guess') return;
    
    const playerId = socket.id;
    // PERSISTENT ID FIX: Get persistent IDs for comparison
    const persistentId = getPersistentId(playerId);
    const currentPersistentId = game.playerOrder[game.currentPlayerIdx];
    if (persistentId !== currentPersistentId) return; // Only current player can guess
    
    // Define currentPlayerId for timeline access
    const currentPlayerId = currentPersistentId;
    
    const currentCard = game.sharedDeck[game.currentCardIndex];
    if (!currentCard) return;
    
    // Check if guess is correct using enhanced normalized comparison with fuzzy matching
    const normalizedGuessTitle = normalizeSongTitle(title);
    const normalizedActualTitle = normalizeSongTitle(currentCard.title);
    const normalizedGuessArtist = normalizeArtistName(artist);
    const normalizedActualArtist = normalizeArtistName(currentCard.artist);
    
    // Check title match (exact or fuzzy)
    const titleMatch = checkVariantMatch(normalizedGuessTitle, normalizedActualTitle, true);
    
    // Check artist match (exact or fuzzy)
    const artistMatch = checkVariantMatch(normalizedGuessArtist, normalizedActualArtist, true);
    
    const titleCorrect = titleMatch.match;
    const artistCorrect = artistMatch.match;
    const bothCorrect = titleCorrect && artistCorrect;
    
    console.log('[Song Guess] Enhanced comparison debug with fuzzy matching:', {
      originalTitle: currentCard.title,
      normalizedActualTitle,
      guessTitle: title,
      normalizedGuessTitle,
      titleCorrect: `${titleCorrect} (${titleMatch.type})`,
      originalArtist: currentCard.artist,
      normalizedActualArtist,
      guessArtist: artist,
      normalizedGuessArtist,
      artistCorrect: `${artistCorrect} (${artistMatch.type})`,
      bothCorrect
    });
    
    // Store the song guess for deferred reveal at end of round
    const playerObj = game.players.find(pl => pl.id === playerId);
    const tokensEarned = bothCorrect ? (playerObj?.doublePoints ? 2 : 1) : 0;
    game.lastSongGuess = {
      playerId,
      playerName: playerObj?.name,
      guessTitle: title,
      guessArtist: artist,
      correct: bothCorrect,
      titleCorrect,
      artistCorrect,
      tokensEarned
    };

    if (bothCorrect) {
      // Award bonus tokens
      const playerIdx = game.players.findIndex(p => p.id === playerId);
      if (playerIdx !== -1) {
        const bonusTokens = game.players[playerIdx].doublePoints ? 2 : 1;
        game.players[playerIdx].bonusTokens += bonusTokens;
        game.players[playerIdx].tokens += bonusTokens;
        game.players[playerIdx].doublePoints = false; // Reset double points
      }
    }

    // Move to challenge window after song guess
    game.phase = "challenge-window";
    
    // Normalize scores before broadcasting challenge window
    updatePlayerScores(game);

// CRITICAL: Include the newly placed card visually during the challenge window
    {
      const originalTimeline = game.timelines[currentPlayerId] || [];
      const displayTimeline = [...originalTimeline];
      if (game.lastPlaced && game.lastPlaced.index !== undefined) {
        displayTimeline.splice(game.lastPlaced.index, 0, { ...currentCard, preview: true, challengeCard: true });
      }
      // DEBUG: Log detailed state right before broadcasting challenge-window
      try {
        console.log('[DEBUG] challenge-window (guess_song) broadcast', {
          code,
          currentPlayerId,
          lastPlaced: game.lastPlaced,
          currentCard: { id: currentCard?.id, year: currentCard?.year, title: currentCard?.title },
          originalTimelineLen: originalTimeline.length,
          displayTimelineLen: displayTimeline.length,
          displayTimelineYears: displayTimeline.map(c => c.year),
          displayTimelineIds: displayTimeline.map(c => c.id)
        });
      } catch (e) {
        console.log('[DEBUG] challenge-window (guess_song) logging failed', e && e.message);
      }
      game.players.forEach((p) => {
        io.to(p.id).emit('game_update', {
          timeline: displayTimeline,
          deck: [currentCard],
          players: game.players,
          phase: "challenge-window",
          feedback: null,
          lastPlaced: game.lastPlaced,
          removingId: null,
          currentPlayerIdx: game.currentPlayerIdx,
          currentPlayerId: currentPlayerId,
        });
      });
    }
    
    // Broadcast "submitted" notification only (result deferred to reveal phase)
    game.players.forEach((p) => {
      io.to(p.id).emit('song_guess_result', {
        playerId,
        playerName: game.players.find(pl => pl.id === playerId)?.name,
        submitted: true
      });
    });
  });

  // Skip song guess - only current player during song-guess phase
  socket.on('skip_song_guess', ({ code }) => {
    const game = games[code];
    if (!game || game.phase !== 'song-guess') return;
    
    const playerId = socket.id;
    // PERSISTENT ID FIX: Get persistent IDs for comparison
    const persistentId = getPersistentId(playerId);
    const currentPersistentId = game.playerOrder[game.currentPlayerIdx];
    if (persistentId !== currentPersistentId) return; // Only current player can skip
    
    // Define currentPlayerId for timeline access
    const currentPlayerId = currentPersistentId;
    
    // Move to challenge window after skipping song guess
    game.phase = "challenge-window";
    
    const currentCard = game.sharedDeck[game.currentCardIndex];
    
    // Normalize scores before broadcasting challenge window
    updatePlayerScores(game);

// CRITICAL: Include the newly placed card visually during the challenge window
    {
      const originalTimeline = game.timelines[currentPlayerId] || [];
      const displayTimeline = [...originalTimeline];
      if (game.lastPlaced && game.lastPlaced.index !== undefined) {
        displayTimeline.splice(game.lastPlaced.index, 0, { ...currentCard, preview: true, challengeCard: true });
      }
      // DEBUG: Log detailed state right before broadcasting challenge-window (skip_song_guess)
      try {
        console.log('[DEBUG] challenge-window (skip_song_guess) broadcast', {
          code,
          currentPlayerId,
          lastPlaced: game.lastPlaced,
          currentCard: { id: currentCard?.id, year: currentCard?.year, title: currentCard?.title },
          originalTimelineLen: originalTimeline.length,
          displayTimelineLen: displayTimeline.length,
          displayTimelineYears: displayTimeline.map(c => c.year),
          displayTimelineIds: displayTimeline.map(c => c.id)
        });
      } catch (e) {
        console.log('[DEBUG] challenge-window (skip_song_guess) logging failed', e && e.message);
      }
      game.players.forEach((p) => {
        io.to(p.id).emit('game_update', {
          timeline: displayTimeline,
          deck: [currentCard],
          players: game.players,
          phase: "challenge-window",
          feedback: null,
          lastPlaced: game.lastPlaced,
          removingId: null,
          currentPlayerIdx: game.currentPlayerIdx,
          currentPlayerId: currentPlayerId,
        });
      });
    }
  });

  // Use Beatably card
  socket.on('use_beatably_card', ({ code, cardId, targetPlayerId }) => {
    const game = games[code];
    if (!game) return;
    
    const playerId = socket.id;
    const playerIdx = game.players.findIndex(p => p.id === playerId);
    if (playerIdx === -1) return;
    
    const cardIdx = game.players[playerIdx].beatablyCards.findIndex(c => c.id === cardId);
    if (cardIdx === -1) return;
    
    const card = game.players[playerIdx].beatablyCards[cardIdx];

    // Remove card from player's hand
    game.players[playerIdx].beatablyCards.splice(cardIdx, 1);
    
    // Execute card action
    switch (card.action) {
      case 'extra_turn':
        // Player gets another turn after this one
        // Implementation: don't advance currentPlayerIdx in next continue_game
        game.extraTurn = playerId;
        break;
        
      case 'steal_token':
        if (targetPlayerId) {
          const targetIdx = game.players.findIndex(p => p.id === targetPlayerId);
          if (targetIdx !== -1 && game.players[targetIdx].tokens > 0) {
            game.players[targetIdx].tokens -= 1;
            game.players[playerIdx].tokens += 1;
          }
        }
        break;
        
      case 'bonus_token':
        game.players[playerIdx].tokens += 1;
        break;
        
      case 'skip_challenge':
        game.players[playerIdx].skipChallenge = true;
        break;
        
      case 'double_points':
        game.players[playerIdx].doublePoints = true;
        break;
    }
    
    // Broadcast update
    const currentPlayerId = game.playerOrder[game.currentPlayerIdx];
    const currentCard = game.sharedDeck[game.currentCardIndex];
    
    game.players.forEach((p) => {
      io.to(p.id).emit('game_update', {
        timeline: game.timelines[currentPlayerId],
        deck: [currentCard],
        players: game.players,
        phase: game.phase,
        feedback: game.feedback,
        lastPlaced: game.lastPlaced,
        removingId: game.removingId,
        currentPlayerIdx: game.currentPlayerIdx,
        currentPlayerId: currentPlayerId,
      });
    });
  });

  // Handle progress updates from creator
  socket.on('progress_update', ({ code, progress, duration, isPlaying }) => {
    const game = games[code];
    if (!game) return;
    
    // Only allow creator to send progress updates
    const player = game.players.find(p => p.id === socket.id);
    if (!player || !player.isCreator) return;
    
    // Broadcast progress to all other players
    socket.to(code).emit('progress_sync', {
      progress,
      duration,
      isPlaying
    });
  });

  // Handle new song requests from guests
  socket.on('request_new_song', ({ code, playerName }) => {
    const game = games[code];
    if (!game) return;
    
    // Find the creator and send them the request
    const creator = game.players.find(p => p.isCreator);
    if (creator) {
      io.to(creator.id).emit('new_song_request', {
        playerId: socket.id,
        playerName: playerName || 'A player'
      });
    }
  });

  // Test event to check connectivity
  socket.on('test_event', (data) => {
    console.log('[Backend] Received test_event:', data, 'from socket:', socket.id);
    console.log('[Backend] Socket rooms for test_event:', Array.from(socket.rooms));
  });

  // Add a catch-all event listener to see what events are being received
  socket.onAny((eventName, ...args) => {
    if (!['connect', 'disconnect', 'lobby_update', 'game_update', 'game_started'].includes(eventName)) {
      console.log('[Backend] Received event:', eventName, 'from socket:', socket.id, 'args:', args);
      console.log('[Backend] Current socket rooms:', Array.from(socket.rooms));
      console.log('[Backend] Available lobbies:', Object.keys(lobbies));
      console.log('[Backend] Available games:', Object.keys(games));
    }
    // Persist state periodically after events (safe even if event was read-only)
    try { schedulePersist(); } catch (e) { /* ignore */ }
  });

  // Log socket connection details
  console.log('[Backend] Socket connected:', socket.id, 'rooms:', Array.from(socket.rooms));

  socket.on('disconnect', () => {
    console.log('[Disconnect] User disconnected:', socket.id);
    
    // Remove player from any lobbies they were in
    for (const code in lobbies) {
      const lobby = lobbies[code];
      const wasInLobby = lobby.players.some(p => p.id === socket.id);
      if (wasInLobby) {
        // Skip if the lobby is already being cleaned up by leave_lobby handler
        if (lobby._ending) {
          console.log('[Disconnect] Skipping lobby', code, '- already being cleaned up by leave_lobby');
          continue;
        }
        
        const leavingPlayer = lobby.players.find(p => p.id === socket.id);
        const isCreatorLeaving = leavingPlayer && leavingPlayer.isCreator;
        
        // Check if there's an active game for this lobby
        const hasActiveGame = games[code];
        
        if (hasActiveGame && isCreatorLeaving) {
          // CRITICAL FIX: Don't immediately clean up games OR notify when host disconnects
          // Instead, give them time to reconnect (e.g., during page refresh)
          console.log('[Disconnect] Host disconnected from active game, allowing reconnection window');
          
          // Set a SHORT timeout before notifying other players
          // This handles quick refreshes without kicking everyone out
          setTimeout(() => {
            // Check if the host has reconnected
            const hostSession = Object.values(playerSessions).find(session => 
              session.roomCode === code && 
              session.playerName === leavingPlayer.name && 
              session.isCreator
            );
            
            if (!hostSession) {
              // Host hasn't reconnected after grace period, notify and clean up
              console.log('[Disconnect] Host did not reconnect, cleaning up game:', code);
              if (games[code]) {
                io.to(code).emit('host_left', {
                  message: 'The host has left the game. You will be returned to the lobby.',
                  hostName: leavingPlayer.name
                });
                delete games[code];
              }
              if (lobbies[code]) {
                delete lobbies[code];
              }
              schedulePersist();
            } else {
              console.log('[Disconnect] Host reconnected, keeping game alive:', code);
            }
          }, 5000); // 5 second grace period for reconnection
        } else if (isCreatorLeaving) {
          // Handle normal lobby disconnections (no active game)
          console.log('[Disconnect] Host disconnected from lobby (no active game), allowing reconnection window');
          
          // CRITICAL FIX: Give host time to reconnect before notifying others
          setTimeout(() => {
            // Check if the host has reconnected
            const hostSession = Object.values(playerSessions).find(session => 
              session.roomCode === code && 
              session.playerName === leavingPlayer.name && 
              session.isCreator
            );
            
            if (!hostSession && lobbies[code]) {
              // Host hasn't reconnected, remove them and notify
              const currentLobby = lobbies[code];
              currentLobby.players = currentLobby.players.filter(p => p.name !== leavingPlayer.name);
              
              if (currentLobby.players.length > 0) {
                // Notify remaining players that host has left
                io.to(code).emit('host_left', {
                  message: 'The host has left the game. You will be returned to the lobby.',
                  hostName: leavingPlayer.name
                });
                
                // Clean up the lobby after notification
                setTimeout(() => {
                  delete lobbies[code];
                  schedulePersist();
                }, 1000);
              } else {
                // No players left
                delete lobbies[code];
                schedulePersist();
              }
            } else {
              console.log('[Disconnect] Host reconnected to lobby:', code);
            }
          }, 5000); // 5 second grace period for reconnection
        } else if (lobby.players.length === 0) {
          delete lobbies[code];
          schedulePersist();
        } else {
          io.to(code).emit('lobby_update', lobby);
          schedulePersist();
        }
      }
    }
    
    // Handle game disconnections for non-host players
    for (const code in games) {
      const game = games[code];
      const wasInGame = game.players.some(p => p.id === socket.id);
      if (wasInGame) {
        const leavingPlayer = game.players.find(p => p.id === socket.id);
        const isCreatorLeaving = leavingPlayer && leavingPlayer.isCreator;
        
        if (!isCreatorLeaving) {
          // Non-host player disconnected from game
          console.log('[Disconnect] Non-host player disconnected from game:', leavingPlayer.name);
          // Don't clean up the game, just log it - they can reconnect
        } else if (game.players.length === 1) {
          // Last player left, clean up immediately
          console.log('[Disconnect] Last player left game, cleaning up:', code);
          delete games[code];
          delete lobbies[code];
          schedulePersist();
        }
        // Note: Host disconnections are handled above in the lobby section
      }
    }
  });
});

app.get('/', (req, res) => {
  res.send('Beatably backend running');
});

/**
 * Feature flags endpoint
 * Returns server-side feature flags so the frontend can reflect defaults (e.g. CHART_MODE_ENABLE).
 */
app.get('/api/feature-flags', (req, res) => {
  try {
    res.json({ featureFlags: config.featureFlags || {} });
  } catch (e) {
    res.status(500).json({ error: 'Failed to read feature flags', message: e.message });
  }
});

/**
 * Local network discovery endpoints and background scanner
 * - GET /api/local-devices : on-demand discovery (runs a scan)
 * - GET /api/local-devices/stream : Server-Sent Events pushing periodic device lists
 * - POST /api/wake-device : best-effort "wake" attempt (TCP probe to common ports)
 *
 * Notes:
 * - Discovery runs on the backend host and can only see devices on the same LAN.
 * - SSE stream pushes the latest cached scan results.
 */

// In-memory cache for discovered devices and SSE clients
let localDevicesCache = [];
let lastLocalDevicesScanAt = null;
const sseClients = new Set();

// Helper: push update to connected SSE clients
function pushLocalDevicesToSse() {
  const payload = JSON.stringify({ devices: localDevicesCache, timestamp: new Date().toISOString() });
  sseClients.forEach(res => {
    try {
      res.write(`data: ${payload}\n\n`);
    } catch (e) {
      // ignore broken clients; they'll be cleaned up on error
    }
  });
}

// On-demand discovery (runs a scan)
app.get('/api/local-devices', async (req, res) => {
  try {
    const timeoutMs = Number(req.query.timeout) || 3000;
    const devices = await discovery.discoverLocalDevices(timeoutMs);
    // Update cache
    localDevicesCache = devices;
    lastLocalDevicesScanAt = Date.now();
    // Push to SSE clients
    pushLocalDevicesToSse();
    res.json({ ok: true, devices, timestamp: new Date().toISOString() });
  } catch (e) {
    console.error('[LocalDiscovery] Error:', e && e.message);
    res.status(500).json({ ok: false, error: e?.message || 'Discovery failed' });
  }
});

// SSE stream for continuous updates
app.get('/api/local-devices/stream', (req, res) => {
  // Set headers for SSE
  res.writeHead(200, {
    Connection: 'keep-alive',
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Access-Control-Allow-Origin': corsOptions.origin
  });
  res.write('\n');

  // Send initial payload immediately if we have cache
  if (localDevicesCache && localDevicesCache.length) {
    const payload = JSON.stringify({ devices: localDevicesCache, timestamp: new Date().toISOString() });
    res.write(`data: ${payload}\n\n`);
  }

  // Track client
  sseClients.add(res);
  req.on('close', () => {
    sseClients.delete(res);
  });
});

// POST /api/wake-device - best-effort probe to a device IP/host
const net = require('net');

app.post('/api/wake-device', express.json(), async (req, res) => {
  try {
    const { ip, ports } = req.body || {};
    if (!ip) {
      return res.status(400).json({ ok: false, error: 'Missing ip in body' });
    }

    const probePorts = Array.isArray(ports) && ports.length ? ports : [8009, 1900, 8008, 8000, 5353]; // common cast/ssdp/http/mdns ports

    let success = false;
    const results = [];

    // Try TCP connect attempts with short timeout
    for (const port of probePorts) {
      /* eslint-disable no-await-in-loop */
      try {
        const ok = await new Promise((resolve) => {
          const socket = new net.Socket();
          let done = false;
          socket.setTimeout(1200);
          socket.on('connect', () => {
            done = true;
            socket.destroy();
            resolve(true);
          });
          socket.on('error', () => {
            if (!done) { done = true; resolve(false); }
          });
          socket.on('timeout', () => {
            if (!done) { done = true; socket.destroy(); resolve(false); }
          });
          socket.connect(port, ip);
        });
        results.push({ port, ok });
        if (ok) {
          success = true;
          // continue probing other ports for richer diagnostics
        }
      } catch (e) {
        results.push({ port, ok: false, err: e.message });
      }
      /* eslint-enable no-await-in-loop */
    }

    res.json({ ok: success, results, timestamp: new Date().toISOString() });
  } catch (e) {
    console.error('[WakeDevice] Error:', e && e.message);
    res.status(500).json({ ok: false, error: e?.message || 'Wake failed' });
  }
});

// Background periodic scan to refresh localDevicesCache every N seconds (if running in LAN)
const LOCAL_DISCOVERY_POLL_MS = Number(process.env.LOCAL_DISCOVERY_POLL_MS) || 15000;
setInterval(async () => {
  try {
    const devices = await discovery.discoverLocalDevices(3000);
    localDevicesCache = devices;
    lastLocalDevicesScanAt = Date.now();
    pushLocalDevicesToSse();
    console.log(`[LocalDiscovery] Background scan found ${devices.length} devices at ${new Date().toISOString()}`);
  } catch (e) {
    console.warn('[LocalDiscovery] Background scan failed:', e && e.message);
  }
}, LOCAL_DISCOVERY_POLL_MS);

// Debug endpoint to validate Spotify backend configuration (safe: masks secrets)
app.get('/api/debug/spotify-config', (req, res) => {
  try {
    const cfg = {
      nodeEnv: process.env.NODE_ENV || 'development',
      spotify: {
        clientIdSet: !!process.env.SPOTIFY_CLIENT_ID,
        clientSecretSet: !!process.env.SPOTIFY_CLIENT_SECRET,
        redirectUri: process.env.SPOTIFY_REDIRECT_URI || null
      },
      frontendUri: process.env.FRONTEND_URI || null,
      corsOrigins: (process.env.NODE_ENV === 'production'
        ? [process.env.FRONTEND_URI, 'https://beatably-frontend.netlify.app']
        : ['http://127.0.0.1:5173', 'http://localhost:5173']),
      notes: [
        'clientSecret is not returned for security reasons; only a boolean is shown.',
        'Ensure SPOTIFY_REDIRECT_URI exactly matches what is configured in the Spotify Dashboard.',
        'In development, dotenv is loaded (see top of file). In production, ensure env vars are provided by the host.'
      ],
      timestamp: new Date().toISOString()
    };
    res.json(cfg);
  } catch (e) {
    res.status(500).json({ error: 'Failed to read config', message: e.message });
  }
});

// On-demand client credentials token test to diagnose invalid_client
app.get('/api/debug/spotify-token-test', async (req, res) => {
  try {
    const response = await axios.post('https://accounts.spotify.com/api/token',
      querystring.stringify({
        grant_type: 'client_credentials',
        client_id: process.env.SPOTIFY_CLIENT_ID,
        client_secret: process.env.SPOTIFY_CLIENT_SECRET,
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    res.json({
      ok: true,
      tokenType: response.data.token_type,
      expiresIn: response.data.expires_in,
      // Do NOT return access_token back to clients in real systems; this is for local debug only.
      // Mask most of it to avoid leakage.
      accessTokenPreview: response.data.access_token ? response.data.access_token.slice(0, 12) + '…' : null,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    const status = error.response?.status || null;
    const body = error.response?.data || null;
    res.status(500).json({
      ok: false,
      message: 'Token exchange failed',
      status,
      body,
      hints: [
        'invalid_client usually means SPOTIFY_CLIENT_ID/SECRET are missing or incorrect in this backend process.',
        'Verify that the env vars are loaded in the same runtime where this endpoint executes.',
        'If running behind a process manager or cloud host, ensure secrets are set there and not only in local shell.'
      ],
      timestamp: new Date().toISOString()
    });
  }
});

// Admin endpoint to clear all lobbies and games (for testing)
app.post('/api/admin/clear-all', requireAdmin, (req, res) => {
  try {
    const lobbyCount = Object.keys(lobbies).length;
    const gameCount = Object.keys(games).length;
    const sessionCount = Object.keys(playerSessions).length;
    
    // Clear all lobbies
    Object.keys(lobbies).forEach(code => delete lobbies[code]);
    
    // Clear all games
    Object.keys(games).forEach(code => delete games[code]);
    
    // Clear all player sessions
    Object.keys(playerSessions).forEach(sessionId => delete playerSessions[sessionId]);
    
    // Persist the cleared state
    schedulePersist();
    
    console.log('[Admin] Cleared all lobbies, games, and sessions');
    
    res.json({
      ok: true,
      cleared: {
        lobbies: lobbyCount,
        games: gameCount,
        sessions: sessionCount
      },
      timestamp: new Date().toISOString()
    });
  } catch (e) {
    console.error('[Admin] Clear all failed:', e?.message);
    res.status(500).json({ ok: false, error: e?.message || 'Clear failed' });
  }
});

// --- Usage Analytics Admin Endpoints ---

// Get aggregated usage statistics
app.get('/api/admin/usage-stats', requireAdmin, (req, res) => {
  try {
    const { dateFrom, dateTo } = req.query;
    const stats = analytics.getStats({ dateFrom, dateTo });
    console.log('[Admin] Usage stats retrieved:', {
      totalGames: stats.overview?.totalGames,
      completedGames: stats.overview?.completedGames,
      uniquePlayers: stats.overview?.uniquePlayers
    });
    res.json({ ok: true, ...stats });
  } catch (e) {
    console.error('[Admin] Usage stats failed:', e?.message, e?.stack);
    res.status(500).json({ ok: false, error: e?.message || 'Stats failed' });
  }
});

// Debug endpoint to test analytics recording
app.post('/api/admin/test-analytics', requireAdmin, (req, res) => {
  try {
    console.log('[Admin] Testing analytics recording...');
    
    // Test session recording
    const testSession = analytics.recordSessionStart({
      roomCode: 'TEST',
      playerCount: 2,
      playerNames: ['TestPlayer1', 'TestPlayer2'],
      difficulty: 'normal',
      musicMode: 'test',
      winCondition: 10
    });
    
    console.log('[Admin] Test session created:', testSession);
    
    // Get current stats
    const stats = analytics.getStats();
    
    res.json({ 
      ok: true, 
      message: 'Analytics test completed',
      testSession,
      currentStats: stats.overview
    });
  } catch (e) {
    console.error('[Admin] Test analytics failed:', e?.message, e?.stack);
    res.status(500).json({ ok: false, error: e?.message || 'Test failed', stack: e?.stack });
  }
});

// Get paginated list of game sessions
app.get('/api/admin/game-sessions', requireAdmin, (req, res) => {
  try {
    const { limit, offset, dateFrom, dateTo } = req.query;
    const result = analytics.getSessions({
      limit: Number(limit) || 50,
      offset: Number(offset) || 0,
      dateFrom,
      dateTo
    });
    res.json({ ok: true, ...result });
  } catch (e) {
    console.error('[Admin] Game sessions failed:', e?.message);
    res.status(500).json({ ok: false, error: e?.message || 'Sessions failed' });
  }
});

// Get paginated list of error logs
app.get('/api/admin/error-logs', requireAdmin, (req, res) => {
  try {
    const { limit, offset, errorType, dateFrom, dateTo } = req.query;
    const result = analytics.getErrors({
      limit: Number(limit) || 100,
      offset: Number(offset) || 0,
      errorType,
      dateFrom,
      dateTo
    });
    res.json({ ok: true, ...result });
  } catch (e) {
    console.error('[Admin] Error logs failed:', e?.message);
    res.status(500).json({ ok: false, error: e?.message || 'Error logs failed' });
  }
});

// Clear old analytics data
app.delete('/api/admin/analytics-data', requireAdmin, (req, res) => {
  try {
    const { olderThanDays } = req.query;
    const result = analytics.clearOldData({
      olderThanDays: Number(olderThanDays) || 90
    });
    res.json({ ok: true, ...result });
  } catch (e) {
    console.error('[Admin] Clear analytics failed:', e?.message);
    res.status(500).json({ ok: false, error: e?.message || 'Clear failed' });
  }
});

// Debug endpoint for fetched songs
app.get('/api/debug/chart-remote-structure', async (req, res) => {
  try {
    const mode = req.query.mode || 'recent'; // recent|all|date
    const date = req.query.date; // YYYY-MM-DD if mode=date
    const { config } = require('./config');
    const axios = require('axios');

    let url = config.chart.remoteRecentUrl;
    if (mode === 'all') url = config.chart.remoteAllUrl;
    if (mode === 'date' && date) url = `${config.chart.remoteByDatePrefix}${date}.json`;

    const resp = await axios.get(url, { timeout: config.chart.timeoutMs || 12000, headers: { Accept: 'application/json' } });
    const data = resp.data;

    // Summarize structure safely
    const summarize = (obj) => {
      if (Array.isArray(obj)) return { type: 'array', length: obj.length, sampleType: obj.length ? typeof obj[0] : 'unknown' };
      if (obj && typeof obj === 'object') return { type: 'object', keys: Object.keys(obj) };
      return { type: typeof obj };
    };

    let sampleItem = null;
    if (Array.isArray(data)) {
      // all.json likely array of { date, chart|songs|entries|data: {…} }
      for (const day of data) {
        if (!day) continue;
        const arr = day.chart || day.songs || day.entries || (Array.isArray(day) ? day : null) || (Array.isArray(day?.data) ? day.data : null);
        if (Array.isArray(arr) && arr.length) {
          sampleItem = { chartDate: day.date || null, item: arr[0] };
          break;
        }
        if (Array.isArray(day?.data?.chart) && day.data.chart.length) {
          sampleItem = { chartDate: day.date || null, item: day.data.chart[0] };
          break;
        }
      }
    } else if (data && typeof data === 'object') {
      const arr = data.chart || data.songs || data.entries || (Array.isArray(data.data) ? data.data : null) || (Array.isArray(data?.data?.chart) ? data.data.chart : null);
      if (Array.isArray(arr) && arr.length) {
        sampleItem = { chartDate: data.date || null, item: arr[0] };
      }
    }

    res.json({
      ok: true,
      url,
      topLevelSummary: summarize(data),
      topLevelKeys: data && typeof data === 'object' && !Array.isArray(data) ? Object.keys(data) : null,
      arrayLength: Array.isArray(data) ? data.length : null,
      sampleDayKeys: Array.isArray(data) && data.length ? Object.keys(data[0] || {}) : null,
      sampleDaySummary: Array.isArray(data) && data.length ? summarize(data[0]) : null,
      sampleItem,
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get('/api/debug/songs', (req, res) => {
  // expose per-track debug source and computed debugDifficulty if available
  const last = lastFetchedSongs ? {
    ...lastFetchedSongs,
    tracks: (lastFetchedSongs.tracks || []).map(t => ({
      title: t.title,
      artist: t.artist,
      year: t.year,
      popularity: t.popularity ?? null,
      rank: t.rank ?? null,
      source: t.source ?? null,
      debugSource: t.debugSource ?? (t.source || null),
      debugDifficulty: t.debugDifficulty ?? null
    }))
  } : null;

  res.json({
    lastFetch: last,
    metadata: lastFetchMetadata,
    history: fetchHistory,
    timestamp: new Date().toISOString()
  });
});

// Debug endpoint for current games and their songs
app.get('/api/debug/games', (req, res) => {
  const gameDebugInfo = {};
  
  Object.keys(games).forEach(code => {
    const game = games[code];
    gameDebugInfo[code] = {
      players: game.players.map(p => ({ id: p.id, name: p.name })),
      currentPlayerIdx: game.currentPlayerIdx,
      currentCardIndex: game.currentCardIndex,
      phase: game.phase,
      totalSongs: game.sharedDeck.length,
      currentSong: game.sharedDeck[game.currentCardIndex] ? {
        title: game.sharedDeck[game.currentCardIndex].title,
        artist: game.sharedDeck[game.currentCardIndex].artist,
        year: game.sharedDeck[game.currentCardIndex].year,
        popularity: game.sharedDeck[game.currentCardIndex].popularity,
        genre: game.sharedDeck[game.currentCardIndex].genre
      } : null,
      nextFewSongs: game.sharedDeck.slice(game.currentCardIndex + 1, game.currentCardIndex + 6).map(song => ({
        title: song.title,
        artist: song.artist,
        year: song.year,
        popularity: song.popularity,
        genre: song.genre
      })),
      songStats: {
        yearRange: {
          min: Math.min(...game.sharedDeck.map(s => s.year)),
          max: Math.max(...game.sharedDeck.map(s => s.year))
        },
        genreDistribution: game.sharedDeck.reduce((acc, song) => {
          acc[song.genre] = (acc[song.genre] || 0) + 1;
          return acc;
        }, {}),
        popularityStats: {
          min: Math.min(...game.sharedDeck.map(s => s.popularity || 0)),
          max: Math.max(...game.sharedDeck.map(s => s.popularity || 0)),
          avg: Math.round(game.sharedDeck.reduce((sum, s) => sum + (s.popularity || 0), 0) / game.sharedDeck.length)
        }
      }
    };
  });
  
  res.json({
    games: gameDebugInfo,
    timestamp: new Date().toISOString()
  });
});

// Debug endpoint for specific game songs
app.get('/api/debug/games/:code/songs', (req, res) => {
  const code = req.params.code;
  const game = games[code];
  
  if (!game) {
    return res.status(404).json({ error: 'Game not found' });
  }

  const songs = game.sharedDeck.map((song, index) => ({
    index,
    title: song.title,
    artist: song.artist,
    year: song.year,
    popularity: song.popularity,
    rank: song.rank ?? null,
    source: song.source ?? null,
    debugSource: song.debugSource ?? (song.source || null),
    debugDifficulty: song.debugDifficulty ?? null,
    genre: song.genre,
    market: song.market,
    isCurrent: index === game.currentCardIndex,
    hasBeenPlayed: index < game.currentCardIndex
  }));
  
  res.json({
    gameCode: code,
    totalSongs: game.sharedDeck.length,
    currentIndex: game.currentCardIndex,
    songs,
    timestamp: new Date().toISOString()
  });
});

// Frontend log storage (in-memory)
const frontendLogs = [];
const MAX_FRONTEND_LOGS = 200;

// POST endpoint to receive frontend logs
app.post('/api/debug/frontend-logs', (req, res) => {
  try {
    const { level, message, timestamp, playerInfo, data } = req.body || {};
    const logEntry = {
      timestamp: timestamp || new Date().toISOString(),
      level: level || 'log',
      message: message || '',
      playerInfo: playerInfo || {},
      data: data || null,
      receivedAt: new Date().toISOString()
    };
    
    frontendLogs.push(logEntry);
    
    // Keep only last MAX_FRONTEND_LOGS entries
    if (frontendLogs.length > MAX_FRONTEND_LOGS) {
      frontendLogs.shift();
    }
    
    res.json({ ok: true, totalLogs: frontendLogs.length });
  } catch (error) {
    console.error('[FrontendLogs] Error storing log:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// GET endpoint to retrieve frontend logs
app.get('/api/debug/frontend-logs', (req, res) => {
  try {
    const { player, level, limit, search } = req.query;
    
    let filtered = [...frontendLogs];
    
    // Filter by player name
    if (player) {
      filtered = filtered.filter(log => 
        log.playerInfo?.playerName?.toLowerCase().includes(player.toLowerCase())
      );
    }
    
    // Filter by log level
    if (level) {
      filtered = filtered.filter(log => log.level === level);
    }
    
    // Filter by search term in message
    if (search) {
      filtered = filtered.filter(log => 
        log.message?.toLowerCase().includes(search.toLowerCase())
      );
    }
    
    // Apply limit
    const limitNum = parseInt(limit) || filtered.length;
    filtered = filtered.slice(-limitNum);
    
    res.json({
      ok: true,
      total: frontendLogs.length,
      filtered: filtered.length,
      logs: filtered
    });
  } catch (error) {
    console.error('[FrontendLogs] Error retrieving logs:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// DELETE endpoint to clear frontend logs
app.delete('/api/debug/frontend-logs', (req, res) => {
  try {
    const count = frontendLogs.length;
    frontendLogs.length = 0;
    res.json({ ok: true, message: 'Logs cleared', clearedCount: count });
  } catch (error) {
    console.error('[FrontendLogs] Error clearing logs:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.get('/debug', (req, res) => {
  const rooms = {};
  io.sockets.adapter.rooms.forEach((sockets, room) => {
    rooms[room] = Array.from(sockets);
  });
  res.json({
    lobbies: Object.keys(lobbies),
    games: Object.keys(games),
    rooms: rooms,
    debugEndpoints: [
      '/api/debug/songs - View last fetched songs',
      '/api/debug/games - View all games and their song stats',
      '/api/debug/games/:code/songs - View specific game songs',
      '/api/debug/frontend-logs - View frontend console logs from both players',
      'POST /api/debug/frontend-logs - Submit frontend logs',
      'DELETE /api/debug/frontend-logs - Clear frontend logs'
    ]
  });
});

// Test endpoint to simulate Player2 placing a card
app.get('/test-player2/:code', (req, res) => {
  const code = req.params.code;
  const game = games[code];
  
  if (!game) {
    return res.json({ error: 'No game found', code, availableGames: Object.keys(games) });
  }
  
  // Check if it's Player2's turn
  const currentPlayerId = game.playerOrder[game.currentPlayerIdx];
  const player2Id = game.playerOrder[1];
  
  if (currentPlayerId !== player2Id) {
    return res.json({ 
      error: 'Not Player2 turn', 
      currentPlayerId, 
      player2Id,
      currentPlayerIdx: game.currentPlayerIdx 
    });
  }
  
  // Simulate Player2 placing a card
  const playerId = player2Id;
  const index = 0; // Place at beginning
  
  const timeline = game.timelines[playerId] || [];
  const currentCard = game.sharedDeck[game.currentCardIndex];
  
  if (!currentCard) {
    return res.json({ error: 'No current card' });
  }

  // Place card in timeline
  let newTimeline = [...timeline];
  newTimeline.splice(index, 0, currentCard);

  // Check correctness
  const prevYear = index > 0 ? timeline[index - 1].year : -Infinity;
  const nextYear = index < timeline.length ? timeline[index].year : Infinity;
  const correct = prevYear <= currentCard.year && currentCard.year <= nextYear;

  // Update game state
  game.timelines[playerId] = newTimeline;
  game.lastPlaced = { id: currentCard.id, correct };
  game.feedback = { correct, year: currentCard.year, title: currentCard.title, artist: currentCard.artist };
  game.removingId = null;
  game.phase = "reveal";

  // Simulate continue_game immediately
  const wasCorrect = game.feedback && game.feedback.correct;
  const wasIncorrect = game.feedback && !game.feedback.correct;
  
  // Award point for correct placement
  if (wasCorrect) {
    const playerIdx = game.players.findIndex((p) => p.id === playerId);
    if (playerIdx !== -1) {
      game.players[playerIdx].score += 1;
    }
  }

  // ALWAYS advance to next player after any placement attempt
  game.currentPlayerIdx = (game.currentPlayerIdx + 1) % game.players.length;
  game.currentCardIndex = (game.currentCardIndex + 1) % game.sharedDeck.length;
  game.phase = "player-turn";
  
  const nextPlayerId = game.playerOrder[game.currentPlayerIdx];
  const nextCard = game.sharedDeck[game.currentCardIndex];
  
  // Clear state for correct placements
  game.feedback = null;
  game.lastPlaced = null;
  game.removingId = null;
  
  // Ensure game object is still in games collection
  games[code] = game;
  
  res.json({ 
    success: true, 
    wasCorrect, 
    wasIncorrect,
    nextPlayerId,
    gameExists: !!games[code],
    availableGames: Object.keys(games)
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
