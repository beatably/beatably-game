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

const app = express();

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
    // Redirect back to frontend with token
    res.redirect(`${process.env.FRONTEND_URI}/?access_token=${access_token}`);
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

// Enhanced fetch songs from Spotify with filtering support
app.post('/api/fetch-songs', async (req, res) => {
  const { musicPreferences = {}, difficulty = 'normal' } = req.body;
  
  // Default preferences if none provided
  const {
    genres = ['pop', 'rock', 'hip-hop', 'electronic', 'indie'],
    yearRange = { min: 1980, max: 2024 },
    markets = ['US'],
    limit = 50
  } = musicPreferences;

  try {
    // Get client credentials token for unbiased market results
    const clientToken = await getClientToken();
    
    console.log(`[Spotify] Fetching songs with preferences:`, {
      genres: genres.length,
      yearRange,
      markets,
      limit,
      difficulty
    });

    const allTracks = [];
    
    // Build search queries based on selected genres with randomization
    const searches = [];
    
    // Add genre-specific searches with random terms for variety
    const randomTerms = ['hits', 'popular', 'best', 'top', 'classic', 'greatest', 'chart'];
    const randomYears = [];
    
    // Generate some random year searches within the range for more variety
    if (yearRange.min && yearRange.max) {
      const yearSpan = yearRange.max - yearRange.min;
      const numYearSearches = Math.min(3, Math.floor(yearSpan / 10)); // Max 3 year-specific searches
      for (let i = 0; i < numYearSearches; i++) {
        const randomYear = yearRange.min + Math.floor(Math.random() * yearSpan);
        randomYears.push(randomYear);
      }
    }
    
    // Add genre-specific searches with random terms
    genres.forEach(genre => {
      searches.push(`genre:${genre}`);
      // Add some randomized genre searches
      const randomTerm = randomTerms[Math.floor(Math.random() * randomTerms.length)];
      searches.push(`genre:${genre} ${randomTerm}`);
    });
    
    // Add year-specific searches for more variety
    randomYears.forEach(year => {
      searches.push(`year:${year}`);
      const randomGenre = genres[Math.floor(Math.random() * genres.length)];
      searches.push(`year:${year} genre:${randomGenre}`);
    });
    
    // Add some general searches with randomization
    const generalSearches = [
      'hits', 'popular', 'chart', 'top', 'best', 'classic', 'greatest',
      'rock hits', 'pop hits', 'dance hits', 'indie hits', 'alternative hits'
    ];
    
    // Randomly select some general searches
    const shuffledGeneral = generalSearches.sort(() => 0.5 - Math.random());
    searches.push(...shuffledGeneral.slice(0, 5));
    
    // Shuffle all searches to randomize order
    const shuffledSearches = searches.sort(() => 0.5 - Math.random());
    
    // Search in each market with randomized offset for more variety
    for (const market of markets) {
      for (const search of shuffledSearches) {
        try {
          // Build query with year filter if specified
          let query = search;
          if (yearRange.min && yearRange.max && !search.includes('year:')) {
            query += ` year:${yearRange.min}-${yearRange.max}`;
          } else if (yearRange.min && !search.includes('year:')) {
            query += ` year:${yearRange.min}-2024`;
          } else if (yearRange.max && !search.includes('year:')) {
            query += ` year:1950-${yearRange.max}`;
          }

          // Add random offset to get different results each time
          const randomOffset = Math.floor(Math.random() * 100); // Random offset 0-99

          const response = await axios.get('https://api.spotify.com/v1/search', {
            headers: {
              'Authorization': `Bearer ${clientToken}`
            },
            params: {
              q: query,
              type: 'track',
              limit: 15, // Slightly larger limit per search
              market: market,
              offset: randomOffset
            }
          });

          const tracks = response.data.tracks.items
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
              popularity: track.popularity
            }));

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
    if (uniqueTracks.length < Math.max(60, limit * 0.8)) {
      console.log(`[Spotify] Not enough tracks (${uniqueTracks.length}), trying fallback searches...`);
      
      const fallbackSearches = [
        'popular', 'hits', 'chart', 'top', 'best', 'classic', 'greatest',
        'rock', 'pop', 'dance', 'indie', 'alternative', 'hip hop', 'electronic'
      ];
      
      // Shuffle fallback searches for randomization
      const shuffledFallbacks = fallbackSearches.sort(() => 0.5 - Math.random());
      
      for (const market of markets) {
        for (const search of shuffledFallbacks) {
          if (uniqueTracks.length >= Math.max(60, limit)) break; // Stop when we have enough
          
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

            const tracks = response.data.tracks.items
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
                popularity: track.popularity
              }));

            uniqueTracks.push(...tracks);
            console.log(`[Spotify] Added ${tracks.length} fallback tracks from "${search}" in ${market} (offset: ${randomOffset})`);
          } catch (fallbackError) {
            console.error(`[Spotify] Fallback search error:`, fallbackError.message);
          }
        }
      }
    }

    // Apply difficulty-based filtering
    let filteredTracks = uniqueTracks;
    
    if (difficulty === 'easy') {
      // Easy: Only very popular songs (popularity >= 70) and singles
      filteredTracks = uniqueTracks
        .filter(track => track.popularity >= 70)
        .sort((a, b) => b.popularity - a.popularity); // Sort by popularity descending
      console.log(`[Spotify] Easy mode: filtered to ${filteredTracks.length} popular tracks (popularity >= 70)`);
    } else if (difficulty === 'normal') {
      // Normal: Moderately popular songs (popularity >= 50) and singles
      filteredTracks = uniqueTracks
        .filter(track => track.popularity >= 50)
        .sort((a, b) => b.popularity - a.popularity);
      console.log(`[Spotify] Normal mode: filtered to ${filteredTracks.length} moderately popular tracks (popularity >= 50)`);
    } else if (difficulty === 'hard') {
      // Hard: All songs including niche ones, but still prefer singles
      filteredTracks = uniqueTracks
        .sort((a, b) => b.popularity - a.popularity);
      console.log(`[Spotify] Hard mode: using all ${filteredTracks.length} tracks including niche songs`);
    }

    // Ensure we have at least 60 songs for a good game experience
    const minSongs = Math.max(60, limit);
    
    // If we still don't have enough songs, log a warning but continue
    if (filteredTracks.length < minSongs) {
      console.warn(`[Spotify] Warning: Only found ${filteredTracks.length} songs, but need at least ${minSongs}. Consider broadening your search criteria.`);
    }
    
    // Shuffle and limit to requested number, but ensure at least 60 if possible
    const targetCount = Math.min(filteredTracks.length, Math.max(minSongs, limit));
    const shuffled = filteredTracks
      .sort(() => 0.5 - Math.random())
      .slice(0, targetCount);
    
    // Store for debugging purposes
    const fetchResult = {
      tracks: shuffled,
      metadata: {
        totalFound: uniqueTracks.length,
        filteredByDifficulty: filteredTracks.length,
        difficulty: difficulty,
        preferences: musicPreferences,
        marketsSearched: markets,
        genresSearched: genres,
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
    
    console.log(`[Spotify] Returning ${shuffled.length} tracks with difficulty: ${difficulty}`);
    console.log(`[Spotify DEBUG] Sample tracks:`, shuffled.slice(0, 5).map(t => `${t.title} by ${t.artist} (${t.year})`));
    
    res.json(fetchResult);
  } catch (error) {
    console.error('Error fetching Spotify tracks:', error);
    res.status(500).json({ error: 'Failed to fetch tracks from Spotify' });
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

io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  // Create lobby
  socket.on('create_lobby', ({ name, code, settings }, callback) => {
    if (lobbies[code]) {
      callback({ error: "Lobby already exists" });
      return;
    }
    const player = { id: socket.id, name, isCreator: true, isReady: true };
    lobbies[code] = {
      players: [player],
      settings: settings || { minPlayers: 2, maxPlayers: 8, difficulty: "normal", timeLimit: 30 },
      status: "waiting"
    };
    socket.join(code);
    callback({ lobby: lobbies[code], player });
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
    if (lobby.players.length >= (lobby.settings?.maxPlayers || 8)) {
      console.log('[Backend] Lobby is full:', lobby.players.length);
      callback({ error: "Lobby is full" });
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
        score: 0,
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
      winCondition: 10, // First to 10 cards in timeline wins
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

    // Update game state
    game.timelines[playerId] = newTimeline;
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

    // Broadcast song guess state to all players
    game.players.forEach((p, idx) => {
      io.to(p.id).emit('game_update', {
        timeline: game.timelines[currentPlayerId], // Show current player's timeline to all
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
    
    // Award point for correct placement to the current player (not the one who clicked continue)
    if (wasCorrect) {
      const playerIdx = game.players.findIndex((p) => p.id === currentPlayerId);
      if (playerIdx !== -1) {
        game.players[playerIdx].score += 1;
      }
    }
    
    // Emit new song loaded event for automatic playback
    setTimeout(() => {
      io.to(code).emit('new_song_loaded', { reason: 'next_turn' });
    }, 500);

    // ALWAYS advance to next player after any placement attempt
    game.currentPlayerIdx = (game.currentPlayerIdx + 1) % game.players.length;
    game.currentCardIndex = (game.currentCardIndex + 1) % game.sharedDeck.length;
    game.phase = "player-turn";
    
    const nextPlayerId = game.playerOrder[game.currentPlayerIdx];
    const nextCard = game.sharedDeck[game.currentCardIndex];
    
    // Check if game should end
    if (game.currentCardIndex >= game.sharedDeck.length) {
      game.phase = "game-over";
    }
    
    // Handle incorrect card removal with setTimeout BEFORE clearing state
    if (wasIncorrect) {
      game.removingId = game.lastPlaced?.id;
      setTimeout(() => {
        // Get fresh reference again
        const gameInTimeout = games[code];
        if (!gameInTimeout) {
          console.log('[Backend] Game disappeared in timeout!');
          return;
        }
        
        // CRITICAL FIX: Remove incorrect card from the CURRENT player's timeline, not the next player
        gameInTimeout.timelines[currentPlayerId] = (gameInTimeout.timelines[currentPlayerId] || []).filter((c) => c.id !== gameInTimeout.lastPlaced?.id);
        gameInTimeout.removingId = null;
        gameInTimeout.lastPlaced = null;
        gameInTimeout.feedback = null;
        
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
    
    // Clear state for correct placements
    game.feedback = null;
    game.lastPlaced = null;
    game.removingId = null;
    
    // Ensure game object is still in games collection
    games[code] = game;
    
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
        
        // Emit new song loaded event for automatic playback
        setTimeout(() => {
          io.to(code).emit('new_song_loaded', { reason: 'skip_song' });
        }, 500);
        break;
        
    }
  });

  // Skip challenge - any player can skip during challenge-window phase
  socket.on('skip_challenge', ({ code }) => {
    const game = games[code];
    if (!game || game.phase !== 'challenge-window') return;
    
    const playerId = socket.id;
    // Any player can skip, no token cost for skipping
    
    // Move directly to reveal phase
    game.phase = "reveal";
    game.lastPlaced.phase = 'resolved';
    
    const currentPlayerId = game.playerOrder[game.currentPlayerIdx];
    const currentCard = game.sharedDeck[game.currentCardIndex];
    
    // Broadcast reveal state
    game.players.forEach((p, idx) => {
      io.to(p.id).emit('game_update', {
        timeline: game.timelines[currentPlayerId],
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
    
    // Broadcast challenge state - challenger places on original player's timeline
    game.players.forEach((p) => {
      io.to(p.id).emit('game_update', {
        timeline: game.timelines[currentPlayerId], // Show original player's timeline
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
    
    // Award point to original player if they were correct and kept the card
    const originalPlayerId = game.challenge.originalPlayerId;
    if (game.challenge.originalCorrect && !game.challenge.result.challengeWon) {
      const playerIdx = game.players.findIndex(p => p.id === originalPlayerId);
      if (playerIdx !== -1) {
        game.players[playerIdx].score += 1;
      }
    }
    
    // Emit new song loaded event for automatic playback
    setTimeout(() => {
      io.to(code).emit('new_song_loaded', { reason: 'next_turn' });
    }, 500);
    
    // Clear challenge and advance to next player
    game.challenge = null;
    game.currentPlayerIdx = (game.currentPlayerIdx + 1) % game.players.length;
    game.currentCardIndex = (game.currentCardIndex + 1) % game.sharedDeck.length;
    game.phase = "player-turn";
    game.feedback = null;
    game.lastPlaced = null;
    
    const nextPlayerId = game.playerOrder[game.currentPlayerIdx];
    const nextCard = game.sharedDeck[game.currentCardIndex];
    
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

  // Song guess - only current player during song-guess phase
  socket.on('guess_song', ({ code, title, artist }) => {
    const game = games[code];
    if (!game || game.phase !== 'song-guess') return;
    
    const playerId = socket.id;
    const currentPlayerId = game.playerOrder[game.currentPlayerIdx];
    if (playerId !== currentPlayerId) return; // Only current player can guess
    
    const currentCard = game.sharedDeck[game.currentCardIndex];
    if (!currentCard) return;
    
    // Check if guess is correct
    const titleCorrect = title.toLowerCase().trim() === currentCard.title.toLowerCase().trim();
    const artistCorrect = artist.toLowerCase().trim() === currentCard.artist.toLowerCase().trim();
    const bothCorrect = titleCorrect && artistCorrect;
    
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
    
    // Broadcast challenge window state
    game.players.forEach((p) => {
      io.to(p.id).emit('game_update', {
        timeline: game.timelines[currentPlayerId],
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
    
    // Broadcast challenge window state
    game.players.forEach((p) => {
      io.to(p.id).emit('game_update', {
        timeline: game.timelines[currentPlayerId],
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

// Debug endpoint for fetched songs
app.get('/api/debug/songs', (req, res) => {
  res.json({
    lastFetch: lastFetchedSongs,
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
  
  res.json({
    gameCode: code,
    totalSongs: game.sharedDeck.length,
    currentIndex: game.currentCardIndex,
    songs: game.sharedDeck.map((song, index) => ({
      index,
      title: song.title,
      artist: song.artist,
      year: song.year,
      popularity: song.popularity,
      genre: song.genre,
      market: song.market,
      isCurrent: index === game.currentCardIndex,
      hasBeenPlayed: index < game.currentCardIndex
    })),
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
