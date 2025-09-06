/**
 * Device-aware playback controller that handles playback using the appropriate method
 * based on the device type (Web Playback SDK vs Web API)
 */

import spotifyAuth from './spotifyAuth.js';

class DeviceAwarePlayback {
  constructor() {
    this.sdkPlayer = null;
    this.sdkDeviceId = null;
    this.currentDevice = null;
    this.isInitialized = false;
  }

  /**
   * Initialize with SDK player and device ID
   */
  initialize(sdkPlayer, deviceId) {
    this.sdkPlayer = sdkPlayer;
    this.sdkDeviceId = deviceId;
    this.isInitialized = true;
    console.log('DeviceAwarePlayback initialized with SDK player:', deviceId);
  }

  /**
   * Determine if a device is the Web Playback SDK device
   */
  isSDKDevice(deviceId) {
    return deviceId === this.sdkDeviceId;
  }

  /**
   * Start playback on the specified device
   */
  async startPlayback(deviceId, uris, positionMs = 0) {
    try {
      if (this.isSDKDevice(deviceId) && this.sdkPlayer) {
        // Use SDK for Web Playback SDK device
        console.log('Starting playback via SDK');
        
        // Transfer playback to SDK device first
        await this.transferPlayback(deviceId);
        
        // Start playback via Web API (SDK doesn't have direct play method)
        const url = `https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`;
        await spotifyAuth.makeSpotifyRequest(url, {
          method: 'PUT',
          body: JSON.stringify({
            uris: uris,
            position_ms: positionMs
          })
        });
      } else {
        // Use Web API for external devices
        console.log('Starting playback via Web API for external device');
        const url = `https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`;
        await spotifyAuth.makeSpotifyRequest(url, {
          method: 'PUT',
          body: JSON.stringify({
            uris: uris,
            position_ms: positionMs
          })
        });
      }
    } catch (error) {
      console.error('Error starting playback:', error);
      throw error;
    }
  }

  /**
   * Pause playback
   */
  async pausePlayback(deviceId) {
    try {
      if (this.isSDKDevice(deviceId) && this.sdkPlayer) {
        // Use SDK for Web Playback SDK device
        console.log('Pausing playback via SDK');
        await this.sdkPlayer.pause();
      } else {
        // Use Web API for external devices
        console.log('Pausing playback via Web API');
        return await spotifyAuth.pausePlayback(deviceId);
      }
    } catch (error) {
      console.error('Error pausing playback:', error);
      throw error;
    }
  }

  /**
   * Resume playback
   */
  async resumePlayback(deviceId) {
    try {
      if (this.isSDKDevice(deviceId) && this.sdkPlayer) {
        // Use SDK for Web Playback SDK device
        console.log('Resuming playback via SDK');
        await this.sdkPlayer.resume();
      } else {
        // Use Web API for external devices
        console.log('Resuming playback via Web API');
        return await spotifyAuth.resumePlayback(deviceId);
      }
    } catch (error) {
      console.error('Error resuming playback:', error);
      throw error;
    }
  }

  /**
   * Get current playback state
   */
  async getPlaybackState() {
    try {
      return await spotifyAuth.getPlaybackState();
    } catch (error) {
      console.error('Error getting playback state:', error);
      throw error;
    }
  }

  /**
   * Transfer playback to specified device
   */
  async transferPlayback(deviceId) {
    try {
      console.log('Transferring playback to device:', deviceId);
      return await spotifyAuth.transferPlayback(deviceId, false);
    } catch (error) {
      console.error('Error transferring playback:', error);
      throw error;
    }
  }

  /**
   * Seek to position (works for both SDK and Web API devices)
   */
  async seekToPosition(deviceId, positionMs) {
    try {
      console.log('Seeking to position:', positionMs);
      return await spotifyAuth.seekToPosition(deviceId, positionMs);
    } catch (error) {
      console.error('Error seeking to position:', error);
      throw error;
    }
  }

  /**
   * Set current device (used by SpotifyPlayer)
   */
  setCurrentDevice(deviceId) {
    this.currentDevice = deviceId;
    console.log('DeviceAwarePlayback current device set to:', deviceId);
  }

  /**
   * Check if a device is the Web Playback SDK device
   */
  isWebPlaybackDevice(deviceId) {
    return this.isSDKDevice(deviceId);
  }

  /**
   * Switch to a different device with optional track and play state
   */
  async switchDevice(deviceId, trackUri = null, shouldPlay = false) {
    try {
      console.log('Switching to device:', deviceId, 'with track:', trackUri, 'shouldPlay:', shouldPlay);
      
      // Transfer playback to the new device
      await this.transferPlayback(deviceId);
      
      // Update current device
      this.setCurrentDevice(deviceId);
      
      // If we have a track URI and should play, start playback
      if (trackUri && shouldPlay) {
        await this.startPlayback(deviceId, [trackUri], 0);
      } else if (shouldPlay) {
        // Just resume playback on the new device
        await this.resumePlayback(deviceId);
      }
      
      return true;
    } catch (error) {
      console.error('Error switching device:', error);
      throw error;
    }
  }

  /**
   * Recover from buffer issues (placeholder for future implementation)
   */
  async recoverFromBufferIssue() {
    try {
      console.log('Attempting to recover from buffer issue');
      
      // Get current playback state
      const state = await this.getPlaybackState();
      
      if (state && state.device && state.item) {
        // Try to restart playback from current position
        const position = state.progress_ms || 0;
        await this.startPlayback(state.device.id, [state.item.uri], position);
      }
      
      return true;
    } catch (error) {
      console.error('Error recovering from buffer issue:', error);
      return false;
    }
  }
}

// Export singleton instance
export const deviceAwarePlayback = new DeviceAwarePlayback();
export default deviceAwarePlayback;
