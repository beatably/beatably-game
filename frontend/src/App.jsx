import React, { useState, useEffect, useRef } from "react";
import { io } from "socket.io-client";
import TimelineBoard from "./TimelineBoard";
import PlayerHeader from "./PlayerHeader";
import GameFooter from "./GameFooter";
import Landing from "./Landing";
import WaitingRoom from "./WaitingRoom";
import SpotifyPlayer from "./SpotifyPlayer";
import SongDebugPanel from "./SongDebugPanel";
import SongGuessNotification from "./SongGuessNotification";
import SessionRestore from "./SessionRestore";
import spotifyAuth from "./utils/spotifyAuth";
import sessionManager from "./utils/sessionManager";
import './App.css';
import WinnerView from "./WinnerView";
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { API_BASE_URL, SOCKET_URL } from './config';


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

      // Do NOT auto-transfer on load; this can override user's device choice unintentionally.
      // If needed, the user can switch devices via the UI.
      // spotifyAuth.transferToStoredDevice();
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
        winCondition: 10,
        musicPreferences: {
          genres: ['pop', 'rock', 'hip-hop', 'electronic', 'indie', 'R&B', 'Reggae', 'Funk', 'Country', 'Jazz', 'Alternative'],
          yearRange: { min: 2015, max: 2025 },
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
  const [timeline, setTimeline] = useState([]);
  const [deck, setDeck] = useState([]);
  const [currentCard, setCurrentCard] = useState(null);
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
    winCondition: 10,
    musicPreferences: {
      genres: ['pop', 'rock', 'hip-hop', 'electronic', 'indie', 'R&B', 'Reggae', 'Funk', 'Country', 'Jazz', 'Alternative'],
      yearRange: { min: 2015, max: 2025 },
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
  const [showDebugButton, setShowDebugButton] = useState(false);

  // Song guess notification state
  const [songGuessNotification, setSongGuessNotification] = useState(null);
  const [tokenAnimations, setTokenAnimations] = useState({});
  // Winner screen state
  const [winner, setWinner] = useState(null);
  const [showWinnerView, setShowWinnerView] = useState(false);
  
  // Drag state for UI adjustments
  const [isDragging, setIsDragging] = useState(false);

  // Pending drop confirmation state
  const [pendingDropIndex, setPendingDropIndex] = useState(null);
  const [previewTimeline, setPreviewTimeline] = useState(null);

  // Session management state
  const [sessionId, setSessionId] = useState(null);
  const [showSessionRestore, setShowSessionRestore] = useState(false);
  const [sessionRestoreData, setSessionRestoreData] = useState(null);
  const [isRestoring, setIsRestoring] = useState(false);

  // Load showDebugButton state from localStorage
  useEffect(() => {
    const savedShowDebugButton = localStorage.getItem('showSongsButton');
    if (savedShowDebugButton !== null) {
      setShowDebugButton(savedShowDebugButton === 'true');
    }
  }, []);

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

  // Check for existing session on app load
  useEffect(() => {
    const checkForExistingSession = () => {
      if (sessionManager.hasValidSession()) {
        const sessionData = sessionManager.getSession();
        console.log('[SessionManager] Found existing session:', sessionData);
        setSessionRestoreData(sessionData);
        setShowSessionRestore(true);
      }
    };

    // Only check for session if we're on the landing page and not already restoring
    if (view === 'landing' && !isRestoring && !showSessionRestore) {
      checkForExistingSession();
    }
  }, [view, isRestoring, showSessionRestore]);

  // Handle device lock/unlock for iOS Safari fullscreen mode
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        console.log('[App] Device unlocked - checking for session restoration');
        
        // Check if we have a valid session and are in game/waiting view
        if ((view === 'game' || view === 'waiting') && sessionManager.hasValidSession()) {
          const sessionData = sessionManager.getSession();
          console.log('[App] Found session after unlock:', sessionData);
          
          // Attempt to reconnect if socket is available
          if (socketRef.current && socketRef.current.connected) {
            console.log('[App] Attempting automatic reconnection after unlock');
            socketRef.current.emit('reconnect_session', {
              sessionId: sessionData.sessionId,
              roomCode: sessionData.roomCode,
              playerName: sessionData.playerName
            }, (response) => {
              if (response.success) {
                console.log('[App] Successfully reconnected after device unlock');
                // Update state with reconnection response
                if (response.view === 'waiting') {
                  setPlayers(response.lobby.players);
                  setGameSettings(response.lobby.settings || gameSettings);
                } else if (response.view === 'game') {
                  const gameState = response.gameState;
                  setPlayers(gameState.players);
                  setCurrentPlayerIdx(gameState.currentPlayerIdx || 0);
                  setTimeline(gameState.timeline || []);
                  setDeck(gameState.deck || []);
                  setPhase(gameState.phase);
                  setFeedback(gameState.feedback);
                  setShowFeedback(!!gameState.feedback && gameState.phase === 'reveal');
                  setLastPlaced(gameState.lastPlaced);
                  setRemovingId(gameState.removingId);
                  setChallenge(gameState.challenge);
                  setCurrentPlayerId(gameState.currentPlayerId);
                }
              } else {
                console.warn('[App] Reconnection failed after unlock:', response.error);
              }
            });
          }
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [view, gameSettings]);

  // Save session data whenever important state changes
  useEffect(() => {
    if (sessionId && (view === 'waiting' || view === 'game') && roomCode && playerName) {
      const currentState = {
        sessionId,
        roomCode,
        playerName,
        playerId: socketRef.current?.id,
        isCreator,
        view,
        players,
        gameSettings,
        currentPlayerId,
        currentPlayerIdx,
        phase,
        timeline,
        deck,
        gameRound,
        feedback,
        lastPlaced,
        challenge
      };
      
      sessionManager.saveSession(sessionManager.createSessionData(currentState));
    }
  }, [sessionId, view, roomCode, playerName, isCreator, players, gameSettings, 
      currentPlayerId, currentPlayerIdx, phase, timeline, deck, gameRound, 
      feedback, lastPlaced, challenge]);

  // Handle page visibility change and beforeunload for session backup
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (view === 'game' || view === 'waiting') {
        const currentState = {
          sessionId,
          roomCode,
          playerName,
          playerId: socketRef.current?.id,
          isCreator,
          view,
          players,
          gameSettings,
          currentPlayerId,
          currentPlayerIdx,
          phase,
          timeline,
          deck,
          gameRound,
          feedback,
          lastPlaced,
          challenge
        };
        sessionManager.handleVisibilityChange(currentState);
      }
    };

    const handleBeforeUnload = () => {
      if (view === 'game' || view === 'waiting') {
        const currentState = {
          sessionId,
          roomCode,
          playerName,
          playerId: socketRef.current?.id,
          isCreator,
          view,
          players,
          gameSettings,
          currentPlayerId,
          currentPlayerIdx,
          phase,
          timeline,
          deck,
          gameRound,
          feedback,
          lastPlaced,
          challenge
        };
        sessionManager.handleBeforeUnload(currentState);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [sessionId, view, roomCode, playerName, isCreator, players, gameSettings,
      currentPlayerId, currentPlayerIdx, phase, timeline, deck, gameRound,
      feedback, lastPlaced, challenge]);

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
      phase: game.phase,
      deckLength: game.deck?.length || 0,
      winner: game.winner
    });

    // If already showing winner, ignore further updates to avoid UI flicker
    if (showWinnerView && winner) {
      return;
    }

    // Show winner view immediately when game over with winner info
    if (game.phase === 'game-over' && game.winner) {
      console.log("[App] Game over detected, showing winner view");
      setWinner(game.winner);
      setShowWinnerView(true);
      // Stop any Spotify playback if creator
      if (isCreator && spotifyDeviceId) {
        pauseSpotifyPlayback();
      }
      return;
    }
    
    // CRITICAL FIX: Validate deck state and handle empty deck
    if (!game.deck || game.deck.length === 0) {
      console.warn("[App] Empty deck received in game update");
      if (game.phase !== 'game-over') {
        console.error("[App] ERROR: Empty deck but game not over!");
        // Attempt to request fresh state from backend
        if (socketRef.current && roomCode) {
          console.log("[App] Requesting game state refresh...");
          socketRef.current.emit("request_game_state", { code: roomCode });
        }
      }
    }

        // Store challengeWindow info globally for use in GameFooter
        if (game.phase === "challenge-window" && game.challenge && game.challenge.challengeWindow) {
          window.latestChallengeWindow = game.challenge.challengeWindow;
        } else if (game.phase === "challenge-window" && game.challengeWindow) {
          window.latestChallengeWindow = game.challengeWindow;
        } else {
          window.latestChallengeWindow = null;
        }

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
        
        // Play audio feedback
        const audioFile = result.correct ? '/sounds/correct_guess.mp3' : '/sounds/incorrect_guess.mp3';
        try {
          const audio = new Audio(audioFile);
          audio.volume = 0.5;
          audio.play().catch(err => console.log('[Audio] Could not play sound:', err));
        } catch (error) {
          console.log('[Audio] Error creating audio:', error);
        }
        
        // Calculate tokens earned (check for double points)
        const player = players.find(p => p.id === result.playerId);
        const tokensEarned = result.correct ? (player?.doublePoints ? 2 : 1) : 0;
        
        // Show notification
        setSongGuessNotification({
          playerName: result.playerName,
          correct: result.correct,
          title: result.title,
          artist: result.artist,
          tokensEarned: tokensEarned
        });
        
        // Trigger token animation if correct
        if (result.correct && result.playerId) {
          setTokenAnimations(prev => ({
            ...prev,
            [result.playerId]: tokensEarned
          }));
          
          // Clear animation after 3 seconds
          setTimeout(() => {
            setTokenAnimations(prev => {
              const newState = { ...prev };
              delete newState[result.playerId];
              return newState;
            });
          }, 3000);
        }
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

    // Mark intent to autoplay next concrete URI if this stop was caused by a new song
    if (data?.reason === 'new_song') {
      window.__beatablyPendingAutoplay = true;
      console.log("[App] Marked pending autoplay for upcoming new song URI.");
    }
    // Also mark intent when a skip/new song is requested via token to guarantee autoplay on payload
    if (data?.reason === 'skip_song') {
      window.__beatablyPendingAutoplay = true;
      console.log("[App] Marked pending autoplay for skip_song payload.");
    }
    
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

    // Reset progress UI state for all players
    setIsPlayingMusic(false);

    // Treat presence of a Spotify token as creator indicator
    const hasSpotifyToken = !!localStorage.getItem('access_token');

    // Extract URI from payload if available; otherwise we will wait for currentCard update
    const payloadUri =
      data?.uri ||
      data?.trackUri ||
      data?.card?.uri ||
      (Array.isArray(data?.uris) ? data.uris[0] : null) ||
      null;

    // Resolve the locked device (explicit user selection), if any
    const lockedDevice = localStorage.getItem('spotify_device_id');

    console.log("[App] New song autoplay check:", {
      hasSpotifyToken,
      haveDevice: !!spotifyDeviceId,
      payloadUri,
      lockedDevice,
      deviceIdType: typeof spotifyDeviceId,
      actualDeviceId: spotifyDeviceId,
    });

    // Creator autoplay path with strict gating: never resume without a concrete new URI
    if (hasSpotifyToken) {
      // iOS Safari gating
      if (window.beatablyPlayback && !window.beatablyPlayback.isUnlocked()) {
        console.log("[App] Autoplay blocked (needs gesture). Will require user tap to play.");
        return;
      }

      // If no URI in payload, do NOT attempt playback here. The URI-change effect will handle autoplay once currentCard updates.
      if (!payloadUri) {
        console.log("[App] No URI in payload; deferring autoplay until currentCard.uri updates.");
        return;
      }

      // If a user-selected device exists (lockedDevice), ALWAYS use it and never discover SDK/web device
      if (lockedDevice) {
        (async () => {
          try {
            console.log("[App] Using locked device for autoplay:", lockedDevice);
            // Wake the locked device if needed then start playback
            await pauseSpotifyPlayback().catch(() => {});
            // If the locked device isn't currently active, transfer to wake it (without auto-play)
            await spotifyAuth.transferPlayback(lockedDevice, false);
            setTimeout(async () => {
              try {
                const ok = await spotifyAuth.verifiedStartPlayback(
                  lockedDevice,
                  payloadUri,
                  0,
                  { pauseFirst: true, transferFirst: false, maxVerifyAttempts: 4, verifyDelayMs: 250 }
                );
                if (ok) setIsPlayingMusic(true);
              } catch (e) {
                console.warn("[App] Error starting on locked device after transfer:", e?.message || e);
              }
            }, 200);
          } catch (e) {
            console.warn("[App] Locked-device autoplay flow failed:", e?.message || e);
          }
        })();
        return;
      }

      // No locked device: If current state device is not ready, set intent and discover a candidate (SDK or active device)
      if (!spotifyDeviceId) {
        console.log("[App] Device not ready; setting autoplay intent and starting discovery for payload URI.");
        window.__beatablyPendingAutoplay = true;

        (async () => {
          try {
            const stored = spotifyAuth.getStoredDeviceId();
            const devices = await spotifyAuth.getDevices();
            let candidate = null;

            // Prefer Beatably/Web Player device name
            candidate = devices.find(d => d.name?.toLowerCase().includes('beatably') || d.name?.toLowerCase().includes('web player'));
            if (!candidate) candidate = devices.find(d => d.is_active);
            if (!candidate && stored) candidate = devices.find(d => d.id === stored);

            if (candidate?.id) {
              console.log("[App] Payload flow discovered candidate device:", {
                id: candidate.id,
                name: candidate.name,
                is_active: candidate.is_active
              });
              spotifyAuth.storeDeviceId(candidate.id);
              setSpotifyDeviceId(candidate.id);

              // If not active, transfer first then start
              if (!candidate.is_active) {
                await spotifyAuth.transferPlayback(candidate.id, false);
                setTimeout(async () => {
                  try {
                    await pauseSpotifyPlayback().catch(()=>{});
                    const ok = await spotifyAuth.verifiedStartPlayback(
                      candidate.id,
                      payloadUri,
                      0,
                      { pauseFirst: true, transferFirst: false, maxVerifyAttempts: 4, verifyDelayMs: 250 }
                    );
                    if (ok) setIsPlayingMusic(true);
                  } catch (e) {
                    console.warn("[App] Error starting after device discovery/transfer:", e?.message || e);
                  }
                }, 200);
              } else {
                // Active: start directly
                try {
                  await pauseSpotifyPlayback().catch(()=>{});
                  const ok = await spotifyAuth.verifiedStartPlayback(
                    candidate.id,
                    payloadUri,
                    0,
                    { pauseFirst: true, transferFirst: false, maxVerifyAttempts: 4, verifyDelayMs: 250 }
                  );
                  if (ok) setIsPlayingMusic(true);
                } catch (e) {
                  console.warn("[App] Error starting on active discovered device:", e?.message || e);
                }
              }
            } else if (stored) {
              console.log("[App] No candidate device visible; attempting transfer to stored device to wake it:", stored);
              await spotifyAuth.transferPlayback(stored, false);
              setTimeout(async () => {
                try {
                  await pauseSpotifyPlayback().catch(()=>{});
                  const ok = await spotifyAuth.verifiedStartPlayback(
                    stored,
                    payloadUri,
                    0,
                    { pauseFirst: true, transferFirst: false, maxVerifyAttempts: 4, verifyDelayMs: 250 }
                  );
                  if (ok) setIsPlayingMusic(true);
                } catch (e) {
                  console.warn("[App] Error starting on stored device after transfer:", e?.message || e);
                }
              }, 250);
            } else {
              console.log("[App] No devices discovered; will rely on URI-change/deviceId effect.");
            }
          } catch (e) {
            console.warn("[App] Device discovery errored in payload flow:", e?.message || e);
          }
        })();

        return;
      }

      // At this point we have token, deviceId and a concrete new URI. Start explicit playback now.
      (async () => {
        try {
          console.log("[App] Starting explicit playback for payload URI:", payloadUri);
          await pauseSpotifyPlayback().catch(()=>{});
          // Prefer current selected spotifyDeviceId to preserve user choice (no discovery here)
          const targetDeviceId = spotifyDeviceId || spotifyAuth.getStoredDeviceId();
          const ok = await spotifyAuth.verifiedStartPlayback(
            targetDeviceId,
            payloadUri,
            0,
            { pauseFirst: true, transferFirst: false, maxVerifyAttempts: 4, verifyDelayMs: 250 }
          );
          if (ok) {
            setIsPlayingMusic(true);
          } else {
            console.log("[App] verifiedStartPlayback returned false for payload URI; will rely on URI-change effect if currentCard updates.");
          }
        } catch (e) {
          console.warn("[App] Error during explicit payload playback:", e?.message || e);
        }
      })();
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

    // IMPORTANT: Do NOT override a user-selected device with SDK device.
    // If a user already picked a device (spotifyDeviceId set) and it differs from the SDK device,
    // keep the user's device to prevent silent reversion to "Beatably Game Player".
    setSpotifyDeviceId(prev => {
      if (prev && prev !== deviceId) {
        console.log("[Spotify] Preserving user-selected device over SDK device:", { selected: prev, sdk: deviceId });
        return prev;
      }
      return deviceId;
    });

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

  // Attempt to ensure audio is unlocked on first meaningful user gesture.
  // This reduces friction on iOS Safari so that future auto-plays succeed.
  useEffect(() => {
    const handler = async () => {
      if (window.beatablyPlayback && !window.beatablyPlayback.isUnlocked()) {
        const ok = await window.beatablyPlayback.ensureUnlockedViaGesture();
        console.log('[Audio] Early unlock attempted, result:', ok);
      }
      document.removeEventListener('click', handler);
      document.removeEventListener('touchstart', handler);
    };
    document.addEventListener('click', handler, { once: true });
    document.addEventListener('touchstart', handler, { once: true });
    return () => {
      document.removeEventListener('click', handler);
      document.removeEventListener('touchstart', handler);
    };
  }, []);

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

  // Handler for device switching
  const handleDeviceSwitch = async (newDeviceId) => {
    console.log('[App] Switching Spotify device from', spotifyDeviceId, 'to', newDeviceId);
    try {
      // Persist and set user's explicit selection immediately
      spotifyAuth.storeDeviceId(newDeviceId);
      setSpotifyDeviceId(newDeviceId);

      // If currently playing music, transfer playback to the selected device and keep playing
      if (isPlayingMusic && currentCard?.uri) {
        console.log('[App] Transferring active playback to new device:', newDeviceId);
        await spotifyAuth.transferPlayback(newDeviceId, false);
        setTimeout(async () => {
          try {
            const success = await spotifyAuth.startPlayback(newDeviceId, currentCard.uri, 0);
            if (success) {
              console.log('[App] Successfully started playback on new device:', newDeviceId);
              setIsPlayingMusic(true);
            }
          } catch (error) {
            console.error('[App] Error starting playback on new device:', error);
          }
        }, 300);
      }
      console.log('[App] Device switch completed successfully');
    } catch (error) {
      console.error('[App] Error during device switch:', error);
    }
  };

  // Session restoration handlers
  const handleRestoreSession = async () => {
    if (!sessionRestoreData) return;
    
    setIsRestoring(true);
    console.log('[SessionManager] Attempting to restore session:', sessionRestoreData);
    
    try {
      // Attempt to reconnect to the backend
      if (socketRef.current && socketRef.current.connected) {
        socketRef.current.emit('reconnect_session', {
          sessionId: sessionRestoreData.sessionId,
          roomCode: sessionRestoreData.roomCode,
          playerName: sessionRestoreData.playerName
        }, (response) => {
          console.log('[SessionManager] Reconnection response:', response);
          
          if (response.error) {
            console.error('[SessionManager] Reconnection failed:', response.error);
            alert(`Failed to rejoin game: ${response.error}`);
            sessionManager.clearSession();
            setShowSessionRestore(false);
            setIsRestoring(false);
            return;
          }
          
          if (response.success) {
            console.log('[SessionManager] Successfully reconnected to:', response.view);
            
            // Restore app state
            setSessionId(sessionRestoreData.sessionId);
            setPlayerName(sessionRestoreData.playerName);
            setRoomCode(sessionRestoreData.roomCode);
            setIsCreator(sessionRestoreData.isCreator);
            setPlayerId(socketRef.current.id);
            
            if (response.view === 'waiting') {
              setPlayers(response.lobby.players);
              setGameSettings(response.lobby.settings || gameSettings);
              setView('waiting');
            } else if (response.view === 'game') {
              const gameState = response.gameState;
              setPlayers(gameState.players);
              setCurrentPlayerIdx(gameState.currentPlayerIdx || 0);
              
              // CRITICAL FIX: The backend sends the reconnecting player's timeline,
              // but the frontend needs to show the current player's timeline.
              // We'll let the game_update event handle the timeline display.
              setTimeline(gameState.timeline || []);
              
              setDeck(gameState.deck || []);
              setPhase(gameState.phase);
              setFeedback(gameState.feedback);
              setShowFeedback(!!gameState.feedback && gameState.phase === 'reveal');
              setLastPlaced(gameState.lastPlaced);
              setRemovingId(gameState.removingId);
              setChallenge(gameState.challenge);
              setCurrentPlayerId(gameState.currentPlayerId);
              
              // CRITICAL FIX: Restore game round from session data
              if (sessionRestoreData.gameRound) {
                setGameRound(sessionRestoreData.gameRound);
              } else {
                // Fallback: calculate game round based on current player index
                setGameRound((gameState.currentPlayerIdx || 0) + 1);
              }
              
              setView('game');
              
              // CRITICAL FIX: The backend will send a game_update event shortly after
              // reconnection that will set the correct timeline for the current player.
              // This ensures the UI shows the right perspective.
            }
            
            setShowSessionRestore(false);
            setIsRestoring(false);
            console.log('[SessionManager] Session restoration complete');
          }
        });
      } else {
        throw new Error('Socket not connected');
      }
    } catch (error) {
      console.error('[SessionManager] Error during session restoration:', error);
      alert('Failed to restore session. Please try again.');
      sessionManager.clearSession();
      setShowSessionRestore(false);
      setIsRestoring(false);
    }
  };

  const handleDeclineRestore = () => {
    console.log('[SessionManager] User declined session restoration');
    sessionManager.clearSession();
    setShowSessionRestore(false);
    setSessionRestoreData(null);
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
    
    // Create session for tracking
    if (socketRef.current && socketRef.current.connected) {
      socketRef.current.emit('create_session', {
        roomCode: code,
        playerName: name,
        isCreator: true
      }, (response) => {
        if (response.sessionId) {
          setSessionId(response.sessionId);
          console.log('[SessionManager] Created session:', response.sessionId);
        }
      });
    }
    
    console.log("[Socket] Emitting create_lobby", { name, code, settings: gameSettings });
    socketRef.current.emit(
      "create_lobby",
      {
        name,
        code,
        settings: gameSettings,
        sessionId: sessionId
      },
      ({ error, lobby, player, sessionId: returnedSessionId }) => {
        console.log("[Socket] create_lobby callback", { error, lobby, player, sessionId: returnedSessionId });
        if (error) {
          alert(error);
          setView("landing");
          return;
        }
        
        if (returnedSessionId) {
          setSessionId(returnedSessionId);
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
    
    // Create session for tracking (for guest players too)
    if (socketRef.current && socketRef.current.connected) {
      socketRef.current.emit('create_session', {
        roomCode: code,
        playerName: name,
        isCreator: false
      }, (response) => {
        if (response.sessionId) {
          setSessionId(response.sessionId);
          console.log('[SessionManager] Created session for guest player:', response.sessionId);
        }
      });
    }
    
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
    // Ensure winCondition is a sane number before sending to backend
    const normalized = {
      ...newSettings,
      winCondition: Math.max(1, Math.min(50, parseInt(newSettings.winCondition ?? gameSettings.winCondition ?? 10, 10)))
    };
    setGameSettings(normalized);
    socketRef.current.emit("update_settings", { code: roomCode, settings: normalized });
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

  // Handler for pending drop - sets the pending drop index
  const handlePendingDrop = (index) => {
    console.log("[App] handlePendingDrop called:", {
      index,
      phase,
      playerId: socketRef.current?.id,
      currentPlayerId,
      isMyTurn: socketRef.current?.id === currentPlayerId,
      roomCode
    });
    
    // Allow pending drop for both player-turn and challenge phases
    if (phase !== 'player-turn' && phase !== 'challenge') return;
    if (socketRef.current?.id !== currentPlayerId) return;
    
    setPendingDropIndex(index);
  };

  // Handler for confirming a pending drop
  const handleConfirmDrop = () => {
    if (pendingDropIndex === null) return;
    
    console.log("[App] handleConfirmDrop called:", {
      pendingDropIndex,
      phase,
      roomCode,
      socketConnected: !!socketRef.current?.connected
    });
    
    if (!roomCode || !socketRef.current?.connected) {
      console.error("[App] FAILED: No room code or socket not connected!");
      return;
    }
    
    try {
      if (phase === 'challenge') {
        socketRef.current.emit("challenge_place_card", { code: roomCode, index: pendingDropIndex });
        console.log("[App] challenge_place_card emitted successfully to room:", roomCode);
      } else {
        socketRef.current.emit("place_card", { code: roomCode, index: pendingDropIndex });
        console.log("[App] place_card emitted successfully to room:", roomCode);
      }
      setPendingDropIndex(null); // Clear pending drop after confirmation
    } catch (error) {
      console.error("[App] Error emitting place_card:", error);
    }
  };

  // Handler for canceling a pending drop
  const handleCancelDrop = () => {
    console.log("[App] handleCancelDrop called");
    setPendingDropIndex(null);
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
    setTimeline([]);
    setDeck([]);
    setCurrentCard(null);
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

  // CRITICAL FIX: Add deck validation and error handling
  const [deckError, setDeckError] = useState(null);
  
  // NOTE: Legacy autoplay-on-turn effect removed.
  // Autoplay is now handled exclusively by the URI-change effect below (lastPlayedUriRef watcher),
  // to ensure we only start when a concrete new currentCard.uri is present and avoid resuming the previous track.

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

  // Track the last URI we successfully started to avoid duplicate starts
  const lastPlayedUriRef = useRef(null);

  // Autoplay when currentCard URI changes to a new song (after first round initial load)
  useEffect(() => {
    // Preconditions common to both immediate and deferred start
    if (!isCreator) return;
    if (!currentCard?.uri) return;

    // Suppress autoplay for very first round initial song
    if (phase === 'player-turn' && gameRound === 1 && !lastPlayedUriRef.current) {
      console.log("[Spotify] First round initial song - autoplay suppressed.");
      return;
    }

    // iOS Safari gating
    if (window.beatablyPlayback && !window.beatablyPlayback.isUnlocked()) {
      console.log("[Spotify] Autoplay blocked (needs gesture). Waiting for user tap.");
      return;
    }

    // Only proceed if this is a new URI different from what we last started
    if (lastPlayedUriRef.current === currentCard.uri) return;

    const startWithDevice = async (deviceId) => {
      try {
        console.log("[Spotify] Detected new song URI, attempting verified start:", currentCard.uri);
        // Cut any current audio and start the exact new track
        await pauseSpotifyPlayback().catch(() => {});
        const ok = await spotifyAuth.verifiedStartPlayback(
          deviceId,
          currentCard.uri,
          0,
          { pauseFirst: true, transferFirst: false, maxVerifyAttempts: 4, verifyDelayMs: 250 }
        );
        if (ok) {
          lastPlayedUriRef.current = currentCard.uri;
          setIsPlayingMusic(true);
          // Clear pending intent if any
          window.__beatablyPendingAutoplay = false;
        } else {
          console.warn("[Spotify] verifiedStartPlayback returned false for:", currentCard.uri);
        }
      } catch (e) {
        console.warn("[Spotify] Autoplay failed for new uri:", currentCard.uri, e);
      }
    };

    // If device is ready, start immediately using the currently selected device (preserve user choice)
    if (spotifyDeviceId) {
      startWithDevice(spotifyDeviceId);
      return;
    }

    // If device not yet ready, aggressively discover and activate a device if we intend to autoplay
    if (window.__beatablyPendingAutoplay) {
      console.log("[Spotify] Device not ready; attempting active device discovery for autoplay...");
      let attempts = 0;
      const maxAttempts = 10; // up to ~3s
      const tryDiscover = async () => {
        attempts += 1;
        try {
          // 1) Try stored device first
          const stored = spotifyAuth.getStoredDeviceId();

          // 2) Query available devices
          const devices = await spotifyAuth.getDevices();
          let candidate = null;

          // Prefer Beatably SDK player if present
          candidate = devices.find(d => d.name?.toLowerCase().includes('beatably') || d.name?.toLowerCase().includes('web player'));

          // Else prefer active device
          if (!candidate) candidate = devices.find(d => d.is_active);

          // Else fall back to stored device
          if (!candidate && stored) candidate = devices.find(d => d.id === stored);

          // 3) If we found a candidate, use it but DO NOT overwrite current selection if one exists
          if (candidate?.id) {
            console.log("[Spotify] Discovered candidate device:", {
              id: candidate.id,
              name: candidate.name,
              is_active: candidate.is_active
            });

            // If user has already selected a device, honor it over discovered one
            const deviceToUse = spotifyDeviceId || candidate.id;

            if (!spotifyDeviceId) {
              // Store only the chosen device (candidate) when we had none
              spotifyAuth.storeDeviceId(deviceToUse);
              setSpotifyDeviceId(deviceToUse);
            }

            // Only transfer when the deviceToUse is NOT active; otherwise start directly.
            if (!candidate.is_active && deviceToUse === candidate.id) {
              await spotifyAuth.transferPlayback(candidate.id, false);
              setTimeout(() => startWithDevice(candidate.id), 200);
            } else {
              startWithDevice(deviceToUse);
            }
            return;
          }

          // 4) If no candidate and we have stored device, only consider it when no user-selected device exists
          if (!spotifyDeviceId && stored) {
            console.log("[Spotify] No candidate found; attempting transfer to stored device to activate it:", stored);
            await spotifyAuth.transferPlayback(stored, false);
          }
        } catch (e) {
          console.warn("[Spotify] Active device discovery error:", e?.message || e);
        }

        if (attempts < maxAttempts) {
          setTimeout(tryDiscover, 300);
        } else {
          console.log("[Spotify] Device discovery exhausted; will defer autoplay until manual play.");
        }
      };
      tryDiscover();
      return;
    }

    // If no explicit intent flag, do nothing until deviceId appears and/or next state change occurs.
  }, [currentCard?.uri, spotifyDeviceId, isCreator, phase, gameRound]);

  // Additional effect to trigger playback when device becomes ready
  useEffect(() => {
    if (!isCreator || !spotifyDeviceId) return;
    // If device becomes ready and we have a currentCard.uri that hasn't been played yet, the above effect will handle it.
  }, [spotifyDeviceId]);

  // Respect user-selected device for all future autoplay: lock target device
  // Once a user selects a device (via DeviceSwitchModal), store it and always use it.
  const lockedDeviceRef = useRef(null);

  useEffect(() => {
    // Initialize lock from stored device if present
    const stored = localStorage.getItem('spotify_device_id');
    if (stored && !lockedDeviceRef.current) {
      lockedDeviceRef.current = stored;
    }
    const handler = (e) => {
      const id = e?.detail?.deviceId;
      if (id) {
        lockedDeviceRef.current = id;
        // Also update state to reflect selection
        setSpotifyDeviceId(id);
      }
    };
    window.addEventListener('beatably_device_switched', handler);
    return () => window.removeEventListener('beatably_device_switched', handler);
  }, []);

  // Helper to get the target device for any autoplay/start calls
  const getAutoplayTargetDevice = () => {
    // Always prefer the explicit user lock if set
    if (lockedDeviceRef.current) return lockedDeviceRef.current;
    // Fallback to current selected state or stored device
    return spotifyDeviceId || localStorage.getItem('spotify_device_id') || null;
  };

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

  // WinnerView takes priority over all other views
  if (showWinnerView && winner) {
    return (
      <WinnerView
        winner={winner}
        players={players}
        onPlayAgain={() => {
          // Keep same lobby and players, reset game state and go to waiting room
          setShowWinnerView(false);
          setWinner(null);
          setTimeline([]);
          setDeck([]);
          setCurrentCard(null);
          setFeedback(null);
          setShowFeedback(false);
          setPhase('player-turn');
          setLastPlaced(null);
          setRemovingId(null);
          setGameRound(1);
          setView('waiting');
        }}
        onReturnToLobby={() => {
          // Full reset back to landing
          setShowWinnerView(false);
          setWinner(null);
          setPlayers([]);
          setCurrentPlayerIdx(0);
          setTimeline([]);
          setDeck([]);
          setCurrentCard(null);
          setFeedback(null);
          setShowFeedback(false);
          setPhase('player-turn');
          setLastPlaced(null);
          setRemovingId(null);
          setGameRound(1);
          setRoomCode("");
          setPlayerName("");
          setIsCreator(false);
          setView('landing');
        }}
      />
    );
  }

  if (view === "landing") {
    return (
      <>
        <Landing onCreate={handleCreate} onJoin={handleJoin} />
        {showSessionRestore && (
          <SessionRestore
            sessionData={sessionRestoreData}
            onRestore={handleRestoreSession}
            onDecline={handleDeclineRestore}
            isRestoring={isRestoring}
          />
        )}
        {/* Show Spotify login ONLY when the user is (or will be) the host AND no session restore is available */}
        {isCreator && !spotifyToken && !showSessionRestore && (
          <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
            <div className="bg-gray-800 rounded-lg p-6 text-center">
              <h2 className="text-xl font-bold text-white mb-4">Spotify Login Required</h2>
              <p className="text-gray-300 mb-6">As a game creator, you need to connect with Spotify to play music.</p>
              <a href={`${API_BASE_URL}/login`} className="px-6 py-3 bg-green-500 hover:bg-green-600 text-white rounded transition-colors">
                Login with Spotify
              </a>
            </div>
          </div>
        )}
      </>
    );
  }
  if (view === "waiting") {
    const currentPlayer = players.find((p) => p.name === playerName) || {};

    // Derive external loading stage for all players:
    // - If host is starting (we're the host), reflect staged progress locally
    // - If we're a guest, show at least stage 1 while waiting for host to start
    //   and keep it active until game_started arrives.
    let externalLoadingStage = 0;
    let isLoadingExternally = false;

    // Heuristic: if the host has already fetched preview songs (realSongs present),
    // bump initial stage to at least 2 to avoid getting stuck at stage 1.
    const hasPreviewSongs = Array.isArray(realSongs) && realSongs.length > 0;

    // Determine if the lobby currently has a creator (host) present
    const hostInPlayers = players.some(p => p.isCreator);

    if (!isCreator && hostInPlayers) {
      // Guests: if the host initiates start, they will quickly fetch and transition.
      // We can't know exact timing without a backend event, but show meaningful progress:
      externalLoadingStage = hasPreviewSongs ? 2 : 1;
      isLoadingExternally = true;
    }

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
        externalLoadingStage={externalLoadingStage}
        isLoadingExternally={isLoadingExternally}
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
          <PlayerHeader 
            players={players} 
            currentPlayerId={currentPlayerId} 
            tokenAnimations={tokenAnimations}
          />
          <div className="sticky hidden top-0 z-20 bg-gray-900 bg-opacity-95  py-3 md:py-4 px-1">
            <h1 className="text-lg md:text-xl font-semibold text-center">
              {isMyTurn
                ? "Your turn"
                : `${currentPlayerName}'s turn`}
            </h1>
          </div>
          <div className="fixed top-16 left-0 right-0 bottom-0 flex flex-col items-center justify-center p-1 md:p-2 z-10">
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
              onPlaceCard={handlePlaceCard}
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
              onDragStateChange={setIsDragging}
              pendingDropIndex={pendingDropIndex}
              onPendingDrop={handlePendingDrop}
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
            challenge={
              // Inject challengeWindow info into challenge prop if in challenge-window phase
              phase === "challenge-window" && window.latestChallengeWindow
                ? { ...challenge, challengeWindow: window.latestChallengeWindow }
                : challenge
            }
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
            isDragging={isDragging}
            pendingDropIndex={pendingDropIndex}
            onConfirmDrop={handleConfirmDrop}
            onCancelDrop={handleCancelDrop}
          />
          {/* Device switch propagation from GameFooter / DeviceSwitchModal */}
          <script dangerouslySetInnerHTML={{
            __html: `
              window.handleDeviceSwitch = (newDeviceId) => {
                try {
                  localStorage.setItem('spotify_device_id', newDeviceId);
                  // Broadcast an app-level event so any listeners can update
                  const evt = new CustomEvent('beatably_device_switched', { detail: { deviceId: newDeviceId } });
                  window.dispatchEvent(evt);
                } catch (e) {
                  console.warn('[App] Failed to persist deviceId', e);
                }
              };
            `
          }} />
          
          {/* Debug Panel */}
          <SongDebugPanel
            roomCode={roomCode}
            isVisible={showDebugPanel}
            onClose={() => setShowDebugPanel(false)}
          />
          
          {/* Song Guess Notification */}
          <SongGuessNotification
            notification={songGuessNotification}
            onClose={() => setSongGuessNotification(null)}
          />
          
          {/* Debug Panel Toggle Button - only show if enabled in settings */}
          {showDebugButton && (
            <button
              onClick={() => setShowDebugPanel(!showDebugPanel)}
              className="fixed bottom-4 right-4 bg-yellow-600 hover:bg-yellow-500 text-white p-2 rounded-full shadow-lg z-40 text-xs font-medium"
              title="Toggle Song Debug Panel (Ctrl+D / Cmd+D)"
            >
              🐛
            </button>
          )}
        </div>
      </DndProvider>
    );
  }
  return null;
}

export default App;
