import React, { useState } from "react";

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
  roomCode
}) {
  // Track local playing state for UI
  const [localIsPlaying, setLocalIsPlaying] = React.useState(false);
  const [progress, setProgress] = React.useState(0);
  const [duration, setDuration] = React.useState(30); // Default 30 seconds
  const [spotifyPosition, setSpotifyPosition] = React.useState(0);

  // Use real Spotify playing state if available, otherwise use local state
  const actualIsPlaying = isCreator && spotifyDeviceId ? isPlayingMusic : localIsPlaying;

  // Get real Spotify playback position
  React.useEffect(() => {
    if (!isCreator || !spotifyDeviceId || !window.Spotify) return;

    const getPlaybackState = async () => {
      try {
        const token = localStorage.getItem('access_token');
        if (!token) return;

        const response = await fetch('https://api.spotify.com/v1/me/player', {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });

        if (response.ok) {
          const state = await response.json();
          if (state && state.item) {
            const positionMs = state.progress_ms || 0;
            const durationMs = state.item.duration_ms || 30000;
            
            setSpotifyPosition(Math.floor(positionMs / 1000));
            setDuration(Math.floor(durationMs / 1000));
            setProgress(Math.floor(positionMs / 1000));
          }
        }
      } catch (error) {
        console.log('[GameFooter] Error getting playback state:', error);
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

  // Function to trigger Spotify playback
  const triggerSpotifyPlayback = async () => {
    if (!isCreator || !spotifyDeviceId || !currentCard?.uri) {
      console.log('[GameFooter] Cannot play - missing requirements:', {
        isCreator,
        spotifyDeviceId: !!spotifyDeviceId,
        hasUri: !!currentCard?.uri
      });
      return;
    }

    try {
      console.log('[GameFooter] Triggering Spotify playback for:', currentCard.title);
      
      // Get the Spotify token from localStorage
      const token = localStorage.getItem('access_token');
      if (!token) {
        console.error('[GameFooter] No Spotify token available');
        return;
      }

      const response = await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${spotifyDeviceId}`, {
        method: 'PUT',
        body: JSON.stringify({
          uris: [currentCard.uri],
          position_ms: 0
        }),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
      });

      if (response.ok) {
        console.log('[GameFooter] Successfully started Spotify playback');
      } else {
        const errorText = await response.text();
        console.error('[GameFooter] Failed to start Spotify playback:', response.status, errorText);
        
        // Fallback to preview URL if available
        if (currentCard.preview_url) {
          console.log('[GameFooter] Trying preview URL as fallback');
          const audio = new Audio(currentCard.preview_url);
          audio.volume = 0.5;
          audio.play().then(() => {
            console.log('[GameFooter] Playing preview audio');
            setLocalIsPlaying(true);
          }).catch(err => {
            console.log('[GameFooter] Preview audio failed:', err.message);
          });
        }
      }
    } catch (error) {
      console.error('[GameFooter] Error triggering Spotify playback:', error);
    }
  };

  // Function to pause Spotify playback
  const pauseSpotifyPlayback = async () => {
    if (!isCreator || !spotifyDeviceId) return;

    try {
      console.log('[GameFooter] Pausing Spotify playback');
      
      const token = localStorage.getItem('access_token');
      if (!token) return;

      const response = await fetch(`https://api.spotify.com/v1/me/player/pause?device_id=${spotifyDeviceId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`
        },
      });

      if (response.ok) {
        console.log('[GameFooter] Successfully paused Spotify playback');
      } else {
        console.error('[GameFooter] Failed to pause Spotify playback:', response.status);
      }
    } catch (error) {
      console.error('[GameFooter] Error pausing Spotify playback:', error);
    }
  };

  // Function to restart current track
  const restartSpotifyTrack = async () => {
    if (!isCreator || !spotifyDeviceId || !currentCard?.uri) return;

    try {
      console.log('[GameFooter] Restarting Spotify track');
      
      const token = localStorage.getItem('access_token');
      if (!token) return;

      const response = await fetch(`https://api.spotify.com/v1/me/player/seek?position_ms=0&device_id=${spotifyDeviceId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`
        },
      });

      if (response.ok) {
        console.log('[GameFooter] Successfully restarted Spotify track');
      } else {
        console.error('[GameFooter] Failed to restart Spotify track:', response.status);
      }
    } catch (error) {
      console.error('[GameFooter] Error restarting Spotify track:', error);
    }
  };

  // Function to resume Spotify playback
  const resumeSpotifyPlayback = async () => {
    if (!isCreator || !spotifyDeviceId) return;

    try {
      console.log('[GameFooter] Resuming Spotify playback');
      
      const token = localStorage.getItem('access_token');
      if (!token) return;

      const response = await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${spotifyDeviceId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`
        },
      });

      if (response.ok) {
        console.log('[GameFooter] Successfully resumed Spotify playback');
      } else {
        console.error('[GameFooter] Failed to resume Spotify playback:', response.status);
      }
    } catch (error) {
      console.error('[GameFooter] Error resuming Spotify playback:', error);
    }
  };

  // Function to stop Spotify playback when moving to next player
  const stopSpotifyPlayback = async () => {
    if (!isCreator || !spotifyDeviceId) return;

    try {
      console.log('[GameFooter] Stopping Spotify playback for next player turn');
      
      const token = localStorage.getItem('access_token');
      if (!token) return;

      const response = await fetch(`https://api.spotify.com/v1/me/player/pause?device_id=${spotifyDeviceId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`
        },
      });

      if (response.ok) {
        console.log('[GameFooter] Successfully stopped Spotify playback');
      } else {
        console.error('[GameFooter] Failed to stop Spotify playback:', response.status);
      }
    } catch (error) {
      console.error('[GameFooter] Error stopping Spotify playback:', error);
    }
  };

  // Handle Spotify token expiration
  const handleTokenExpiration = () => {
    console.log('[GameFooter] Spotify token expired, requesting re-authentication');
    
    // Save current game state
    const gameState = {
      view: 'game',
      playerName: 'Current Player', // This should be passed as prop in real implementation
      roomCode: 'CURRENT_ROOM', // This should be passed as prop in real implementation
      isCreator: true,
      timestamp: Date.now()
    };
    
    localStorage.setItem('game_state_backup', JSON.stringify(gameState));
    localStorage.setItem('pending_reauth', 'true');
    
    // Show user-friendly message
    if (window.confirm('Your Spotify session has expired. Click OK to re-authenticate and continue the game.')) {
      window.location.href = "http://localhost:3001/login";
    }
  };

  // Handle play/pause button click with token validation
  const handlePlayPauseClick = async () => {
    // Add user interaction flag for Safari
    const userInteracted = true;
    
    if (isCreator && spotifyDeviceId) {
      if (isPlayingMusic) {
        // Currently playing, so pause
        pauseSpotifyPlayback();
      } else {
        // Check if there's an active track to resume, otherwise start new track
        try {
          const token = localStorage.getItem('access_token');
          if (!token) {
            console.log('[GameFooter] No token available');
            handleTokenExpiration();
            return;
          }

          const response = await fetch('https://api.spotify.com/v1/me/player', {
            headers: {
              'Authorization': `Bearer ${token}`
            }
          });

          if (response.status === 401) {
            console.log('[GameFooter] Token expired during player state check');
            handleTokenExpiration();
            return;
          }

          if (response.ok) {
            const state = await response.json();
            if (state && state.item && state.item.uri === currentCard?.uri) {
              // Same track is loaded, just resume
              resumeSpotifyPlayback();
            } else {
              // No track or different track, start new playback
              triggerSpotifyPlayback();
            }
          } else {
            // No active player state, start new playback
            triggerSpotifyPlayback();
          }
        } catch (error) {
          console.log('[GameFooter] Error checking player state, starting new playback:', error);
          triggerSpotifyPlayback();
        }
      }
    } else {
      // For non-creators, try to play preview audio if available
      if (!localIsPlaying && currentCard?.preview_url && userInteracted) {
        // Try to play preview audio on Safari for non-creators
        try {
          const audio = new Audio(currentCard.preview_url);
          audio.volume = 0.3;
          audio.preload = 'auto';
          
          // Safari-specific audio setup
          audio.setAttribute('playsinline', 'true');
          audio.setAttribute('webkit-playsinline', 'true');
          
          // Add event listeners for better Safari compatibility
          audio.addEventListener('loadeddata', () => {
            console.log('[GameFooter] Audio data loaded');
          });
          
          audio.addEventListener('canplay', () => {
            console.log('[GameFooter] Audio can start playing');
          });
          
          audio.addEventListener('error', (e) => {
            console.log('[GameFooter] Audio error:', e);
            setLocalIsPlaying(true); // Fallback to simulated
          });
          
          // For Safari, we need to call play() directly from user interaction
          const playPromise = audio.play();
          if (playPromise !== undefined) {
            playPromise.then(() => {
              console.log('[GameFooter] Preview audio started successfully');
              setLocalIsPlaying(true);
              
              // Store audio reference for cleanup
              window.currentGameAudio = audio;
            }).catch(error => {
              console.log('[GameFooter] Preview audio failed, using simulated playback:', error);
              setLocalIsPlaying(true);
            });
          } else {
            setLocalIsPlaying(true);
          }
        } catch (error) {
          console.log('[GameFooter] Audio creation failed, using simulated playback:', error);
          setLocalIsPlaying(true);
        }
      } else if (localIsPlaying && window.currentGameAudio) {
        // Pause current audio if playing
        try {
          window.currentGameAudio.pause();
          window.currentGameAudio = null;
        } catch (error) {
          console.log('[GameFooter] Error pausing audio:', error);
        }
        setLocalIsPlaying(false);
      } else {
        // Toggle simulated playback
        setLocalIsPlaying((p) => !p);
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

  return (
    <footer className="sticky bottom-0 z-30 w-full bg-gray-800 shadow flex flex-col items-center px-1 py-1 md:py-2 border-t border-gray-700">
      {/* Spotify-style player */}
      <div className="w-full max-w-md flex flex-col items-center">
        <div className="w-full bg-none rounded-2xl shadow-2xl shadow-gray-900 p-3 md:p-2 flex flex-col items-center mb-3">
          {/* Artist, title, year with album art - show during reveal phase or challenge-resolved */}
          {currentCard && ((showFeedback && feedback) || (phase === 'challenge-resolved' && feedback)) && (
            <div className="mb-2 flex items-center gap-4 justify-center w-full">
              {/* Album Art - only during reveal */}
              {(currentCard?.album_art || currentCard?.image || currentCard?.album?.images?.[0]?.url) && (
                <div className="w-12 h-12 md:w-16 md:h-16 rounded overflow-hidden bg-gray-700 flex-shrink-0">
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
              <div className="text-sm md:text-base text-gray-400 text-center truncate">
                {currentCard.title} – {currentCard.artist} ({feedback?.year || currentCard.year})
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
                  className="w-8 h-8 md:w-10 md:h-10 flex items-center justify-center rounded-full bg-gray-600 hover:bg-gray-500 transition-colors flex-shrink-0"
                  onClick={handleRestartClick}
                  aria-label="Restart track"
                >
                  <div className="text-white text-lg md:text-xl font-bold">⇤</div>
                </button>
                
                <button
                  className="w-12 h-12 md:w-20 md:h-20 flex items-center justify-center rounded-full bg-green-600 hover:bg-green-700 transition-colors shadow-lg border-4 border-white/20 flex-shrink-0"
                  onClick={handlePlayPauseClick}
                  aria-label={actualIsPlaying ? "Pause" : "Play"}
                >
                  {actualIsPlaying ? (
                    <div className="text-white text-2xl md:text-4xl font-bold">⏸</div>
                  ) : (
                    <div className="text-white text-xl md:text-3xl font-bold ml-1">▶</div>
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
      {phase === 'challenge-window' && (
        <div className="w-full max-w-md p-3 rounded bg-none mb-2 text-center">
          <div className="text-white font-bold mb-2">
            Other players can now challenge.
          </div>
          {!isMyTurn && myPlayer && myPlayer.tokens > 0 ? (
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
          ) : !isMyTurn && myPlayer && myPlayer.tokens === 0 ? (
            <div className="flex flex-col items-center gap-2">
              <div className="text-white text-sm">No tokens to challenge</div>
              <button 
                onClick={() => onSkipChallenge()}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm rounded"
              >
                OK
              </button>
            </div>
          ) : (
            <div className="text-white text-sm">
              {isMyTurn ? "Waiting for other players..." : "Waiting..."}
            </div>
          )}
        </div>
      )}

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
              `${players?.find(p => p.id === challenge.originalPlayerId)?.name} placed it correctly!`
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
        ) : currentCard && phase === 'player-turn' ? (
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
