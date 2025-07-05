import React, { useState, useEffect } from 'react';

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

  useEffect(() => {
    if (!token) return;
    if (player) {
      console.log('[SpotifyPlayer] Player already exists, skipping creation');
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

    document.body.appendChild(script);

    window.onSpotifyWebPlaybackSDKReady = () => {
      console.log('[SpotifyPlayer] SDK Ready, creating player...');
      createPlayer();
    };

    function createPlayer() {
      const spotifyPlayer = new window.Spotify.Player({
        name: 'Beatably Game Player',
        getOAuthToken: cb => { cb(token); },
        volume: 0.5
      });

      spotifyPlayer.addListener('ready', ({ device_id }) => {
        console.log('[SpotifyPlayer] Ready with Device ID', device_id);
        setDeviceId(device_id);
        setActive(true);
        if (onPlayerReady) {
          onPlayerReady(device_id);
        }
      });

      spotifyPlayer.addListener('not_ready', ({ device_id }) => {
        console.log('[SpotifyPlayer] Device ID has gone offline', device_id);
        setActive(false);
      });

      spotifyPlayer.addListener('player_state_changed', (state => {
        // Removed excessive logging - only log important state changes
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
        alert('Tap to start audio');
      });

      // Error handling
      spotifyPlayer.addListener('initialization_error', ({ message }) => {
        console.error('[SpotifyPlayer] Initialization error:', message);
      });

      spotifyPlayer.addListener('authentication_error', ({ message }) => {
        console.error('[SpotifyPlayer] Authentication error:', message);
      });

      spotifyPlayer.addListener('account_error', ({ message }) => {
        console.error('[SpotifyPlayer] Account error:', message);
      });

      spotifyPlayer.addListener('playback_error', ({ message }) => {
        console.error('[SpotifyPlayer] Playback error:', message);
      });

      spotifyPlayer.connect().then(success => {
        if (success) {
          console.log('[SpotifyPlayer] Successfully connected to Spotify!');
        } else {
          console.error('[SpotifyPlayer] Failed to connect');
        }
      });

      setPlayer(spotifyPlayer);
      
      // Store player instance globally for Safari activateElement() calls
      window.spotifyPlayerInstance = spotifyPlayer;
    };

    return () => {
      if (script.parentNode) {
        script.parentNode.removeChild(script);
      }
    };
  }, [token, onPlayerReady, onPlayerStateChange]);

  // REMOVED: Automatic playback trigger to prevent restarts on phase changes
  // Playback is now controlled manually through the GameFooter play button

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

  if (!player) {
    return (
      <div className="spotify-player">
        <div className="text-sm text-gray-400">Loading Spotify Player...</div>
      </div>
    );
  }

  if (!is_active) {
    return (
      <div className="spotify-player">
        <div className="text-sm text-yellow-400">
          <div>Spotify Player Connected</div>
          <div className="text-xs text-gray-400 mt-1">
            Transfer playback to "Beatably Game Player" in your Spotify app to start playing music
          </div>
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
