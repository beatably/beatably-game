import React, { useState, useEffect } from 'react';
import spotifyAuth from './utils/spotifyAuth';

// Default track object structure
const track = {
  name: "",
  album: {
    images: [
      { url: "" }
    ]
  },
  artists: [
    { name: "" }
  ]
};

const SpotifyPlayer = ({ token, currentTrack, isPlaying, onPlayerReady, onPlayerStateChange }) => {
  const [player, setPlayer] = useState(undefined);
  const [is_paused, setPaused] = useState(false);
  const [is_active, setActive] = useState(false);
  const [current_track, setTrack] = useState(track);
  const [deviceId, setDeviceId] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState('initializing'); // initializing, connecting, connected, error
  const [errorMessage, setErrorMessage] = useState(null);
  const [retryCount, setRetryCount] = useState(0);
  const maxRetries = 3;

  // New: session unlock state to handle iOS Safari autoplay restrictions
  const [playbackUnlocked, setPlaybackUnlocked] = useState(false);
  // Expose minimal API globally so App/GameFooter can request unlock/play if needed
  useEffect(() => {
    window.beatablyPlayback = {
      isUnlocked: () => playbackUnlocked,
      ensureUnlockedViaGesture: async () => {
        try {
          // Resume/create an AudioContext with a short silent sound to satisfy gesture
          const AudioCtx = window.AudioContext || window.webkitAudioContext;
          if (AudioCtx) {
            const ctx = new AudioCtx();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            gain.gain.value = 0;
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start();
            osc.stop(ctx.currentTime + 0.05);
          }
          // Attempt to resume the Spotify player if available
          if (window.spotifyPlayerInstance?.resume) {
            try { await window.spotifyPlayerInstance.resume(); } catch (_) {}
          }
          setPlaybackUnlocked(true);
          return true;
        } catch (e) {
          console.warn('[Playback] ensureUnlockedViaGesture failed:', e);
          return false;
        }
      },
      // Best-effort stop (pause) current playback via Web API helper in App
      stopCurrent: async () => {
        try {
          // leave to App/spotifyAuth through events if needed
          if (window.spotifyPlayerInstance?.pause) {
            await window.spotifyPlayerInstance.pause();
          }
        } catch (_) {}
      }
    };
    return () => {
      // do not delete to allow persistence between mounts in game view
    };
  }, [playbackUnlocked]);

  // Validate token before initializing player
  useEffect(() => {
    const initializePlayer = async () => {
      if (!token) {
        setConnectionStatus('error');
        setErrorMessage('No Spotify token available');
        return;
      }

      if (player) {
        console.log('[SpotifyPlayer] Player already exists, skipping creation');
        return;
      }

      // Validate token before proceeding
      setConnectionStatus('connecting');
      const tokenValidation = await spotifyAuth.ensureValidToken();
      
      if (!tokenValidation.valid) {
        console.log('[SpotifyPlayer] Token validation failed');
        setConnectionStatus('error');
        setErrorMessage('Spotify authentication expired. Please refresh the page.');
        return;
      }

      // Check if SDK is already loaded
      if (window.Spotify) {
        console.log('[SpotifyPlayer] SDK already loaded, creating player...');
        createPlayer();
        return;
      }

      // Check if script is already loading
      if (document.querySelector('script[src="https://sdk.scdn.co/spotify-player.js"]')) {
        console.log('[SpotifyPlayer] SDK script already loading, waiting...');
        return;
      }

      const script = document.createElement("script");
      script.src = "https://sdk.scdn.co/spotify-player.js";
      script.async = true;

      script.onerror = () => {
        console.error('[SpotifyPlayer] Failed to load Spotify SDK');
        setConnectionStatus('error');
        setErrorMessage('Failed to load Spotify SDK. Please check your internet connection.');
      };

      document.body.appendChild(script);

      window.onSpotifyWebPlaybackSDKReady = () => {
        console.log('[SpotifyPlayer] SDK Ready, creating player...');
        createPlayer();
      };
    };

    const createPlayer = async () => {
      try {
        // Double-check token validity before creating player
        const tokenValidation = await spotifyAuth.ensureValidToken();
        if (!tokenValidation.valid) {
          setConnectionStatus('error');
          setErrorMessage('Token expired during player creation');
          return;
        }

        const spotifyPlayer = new window.Spotify.Player({
          name: 'Beatably Game Player',
          getOAuthToken: async (cb) => {
            // Always validate token when requested by SDK
            const currentToken = spotifyAuth.getToken();
            if (!currentToken) {
              console.error('[SpotifyPlayer] No token available for SDK callback');
              setConnectionStatus('error');
              setErrorMessage('Authentication required');
              return;
            }
            
            const isValid = await spotifyAuth.validateToken(currentToken);
            if (!isValid) {
              console.error('[SpotifyPlayer] Token invalid in SDK callback');
              setConnectionStatus('error');
              setErrorMessage('Token expired, please refresh');
              return;
            }
            
            cb(currentToken);
          },
          volume: 0.5
        });

        spotifyPlayer.addListener('ready', ({ device_id }) => {
          console.log('[SpotifyPlayer] Ready with Device ID', device_id);
          setDeviceId(device_id);
          setActive(true);
          setConnectionStatus('connected');
          setErrorMessage(null);
          setRetryCount(0);

          // IMPORTANT: Do NOT override a user-selected device with the SDK device.
          // Only persist the SDK device if no explicit selection exists yet.
          try {
            if (window.localStorage) {
              const existing = window.localStorage.getItem('spotify_device_id');
              if (!existing) {
                window.localStorage.setItem('spotify_device_id', device_id);
              } else {
                console.log('[SpotifyPlayer] Preserving existing selected device over SDK device:', { selected: existing, sdk: device_id });
              }
            }
          } catch (_) {}

          if (onPlayerReady) {
            onPlayerReady(device_id);
          }
        });

        spotifyPlayer.addListener('not_ready', ({ device_id }) => {
          console.log('[SpotifyPlayer] Device ID has gone offline', device_id);
          setActive(false);
          setConnectionStatus('error');
          setErrorMessage('Device went offline');
        });

        spotifyPlayer.addListener('player_state_changed', (state => {
          if (!state) {
            return;
          }

          setTrack(state.track_window.current_track);
          setPaused(state.paused);

          spotifyPlayer.getCurrentState().then(state => {
            (!state) ? setActive(false) : setActive(true)
          });

          if (onPlayerStateChange) {
            onPlayerStateChange(state);
          }
        }));

        // Handle autoplay failures (Safari)
        spotifyPlayer.addListener('autoplay_failed', () => {
          console.log('[SpotifyPlayer] Autoplay failed - browser autoplay rules');
          setErrorMessage('Tap the play button to enable audio');
        });
        // Try to mark unlocked when user interacts with SDK controls
        spotifyPlayer.addListener('ready', () => {
          // no-op; unlock handled by gesture util
        });

        // Enhanced error handling
        spotifyPlayer.addListener('initialization_error', ({ message }) => {
          console.error('[SpotifyPlayer] Initialization error:', message);
          setConnectionStatus('error');
          setErrorMessage(`Initialization failed: ${message}`);
          handleRetry();
        });

        spotifyPlayer.addListener('authentication_error', ({ message }) => {
          console.error('[SpotifyPlayer] Authentication error:', message);
          setConnectionStatus('error');
          setErrorMessage('Authentication failed - token may be expired');
          // Clear token and trigger re-auth flow
          spotifyAuth.clearToken();
          spotifyAuth.initiateReauth();
        });

        spotifyPlayer.addListener('account_error', ({ message }) => {
          console.error('[SpotifyPlayer] Account error:', message);
          setConnectionStatus('error');
          setErrorMessage(`Account error: ${message}`);
        });

        spotifyPlayer.addListener('playback_error', ({ message }) => {
          console.error('[SpotifyPlayer] Playback error:', message);
          setErrorMessage(`Playback error: ${message}`);
        });

        const connectResult = await spotifyPlayer.connect();
        if (connectResult) {
          console.log('[SpotifyPlayer] Successfully connected to Spotify!');
          setConnectionStatus('connected');
        } else {
          console.error('[SpotifyPlayer] Failed to connect');
          setConnectionStatus('error');
          setErrorMessage('Failed to connect to Spotify');
          handleRetry();
        }

        setPlayer(spotifyPlayer);
        
        // Store player instance globally for Safari activateElement() calls
        window.spotifyPlayerInstance = spotifyPlayer;

      } catch (error) {
        console.error('[SpotifyPlayer] Error creating player:', error);
        setConnectionStatus('error');
        setErrorMessage(`Player creation failed: ${error.message}`);
        handleRetry();
      }
    };

    const handleRetry = () => {
      if (retryCount < maxRetries) {
        console.log(`[SpotifyPlayer] Retrying connection (${retryCount + 1}/${maxRetries})`);
        setRetryCount(prev => prev + 1);
        setTimeout(() => {
          setConnectionStatus('connecting');
          initializePlayer();
        }, Math.pow(2, retryCount) * 1000); // Exponential backoff
      } else {
        console.error('[SpotifyPlayer] Max retries reached');
        setErrorMessage('Connection failed after multiple attempts. Please refresh the page.');
      }
    };

    initializePlayer();

    return () => {
      const script = document.querySelector('script[src="https://sdk.scdn.co/spotify-player.js"]');
      if (script && script.parentNode) {
        script.parentNode.removeChild(script);
      }
    };
  }, [token, onPlayerReady, onPlayerStateChange, retryCount]);

  // REMOVED: Automatic playback trigger to prevent restarts on phase changes
  // Playback is now controlled manually through the GameFooter play button

  // Helper: attempt to force play currentTrack when isPlaying toggles true
  useEffect(() => {
    // Only attempt when creator side sets isPlaying true and we have SDK/player
    if (!player) return;
    if (!isPlaying) return;

    // Autoplay gating: if not unlocked yet on iOS Safari, surface a hint and do nothing
    const tryPlay = async () => {
      try {
        // If the SDK exposes activateElement, call it to appease Safari
        if (player.activateElement) {
          try {
            await player.activateElement();
            setPlaybackUnlocked(true);
          } catch (e) {
            // ignore
          }
        }
        // If resume exists, try to resume
        if (player.resume) {
          try { await player.resume(); } catch (_) {}
        }
        // If we still aren't unlocked, bail; App will flip the CTA when needed
        if (!playbackUnlocked) {
          console.log('[SpotifyPlayer] Playback blocked (not unlocked)');
          setErrorMessage('Tap play to enable audio');
          return;
        }
        // No direct .play(uris) on SDK; actual track start is driven by backend via Web API
        // This hook's role is primarily to ensure the audio element is in a playable state.
      } catch (err) {
        console.warn('[SpotifyPlayer] Autoplay attempt encountered error:', err?.message || err);
        // If NotAllowedError-like, keep unlocked false and rely on CTA
      }
    };

    tryPlay();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, player]);

  // Control functions
  const togglePlay = () => {
    if (player) {
      player.togglePlay();
    }
  };

  const previousTrack = () => {
    if (player) {
      player.previousTrack();
    }
  };

  const nextTrack = () => {
    if (player) {
      player.nextTrack();
    }
  };

  // Show connection status and errors
  if (connectionStatus === 'error') {
    const isTokenExpired = errorMessage && errorMessage.includes('expired');
    
    return (
      <div className="spotify-player">
        <div className="text-sm text-red-400">
          <div>⚠ Spotify Connection Error</div>
          <div className="text-xs text-gray-400 mt-1">
            {isTokenExpired ? 'Your Spotify session has expired' : (errorMessage || 'Unknown error occurred')}
          </div>
          {isTokenExpired ? (
            <button 
              onClick={() => {
                // Use centralized re-auth flow (no hardcoded URLs)
                spotifyAuth.initiateReauth({ view: 'game', timestamp: Date.now() });
              }}
              className="mt-2 px-3 py-1 bg-green-600 text-white text-xs rounded hover:bg-green-700"
            >
              Re-authenticate with Spotify
            </button>
          ) : retryCount < maxRetries ? (
            <div className="text-xs text-gray-500 mt-1">
              Retrying... ({retryCount}/{maxRetries})
            </div>
          ) : (
            <button 
              onClick={() => window.location.reload()} 
              className="mt-2 px-3 py-1 bg-red-600 text-white text-xs rounded hover:bg-red-700"
            >
              Refresh Page
            </button>
          )}
        </div>
      </div>
    );
  }

  if (connectionStatus === 'connecting' || !player) {
    return (
      <div className="spotify-player">
        <div className="text-sm text-blue-400">
          <div>🔄 Connecting to Spotify...</div>
          <div className="text-xs text-gray-400 mt-1">
            {connectionStatus === 'connecting' ? 'Validating authentication...' : 'Loading Spotify Player...'}
          </div>
        </div>
      </div>
    );
  }

  if (!is_active) {
    return (
      <div className="spotify-player">
        <div className="text-sm text-yellow-400">
          <div>Spotify Player Connected</div>
          <div className="text-xs text-gray-400 mt-1">
            Ensure your selected Spotify device is active. The web player is available as: "{deviceId ? 'Beatably Game Player' : 'Web Player'}"
          </div>
          {errorMessage && (
            <div className="text-xs text-orange-400 mt-1">
              {errorMessage}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="spotify-player">
      <div className="text-sm text-green-400">
        ✓ Spotify Player Ready
      </div>
      
      {/* Current track display */}
      {current_track && current_track.name && (
        <div className="mt-8 p-2 bg-gray-700 rounded">
          <div className="text-xs text-gray-300">
            Now playing: {current_track.name} by {current_track.artists[0]?.name}
          </div>
        </div>
      )}

      {/* Player controls */}
      <div className="mt-2 flex gap-2 items-center">
        <button
          onClick={previousTrack}
          className="px-2 py-1 bg-gray-600 text-white text-xs rounded hover:bg-gray-700"
        >
          ⏮
        </button>
        
        <button
          onClick={togglePlay}
          className="px-3 py-1 bg-green-600 text-white text-xs rounded hover:bg-green-700"
        >
          {is_paused ? "▶" : "⏸"}
        </button>
        
        <button
          onClick={nextTrack}
          className="px-2 py-1 bg-gray-600 text-white text-xs rounded hover:bg-gray-700"
        >
          ⏭
        </button>
      </div>

      {/* Game track info */}
      {currentTrack && (
        <div className="mt-2 p-2 bg-blue-800 rounded">
          <div className="text-xs text-blue-200">
            Game Track: {currentTrack.title} by {currentTrack.artist} ({currentTrack.year})
          </div>
        </div>
      )}
    </div>
  );
};

export default SpotifyPlayer;
