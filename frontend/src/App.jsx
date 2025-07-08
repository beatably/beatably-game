import React, { useState, useEffect, useRef } from "react";
import { io } from "socket.io-client";
import TimelineBoard from "./TimelineBoard";
import PlayerHeader from "./PlayerHeader";
import GameFooter from "./GameFooter";
import Landing from "./Landing";
import WaitingRoom from "./WaitingRoom";
import SpotifyPlayer from "./SpotifyPlayer";
import SongDebugPanel from "./SongDebugPanel";
import spotifyAuth from "./utils/spotifyAuth";
import './App.css';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { API_BASE_URL, SOCKET_URL } from './config';

// Fake song data for prototyping
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

// Dummy player data for prototyping
const dummyPlayers = [
  { id: 1, name: "Alice", score: 3, tokens: 2 },
  { id: 2, name: "Bob", score: 2, tokens: 1 },
];

// Game phases: 'setup', 'player-turn', 'reveal', 'game-over'

function App() {
  // Spotify authentication
  const [spotifyToken, setSpotifyToken] = useState(localStorage.getItem('access_token') || null);
  // pending creator name saved during OAuth redirect
  const [pendingCreate, setPendingCreate] = useState(
    localStorage.getItem('pending_create') || null
  );
  // track socket connection status
  const [socketReady, setSocketReady] = useState(false);
  // Capture access_token coming back from Spotify and, if we had a pending game
  // creation, continue that flow automatically
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("access_token");
    if (token) {
      setSpotifyToken(token);
      localStorage.setItem("access_token", token);
      window.history.replaceState({}, "", window.location.pathname);

      // Check if this is a re-authentication (restore game state)
      const restored = restoreGameState();
      if (restored) {
        console.log("[Spotify] Game state restored after re-authentication");
        return;
      }

      // resume a pending "create game" request (saved before redirect)
      const pending = localStorage.getItem("pending_create");
      if (pending) {
        localStorage.removeItem("pending_create");
        setPendingCreate(pending);
      }
    }
  }, []);

  // Create lobby when we have token + pending name + socket ready
  useEffect(() => {
    if (spotifyToken && pendingCreate && socketReady && socketRef.current) {
      console.log("[App] All conditions met, creating lobby for:", pendingCreate);
      const name = pendingCreate;
      setPendingCreate(null);
      
      const code = randomCode();
      setPlayerName(name);
      setRoomCode(code);
      setIsCreator(true);
      const settings = {
        difficulty: "normal",
        musicPreferences: {
          genres: ['pop', 'rock', 'hip-hop', 'electronic', 'indie'],
          yearRange: { min: 1980, max: 2024 },
          markets: ['US']
        }
      };
      console.log("[Socket] Emitting create_lobby", { name, code, settings });
      
      // Add a small delay to ensure socket is fully ready
      setTimeout(() => {
        if (socketRef.current && socketRef.current.connected) {
          socketRef.current.emit(
            "create_lobby",
            {
              name,
              code,
              settings,
            },
            ({ error, lobby, player }) => {
              console.log("[Socket] create_lobby callback", { error, lobby, player });
              if (error) {
                alert(error);
                setView("landing");
                return;
              }
              setPlayers(lobby.players);
              setGameSettings(lobby.settings);
              setView("waiting");
            }
          );
        } else {
          console.error("[Socket] Socket not connected when trying to create lobby");
          alert("Connection error. Please try again.");
          setView("landing");
        }
      }, 100);
    }
  }, [spotifyToken, pendingCreate, socketReady]);

  // Socket.IO connection
  const socketRef = useRef(null);

  // Centralized game state
  const [players, setPlayers] = useState([]); // [{id, name, isCreator, isReady}]
  const [currentPlayerIdx, setCurrentPlayerIdx] = useState(0);
  const [timeline, setTimeline] = useState([fakeSongs[0]]);
  const [deck, setDeck] = useState(fakeSongs.slice(1));
  const [currentCard, setCurrentCard] = useState(fakeSongs[1]);
  const [phase, setPhase] = useState('player-turn');
  const [feedback, setFeedback] = useState(null);
  const [showFeedback, setShowFeedback] = useState(false);
  const [lastPlaced, setLastPlaced] = useState(null);
  const [removingId, setRemovingId] = useState(null);
  const [challenge, setChallenge] = useState(null);
const [challengeResponseGiven, setChallengeResponseGiven] = useState(false);
  // Add a state variable to track the game round
  const [gameRound, setGameRound] = useState(1);

  // Lobby/game state
  const [view, setView] = useState('landing');
  const [playerName, setPlayerName] = useState("");
  const [playerId, setPlayerId] = useState(""); // local socket id
  const [roomCode, setRoomCode] = useState("");
  const [isCreator, setIsCreator] = useState(false);
  const [gameSettings, setGameSettings] = useState({
    difficulty: "normal",
    musicPreferences: {
      genres: ['pop', 'rock', 'hip-hop', 'electronic', 'indie'],
      yearRange: { min: 1980, max: 2024 },
      markets: ['US']
    }
  });

  // Track current player id for turn logic
  const [currentPlayerId, setCurrentPlayerId] = useState("");

  // Spotify player state
  const [spotifyDeviceId, setSpotifyDeviceId] = useState(null);
  const [isPlayingMusic, setIsPlayingMusic] = useState(false);
  const [realSongs, setRealSongs] = useState(null); // Will replace fake songs when loaded

  // Debug panel state
  const [showDebugPanel, setShowDebugPanel] = useState(false);

  // Add keyboard shortcut to toggle debug panel (Ctrl+D or Cmd+D)
  useEffect(() => {
    const handleKeyDown = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key === 'd') {
        event.preventDefault();
        setShowDebugPanel(prev => !prev);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Connect to backend on mount
  useEffect(() => {
    if (!socketRef.current) {
      console.log("[Socket] Connecting to backend...");
      socketRef.current = io(SOCKET_URL);
      socketRef.current.on("connect", () => {
        console.log("[Socket] Connected, id:", socketRef.current.id);
        setPlayerId(socketRef.current.id);
        setSocketReady(true);
      });
      socketRef.current.on("auto_proceed", () => {
        console.log("[Socket] Auto proceed event received; ignoring it.");
      });
      // Listen for lobby updates
      socketRef.current.on("lobby_update", (lobby) => {
        console.log("[Socket] Received lobby_update:", lobby);
        setPlayers(lobby.players);
        setGameSettings(lobby.settings);
      });
      // Listen for game start
      socketRef.current.on("game_started", (game) => {
        console.log("[Socket] Received game_started:", game);
        setPlayers(game.players);
        setCurrentPlayerIdx(game.currentPlayerIdx || 0);
        setTimeline(game.timeline || []);
        setDeck(game.deck || []);
        setPhase(game.phase);
        setShowFeedback(false);
        setFeedback(game.feedback);
        setLastPlaced(game.lastPlaced);
        setRemovingId(game.removingId);
        setView("game");
        setCurrentPlayerId(game.currentPlayerId || (game.players && game.players[0]?.id));
        // Reset game round to 1 when a new game starts
        setGameRound(1);
      });

      // Listen for game updates (real-time sync, per player)
      socketRef.current.on("game_update", (game) => {
        console.log("[App] Game update received:", {
          currentPlayerId: game.currentPlayerId,
          myPlayerId: socketRef.current?.id,
          phase: game.phase
        });
        setPlayers(game.players);
        setCurrentPlayerIdx(game.currentPlayerIdx || 0);
        setTimeline(game.timeline || []);
        setDeck(game.deck || []);
        setPhase(game.phase);
        setFeedback(game.feedback);
        // Only show feedback during reveal phase, not during challenge-window
        setShowFeedback(!!game.feedback && game.phase === 'reveal');
        setLastPlaced(game.lastPlaced);
        setRemovingId(game.removingId);
        setChallenge(game.challenge);
        setCurrentPlayerId(game.currentPlayerId || (game.players && game.players[0]?.id));
        
        // Increment game round when the current player changes
        if (game.currentPlayerId !== currentPlayerId) {
          setGameRound(prevRound => prevRound + 1);
        }
      });

      // Listen for song guess results
      socketRef.current.on("song_guess_result", (result) => {
        console.log("[App] Song guess result:", result);
        // Show a notification about the guess result
        const message = result.correct 
          ? `${result.playerName} correctly guessed "${result.title}" by ${result.artist}! +${result.correct ? 1 : 0} token(s)`
          : `${result.playerName} guessed incorrectly: "${result.title}" by ${result.artist}`;
        
        // You could show this in a toast notification or temporary message
        // For now, we'll just log it
        console.log("[Song Guess]", message);
      });

      // Listen for challenge results
      socketRef.current.on("challenge_result", (result) => {
        console.log("[App] Challenge result:", result);
        const message = result.challengeWon 
          ? `${result.challengerName} won the challenge! They placed the card correctly.`
          : `${result.originalPlayerName} defended successfully. ${result.challengerName}'s challenge failed.`;
        
        // You could show this in a toast notification or temporary message
        // For now, we'll just log it
        console.log("[Challenge]", message);
      });

      // Listen for music stop events
      socketRef.current.on("stop_music", (data) => {
        console.log("[App] Received stop_music event:", data);
        console.log("[App] Current state:", { isCreator, spotifyDeviceId: !!spotifyDeviceId, isPlayingMusic });
        
        // Always reset music state for all players
        setIsPlayingMusic(false);
        
        // CRITICAL FIX: Check if we have Spotify token (indicates creator) AND device
        const hasSpotifyToken = !!localStorage.getItem('access_token');
        
        console.log("[App] Debug state check:", {
          hasSpotifyToken,
          spotifyDeviceId,
          spotifyDeviceIdType: typeof spotifyDeviceId,
          spotifyDeviceIdTruthy: !!spotifyDeviceId
        });
        
        if (hasSpotifyToken && spotifyDeviceId) {
          console.log("[App] Stopping Spotify playback due to:", data.reason);
          pauseSpotifyPlayback();
        } else if (hasSpotifyToken && !spotifyDeviceId) {
          console.log("[App] Creator but no device yet - deviceId:", spotifyDeviceId);
        } else {
          console.log("[App] Not creator, no pause needed");
        }
      });

      // Listen for new song loaded events
      socketRef.current.on("new_song_loaded", (data) => {
        console.log("[App] New song loaded:", data);
        
        // Reset progress bar and show loading state for all players
        setIsPlayingMusic(false);
        
        // CRITICAL FIX: Check if we have Spotify token (indicates creator) AND device
        const hasSpotifyToken = !!localStorage.getItem('access_token');
        
        console.log("[App] New song autoplay check:", { 
          hasSpotifyToken, 
          spotifyDeviceId: !!spotifyDeviceId,
          deviceIdType: typeof spotifyDeviceId,
          actualDeviceId: spotifyDeviceId
        });
        
        // Auto-start music for creators when new song loads
        if (hasSpotifyToken && spotifyDeviceId) {
          console.log("[App] Creator detected, triggering autoplay for new song");
          setTimeout(() => {
            console.log("[App] Setting isPlayingMusic to true for autoplay");
            setIsPlayingMusic(true);
          }, 1500); // Delay to ensure song loads
        } else {
          console.log("[App] Not creator, waiting for progress sync from creator");
        }
      });

      // Listen for progress synchronization from creator
      socketRef.current.on("progress_sync", (data) => {
        console.log("[App] Received progress sync:", data);
        // This is for non-creators to sync their progress with creator
        if (!localStorage.getItem('access_token')) {
          setIsPlayingMusic(data.isPlaying);
          // Additional progress sync logic will be handled in GameFooter
        }
      });

      // Listen for new song requests (creator only)
      socketRef.current.on("new_song_request", (data) => {
        console.log("[App] Received new song request:", data);
        // This will be handled in GameFooter component
      });
      // Handle being kicked
      socketRef.current.on("kicked", () => {
        alert("You have been kicked from the lobby.");
        setView("landing");
        setPlayers([]);
        setRoomCode("");
        setPlayerName("");
        setIsCreator(false);
      });
      socketRef.current.on("connect_error", (err) => {
        console.error("[Socket] Connection error:", err);
      });
    }
    // Cleanup on unmount
    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
    // eslint-disable-next-line
  }, []);

  // Generate random 4-digit numeric code
  function randomCode() {
    return Math.floor(1000 + Math.random() * 9000).toString();
  }

  // Generate random player ID
  function randomId() {
    return Math.random().toString(36).substring(2, 10);
  }

  // Validate Spotify token and handle expiration
  const validateSpotifyToken = async (token) => {
    if (!token) return false;
    
    try {
      const response = await fetch('https://api.spotify.com/v1/me', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.status === 401) {
        console.log("[Spotify] Token expired, clearing invalid token");
        localStorage.removeItem('access_token');
        setSpotifyToken(null);
        return false;
      }
      
      return response.ok;
    } catch (error) {
      console.error("[Spotify] Error validating token:", error);
      return false;
    }
  };

  // Handle Spotify re-authentication while preserving game state
  const handleSpotifyReauth = () => {
    console.log("[Spotify] Token expired, initiating re-authentication");
    
    // Save current game state
    const gameState = {
      view,
      playerName,
      roomCode,
      isCreator,
      players,
      currentPlayerId,
      phase,
      timeline,
      deck,
      currentCard,
      feedback,
      showFeedback,
      lastPlaced,
      removingId,
      challenge,
      gameRound,
      gameSettings,
      timestamp: Date.now()
    };
    
    localStorage.setItem('game_state_backup', JSON.stringify(gameState));
    localStorage.setItem('pending_reauth', 'true');
    
    // Redirect to Spotify login
    window.location.href = `${API_BASE_URL}/login`;
  };

  // Restore game state after re-authentication
  const restoreGameState = () => {
    const savedState = localStorage.getItem('game_state_backup');
    const pendingReauth = localStorage.getItem('pending_reauth');
    
    if (savedState && pendingReauth) {
      try {
        const gameState = JSON.parse(savedState);
        
        // Check if backup is recent (within 10 minutes)
        if (Date.now() - gameState.timestamp < 10 * 60 * 1000) {
          console.log("[Spotify] Restoring game state after re-authentication");
          
          setView(gameState.view);
          setPlayerName(gameState.playerName);
          setRoomCode(gameState.roomCode);
          setIsCreator(gameState.isCreator);
          setPlayers(gameState.players);
          setCurrentPlayerId(gameState.currentPlayerId);
          setPhase(gameState.phase);
          setTimeline(gameState.timeline);
          setDeck(gameState.deck);
          setCurrentCard(gameState.currentCard);
          setFeedback(gameState.feedback);
          setShowFeedback(gameState.showFeedback);
          setLastPlaced(gameState.lastPlaced);
          setRemovingId(gameState.removingId);
          setChallenge(gameState.challenge);
          setGameRound(gameState.gameRound);
          setGameSettings(gameState.gameSettings);
          
          // Clear backup
          localStorage.removeItem('game_state_backup');
          localStorage.removeItem('pending_reauth');
          
          return true;
        }
      } catch (error) {
        console.error("[Spotify] Error restoring game state:", error);
      }
      
      // Clear old backup
      localStorage.removeItem('game_state_backup');
      localStorage.removeItem('pending_reauth');
    }
    
    return false;
  };

  // Fetch real songs from Spotify with music preferences
  const fetchSpotifySongs = async (musicPreferences = null) => {
    try {
      console.log("[Spotify] Fetching songs from backend with preferences:", musicPreferences);
      const response = await fetch(`${API_BASE_URL}/api/fetch-songs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          musicPreferences: musicPreferences || gameSettings.musicPreferences,
          difficulty: gameSettings.difficulty,
          playerCount: players.length || 2
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      console.log("[Spotify] Successfully fetched", data.tracks.length, "songs");
      console.log("[Spotify] Metadata:", data.metadata);
      
      // Check for warnings and display them
      if (data.metadata.warning) {
        console.warn("[Spotify] Warning:", data.metadata.warning);
        // You could show this warning in the UI if needed
      }
      
      return data;
    } catch (error) {
      console.error("[Spotify] Error fetching songs:", error);
      return null;
    }
  };

  // Spotify player event handlers
  const handlePlayerReady = (deviceId) => {
    console.log("[Spotify] Player ready with device ID:", deviceId);
    setSpotifyDeviceId(deviceId);
    console.log("[Spotify] Device state updated, deviceId now:", deviceId);
  };

  const handlePlayerStateChange = (state) => {
    // Removed excessive logging - only update state
    if (state) {
      setIsPlayingMusic(!state.paused);
    }
  };

  // Trigger music playback when a card is placed
  const triggerMusicPlayback = (card) => {
    if (isCreator && card && card.uri) {
      console.log("[Spotify] Triggering playback for:", card.title);
      setIsPlayingMusic(true);
    }
  };

  // Function to pause Spotify playback with enhanced error handling
  const pauseSpotifyPlayback = async () => {
    if (!isCreator || !spotifyDeviceId) return false;

    try {
      console.log('[App] Pausing Spotify playback');
      const success = await spotifyAuth.pausePlayback(spotifyDeviceId);
      if (success) {
        setIsPlayingMusic(false);
      }
      return success;
    } catch (error) {
      console.error('[App] Error pausing Spotify playback:', error);
      if (error.message.includes('Token expired')) {
        // Handle token expiration - could trigger re-auth here if needed
        console.log('[App] Token expired during pause operation');
      }
      return false;
    }
  };

  // Create game handler (calls backend)
  // Game creator must have a Spotify token; if not, trigger OAuth first
  const handleCreate = (name) => {
    if (!spotifyToken) {
      localStorage.setItem("pending_create", name);
      setPendingCreate(name);               // ensure state updated so post-OAuth effect runs
      window.location.href = `${API_BASE_URL}/login`;
      return;
    }
    const code = randomCode();
    setPlayerName(name);
    setRoomCode(code);
    setIsCreator(true);
    console.log("[Socket] Emitting create_lobby", { name, code, settings: gameSettings });
    socketRef.current.emit(
      "create_lobby",
      {
        name,
        code,
        settings: gameSettings,
      },
      ({ error, lobby, player }) => {
        console.log("[Socket] create_lobby callback", { error, lobby, player });
        if (error) {
          alert(error);
          setView("landing");
          return;
        }
        setPlayers(lobby.players);
        setGameSettings(lobby.settings);
        setView("waiting");
      }
    );
  };

  // Join game handler (calls backend)
  const handleJoin = (name, code) => {
    setPlayerName(name);
    setRoomCode(code);
    setIsCreator(false);
    console.log("[Socket] Emitting join_lobby", { name, code });
    socketRef.current.emit(
      "join_lobby",
      { name, code },
      ({ error, lobby, player }) => {
        console.log("[Socket] join_lobby callback", { error, lobby, player });
        if (error) {
          alert(error);
          setView("landing");
          return;
        }
        setPlayers(lobby.players);
        setGameSettings(lobby.settings);
        setView("waiting");
      }
    );
  };

  // Ready status handler
  const handleReady = (playerId, isReady) => {
    socketRef.current.emit("set_ready", { code: roomCode, isReady });
  };

  // Kick player handler (host only)
  const handleKick = (playerIdToKick) => {
    if (!window.confirm("Are you sure you want to kick this player?")) return;
    socketRef.current.emit("kick_player", { code: roomCode, playerId: playerIdToKick });
  };

  // Leave game handler
  const handleLeave = () => {
    socketRef.current.emit("leave_lobby", { code: roomCode }, () => {
      setPlayerName("");
      setRoomCode("");
      setIsCreator(false);
      setPlayers([]);
      setView("landing");
    });
  };

  // Update game settings handler
  const handleUpdateSettings = (newSettings) => {
    setGameSettings(newSettings);
    socketRef.current.emit("update_settings", { code: roomCode, settings: newSettings });
  };

  // Start game handler
  const handleStart = async () => {
    console.log("[App] Starting game - fetching fresh songs with current settings...");
    
    // Always fetch fresh songs when starting the game to ensure settings are applied
    try {
      const freshSongsData = await fetchSpotifySongs(gameSettings.musicPreferences);
      if (freshSongsData && freshSongsData.tracks && freshSongsData.tracks.length > 0) {
        console.log("[App] Fresh songs fetched:", freshSongsData.tracks.length);
        
        // Check for warnings and potentially show them to the user
        if (freshSongsData.metadata.warning) {
          const shouldContinue = window.confirm(
            `Warning: ${freshSongsData.metadata.warning}\n\nDo you want to continue with ${freshSongsData.tracks.length} songs, or go back to adjust your music preferences?`
          );
          if (!shouldContinue) {
            throw new Error("User cancelled game start due to song warning");
          }
        }
        
        setRealSongs(freshSongsData.tracks);
        socketRef.current.emit("start_game", { 
          code: roomCode, 
          realSongs: freshSongsData.tracks 
        });
      } else {
        console.warn("[App] No fresh songs fetched, using existing songs or fallback");
        socketRef.current.emit("start_game", { 
          code: roomCode, 
          realSongs: realSongs || null 
        });
      }
    } catch (error) {
      console.error("[App] Error fetching fresh songs for game start:", error);
      
      // If it's a user cancellation, re-throw to let WaitingRoom handle it
      if (error.message.includes("User cancelled")) {
        throw error;
      }
      
      // For other errors, try fallback
      try {
        socketRef.current.emit("start_game", { 
          code: roomCode, 
          realSongs: realSongs || null 
        });
      } catch (fallbackError) {
        console.error("[App] Fallback game start also failed:", fallbackError);
        throw new Error("Failed to start game. Please try again.");
      }
    }
  };

  // Helper: move to next player
  const nextPlayer = () => {
    setCurrentPlayerIdx((idx) => (idx + 1) % players.length);
  };

  // Handler for placing a card in the timeline (only if it's your turn)
  const handlePlaceCard = (index) => {
    console.log("[App] handlePlaceCard called:", {
      index,
      phase,
      playerId: socketRef.current?.id,
      currentPlayerId,
      isMyTurn: socketRef.current?.id === currentPlayerId,
      roomCode,
      socketConnected: !!socketRef.current?.connected
    });
    
    console.log("[App] Starting validation checks...");
    
    if (phase !== 'player-turn') {
      console.log("[App] FAILED: Not player turn, phase:", phase);
      return;
    }
    console.log("[App] PASSED: Phase check");
    
    if (socketRef.current?.id !== currentPlayerId) {
      console.log("[App] FAILED: Not my turn, my ID:", socketRef.current?.id, "current player:", currentPlayerId);
      return;
    }
    console.log("[App] PASSED: Player turn check");
    
    if (!roomCode) {
      console.error("[App] FAILED: No room code available!");
      return;
    }
    console.log("[App] PASSED: Room code check");
    
    if (!socketRef.current?.connected) {
      console.error("[App] FAILED: Socket not connected!");
      return;
    }
    console.log("[App] PASSED: Socket connection check");
    
    console.log("[App] All validations passed! Emitting place_card with data:", { code: roomCode, index });
    console.log("[App] Current roomCode state:", roomCode);
    console.log("[App] Socket ID:", socketRef.current?.id);
    
    // Test if ANY events reach the backend
    console.log("[App] Testing event connectivity...");
    socketRef.current.emit("test_event", { message: "test from player2", code: roomCode });
    
    try {
      socketRef.current.emit("place_card", { code: roomCode, index });
      console.log("[App] place_card emitted successfully to room:", roomCode);
    } catch (error) {
      console.error("[App] Error emitting place_card:", error);
    }
  };

  // Handler to continue after feedback (any player can trigger)
  const handleContinue = () => {
    console.log('[App] handleContinue called:', {
      phase,
      myId: socketRef.current?.id,
      currentPlayerId,
      roomCode,
      showFeedback,
      feedback
    });
    
    if (phase !== 'reveal') {
      console.log('[App] Not in reveal phase, phase is:', phase);
      return;
    }
    
    console.log('[App] Emitting continue_game event to room:', roomCode);
    socketRef.current.emit("continue_game", { code: roomCode });
  };

  // Token actions handler
  const handleUseToken = (action, targetPlayerId = null) => {
    if (!socketRef.current || !roomCode) return;
    socketRef.current.emit("use_token", { code: roomCode, action, targetPlayerId });
  };

  // Song guessing handler
  const handleGuessSong = (title, artist) => {
    if (!socketRef.current || !roomCode) return;
    socketRef.current.emit("guess_song", { code: roomCode, title, artist });
  };

  // Challenge initiation handler
  const handleInitiateChallenge = () => {
    if (!socketRef.current || !roomCode) return;
    socketRef.current.emit("initiate_challenge", { code: roomCode });
  };

  // Challenge response handler
  const handleChallengeResponse = (accept) => {
    if (!socketRef.current || !roomCode) return;
    socketRef.current.emit("challenge_response", { code: roomCode, accept });
  };

  // Skip challenge handler
  const handleSkipChallenge = () => {
    if (!socketRef.current || !roomCode) return;
    socketRef.current.emit("skip_challenge", { code: roomCode });
  };

  // Skip song guess handler
  const handleSkipSongGuess = () => {
    if (!socketRef.current || !roomCode) return;
    socketRef.current.emit("skip_song_guess", { code: roomCode });
  };

  // Challenge card placement handler
  const handleChallengePlaceCard = (index) => {
    if (!socketRef.current || !roomCode) return;
    if (phase !== 'challenge') return;
    if (challenge?.challengerId !== socketRef.current.id) return;
    
    socketRef.current.emit("challenge_place_card", { code: roomCode, index });
  };

  // Continue after challenge resolution handler
  const handleContinueAfterChallenge = () => {
    console.log("[App] Continue after challenge clicked");
    if (!socketRef.current || !roomCode) {
      console.log("[App] Missing socket or room code:", { socket: !!socketRef.current, roomCode });
      return;
    }
    console.log("[App] Emitting continue_after_challenge for room:", roomCode);
    socketRef.current.emit("continue_after_challenge", { code: roomCode });
  };

  // Token spending stub (expand for skip/challenge/free pass)
  const spendToken = (playerIdx) => {
    setPlayers((prev) => prev.map((p, i) => i === playerIdx ? { ...p, tokens: Math.max(0, p.tokens - 1) } : p));
  };

  // Reset game
  const resetGame = () => {
    setPlayers([]);
    setCurrentPlayerIdx(0);
    setTimeline([fakeSongs[0]]);
    setDeck(fakeSongs.slice(1));
    setCurrentCard(fakeSongs[1]);
    setFeedback(null);
    setShowFeedback(false);
    setPhase('player-turn');
    setLastPlaced(null);
    setRemovingId(null);
    setGameRound(1);
  };

  useEffect(() => {
    let intervalId;
    if (phase === 'challenge' && roomCode) {
      console.log("[App] Challenge phase active. Cancelling auto-proceed timer.");
      // Immediately cancel auto-proceed
      socketRef.current.emit("cancel_auto_proceed", { code: roomCode });
      // Then repeatedly cancel auto-proceed every second
      intervalId = setInterval(() => {
        console.log("[App] Re-sending cancel_auto_proceed to prevent auto progression.");
        socketRef.current.emit("cancel_auto_proceed", { code: roomCode });
      }, 1000);
    }
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [phase, roomCode]);

  // Trigger music playback when it's a new player's turn and there's a new card
  useEffect(() => {
    if (isCreator && phase === 'player-turn' && currentCard && currentCard.uri && spotifyDeviceId) {
      console.log("[Spotify] New turn detected, triggering playback for:", currentCard.title);
      setIsPlayingMusic(false); // Reset first
      setTimeout(() => {
        setIsPlayingMusic(true); // Then trigger playback
      }, 100);
    }
  }, [phase, currentCard, isCreator, spotifyDeviceId]);

  // Add user interaction listener for Safari audio unlock
  useEffect(() => {
    const unlockAudio = () => {
      // Create a silent audio context to unlock audio on Safari
      try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        gainNode.gain.value = 0;
        oscillator.start();
        oscillator.stop(audioContext.currentTime + 0.1);
        
        console.log('[Audio] Safari audio unlocked');
        
        // Remove the listener after first interaction
        document.removeEventListener('touchstart', unlockAudio);
        document.removeEventListener('click', unlockAudio);
      } catch (error) {
        console.log('[Audio] Error unlocking audio:', error);
      }
    };

    // Add listeners for first user interaction
    document.addEventListener('touchstart', unlockAudio, { once: true });
    document.addEventListener('click', unlockAudio, { once: true });

    return () => {
      document.removeEventListener('touchstart', unlockAudio);
      document.removeEventListener('click', unlockAudio);
    };
  }, []);

  // Additional effect to trigger playback when device becomes ready
  useEffect(() => {
    if (isCreator && spotifyDeviceId && phase === 'player-turn' && currentCard && currentCard.uri) {
      console.log("[Spotify] Device ready, triggering playback for current card:", currentCard.title);
      setIsPlayingMusic(false); // Reset first
      setTimeout(() => {
        setIsPlayingMusic(true); // Then trigger playback
      }, 100);
    }
  }, [spotifyDeviceId]);

  // Fetch Spotify songs when creator enters waiting room (for preview/testing)
  useEffect(() => {
    if (isCreator && view === 'waiting') {
      console.log("[Spotify] Pre-fetching songs for preview (fresh songs will be fetched on game start)...");
      fetchSpotifySongs().then((songsData) => {
        if (songsData && songsData.tracks && songsData.tracks.length > 0) {
          setRealSongs(songsData.tracks);
          console.log("[Spotify] Preview songs loaded");
        }
      });
    }
  }, [isCreator, view]);

  // Clear songs when settings change to force fresh fetch on game start
  useEffect(() => {
    if (isCreator) {
      console.log("[Spotify] Settings changed, will fetch fresh songs on game start");
      setRealSongs(null); // Clear existing songs to force fresh fetch
    }
  }, [gameSettings.musicPreferences, isCreator]);

    // Show Spotify login ONLY when the user is (or will be) the host
  if (isCreator && !spotifyToken) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-900">
        <a href={`${API_BASE_URL}/login`} className="px-6 py-3 bg-green-500 text-white rounded">
          Login with Spotify
        </a>
      </div>
    );
  }

  if (view === "landing") {
    return <Landing onCreate={handleCreate} onJoin={handleJoin} />;
  }
  if (view === "waiting") {
    const currentPlayer = players.find((p) => p.name === playerName) || {};
    return (
      <WaitingRoom
        code={roomCode}
        players={players}
        currentPlayer={currentPlayer}
        onReady={handleReady}
        onKick={handleKick}
        onStart={handleStart}
        onLeave={handleLeave}
        settings={gameSettings}
        onUpdateSettings={handleUpdateSettings}
      />
    );
  }
  if (view === 'game') {
    const currentCard = deck && deck.length > 0 ? deck[0] : null;
    const isMyTurn = socketRef.current?.id === currentPlayerId;
    const currentPlayerName = players && players.length > 0 && currentPlayerId
      ? (players.find((p) => p.id === currentPlayerId)?.name || "Unknown")
      : "Unknown";
    
    console.log("[App] Render game view:", {
      myId: socketRef.current?.id,
      currentPlayerId,
      isMyTurn,
      currentCard,
      phase,
      roomCode
    });
    
    return (
      <DndProvider backend={HTML5Backend}>
        <div className="min-h-screen bg-gray-900 text-white flex flex-col">
          <PlayerHeader players={players} currentPlayerId={currentPlayerId} />
          <div className="sticky hidden top-0 z-20 bg-gray-900 bg-opacity-95  py-3 md:py-4 px-1">
            <h1 className="text-lg md:text-xl font-semibold text-center">
              {isMyTurn
                ? "Your turn"
                : `${currentPlayerName}'s turn`}
            </h1>
          </div>
          <div className="flex-1 flex flex-col items-center justify-center p-1 md:p-2 pb-20 md:pb-24">
            {/* Hidden Spotify Player for initialization only */}
            {isCreator && spotifyToken && (
              <div style={{ display: 'none' }}>
                <SpotifyPlayer
                  token={spotifyToken}
                  currentTrack={currentCard}
                  isPlaying={isPlayingMusic}
                  onPlayerReady={handlePlayerReady}
                  onPlayerStateChange={handlePlayerStateChange}
                />
              </div>
            )}
            
            <TimelineBoard
              timeline={timeline || []}
              currentCard={currentCard}
              onPlaceCard={phase === 'challenge' ? handleChallengePlaceCard : handlePlaceCard}
              feedback={feedback}
              showFeedback={showFeedback}
              lastPlaced={lastPlaced}
              removingId={removingId}
              phase={phase}
              isMyTurn={isMyTurn}
              gameRound={gameRound}
              challenge={challenge}
              onChallengePlaceCard={handleChallengePlaceCard}
              isPlayingMusic={isPlayingMusic}
            />
          </div>
          <GameFooter
            currentCard={currentCard}
            showFeedback={showFeedback}
            feedback={feedback}
            onContinue={handleContinue}
            onRestart={resetGame}
            players={players || []}
            currentPlayerId={currentPlayerId}
            myPlayerId={socketRef.current?.id}
            isMyTurn={isMyTurn}
            phase={phase}
            onUseToken={handleUseToken}
            onGuessSong={handleGuessSong}
            challenge={challenge}
            onChallengeResponse={handleChallengeResponse}
            onInitiateChallenge={handleInitiateChallenge}
            onContinueAfterChallenge={handleContinueAfterChallenge}
            onSkipChallenge={handleSkipChallenge}
            onSkipSongGuess={handleSkipSongGuess}
            spotifyDeviceId={spotifyDeviceId}
            isPlayingMusic={isPlayingMusic}
            isCreator={isCreator}
            socketRef={socketRef}
            roomCode={roomCode}
          />
          
          {/* Debug Panel */}
          <SongDebugPanel
            roomCode={roomCode}
            isVisible={showDebugPanel}
            onClose={() => setShowDebugPanel(false)}
          />
          
          {/* Debug Panel Toggle Button */}
          <button
            onClick={() => setShowDebugPanel(!showDebugPanel)}
            className="fixed bottom-4 right-4 bg-yellow-600 hover:bg-yellow-500 text-white p-2 rounded-full shadow-lg z-40 text-xs font-medium"
            title="Toggle Song Debug Panel (Ctrl+D / Cmd+D)"
          >
            🐛
          </button>
        </div>
      </DndProvider>
    );
  }
  return null;
}

export default App;
