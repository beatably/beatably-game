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

// Feature flags, thresholds, and providers
const { config } = require('./config');
const { resolveOriginalYear, isRemasterMarker, normalizeTitle } = require('./musicbrainz');
const { getChartEntries } = require('./chartProvider');

const app = express();
const discovery = require('./discovery');

// --- Persistent state (lobbies/games) across backend restarts ---
const fs = require('fs');
const path = require('path');

const STATE_DIR = path.join(__dirname, 'cache');
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
      savedAt: new Date().toISOString()
      // Note: playerSessions deliberately NOT persisted (socket ids are transient)
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
    console.log('[State] Loaded lobbies/games from disk. Rooms:', {
      lobbies: Object.keys(lobbies),
      games: Object.keys(games)
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
    ? [process.env.FRONTEND_URI, 'https://beatably-frontend.netlify.app']
    : ['http://127.0.0.1:5173', 'http://localhost:5173'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};

app.use(cors(corsOptions));
app.use(express.json()); // Add JSON body parser

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
      ? [process.env.FRONTEND_URI, 'https://beatably-frontend.netlify.app']
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
    
    // Check if session exists and is valid
    const session = playerSessions[sessionId];
    if (!session) {
      // Fallback path: backend likely restarted and lost in-memory sessions.
      // Attempt stateless rejoin by roomCode + playerName matching in active game/lobby.
      console.log('[Sessions] Session not found, attempting stateless rejoin:', { sessionId, roomCode, playerName, socketId: socket.id });

      const lobby = lobbies[roomCode];
      const game = games[roomCode];

      if (game) {
        const existingPlayerIndex = game.players.findIndex(p => p.name === playerName);
        if (existingPlayerIndex !== -1) {
          const oldPlayerId = game.players[existingPlayerIndex].id;

          socket.join(roomCode);
          console.log('[Sessions] Stateless rejoin matched game by name:', { roomCode, playerName, oldPlayerId, newSocketId: socket.id });

          // Current pointers
          const currentPlayerId = game.playerOrder[game.currentPlayerIdx];
          const currentCard = game.sharedDeck[game.currentCardIndex];

          // Player's timeline with old id
          const playerTimeline = game.timelines[oldPlayerId] || [];

          // Update player's socket id
          game.players[existingPlayerIndex].id = socket.id;

          // Update playerOrder mapping
          for (let i = 0; i < game.playerOrder.length; i++) {
            if (game.playerOrder[i] === oldPlayerId) {
              game.playerOrder[i] = socket.id;
              console.log('[Sessions] Updated player order (stateless):', { index: i, from: oldPlayerId, to: socket.id });
            }
          }

          // Update timeline mapping
          if (game.timelines[oldPlayerId]) {
            if (oldPlayerId !== socket.id) {
              game.timelines[socket.id] = game.timelines[oldPlayerId];
              delete game.timelines[oldPlayerId];
              console.log('[Sessions] Moved timeline mapping (stateless):', {
                from: oldPlayerId,
                to: socket.id,
                timelineLength: (game.timelines[socket.id] ? game.timelines[socket.id].length : 0)
              });
            } else {
              game.timelines[socket.id] = game.timelines[socket.id] || [];
              console.log('[Sessions] Timeline mapping unchanged (same id) on stateless rejoin');
            }
          } else {
            console.warn('[Sessions] No existing timeline for old id on stateless rejoin:', { oldPlayerId, newId: socket.id });
            game.timelines[socket.id] = game.timelines[socket.id] || [];
          }

          // Validate/fix current player pointer
          if (!game.playerOrder[game.currentPlayerIdx] ||
              !game.players.find(p => p.id === game.playerOrder[game.currentPlayerIdx])) {
            console.error('[Sessions] Invalid current player after stateless rejoin; repairing');
            const valid = game.players.find(p => game.playerOrder.includes(p.id));
            if (valid) {
              game.currentPlayerIdx = game.playerOrder.indexOf(valid.id);
              console.log('[Sessions] Repaired currentPlayerIdx:', game.currentPlayerIdx);
            }
          }

          const finalCurrentPlayerId = game.playerOrder[game.currentPlayerIdx];

          // Recreate session entry so further reconnects work
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
            console.warn('[Sessions] Failed to recreate session on stateless rejoin:', e && e.message);
          }

          callback({
            success: true,
            view: 'game',
            gameState: {
              timeline: playerTimeline,
              deck: [currentCard],
              players: game.players,
              phase: game.phase,
              feedback: game.feedback,
              lastPlaced: game.lastPlaced,
              removingId: game.removingId,
              currentPlayerIdx: game.currentPlayerIdx,
              currentPlayerId: finalCurrentPlayerId,
              challenge: game.challenge
            }
          });

          // Sync everyone with validated current player/timeline
          setTimeout(() => {
            game.players.forEach((p) => {
              io.to(p.id).emit('game_update', {
                timeline: game.timelines[finalCurrentPlayerId] || [],
                deck: [game.sharedDeck[game.currentCardIndex]],
                players: game.players,
                phase: game.phase,
                feedback: game.feedback,
                lastPlaced: game.lastPlaced,
                removingId: game.removingId,
                currentPlayerIdx: game.currentPlayerIdx,
                currentPlayerId: finalCurrentPlayerId,
                challenge: game.challenge
              });
            });
          }, 100);

          socket.to(roomCode).emit('player_reconnected', {
            playerName,
            playerId: socket.id
          });
          return;
        } else {
          console.log('[Sessions] Stateless rejoin: player name not found in game:', { roomCode, playerName });
        }
      }

      if (lobby) {
        const existingPlayerIndex = lobby.players.findIndex(p => p.name === playerName);
        let isCreator = false;
        if (existingPlayerIndex !== -1) {
          isCreator = !!lobby.players[existingPlayerIndex].isCreator;
          lobby.players[existingPlayerIndex].id = socket.id;
        } else {
          // Infer creator by checking if a creator already exists
          isCreator = !!lobby.players.find(p => p.isCreator && p.name === playerName);
          lobby.players.push({
            id: socket.id,
            name: playerName,
            isCreator,
            isReady: true
          });
        }

        socket.join(roomCode);
        console.log('[Sessions] Stateless rejoin matched lobby by name:', { roomCode, playerName, isCreator });

        // Recreate session entry
        try {
          playerSessions[sessionId] = {
            sessionId,
            playerId: socket.id,
            roomCode,
            playerName,
            isCreator,
            timestamp: Date.now()
          };
          console.log('[Sessions] Recreated session for lobby after stateless rejoin:', sessionId);
        } catch (e) {
          console.warn('[Sessions] Failed to recreate session for lobby on stateless rejoin:', e && e.message);
        }

        callback({
          success: true,
          view: 'waiting',
          lobby,
          player: lobby.players.find(p => p.id === socket.id)
        });
        io.to(roomCode).emit('lobby_update', lobby);
        return;
      }

      console.log('[Sessions] Stateless rejoin failed; room not found:', roomCode);

      // EXTRA FALLBACK: search by playerName across existing games/lobbies (room code may be missing after restart)
      try {
        // Search games
        let foundCode = null;
        for (const code of Object.keys(games)) {
          const g = games[code];
          if (g && Array.isArray(g.players) && g.players.some(p => p && p.name === playerName)) {
            foundCode = code;
            break;
          }
        }
        // If not in games, search lobbies
        if (!foundCode) {
          for (const code of Object.keys(lobbies)) {
            const lb = lobbies[code];
            if (lb && Array.isArray(lb.players) && lb.players.some(p => p && p.name === playerName)) {
              foundCode = code;
              break;
            }
          }
        }

        if (foundCode) {
          console.log('[Sessions] Name-based fallback matched code:', foundCode, 'for player:', playerName);
          const fallbackGame = games[foundCode];
          const fallbackLobby = lobbies[foundCode];

          if (fallbackGame) {
            const idx = fallbackGame.players.findIndex(p => p.name === playerName);
            if (idx !== -1) {
              const oldId = fallbackGame.players[idx].id;
              socket.join(foundCode);

              const currentPlayerId = fallbackGame.playerOrder[fallbackGame.currentPlayerIdx];
              const currentCard = fallbackGame.sharedDeck[fallbackGame.currentCardIndex];
              const playerTimeline = fallbackGame.timelines[oldId] || [];

              // Remap ids
              fallbackGame.players[idx].id = socket.id;
              for (let i = 0; i < fallbackGame.playerOrder.length; i++) {
                if (fallbackGame.playerOrder[i] === oldId) {
                  fallbackGame.playerOrder[i] = socket.id;
                }
              }
              if (fallbackGame.timelines[oldId] && oldId !== socket.id) {
                fallbackGame.timelines[socket.id] = fallbackGame.timelines[oldId];
                delete fallbackGame.timelines[oldId];
              } else {
                fallbackGame.timelines[socket.id] = fallbackGame.timelines[socket.id] || [];
              }

              const finalCurrentPlayerId = fallbackGame.playerOrder[fallbackGame.currentPlayerIdx];

              // Recreate session entry
              playerSessions[sessionId] = {
                sessionId,
                playerId: socket.id,
                roomCode: foundCode,
                playerName,
                isCreator: !!fallbackGame.players[idx].isCreator,
                timestamp: Date.now()
              };

              callback({
                success: true,
                view: 'game',
                gameState: {
                  timeline: playerTimeline,
                  deck: [currentCard],
                  players: fallbackGame.players,
                  phase: fallbackGame.phase,
                  feedback: fallbackGame.feedback,
                  lastPlaced: fallbackGame.lastPlaced,
                  removingId: fallbackGame.removingId,
                  currentPlayerIdx: fallbackGame.currentPlayerIdx,
                  currentPlayerId: finalCurrentPlayerId,
                  challenge: fallbackGame.challenge
                }
              });

              setTimeout(() => {
                fallbackGame.players.forEach((p) => {
                  io.to(p.id).emit('game_update', {
                    timeline: fallbackGame.timelines[finalCurrentPlayerId] || [],
                    deck: [fallbackGame.sharedDeck[fallbackGame.currentCardIndex]],
                    players: fallbackGame.players,
                    phase: fallbackGame.phase,
                    feedback: fallbackGame.feedback,
                    lastPlaced: fallbackGame.lastPlaced,
                    removingId: fallbackGame.removingId,
                    currentPlayerIdx: fallbackGame.currentPlayerIdx,
                    currentPlayerId: finalCurrentPlayerId,
                    challenge: fallbackGame.challenge
                  });
                });
              }, 100);

              socket.to(foundCode).emit('player_reconnected', {
                playerName,
                playerId: socket.id
              });

              schedulePersist();
              return;
            }
          }

          if (fallbackLobby) {
            const existingPlayerIndex = fallbackLobby.players.findIndex(p => p.name === playerName);
            let isCreator = false;
            if (existingPlayerIndex !== -1) {
              isCreator = !!fallbackLobby.players[existingPlayerIndex].isCreator;
              fallbackLobby.players[existingPlayerIndex].id = socket.id;
            } else {
              isCreator = !!fallbackLobby.players.find(p => p.isCreator && p.name === playerName);
              fallbackLobby.players.push({
                id: socket.id,
                name: playerName,
                isCreator,
                isReady: true
              });
            }
            socket.join(foundCode);

            playerSessions[sessionId] = {
              sessionId,
              playerId: socket.id,
              roomCode: foundCode,
              playerName,
              isCreator,
              timestamp: Date.now()
            };

            callback({
              success: true,
              view: 'waiting',
              lobby: fallbackLobby,
              player: fallbackLobby.players.find(p => p.id === socket.id)
            });
            io.to(foundCode).emit('lobby_update', fallbackLobby);
            schedulePersist();
            return;
          }
        }
      } catch (e) {
        console.warn('[Sessions] Name-based fallback error:', e && e.message);
      }

      callback({ error: "Session not found or expired" });
      return;
    }
    
    // Check if session matches the request
    if (session.roomCode !== roomCode || session.playerName !== playerName) {
      console.log('[Sessions] Session mismatch:', { 
        sessionRoomCode: session.roomCode, 
        requestRoomCode: roomCode,
        sessionPlayerName: session.playerName,
        requestPlayerName: playerName
      });
      callback({ error: "Session data mismatch" });
      return;
    }
    
    // Update session with new socket ID
    session.playerId = socket.id;
    session.timestamp = Date.now();
    
    // Check if lobby/game still exists
    const lobby = lobbies[roomCode];
    const game = games[roomCode];
    
    // CRITICAL FIX: Prioritize game over lobby - if game exists, reconnect to game
    if (game) {
      // Reconnect to game
      const existingPlayerIndex = game.players.findIndex(p => p.name === playerName);
      if (existingPlayerIndex !== -1) {
        // CRITICAL FIX: Get the old socket ID BEFORE updating it
        const oldPlayerId = game.players[existingPlayerIndex].id;
        
        socket.join(roomCode);
        console.log('[Sessions] Reconnected to game:', roomCode);
        
        // Send current game state
        const currentPlayerId = game.playerOrder[game.currentPlayerIdx];
        const currentCard = game.sharedDeck[game.currentCardIndex];
        
        // CRITICAL DEBUG: Log all timeline data before processing
        console.log('[Sessions] FULL DEBUG - Before reconnection processing:', {
          playerName,
          currentPlayerId,
          allPlayers: game.players.map(p => ({ id: p.id, name: p.name })),
          allTimelineKeys: Object.keys(game.timelines),
          timelineLengths: Object.fromEntries(Object.entries(game.timelines).map(([id, timeline]) => [id, timeline.length])),
          phase: game.phase,
          currentPlayerIdx: game.currentPlayerIdx,
          oldPlayerId: oldPlayerId,
          newSocketId: socket.id
        });
        
        // Get the player's timeline using their old player ID (before socket ID update)
        const playerTimeline = game.timelines[oldPlayerId] || [];
        
        console.log('[Sessions] Timeline lookup result:', {
          oldPlayerId,
          timelineFound: !!game.timelines[oldPlayerId],
          timelineLength: playerTimeline.length,
          timelineCards: playerTimeline.map(c => ({ id: c.id, title: c.title, year: c.year }))
        });
        
        // Now update the player's socket ID
        game.players[existingPlayerIndex].id = socket.id;
        
        // CRITICAL FIX: Update ALL references to the old player ID in playerOrder
        for (let i = 0; i < game.playerOrder.length; i++) {
          if (game.playerOrder[i] === oldPlayerId) {
            game.playerOrder[i] = socket.id;
            console.log('[Sessions] Updated player order at index', i, ':', {
              from: oldPlayerId,
              to: socket.id
            });
          }
        }
        
        // Update the timeline mapping to use the new socket ID (guard same-id case)
        if (game.timelines[oldPlayerId]) {
          if (oldPlayerId !== socket.id) {
            game.timelines[socket.id] = game.timelines[oldPlayerId];
            delete game.timelines[oldPlayerId]; // Clean up old mapping
            console.log('[Sessions] Timeline mapping updated:', {
              from: oldPlayerId,
              to: socket.id,
              timelineLength: (game.timelines[socket.id] ? game.timelines[socket.id].length : 0)
            });
          } else {
            // If the socket id didn't actually change, do not delete the mapping
            console.log('[Sessions] Timeline mapping unchanged (same socket id):', {
              id: socket.id,
              timelineLength: (game.timelines[socket.id] ? game.timelines[socket.id].length : 0)
            });
            // Ensure mapping exists
            game.timelines[socket.id] = game.timelines[socket.id] || [];
          }
        } else {
          console.warn('[Sessions] No existing timeline found for oldPlayerId during reconnection:', { oldPlayerId, newId: socket.id });
          // Ensure we at least have an empty timeline mapping to avoid crashes
          game.timelines[socket.id] = game.timelines[socket.id] || [];
        }
        
        // CRITICAL FIX: Get the updated current player ID after player order update
        const updatedCurrentPlayerId = game.playerOrder[game.currentPlayerIdx];
        
        // CRITICAL FIX: Validate that the current player ID is valid
        if (!updatedCurrentPlayerId || !game.players.find(p => p.id === updatedCurrentPlayerId)) {
          console.error('[Sessions] CRITICAL ERROR: Invalid current player ID after reconnection:', {
            updatedCurrentPlayerId,
            currentPlayerIdx: game.currentPlayerIdx,
            playerOrder: game.playerOrder,
            players: game.players.map(p => ({ id: p.id, name: p.name }))
          });
          
          // Attempt to fix by finding a valid player
          const validPlayer = game.players.find(p => game.playerOrder.includes(p.id));
          if (validPlayer) {
            const validIndex = game.playerOrder.indexOf(validPlayer.id);
            game.currentPlayerIdx = validIndex;
            console.log('[Sessions] Fixed current player to valid player:', {
              playerId: validPlayer.id,
              playerName: validPlayer.name,
              newCurrentPlayerIdx: validIndex
            });
          }
        }
        
        const finalCurrentPlayerId = game.playerOrder[game.currentPlayerIdx];
        
        callback({
          success: true,
          view: 'game',
          gameState: {
            timeline: playerTimeline, // Send the reconnecting player's timeline
            deck: [currentCard],
            players: game.players,
            phase: game.phase,
            feedback: game.feedback,
            lastPlaced: game.lastPlaced,
            removingId: game.removingId,
            currentPlayerIdx: game.currentPlayerIdx,
            currentPlayerId: finalCurrentPlayerId, // Use final validated ID
            challenge: game.challenge
          }
        });
        
        // CRITICAL FIX: Broadcast updated game state to all players to sync the reconnected player
        setTimeout(() => {
          game.players.forEach((p) => {
            io.to(p.id).emit('game_update', {
              timeline: game.timelines[finalCurrentPlayerId] || [],
              deck: [currentCard],
              players: game.players,
              phase: game.phase,
              feedback: game.feedback,
              lastPlaced: game.lastPlaced,
              removingId: game.removingId,
              currentPlayerIdx: game.currentPlayerIdx,
              currentPlayerId: finalCurrentPlayerId, // Use final validated ID
              challenge: game.challenge
            });
          });
        }, 100);
        
        // Notify other players of reconnection
        socket.to(roomCode).emit('player_reconnected', {
          playerName: playerName,
          playerId: socket.id
        });
        
      } else {
        console.log('[Sessions] Player not found in game:', playerName);
        callback({ error: "Player not found in game" });
      }
      
    } else if (lobby) {
      // Reconnect to lobby (fallback if no game exists)
      const existingPlayerIndex = lobby.players.findIndex(p => p.name === playerName);
      if (existingPlayerIndex !== -1) {
        // Update existing player's socket ID
        lobby.players[existingPlayerIndex].id = socket.id;
      } else {
        // Add player back to lobby
        lobby.players.push({
          id: socket.id,
          name: playerName,
          isCreator: session.isCreator,
          isReady: true
        });
      }
      
      socket.join(roomCode);
      console.log('[Sessions] Reconnected to lobby:', roomCode);
      callback({ 
        success: true, 
        view: 'waiting',
        lobby: lobby,
        player: lobby.players.find(p => p.id === socket.id)
      });
      io.to(roomCode).emit('lobby_update', lobby);
      
    } else {
      console.log('[Sessions] Room no longer exists:', roomCode);
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
    const player = { id: socket.id, name, isCreator: true, isReady: true };
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
        roomCode: code,
        playerName: name,
        isCreator: true,
        timestamp: Date.now()
      };
    }
    
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
    const player = { id: socket.id, name, isCreator: false, isReady: true };
    lobby.players.push(player);
    socket.join(code);
    console.log('[Backend] Player joined room:', code, 'Socket rooms:', Array.from(socket.rooms));
    console.log('[Backend] Updated lobby players:', lobby.players.map(p => ({ id: p.id, name: p.name })));
    callback({ lobby, player });
    io.to(code).emit('lobby_update', lobby);
  });

  // Leave lobby
  socket.on('leave_lobby', ({ code }, callback) => {
    const lobby = lobbies[code];
    if (!lobby) return;
    lobby.players = lobby.players.filter(p => p.id !== socket.id);
    socket.leave(code);
    // If creator left or no players left, delete lobby
    if (lobby.players.length === 0 || lobby.players.every(p => !p.isCreator)) {
      delete lobbies[code];
    } else {
      io.to(code).emit('lobby_update', lobby);
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
    console.log('[Backend] Lobby players:', lobby.players.map(p => ({ id: p.id, name: p.name })));
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
    const playerOrder = lobby.players.map((p) => p.id);
    
    // Give each player a unique starting card for their timeline
    const usedStartCards = new Set();
    playerOrder.forEach((playerId, index) => {
      let startCard;
      do {
        startCard = shuffledSongs[Math.floor(Math.random() * shuffledSongs.length)];
      } while (usedStartCards.has(startCard.id));
      usedStartCards.add(startCard.id);
      timelines[playerId] = [startCard];
    });

    // Create shared deck excluding the starting cards
    const sharedDeck = shuffledSongs.filter(song => !usedStartCards.has(song.id));

    // Determine win condition from lobby settings (default 10)
    const winCondition = (lobby.settings && Number.isFinite(lobby.settings.winCondition))
      ? Math.max(1, Math.min(50, parseInt(lobby.settings.winCondition, 10)))
      : 10;
    console.log('[Backend] Using winCondition:', winCondition);

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
      players: lobby.players.map((p, idx) => ({
        id: p.id,
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
      playerOrder: lobby.players.map((p) => p.id),
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
    console.log('[Backend] Received place_card:', { code, index, playerId: socket.id });
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
    const playerId = socket.id;
    const currentPlayerId = game.playerOrder[game.currentPlayerIdx];
    console.log('[Backend] Player validation:', { playerId, currentPlayerId, match: playerId === currentPlayerId });
    if (playerId !== currentPlayerId) {
      console.log('[Backend] Not current player:', { playerId, currentPlayerId });
      return;
    }
    console.log('[Backend] All validations passed, processing card placement...');

    const timeline = game.timelines[playerId] || [];
    const currentCard = game.sharedDeck[game.currentCardIndex];
    if (!currentCard) return;

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
      playerId: playerId,
      index: index,
      phase: 'placed' // placed, challenged, resolved
    };
    game.feedback = { correct, year: currentCard.year, title: currentCard.title, artist: currentCard.artist };
    game.removingId = null;
    game.phase = "song-guess";
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
        currentPlayerId: currentPlayerId,
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
    
    const playerId = socket.id;
    const currentPlayerId = game.playerOrder[game.currentPlayerIdx];
    // Allow any player to continue, not just the current player
    console.log('[Backend] Processing continue_game from player:', playerId, 'current player:', currentPlayerId);

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
        gameInTimeout.timelines[currentPlayerId] = (gameInTimeout.timelines[currentPlayerId] || []).filter((c) => c.id !== gameInTimeout.lastPlaced?.id);
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
    const playerTimelineCommitted = game.timelines[currentPlayerId] || [];
    // Insert at the recorded index
    const commitTimeline = [...playerTimelineCommitted];
    commitTimeline.splice(game.lastPlaced.index, 0, game.sharedDeck[game.currentCardIndex]);
    game.timelines[currentPlayerId] = commitTimeline;

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
    
    const playerId = socket.id;
    const playerIdx = game.players.findIndex(p => p.id === playerId);
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
        const currentPlayerId = game.playerOrder[game.currentPlayerIdx];
        const nextCard = game.sharedDeck[game.currentCardIndex];
        
        // Broadcast update
        game.players.forEach((p) => {
          io.to(p.id).emit('game_update', {
            timeline: game.timelines[currentPlayerId],
            deck: [nextCard],
            players: game.players,
            phase: "player-turn",
            feedback: null,
            lastPlaced: null,
            removingId: null,
            currentPlayerIdx: game.currentPlayerIdx,
            currentPlayerId: currentPlayerId,
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
    
    // Track that this player has responded
    game.challengeResponses.add(playerId);
    
    // Get all players who can challenge (not the current player and have tokens)
    const currentPlayerId = game.playerOrder[game.currentPlayerIdx];
    const eligibleChallengers = game.players.filter(p => 
      p.id !== currentPlayerId && p.tokens > 0
    ).map(p => p.id);
    
    // Check if all eligible challengers have responded
    const allResponded = eligibleChallengers.every(id => game.challengeResponses.has(id));
    
    if (allResponded || eligibleChallengers.length === 0) {
      // All eligible players have responded, move to reveal phase
      game.phase = "reveal";
      game.lastPlaced.phase = 'resolved';
      game.challengeResponses = null; // Clear responses
      
      const currentCard = game.sharedDeck[game.currentCardIndex];
      
    // Broadcast reveal state with visual-only timeline (non-committed)
    const revealTimeline = [...game.timelines[currentPlayerId]];
    // Insert the placed card visually for reveal only
    revealTimeline.splice(game.lastPlaced.index, 0, { ...currentCard, preview: true });
    
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
        currentPlayerId: currentPlayerId,
      });
    });
    } else {
      // Still waiting for other players to respond
      // Broadcast updated challenge window state with progress indicator
      const respondedCount = game.challengeResponses.size;
      const totalEligible = eligibleChallengers.length;
      
// CRITICAL: Include the newly placed card visually while showing challenge progress
      {
        const originalTimeline = game.timelines[currentPlayerId] || [];
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
            currentPlayerId: currentPlayerId,
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
    
    // Check if player has tokens and is not the current player
    const currentPlayerId = game.playerOrder[game.currentPlayerIdx];
    if (playerIdx === -1 || game.players[playerIdx].tokens <= 0 || playerId === currentPlayerId) return;
    
    // Check if challenge is already in progress
    if (game.challenge) return;
    
    // Spend token for challenge
    game.players[playerIdx].tokens -= 1;
    
    // Set up challenge state
    game.challenge = {
      challengerId: playerId,
      originalPlayerId: currentPlayerId,
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

      game.players.forEach((p) => {
        io.to(p.id).emit('game_update', {
          timeline: displayTimeline, // show visual timeline including placed card
          deck: [game.sharedDeck[game.currentCardIndex]], // Same card
          players: game.players,
          phase: "challenge",
          challenge: game.challenge,
          feedback: null,
          lastPlaced: game.lastPlaced,
          removingId: null,
          currentPlayerIdx: game.currentPlayerIdx,
          currentPlayerId: playerId, // Challenger is now active
        });
      });
    }
  });

  // Challenge card placement
  socket.on('challenge_place_card', ({ code, index }) => {
    console.log('[Backend] Received challenge_place_card for code:', code, 'from socket:', socket.id);
    const game = games[code];
    if (!game || !game.challenge || game.challenge.phase !== 'challenger-turn') {
      console.log('[Backend] Invalid challenge_place_card state:', {
        gameExists: !!game,
        challengeExists: !!game?.challenge,
        challengePhase: game?.challenge?.phase
      });
      return;
    }
    
    const playerId = socket.id;
    if (playerId !== game.challenge.challengerId) {
      console.log('[Backend] Wrong challenger for challenge_place_card:', {
        playerId,
        expectedChallenger: game.challenge.challengerId
      });
      return;
    }
    console.log('[Backend] Processing challenge_place_card...');
    
    const originalPlayerId = game.challenge.originalPlayerId;
    const originalTimeline = game.timelines[originalPlayerId] || [];
    const currentCard = game.sharedDeck[game.currentCardIndex];
    if (!currentCard) return;

    // Remove the original placement first
    const timelineWithoutOriginal = originalTimeline.filter(c => c.id !== currentCard.id);
    
    // CRITICAL FIX: Adjust challenger's index to account for the original card's position
    // The challenger sees a timeline WITH the original card, but we process against timeline WITHOUT it
    let adjustedIndex = index;
    if (index > game.challenge.originalIndex) {
      // If challenger placed after the original card's position, subtract 1 from index
      adjustedIndex = index - 1;
    }
    
    // Place challenger's card in the original player's timeline
    let newTimeline = [...timelineWithoutOriginal];
    newTimeline.splice(adjustedIndex, 0, currentCard);

    // Check challenger's correctness using the adjusted index
    let prevYear, nextYear;
    
    if (adjustedIndex === 0) {
      // Placing at the beginning
      prevYear = -Infinity;
      nextYear = timelineWithoutOriginal.length > 0 ? timelineWithoutOriginal[0].year : Infinity;
    } else if (adjustedIndex >= timelineWithoutOriginal.length) {
      // Placing at the end (beyond current timeline)
      prevYear = timelineWithoutOriginal.length > 0 ? timelineWithoutOriginal[timelineWithoutOriginal.length - 1].year : -Infinity;
      nextYear = Infinity;
    } else {
      // Placing in the middle
      prevYear = timelineWithoutOriginal[adjustedIndex - 1].year;
      nextYear = timelineWithoutOriginal[adjustedIndex].year;
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
    
    // SIMPLIFIED FIX: Show the actual final timeline state instead of complex display logic
    // The final timeline will be determined by the challenge outcome logic below
    let displayTimeline = [...timelineWithoutOriginal];
    
    // Add both cards in their actual positions for visual comparison
    // Original card at its position
    const originalDisplayCard = { ...currentCard, originalCard: true };
    const challengerDisplayCard = { ...currentCard, challengerCard: true };
    
    // Insert original card at its position
    const originalDisplayTimeline = [...timelineWithoutOriginal];
    originalDisplayTimeline.splice(game.challenge.originalIndex, 0, originalDisplayCard);
    
    // Insert challenger card at its position  
    const challengerDisplayTimeline = [...timelineWithoutOriginal];
    challengerDisplayTimeline.splice(index, 0, challengerDisplayCard);
    
    // For display, show both cards in a simple way - just add them both to show comparison
    displayTimeline = [...timelineWithoutOriginal];
    
    // CRITICAL FIX: Use the adjusted index for display to match the actual placement logic
    // Both indices are relative to the timelineWithoutOriginal, so we need to be careful about insertion order
    
    if (game.challenge.originalIndex <= adjustedIndex) {
      // Original comes first or at same position, insert original first
      displayTimeline.splice(game.challenge.originalIndex, 0, originalDisplayCard);
      // Now challenger index needs to be adjusted since we inserted original card before it
      displayTimeline.splice(adjustedIndex + 1, 0, challengerDisplayCard);
    } else {
      // Challenger comes first, insert challenger first
      displayTimeline.splice(adjustedIndex, 0, challengerDisplayCard);
      // Now original index needs to be adjusted since we inserted challenger card before it
      displayTimeline.splice(game.challenge.originalIndex + 1, 0, originalDisplayCard);
    }
    
    // Determine challenge outcome and update actual timelines
    let challengeWon = false;
    
    // Add comprehensive debug logging for challenge outcome
    console.log('[Backend] Challenge outcome debug:', {
      challengerCorrect,
      originalCorrect,
      challengerId: playerId,
      originalPlayerId,
      cardYear: currentCard.year,
      cardId: currentCard.id
    });
    
    if (challengerCorrect && !originalCorrect) {
      // Challenger wins - card goes to challenger's timeline in correct chronological position
      challengeWon = true;
      console.log('[Backend] Challenge outcome: Challenger wins (challenger correct, original wrong)');
      const challengerTimeline = game.timelines[playerId] || [];
      
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
      game.timelines[playerId] = newChallengerTimeline;
      game.timelines[originalPlayerId] = timelineWithoutOriginal; // Remove from original
      game.players[game.players.findIndex(p => p.id === playerId)].score += 1;
    } else if (!challengerCorrect && originalCorrect) {
      // Original player wins - keep original placement
      challengeWon = false;
      console.log('[Backend] Challenge outcome: Original player wins (challenger wrong, original correct)');
      // Put the card back in original position
      game.timelines[originalPlayerId].splice(game.challenge.originalIndex, 0, currentCard);
    } else if (challengerCorrect && originalCorrect) {
      // Both correct - original player keeps it (went first)
      challengeWon = false;
      console.log('[Backend] Challenge outcome: Both correct, original player keeps card');
      // Put the card back in original position
      game.timelines[originalPlayerId].splice(game.challenge.originalIndex, 0, currentCard);
    } else {
      // CRITICAL FIX: Both wrong - nobody gets the card, remove from all timelines
      challengeWon = false;
      console.log('[Backend] Challenge outcome: Both wrong, nobody gets the card');
      game.timelines[originalPlayerId] = timelineWithoutOriginal; // Remove from original
      // Ensure card is not in challenger's timeline either
      game.timelines[playerId] = (game.timelines[playerId] || []).filter(c => c.id !== currentCard.id);
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
    game.players.forEach((p) => {
      io.to(p.id).emit('game_update', {
        timeline: displayTimeline, // Show both cards for resolution
        deck: [currentCard],
        players: game.players,
        phase: "challenge-resolved",
        challenge: game.challenge,
        feedback: game.feedback,
        lastPlaced: game.lastPlaced,
        removingId: null,
        currentPlayerIdx: game.currentPlayerIdx,
        currentPlayerId: originalPlayerId,
      });
    });
  });

  // Helper function to update all player scores to match their timeline lengths
  const updatePlayerScores = (game) => {
    game.players.forEach((player) => {
      const timelineLength = (game.timelines[player.id] || []).length;
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
      return true;
    }

    return false;
  };

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

  // Helper function to normalize song titles for comparison
  const normalizeSongTitle = (title) => {
    return title
      .toLowerCase()
      .trim()
      // Remove content in parentheses
      .replace(/\([^)]*\)/g, '')
      // Remove content after dash, hyphen, or other common separators
      .replace(/\s*[-–—]\s*.*$/, '')
      // Remove "feat.", "ft.", "featuring" and similar
      .replace(/\s*(feat\.?|ft\.?|featuring)\s+.*$/i, '')
      // Remove extra whitespace
      .replace(/\s+/g, ' ')
      .trim();
  };

  // Helper function to normalize artist names for comparison
  const normalizeArtistName = (artist) => {
    return artist
      .toLowerCase()
      .trim()
      // Remove "feat.", "ft.", "featuring" parts
      .replace(/\s*(feat\.?|ft\.?|featuring)\s+.*$/i, '')
      // Remove extra whitespace
      .replace(/\s+/g, ' ')
      .trim();
  };

  // Song guess - only current player during song-guess phase
  socket.on('guess_song', ({ code, title, artist }) => {
    const game = games[code];
    if (!game || game.phase !== 'song-guess') return;
    
    const playerId = socket.id;
    const currentPlayerId = game.playerOrder[game.currentPlayerIdx];
    if (playerId !== currentPlayerId) return; // Only current player can guess
    
    const currentCard = game.sharedDeck[game.currentCardIndex];
    if (!currentCard) return;
    
    // Check if guess is correct using normalized comparison
    const normalizedGuessTitle = normalizeSongTitle(title);
    const normalizedActualTitle = normalizeSongTitle(currentCard.title);
    const normalizedGuessArtist = normalizeArtistName(artist);
    const normalizedActualArtist = normalizeArtistName(currentCard.artist);
    
    const titleCorrect = normalizedGuessTitle === normalizedActualTitle;
    const artistCorrect = normalizedGuessArtist === normalizedActualArtist;
    const bothCorrect = titleCorrect && artistCorrect;
    
    console.log('[Song Guess] Comparison debug:', {
      originalTitle: currentCard.title,
      normalizedActualTitle,
      guessTitle: title,
      normalizedGuessTitle,
      titleCorrect,
      originalArtist: currentCard.artist,
      normalizedActualArtist,
      guessArtist: artist,
      normalizedGuessArtist,
      artistCorrect,
      bothCorrect
    });
    
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
    
    // Broadcast guess result
    game.players.forEach((p) => {
      io.to(p.id).emit('song_guess_result', {
        playerId,
        playerName: game.players.find(pl => pl.id === playerId)?.name,
        title,
        artist,
        correct: bothCorrect,
        titleCorrect,
        artistCorrect
      });
    });
  });

  // Skip song guess - only current player during song-guess phase
  socket.on('skip_song_guess', ({ code }) => {
    const game = games[code];
    if (!game || game.phase !== 'song-guess') return;
    
    const playerId = socket.id;
    const currentPlayerId = game.playerOrder[game.currentPlayerIdx];
    if (playerId !== currentPlayerId) return; // Only current player can skip
    
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
    // Remove player from any lobbies they were in
    for (const code in lobbies) {
      const lobby = lobbies[code];
      const wasInLobby = lobby.players.some(p => p.id === socket.id);
      if (wasInLobby) {
        lobby.players = lobby.players.filter(p => p.id !== socket.id);
        if (lobby.players.length === 0 || lobby.players.every(p => !p.isCreator)) {
          delete lobbies[code];
        } else {
          io.to(code).emit('lobby_update', lobby);
        }
      }
    }
    console.log('User disconnected:', socket.id);
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
      '/api/debug/games/:code/songs - View specific game songs'
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
