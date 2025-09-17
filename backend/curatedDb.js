/**
 * Curated Songs Database (file-backed)
 * - Stores curated songs and metadata for gameplay without relying on Spotify Web API at runtime
 * - Safe to use in production (writes under backend/cache/)
 */

const fs = require('fs');
const path = require('path');

// Use persistent disk in production if available, otherwise fall back to deployed cache
function getCacheDir() {
  console.log('[CuratedDB] getCacheDir() called - starting path detection');
  console.log('[CuratedDB] Environment check:', {
    NODE_ENV: process.env.NODE_ENV,
    __dirname: __dirname,
    cwd: process.cwd()
  });
  
  if (process.env.NODE_ENV === 'production') {
    const persistentPath = '/var/data/cache';
    const deployedPath = path.join(__dirname, 'cache');
    
    console.log('[CuratedDB] Production paths:', {
      persistentPath,
      deployedPath,
      persistentExists: fs.existsSync(persistentPath),
      deployedDirExists: fs.existsSync(deployedPath)
    });
    
    // Check if persistent disk is available
    if (fs.existsSync(persistentPath)) {
      const persistentDbFile = path.join(persistentPath, 'curated-songs.json');
      const deployedDbFile = path.join(deployedPath, 'curated-songs.json');
      
      console.log('[CuratedDB] Database file check:', {
        persistentDbFile,
        deployedDbFile,
        persistentDbExists: fs.existsSync(persistentDbFile),
        deployedDbExists: fs.existsSync(deployedDbFile)
      });
      
      // If persistent disk has the database, check if it's actually populated
      if (fs.existsSync(persistentDbFile)) {
        try {
          const persistentData = JSON.parse(fs.readFileSync(persistentDbFile, 'utf8'));
          const persistentCount = Array.isArray(persistentData) ? persistentData.length : 0;
          console.log('[CuratedDB] Persistent disk database exists with', persistentCount, 'songs');
          
          // If persistent disk has songs, use it
          if (persistentCount > 0) {
            console.log('[CuratedDB] Using persistent disk cache directory:', persistentPath);
            return persistentPath;
          }
          
          // If persistent disk is empty but deployed database exists, migrate it
          if (fs.existsSync(deployedDbFile)) {
            try {
              const deployedData = JSON.parse(fs.readFileSync(deployedDbFile, 'utf8'));
              const deployedCount = Array.isArray(deployedData) ? deployedData.length : 0;
              console.log('[CuratedDB] Deployed database has', deployedCount, 'songs');
              
              if (deployedCount > 0) {
                console.log('[CuratedDB] Migrating database from deployed to persistent disk (overwriting empty file)...');
                fs.copyFileSync(deployedDbFile, persistentDbFile);
                console.log('[CuratedDB] Database migration successful:', deployedDbFile, '->', persistentDbFile);
                console.log('[CuratedDB] Using persistent disk cache directory:', persistentPath);
                return persistentPath;
              }
            } catch (deployedError) {
              console.warn('[CuratedDB] Failed to read deployed database:', deployedError.message);
            }
          }
          
          console.log('[CuratedDB] Using persistent disk cache directory (empty database):', persistentPath);
          return persistentPath;
        } catch (error) {
          console.warn('[CuratedDB] Failed to read persistent database, will try migration:', error.message);
          // Fall through to migration logic below
        }
      }
      
      // If persistent disk is empty but deployed database exists, migrate it
      if (fs.existsSync(deployedDbFile)) {
        try {
          console.log('[CuratedDB] Migrating database from deployed to persistent disk...');
          
          // Ensure persistent directory exists
          if (!fs.existsSync(persistentPath)) {
            fs.mkdirSync(persistentPath, { recursive: true });
          }
          
          // Copy the database file
          fs.copyFileSync(deployedDbFile, persistentDbFile);
          console.log('[CuratedDB] Database migration successful:', deployedDbFile, '->', persistentDbFile);
          console.log('[CuratedDB] Using persistent disk cache directory:', persistentPath);
          return persistentPath;
        } catch (error) {
          console.error('[CuratedDB] Database migration failed:', error.message);
          console.log('[CuratedDB] Falling back to deployed cache directory:', deployedPath);
          return deployedPath;
        }
      }
      
      // Persistent disk exists but no database anywhere - use persistent for new files
      console.log('[CuratedDB] Using persistent disk cache directory (creating new):', persistentPath);
      return persistentPath;
    }
    
    // No persistent disk - check if deployed database exists
    const fallbackDbFile = path.join(deployedPath, 'curated-songs.json');
    console.log('[CuratedDB] No persistent disk, checking fallback:', {
      fallbackDbFile,
      exists: fs.existsSync(fallbackDbFile)
    });
    
    if (fs.existsSync(fallbackDbFile)) {
      console.log('[CuratedDB] Using deployed cache directory:', deployedPath);
      return deployedPath;
    }
    
    // Default to persistent disk path for new files
    console.log('[CuratedDB] Using persistent disk cache directory (creating new):', persistentPath);
    return persistentPath;
  }
  
  // Development: use local cache
  const localPath = path.join(__dirname, 'cache');
  console.log('[CuratedDB] Using local cache directory:', localPath);
  return localPath;
}

const CACHE_DIR = getCacheDir();
const DB_FILE = path.join(CACHE_DIR, 'curated-songs.json');

// Debug: Log the final paths being used
console.log('[CuratedDB] Final paths determined:', {
  CACHE_DIR,
  DB_FILE,
  exists: fs.existsSync(DB_FILE),
  NODE_ENV: process.env.NODE_ENV
});

// In-memory cache
let _songs = [];
let _loaded = false;

// Ensure cache dir exists
function ensureCacheDir() {
  try {
    if (!fs.existsSync(CACHE_DIR)) {
      fs.mkdirSync(CACHE_DIR, { recursive: true });
    }
  } catch (e) {
    console.warn('[CuratedDB] Failed to ensure cache dir:', e && e.message);
  }
}

function load(forceReload = false) {
  console.log('[CuratedDB] load() called, _loaded:', _loaded, 'forceReload:', forceReload);
  
  // Always reload if explicitly requested (for admin endpoints)
  if (forceReload) {
    console.log('[CuratedDB] Force reload requested, resetting cache');
    _loaded = false;
    _songs = [];
  }
  
  // Force reload if we have 0 songs and this is production - something might be wrong
  const autoForceReload = process.env.NODE_ENV === 'production' && _loaded && _songs.length === 0;
  
  if (_loaded && !autoForceReload) {
    console.log('[CuratedDB] Already loaded, skipping. Songs:', _songs.length);
    return;
  }
  
  if (autoForceReload) {
    console.log('[CuratedDB] Auto force reloading due to 0 songs in production');
    _loaded = false; // Reset to allow re-evaluation
  }
  
  ensureCacheDir();
  try {
    console.log('[CuratedDB] Checking DB_FILE:', DB_FILE, 'exists:', fs.existsSync(DB_FILE));
    
    if (!fs.existsSync(DB_FILE)) {
      console.log('[CuratedDB] DB file does not exist, creating empty array');
      _songs = [];
      save();
    } else {
      console.log('[CuratedDB] Reading DB file...');
      const raw = fs.readFileSync(DB_FILE, 'utf8');
      _songs = JSON.parse(raw);
      if (!Array.isArray(_songs)) _songs = [];
      console.log('[CuratedDB] Successfully parsed', _songs.length, 'songs from DB file');
    }
    _loaded = true;
    console.log('[CuratedDB] Loaded curated songs:', _songs.length);
  } catch (e) {
    console.warn('[CuratedDB] Load failed:', e && e.message);
    console.warn('[CuratedDB] Stack trace:', e && e.stack);
    _songs = [];
    _loaded = true;
  }
}

function save() {
  ensureCacheDir();
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(_songs, null, 2), 'utf8');
    return true;
  } catch (e) {
    console.warn('[CuratedDB] Save failed:', e && e.message);
    return false;
  }
}

/**
 * List curated songs with optional filters and pagination
 */
function list({ q = '', genre, geography, yearMin, yearMax, difficulty, limit = 100, offset = 0 } = {}) {
  load();
  let out = _songs.slice();

  if (q) {
    const needle = q.toLowerCase();
    out = out.filter(
      (s) =>
        (s.title || '').toLowerCase().includes(needle) ||
        (s.artist || '').toLowerCase().includes(needle)
    );
  }
  if (genre) {
    const g = String(genre).toLowerCase();
    out = out.filter((s) => {
      const sg = (s.genre || '').toLowerCase();
      const gs = Array.isArray(s.genres) ? s.genres.map((x) => String(x || '').toLowerCase()) : [];
      return sg === g || (gs.length ? gs.includes(g) : false);
    });
  }
  if (geography) {
    const geo = String(geography).toLowerCase();
    out = out.filter((s) => {
      const sg = (s.geography || '').toLowerCase();
      const ms = Array.isArray(s.markets) ? s.markets.map((m) => String(m || '').toLowerCase()) : [];
      if (ms.length) return ms.includes(geo);
      return sg === geo;
    });
  }
  if (Number.isFinite(yearMin)) {
    out = out.filter((s) => (Number.isFinite(s.year) ? s.year >= yearMin : true));
  }
  if (Number.isFinite(yearMax)) {
    out = out.filter((s) => (Number.isFinite(s.year) ? s.year <= yearMax : true));
  }
  if (Number.isFinite(difficulty)) {
    out = out.filter((s) => Number(s.difficultyLevel || 0) === Number(difficulty));
  }

  const total = out.length;
  out = out.slice(offset, offset + limit);
  return { items: out, total };
}

function get(id) {
  load();
  return _songs.find((s) => s.id === id) || null;
}

function add(song) {
  load();
  // Basic normalization
  const now = new Date().toISOString();
  const id = song.id || `cur_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const rec = {
    id,
    spotifyUri: song.spotifyUri || song.uri || null, // prefer spotifyUri field
    title: song.title || '',
    artist: song.artist || '',
    year: Number(song.year) || null,
    // Backward-compatible single genre; prefer first from genres[]
    genre: (Array.isArray(song.genres) && song.genres.length ? String(song.genres[0]) : (song.genre || '')),
    // Backward-compatible single geography; prefer first from markets[]
    geography: (Array.isArray(song.markets) && song.markets.length ? String(song.markets[0]) : (song.geography || '')),
    // New multi-fields for markets (success regions) and genres
    markets: Array.isArray(song.markets)
      ? Array.from(new Set(song.markets.map((m) => String(m || '').toUpperCase()).filter(Boolean)))
      : (song.geography ? [String(song.geography).toUpperCase()] : []),
    genres: Array.isArray(song.genres)
      ? Array.from(new Set(song.genres.map((g) => String(g || '').toLowerCase()).filter(Boolean)))
      : (song.genre ? [String(song.genre).toLowerCase()] : []),
    difficultyLevel: Number(song.difficultyLevel) || 1,
    popularity: Number.isFinite(song.popularity) ? Number(song.popularity) : null,
    albumArt: song.albumArt || null,
    previewUrl: song.previewUrl || null,
    tags: Array.isArray(song.tags) ? song.tags : [],
    addedBy: song.addedBy || 'admin',
    addedDate: now,
    verified: !!song.verified,
    // New fields: Billboard flag and chart metadata
    isBillboardChart: !!(song.isBillboardChart || song.isBillboard || song.fromBillboard),
    chartInfo: (() => {
      const ci = song.chartInfo || {};
      const rank = Number.isFinite(song.rank) ? Number(song.rank) : Number.isFinite(ci.rank) ? Number(ci.rank) : null;
      const peakPos = Number.isFinite(song.peakPos) ? Number(song.peakPos) : Number.isFinite(ci.peakPos) ? Number(ci.peakPos) : null;
      const weeksOnChart = Number.isFinite(song.weeksOnChart) ? Number(song.weeksOnChart) : Number.isFinite(ci.weeksOnChart) ? Number(ci.weeksOnChart) : null;
      const chartDate = song.chartDate || ci.chartDate || null;
      return { rank, peakPos, weeksOnChart, chartDate };
    })()
  };

  // Prevent duplicates by URI (basic)
  if (rec.spotifyUri) {
    const dup = _songs.find(
      (s) => (s.spotifyUri || '').toLowerCase() === rec.spotifyUri.toLowerCase()
    );
    if (dup) {
      // Update instead of duplicate
      Object.assign(dup, rec, { id: dup.id, updatedAt: now });
      save();
      return dup;
    }
  }

  _songs.push(rec);
  save();
  return rec;
}

function update(id, patch) {
  load();
  const idx = _songs.findIndex((s) => s.id === id);
  if (idx === -1) return null;
  const now = new Date().toISOString();
  const existing = _songs[idx];

  // Merge chartInfo deeply if provided
  let mergedChartInfo = existing.chartInfo || null;
  if (patch && patch.chartInfo) {
    mergedChartInfo = { ...(existing.chartInfo || {}), ...(patch.chartInfo || {}) };
  }

  const merged = {
    ...existing,
    ...patch,
    id,
    updatedAt: now,
  };

  if (typeof patch?.isBillboardChart !== 'undefined') {
    merged.isBillboardChart = !!patch.isBillboardChart;
  }
  if (patch && patch.chartInfo) {
    merged.chartInfo = mergedChartInfo;
  }

  _songs[idx] = merged;
  save();
  return _songs[idx];
}

function remove(id) {
  load();
  const before = _songs.length;
  _songs = _songs.filter((s) => s.id !== id);
  const removed = before !== _songs.length;
  if (removed) save();
  return removed;
}

// Utility: one song per artist (case-insensitive)
function diversifyByArtist(tracks, maxPerArtist = 1) {
  const seen = new Map();
  const out = [];
  for (const t of tracks) {
    const key = (t.artist || '').toLowerCase().trim();
    const count = seen.get(key) || 0;
    if (count < maxPerArtist) {
      out.push(t);
      seen.set(key, count + 1);
    }
  }
  return out;
}

/**
 * Select songs for a game based on criteria
 * criteria = {
 *   yearRange: { min, max },
 *   genres: string[],
 *   markets: string[] (mapped to geography),
 *   difficulty: 'easy'|'normal'|'hard',
 *   playerCount: number
 * }
 */
function selectForGame(criteria = {}) {
  load();
  const {
    yearRange = {},
    genres = [],
    markets = [],
    difficulty = 'normal',
    playerCount = 2,
  } = criteria;

  // Map difficulty to difficultyLevel filter
  const diffMap = { easy: [1, 2], normal: [2, 3], hard: [3, 4, 5] };
  const allowedLevels = diffMap[difficulty] || [2, 3];

  let pool = _songs.slice();

  // Filter by year
  if (Number.isFinite(yearRange.min)) {
    pool = pool.filter((s) => (Number.isFinite(s.year) ? s.year >= yearRange.min : true));
  }
  if (Number.isFinite(yearRange.max)) {
    pool = pool.filter((s) => (Number.isFinite(s.year) ? s.year <= yearRange.max : true));
  }

  // Filter by genres (if supplied) - supports multi-genre (genres[]), with fallback to single genre
  if (Array.isArray(genres) && genres.length) {
    const gset = new Set(genres.map((g) => String(g || '').toLowerCase()));
    pool = pool.filter((s) => {
      const sg = (s.genre || '').toLowerCase();
      const gs = Array.isArray(s.genres) ? s.genres.map((x) => String(x || '').toLowerCase()) : [];
      if (gs.length) return gs.some((g) => gset.has(g)) || (sg ? gset.has(sg) : false);
      return sg ? gset.has(sg) : false;
    });
  }

  // Filter by geography via markets (US/SE/GB/INTL - success markets)
  if (Array.isArray(markets) && markets.length) {
    const mset = new Set(markets.map((m) => String(m || '').toLowerCase()));
    pool = pool.filter((s) => {
      const sg = (s.geography || '').toLowerCase();
      const ms = Array.isArray(s.markets) ? s.markets.map((m) => String(m || '').toLowerCase()) : [];
      if (ms.length) return ms.some((code) => mset.has(code));
      return sg ? mset.has(sg) : true;
    });
  }

  // Filter by difficultyLevel
  pool = pool.filter((s) => allowedLevels.includes(Number(s.difficultyLevel || 2)));

  // Shuffle
  pool = pool.sort(() => 0.5 - Math.random());

  // Diversify by artist
  pool = diversifyByArtist(pool, 1);

  const minSongsNeeded = Math.max(60, (Number(playerCount) || 2) * 20);
  const maxSongs = 120;

  // Choose up to maxSongs but at least minSongsNeeded when available
  const selected = pool.slice(0, Math.min(maxSongs, pool.length));

  // Map to track shape expected by frontend/backend game
  const tracks = selected.map((s) => ({
    id: s.id,
    title: s.title,
    artist: s.artist,
    year: s.year,
    uri: s.spotifyUri, // must be spotify:track:...
    spotifyUri: s.spotifyUri, // Keep both for compatibility
    preview_url: s.previewUrl || null,
    external_url: null,
    album_art: s.albumArt || null,
    market: (Array.isArray(s.markets) && s.markets.length ? s.markets[0] : (s.geography || null)),
    genre: s.genre || 'curated',
    popularity: s.popularity || null,
    source: 'curated',
    debugSource: 'curated',
    debugDifficulty: (function () {
      const lvl = Number(s.difficultyLevel || 2);
      if (lvl <= 1) return 'easy';
      if (lvl === 2) return 'easy';
      if (lvl === 3) return 'normal';
      return 'hard';
    })(),
    // Add URI validation
    isValidUri: !!(s.spotifyUri && s.spotifyUri.startsWith('spotify:track:')),
  }));

  // Filter out invalid URIs to prevent playback issues
  const validTracks = tracks.filter(t => t.isValidUri);
  if (validTracks.length < tracks.length) {
    console.warn(`[CuratedDB] Filtered out ${tracks.length - validTracks.length} tracks with invalid URIs`);
  }

  const metadata = {
    mode: 'curated',
    finalCount: validTracks.length,
    originalCount: tracks.length,
    invalidUriCount: tracks.length - validTracks.length,
    difficulty,
    preferences: {
      genres,
      yearRange,
      markets,
    },
    playerCount,
    minSongsNeeded,
    timestamp: new Date().toISOString(),
  };

  let warning = null;
  if (validTracks.length < minSongsNeeded) {
    warning = `Only found ${validTracks.length} curated songs, but need at least ${minSongsNeeded} for ${playerCount} players. Consider adding more songs or broadening your filters.`;
  }
  if (tracks.length - validTracks.length > 0) {
    const uriWarning = `${tracks.length - validTracks.length} songs had invalid Spotify URIs and were excluded.`;
    warning = warning ? `${warning} ${uriWarning}` : uriWarning;
  }

  return { tracks: validTracks, metadata, warning };
}

module.exports = {
  load,
  save,
  list,
  get,
  add,
  update,
  remove,
  selectForGame,
};
