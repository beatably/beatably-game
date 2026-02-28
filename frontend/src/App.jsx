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
import SpotifyAuthRenewal from "./components/SpotifyAuthRenewal";
import spotifyAuth from "./utils/spotifyAuth";
import sessionManager from "./utils/sessionManager";
import debugLogger from './utils/debugLogger';
import viewportManager from "./utils/viewportUtils";
import deviceAwarePlayback from "./utils/deviceAwarePlayback";
import './App.css';
import WinnerView from "./WinnerView";
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { API_BASE_URL, SOCKET_URL } from './config';
import { usePreviewMode } from './contexts/PreviewModeContext';


// Game phases: 'setup', 'player-turn', 'reveal', 'game-over'

function App() {
  const { isPreviewMode, setFullPlayMode } = usePreviewMode();
  
  // Expose setFullPlayMode globally for auth callback
  useEffect(() => {
    window.enableFullPlayMode = setFullPlayMode;
    return () => {
      delete window.enableFullPlayMode;
    };
  }, [setFullPlayMode]);
  
  // Spotify authentication
  const [spotifyToken, setSpotifyToken] = useState(localStorage.getItem('access_token') || null);
  // pending creator name saved during OAuth redirect
  const [pendingCreate, setPendingCreate] = useState(
    localStorage.getItem('pending_create') || null
  );
  // track socket connection status
  const [socketReady, setSocketReady] = useState(false);
  // Capture access_token coming back from Spotify
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

      // Check if this was from enabling full play mode
      const pendingFullPlayMode = localStorage.getItem("pending_full_play_mode");
      if (pendingFullPlayMode) {
        console.log("[Spotify] Full Play Mode auth completed, enabling full play mode");
        localStorage.removeItem("pending_full_play_mode");
        // Enable full play mode via context
        if (window.enableFullPlayMode) {
          window.enableFullPlayMode(true);
        }
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

  // Socket, view, and restore modal state must be declared before effects that reference them
  const socketRef = useRef(null);
  const [view, setView] = useState('landing');
  const [showSessionRestore, setShowSessionRestore] = useState(false);

  // Create lobby when we have token + pending name + socket ready
  useEffect(() => {
    if (spotifyToken && pendingCreate && socketReady && socketRef.current && !showSessionRestore && view === 'landing') {
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
          genres: ['pop', 'rock', 'hip-hop', 'electronic', 'r&b'],
          yearRange: { min: 1960, max: 2025 },
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
  }, [spotifyToken, pendingCreate, socketReady, showSessionRestore, view]);

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
    difficulty: "normal",
    winCondition: 10,
    musicPreferences: {
      genres: ['pop', 'rock', 'hip-hop', 'electronic', 'r&b'],
      yearRange: { min: 1960, max: 2025 },
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
  const [sessionRestoreData, setSessionRestoreData] = useState(null);
  const [isRestoring, setIsRestoring] = useState(false);

  // Spotify authorization renewal state
  const [showSpotifyAuthRenewal, setShowSpotifyAuthRenewal] = useState(false);
  const [authRenewalGameState, setAuthRenewalGameState] = useState(null);

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


  // Initialize feature flags (e.g., default chart mode) from backend so UI reflects server defaults
  useEffect(() => {
    const loadFlags = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/feature-flags`);
        if (!res.ok) return;
        const json = await res.json();
        const enableChartMode = json?.featureFlags?.enableChartMode;
        if (typeof enableChartMode === 'boolean') {
          setGameSettings(s => ({
            ...s,
            // Only set useChartMode from server if client hasn't explicitly set it yet
            useChartMode: (s.useChartMode === undefined || s.useChartMode === null) ? enableChartMode : s.useChartMode
          }));
        }
      } catch (e) {
        console.warn('[App] Failed to load feature flags:', e);
      }
    };
    loadFlags();
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
      // Skip restore modal during OAuth callback or when explicit user intent exists
      try {
        const params = new URLSearchParams(window.location.search);
        if (params.get('access_token')) {
          // OAuth callback: do not block flows or show restore modal
          suppressAutoRejoinRef.current = false;
          return;
        }
      } catch {}
      const hasPendingCreate = !!localStorage.getItem('pending_create');
      const hasPendingReauth = !!localStorage.getItem('pending_reauth');
      if (hasPendingCreate || hasPendingReauth) {
        // Explicit intent flows: allow to proceed, no modal
        suppressAutoRejoinRef.current = false;
        return;
      }

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
        setSocketReady(true);

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
                
                // CRITICAL FIX: If this player was the current player before refresh,
                // update currentPlayerId to their new socket ID so buttons remain clickable
                const wasCurrentPlayer = saved && saved.playerId === saved.currentPlayerId;
                if (wasCurrentPlayer && socketRef.current) {
                  console.log('[Socket] Auto-rejoin: Was current player, updating currentPlayerId to new socket ID');
                  setCurrentPlayerId(socketRef.current.id);
                } else {
                  setCurrentPlayerId(gameState.currentPlayerId);
                }
                
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
        
        // CRITICAL FIX: Preserve currentPlayerId if this player was the current player before game_update
        // (This handles the case where game_update arrives after reconnection with stale socket IDs)
        // Check against saved session data since prevCurrentPlayerId might already be stale
        const savedSession = sessionManager.hasValidSession && sessionManager.hasValidSession() 
          ? sessionManager.getSession() 
          : null;
        const wasCurrentPlayer = savedSession && savedSession.playerId === savedSession.currentPlayerId;
        
        if (wasCurrentPlayer && socketRef.current) {
          console.log('[App] game_update: Preserving currentPlayerId after reconnection (from session data)');
          setCurrentPlayerId(socketRef.current.id);
        } else {
          setCurrentPlayerId(game.currentPlayerId || (game.players && game.players[0]?.id));
        }
        
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
    
    // ENHANCED FIX: Ensure we stop playback on ANY active device, not just stored device
    const hasSpotifyToken = !!localStorage.getItem('access_token');
    
    if (hasSpotifyToken) {
      console.log("[App] Creator detected, ensuring playback is stopped on all devices due to:", data.reason);
      
      // Enhanced stop logic: pause on current device AND any active device
      (async () => {
        try {
          // First, try to pause on the current known device
          if (spotifyDeviceId) {
            console.log("[App] Pausing on current device:", spotifyDeviceId);
            await pauseSpotifyPlayback().catch(e => console.warn("[App] Failed to pause current device:", e));
          }
          
          // Then, check for any active devices and pause them too
          const devices = await spotifyAuth.getDevices();
          const activeDevice = devices.find(d => d.is_active);
          
          if (activeDevice && activeDevice.id !== spotifyDeviceId) {
            console.log("[App] Found different active device, pausing it too:", activeDevice.name);
            await spotifyAuth.pausePlayback(activeDevice.id).catch(e => 
              console.warn("[App] Failed to pause active device:", e)
            );
          }
          
          // Also clear the last played URI to ensure fresh start
          lastPlayedUriRef.current = null;
          console.log("[App] Cleared last played URI for fresh start");
          
        } catch (e) {
          console.warn("[App] Error during enhanced stop music:", e?.message || e);
        }
      })();
    } else {
      console.log("[App] Not creator, no pause needed");
    }
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
        
        // Clear session data to prevent restore dialogue
        sessionManager.clearSession();
        try { 
          sessionStorage.removeItem(PENDING_RESTORE_KEY); 
        } catch {}
        
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

      // Handle host leaving
      socketRef.current.on("host_left", (data) => {
        console.log("[Socket] Host left:", data);
        // Clean up session data
        sessionManager.clearSession();
        try { 
          sessionStorage.removeItem(PENDING_RESTORE_KEY); 
        } catch {}
        
        // Show notification to user
        alert(data.message || "The host has left the game. You will be returned to the lobby.");
        
        // Reset state and return to landing
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
          
          // Show the auth renewal success modal first
          setAuthRenewalGameState(gameState);
          setShowSpotifyAuthRenewal(true);
          
          // Auto-restore the game state after a brief delay
          setTimeout(() => {
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
            
            // Hide the renewal modal after restoration
            setShowSpotifyAuthRenewal(false);
            setAuthRenewalGameState(null);
            
            // Clear backup
            localStorage.removeItem('game_state_backup');
            localStorage.removeItem('pending_reauth');
            
            // If we're in a game, try to reconnect to the backend session
            if (gameState.view === 'game' && socketRef.current && socketRef.current.connected) {
              console.log('[Spotify] Attempting to reconnect to backend session after auth');
              socketRef.current.emit('reconnect_session', {
                sessionId: gameState.sessionId,
                roomCode: gameState.roomCode,
                playerName: gameState.playerName
              }, (response) => {
                if (response.success) {
                  console.log('[Spotify] Successfully reconnected to backend after auth');
                  // Update with fresh game state from backend
                  if (response.view === 'game' && response.gameState) {
                    const freshGameState = response.gameState;
                    setPlayers(freshGameState.players);
                    setCurrentPlayerIdx(freshGameState.currentPlayerIdx || 0);
                    setTimeline(freshGameState.timeline || []);
                    setDeck(freshGameState.deck || []);
                    setPhase(freshGameState.phase);
                    setFeedback(freshGameState.feedback);
                    setShowFeedback(!!freshGameState.feedback && freshGameState.phase === 'reveal');
                    setLastPlaced(freshGameState.lastPlaced);
                    setRemovingId(freshGameState.removingId);
                    setChallenge(freshGameState.challenge);
                    setCurrentPlayerId(freshGameState.currentPlayerId);
                  }
                } else {
                  console.warn('[Spotify] Failed to reconnect to backend after auth:', response.error);
                }
              });
            }
          }, 2000); // Show success message for 2 seconds before auto-restoring
          
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
          previewMode: isPreviewMode
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

      // Check if we have a current song that should be playing
      const shouldAutoplay = currentCard?.uri && (
        isPlayingMusic || // Currently playing
        window.__beatablyPendingAutoplay || // Autoplay was intended
        phase === 'player-turn' // In active gameplay phase
      );

      if (shouldAutoplay) {
        console.log('[App] Transferring and starting playback on new device using deviceAwarePlayback:', newDeviceId);
        try {
          await deviceAwarePlayback.switchDevice(newDeviceId, currentCard.uri, true);
          setIsPlayingMusic(true);
          // Clear pending autoplay intent since we've fulfilled it
          window.__beatablyPendingAutoplay = false;
          console.log('[App] Successfully switched device and started playback via deviceAwarePlayback');
        } catch (error) {
          console.warn('[App] deviceAwarePlayback switch failed, falling back to spotifyAuth:', error);
          // Fallback to original method
          await spotifyAuth.transferPlayback(newDeviceId, false);
          setTimeout(async () => {
            try {
              const success = await spotifyAuth.verifiedStartPlayback(
                newDeviceId,
                currentCard.uri,
                0,
                { pauseFirst: true, transferFirst: false, maxVerifyAttempts: 4, verifyDelayMs: 250 }
              );
              if (success) {
                console.log('[App] Successfully started playback on new device via fallback:', newDeviceId);
                setIsPlayingMusic(true);
                // Clear pending autoplay intent since we've fulfilled it
                window.__beatablyPendingAutoplay = false;
              }
            } catch (error) {
              console.error('[App] Error starting playback on new device:', error);
            }
          }, 300);
        }
      } else {
        // Just transfer without starting playback
        console.log('[App] Transferring device without autoplay using deviceAwarePlayback:', newDeviceId);
        try {
          await deviceAwarePlayback.transferPlayback(newDeviceId);
          console.log('[App] Successfully transferred device via deviceAwarePlayback');
        } catch (error) {
          console.warn('[App] deviceAwarePlayback transfer failed, falling back to spotifyAuth:', error);
          await spotifyAuth.transferPlayback(newDeviceId, false);
        }
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
              
              // CRITICAL FIX: If this player was the current player before refresh,
              // update currentPlayerId to their new socket ID so buttons remain clickable
              const wasCurrentPlayer = sessionRestoreData && sessionRestoreData.playerId === sessionRestoreData.currentPlayerId;
              if (wasCurrentPlayer && socketRef.current) {
                console.log('[SessionManager] Manual restore: Was current player, updating currentPlayerId to new socket ID');
                setCurrentPlayerId(socketRef.current.id);
              } else {
                setCurrentPlayerId(gameState.currentPlayerId);
              }
              
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
    try { sessionStorage.removeItem(PENDING_RESTORE_KEY); } catch {}
    setShowSessionRestore(false);
    setSessionRestoreData(null);
    // Allow pending flows (e.g., create lobby) and future auto-rejoin attempts
    suppressAutoRejoinRef.current = false;
  };

  // Create game handler (calls backend)
  // Create game - No Spotify auth required (preview mode is default)
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
    } catch {}
    
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
  const nextPlayer = () => {
    setCurrentPlayerIdx((idx) => (idx + 1) % players.length);
  };

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
      if (spotifyDeviceId) {
        try {
          await pauseSpotifyPlayback();
        } catch (e) {
          console.warn('[App] Failed to pause playback during restart:', e);
        }
      }
      
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
    } catch {}
    
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

  // Track current card for device switching - no auto-play
  useEffect(() => {
    // Expose current card globally for device switching
    if (currentCard) {
      window.currentGameCard = currentCard;
    }
    
    // Update last played URI ref when card changes to track state
    if (currentCard?.uri && currentCard.uri !== lastPlayedUriRef.current) {
      console.log("[Spotify] New song URI detected (no auto-play):", currentCard.uri);
      // Don't set lastPlayedUriRef here - let manual play button set it
    }
  }, [currentCard?.uri]);

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
      fetchCuratedSongs().then((songsData) => {
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

  // Auto-detect missing/expired Spotify auth at initialization and when host enters views
  useEffect(() => {
    const autoDetectAndReauth = async () => {
      // Only for host/creator
      if (!isCreator) return;

      // Skip if we're currently processing an OAuth callback with access_token in the URL
      try {
        const params = new URLSearchParams(window.location.search);
        if (params.get('access_token')) return;
      } catch {}

      const minimalGameState = {
        view,
        playerName,
        roomCode,
        isCreator,
        timestamp: Date.now()
      };

      const token = localStorage.getItem('access_token');
      if (!token) {
        // Triggers centralized listener which immediately redirects
        spotifyAuth.initiateReauth(minimalGameState);
        return;
      }

      try {
        const status = await spotifyAuth.ensureValidToken();
        if (!status.valid) {
          spotifyAuth.initiateReauth(minimalGameState);
        }
      } catch (e) {
        // Network or transient error; do not block UX here
        console.warn('[App] Token validation error during init check:', e?.message || e);
      }
    };
    autoDetectAndReauth();
  }, [isCreator, view, playerName, roomCode]);

  // Listen for Spotify auth required events
  useEffect(() => {
    const handleSpotifyAuthRequired = (event) => {
      console.log('[App] Spotify auth required event received:', event.detail);
      
      // Prepare game state for restoration
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
      
      // Immediately redirect to Spotify auth without requiring any user interaction
      spotifyAuth.redirectToAuth(gameState);
    };

    window.addEventListener('spotify_auth_required', handleSpotifyAuthRequired);
    
    return () => {
      window.removeEventListener('spotify_auth_required', handleSpotifyAuthRequired);
    };
  }, [view, playerName, roomCode, isCreator, players, currentPlayerId, phase, 
      timeline, deck, currentCard, feedback, showFeedback, lastPlaced, 
      removingId, challenge, gameRound, gameSettings]);

  // Spotify auth renewal handlers
  const handleSpotifyAuthRenewal = () => {
    console.log('[App] User confirmed Spotify auth renewal');
    spotifyAuth.redirectToAuth(authRenewalGameState);
  };

  const handleSpotifyAuthRenewalDismiss = () => {
    console.log('[App] User dismissed Spotify auth renewal');
    setShowSpotifyAuthRenewal(false);
    setAuthRenewalGameState(null);
  };

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
        {isCreator && !spotifyToken && !showSessionRestore && !isPreviewMode && (
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
        {showSpotifyAuthRenewal && (
          <SpotifyAuthRenewal
            isVisible={showSpotifyAuthRenewal}
            onRenew={handleSpotifyAuthRenewal}
            onDismiss={handleSpotifyAuthRenewalDismiss}
            gameState={authRenewalGameState}
            autoRedirect={false}
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
        {showSpotifyAuthRenewal && (
          <SpotifyAuthRenewal
            isVisible={showSpotifyAuthRenewal}
            onRenew={handleSpotifyAuthRenewal}
            onDismiss={handleSpotifyAuthRenewalDismiss}
            gameState={authRenewalGameState}
            autoRedirect={false}
          />
        )}
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
          />
          <div className="flex-1 flex flex-col items-center justify-center p-1 md:p-2 z-10 bg-background overflow-hidden min-h-0">
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
          

          {/* Spotify Authorization Renewal Modal */}
          {showSpotifyAuthRenewal && (
            <SpotifyAuthRenewal
              isVisible={showSpotifyAuthRenewal}
              onRenew={handleSpotifyAuthRenewal}
              onDismiss={handleSpotifyAuthRenewalDismiss}
              gameState={authRenewalGameState}
              autoRedirect={false}
            />
          )}
        </div>
      </DndProvider>
    );
  }
  return null;
}

export default App;
