// Spotify authentication and token management utilities

import { API_BASE_URL } from '../config';

class SpotifyAuthManager {
  constructor() {
    this.tokenValidationCache = new Map();
    this.retryAttempts = new Map();
    this.maxRetries = 3;
  }

  // Get current access token
  getToken() {
    return localStorage.getItem('access_token');
  }

  // Clear expired token
  clearToken() {
    localStorage.removeItem('access_token');
    this.tokenValidationCache.clear();
  }

  // Validate token with caching to avoid excessive API calls
  async validateToken(token = null) {
    const accessToken = token || this.getToken();
    if (!accessToken) {
      console.log('[SpotifyAuth] No token available');
      return false;
    }

    // Check cache first (valid for 5 minutes)
    const cacheKey = accessToken.substring(0, 20); // Use token prefix as key
    const cached = this.tokenValidationCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < 5 * 60 * 1000) {
      console.log('[SpotifyAuth] Using cached token validation:', cached.valid);
      return cached.valid;
    }

    try {
      console.log('[SpotifyAuth] Validating token with Spotify API...');
      const response = await fetch('https://api.spotify.com/v1/me', {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });

      const isValid = response.ok;
      
      // Cache the result
      this.tokenValidationCache.set(cacheKey, {
        valid: isValid,
        timestamp: Date.now()
      });

      if (!isValid) {
        console.log('[SpotifyAuth] Token validation failed:', response.status);
        if (response.status === 401) {
          this.clearToken();
        }
      } else {
        console.log('[SpotifyAuth] Token validation successful');
      }

      return isValid;
    } catch (error) {
      console.error('[SpotifyAuth] Error validating token:', error);
      // On network error, assume token might be valid to avoid unnecessary re-auth
      return true;
    }
  }

  // Check if token is expired and handle re-authentication
  async ensureValidToken() {
    const token = this.getToken();
    if (!token) {
      console.log('[SpotifyAuth] No token found, authentication required');
      return { valid: false, requiresAuth: true };
    }

    const isValid = await this.validateToken(token);
    if (!isValid) {
      console.log('[SpotifyAuth] Token invalid, authentication required');
      return { valid: false, requiresAuth: true };
    }

    return { valid: true, requiresAuth: false };
  }

  // Initiate re-authentication flow
  initiateReauth(gameState = null) {
    console.log('[SpotifyAuth] Initiating re-authentication');
    
    // Save current game state if provided
    if (gameState) {
      localStorage.setItem('game_state_backup', JSON.stringify({
        ...gameState,
        timestamp: Date.now()
      }));
      localStorage.setItem('pending_reauth', 'true');
    }
    
    // Redirect to Spotify login
    window.location.href = `${API_BASE_URL}/login`;
  }

  // Make authenticated Spotify API request with automatic retry
  async makeSpotifyRequest(url, options = {}) {
    const token = this.getToken();
    if (!token) {
      throw new Error('No Spotify token available');
    }

    const requestOptions = {
      ...options,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...options.headers
      }
    };

    const retryKey = `${options.method || 'GET'}_${url}`;
    const currentRetries = this.retryAttempts.get(retryKey) || 0;

    try {
      console.log(`[SpotifyAuth] Making Spotify API request: ${url}`);
      const response = await fetch(url, requestOptions);

      if (response.status === 401) {
        console.log('[SpotifyAuth] 401 error, token expired');
        this.clearToken();
        throw new Error('Token expired');
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      // Reset retry count on success
      this.retryAttempts.delete(retryKey);
      
      // Handle empty responses
      const text = await response.text();
      return text ? JSON.parse(text) : null;

    } catch (error) {
      console.error(`[SpotifyAuth] API request failed:`, error);

      // Retry logic for transient errors
      if (currentRetries < this.maxRetries && 
          (error.message.includes('fetch') || error.message.includes('network'))) {
        
        this.retryAttempts.set(retryKey, currentRetries + 1);
        console.log(`[SpotifyAuth] Retrying request (${currentRetries + 1}/${this.maxRetries})`);
        
        // Exponential backoff
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, currentRetries) * 1000));
        return this.makeSpotifyRequest(url, options);
      }

      this.retryAttempts.delete(retryKey);
      throw error;
    }
  }

  // Get current playback state with error handling
  async getPlaybackState(deviceId = null) {
    try {
      const url = deviceId 
        ? `https://api.spotify.com/v1/me/player?device_id=${deviceId}`
        : 'https://api.spotify.com/v1/me/player';
      
      return await this.makeSpotifyRequest(url);
    } catch (error) {
      console.log('[SpotifyAuth] Error getting playback state:', error.message);
      return null;
    }
  }

  // Start playback with error handling
  async startPlayback(deviceId, trackUri, positionMs = 0) {
    try {
      const url = `https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`;
      const body = {
        uris: [trackUri],
        position_ms: positionMs
      };

      await this.makeSpotifyRequest(url, {
        method: 'PUT',
        body: JSON.stringify(body)
      });

      console.log('[SpotifyAuth] Playback started successfully');
      return true;
    } catch (error) {
      console.error('[SpotifyAuth] Error starting playback:', error.message);
      return false;
    }
  }

  // Pause playback with error handling
  async pausePlayback(deviceId) {
    try {
      const url = `https://api.spotify.com/v1/me/player/pause?device_id=${deviceId}`;
      await this.makeSpotifyRequest(url, { method: 'PUT' });
      console.log('[SpotifyAuth] Playback paused successfully');
      return true;
    } catch (error) {
      console.error('[SpotifyAuth] Error pausing playback:', error.message);
      return false;
    }
  }

  // Resume playback with error handling
  async resumePlayback(deviceId) {
    try {
      const url = `https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`;
      await this.makeSpotifyRequest(url, { method: 'PUT' });
      console.log('[SpotifyAuth] Playback resumed successfully');
      return true;
    } catch (error) {
      console.error('[SpotifyAuth] Error resuming playback:', error.message);
      return false;
    }
  }

  // Seek to position with error handling
  async seekToPosition(deviceId, positionMs) {
    try {
      const url = `https://api.spotify.com/v1/me/player/seek?position_ms=${positionMs}&device_id=${deviceId}`;
      await this.makeSpotifyRequest(url, { method: 'PUT' });
      console.log('[SpotifyAuth] Seek successful');
      return true;
    } catch (error) {
      console.error('[SpotifyAuth] Error seeking:', error.message);
      return false;
    }
  }

  // Check if we have necessary scopes
  async checkScopes() {
    try {
      const token = this.getToken();
      if (!token) return false;

      // Try to access the player endpoint to check streaming scope
      const response = await fetch('https://api.spotify.com/v1/me/player', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      // 403 means we don't have the right scopes, 401 means token expired
      if (response.status === 403) {
        console.log('[SpotifyAuth] Insufficient scopes for playback');
        return false;
      }

      return response.status !== 401;
    } catch (error) {
      console.error('[SpotifyAuth] Error checking scopes:', error);
      return false;
    }
  }
}

// Create singleton instance
const spotifyAuth = new SpotifyAuthManager();

export default spotifyAuth;

// Export individual functions for convenience
export const {
  getToken,
  clearToken,
  validateToken,
  ensureValidToken,
  initiateReauth,
  makeSpotifyRequest,
  getPlaybackState,
  startPlayback,
  pausePlayback,
  resumePlayback,
  seekToPosition,
  checkScopes
} = spotifyAuth;
