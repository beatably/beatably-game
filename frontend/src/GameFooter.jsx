import React, { useState } from "react";
import spotifyAuth from "./utils/spotifyAuth";
import DeviceSwitchModal from './DeviceSwitchModal';

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
  // Track local playing state for UI
  const [localIsPlaying, setLocalIsPlaying] = React.useState(false);
  const [progress, setProgress] = React.useState(0);
  const [duration, setDuration] = React.useState(30); // Default 30 seconds
  const [spotifyPosition, setSpotifyPosition] = React.useState(0);

  // Use real Spotify playing state if available, otherwise use local state
  const [isSpotifyPlaying, setIsSpotifyPlaying] = React.useState(false);
  const [currentSpotifyUri, setCurrentSpotifyUri] = React.useState(null);
  const actualIsPlaying = isCreator && spotifyDeviceId ? isSpotifyPlaying : localIsPlaying;

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

  // Reset progress when new song starts (when currentCard changes)
  React.useEffect(() => {
    console.log('[GameFooter] Current card changed, resetting progress:', currentCard?.title);
    setProgress(0);
    if (!isCreator || !spotifyDeviceId) {
      setLocalIsPlaying(false);
    }
  }, [currentCard?.id, isCreator, spotifyDeviceId]);

  // Function to trigger Spotify playback with enhanced error handling
  const triggerSpotifyPlayback = async () => {
    if (!isCreator || !spotifyDeviceId || !currentCard?.uri) {
      console.log('[GameFooter] Cannot play - missing requirements:', {
        isCreator,
        spotifyDeviceId: !!spotifyDeviceId,
        hasUri: !!currentCard?.uri
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
      const success = await spotifyAuth.verifiedStartPlayback(null, currentCard.uri, 0, {
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
      spotifyDeviceId: !!spotifyDeviceId,
      actualIsPlaying,
      isSpotifyPlaying,
      currentSpotifyUri,
      currentCardUri: currentCard?.uri,
      currentCardTitle: currentCard?.title
    });

    // Check if this is a creator who should have Spotify access
    const hasSpotifyToken = !!localStorage.getItem('access_token');
    
    // If creator has no token at all, immediately trigger re-auth (no buttons)
    if (isCreator && !hasSpotifyToken) {
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
        const targetUri = currentCard?.uri || null;
        const sameTrack = !!targetUri && targetUri === stateUri;

        // If currently playing the same track -> pause
        if (statePlaying && sameTrack) {
          await pauseSpotifyPlayback();
          // update UI immediately; poller will refresh soon
          setIsSpotifyPlaying(false);
          return;
        }

        // If same track but paused -> resume
        if (!statePlaying && sameTrack) {
          const ok = await resumeSpotifyPlayback();
          if (ok) setIsSpotifyPlaying(true);
          return;
        }

        // Different or no track -> explicitly start target track on selected device
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
    if (isCreator && spotifyDeviceId) {
      restartSpotifyTrack();
    } else {
      setProgress(0);
      setLocalIsPlaying(true);
    }
  };

// Song guessing state
  const [showSongGuess, setShowSongGuess] = useState(false);
  const [songTitle, setSongTitle] = useState('');
  const [songArtist, setSongArtist] = useState('');
  const [newSongRequest, setNewSongRequest] = useState(null); // For creator notifications
  // Removed tokenExpiredNotification UI: re-auth is mandatory; no local fallback
  const [showDeviceModal, setShowDeviceModal] = useState(false);
  // Prevent spamming skip_song while backend reconnects or processes the request
  const skipInFlightRef = React.useRef(false);

  // Format time mm:ss
  const formatTime = (s) => `${Math.floor(s/60)}:${(s%60).toString().padStart(2, '0')}`;

  const myPlayer = players?.find(p => p.id === myPlayerId);
  const currentPlayer = players?.find(p => p.id === currentPlayerId);

  const handleSongGuess = () => {
    if (songTitle.trim() && songArtist.trim()) {
      onGuessSong(songTitle.trim(), songArtist.trim());
      setSongTitle('');
      setSongArtist('');
      setShowSongGuess(false);
    }
  };

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
    
    // CRITICAL FIX: Pause music immediately when "New Song" is clicked
    // This works for both creators and guests
    if (action === 'skip_song' && spotifyDeviceId && isPlayingMusic) {
      console.log('[GameFooter] Pausing music before new song');
      pauseSpotifyPlayback();
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

  // Broadcast progress updates (creator only) - use Spotify token check instead of isCreator
  React.useEffect(() => {
    const hasSpotifyToken = !!localStorage.getItem('access_token');
    if (!socketRef?.current || !hasSpotifyToken || !roomCode || !spotifyDeviceId) return;

    const broadcastProgress = () => {
      console.log('[GameFooter] Broadcasting progress:', { progress, duration, isPlaying: actualIsPlaying });
      socketRef.current.emit('progress_update', {
        code: roomCode,
        progress,
        duration,
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
  }, [socketRef, roomCode, progress, duration, actualIsPlaying, spotifyDeviceId]);

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
    
    // CRITICAL FIX: Pause music immediately when "Continue" is clicked
    // This works for both creators and guests
    if (spotifyDeviceId && isPlayingMusic) {
      console.log('[GameFooter] Pausing music before continue');
      pauseSpotifyPlayback();
    }
    
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
              className="w-8 h-8 flex items-center justify-center rounded-full bg-green-600 hover:bg-green-700 active:bg-green-700 mr-2"
              onClick={handlePlayPauseClick}
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
      style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 15px)" }}
    >
      {/* Spotify-style player */}
      <div className="w-full max-w-md flex flex-col items-center">
        <div className="w-full bg-none rounded-2xl shadow-2xl shadow-background p-3 md:p-2 flex flex-col items-center mb-3">
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
                  className="w-8 h-8 md:w-10 md:h-10 flex items-center justify-center rounded-full bg-input hover:bg-input/90 active:bg-input/90 flex-shrink-0"
                  onClick={handleRestartClick}
                  aria-label="Restart track"
                  style={{ 
                    WebkitTapHighlightColor: 'transparent',
                    outline: 'none'
                  }}
                  onFocus={(e) => e.target.blur()}
                >
                  <div className="text-white text-lg md:text-xl font-bold">
                      <svg className="w-3 h-3 text-gray-800 dark:text-white" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="white" viewBox="0 0 12 16">
                          <path d="M10.819.4a1.974 1.974 0 0 0-2.147.33l-6.5 5.773A2.014 2.014 0 0 0 2 6.7V1a1 1 0 0 0-2 0v14a1 1 0 1 0 2 0V9.3c.055.068.114.133.177.194l6.5 5.773a1.982 1.982 0 0 0 2.147.33A1.977 1.977 0 0 0 12 13.773V2.227A1.977 1.977 0 0 0 10.819.4Z"/>
                      </svg>

                  </div>
                </button>
                
                <button
                  className="w-12 h-12 md:w-20 md:h-20 flex items-center justify-center rounded-full bg-primary hover:bg-primary/90 active:bg-primary/90 shadow-[0_10px_15px_-3px_theme(colors.primary.300)/50] border-4 border-primary/20 flex-shrink-0"
                  onClick={handlePlayPauseClick}
                  aria-label={actualIsPlaying ? "Pause" : "Play"}
                  style={{ 
                    WebkitTapHighlightColor: 'transparent'
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
              </>
            ) : (
              /* Spacer for non-creators to maintain layout */
                <div className="w-8 h-8 md:w-10 md:h-10 flex-shrink-0"></div>
              )}
              
              <div className="flex-1 flex flex-col">
                <div className="flex items-center gap-1 text-xs md:text-base text-muted-foreground">
                <span>{formatTime(progress)}</span>
                <div className="relative flex-1 h-2 bg-input rounded-full overflow-hidden">
                  <div className="absolute left-0 top-0 h-2 bg-primary rounded-full" style={{ width: `${(progress/duration)*100}%` }}></div>
                </div>
                <span>{formatTime(duration)}</span>
                {isCreator && (
                  <button
                  onClick={() => setShowDeviceModal(true)}
                  className="ml-2 w-6 h-6 flex items-center p-0 justify-center rounded-full bg-input hover:bg-input/90 text-foreground text-xs"
                  title="Switch device"
                  aria-label="Switch Spotify device"
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
        <div className="w-full max-w-md p-3 rounded bg-none mb-2 text-center">
          <div className="text-white font-bold mb-2">
            {players?.find(p => p.id === challenge.challengerId)?.name} challenges your placement!
          </div>
          <div className="flex gap-2 justify-center">
            <button 
              onClick={() => onChallengeResponse(false)}
              className="w-full h-12 px-4 border border-border font-semibold touch-button whitespace-nowrap flex items-center justify-center gap-2 setting-button"
              style={{ background: 'transparent' }}
            >
              Reject (Keep card)
            </button>
            <button 
              onClick={() => onChallengeResponse(true)}
              className="w-full h-12 px-4 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold touch-button whitespace-nowrap flex items-center justify-center gap-2 setting-button"
            >
              Accept (Remove card)
            </button>
          </div>
        </div>
      )}

      {/* Song guessing modal */}
      {showSongGuess && (
        <div className="w-full max-w-md p-3 rounded bg-none mb-2">
          <div className="text-white mb-4 text-center">Both title and artist must be correct for the bonus!</div>
          <div className="space-y-3">
            <input
              type="text"
              placeholder="Song title"
              value={songTitle}
              onChange={(e) => setSongTitle(e.target.value)}
              className="bg-input border-border text-foreground h-11 focus:ring-primary w-full rounded-md border px-3 py-2"
            />
            <input
              type="text"
              placeholder="Artist"
              value={songArtist}
              onChange={(e) => setSongArtist(e.target.value)}
              className="bg-input border-border text-foreground h-11 focus:ring-primary w-full rounded-md border px-3 py-2"
            />
            <div className="flex justify-center gap-2 pt-2">
              <button 
                onClick={() => {
                  setShowSongGuess(false);
                  onSkipSongGuess();
                }}
                className="w-full h-12 px-4 border border-border font-semibold touch-button whitespace-nowrap flex items-center justify-center gap-2 setting-button"
                style={{ background: 'transparent' }}
              >
                Skip
              </button>
              <button 
                onClick={handleSongGuess}
                className="w-full h-12 px-4 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold touch-button whitespace-nowrap flex items-center justify-center gap-2 setting-button"
              >
                Submit Guess
              </button>
            </div>
          </div>
        </div>
      )}

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
      {phase === 'song-guess' && isMyTurn && !showSongGuess && (
        <div className="w-full max-w-md p-3 rounded bg-none mb-2 text-center">
          <div className="text-white mb-8">
            Do you want to guess the song for bonus tokens?
          </div>
          <div className="flex gap-2 justify-center">
            <button 
              onClick={() => setShowSongGuess(true)}
              className="w-full h-12 px-4 border border-border font-semibold touch-button whitespace-nowrap flex items-center justify-center gap-2 setting-button"
              style={{ background: 'transparent' }}
            >
              Guess Song
            </button>
            <button 
              onClick={() => onSkipSongGuess()}
              className="w-full h-12 px-4 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold touch-button whitespace-nowrap flex items-center justify-center gap-2 setting-button"
            >
              Skip
            </button>
          </div>
        </div>
      )}

      {/* Song guess section - waiting for current player */}
      {phase === 'song-guess' && !isMyTurn && (
        <div className="w-full max-w-md p-3 rounded bg-none mb-2 text-center">
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
          <div className="w-full max-w-md p-3 rounded bg-none mb-2 text-center">
            <div className="text-white font-bold mb-8">
              Other players can now challenge.
            </div>
            {!isMyTurn && myPlayer && myPlayer.tokens > 0 && !hasResponded ? (
              <div className="flex gap-2 justify-center">
                <button 
                  onClick={() => onInitiateChallenge()}
                  className="w-full h-12 px-4 border border-border font-semibold touch-button whitespace-nowrap flex items-center justify-center gap-2 setting-button"
                  style={{ background: 'transparent' }}
                >
                  Challenge (1 token)
                </button>
                <button 
                  onClick={() => onSkipChallenge()}
                  className="w-full h-12 px-4 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold touch-button whitespace-nowrap flex items-center justify-center gap-2 setting-button"
                >
                  Skip
                </button>
              </div>
            ) : !isMyTurn && myPlayer && myPlayer.tokens === 0 && !hasResponded ? (
              <div className="flex flex-col items-center gap-2">
                <div className="text-white text-sm">No tokens to challenge</div>
                <button 
                  onClick={() => onSkipChallenge()}
                  className="w-full h-12 px-4 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold touch-button whitespace-nowrap flex items-center justify-center gap-2 setting-button"
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
        <div className="w-full max-w-md p-3 rounded bg-none mb-8 text-center">
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
        <div className="w-full max-w-md p-3 rounded bg-none mb-2 text-center">
          <div className="text-white font-bold">
            Challenge Complete!
          </div>
          <div className="text-white text-sm mb-8">
            {challenge.result?.challengeWon ? 
              `${players?.find(p => p.id === challenge.challengerId)?.name} won the challenge!` :
              challenge.result?.originalCorrect ?
                `${players?.find(p => p.id === challenge.originalPlayerId)?.name} placed it correctly!` :
                challenge.result?.challengerCorrect ?
                  `${players?.find(p => p.id === challenge.challengerId)?.name} placed it correctly, but ${players?.find(p => p.id === challenge.originalPlayerId)?.name} went first!` :
                  `Both players placed it incorrectly! No one gets the year.`
            }
          </div>
          <button 
            onClick={onContinueAfterChallenge}
            className="w-full h-12 px-4 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold touch-button whitespace-nowrap flex items-center justify-center gap-2 setting-button mt-3"
          >
            Continue to Next Turn
          </button>
        </div>
      )}


      {/* New Song Request Notification removed:
          Backend auto-loads and emits the new song; autoplay occurs on creator device. */}
      
      {/* Pending drop confirmation section */}
      {pendingDropIndex !== null && isMyTurn && (
        <div className="w-full max-w-md p-3 rounded bg-none mb-2 text-center">
          <div className="text-white mb-8">
            You have now selected a place on the timeline.
          </div>
          <div className="flex gap-2 justify-center">
            <button 
              onClick={onCancelDrop}
              className="w-full h-12 px-4 border border-border font-semibold touch-button whitespace-nowrap flex items-center justify-center gap-2 setting-button"
              style={{ background: 'transparent' }}
            >
              Cancel
            </button>
            <button 
              onClick={onConfirmDrop}
              className="w-full h-12 px-4 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold touch-button whitespace-nowrap flex items-center justify-center gap-2 setting-button"
            >
              Confirm Placement
            </button>
          </div>
        </div>
      )}

      {/* Feedback section */}
      <div className="w-full max-w-md flex flex-col items-center">
        {showFeedback && feedback ? (
          <div className="w-full p-3 rounded text-center bg-none mb-2">
            <div className="font-bold mb-4">
              {feedback.correct ? "Yay, your answer is correct!" : "Wrong answer!"}
            </div>
            
            {/* Continue button - only creator can click */}
            {isCreator ? (
              <button 
                className="mt-3 w-full h-12 px-4 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold touch-button whitespace-nowrap flex items-center justify-center gap-2 setting-button" 
                onClick={handleContinueClick}
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
          <div className="w-full p-2 md:p-4 rounded text-center bg-none mb-1">
            <div className="text-foreground text-md md:text-2xl font-bold mb-1">
              {isMyTurn ? "Select a place in the timeline above" : `${players?.find(p => p.id === currentPlayerId)?.name}'s turn`}
            </div>
            
            {/* New Song button - only for current player with tokens */}
            {isMyTurn && myPlayer && myPlayer.tokens > 0 && (
              <div className="flex flex-col items-center">
                <div className="text-gray-300 text-sm mb-8">You can pay 1 token to get another song</div>
                <button 
                  onClick={() => handleTokenAction('skip_song')}
                  className="h-12 px-4 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold touch-button whitespace-nowrap flex items-center justify-center gap-2 setting-button"
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
