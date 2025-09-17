/**
 * Production-specific Spotify playback fixes
 * Addresses the issue where play button doesn't work and shows stale progress
 */

import spotifyAuth from './spotifyAuth.js';

class ProductionPlaybackFix {
  constructor() {
    this.lastKnownState = null;
    this.forceRefreshInterval = null;
    this.isFixing = false;
  }

  /**
   * Nuclear option: Force complete playback state reset
   */
  async forcePlaybackReset(deviceId, trackUri) {
    if (this.isFixing) {
      console.log('[ProductionFix] Already fixing, skipping duplicate call');
      return false;
    }

    this.isFixing = true;
    console.log('[ProductionFix] Starting nuclear playback reset...');

    try {
      // Step 1: Get all devices and find target
      const devices = await spotifyAuth.getDevices();
      const targetDevice = devices.find(d => d.id === deviceId) || devices.find(d => d.is_active) || devices[0];
      
      if (!targetDevice) {
        throw new Error('No devices available');
      }

      console.log('[ProductionFix] Target device:', targetDevice.name, targetDevice.id);

      // Step 2: Force pause ALL devices
      console.log('[ProductionFix] Force pausing all devices...');
      await this.pauseAllDevices(devices);
      await this.sleep(1000);

      // Step 3: Clear any cached state
      console.log('[ProductionFix] Clearing cached state...');
      this.lastKnownState = null;
      
      // Step 4: Force transfer to target device
      console.log('[ProductionFix] Force transferring to target device...');
      await spotifyAuth.transferPlayback(targetDevice.id, false);
      await this.sleep(1000);

      // Step 5: Verify device is active
      const devicesAfterTransfer = await spotifyAuth.getDevices();
      const activeDevice = devicesAfterTransfer.find(d => d.is_active);
      console.log('[ProductionFix] Active device after transfer:', activeDevice?.name, activeDevice?.id);

      // Step 6: Force start playback with multiple attempts
      console.log('[ProductionFix] Force starting playback...');
      const success = await this.forceStartPlayback(targetDevice.id, trackUri);
      
      if (success) {
        console.log('[ProductionFix] Nuclear reset successful!');
        // Start monitoring for state issues
        this.startStateMonitoring();
        return true;
      } else {
        throw new Error('Failed to start playback after reset');
      }

    } catch (error) {
      console.error('[ProductionFix] Nuclear reset failed:', error);
      return false;
    } finally {
      this.isFixing = false;
    }
  }

  /**
   * Pause all available devices
   */
  async pauseAllDevices(devices) {
    const pausePromises = devices.map(async (device) => {
      try {
        console.log('[ProductionFix] Pausing device:', device.name);
        await spotifyAuth.pausePlayback(device.id);
      } catch (error) {
        console.warn('[ProductionFix] Failed to pause device:', device.name, error.message);
      }
    });

    await Promise.allSettled(pausePromises);
  }

  /**
   * Force start playback with multiple strategies
   */
  async forceStartPlayback(deviceId, trackUri) {
    const strategies = [
      // Strategy 1: Device-specific play
      async () => {
        console.log('[ProductionFix] Strategy 1: Device-specific play');
        const url = `https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`;
        await spotifyAuth.makeSpotifyRequest(url, {
          method: 'PUT',
          body: JSON.stringify({
            uris: [trackUri],
            position_ms: 0
          })
        });
      },
      
      // Strategy 2: Active device play
      async () => {
        console.log('[ProductionFix] Strategy 2: Active device play');
        const url = `https://api.spotify.com/v1/me/player/play`;
        await spotifyAuth.makeSpotifyRequest(url, {
          method: 'PUT',
          body: JSON.stringify({
            uris: [trackUri],
            position_ms: 0
          })
        });
      },

      // Strategy 3: Transfer and play in one call
      async () => {
        console.log('[ProductionFix] Strategy 3: Transfer and play');
        await spotifyAuth.transferPlayback(deviceId, true);
        await this.sleep(500);
        const url = `https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`;
        await spotifyAuth.makeSpotifyRequest(url, {
          method: 'PUT',
          body: JSON.stringify({
            uris: [trackUri],
            position_ms: 0
          })
        });
      }
    ];

    for (let i = 0; i < strategies.length; i++) {
      try {
        await strategies[i]();
        await this.sleep(1000);
        
        // Verify playback started
        const state = await spotifyAuth.getPlaybackState();
        if (state && state.item && state.item.uri === trackUri && state.is_playing) {
          console.log('[ProductionFix] Strategy', i + 1, 'succeeded!');
          return true;
        } else {
          console.warn('[ProductionFix] Strategy', i + 1, 'failed verification:', {
            hasState: !!state,
            hasItem: !!state?.item,
            correctUri: state?.item?.uri === trackUri,
            isPlaying: state?.is_playing
          });
        }
      } catch (error) {
        console.warn('[ProductionFix] Strategy', i + 1, 'failed:', error.message);
      }
    }

    return false;
  }

  /**
   * Start monitoring playback state for issues
   */
  startStateMonitoring() {
    if (this.forceRefreshInterval) {
      clearInterval(this.forceRefreshInterval);
    }

    this.forceRefreshInterval = setInterval(async () => {
      try {
        const state = await spotifyAuth.getPlaybackState();
        
        // Check for stale state (same progress for too long)
        if (state && this.lastKnownState) {
          const progressDiff = Math.abs(state.progress_ms - this.lastKnownState.progress_ms);
          const timeDiff = Date.now() - this.lastKnownState.timestamp;
          
          // If progress hasn't changed in 5 seconds but should be playing
          if (state.is_playing && progressDiff < 1000 && timeDiff > 5000) {
            console.warn('[ProductionFix] Detected stale playback state, forcing refresh...');
            await this.forceRefreshPlayback();
          }
        }

        this.lastKnownState = {
          ...state,
          timestamp: Date.now()
        };
      } catch (error) {
        console.warn('[ProductionFix] State monitoring error:', error);
      }
    }, 2000);

    // Stop monitoring after 30 seconds
    setTimeout(() => {
      if (this.forceRefreshInterval) {
        clearInterval(this.forceRefreshInterval);
        this.forceRefreshInterval = null;
      }
    }, 30000);
  }

  /**
   * Force refresh playback when stale state detected
   */
  async forceRefreshPlayback() {
    try {
      // Get current state
      const state = await spotifyAuth.getPlaybackState();
      if (!state || !state.item) return;

      // Pause and resume to force refresh
      await spotifyAuth.pausePlayback();
      await this.sleep(500);
      await spotifyAuth.resumePlayback();
      
      console.log('[ProductionFix] Forced playback refresh');
    } catch (error) {
      console.error('[ProductionFix] Force refresh failed:', error);
    }
  }

  /**
   * Check if we need to apply production fixes
   */
  async shouldApplyFix() {
    try {
      const state = await spotifyAuth.getPlaybackState();
      
      // Apply fix if:
      // 1. No active playback state
      // 2. Has item but not playing (stuck state)
      // 3. Progress seems stale (> 30 seconds without being explicitly set)
      // 4. Empty curated database scenario (no songs available)
      
      if (!state) {
        console.log('[ProductionFix] No playback state - fix needed');
        return true;
      }

      if (state.item && !state.is_playing && state.progress_ms > 30000) {
        console.log('[ProductionFix] Stale paused state detected - fix needed');
        return true;
      }

      // Check for empty song database scenario
      if (!state.item && window.location.pathname.includes('/game')) {
        console.log('[ProductionFix] No song item in game context - possible empty database');
        return true;
      }

      return false;
    } catch (error) {
      console.warn('[ProductionFix] Error checking if fix needed:', error);
      return true; // Apply fix on error to be safe
    }
  }

  /**
   * Handle empty curated database scenario
   */
  async handleEmptyDatabase() {
    console.log('[ProductionFix] Handling empty curated database scenario');
    
    try {
      // Check if we're in a game context
      if (!window.location.pathname.includes('/game')) {
        return false;
      }

      // Show user-friendly error message
      const errorMessage = 'No songs available for playback. The song database may be empty or still loading.';
      
      // Try to notify the user through existing error handling mechanisms
      if (window.beatablyPlayback && window.beatablyPlayback.showError) {
        window.beatablyPlayback.showError(errorMessage);
      } else {
        console.error('[ProductionFix] Empty database:', errorMessage);
      }

      return true;
    } catch (error) {
      console.error('[ProductionFix] Error handling empty database:', error);
      return false;
    }
  }

  /**
   * Utility sleep function
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Cleanup monitoring
   */
  cleanup() {
    if (this.forceRefreshInterval) {
      clearInterval(this.forceRefreshInterval);
      this.forceRefreshInterval = null;
    }
  }
}

// Export singleton instance
const productionPlaybackFix = new ProductionPlaybackFix();
export default productionPlaybackFix;
