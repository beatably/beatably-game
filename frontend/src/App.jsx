import React, { useState, useEffect, useRef } from "react";
import { io } from "socket.io-client";
import TimelineBoard from "./TimelineBoard";
import PlayerHeader from "./PlayerHeader";
import GameFooter from "./GameFooter";
import Landing from "./Landing";
import WaitingRoom from "./WaitingRoom";
import SongDebugPanel from "./SongDebugPanel";
import SongGuessNotification from "./SongGuessNotification";
import CreditSpendNotification from "./CreditSpendNotification";
import SessionRestore from "./SessionRestore";
import HowToPlayView from "./HowToPlayView";
import GameStartModal from "./GameStartModal";
import sessionManager from "./utils/sessionManager";
import debugLogger from './utils/debugLogger';
import viewportManager from "./utils/viewportUtils";
import { preloadAudio, setSuppressSoundEffects } from "./utils/soundUtils";
import './App.css';
import WinnerView from "./WinnerView";
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { API_BASE_URL, SOCKET_URL } from './config';
import { usePreviewMode } from './contexts/PreviewModeContext';


// Game phases: 'setup', 'player-turn', 'reveal', 'game-over'

function App() {
  const { stopPreview, isPlaying: previewIsPlaying } = usePreviewMode();

  // Socket, view, and restore modal state must be declared before effects that reference them
  const socketRef = useRef(null);
  const [view, setView] = useState('landing');
  const [showSessionRestore, setShowSessionRestore] = useState(false);
  const [showHowToPlay, setShowHowToPlay] = useState(false);
  const [showGameStartModal, setShowGameStartModal] = useState(false);

  // Socket.IO connection
  // socketRef declared earlier to satisfy hook ordering for upper effects
  const suppressAutoRejoinRef = useRef(true);
  // Track whether this client is actively joined to a room/session
  const joinedRef = useRef(false);
  // Fallback restore (sessionStorage) support for environments where localStorage backup may be missing
  const SESSION_RESTORE_FALLBACK_TTL = 30 * 60 * 1000; // 30 minutes
  const PENDING_RESTORE_KEY = 'beatably_pending_restore';

  // Centralized game state
  const [players, setPlayers] = useState([]); // [{id, name, isCreator, isReady}]
  const [currentPlayerIdx, setCurrentPlayerIdx] = useState(0);
  const [timeline, setTimeline] = useState([]);
  const [deck, setDeck] = useState([]);
  const [, setCurrentCard] = useState(null);
  const [phase, setPhase] = useState('player-turn');
  const [feedback, setFeedback] = useState(null);
  const [showFeedback, setShowFeedback] = useState(false);
  const [lastPlaced, setLastPlaced] = useState(null);
  const [removingId, setRemovingId] = useState(null);
  const [challenge, setChallenge] = useState(null);
const [, setChallengeResponseGiven] = useState(false);
  // Add a state variable to track the game round
  const [gameRound, setGameRound] = useState(1);

  // Lobby/game state
  const [playerName, setPlayerName] = useState("");
  const [playerId, setPlayerId] = useState(""); // local socket id
  const [roomCode, setRoomCode] = useState("");
  const [isCreator, setIsCreator] = useState(false);
  
  // Initialize debug logging based on URL parameter or localStorage
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const debugParam = params.get('debug');
    
    if (debugParam === 'true') {
      localStorage.setItem('debug_logging', 'true');
      debugLogger.enable();
      console.log('[DebugLogger] Enabled via URL parameter');
    } else if (debugParam === 'false') {
      localStorage.removeItem('debug_logging');
      debugLogger.disable();
      console.log('[DebugLogger] Disabled via URL parameter');
    }
  }, []);
  
  // Update debug logger with player info when available
  useEffect(() => {
    if (playerName && roomCode) {
      debugLogger.updatePlayerInfo({
        playerName,
        playerId: socketRef.current?.id,
        roomCode,
        isCreator,
        view
      });
    }
  }, [playerName, roomCode, playerId, isCreator, view]);
  const [gameSettings, setGameSettings] = useState({
    difficulty: "easy",
    winCondition: 10,
    musicPreferences: {
      genres: ['pop', 'rock', 'hip-hop', 'electronic', 'indie'],
      yearRange: { min: 1960, max: 2025 },
      markets: ['international']
    }
  });

  // Track current player id for turn logic
  const [currentPlayerId, setCurrentPlayerId] = useState("");

  // Music playback state
  const [isPlayingMusic, setIsPlayingMusic] = useState(false);

  // Suppress sound effects on the creator's device while music is playing (prevents AirPlay interruption)
  useEffect(() => {
    setSuppressSoundEffects(isCreator && (isPlayingMusic || previewIsPlaying));
  }, [isCreator, isPlayingMusic, previewIsPlaying]);

  const [realSongs, setRealSongs] = useState(null); // Will replace fake songs when loaded

  // Debug panel state
  const [showDebugPanel, setShowDebugPanel] = useState(false);

  // Song guess notification state
  const [songGuessNotification, setSongGuessNotification] = useState(null);
  const [creditSpendEvent, setCreditSpendEvent] = useState(null);
  const [lastSongGuess, setLastSongGuess] = useState(null);
  const [tokenAnimations, setTokenAnimations] = useState({});
  // Winner screen state
  const [winner, setWinner] = useState(null);
  const [showWinnerView, setShowWinnerView] = useState(false);
  
  // Drag state for UI adjustments
  const [isDragging, setIsDragging] = useState(false);

  // Pending drop confirmation state
  const [pendingDropIndex, setPendingDropIndex] = useState(null);
  const [placeCardError, setPlaceCardError] = useState(null);
  const [, setPreviewTimeline] = useState(null);

  // Session management state
  const [sessionId, setSessionId] = useState(null);
  const [sessionRestoreData, setSessionRestoreData] = useState(null);
  const [isRestoring, setIsRestoring] = useState(false);

  // Player left game notification state
  const [playerLeftNotification, setPlayerLeftNotification] = useState(null);

  // Long-lived socket handlers are registered once (in a useEffect with []),
  // so any state they read directly is captured at mount and goes stale.
  // Mirror the values those handlers need into a ref that we refresh after
  // every render, and have the handlers read latestRef.current instead.
  const latestRef = useRef({});
  useEffect(() => {
    latestRef.current = {
      showWinnerView, winner, currentPlayerId, isCreator, roomCode,
    };
    // Dev-only testing hook (stripped from production builds): exposes the live
    // socket + key state so the e2e harness can drive game progression
    // deterministically and read room state. See e2e/.
    if (import.meta.env.DEV && typeof window !== 'undefined') {
      window.__beatably = { ...latestRef.current, view, phase, timeline, players, challenge, socket: socketRef.current };
    }
  });

  // Initialize viewport manager for mobile Safari optimizations
  useEffect(() => {
    console.log('[App] Initializing viewport manager for mobile Safari optimizations');
    
    // Initialize viewport manager
    viewportManager.init();
    
    // Listen for viewport changes to handle toolbar show/hide
    const cleanup = viewportManager.onViewportChange(({ height, width }) => {
      console.log('[App] Viewport changed:', { height, width });
      
      // Trigger toolbar hide on significant height increases (toolbar hiding)
      if (viewportManager.isMobileSafari()) {
        // Small delay to ensure DOM is updated
        setTimeout(() => {
          viewportManager.triggerToolbarHide();
        }, 100);
      }
    });
    
    // Cleanup on unmount
    return () => {
      cleanup();
      viewportManager.destroy();
    };
  }, []);


  // Check for existing session on app load
  useEffect(() => {
    const checkForExistingSession = () => {
      const hasSession = sessionManager.hasValidSession && sessionManager.hasValidSession();
      const hasBackup = sessionManager.hasValidGameBackup && sessionManager.hasValidGameBackup();

      // Fallback: read from sessionStorage if no localStorage session/backup present
      let fallback = null;
      if (!hasSession && !hasBackup) {
        try {
          const raw = sessionStorage.getItem(PENDING_RESTORE_KEY);
          if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed && parsed.roomCode && parsed.playerName && parsed.view === 'game') {
              const fresh = (Date.now() - (parsed.timestamp || 0)) < SESSION_RESTORE_FALLBACK_TTL;
              if (fresh) {
                fallback = parsed;
              } else {
                sessionStorage.removeItem(PENDING_RESTORE_KEY);
              }
            }
          }
        } catch (e) {
          console.warn('[SessionRestore][fallback] Failed to read sessionStorage:', e?.message || e);
        }
      }

      const shouldRestore = hasSession || hasBackup || !!fallback;

      if (shouldRestore) {
        const sessionData = hasSession
          ? sessionManager.getSession()
          : (hasBackup ? sessionManager.getGameBackup() : fallback);

        console.log('[SessionManager] Found existing session/backup/fallback:', sessionData);
        setSessionRestoreData(sessionData);
        setShowSessionRestore(true);
        // Defer any automatic rejoin until user decides via SessionRestore modal
        suppressAutoRejoinRef.current = true;
        // Mark as not joined until user explicitly restores or starts a new flow
        joinedRef.current = false;
      }
    };

    // Only check for session if we're on the landing page and not already restoring
    if (view === 'landing' && !isRestoring && !showSessionRestore) {
      const hasAnySaved =
        (sessionManager.hasValidSession && sessionManager.hasValidSession()) ||
        (sessionManager.hasValidGameBackup && sessionManager.hasValidGameBackup());

      if (hasAnySaved) {
        checkForExistingSession();
      } else {
        // No saved session: allow normal flows (including stateless rejoin)
        suppressAutoRejoinRef.current = false;
      }
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
                
                // CRITICAL FIX: Preserve local UI state during visibility change reconnection
                // The backend doesn't always maintain visual indicators (lastPlaced, challenge)
                // Only update if backend provides MORE information than what we have locally
                setLastPlaced(prevLastPlaced => {
                  // Keep local lastPlaced if backend doesn't provide one
                  if (!gameState.lastPlaced && prevLastPlaced) {
                    console.log('[App] visibilitychange: Preserving local lastPlaced:', prevLastPlaced);
                    return prevLastPlaced;
                  }
                  return gameState.lastPlaced;
                });
                
                setRemovingId(prevRemovingId => {
                  if (!gameState.removingId && prevRemovingId) {
                    console.log('[App] visibilitychange: Preserving local removingId:', prevRemovingId);
                    return prevRemovingId;
                  }
                  return gameState.removingId;
                });
                
                setChallenge(prevChallenge => {
                  const newChallenge = gameState.challenge;
                  
                  // If no new challenge from backend, keep existing
                  if (!newChallenge && prevChallenge) {
                    console.log('[App] visibilitychange: Preserving local challenge:', prevChallenge);
                    return prevChallenge;
                  }
                  
                  // If we have a new challenge, ensure player names are populated
                  if (newChallenge && gameState.players) {
                    let enrichedChallenge = { ...newChallenge };
                    
                    // Ensure challenger name is populated
                    if (enrichedChallenge.challengerId && !enrichedChallenge.challengerName) {
                      const challenger = gameState.players.find(p => p.persistentId === enrichedChallenge.challengerId);
                      if (challenger) {
                        enrichedChallenge.challengerName = challenger.name;
                        console.log('[App] visibilitychange: Populated challengerName:', challenger.name);
                      }
                    }
                    
                    // Ensure target name is populated
                    const targetPlayerId = enrichedChallenge.targetId || enrichedChallenge.originalPlayerId;
                    if (targetPlayerId && !enrichedChallenge.targetName) {
                      const target = gameState.players.find(p => p.persistentId === targetPlayerId);
                      if (target) {
                        enrichedChallenge.targetName = target.name;
                        console.log('[App] visibilitychange: Populated targetName:', target.name);
                      }
                    }
                    
                    return enrichedChallenge;
                  }
                  
                  return newChallenge;
                });
                
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
      
      const payload = sessionManager.createSessionData(currentState);
      sessionManager.saveSession(payload);
      sessionManager.saveGameBackup(payload);
      try {
        // Also persist a sessionStorage fallback so refreshes in incognito reliably trigger restore
        sessionStorage.setItem(PENDING_RESTORE_KEY, JSON.stringify({
          ...payload,
          timestamp: Date.now()
        }));
      } catch (e) {
        console.warn('[SessionRestore][fallback] Failed to write sessionStorage:', e?.message || e);
      }
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

        // AUTO-REJOIN gating: if a session restore prompt is active, defer automatic rejoin until user decides.
        if (suppressAutoRejoinRef.current) {
          console.log("[Socket] Skipping auto-rejoin due to pending session restore prompt.");
        } else {
          // AUTO-REJOIN: if we have a saved session and we are in (or were in) a game/lobby,
          // immediately rebind this new socket.id to the existing player identity on the server.
          // This fixes the "my view becomes another player/spectator" issue after backend restarts.
          try {
          const hasSession = sessionManager.hasValidSession && sessionManager.hasValidSession();
          const saved = hasSession ? sessionManager.getSession() : null;
          const savedShouldRejoin =
            !!saved &&
            (view === 'game' || view === 'waiting' || saved?.view === 'game' || saved?.view === 'waiting') &&
            saved?.sessionId && saved?.roomCode && saved?.playerName;

          const doApplyResponse = (sid, response) => {
            if (response && response.success) {
              joinedRef.current = true;
              if (sid) setSessionId(sid);
              
              // CRITICAL FIX: Restore essential session data when auto-rejoining
              if (saved) {
                console.log('[Socket] Auto-rejoin: Restoring session data:', {
                  roomCode: saved.roomCode,
                  playerName: saved.playerName,
                  isCreator: saved.isCreator
                });
                
                // Restore roomCode (needed for all socket events)
                if (saved.roomCode) {
                  setRoomCode(saved.roomCode);
                }
                
                // Restore playerName
                if (saved.playerName) {
                  setPlayerName(saved.playerName);
                }
                
                // Restore isCreator flag
                if (saved.isCreator !== undefined) {
                  setIsCreator(saved.isCreator === true);
                }
              }
              
              if (response.view === 'waiting' && response.lobby) {
                setPlayers(response.lobby.players);
                setGameSettings(response.lobby.settings || gameSettings);
                setView('waiting');
              } else if (response.view === 'game' && response.gameState) {
                const gameState = response.gameState;
                setPlayers(gameState.players);
                setCurrentPlayerIdx(gameState.currentPlayerIdx || 0);
                setTimeline(gameState.timeline || []);
                setDeck(gameState.deck || []);
                setPhase(gameState.phase);
                setFeedback(gameState.feedback);
                setShowFeedback(!!gameState.feedback && gameState.phase === 'reveal');
                
                // CRITICAL FIX: Prioritize saved session UI state over backend state
                // Backend doesn't always maintain UI indicators across phases/refreshes
                // Use nullish coalescing to handle both null and undefined properly
                console.log('[Socket] Auto-rejoin: Restoring UI state from saved session:', {
                  savedLastPlaced: saved?.lastPlaced,
                  backendLastPlaced: gameState.lastPlaced,
                  savedChallenge: saved?.challenge,
                  backendChallenge: gameState.challenge
                });
                
                setLastPlaced((saved && saved.lastPlaced !== undefined) ? saved.lastPlaced : (gameState.lastPlaced ?? null));
                setRemovingId((saved && saved.removingId !== undefined) ? saved.removingId : (gameState.removingId ?? null));
                
              // For challenge, we need to reconstruct player names from the players array
              let restoredChallenge = (saved && saved.challenge !== undefined) ? saved.challenge : (gameState.challenge ?? null);
              console.log('[Socket] Auto-rejoin: Challenge reconstruction:', {
                hasChallenge: !!restoredChallenge,
                challengerId: restoredChallenge?.challengerId,
                originalPlayerId: restoredChallenge?.originalPlayerId,
                playersCount: gameState.players?.length
              });
              
              if (restoredChallenge && gameState.players) {
                // PERSISTENT ID FIX: Use persistentId for lookups
                // Ensure challenger name is populated
                if (restoredChallenge.challengerId && !restoredChallenge.challengerName) {
                  const challenger = gameState.players.find(p => p.persistentId === restoredChallenge.challengerId);
                  console.log('[Socket] Auto-rejoin: Looking for challenger:', restoredChallenge.challengerId, 'found:', challenger?.name);
                  if (challenger) {
                    restoredChallenge = { ...restoredChallenge, challengerName: challenger.name };
                  }
                }
                // Ensure target name is populated (check both targetId and originalPlayerId)
                const targetPlayerId = restoredChallenge.targetId || restoredChallenge.originalPlayerId;
                if (targetPlayerId && !restoredChallenge.targetName) {
                  const target = gameState.players.find(p => p.persistentId === targetPlayerId);
                  console.log('[Socket] Auto-rejoin: Looking for target:', targetPlayerId, 'found:', target?.name);
                  if (target) {
                    restoredChallenge = { ...restoredChallenge, targetName: target.name };
                  }
                }
              }
                console.log('[Socket] Auto-rejoin: Final challenge after reconstruction:', restoredChallenge);
                
                // CRITICAL FIX: If this player was the challenger before refresh,
                // update challengerId to their new socket ID so UI displays correctly
                const wasChallenger = restoredChallenge && saved && saved.playerId === restoredChallenge.challengerId;
                if (wasChallenger && socketRef.current) {
                  console.log('[Socket] Auto-rejoin: Was challenger, updating challengerId to new socket ID');
                  restoredChallenge = { ...restoredChallenge, challengerId: socketRef.current.id };
                  
                  // CRITICAL: Inform backend about the challengerId update
                  console.log('[Socket] Auto-rejoin: Notifying backend of challengerId update');
                  socketRef.current.emit('update_challenger_id', {
                    code: saved.roomCode,
                    oldChallengerId: saved.playerId,
                    newChallengerId: socketRef.current.id
                  });
                }
                
                setChallenge(restoredChallenge);
                
                // currentPlayerId is the backend's persistent player id. Our own
                // identity is resolved at render time from the players list keyed
                // by the current socket id, so reconnection needs no socket-id
                // override here (that override was a holdover from when
                // currentPlayerId held a socket id).
                setCurrentPlayerId(gameState.currentPlayerId);
                
                setView('game');
              }
            }
          };

          const attemptStateless = () => {
            if (playerName && roomCode) {
              const sid =
                (sessionManager.generateSessionId && sessionManager.generateSessionId()) ||
                `stateless_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
              console.log('[Socket] Auto-rejoin (stateless) using name/room', {
                sessionId: sid, roomCode, playerName
              });
              socketRef.current.emit(
                'reconnect_session',
                { sessionId: sid, roomCode, playerName },
                (resp2) => {
                  console.log('[Socket] Auto-rejoin (stateless) response:', resp2);
                  doApplyResponse(sid, resp2);
                  if (!(resp2 && resp2.success)) {
                    console.warn('[Socket] Stateless auto-rejoin failed:', resp2 && resp2.error);
                  }
                }
              );
              return true;
            }
            return false;
          };

          if (savedShouldRejoin) {
            console.log('[Socket] Auto-rejoin using saved session', {
              sessionId: saved.sessionId, roomCode: saved.roomCode, playerName: saved.playerName
            });
            socketRef.current.emit(
              'reconnect_session',
              {
                sessionId: saved.sessionId,
                roomCode: saved.roomCode,
                playerName: saved.playerName
              },
              (response) => {
                console.log('[Socket] Auto-rejoin response:', response);
                if (response && response.success) {
                  doApplyResponse(saved.sessionId, response);
                } else {
                  console.warn('[Socket] Auto-rejoin failed:', response && response.error);
                  // Fallback: stateless rejoin by name/room if available
                  attemptStateless();
                }
              }
            );
          } else {
            // No saved session: try stateless rejoin using in-memory name/room
            attemptStateless();
          }
        } catch (e) {
          console.warn('[Socket] Auto-rejoin check failed:', e && e.message);
        }
        }
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
        // While auto-rejoin is suppressed and user hasn't joined, ignore to prevent jumping views
        if (suppressAutoRejoinRef.current && !joinedRef.current) {
          console.log("[Socket] Ignoring game_started due to suppressed auto-rejoin");
          return;
        }
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
        setShowGameStartModal(true);
      });

  // Listen for game updates (real-time sync, per player)
  socketRef.current.on("game_update", (game) => {
    console.log("[App] Game update received:", {
      currentPlayerId: game.currentPlayerId,
      myPlayerId: socketRef.current?.id,
      phase: game.phase,
      deckLength: game.deck?.length || 0,
      winner: game.winner,
      backendLastPlaced: game.lastPlaced,
      backendChallenge: game.challenge
    });
    // TEMP DEBUG: store full game_update payload so you can inspect it in the browser console after reproducing
    try {
      // Expose the last received update globally for easy inspection
      window.lastGameUpdate = game;
      const tl = Array.isArray(game.timeline) ? game.timeline : [];
      console.log("[DEBUG][client] Stored full game_update in window.lastGameUpdate");
      console.log("[DEBUG][client] timeline summary:", {
        length: tl.length,
        ids: tl.map(c => c && c.id),
        years: tl.map(c => c && c.year),
        titles: tl.map(c => c && c.title)
      });
      console.log("[DEBUG][client] To copy the full timeline to clipboard, open Console and run: copy(window.lastGameUpdate.timeline)");
    } catch (e) {
      console.log("[DEBUG][client] temp logging failed:", e && e.message);
    }

    // While auto-rejoin is suppressed and user hasn't joined, ignore unsolicited updates
    if (suppressAutoRejoinRef.current && !joinedRef.current) {
      return;
    }

    // If already showing winner, ignore further updates to avoid UI flicker.
    // Read from latestRef (not closure) so the guard sees current state.
    if (latestRef.current.showWinnerView && latestRef.current.winner) {
      return;
    }

    // Show winner view immediately when game over with winner info
    if (game.phase === 'game-over' && game.winner) {
      console.log("[App] Game over detected, showing winner view");
      setWinner(game.winner);
      setShowWinnerView(true);
      return;
    }
    
    // CRITICAL FIX: Validate deck state and handle empty deck
    if (!game.deck || game.deck.length === 0) {
      console.warn("[App] Empty deck received in game update");
      if (game.phase !== 'game-over') {
        console.error("[App] ERROR: Empty deck but game not over!");
        // Attempt to request fresh state from backend
        if (socketRef.current && latestRef.current.roomCode) {
          console.log("[App] Requesting game state refresh...");
          socketRef.current.emit("request_game_state", { code: latestRef.current.roomCode });
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
        
        // CRITICAL FIX: Preserve client-side UI state over backend state in game_update
        // The backend doesn't always maintain visual indicators (lastPlaced) or player names (challenge)
        // Only update if backend provides MORE information than what we have locally
        setLastPlaced(prevLastPlaced => {
          // IMPORTANT: If phase is 'player-turn' and backend sends null, it means we should clear lastPlaced
          // This happens when transitioning to a new turn after challenge resolution
          if (game.phase === 'player-turn' && !game.lastPlaced) {
            console.log('[App] game_update: Clearing lastPlaced for new turn (phase: player-turn)');
            return null;
          }
          
          // Keep local lastPlaced if backend doesn't provide one (for other phases)
          if (!game.lastPlaced && prevLastPlaced) {
            console.log('[App] game_update: Preserving local lastPlaced:', prevLastPlaced);
            return prevLastPlaced;
          }
          return game.lastPlaced;
        });
        
        setRemovingId(game.removingId);
        
        setChallenge(prevChallenge => {
          const newChallenge = game.challenge;
          
          // If no new challenge from backend, keep existing
          if (!newChallenge) return prevChallenge;
          
          // Reconstruct player names if missing
          let enrichedChallenge = { ...newChallenge };
          
          if (game.players) {
            // Ensure challenger name is populated
            if (enrichedChallenge.challengerId && !enrichedChallenge.challengerName) {
              const challenger = game.players.find(p => p.id === enrichedChallenge.challengerId);
              if (challenger) {
                enrichedChallenge.challengerName = challenger.name;
                console.log('[App] game_update: Populated challengerName:', challenger.name);
              }
            }
            
            // Ensure target name is populated (check both targetId and originalPlayerId)
            const targetPlayerId = enrichedChallenge.targetId || enrichedChallenge.originalPlayerId;
            if (targetPlayerId && !enrichedChallenge.targetName) {
              const target = game.players.find(p => p.id === targetPlayerId);
              if (target) {
                enrichedChallenge.targetName = target.name;
                console.log('[App] game_update: Populated targetName:', target.name);
              }
            }
          }
          
          // CRITICAL FIX: Update challengerId if this player was the challenger before the game_update
          // (This handles the case where game_update arrives after reconnection with stale socket IDs)
          if (prevChallenge && prevChallenge.challengerId === socketRef.current?.id) {
            console.log('[App] game_update: Preserving challenger identity after reconnection');
            enrichedChallenge = { ...enrichedChallenge, challengerId: socketRef.current.id };
          }
          
          return enrichedChallenge;
        });
        
        // currentPlayerId is always the backend's persistent player id. Our own
        // identity is derived at render time from the players list keyed by the
        // current socket id, so reconnection needs no socket-id override here.
        setCurrentPlayerId(game.currentPlayerId || (game.players && game.players[0]?.id));
        
        // Track lastSongGuess from game_update (sent during reveal phase)
        if (game.lastSongGuess) {
          setLastSongGuess(game.lastSongGuess);
        } else if (game.phase === 'player-turn' || game.phase === 'song-guess') {
          // Clear song guess when starting a new
          setLastSongGuess(null);
        }
        
        // Increment game round when the current player changes.
        // Read from latestRef so the comparison uses the current value.
        if (game.currentPlayerId !== latestRef.current.currentPlayerId) {
          setGameRound(prevRound => prevRound + 1);
        }
      });

      // Listen for song guess results (now just a "submitted" notification)
      socketRef.current.on("song_guess_result", (result) => {
        console.log("[App] Song guess submitted:", result);
        
        // Show "submitted" notification (result will be revealed at end of round)
        setSongGuessNotification({
          playerName: result.playerName,
          submitted: true
        });
      });

      // Listen for token/credit spend feedback when requesting a new song
      socketRef.current.on("credit_spent_for_new_song", (data) => {
        console.log("[App] Credit spent for new song:", data);

        const eventId = Date.now();
        setCreditSpendEvent({ ...data, eventId });

        // Trigger top-row pulse on the spender's token stack
        // Use persistentId key to avoid stale player list closures in socket listeners.
        if (data?.spenderPersistentId) {
          setTokenAnimations({ [data.spenderPersistentId]: true });
          // Keep tokenAnimations transient so PlayerHeader doesn't re-trigger on every render
          setTimeout(() => setTokenAnimations({}), 1200);
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
    console.log("[App] Current state:", { isCreator, isPlayingMusic });

    // Always reset music state for all players
    setIsPlayingMusic(false);

    // Stop audio so currentTime resets to 0, ensuring next play loads the new song
    stopPreview();
    console.log("[App] Stopped preview audio for new song");
  });

  // Listen for new song loaded events
  socketRef.current.on("new_song_loaded", (data) => {
    console.log("[App] New song loaded:", data);

    // Reset progress UI state for all players - no auto-play
    setIsPlayingMusic(false);
    
    console.log("[App] New song loaded - auto-play disabled. User must press play manually.");
  });

      // Listen for progress synchronization from creator
      socketRef.current.on("progress_sync", (data) => {
        console.log("[App] Received progress sync:", data);
        setIsPlayingMusic(data.isPlaying);
        // Additional progress sync logic will be handled in GameFooter
      });

      // Listen for new song requests (creator only)
      socketRef.current.on("new_song_request", (data) => {
        console.log("[App] Received new song request:", data);
        // This will be handled in GameFooter component
      });
      // Handle being kicked
      socketRef.current.on("kicked", () => {
        alert("You have been kicked from the lobby.");
        
        // Clear session data to prevent restore dialogue
        sessionManager.clearSession();
        try { 
          sessionStorage.removeItem(PENDING_RESTORE_KEY); 
        } catch { /* ignore */ }
        
        // Reset all state and return to landing
        setView("landing");
        setPlayers([]);
        setRoomCode("");
        setPlayerName("");
        setIsCreator(false);
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
        setWinner(null);
        setShowWinnerView(false);
        joinedRef.current = false;
      });

      // Handle host leaving (from waiting room only - active game uses player_left_game)
      socketRef.current.on("host_left", (data) => {
        console.log("[Socket] Host left:", data);
        // Clean up session data
        sessionManager.clearSession();
        try { 
          sessionStorage.removeItem(PENDING_RESTORE_KEY); 
        } catch { /* ignore */ }
        
        // Use the same modal notification as player_left_game for consistency
        setPlayerLeftNotification({
          message: data.message || "The host has left. You will be returned to the lobby.",
          playerName: data.hostName || "The host"
        });
      });

      // Handle player leaving during active game (game ends for everyone)
      socketRef.current.on("player_left_game", (data) => {
        console.log("[Socket] Player left game:", data);
        // Clean up session data
        sessionManager.clearSession();
        try { 
          sessionStorage.removeItem(PENDING_RESTORE_KEY); 
        } catch { /* ignore */ }
        
        // Show the notification modal instead of alert
        setPlayerLeftNotification({
          message: data.message || "A player has left the game. The game has ended.",
          playerName: data.playerName || "A player"
        });
      });
      socketRef.current.on("connect_error", (err) => {
        console.error("[Socket] Connection error:", err);
      });

      socketRef.current.on("place_card_error", ({ reason }) => {
        console.error("[Socket] place_card_error — reconnect race condition, retrying is safe. Reason:", reason);
        setPlaceCardError("Connection was interrupted. Please tap Confirm again.");
        setTimeout(() => setPlaceCardError(null), 4000);
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

  // Fetch curated songs for game (no Web API usage during gameplay)
  const fetchCuratedSongs = async (musicPreferences = null) => {
    try {
      console.log("[Curated] Selecting songs from curated DB with preferences:", musicPreferences);
      const response = await fetch(`${API_BASE_URL}/api/curated/select`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          musicPreferences: musicPreferences || gameSettings.musicPreferences,
          difficulty: gameSettings.difficulty,
          playerCount: players.length || 2,
          previewMode: true
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      console.log("[Curated] Selected", data.tracks?.length || 0, "songs from curated DB");
      console.log("[Curated] Metadata:", data.metadata);

      // Check for warnings and display them
      if (data.warning) {
        console.warn("[Curated] Warning:", data.warning);
      }

      return data;
    } catch (error) {
      console.error("[Curated] Error selecting curated songs:", error);
      return null;
    }
  };

  // Attempt to ensure audio is unlocked on first meaningful user gesture.
  // This reduces friction on iOS Safari so that future auto-plays succeed.
  useEffect(() => {
    const handler = async () => {
      // Preload + unlock local SFX pipeline on first gesture for lower latency
      preloadAudio();

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
            console.log('[SessionManager] CRITICAL: Restoring isCreator flag:', sessionRestoreData.isCreator);
            
            // Restore app state
            setSessionId(sessionRestoreData.sessionId);
            setPlayerName(sessionRestoreData.playerName);
            setRoomCode(sessionRestoreData.roomCode);
            // CRITICAL FIX: Ensure isCreator is properly restored
            setIsCreator(sessionRestoreData.isCreator === true);
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
              
              // CRITICAL FIX: Prioritize saved session UI state over backend state
              // Backend doesn't always maintain UI indicators across phases/refreshes
              // Use nullish coalescing to handle both null and undefined properly
              console.log('[SessionManager] Manual restore: Restoring UI state from saved session:', {
                savedLastPlaced: sessionRestoreData?.lastPlaced,
                backendLastPlaced: gameState.lastPlaced,
                savedChallenge: sessionRestoreData?.challenge,
                backendChallenge: gameState.challenge
              });
              
              setLastPlaced((sessionRestoreData && sessionRestoreData.lastPlaced !== undefined) ? sessionRestoreData.lastPlaced : (gameState.lastPlaced ?? null));
              setRemovingId((sessionRestoreData && sessionRestoreData.removingId !== undefined) ? sessionRestoreData.removingId : (gameState.removingId ?? null));
              
              // For challenge, we need to reconstruct player names from the players array
              let restoredChallenge = (sessionRestoreData && sessionRestoreData.challenge !== undefined) ? sessionRestoreData.challenge : (gameState.challenge ?? null);
              if (restoredChallenge && gameState.players) {
                // PERSISTENT ID FIX: Use persistentId for lookups
                // Ensure challenger name is populated
                if (restoredChallenge.challengerId && !restoredChallenge.challengerName) {
                  const challenger = gameState.players.find(p => p.persistentId === restoredChallenge.challengerId);
                  if (challenger) {
                    restoredChallenge = { ...restoredChallenge, challengerName: challenger.name };
                  }
                }
                // Ensure target name is populated (check both targetId and originalPlayerId)
                const targetPlayerId = restoredChallenge.targetId || restoredChallenge.originalPlayerId;
                if (targetPlayerId && !restoredChallenge.targetName) {
                  const target = gameState.players.find(p => p.persistentId === targetPlayerId);
                  if (target) {
                    restoredChallenge = { ...restoredChallenge, targetName: target.name };
                  }
                }
              }
              
              // CRITICAL FIX: If this player was the challenger before refresh,
              // update challengerId to their new socket ID so UI displays correctly
              const wasChallenger = restoredChallenge && sessionRestoreData && sessionRestoreData.playerId === restoredChallenge.challengerId;
              if (wasChallenger && socketRef.current) {
                console.log('[SessionManager] Manual restore: Was challenger, updating challengerId to new socket ID');
                restoredChallenge = { ...restoredChallenge, challengerId: socketRef.current.id };
              }
              
              setChallenge(restoredChallenge);
              
              // currentPlayerId is the backend's persistent player id; identity is
              // resolved at render time from the (reconnected) players list, so no
              // socket-id override is needed on manual session restore.
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
            // Mark joined and clear auto-rejoin suppression after explicit user-driven restoration
            joinedRef.current = true;
            suppressAutoRejoinRef.current = false;
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
    try { sessionStorage.removeItem(PENDING_RESTORE_KEY); } catch { /* ignore */ }
    setShowSessionRestore(false);
    setSessionRestoreData(null);
    // Allow pending flows (e.g., create lobby) and future auto-rejoin attempts
    suppressAutoRejoinRef.current = false;
  };

  // Create game handler (calls backend)
  const handleCreate = (name) => {
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
              joinedRef.current = true;
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
        joinedRef.current = true;
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
    // Clean up session data first (same as handleExitToLobby)
    sessionManager.clearSession();
    try { 
      sessionStorage.removeItem(PENDING_RESTORE_KEY); 
    } catch { /* ignore */ }
    
    socketRef.current.emit("leave_lobby", { code: roomCode }, () => {
      // Reset all state and return to landing
      setPlayerName("");
      setRoomCode("");
      setIsCreator(false);
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
      setWinner(null);
      setShowWinnerView(false);
      setView("landing");
      joinedRef.current = false;
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
      const freshSongsData = await fetchCuratedSongs(gameSettings.musicPreferences);
      if (freshSongsData && freshSongsData.tracks && freshSongsData.tracks.length > 0) {
        console.log("[App] Fresh songs fetched:", freshSongsData.tracks.length);
        
        // Check for warnings and potentially show them to the user
        const __warning = (freshSongsData.metadata && freshSongsData.metadata.warning) || freshSongsData.warning;
        if (__warning) {
          const shouldContinue = window.confirm(
            `Warning: ${__warning}\n\nDo you want to continue with ${freshSongsData.tracks.length} songs, or go back to adjust your music preferences?`
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
  // Handler for pending drop - sets the pending drop index
  const handlePendingDrop = (index) => {
    // PERSISTENT ID FIX: Use persistent ID comparison for turn validation
    const myPlayer = players?.find(p => p.id === socketRef.current?.id);
    const myPersistentId = myPlayer?.persistentId;
    
    // CRITICAL FIX: Same logic as isMyTurn - check challenger during challenge phase
    const isMyTurnCheck = myPersistentId && (
      (phase === 'challenge' && challenge?.challengerPersistentId === myPersistentId) ||
      (phase !== 'challenge' && currentPlayerId && myPersistentId === currentPlayerId)
    );
    
    console.log("[App] handlePendingDrop called:", {
      index,
      phase,
      mySocketId: socketRef.current?.id,
      myPersistentId,
      currentPlayerId,
      challengerPersistentId: challenge?.challengerPersistentId,
      isMyTurn: isMyTurnCheck,
      roomCode
    });
    
    // Allow pending drop for both player-turn and challenge phases
    if (phase !== 'player-turn' && phase !== 'challenge') return;
    if (!isMyTurnCheck) return;
    
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
    
    // PERSISTENT ID FIX: Use persistent ID comparison for challenge validation
    const myPlayer = players?.find(p => p.id === socketRef.current?.id);
    const myPersistentId = myPlayer?.persistentId;
    if (challenge?.challengerPersistentId !== myPersistentId) return;
    
    socketRef.current.emit("challenge_place_card", { code: roomCode, index });
  };

  // Continue after challenge resolution handler
  const handleContinueAfterChallenge = () => {
    console.log("[App] Continue after challenge clicked");
    if (!socketRef.current || !roomCode) {
      console.log("[App] Missing socket or room code:", { socket: !!socketRef.current, roomCode });
      return;
    }
    
    // CRITICAL FIX: Clear lastPlaced and challenge state to prevent outline persistence
    console.log("[App] Clearing lastPlaced and challenge state before continuing");
    setLastPlaced(null);
    setChallenge(null);
    setShowFeedback(false);
    setFeedback(null);
    
    console.log("[App] Emitting continue_after_challenge for room:", roomCode);
    socketRef.current.emit("continue_after_challenge", { code: roomCode });
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

  // Restart game handler (creator only)
  const handleRestartGame = async () => {
    if (!isCreator) return;
    
    try {
      console.log('[App] Restarting game - resetting all state');
      
      // Reset ALL local game state including player scores/tokens
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
      setCurrentPlayerIdx(0);
      setChallenge(null);
      setChallengeResponseGiven(false);
      setSongGuessNotification(null);
      setPendingDropIndex(null);
      setPreviewTimeline(null);
      
      // CRITICAL FIX: Reset player scores and tokens locally immediately
      // so the UI shows reset values while waiting for the server response.
      // The server will send authoritative values via game_started.
      setPlayers(prev => prev.map(p => ({
        ...p,
        score: 1,
        tokens: 3,
        bonusTokens: 0,
        doublePoints: false,
        skipChallenge: false,
      })));
      
      // Stop any music that's playing
      setIsPlayingMusic(false);

      // Start a new game with fresh songs
      await handleStart();
    } catch (error) {
      console.error('[App] Error restarting game:', error);
      // If restart fails, go back to waiting room
      setView('waiting');
      throw error; // Re-throw so PlayerHeader can handle the loading state properly
    }
  };

  // Exit to lobby handler
  const handleExitToLobby = () => {
    // Clean up game state
    sessionManager.clearSession();
    try { 
      sessionStorage.removeItem(PENDING_RESTORE_KEY); 
    } catch { /* ignore */ }
    
    // Leave the current lobby/game
    if (socketRef.current && roomCode) {
      socketRef.current.emit("leave_lobby", { code: roomCode }, () => {
        // Reset all state and return to landing
        setPlayerName("");
        setRoomCode("");
        setIsCreator(false);
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
        setWinner(null);
        setShowWinnerView(false);
        setView("landing");
        joinedRef.current = false;
      });
    } else {
      // If no socket connection, just reset state locally
      setPlayerName("");
      setRoomCode("");
      setIsCreator(false);
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
      setWinner(null);
      setShowWinnerView(false);
      setView("landing");
      joinedRef.current = false;
    }
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

  // Add user interaction listener for Safari audio unlock
  useEffect(() => {
    const unlockAudio = () => {
      // Ensure local SFX buffers/context are also primed on first interaction
      preloadAudio();

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

  // Fetch curated songs when creator enters waiting room (for preview/testing)
  useEffect(() => {
    if (isCreator && view === 'waiting') {
      console.log("[Curated] Pre-fetching songs for preview (fresh songs will be fetched on game start)...");
      fetchCuratedSongs().then((songsData) => {
        if (songsData && songsData.tracks && songsData.tracks.length > 0) {
          setRealSongs(songsData.tracks);
          console.log("[Curated] Preview songs loaded");
        }
      });
    }
  }, [isCreator, view]);

  // Clear songs when settings change to force fresh fetch on game start
  useEffect(() => {
    if (isCreator) {
      console.log("[Curated] Settings changed, will fetch fresh songs on game start");
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
        <Landing onCreate={handleCreate} onJoin={handleJoin} onShowHowToPlay={() => setShowHowToPlay(true)} />
        {showHowToPlay && <HowToPlayView onClose={() => setShowHowToPlay(false)} context="landing" />}
        {showSessionRestore && (
          <SessionRestore
            sessionData={sessionRestoreData}
            onRestore={handleRestoreSession}
            onDecline={handleDeclineRestore}
            isRestoring={isRestoring}
          />
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
      <>
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
      </>
    );
  }
  if (view === 'game') {
    const currentCard = deck && deck.length > 0 ? deck[0] : null;
    
    // PERSISTENT ID FIX: Find my persistent ID and compare with currentPlayerId
    const myPlayer = players?.find(p => p.id === socketRef.current?.id);
    const myPersistentId = myPlayer?.persistentId;
    
    // CRITICAL FIX: During challenge phase, the challenger should be able to interact, not just the current player
    const isMyTurn = myPersistentId && (
      (phase === 'challenge' && challenge?.challengerPersistentId === myPersistentId) ||
      (phase !== 'challenge' && currentPlayerId && myPersistentId === currentPlayerId)
    );
    
    // PERSISTENT ID FIX: Use persistentId for player lookup
    const currentPlayerName = players && players.length > 0 && currentPlayerId
      ? (players.find((p) => p.persistentId === currentPlayerId)?.name || "Unknown")
      : "Unknown";
    
    // During challenge phase, we need to show the original timeline owner's name
    // instead of the challenger's name
    const timelineOwnerName = (() => {
      if (phase === 'challenge' && challenge) {
        // PERSISTENT ID FIX: Use persistentId for lookups
        // Try targetId first
        if (challenge.targetId) {
          const targetPlayer = players.find(p => p.persistentId === challenge.targetId);
          return targetPlayer?.name || "Unknown";
        }
        // Try originalPlayerId as fallback
        if (challenge.originalPlayerId) {
          const originalPlayer = players.find(p => p.persistentId === challenge.originalPlayerId);
          return originalPlayer?.name || "Unknown";
        }
      }
      // For all other phases, use the current player name
      return currentPlayerName;
    })();
    
    // Get the timeline owner's persistent ID for comparison
    const timelineOwnerPersistentId = (() => {
      if (phase === 'challenge' && challenge) {
        // During challenge, the timeline owner is the target/original player
        return challenge.targetId || challenge.originalPlayerId || currentPlayerId;
      }
      // For all other phases, use the current player's persistent ID
      return currentPlayerId;
    })();
    
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
        <div className="mobile-fullscreen mobile-safe-area bg-background text-white flex flex-col h-full">
          <PlayerHeader
            players={players}
            currentPlayerId={currentPlayerId}
            tokenAnimations={tokenAnimations}
            isCreator={isCreator}
            onRestart={handleRestartGame}
            onExit={handleExitToLobby}
            onShowHowToPlay={() => setShowHowToPlay(true)}
          />
          {showHowToPlay && <HowToPlayView onClose={() => setShowHowToPlay(false)} context="game" />}
          {showGameStartModal && (
            <GameStartModal
              settings={gameSettings}
              players={players}
              onDismiss={() => setShowGameStartModal(false)}
            />
          )}
          <div className="flex-1 flex flex-col items-center justify-center p-1 md:p-2 z-10 bg-background overflow-hidden min-h-0">
            <TimelineBoard
              timeline={timeline || []}
              currentCard={currentCard}
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
              currentPlayerName={timelineOwnerName}
              roomCode={roomCode}
              myPersistentId={myPersistentId}
              timelineOwnerPersistentId={timelineOwnerPersistentId}
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
            onInitiateChallenge={handleInitiateChallenge}
            onContinueAfterChallenge={handleContinueAfterChallenge}
            onSkipChallenge={handleSkipChallenge}
            onSkipSongGuess={handleSkipSongGuess}
            isPlayingMusic={isPlayingMusic}
            isCreator={isCreator}
            socketRef={socketRef}
            roomCode={roomCode}
            isDragging={isDragging}
            pendingDropIndex={pendingDropIndex}
            onConfirmDrop={handleConfirmDrop}
            onCancelDrop={handleCancelDrop}
            placeCardError={placeCardError}
            lastSongGuess={lastSongGuess}
          />
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

          <CreditSpendNotification
            event={creditSpendEvent}
            myPersistentId={myPersistentId}
            onClose={() => setCreditSpendEvent(null)}
          />

          {/* Player Left Game Notification Modal */}
          {playerLeftNotification && (
            <div className="fixed inset-0 flex items-center justify-center p-4" style={{ zIndex: 10001 }}>
              <div className="fixed inset-0 bg-black bg-opacity-60" />
              <div className="relative bg-card border border-border rounded-2xl shadow-xl w-full max-w-sm p-6 text-center">
                <div className="mb-3">
                  <svg className="mx-auto mb-3" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" className="text-red-500" stroke="currentColor" />
                    <line x1="15" y1="9" x2="9" y2="15" className="text-red-500" stroke="currentColor" strokeWidth="2" />
                    <line x1="9" y1="9" x2="15" y2="15" className="text-red-500" stroke="currentColor" strokeWidth="2" />
                  </svg>
                  <h3 className="text-lg font-semibold text-foreground mb-2">Game Ended</h3>
                  <p className="text-sm text-muted-foreground">
                    <span className="text-foreground font-semibold">{playerLeftNotification.playerName}</span> has left the game. The game has ended for everyone.
                  </p>
                </div>
                <button
                  onClick={() => {
                    setPlayerLeftNotification(null);
                    // Reset all state and return to landing
                    setPlayerName("");
                    setRoomCode("");
                    setIsCreator(false);
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
                    setWinner(null);
                    setShowWinnerView(false);
                    setView("landing");
                    joinedRef.current = false;
                  }}
                  className="mt-4 w-full h-12 px-4 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-md transition-colors"
                >
                  Return to Lobby
                </button>
              </div>
            </div>
          )}
        </div>
      </DndProvider>
    );
  }
  return null;
}

export default App;
