import React, { useState } from "react";
import spotifyAuth from "./utils/spotifyAuth";
import productionPlaybackFix from "./utils/productionPlaybackFix";
import DeviceSwitchModal from './DeviceSwitchModal';
import SongGuessModal from './SongGuessModal';
import { usePreviewMode } from './contexts/PreviewModeContext';

function GameFooter({ 
  currentCard, 
  showFeedback, 
  feedback, 
  onContinue, 
  onRestart, 
  players, 
  currentPlayerId, 
  myPlayerId, 
  isMyTurn, 
  phase,
  onUseToken,
  onGuessSong,
  challenge,
  onChallengeResponse,
  onInitiateChallenge,
  onContinueAfterChallenge,
  onSkipChallenge,
  onSkipSongGuess,
  spotifyDeviceId,
  isPlayingMusic,
  isCreator,
  socketRef,
  roomCode,
  isDragging,
  pendingDropIndex,
  onConfirmDrop,
  onCancelDrop
}) {
  // Preview Mode context
  const { 
    isPreviewMode, 
    isPlaying: previewIsPlaying,
    currentTime: previewCurrentTime,
    duration: previewDuration,
    playPreview,
    pausePreview,
    resumePreview,
    stopPreview
  } = usePreviewMode();
  
  // Determine if we're using preview mode (only creator uses it)
  const usingPreviewMode = isPreviewMode && isCreator;
  
  // Track local playing state for UI
  const [localIsPlaying, setLocalIsPlaying] = React.useState(false);
  const [progress, setProgress] = React.useState(0);
  const [duration, setDuration] = React.useState(30); // Default 30 seconds
  const [spotifyPosition, setSpotifyPosition] = React.useState(0);
  
  // Track when a new song has been loaded but not yet played
  const [showNewSongMessage, setShowNewSongMessage] = React.useState(false);
  const lastCardIdRef = React.useRef(null);
  
  // Track if play has been pressed at least once for current song
  const [hasPlayedOnce, setHasPlayedOnce] = React.useState(false);

  // Use real Spotify playing state if available, otherwise use local state
  const [isSpotifyPlaying, setIsSpotifyPlaying] = React.useState(false);
  const [currentSpotifyUri, setCurrentSpotifyUri] = React.useState(null);
  
  // Add optimistic UI state for instant visual feedback
  const [optimisticIsPlaying, setOptimisticIsPlaying] = React.useState(null);
  
  // Pulsating glow effect for paused state
  const [glowIntensity, setGlowIntensity] = React.useState(0.3);
  
  // Use optimistic state if available, otherwise fall back to actual state
  // In preview mode, use preview playing state
  const actualIsPlaying = usingPreviewMode 
    ? previewIsPlaying
    : (optimisticIsPlaying !== null 
      ? optimisticIsPlaying 
      : (isCreator && spotifyDeviceId ? isSpotifyPlaying : localIsPlaying));
  
  // Use preview mode progress/duration when active
  const displayProgress = usingPreviewMode ? previewCurrentTime : progress;
  const displayDuration = usingPreviewMode ? previewDuration : duration;
  
  // Pulsating animation for paused button
  React.useEffect(() => {
    if (!actualIsPlaying && isCreator) {
      let intensity = 0.3;
      let increasing = true;
      
      const pulseInterval = setInterval(() => {
        if (increasing) {
          intensity += 0.01;
          if (intensity >= 0.65) increasing = false;
        } else {
          intensity -= 0.01;
          if (intensity <= 0.3) increasing = true;
        }
        setGlowIntensity(intensity);
      }, 50); // Update every 50ms for smooth animation
      
      return () => clearInterval(pulseInterval);
    }
  }, [actualIsPlaying, isCreator]);

  // Get real Spotify playback position with enhanced error handling
  React.useEffect(() => {
    if (!isCreator || !spotifyDeviceId || !window.Spotify) return;

    const getPlaybackState = async () => {
      try {
        const state = await spotifyAuth.getPlaybackState(spotifyDeviceId);
        // Update now-playing details for creator UI and controls
        const playing = !!state?.is_playing;
        const uri = state?.item?.uri || null;
        setIsSpotifyPlaying(playing);
        setCurrentSpotifyUri(uri);

        if (state && state.item) {
          const positionMs = state.progress_ms || 0;
          const durationMs = state.item.duration_ms || 30000;

          setSpotifyPosition(Math.floor(positionMs / 1000));
          setDuration(Math.floor(durationMs / 1000));
          setProgress(Math.floor(positionMs / 1000));
        }
      } catch (error) {
        console.log('[GameFooter] Error getting playback state:', error);
        if (error.message?.includes('Token expired')) {
          handleTokenExpiration();
        }
      }
    };

    // Update position every second when playing
    if (isCreator && spotifyDeviceId) {
      // Poll state every second while creator is connected to a device
      const interval = setInterval(getPlaybackState, 1000);
      return () => clearInterval(interval);
    }
  }, [actualIsPlaying, isCreator, spotifyDeviceId]);

  // Fallback progress for non-creators - sync with creator's music state
  React.useEffect(() => {
    if (isCreator && spotifyDeviceId) return; // Use real Spotify data

    // For non-creators, sync with the actual playing state from creator
    if (!actualIsPlaying) return;
    if (progress >= duration) {
      setLocalIsPlaying(false);
      return;
    }
    const interval = setInterval(() => setProgress((p) => Math.min(p + 1, duration)), 1000);
    return () => clearInterval(interval);
  }, [actualIsPlaying, progress, duration, isCreator, spotifyDeviceId]);

  // Sync non-creator progress with creator's music state
  React.useEffect(() => {
    if (isCreator && spotifyDeviceId) return; // Creator uses real Spotify state

    // When music starts/stops, sync the local playing state
    if (isPlayingMusic && !localIsPlaying) {
      setLocalIsPlaying(true);
    } else if (!isPlayingMusic && localIsPlaying) {
      setLocalIsPlaying(false);
    }
  }, [isPlayingMusic, localIsPlaying, isCreator, spotifyDeviceId]);

  // Detect when a new song is loaded and show message
  React.useEffect(() => {
    if (currentCard?.id && currentCard.id !== lastCardIdRef.current) {
      console.log('[GameFooter] New song detected:', currentCard.title);
      lastCardIdRef.current = currentCard.id;
      
      // Reset hasPlayedOnce for new song
      setHasPlayedOnce(false);
      
      // Show "new song loaded" message for creator only
      if (isCreator) {
        setShowNewSongMessage(true);
      }
    }
  }, [currentCard?.id, isCreator]);
  
  // Reset progress when new song starts (when currentCard changes)
  React.useEffect(() => {
    console.log('[GameFooter] Current card changed, resetting progress:', currentCard?.title);
    setProgress(0);
    if (!isCreator || !spotifyDeviceId) {
      setLocalIsPlaying(false);
    }
  }, [currentCard?.id, isCreator, spotifyDeviceId]);

  // CRITICAL FIX: Reset progress when new turn/round starts (even if auto-play fails)
  React.useEffect(() => {
    console.log('[GameFooter] New turn/round detected, resetting progress:', {
      currentPlayerId,
      phase,
      isMyTurn
    });
    
    // Reset progress whenever a new turn starts or we enter player-turn phase
    if (phase === 'player-turn') {
      setProgress(0);
      if (!isCreator || !spotifyDeviceId) {
        setLocalIsPlaying(false);
      }
    }
  }, [currentPlayerId, phase, isCreator, spotifyDeviceId]);

  // Function to trigger Spotify playback with enhanced error handling
  const triggerSpotifyPlayback = async () => {
    const trackUri = currentCard?.uri || currentCard?.spotifyUri;
    if (!isCreator || !spotifyDeviceId || !trackUri) {
      console.log('[GameFooter] Cannot play - missing requirements:', {
        isCreator,
        spotifyDeviceId: !!spotifyDeviceId,
        hasUri: !!trackUri,
        currentCard: currentCard ? { title: currentCard.title, uri: currentCard.uri, spotifyUri: currentCard.spotifyUri } : null
      });
      return false;
    }

    try {
      console.log('[GameFooter] Triggering Spotify playback for:', currentCard.title);

      // Validate token before making request
      const tokenValidation = await spotifyAuth.ensureValidToken();
      if (!tokenValidation.valid) {
        console.error('[GameFooter] Token validation failed');
        if (tokenValidation.requiresAuth) {
          handleTokenExpiration();
          return false;
        }
        return false;
      }

      // CRITICAL FIX: Always transfer to the current SDK device first to ensure it's active
      console.log('[GameFooter] Transferring to current SDK device:', spotifyDeviceId);
      const transferSuccess = await spotifyAuth.transferPlayback(spotifyDeviceId, false);
      if (!transferSuccess) {
        console.warn('[GameFooter] Transfer to SDK device failed, continuing anyway');
      }

      // Small delay to let transfer take effect
      await new Promise(resolve => setTimeout(resolve, 300));

      // Now start playback on the active device (without device_id to avoid 404)
      const success = await spotifyAuth.verifiedStartPlayback(null, trackUri, 0, {
        pauseFirst: false, // Don't pause since we just transferred
        transferFirst: false, // Already transferred above
        maxVerifyAttempts: 4,
        verifyDelayMs: 250
      });

      if (success) {
        console.log('[GameFooter] Successfully started Spotify playback');
        // Update stored device to current SDK device
        spotifyAuth.storeDeviceId(spotifyDeviceId);
        return true;
      } else {
        console.log('[GameFooter] Spotify playback failed, trying fallback');
        return false;
      }
    } catch (error) {
      console.error('[GameFooter] Error triggering Spotify playback:', error);

      if (error.message.includes('Token expired')) {
        handleTokenExpiration();
        return false;
      }

      // Try preview fallback on any error
      return false;
    }
  };


  // Function to pause Spotify playback with enhanced error handling
  const pauseSpotifyPlayback = async () => {
    if (!isCreator) return false;

    try {
      console.log('[GameFooter] Pausing Spotify playback on current SDK device:', spotifyDeviceId);
      
      // Always ensure the current SDK device is active first
      if (spotifyDeviceId) {
        await spotifyAuth.transferPlayback(spotifyDeviceId, false);
        // Small delay to let transfer take effect
        await new Promise(resolve => setTimeout(resolve, 200));
      }
      
      // Pause the active device (without device_id to avoid 404)
      return await spotifyAuth.pausePlayback();
    } catch (error) {
      console.error('[GameFooter] Error pausing Spotify playback:', error);
      if (error.message?.includes?.('Token expired')) {
        handleTokenExpiration();
      }
      return false;
    }
  };

  // Function to restart current track with enhanced error handling
  const restartSpotifyTrack = async () => {
    if (!isCreator || !currentCard?.uri) return false;

    try {
      const locked = localStorage.getItem('spotify_device_id');
      const target = locked || spotifyDeviceId;
      console.log('[GameFooter] Restarting Spotify track on target:', target || 'unknown');
      // Wake/activate the selected device first, then start from 0 on that device
      if (target) {
        await spotifyAuth.transferPlayback(target, false);
      }
      const ok = await spotifyAuth.verifiedStartPlayback(
        target,
        currentCard.uri,
        0,
        { pauseFirst: true, transferFirst: false, maxVerifyAttempts: 3, verifyDelayMs: 250 }
      );
      return ok;
    } catch (error) {
      console.error('[GameFooter] Error restarting Spotify track:', error);
      if (error.message?.includes?.('Token expired')) {
        handleTokenExpiration();
      }
      return false;
    }
  };

  // Function to resume Spotify playback with enhanced error handling
  const resumeSpotifyPlayback = async () => {
    if (!isCreator) return false;

    try {
      const locked = localStorage.getItem('spotify_device_id');
      const target = locked || spotifyDeviceId;
      console.log('[GameFooter] Resuming Spotify playback on target:', target || 'active');

      // 1) Make sure the selected device is the active one (but do not auto-play)
      if (target) {
        await spotifyAuth.transferPlayback(target, false);
      }

      // 2) Attempt a true resume on the active device (continues from paused position)
      const resumed = await spotifyAuth.resumePlayback(); // no device_id -> active device
      if (resumed) return true;

      // 3) Fallback: if resume fails and we know the intended track, try to continue from last known position
      //    using verifiedStartPlayback at the current Spotify-reported position (not 0).
      if (currentCard?.uri) {
        let state = null;
        try {
          state = await spotifyAuth.getPlaybackState(target);
        } catch (_) {}
        const positionMs = state?.progress_ms ?? 0;
        const ok = await spotifyAuth.verifiedStartPlayback(
          target,
          currentCard.uri,
          positionMs,
          { pauseFirst: false, transferFirst: false, maxVerifyAttempts: 3, verifyDelayMs: 250 }
        );
        return ok;
      }

      return false;
    } catch (error) {
      console.error('[GameFooter] Error resuming Spotify playback:', error);
      if (error.message?.includes?.('Token expired')) {
        handleTokenExpiration();
      }
      return false;
    }
  };

  // Function to stop Spotify playback when moving to next player
  const stopSpotifyPlayback = async () => {
    if (!isCreator || !spotifyDeviceId) return false;

    try {
      console.log('[GameFooter] Stopping Spotify playback for next player turn');
      return await spotifyAuth.pausePlayback(spotifyDeviceId);
    } catch (error) {
      console.error('[GameFooter] Error stopping Spotify playback:', error);
      if (error.message.includes('Token expired')) {
        handleTokenExpiration();
      }
      return false;
    }
  };

  // Handle Spotify token expiration
  const handleTokenExpiration = () => {
    console.log('[GameFooter] Spotify token expired, requesting re-authentication');
    
    // Save current game state with actual room code and player info
    const myPlayer = players?.find(p => p.id === myPlayerId);
    const gameState = {
      view: 'game',
      playerName: myPlayer?.name || 'Current Player',
      roomCode: roomCode || 'UNKNOWN_ROOM',
      isCreator: isCreator,
      timestamp: Date.now()
    };
    
    // Use the new spotifyAuth system to trigger re-authentication
    spotifyAuth.initiateReauth(gameState);
  };

  // Handle play/pause button click with real Spotify state awareness
  const handlePlayPauseClick = async () => {
    console.log('[GameFooter] Play button clicked:', {
      isCreator,
      usingPreviewMode,
      spotifyDeviceId: !!spotifyDeviceId,
      actualIsPlaying,
      isSpotifyPlaying,
      currentSpotifyUri,
      currentCardUri: currentCard?.uri,
      currentCardTitle: currentCard?.title,
      previewUrl: currentCard?.previewUrl || currentCard?.preview_url
    });

    // Hide "new song loaded" message when play is pressed and mark that play has been pressed
    if (showNewSongMessage) {
      setShowNewSongMessage(false);
      setHasPlayedOnce(true);
    }

    // CRITICAL FIX: Reset progress when user manually presses play (fallback for failed auto-play)
    if (!actualIsPlaying && phase === 'player-turn') {
      console.log('[GameFooter] Manual play detected, resetting progress as fallback');
      setProgress(0);
      if (!isCreator || !spotifyDeviceId) {
        setLocalIsPlaying(false);
      }
    }

    // PREVIEW MODE: Handle preview playback for creators
    if (usingPreviewMode) {
      const previewUrl = currentCard?.previewUrl || currentCard?.preview_url;
      
      if (!previewUrl) {
        console.warn('[PreviewMode] No preview URL available for:', currentCard?.title);
        return;
      }
      
      if (previewIsPlaying) {
        pausePreview();
      } else {
        if (previewCurrentTime > 0) {
          await resumePreview();
        } else {
          await playPreview(previewUrl);
        }
      }
      return;
    }

    // Check if this is a creator who should have Spotify access
    const hasSpotifyToken = !!localStorage.getItem('access_token');
    
    // If creator has no token at all, immediately trigger re-auth (no buttons)
    if (isCreator && !hasSpotifyToken && !isPreviewMode) {
      console.log('[GameFooter] No Spotify token for creator - triggering re-auth');
      handleTokenExpiration();
      return;
    }
    
    if (isCreator && hasSpotifyToken) {
      // Validate token first before attempting any Spotify operations
      const tokenValidation = await spotifyAuth.ensureValidToken();
      if (!tokenValidation.valid) {
        console.log('[GameFooter] Token validation failed, triggering re-auth');
        handleTokenExpiration();
        return;
      }
    }

    if (isCreator && spotifyDeviceId) {
      try {
        // Safari activate element if available (no-op elsewhere)
        if (window.Spotify && window.spotifyPlayerInstance?.activateElement) {
          try {
            const footerElement = document.querySelector('footer') || document.body;
            await window.spotifyPlayerInstance.activateElement(footerElement);
            console.log('[GameFooter] Spotify player activated for Safari');
          } catch (e) {
            console.log('[GameFooter] Error activating Spotify player:', e);
          }
        }

        // Always fetch current state first to avoid racing against autoplay
        let state = null;
        try {
          state = await spotifyAuth.getPlaybackState(spotifyDeviceId);
        } catch (e) {
          console.log('[GameFooter] Error reading playback state:', e);
        }
        const statePlaying = !!state?.is_playing;
        const stateUri = state?.item?.uri || null;
        const targetUri = currentCard?.uri || currentCard?.spotifyUri || null;
        const sameTrack = !!targetUri && targetUri === stateUri;

        // If currently playing the same track -> pause
        if (statePlaying && sameTrack) {
          // Set optimistic state for instant feedback
          setOptimisticIsPlaying(false);
          setTimeout(() => setOptimisticIsPlaying(null), 2000);
          
          await pauseSpotifyPlayback();
          // update UI immediately; poller will refresh soon
          setIsSpotifyPlaying(false);
          return;
        }

        // If same track but paused -> resume
        if (!statePlaying && sameTrack) {
          // Set optimistic state for instant feedback
          setOptimisticIsPlaying(true);
          setTimeout(() => setOptimisticIsPlaying(null), 2000);
          
          const ok = await resumeSpotifyPlayback();
          if (ok) setIsSpotifyPlaying(true);
          return;
        }

        // Different or no track -> check if we need production fix first
        const needsFix = await productionPlaybackFix.shouldApplyFix();
        
        if (needsFix) {
          console.log('[GameFooter] Applying production playback fix...');
          const fixSuccess = await productionPlaybackFix.forcePlaybackReset(spotifyDeviceId, targetUri);
          if (fixSuccess) {
            setIsSpotifyPlaying(true);
            setCurrentSpotifyUri(targetUri);
            return;
          } else {
            console.warn('[GameFooter] Production fix failed, falling back to normal playback');
          }
        }
        
        // Normal playback start
        const started = await triggerSpotifyPlayback();
        if (started) {
          setIsSpotifyPlaying(true);
          setCurrentSpotifyUri(targetUri);
        }
      } catch (error) {
        console.log('[GameFooter] Error in Spotify playback:', error);
      }
    } else {
      // Non-creator: no-op (creator controls playback)
      return;

      if (!localIsPlaying) {
        setLocalIsPlaying(true);
        if (currentCard?.preview_url) {
          try {
            const audio = new Audio(currentCard.preview_url);
            audio.volume = 0.3;
            audio.setAttribute('playsinline', 'true');
            audio.setAttribute('webkit-playsinline', 'true');
            audio.muted = false;
            window.currentGameAudio = audio;
            const playPromise = audio.play();
            if (playPromise && playPromise.catch) {
              playPromise.catch((err) => {
                if (err?.name === 'NotAllowedError') {
                  alert('Tap the play button again to enable audio');
                } else {
                  console.log('[GameFooter] Audio playback failed:', err);
                }
              });
            }
          } catch (e) {
            console.log('[GameFooter] Audio creation failed:', e);
          }
        }
      } else {
        setLocalIsPlaying(false);
        if (window.currentGameAudio) {
          try {
            window.currentGameAudio.pause();
            window.currentGameAudio = null;
          } catch (e) {
            console.log('[GameFooter] Error pausing audio:', e);
          }
        }
      }
    }
  };

  // Handle restart button click
  const handleRestartClick = () => {
    if (usingPreviewMode) {
      // Stop and restart preview from beginning
      stopPreview();
      const previewUrl = currentCard?.previewUrl || currentCard?.preview_url;
      if (previewUrl) {
        playPreview(previewUrl);
      }
    } else if (isCreator && spotifyDeviceId) {
      restartSpotifyTrack();
    } else {
      setProgress(0);
      setLocalIsPlaying(true);
    }
  };

// Song guessing state - now handled by modal
  const [showSongGuessModal, setShowSongGuessModal] = useState(false);
  const [newSongRequest, setNewSongRequest] = useState(null); // For creator notifications
  // Removed tokenExpiredNotification UI: re-auth is mandatory; no local fallback
  const [showDeviceModal, setShowDeviceModal] = useState(false);
  // Prevent spamming skip_song while backend reconnects or processes the request
  const skipInFlightRef = React.useRef(false);

  // Button refs for focus management
  const compactPlayButtonRef = React.useRef(null);
  const restartButtonRef = React.useRef(null);
  const mainPlayButtonRef = React.useRef(null);
  const deviceSwitchButtonRef = React.useRef(null);
  const challengeRejectButtonRef = React.useRef(null);
  const challengeAcceptButtonRef = React.useRef(null);
  const songGuessSkipButtonRef = React.useRef(null);
  const songGuessSubmitButtonRef = React.useRef(null);
  const songGuessModalGuessButtonRef = React.useRef(null);
  const songGuessModalSkipButtonRef = React.useRef(null);
  const challengeWindowChallengeButtonRef = React.useRef(null);
  const challengeWindowSkipButtonRef = React.useRef(null);
  const challengeWindowOkButtonRef = React.useRef(null);
  const challengeResolvedContinueButtonRef = React.useRef(null);
  const dropCancelButtonRef = React.useRef(null);
  const dropConfirmButtonRef = React.useRef(null);
  const feedbackContinueButtonRef = React.useRef(null);
  const newSongButtonRef = React.useRef(null);


  // Format time mm:ss (no decimals)
  const formatTime = (s) => {
    const seconds = Math.floor(s); // Remove decimals
    return `${Math.floor(seconds/60)}:${(seconds%60).toString().padStart(2, '0')}`;
  };

  const myPlayer = players?.find(p => p.id === myPlayerId);
  const currentPlayer = players?.find(p => p.id === currentPlayerId);


  const handleTokenAction = (action, targetPlayerId = null) => {
    console.log('[GameFooter] handleTokenAction called:', { action, targetPlayerId, myPlayerId, isMyTurn });
    
    // Throttle skip_song to avoid repeated pauses when backend is reconnecting
    if (action === 'skip_song') {
      if (skipInFlightRef.current) {
        console.log('[GameFooter] skip_song ignored (in-flight)');
        return;
      }
      skipInFlightRef.current = true;
      // Reset guard after a short window; backend also updates state which will naturally clear it
      setTimeout(() => { skipInFlightRef.current = false; }, 2000);
    }
    
    // CRITICAL FIX: Stop music immediately when "New Song" is clicked
    // This works for both preview mode and Spotify mode
    if (action === 'skip_song') {
      if (usingPreviewMode) {
        console.log('[GameFooter] Stopping preview before new song');
        stopPreview();
      } else if (spotifyDeviceId && isPlayingMusic) {
        console.log('[GameFooter] Pausing Spotify before new song');
        pauseSpotifyPlayback();
      }
    }
    
    // If this is a non-creator requesting a new song, send request to server
    if (action === 'skip_song' && !isCreator) {
      // Send request through server to notify creator
      if (socketRef?.current) {
        socketRef.current.emit('request_new_song', {
          code: roomCode,
          playerName: myPlayer?.name || 'A player'
        });
      }
    }
    
    onUseToken(action, targetPlayerId);
  };

  // Creator prompt removed: backend now auto-loads and emits new song with URI,
  // so we no longer show a manual "Load New Song" notification/CTA to the creator.
  React.useEffect(() => {
    if (!socketRef?.current || !isCreator) return;

    const handleNewSongRequest = (data) => {
      console.log('[GameFooter] Received new song request (no prompt, auto-load handled by backend):', data);
      // No UI prompt: backend will emit stop_music + new_song_loaded with URI and autoplay will occur.
      // Keep this listener only for optional future analytics/toast if desired.
      setNewSongRequest(null);
    };

    socketRef.current.on('new_song_request', handleNewSongRequest);

    return () => {
      socketRef.current?.off('new_song_request', handleNewSongRequest);
    };
  }, [socketRef, isCreator]);

  // Listen for progress sync (non-creators only)
  React.useEffect(() => {
    if (!socketRef?.current || isCreator) return;

    const handleProgressSync = (data) => {
      console.log('[GameFooter] Received progress sync:', data);
      setProgress(data.progress || 0);
      setDuration(data.duration || 30);
      setLocalIsPlaying(data.isPlaying || false);
    };

    socketRef.current.on('progress_sync', handleProgressSync);

    return () => {
      socketRef.current?.off('progress_sync', handleProgressSync);
    };
  }, [socketRef, isCreator]);

  // Broadcast progress updates (creator only) - works in both Spotify and preview mode
  React.useEffect(() => {
    // Only creator should broadcast, and only if we have a room and socket
    if (!socketRef?.current || !isCreator || !roomCode) return;
    
    // In Spotify mode, wait for device to be ready; in preview mode, always broadcast
    if (!usingPreviewMode && !spotifyDeviceId) return;

    const broadcastProgress = () => {
      console.log('[GameFooter] Broadcasting progress:', { 
        progress: displayProgress, 
        duration: displayDuration, 
        isPlaying: actualIsPlaying,
        mode: usingPreviewMode ? 'preview' : 'spotify'
      });
      socketRef.current.emit('progress_update', {
        code: roomCode,
        progress: displayProgress,
        duration: displayDuration,
        isPlaying: actualIsPlaying
      });
    };

    // Broadcast progress every 2 seconds when playing, and once when state changes
    if (actualIsPlaying) {
      // Immediate broadcast when starting
      broadcastProgress();
      const interval = setInterval(broadcastProgress, 2000);
      return () => clearInterval(interval);
    } else {
      // Broadcast pause state immediately
      broadcastProgress();
    }
  }, [socketRef, roomCode, displayProgress, displayDuration, actualIsPlaying, isCreator, usingPreviewMode, spotifyDeviceId]);

  // Enhanced creator detection
  React.useEffect(() => {
    const hasSpotifyToken = !!localStorage.getItem('access_token');
    console.log('[GameFooter] Creator detection:', { 
      isCreator, 
      hasSpotifyToken, 
      spotifyDeviceId: !!spotifyDeviceId,
      shouldBroadcast: hasSpotifyToken && spotifyDeviceId 
    });
  }, [isCreator, spotifyDeviceId]);


  const handleContinueClick = () => {
    console.log('[GameFooter] Continue button clicked:', { 
      myPlayerId, 
      currentPlayerId, 
      isMyTurn, 
      phase,
      showFeedback,
      feedback 
    });
    
    // CRITICAL FIX: Stop all music (both preview and Spotify) when continuing to next turn
    if (usingPreviewMode) {
      console.log('[GameFooter] Stopping preview mode music before continue');
      stopPreview();
    } else if (spotifyDeviceId && isPlayingMusic) {
      console.log('[GameFooter] Pausing Spotify before continue');
      pauseSpotifyPlayback();
    }
    
    // Reset progress and state for next turn
    setProgress(0);
    setLocalIsPlaying(false);
    setIsSpotifyPlaying(false);
    setShowNewSongMessage(false);
    setHasPlayedOnce(false);
    
    // Clear optimistic state
    setOptimisticIsPlaying(null);
    
    onContinue();
  };

  // Render compact footer during drag operations, but show full interface when pending drop
  if (isDragging && pendingDropIndex === null) {
    return (
      <footer 
      className="w-full bg-card shadow flex flex-col items-center px-1 py-1 border-t border-border"
      style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 15px)" }}
    >
        {/* Compact player during drag */}
        <div className="w-full max-w-md flex items-center justify-center py-1">
          {/* Essential controls only */}
          {isCreator && (
            <button
              ref={compactPlayButtonRef}
              className="w-8 h-8 flex items-center justify-center rounded-full bg-green-600 hover:bg-green-700 active:bg-green-700 mr-2 no-focus-outline force-no-outline"
              onClick={() => {
                handlePlayPauseClick();
                // Immediately blur after click to prevent focus ring
                if (compactPlayButtonRef.current) {
                  setTimeout(() => {
                    compactPlayButtonRef.current.blur();
                  }, 0);
                }
              }}
              onTouchStart={() => {
                // Prevent focus on touch start
                if (compactPlayButtonRef.current) {
                  compactPlayButtonRef.current.blur();
                }
              }}
              onTouchEnd={() => {
                // Blur the button after touch to remove persistent focus highlight
                if (compactPlayButtonRef.current) {
                  compactPlayButtonRef.current.blur();
                }
              }}
              aria-label={actualIsPlaying ? "Pause" : "Play"}
              style={{ WebkitTapHighlightColor: 'transparent' }}
            >
              {actualIsPlaying ? (
                <svg className="w-3 h-3" fill="white" viewBox="0 0 24 24">
                  <path fillRule="evenodd" d="M8 5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2H8Zm7 0a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-1Z" clipRule="evenodd"/>
                </svg>
              ) : (
                <svg className="w-3 h-3 ml-0.5" fill="white" viewBox="0 0 10 16">
                  <path d="M3.414 1A2 2 0 0 0 0 2.414v11.172A2 2 0 0 0 3.414 15L9 9.414a2 2 0 0 0 0-2.828L3.414 1Z"/>
                </svg>
              )}
            </button>
          )}
          
          {/* Minimal progress bar */}
          <div className="flex-1 flex items-center gap-1 text-xs text-muted-foreground">
            <span className="text-xs">{formatTime(progress)}</span>
            <div className="relative flex-1 h-1 bg-input rounded-full overflow-hidden">
              <div className="absolute left-0 top-0 h-1 bg-primary rounded-full" style={{ width: `${(progress/duration)*100}%` }}></div>
            </div>
            <span className="text-xs">{formatTime(duration)}</span>
          </div>
        </div>
      </footer>
    );
  }

  return (
    <footer 
      className="w-full bg-card shadow flex flex-col items-center px-1 py-1 md:py-2 border-t border-border rounded-t-2xl"
      style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 0px)" }}
    >
      {/* Spotify-style player with vibrant gradient border */}
      <div className="w-full max-w-md flex flex-col items-center" style={{ overflow: 'visible' }}>
        <div className="w-full rounded-2xl p-3 md:p-2 flex flex-col items-center mb-3" style={{ overflow: 'visible' }}>
          {/* Artist, title, year with album art - show during reveal phase or challenge-resolved */}
          {currentCard && ((showFeedback && feedback) || (phase === 'challenge-resolved' && feedback)) && (
            <div className="mb-2 flex items-center gap-4 justify-center w-full">
              {/* Album Art - only during reveal */}
              {(currentCard?.album_art || currentCard?.image || currentCard?.album?.images?.[0]?.url) && (
                <div className="w-20 h-20 md:w-32 md:h-32 rounded overflow-hidden bg-card flex-shrink-0">
                  <img 
                    src={currentCard?.album_art || currentCard?.image || currentCard?.album?.images?.[0]?.url} 
                    alt="Album cover"
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      e.target.style.display = 'none';
                    }}
                  />
                </div>
              )}
              <div className="text-sm md:text-base text-muted-foreground text-left flex-1 min-w-0">
                <div className="font-medium leading-tight mb-2">
                  {currentCard.title}
                </div>
                <div className="leading-tight">
                  {currentCard.artist} ({feedback?.year || currentCard.year})
                </div>
              </div>
            </div>
          )}
          
          {/* Hidden song info during gameplay */}
          {currentCard && !((showFeedback && feedback) || (phase === 'challenge-resolved' && feedback)) && (
            <div className="hidden mb-2 text-xs md:text-base text-muted-foreground text-center w-full">
              🎵 Mystery Song
            </div>
          )}

          <div className="flex items-center mt-3 gap-2 md:gap-4 w-full">
            {/* Show controls only for creator */}
            {isCreator ? (
              <>
                {/* Restart button - moved to left */}
                <button
                  ref={restartButtonRef}
                  className="w-8 h-8 md:w-10 md:h-10 flex items-center justify-center rounded-full bg-input hover:bg-input/90 active:bg-input/90 flex-shrink-0 no-focus-outline force-no-outline"
                  onClick={() => {
                    handleRestartClick();
                    // Immediately blur after click to prevent focus ring
                    if (restartButtonRef.current) {
                      setTimeout(() => {
                        restartButtonRef.current.blur();
                      }, 0);
                    }
                  }}
                  onTouchStart={() => {
                    // Prevent focus on touch start
                    if (restartButtonRef.current) {
                      restartButtonRef.current.blur();
                    }
                  }}
                  onTouchEnd={() => {
                    // Blur the button after touch to remove persistent focus highlight
                    if (restartButtonRef.current) {
                      restartButtonRef.current.blur();
                    }
                  }}
                  aria-label="Restart track"
                  style={{ 
                    WebkitTapHighlightColor: 'transparent',
                    outline: 'none',
                    border: 'none',
                    boxShadow: 'none'
                  }}
                  onFocus={(e) => e.target.blur()}
                >
                  <div className="text-white text-lg md:text-xl font-bold">
                      <svg className="w-3 h-3 text-gray-800 dark:text-white" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="white" viewBox="0 0 12 16">
                          <path d="M10.819.4a1.974 1.974 0 0 0-2.147.33l-6.5 5.773A2.014 2.014 0 0 0 2 6.7V1a1 1 0 0 0-2 0v14a1 1 0 1 0 2 0V9.3c.055.068.114.133.177.194l6.5 5.773a1.982 1.982 0 0 0 2.147.33A1.977 1.977 0 0 0 12 13.773V2.227A1.977 1.977 0 0 0 10.819.4Z"/>
                      </svg>

                  </div>
                </button>
                
                <div
                  style={{
                    filter: actualIsPlaying
                      ? 'drop-shadow(0 0 26px rgba(0, 214, 192, 1)) drop-shadow(0 5px 15px rgba(0, 214, 192, 0.6))'
                      : `drop-shadow(0 0 ${17.5 + (glowIntensity - 0.3) * 24.375}px rgba(0, 214, 192, ${glowIntensity})) drop-shadow(0 ${glowIntensity * 5}px ${10 + (glowIntensity - 0.3) * 16.25}px rgba(0, 214, 192, ${0.4 + (glowIntensity - 0.3) * 0.975}))`,
                    transition: 'none'
                  }}
                >
                  <button
                    ref={mainPlayButtonRef}
                    className="w-12 h-12 md:w-20 md:h-20 flex items-center justify-center rounded-full flex-shrink-0 no-focus-outline force-no-outline"
                    onClick={() => {
                      handlePlayPauseClick();
                      // Immediately blur after click to prevent focus ring
                      if (mainPlayButtonRef.current) {
                        setTimeout(() => {
                          mainPlayButtonRef.current.blur();
                        }, 0);
                      }
                    }}
                    onTouchStart={() => {
                      // Prevent focus on touch start
                      if (mainPlayButtonRef.current) {
                        mainPlayButtonRef.current.blur();
                      }
                    }}
                    onTouchEnd={() => {
                      // Blur the button after touch to remove persistent focus highlight
                      if (mainPlayButtonRef.current) {
                        mainPlayButtonRef.current.blur();
                      }
                    }}
                    aria-label={actualIsPlaying ? "Pause" : "Play"}
                    style={{ 
                      WebkitTapHighlightColor: 'transparent',
                      outline: 'none',
                      border: 'none',
                      WebkitAppearance: 'none',
                      MozAppearance: 'none',
                      appearance: 'none',
                      boxShadow: 'none',
                      backgroundColor: actualIsPlaying
                        ? '#00D6C0'
                        : `rgba(0, 214, 192, ${0.85 + (glowIntensity - 0.3) * 0.5})`,
                      transition: 'none'
                    }}
                  >
                  {actualIsPlaying ? (
                    <div className="text-white text-2xl md:text-4xl font-bold">
                      <svg className="w-5 h-5 text-gray-800 dark:text-white" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="white" viewBox="0 0 24 24">
                         <path fillRule="evenodd" d="M8 5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2H8Zm7 0a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-1Z" clipRule="evenodd"/>
                      </svg>
                    </div>
                  ) : (
                    <div className="text-white text-xl md:text-3xl font-bold ml-1">
                      <svg className="w-5 h-5 text-gray-800 dark:text-white" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="white" viewBox="0 0 10 16">
                        <path d="M3.414 1A2 2 0 0 0 0 2.414v11.172A2 2 0 0 0 3.414 15L9 9.414a2 2 0 0 0 0-2.828L3.414 1Z"/>
                     </svg>
                    </div>
                  )}
                  </button>
                </div>
              </>
            ) : (
              /* Spacer for non-creators to maintain layout */
                <div className="w-8 h-8 md:w-10 md:h-10 flex-shrink-0"></div>
              )}
              
              <div className="flex-1 flex flex-col">
                <div className="flex items-center gap-1 text-xs md:text-base text-muted-foreground">
                <span>{formatTime(displayProgress)}</span>
                <div className="relative flex-1 h-2 bg-input rounded-full overflow-hidden">
                  <div className="absolute left-0 top-0 h-2 bg-primary rounded-full" style={{ width: `${(displayProgress/displayDuration)*100}%` }}></div>
                </div>
                <span>{formatTime(displayDuration)}</span>
                {isCreator && !isPreviewMode && (
                  <button
                  ref={deviceSwitchButtonRef}
                  onClick={() => {
                    setShowDeviceModal(true);
                    // Immediately blur after click to prevent focus ring
                    if (deviceSwitchButtonRef.current) {
                      setTimeout(() => {
                        deviceSwitchButtonRef.current.blur();
                      }, 0);
                    }
                  }}
                  onTouchStart={() => {
                    // Prevent focus on touch start
                    if (deviceSwitchButtonRef.current) {
                      deviceSwitchButtonRef.current.blur();
                    }
                  }}
                  onTouchEnd={() => {
                    // Blur the button after touch to remove persistent focus highlight
                    if (deviceSwitchButtonRef.current) {
                      deviceSwitchButtonRef.current.blur();
                    }
                  }}
                  className="ml-2 w-6 h-6 flex items-center p-0 justify-center rounded-full bg-input hover:bg-input/90 text-foreground text-xs"
                  title="Switch device"
                  aria-label="Switch Spotify device"
                  style={{ 
                WebkitTapHighlightColor: 'transparent',
                outline: 'none !important',
                border: 'none !important', 
                boxShadow: 'none !important',
                WebkitAppearance: 'none',
                MozAppearance: 'none',
                appearance: 'none'
              }}
                  >
                  <img
                    src="/img/speaker-icon.svg"
                    alt="Switch device"
                    className="w-5 h-5"
                  />
                  </button>
                )}
                </div>
              </div>
              </div>
              
              {/* Spotify Debug Info - only for creator */}
          {isCreator && (
<div className="hidden text-xs text-muted-foreground text-center space-y-1">
              {spotifyDeviceId ? (
                <div className="text-primary">
                  ✓ Spotify Ready | {isPlayingMusic ? 'Playing' : 'Paused'}
                </div>
              ) : (
                <div className="text-muted-foreground">
                  ⚠ Spotify Initializing...
                </div>
              )}
              <div className="text-muted-foreground">
                Device: {spotifyDeviceId ? spotifyDeviceId.substring(0, 8) + '...' : 'None'}
              </div>
              <div className="text-muted-foreground">
                Track: {currentCard?.title || 'None'} | Progress: {progress}s/{duration}s
              </div>
              <div className="text-muted-foreground">
                Phase: {phase} | My Turn: {isMyTurn ? 'Yes' : 'No'}
              </div>
            </div>
          )}
        </div>
      </div>
      {/* Challenge section */}
      {challenge && challenge.targetId === myPlayerId && (
        <div className="w-full max-w-md p-3 text-center mb-2" style={{ background: 'transparent' }}>
          <div className="text-white font-bold mb-2">
            {players?.find(p => p.id === challenge.challengerId)?.name} challenges your placement!
          </div>
          <div className="flex gap-2 justify-center">
            <button 
              ref={challengeRejectButtonRef}
              onClick={() => {
                onChallengeResponse(false);
                // Immediately blur after click to prevent focus ring
                if (challengeRejectButtonRef.current) {
                  setTimeout(() => {
                    challengeRejectButtonRef.current.blur();
                  }, 0);
                }
              }}
              onTouchStart={() => {
                // Prevent focus on touch start
                if (challengeRejectButtonRef.current) {
                  challengeRejectButtonRef.current.blur();
                }
              }}
              onTouchEnd={() => {
                // Blur the button after touch to remove persistent focus highlight
                if (challengeRejectButtonRef.current) {
                  challengeRejectButtonRef.current.blur();
                }
              }}
              className="w-full h-12 px-4 border border-border font-semibold touch-button whitespace-nowrap flex items-center justify-center gap-2 setting-button no-focus-outline"
              style={{ background: 'transparent', WebkitTapHighlightColor: 'transparent' }}
            >
              Reject (Keep card)
            </button>
            <button 
              ref={challengeAcceptButtonRef}
              onClick={() => {
                onChallengeResponse(true);
                // Immediately blur after click to prevent focus ring
                if (challengeAcceptButtonRef.current) {
                  setTimeout(() => {
                    challengeAcceptButtonRef.current.blur();
                  }, 0);
                }
              }}
              onTouchStart={() => {
                // Prevent focus on touch start
                if (challengeAcceptButtonRef.current) {
                  challengeAcceptButtonRef.current.blur();
                }
              }}
              onTouchEnd={() => {
                // Blur the button after touch to remove persistent focus highlight
                if (challengeAcceptButtonRef.current) {
                  challengeAcceptButtonRef.current.blur();
                }
              }}
              className="w-full h-12 px-4 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold touch-button whitespace-nowrap flex items-center justify-center gap-2 setting-button no-focus-outline"
              style={{ WebkitTapHighlightColor: 'transparent' }}
            >
              Accept (Remove card)
            </button>
          </div>
        </div>
      )}

      {/* Song Guess Modal */}
      <SongGuessModal
        isOpen={showSongGuessModal}
        onClose={() => setShowSongGuessModal(false)}
        onGuessSong={onGuessSong}
        onSkipSongGuess={onSkipSongGuess}
      />

      {/* Device switch modal */}
      {showDeviceModal && (
        <DeviceSwitchModal
          isOpen={showDeviceModal}
          onClose={() => setShowDeviceModal(false)}
          currentDeviceId={spotifyDeviceId}
          onDeviceSwitch={(newDeviceId) => {
            console.log('[GameFooter] Device switched to:', newDeviceId);
            
            // CRITICAL FIX: If switching back to web player, sync current song
            const webDeviceId = localStorage.getItem('spotify_device_id');
            if (newDeviceId === webDeviceId && window.beatablyPlayerSync && currentCard?.uri) {
              console.log('[GameFooter] Switching back to web player - syncing current song');
              // Sync current song at current position to fix sync issues
              const currentPosition = progress * 1000; // Convert to milliseconds
              window.beatablyPlayerSync.syncCurrentSong(currentCard.uri, currentPosition);
            }
            
            // Notify parent component about device change
            if (window.parent && window.parent.handleDeviceSwitch) {
              window.parent.handleDeviceSwitch(newDeviceId);
            }
            // Also emit to socket for real-time updates
            if (socketRef?.current && roomCode) {
              socketRef.current.emit('device_switched', {
                code: roomCode,
                deviceId: newDeviceId
              });
            }
          }}
        />
      )}


      {/* Song guess section - only for current player */}
      {phase === 'song-guess' && isMyTurn && (
        <div className="w-full max-w-md p-3 text-center mb-2" style={{ background: 'transparent' }}>
          <div className="text-white mb-8">
            Do you want to guess the song for bonus tokens?
          </div>
          <div className="flex gap-2 justify-center">
            <button 
              ref={songGuessModalGuessButtonRef}
              onClick={() => {
                setShowSongGuessModal(true);
                // Immediately blur after click to prevent focus ring
                if (songGuessModalGuessButtonRef.current) {
                  setTimeout(() => {
                    songGuessModalGuessButtonRef.current.blur();
                  }, 0);
                }
              }}
              onTouchStart={() => {
                // Prevent focus on touch start
                if (songGuessModalGuessButtonRef.current) {
                  songGuessModalGuessButtonRef.current.blur();
                }
              }}
              onTouchEnd={() => {
                // Blur the button after touch to remove persistent focus highlight
                if (songGuessModalGuessButtonRef.current) {
                  songGuessModalGuessButtonRef.current.blur();
                }
              }}
              className="w-full h-12 px-4 border border-border font-semibold touch-button whitespace-nowrap flex items-center justify-center gap-2 setting-button no-focus-outline"
              style={{ background: 'transparent', WebkitTapHighlightColor: 'transparent' }}
            >
              Guess Song
            </button>
            <button 
              ref={songGuessModalSkipButtonRef}
              onClick={() => {
                onSkipSongGuess();
                // Immediately blur after click to prevent focus ring
                if (songGuessModalSkipButtonRef.current) {
                  setTimeout(() => {
                    songGuessModalSkipButtonRef.current.blur();
                  }, 0);
                }
              }}
              onTouchStart={() => {
                // Prevent focus on touch start
                if (songGuessModalSkipButtonRef.current) {
                  songGuessModalSkipButtonRef.current.blur();
                }
              }}
              onTouchEnd={() => {
                // Blur the button after touch to remove persistent focus highlight
                if (songGuessModalSkipButtonRef.current) {
                  songGuessModalSkipButtonRef.current.blur();
                }
              }}
              className="w-full h-12 px-4 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold touch-button whitespace-nowrap flex items-center justify-center gap-2 setting-button no-focus-outline"
              style={{ WebkitTapHighlightColor: 'transparent' }}
            >
              Skip
            </button>
          </div>
        </div>
      )}

      {/* Song guess section - waiting for current player */}
      {phase === 'song-guess' && !isMyTurn && (
        <div className="w-full max-w-md p-3 text-center mb-2" style={{ background: 'transparent' }}>
          <div className="text-white mb-4">
            {players?.find(p => p.id === currentPlayerId)?.name} is deciding whether to guess the song...
          </div>
        </div>
      )}

      {/* Challenge window section */}
      {phase === 'challenge-window' && (() => {
        // Determine if this player has already responded (skipped or challenged)
        let hasResponded = false;
        let waitingForOthers = false;
        let waitingText = "";
        if (challenge && challenge.challengeWindow) {
          const { respondedCount, totalEligible, waitingFor } = challenge.challengeWindow;
          hasResponded = waitingFor && !waitingFor.includes(myPlayerId);
          waitingForOthers = hasResponded && waitingFor.length > 0;
          if (waitingForOthers) {
            waitingText = "Other players can now challenge - Waiting for other players...";
          }
        }
        return (
          <div className="w-full max-w-md p-3 text-center mb-2" style={{ background: 'transparent' }}>
            <div className="text-white font-bold mb-8">
              Other players can now challenge.
            </div>
            {!isMyTurn && myPlayer && myPlayer.tokens > 0 && !hasResponded ? (
              <div className="flex gap-2 justify-center">
                <button 
                  ref={challengeWindowChallengeButtonRef}
                  onClick={() => {
                    onInitiateChallenge();
                    // Immediately blur after click to prevent focus ring
                    if (challengeWindowChallengeButtonRef.current) {
                      setTimeout(() => {
                        challengeWindowChallengeButtonRef.current.blur();
                      }, 0);
                    }
                  }}
                  onTouchStart={() => {
                    // Prevent focus on touch start
                    if (challengeWindowChallengeButtonRef.current) {
                      challengeWindowChallengeButtonRef.current.blur();
                    }
                  }}
                  onTouchEnd={() => {
                    // Blur the button after touch to remove persistent focus highlight
                    if (challengeWindowChallengeButtonRef.current) {
                      challengeWindowChallengeButtonRef.current.blur();
                    }
                  }}
                  className="w-full h-12 px-4 border border-border font-semibold touch-button whitespace-nowrap flex items-center justify-center gap-2 setting-button no-focus-outline"
                  style={{ background: 'transparent', WebkitTapHighlightColor: 'transparent' }}
                >
                  Challenge (1 token)
                </button>
                <button 
                  ref={challengeWindowSkipButtonRef}
                  onClick={() => {
                    onSkipChallenge();
                    // Immediately blur after click to prevent focus ring
                    if (challengeWindowSkipButtonRef.current) {
                      setTimeout(() => {
                        challengeWindowSkipButtonRef.current.blur();
                      }, 0);
                    }
                  }}
                  onTouchStart={() => {
                    // Prevent focus on touch start
                    if (challengeWindowSkipButtonRef.current) {
                      challengeWindowSkipButtonRef.current.blur();
                    }
                  }}
                  onTouchEnd={() => {
                    // Blur the button after touch to remove persistent focus highlight
                    if (challengeWindowSkipButtonRef.current) {
                      challengeWindowSkipButtonRef.current.blur();
                    }
                  }}
                  className="w-full h-12 px-4 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold touch-button whitespace-nowrap flex items-center justify-center gap-2 setting-button no-focus-outline"
                  style={{ WebkitTapHighlightColor: 'transparent' }}
                >
                  Skip
                </button>
              </div>
            ) : !isMyTurn && myPlayer && myPlayer.tokens === 0 && !hasResponded ? (
              <div className="flex flex-col items-center gap-2">
                <div className="text-white text-sm">No tokens to challenge</div>
                <button 
                  ref={challengeWindowOkButtonRef}
                  onClick={() => {
                    onSkipChallenge();
                    // Immediately blur after click to prevent focus ring
                    if (challengeWindowOkButtonRef.current) {
                      setTimeout(() => {
                        challengeWindowOkButtonRef.current.blur();
                      }, 0);
                    }
                  }}
                  onTouchStart={() => {
                    // Prevent focus on touch start
                    if (challengeWindowOkButtonRef.current) {
                      challengeWindowOkButtonRef.current.blur();
                    }
                  }}
                  onTouchEnd={() => {
                    // Blur the button after touch to remove persistent focus highlight
                    if (challengeWindowOkButtonRef.current) {
                      challengeWindowOkButtonRef.current.blur();
                    }
                  }}
                  className="w-full h-12 px-4 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold touch-button whitespace-nowrap flex items-center justify-center gap-2 setting-button no-focus-outline"
                  style={{ WebkitTapHighlightColor: 'transparent' }}
                >
                  OK
                </button>
              </div>
            ) : waitingForOthers ? (
              <div className="text-white text-sm">{waitingText}</div>
            ) : (
              <div className="text-white text-sm">
                {isMyTurn ? "Waiting for other players..." : "Waiting..."}
              </div>
            )}
          </div>
        );
      })()}

      {/* Challenge in progress section */}
      {phase === 'challenge' && challenge && (
        <div className="w-full max-w-md p-3 text-center mb-8" style={{ background: 'transparent' }}>
          <div className="text-white font-bold mb-2">
            {challenge.challengerId === myPlayerId ? 
              "You are challenging the placement!" : 
              `${players?.find(p => p.id === challenge.challengerId)?.name} is challenging the placement!`
            }
          </div>
          {pendingDropIndex === null && (
            <div className="text-white text-sm">
              {challenge.challengerId === myPlayerId ? 
                "Select a place on timeline where you think the song belongs" : 
                "Waiting for challenger to place their guess..."
              }
            </div>
          )}
        </div>
      )}

      {/* Challenge resolved section */}
      {phase === 'challenge-resolved' && challenge && feedback && (
        <div className="w-full max-w-md p-3 text-center mb-2" style={{ background: 'transparent' }}>
          <div className="text-white font-bold">
            Challenge Complete!
          </div>
          <div className="text-white text-sm mb-8">
            {challenge.result?.challengeWon ? 
              `${players?.find(p => p.id === challenge.challengerId)?.name} won the challenge!` :
              !challenge.result?.challengerCorrect && challenge.result?.originalCorrect ?
                `${players?.find(p => p.id === challenge.originalPlayerId)?.name} placed it correctly!` :
                challenge.result?.challengerCorrect && challenge.result?.originalCorrect ?
                  `Both players placed it correctly, but ${players?.find(p => p.id === challenge.originalPlayerId)?.name} went first!` :
                  !challenge.result?.challengerCorrect && !challenge.result?.originalCorrect ?
                    `Both players placed it incorrectly! No one gets the card.` :
                    `${players?.find(p => p.id === challenge.challengerId)?.name} placed it correctly, but ${players?.find(p => p.id === challenge.originalPlayerId)?.name} went first!`
            }
          </div>
          <button 
            ref={challengeResolvedContinueButtonRef}
            onClick={() => {
              // CRITICAL FIX: Stop all music when continuing after challenge
              if (usingPreviewMode) {
                console.log('[GameFooter] Stopping preview mode music before continue after challenge');
                stopPreview();
              } else if (spotifyDeviceId && isPlayingMusic) {
                console.log('[GameFooter] Pausing Spotify before continue after challenge');
                pauseSpotifyPlayback();
              }
              
              // Reset progress and state for next turn
              setProgress(0);
              setLocalIsPlaying(false);
              setIsSpotifyPlaying(false);
              setShowNewSongMessage(false);
              setHasPlayedOnce(false);
              setOptimisticIsPlaying(null);
              
              onContinueAfterChallenge();
              // Immediately blur after click to prevent focus ring
              if (challengeResolvedContinueButtonRef.current) {
                setTimeout(() => {
                  challengeResolvedContinueButtonRef.current.blur();
                }, 0);
              }
            }}
            onTouchStart={() => {
              // Prevent focus on touch start
              if (challengeResolvedContinueButtonRef.current) {
                challengeResolvedContinueButtonRef.current.blur();
              }
            }}
            onTouchEnd={() => {
              // Blur the button after touch to remove persistent focus highlight
              if (challengeResolvedContinueButtonRef.current) {
                challengeResolvedContinueButtonRef.current.blur();
              }
            }}
            className="w-full h-12 px-4 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold touch-button whitespace-nowrap flex items-center justify-center gap-2 setting-button mt-3 no-focus-outline"
            style={{ WebkitTapHighlightColor: 'transparent' }}
          >
            Continue to Next Turn
          </button>
        </div>
      )}


      {/* New Song Request Notification removed:
          Backend auto-loads and emits the new song; autoplay occurs on creator device. */}
      
      {/* Pending drop confirmation section */}
      {pendingDropIndex !== null && isMyTurn && (
        <div className="w-full max-w-md p-3 text-center mb-2" style={{ background: 'transparent' }}>
          <div className="text-white mb-8">
            You have now selected a place on the timeline.
          </div>
          <div className="flex gap-2 justify-center">
            <button 
              ref={dropCancelButtonRef}
              onClick={() => {
                onCancelDrop();
                // Immediately blur after click to prevent focus ring
                if (dropCancelButtonRef.current) {
                  setTimeout(() => {
                    dropCancelButtonRef.current.blur();
                  }, 0);
                }
              }}
              onTouchStart={() => {
                // Prevent focus on touch start
                if (dropCancelButtonRef.current) {
                  dropCancelButtonRef.current.blur();
                }
              }}
              onTouchEnd={() => {
                // Blur the button after touch to remove persistent focus highlight
                if (dropCancelButtonRef.current) {
                  dropCancelButtonRef.current.blur();
                }
              }}
              className="w-full h-12 px-4 border border-border font-semibold touch-button whitespace-nowrap flex items-center justify-center gap-2 setting-button no-focus-outline"
              style={{ background: 'transparent', WebkitTapHighlightColor: 'transparent' }}
            >
              Cancel
            </button>
            <button 
              ref={dropConfirmButtonRef}
              onClick={() => {
                onConfirmDrop();
                // Immediately blur after click to prevent focus ring
                if (dropConfirmButtonRef.current) {
                  setTimeout(() => {
                    dropConfirmButtonRef.current.blur();
                  }, 0);
                }
              }}
              onTouchStart={() => {
                // Prevent focus on touch start
                if (dropConfirmButtonRef.current) {
                  dropConfirmButtonRef.current.blur();
                }
              }}
              onTouchEnd={() => {
                // Blur the button after touch to remove persistent focus highlight
                if (dropConfirmButtonRef.current) {
                  dropConfirmButtonRef.current.blur();
                }
              }}
              className="w-full h-12 px-4 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold touch-button whitespace-nowrap flex items-center justify-center gap-2 setting-button no-focus-outline"
              style={{ WebkitTapHighlightColor: 'transparent' }}
            >
              Confirm Placement
            </button>
          </div>
        </div>
      )}

      {/* Feedback section */}
      <div className="w-full max-w-md flex flex-col items-center">
        {showFeedback && feedback ? (
          <div className="w-full p-3 text-center mb-2" style={{ background: 'transparent' }}>
            <div className="font-bold mb-4">
              {feedback.correct ? 
                (myPlayerId === currentPlayerId ? 
                  "Yay, your answer is correct!" : 
                  `${currentPlayer?.name || 'The player'} was correct!`
                ) : 
                (myPlayerId === currentPlayerId ? 
                  "Wrong answer!" : 
                  `${currentPlayer?.name || 'The player'} was wrong!`
                )
              }
            </div>
            
            {/* Continue button - only creator can click */}
            {isCreator ? (
              <button 
                ref={feedbackContinueButtonRef}
                className="mt-3 w-full h-12 px-4 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold touch-button whitespace-nowrap flex items-center justify-center gap-2 setting-button no-focus-outline" 
                onClick={() => {
                  handleContinueClick();
                  // Immediately blur after click to prevent focus ring
                  if (feedbackContinueButtonRef.current) {
                    setTimeout(() => {
                      feedbackContinueButtonRef.current.blur();
                    }, 0);
                  }
                }}
                onTouchStart={() => {
                  // Prevent focus on touch start
                  if (feedbackContinueButtonRef.current) {
                    feedbackContinueButtonRef.current.blur();
                  }
                }}
                onTouchEnd={() => {
                  // Blur the button after touch to remove persistent focus highlight
                  if (feedbackContinueButtonRef.current) {
                    feedbackContinueButtonRef.current.blur();
                  }
                }}
                style={{ WebkitTapHighlightColor: 'transparent' }}
              >
                Continue to Next Turn
              </button>
            ) : (
              <div className="mt-3 px-6 py-2 text-white rounded">
                Waiting for host to start next turn...
              </div>
            )}
          </div>
        ) : currentCard && phase === 'player-turn' && pendingDropIndex === null ? (
          <div className="w-full p-2 md:p-4 text-center mb-1" style={{ background: 'transparent' }}>
            {showNewSongMessage && isCreator ? (
              <>
                <div className="text-foreground text-md md:text-2xl font-bold mb-1">
                  New song loaded
                </div>
                <div className="text-foreground text-sm md:text-base mb-2">
                  Press play when you are ready
                </div>
              </>
            ) : (
              <div className="text-foreground text-md md:text-2xl font-bold mb-1">
                {isMyTurn ? "Select a place in the timeline above" : `${players?.find(p => p.id === currentPlayerId)?.name}'s turn`}
              </div>
            )}
            
            {/* New Song button - only for current player with tokens, shown after first play */}
            {isMyTurn && myPlayer && myPlayer.tokens > 0 && hasPlayedOnce && (
              <div className="flex flex-col items-center">
                <div className="text-muted-foreground text-sm mb-8">You can pay 1 token to get another song</div>
                <button 
                  ref={newSongButtonRef}
                  onClick={() => {
                    handleTokenAction('skip_song');
                    // Immediately blur after click to prevent focus ring
                    if (newSongButtonRef.current) {
                      setTimeout(() => {
                        newSongButtonRef.current.blur();
                      }, 0);
                    }
                  }}
                  onTouchStart={() => {
                    // Prevent focus on touch start
                    if (newSongButtonRef.current) {
                      newSongButtonRef.current.blur();
                    }
                  }}
                  onTouchEnd={() => {
                    // Blur the button after touch to remove persistent focus highlight
                    if (newSongButtonRef.current) {
                      newSongButtonRef.current.blur();
                    }
                  }}
                  className="h-12 px-4 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold touch-button whitespace-nowrap flex items-center justify-center gap-2 setting-button no-focus-outline force-no-outline"
                  style={{ WebkitTapHighlightColor: 'transparent' }}
                >
                  New Song (1 token)
                </button>
              </div>
            )}

          </div>
        ) : phase === 'game-over' ? (
          <div className="w-full p-2 md:p-4 rounded text-center bg-gray-800 mb-1 text-gray-300 text-lg md:text-2xl">Game over! 🎉</div>
        ) : null}
      </div>

    </footer>
  );
}

export default GameFooter;
