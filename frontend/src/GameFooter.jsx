import React, { useState } from "react";
import spotifyAuth from "./utils/spotifyAuth";
import { API_BASE_URL } from './config';
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
  const actualIsPlaying = isCreator && spotifyDeviceId ? isPlayingMusic : localIsPlaying;

  // Get real Spotify playback position with enhanced error handling
  React.useEffect(() => {
    if (!isCreator || !spotifyDeviceId || !window.Spotify) return;

    const getPlaybackState = async () => {
      try {
        const state = await spotifyAuth.getPlaybackState(spotifyDeviceId);
        if (state && state.item) {
          const positionMs = state.progress_ms || 0;
          const durationMs = state.item.duration_ms || 30000;
          
          setSpotifyPosition(Math.floor(positionMs / 1000));
          setDuration(Math.floor(durationMs / 1000));
          setProgress(Math.floor(positionMs / 1000));
        }
      } catch (error) {
        console.log('[GameFooter] Error getting playback state:', error);
        if (error.message.includes('Token expired')) {
          handleTokenExpiration();
        }
      }
    };

    // Update position every second when playing
    if (actualIsPlaying) {
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
    if (isCreator && spotifyDeviceId) return; // Creator handles their own progress

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
        }
        return false;
      }

      // Always transfer playback to the stored device before starting playback
      const storedDeviceId = spotifyAuth.getStoredDeviceId();
      if (storedDeviceId && storedDeviceId !== spotifyDeviceId) {
        await spotifyAuth.transferPlayback(storedDeviceId, false);
      }

      // Use the auth utility for the API call
      const success = await spotifyAuth.startPlayback(storedDeviceId || spotifyDeviceId, currentCard.uri, 0);

      if (success) {
        console.log('[GameFooter] Successfully started Spotify playback');
        return true;
      } else {
        console.log('[GameFooter] Spotify playback failed, trying fallback');
        return await tryPreviewFallback();
      }
    } catch (error) {
      console.error('[GameFooter] Error triggering Spotify playback:', error);

      if (error.message.includes('Token expired')) {
        handleTokenExpiration();
        return false;
      }

      // Try preview fallback on any error
      return await tryPreviewFallback();
    }
  };

  // Fallback to preview URL playback
  const tryPreviewFallback = async () => {
    if (currentCard?.preview_url) {
      try {
        console.log('[GameFooter] Trying preview URL as fallback');
        const audio = new Audio(currentCard.preview_url);
        audio.volume = 0.5;
        await audio.play();
        console.log('[GameFooter] Playing preview audio');
        setLocalIsPlaying(true);
        return true;
      } catch (err) {
        console.log('[GameFooter] Preview audio failed:', err.message);
        return false;
      }
    }
    return false;
  };

  // Function to pause Spotify playback with enhanced error handling
  const pauseSpotifyPlayback = async () => {
    if (!isCreator || !spotifyDeviceId) return false;

    try {
      console.log('[GameFooter] Pausing Spotify playback');
      return await spotifyAuth.pausePlayback(spotifyDeviceId);
    } catch (error) {
      console.error('[GameFooter] Error pausing Spotify playback:', error);
      if (error.message.includes('Token expired')) {
        handleTokenExpiration();
      }
      return false;
    }
  };

  // Function to restart current track with enhanced error handling
  const restartSpotifyTrack = async () => {
    if (!isCreator || !spotifyDeviceId || !currentCard?.uri) return false;

    try {
      console.log('[GameFooter] Restarting Spotify track');
      return await spotifyAuth.seekToPosition(spotifyDeviceId, 0);
    } catch (error) {
      console.error('[GameFooter] Error restarting Spotify track:', error);
      if (error.message.includes('Token expired')) {
        handleTokenExpiration();
      }
      return false;
    }
  };

  // Function to resume Spotify playback with enhanced error handling
  const resumeSpotifyPlayback = async () => {
    if (!isCreator || !spotifyDeviceId) return false;

    try {
      console.log('[GameFooter] Resuming Spotify playback');
      return await spotifyAuth.resumePlayback(spotifyDeviceId);
    } catch (error) {
      console.error('[GameFooter] Error resuming Spotify playback:', error);
      if (error.message.includes('Token expired')) {
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
    
    localStorage.setItem('game_state_backup', JSON.stringify(gameState));
    localStorage.setItem('pending_reauth', 'true');
    
    // Show non-blocking notification instead of popup
    setTokenExpiredNotification({
      gameState,
      timestamp: Date.now()
    });
  };

  // Handle play/pause button click with proper Safari user gesture handling
  const handlePlayPauseClick = async () => {
    console.log('[GameFooter] Play button clicked:', {
      isCreator,
      spotifyDeviceId: !!spotifyDeviceId,
      isPlayingMusic,
      localIsPlaying,
      currentCard: !!currentCard,
      currentCardPreviewUrl: currentCard?.preview_url,
      currentCardTitle: currentCard?.title
    });
    
    if (isCreator && spotifyDeviceId) {
      // Spotify creator logic with proper Safari handling
      try {
        // 1) Resume AudioContext if it's suspended (Safari requirement)
        if (window.AudioContext && window.audioContext && window.audioContext.state === 'suspended') {
          await window.audioContext.resume();
          console.log('[GameFooter] AudioContext resumed');
        }
        
        // 2) Activate Spotify player element for Safari
        if (window.Spotify && window.spotifyPlayerInstance) {
          try {
            // Use the footer element as the activation target
            const footerElement = document.querySelector('footer') || document.body;
            await window.spotifyPlayerInstance.activateElement(footerElement);
            console.log('[GameFooter] Spotify player activated for Safari');
          } catch (error) {
            console.log('[GameFooter] Error activating Spotify player:', error);
          }
        }
        
        if (isPlayingMusic) {
          // Currently playing, so pause
          await pauseSpotifyPlayback();
        } else {
          // 3) Connect and start playing
          if (window.spotifyPlayerInstance) {
            try {
              await window.spotifyPlayerInstance.connect();
              console.log('[GameFooter] Spotify player connected');
            } catch (error) {
              console.log('[GameFooter] Error connecting Spotify player:', error);
            }
          }
          
          // Check if there's an active track to resume, otherwise start new track
          try {
            const state = await spotifyAuth.getPlaybackState(spotifyDeviceId);
            if (state && state.item && state.item.uri === currentCard?.uri) {
              // Same track is loaded, just resume
              await resumeSpotifyPlayback();
            } else {
              // No track or different track, start new playback
              await triggerSpotifyPlayback();
            }
          } catch (error) {
            console.log('[GameFooter] Error checking player state:', error);
            if (error.message.includes('Token expired')) {
              handleTokenExpiration();
              return;
            }
            // If state check fails, start new playback
            await triggerSpotifyPlayback();
          }
        }
      } catch (error) {
        console.log('[GameFooter] Error in Spotify playback:', error);
      }
    } else {
      // For non-creators, use local audio with proper Safari handling
      console.log('[GameFooter] Using local playback mode');
      
      if (!localIsPlaying) {
        // Start playing - this MUST happen immediately in the user gesture
        setLocalIsPlaying(true);
        console.log('[GameFooter] Local playback started');
        
        // Try to play preview audio if available - using MDN recommended approach
        if (currentCard?.preview_url) {
          try {
            console.log('[GameFooter] Attempting to play preview audio:', currentCard.preview_url);
            
            // Create and configure audio in the user gesture
            const audio = new Audio(currentCard.preview_url);
            audio.volume = 0.3;
            
            // Safari-specific audio setup
            audio.setAttribute('playsinline', 'true');
            audio.setAttribute('webkit-playsinline', 'true');
            audio.muted = false;
            
            // Store audio reference immediately
            window.currentGameAudio = audio;
            
            // MDN recommended approach: Use play() with Promise handling
            const startPlayPromise = audio.play();
            
            if (startPlayPromise !== undefined) {
              startPlayPromise
                .then(() => {
                  console.log('[GameFooter] Preview audio started successfully');
                })
                .catch((error) => {
                  if (error.name === "NotAllowedError") {
                    console.log('[GameFooter] Autoplay was prevented by browser policy');
                    // Show user that they need to interact to enable audio
                    alert('Tap the play button again to enable audio');
                  } else {
                    console.log('[GameFooter] Audio playback failed:', error);
                  }
                  // Keep the progress bar running even if audio fails
                });
            }
          } catch (error) {
            console.log('[GameFooter] Audio creation failed:', error);
            // Keep the progress bar running even if audio fails
          }
        } else {
          console.log('[GameFooter] No preview URL available, using simulated playback');
        }
      } else {
        // Stop playing
        console.log('[GameFooter] Stopping local playback');
        setLocalIsPlaying(false);
        
        if (window.currentGameAudio) {
          try {
            window.currentGameAudio.pause();
            window.currentGameAudio = null;
          } catch (error) {
            console.log('[GameFooter] Error pausing audio:', error);
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
  const [tokenExpiredNotification, setTokenExpiredNotification] = useState(null); // For token expiration notifications
  const [showDeviceModal, setShowDeviceModal] = useState(false);

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

  // Listen for new song requests (creator only)
  React.useEffect(() => {
    if (!socketRef?.current || !isCreator) return;

    const handleNewSongRequest = (data) => {
      console.log('[GameFooter] Received new song request:', data);
      setNewSongRequest({
        playerId: data.playerId,
        playerName: data.playerName,
        timestamp: Date.now()
      });
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
      <footer className="fixed bottom-0 left-0 right-0 z-30 w-full bg-gray-800 shadow flex flex-col items-center px-1 py-1 border-t border-gray-700">
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
          <div className="flex-1 flex items-center gap-1 text-xs text-gray-400">
            <span className="text-xs">{formatTime(progress)}</span>
            <div className="relative flex-1 h-1 bg-[#404040] rounded-full overflow-hidden">
              <div className="absolute left-0 top-0 h-1 bg-[#1db954] rounded-full" style={{ width: `${(progress/duration)*100}%` }}></div>
            </div>
            <span className="text-xs">{formatTime(duration)}</span>
          </div>
        </div>
      </footer>
    );
  }

  return (
    <footer className="fixed bottom-0 left-0 right-0 z-30 w-full bg-gray-800 shadow flex flex-col items-center px-1 py-1 md:py-2 border-t border-gray-700">
      {/* Spotify-style player */}
      <div className="w-full max-w-md flex flex-col items-center">
        <div className="w-full bg-none rounded-2xl shadow-2xl shadow-gray-900 p-3 md:p-2 flex flex-col items-center mb-3">
          {/* Artist, title, year with album art - show during reveal phase or challenge-resolved */}
          {currentCard && ((showFeedback && feedback) || (phase === 'challenge-resolved' && feedback)) && (
            <div className="mb-2 flex items-center gap-4 justify-center w-full">
              {/* Album Art - only during reveal */}
              {(currentCard?.album_art || currentCard?.image || currentCard?.album?.images?.[0]?.url) && (
                <div className="w-20 h-20 md:w-32 md:h-32 rounded overflow-hidden bg-gray-700 flex-shrink-0">
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
              <div className="text-sm md:text-base text-gray-400 text-left flex-1 min-w-0">
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
            <div className="hidden mb-2 text-xs md:text-base text-gray-500 text-center w-full">
              🎵 Mystery Song
            </div>
          )}

          <div className="flex items-center mt-3 gap-2 md:gap-4 w-full">
            {/* Show controls only for creator */}
            {isCreator ? (
              <>
                {/* Restart button - moved to left */}
                <button
                  className="w-8 h-8 md:w-10 md:h-10 flex items-center justify-center rounded-full bg-gray-600 hover:bg-gray-500 active:bg-gray-500 flex-shrink-0"
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
                  className="w-12 h-12 md:w-20 md:h-20 flex items-center justify-center rounded-full bg-green-600 hover:bg-green-700 active:bg-green-700 shadow-[0_10px_15px_-3px_theme(colors.green.300)/50] border-4 border-green-500/20 flex-shrink-0"
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
                <div className="flex items-center gap-1 text-xs md:text-base text-gray-400">
                <span>{formatTime(progress)}</span>
                <div className="relative flex-1 h-2 bg-[#404040] rounded-full overflow-hidden">
                  <div className="absolute left-0 top-0 h-2 bg-[#1db954] rounded-full" style={{ width: `${(progress/duration)*100}%` }}></div>
                </div>
                <span>{formatTime(duration)}</span>
                {isCreator && (
                  <button
                  onClick={() => setShowDeviceModal(true)}
                  className="ml-2 w-6 h-6 flex items-center p-0 justify-center rounded-full bg-gray-600 hover:bg-gray-500 text-white text-xs"
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
            <div className="hidden text-xs text-gray-500 text-center space-y-1">
              {spotifyDeviceId ? (
                <div className="text-green-400">
                  ✓ Spotify Ready | {isPlayingMusic ? 'Playing' : 'Paused'}
                </div>
              ) : (
                <div className="text-yellow-400">
                  ⚠ Spotify Initializing...
                </div>
              )}
              <div className="text-gray-400">
                Device: {spotifyDeviceId ? spotifyDeviceId.substring(0, 8) + '...' : 'None'}
              </div>
              <div className="text-gray-400">
                Track: {currentCard?.title || 'None'} | Progress: {progress}s/{duration}s
              </div>
              <div className="text-gray-400">
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
              onClick={() => onChallengeResponse(true)}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded"
            >
              Accept (Remove card)
            </button>
            <button 
              onClick={() => onChallengeResponse(false)}
              className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded"
            >
              Reject (Keep card)
            </button>
          </div>
        </div>
      )}

      {/* Song guessing modal */}
      {showSongGuess && (
        <div className="w-full max-w-md p-3 rounded bg-none mb-2">
          <div className="text-white font-bold mb-4 text-center">Guess the song for bonus tokens!</div>
          <div className="space-y-3">
            <input
              type="text"
              placeholder="Song title"
              value={songTitle}
              onChange={(e) => setSongTitle(e.target.value)}
              className="w-full p-2 rounded border-gray-700 border-2 bg-gray-800 text-white"
            />
            <input
              type="text"
              placeholder="Artist"
              value={songArtist}
              onChange={(e) => setSongArtist(e.target.value)}
              className="w-full p-2 rounded border-gray-700 border-2 bg-gray-800 text-white"
            />
            <div className="flex justify-center gap-2 pt-2">
              <button 
                onClick={handleSongGuess}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded"
              >
                Submit Guess
              </button>
              <button 
                onClick={() => setShowSongGuess(false)}
                className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded"
              >
                Cancel
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
          onDeviceSwitch={(newDeviceId) => {
            console.log('[GameFooter] Device switched to:', newDeviceId);
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
        <div className="w-full max-w-md p-3 rounded bg-none mb-2 text-center">
          <div className="text-white font-bold mb-4">
            Do you want to guess the song for bonus tokens?
          </div>
          <div className="flex gap-2 justify-center">
            <button 
              onClick={() => setShowSongGuess(true)}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm rounded"
            >
              Guess Song & Artist
            </button>
            <button 
              onClick={() => onSkipSongGuess()}
              className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white text-sm rounded"
            >
              Skip
            </button>
          </div>
        </div>
      )}

      {/* Song guess section - waiting for current player */}
      {phase === 'song-guess' && !isMyTurn && (
        <div className="w-full max-w-md p-3 rounded bg-none mb-2 text-center">
          <div className="text-white font-bold mb-4">
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
            <div className="text-white font-bold mb-2">
              Other players can now challenge.
            </div>
            {!isMyTurn && myPlayer && myPlayer.tokens > 0 && !hasResponded ? (
              <div className="flex gap-2 justify-center">
                <button 
                  onClick={() => onInitiateChallenge()}
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm rounded"
                >
                  Challenge (1 token)
                </button>
                <button 
                  onClick={() => onSkipChallenge()}
                  className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white text-sm rounded"
                >
                  Skip
                </button>
              </div>
            ) : !isMyTurn && myPlayer && myPlayer.tokens === 0 && !hasResponded ? (
              <div className="flex flex-col items-center gap-2">
                <div className="text-white text-sm">No tokens to challenge</div>
                <button 
                  onClick={() => onSkipChallenge()}
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm rounded"
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
        <div className="w-full max-w-md p-3 rounded bg-none mb-2 text-center">
          <div className="text-white font-bold mb-2">
            {players?.find(p => p.id === challenge.challengerId)?.name} is challenging the placement!
          </div>
          <div className="text-white text-sm">
            {challenge.challengerId === myPlayerId ? 
              "Place the card where you think it belongs" : 
              "Waiting for challenger to place the card..."
            }
          </div>
        </div>
      )}

      {/* Challenge resolved section */}
      {phase === 'challenge-resolved' && challenge && feedback && (
        <div className="w-full max-w-md p-3 rounded bg-none mb-2 text-center">
          <div className="text-white font-bold">
            Challenge Complete!
          </div>
          <div className="text-white text-sm mb-4">
            {challenge.result?.challengeWon ? 
              `${players?.find(p => p.id === challenge.challengerId)?.name} won the challenge!` :
              challenge.result?.originalCorrect ?
                `${players?.find(p => p.id === challenge.originalPlayerId)?.name} placed it correctly!` :
                challenge.result?.challengerCorrect ?
                  `${players?.find(p => p.id === challenge.challengerId)?.name} placed it correctly, but ${players?.find(p => p.id === challenge.originalPlayerId)?.name} went first!` :
                  `Both players placed it incorrectly! No one gets the card.`
            }
          </div>
          <button 
            onClick={onContinueAfterChallenge}
            className="px-6 py-2 bg-green-600 hover:bg-green-700 text-white text-sm rounded mt-3"
          >
            Continue to Next Turn
          </button>
        </div>
      )}

      {/* Token Expired Notification */}
      {tokenExpiredNotification && (
        <div className="w-full max-w-md p-3 mb-2 text-center bg-red-900/50 border border-red-500 rounded">
          <div className="text-red-400 font-bold mb-2">
            🔒 Spotify Session Expired
          </div>
          <div className="text-red-300 text-sm mb-3">
            Your Spotify authentication has expired. Re-authenticate to continue with Spotify playback.
          </div>
          <div className="flex gap-2 justify-center">
            <button 
              onClick={() => {
                // Use the auth utility for consistent re-auth handling
                spotifyAuth.initiateReauth(tokenExpiredNotification.gameState);
              }}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 text-sm text-white rounded"
            >
              Re-authenticate with Spotify
            </button>
            <button 
              onClick={() => {
                // Dismiss notification and continue with local playback
                setTokenExpiredNotification(null);
              }}
              className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-sm text-white rounded"
            >
              Continue without Spotify
            </button>
          </div>
        </div>
      )}

      {/* New Song Request Notification - only for creator */}
      {isCreator && newSongRequest && (
        <div className="w-full max-w-md p-3 mb-2 text-center">
          <div className="text-white font-bold mb-2">
            {newSongRequest.playerName} paid 1 token for a new song!
          </div>
          <div className="flex gap-2 justify-center">
            <button 
              onClick={() => {
                // Pause current song if playing
                if (isPlayingMusic && spotifyDeviceId) {
                  pauseSpotifyPlayback();
                }
                // Clear the notification
                setNewSongRequest(null);
              }}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 text-sm text-white rounded"
            >
              Load New Song
            </button>
          </div>
        </div>
      )}
      
      {/* Pending drop confirmation section */}
      {pendingDropIndex !== null && isMyTurn && (
        <div className="w-full max-w-md p-3 rounded bg-none mb-2 text-center">
          <div className="text-white font-bold mb-4">
            Confirm placement at position {pendingDropIndex + 1}
          </div>
          <div className="flex gap-2 justify-center">
            <button 
              onClick={onConfirmDrop}
              className="px-6 py-2 bg-green-600 hover:bg-green-700 text-white rounded"
            >
              Confirm Placement
            </button>
            <button 
              onClick={onCancelDrop}
              className="px-6 py-2 bg-red-600 hover:bg-red-700 text-white rounded"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Feedback section */}
      <div className="w-full max-w-md flex flex-col items-center">
        {showFeedback && feedback ? (
          <div className="w-full p-3 rounded text-center bg-none mb-2">
            <div className={`${feedback.correct ? "text-green-400" : "text-red-400"} font-bold text-lg md:text-2xl mb-4`}>
              {feedback.correct ? "Correct!" : "Incorrect."}
            </div>
            
            {/* Continue button - only creator can click */}
            {isCreator ? (
              <button 
                className="mt-3 px-6 py-2 bg-green-600 hover:bg-green-700 text-white text-sm rounded" 
                onClick={handleContinueClick}
              >
                Continue to Next Turn
              </button>
            ) : (
              <div className="mt-3 px-6 py-2 text-white rounded font-bold">
                Waiting for host to start next turn...
              </div>
            )}
          </div>
        ) : currentCard && phase === 'player-turn' && pendingDropIndex === null ? (
          <div className="w-full p-2 md:p-4 rounded text-center bg-none mb-1">
            <div className="text-gray-200 text-md md:text-2xl font-bold">
              {isMyTurn ? "Place this card in the timeline above" : `${players?.find(p => p.id === currentPlayerId)?.name}'s turn`}
            </div>
            
            {/* New Song button - only for current player with tokens */}
            {isMyTurn && myPlayer && myPlayer.tokens > 0 && (
              <div className="flex flex-col items-center">
                <div className="text-gray-300 text-sm mb-4">You can pay 1 token to get another song</div>
                <button 
                  onClick={() => handleTokenAction('skip_song')}
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md text-sm"
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
