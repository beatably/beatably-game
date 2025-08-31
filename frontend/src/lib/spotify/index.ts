/**
 * Spotify integration utilities with PlayerSync v2 support
 */

import { PlayerSync, PlayerSyncOpts } from './PlayerSync';
import spotifyAuth from '../../utils/spotifyAuth';

// Spotify Web Playback SDK player interface
interface SpotifyPlayer {
  connect(): Promise<boolean>;
  disconnect(): void;
  getCurrentState(): Promise<any>;
  getVolume(): Promise<number>;
  nextTrack(): Promise<void>;
  pause(): Promise<void>;
  previousTrack(): Promise<void>;
  resume(): Promise<void>;
  seek(position_ms: number): Promise<void>;
  setName(name: string): Promise<void>;
  setVolume(volume: number): Promise<void>;
  togglePlay(): Promise<void>;
  addListener(event: string, callback: (data: any) => void): boolean;
  removeListener(event: string, callback?: (data: any) => void): boolean;
  activateElement?(): Promise<void>;
}

// Feature flag for PlayerSync v2
let SPOTIFY_SYNC_V2 = false;
try {
  // @ts-ignore - Vite environment variable access
  SPOTIFY_SYNC_V2 = import.meta.env.VITE_SPOTIFY_SYNC_V2 === 'true';
} catch (e) {
  // Fallback: disabled by default
  SPOTIFY_SYNC_V2 = false;
}

/**
 * Create PlayerSync instance with default configuration
 */
export function createPlayerSync(player: SpotifyPlayer): PlayerSync | null {
  if (!SPOTIFY_SYNC_V2) {
    console.log('[Spotify] PlayerSync v2 disabled via feature flag');
    return null;
  }

  const opts: PlayerSyncOpts = {
    getAccessToken: () => spotifyAuth.getToken() || '',
    fetchJson: async (method: string, path: string, body?: any) => {
      const baseUrl = 'https://api.spotify.com/v1';
      const url = `${baseUrl}${path}`;
      
      return spotifyAuth.makeSpotifyRequest(url, {
        method,
        body: body ? JSON.stringify(body) : undefined
      });
    },
    pollMsVisible: 1500,
    pollMsHidden: 5000
  };

  try {
    return new PlayerSync(player, opts);
  } catch (error) {
    console.error('[Spotify] Failed to create PlayerSync:', error);
    return null;
  }
}

/**
 * Check if PlayerSync v2 is enabled
 */
export function isPlayerSyncEnabled(): boolean {
  return SPOTIFY_SYNC_V2;
}

// Re-export types for convenience
export type { PlayerSync, PlayerSyncOpts, PlayerSyncState } from './PlayerSync';
