/**
 * PlayerSync - Centralized Spotify playback synchronization layer
 * 
 * Handles the complexity of managing playback state across:
 * - Web Playback SDK (for web device)
 * - Spotify Web API (for remote devices)
 * - Device switching and transfers
 * - Autoplay restrictions (iOS Safari)
 */

// Spotify Web Playback SDK type definitions
declare global {
  interface Window {
    Spotify: {
      Player: new (options: {
        name: string;
        getOAuthToken: (cb: (token: string) => void) => void;
        volume?: number;
      }) => SpotifyPlayer;
    };
    webkitAudioContext?: typeof AudioContext;
  }
}

interface SpotifyPlayer {
  addListener(event: string, callback: (data: any) => void): void;
  removeListener(event: string, callback?: (data: any) => void): void;
  connect(): Promise<boolean>;
  disconnect(): void;
  getCurrentState(): Promise<SpotifyPlayerState | null>;
  setName(name: string): Promise<void>;
  getVolume(): Promise<number>;
  setVolume(volume: number): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  togglePlay(): Promise<void>;
  seek(position_ms: number): Promise<void>;
  previousTrack(): Promise<void>;
  nextTrack(): Promise<void>;
  activateElement?(): Promise<void>;
}

interface SpotifyPlayerState {
  context: {
    uri: string;
    metadata: any;
  };
  disallows: {
    pausing: boolean;
    peeking_next: boolean;
    peeking_prev: boolean;
    resuming: boolean;
    seeking: boolean;
    skipping_next: boolean;
    skipping_prev: boolean;
  };
  paused: boolean;
  position: number;
  repeat_mode: number;
  shuffle: boolean;
  track_window: {
    current_track: SpotifyTrack;
    next_tracks: SpotifyTrack[];
    previous_tracks: SpotifyTrack[];
  };
}

interface SpotifyTrack {
  uri: string;
  id: string;
  type: string;
  media_type: string;
  name: string;
  is_playable: boolean;
  album: {
    uri: string;
    name: string;
    images: Array<{ url: string }>;
  };
  artists: Array<{
    uri: string;
    name: string;
  }>;
}

interface SpotifyDeviceReadyEvent {
  device_id: string;
}

export interface PlayerSyncOpts {
  getAccessToken: () => Promise<string> | string;
  fetchJson: (method: string, path: string, body?: any) => Promise<any>;
  pollMsVisible?: number;   // default 1500
  pollMsHidden?: number;    // default 5000
}

export interface PlayerSyncState {
  activeDeviceId?: string;
  isWebDeviceActive: boolean;
  isPlaying: boolean | null; // null = unknown/idle
  lastSource: 'sdk' | 'remote' | 'unknown';
}

type StateChangeCallback = (state: PlayerSyncState) => void;

export class PlayerSync {
  private player: SpotifyPlayer;
  private opts: PlayerSyncOpts;
  private state: PlayerSyncState;
  private callbacks: Set<StateChangeCallback> = new Set();
  private commandMutex: Promise<void> = Promise.resolve();
  private pollTimer: NodeJS.Timeout | null = null;
  private autoplayGuardActivated = false;
  private expectedState: Partial<PlayerSyncState> = {};
  private intendedActiveDevice: string | undefined = undefined;
  private preventAutoTransfer = false;

  constructor(player: Spotify.Player, opts: PlayerSyncOpts) {
    this.player = player;
    this.opts = {
      pollMsVisible: 1500,
      pollMsHidden: 5000,
      ...opts
    };
    
    this.state = {
      isWebDeviceActive: false,
      isPlaying: null,
      lastSource: 'unknown'
    };

    this.initializeSDKListeners();
    this.initializeVisibilityHandling();
    this.startPolling();
  }

  /**
   * Subscribe to state changes
   */
  onChange(callback: StateChangeCallback): () => void {
    this.callbacks.add(callback);
    
    // Immediately call with current state
    callback(this.state);
    
    // Return unsubscribe function
    return () => {
      this.callbacks.delete(callback);
    };
  }

  /**
   * Set desired playing state (idempotent)
   */
  async setPlaying(target: boolean): Promise<void> {
    return this.executeCommand(async () => {
      console.log('[PlayerSync] setPlaying:', target);
      
      if (this.state.isPlaying === target) {
        console.log('[PlayerSync] Already in desired state, skipping');
        return;
      }

      // Check autoplay guard for iOS Safari
      if (target && !this.autoplayGuardActivated) {
        console.log('[PlayerSync] Autoplay blocked - guard not activated');
        this.updateState({ ...this.state, isPlaying: null });
        return;
      }

      this.expectedState.isPlaying = target;

      if (this.state.isWebDeviceActive) {
        // Use SDK for web device
        if (target) {
          await this.player.resume();
        } else {
          await this.player.pause();
        }
      } else {
        // Use Web API for remote device
        const endpoint = target ? '/me/player/play' : '/me/player/pause';
        const method = 'PUT';
        
        try {
          await this.opts.fetchJson(method, endpoint);
        } catch (error: any) {
          if (error.status === 404) {
            console.log('[PlayerSync] No active device for playback command');
            this.updateState({ ...this.state, isPlaying: null });
            return;
          }
          throw error;
        }
      }
    });
  }

  /**
   * Toggle play/pause state
   */
  async toggle(): Promise<void> {
    const currentPlaying = this.state.isPlaying;
    if (currentPlaying === null) {
      // If state is unknown, default to play
      await this.setPlaying(true);
    } else {
      await this.setPlaying(!currentPlaying);
    }
  }

  /**
   * Transfer playback to specific device and optionally set play state
   */
  async transferTo(deviceId: string, desiredPlaying?: boolean): Promise<void> {
    return this.executeCommand(async () => {
      console.log('[PlayerSync] transferTo:', deviceId, 'play:', desiredPlaying);
      
      // CRITICAL: Set intended device to prevent auto-fallback
      this.intendedActiveDevice = deviceId;
      this.preventAutoTransfer = true;
      
      this.expectedState.activeDeviceId = deviceId;
      if (desiredPlaying !== undefined) {
        this.expectedState.isPlaying = desiredPlaying;
      }

      // Transfer playback
      const transferBody = {
        device_ids: [deviceId],
        play: desiredPlaying ?? false
      };

      await this.opts.fetchJson('PUT', '/me/player', transferBody);

      // Wait for transfer to complete and verify
      await this.waitForTransferCompletion(deviceId, desiredPlaying);
      
      // ENHANCED: Keep protection active until user explicitly switches back
      // Only clear protection if switching back to web device
      const webDeviceId = this.state.activeDeviceId;
      if (deviceId === webDeviceId) {
        // Switching back to web device - clear protection
        setTimeout(() => {
          this.preventAutoTransfer = false;
          this.intendedActiveDevice = undefined;
        }, 2000);
      } else {
        // Switching to external device - keep protection indefinitely
        console.log('[PlayerSync] External device transfer - maintaining protection indefinitely');
      }
    });
  }

  /**
   * Force refresh state from remote
   */
  async refresh(): Promise<void> {
    console.log('[PlayerSync] Refreshing state from remote');
    await this.pollRemoteState();
  }

  /**
   * Activate autoplay guard (call in user gesture)
   */
  async activateAutoplayGuard(): Promise<void> {
    console.log('[PlayerSync] Activating autoplay guard');
    
    try {
      // Try to activate the player element for iOS Safari
      if (this.player.activateElement) {
        await this.player.activateElement();
      }
      
      // Create a brief audio context to satisfy browser requirements
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContext) {
        const ctx = new AudioContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        gain.gain.value = 0;
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.05);
      }
      
      this.autoplayGuardActivated = true;
      console.log('[PlayerSync] Autoplay guard activated successfully');
    } catch (error) {
      console.warn('[PlayerSync] Failed to activate autoplay guard:', error);
    }
  }

  /**
   * Force sync current game song to active device (fixes sync issues)
   */
  async syncCurrentSong(uri: string, position_ms: number = 0): Promise<void> {
    return this.executeCommand(async () => {
      console.log('[PlayerSync] Syncing current song:', uri, 'at position:', position_ms);
      
      try {
        // Start playback of the specific song at the specified position
        const playBody = {
          uris: [uri],
          position_ms: position_ms
        };
        
        await this.opts.fetchJson('PUT', '/me/player/play', playBody);
        console.log('[PlayerSync] Successfully synced current song');
      } catch (error: any) {
        if (error.status === 404) {
          console.log('[PlayerSync] No active device for sync command');
          this.updateState({ ...this.state, isPlaying: null });
          return;
        }
        throw error;
      }
    });
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
    this.callbacks.clear();
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
  }

  // Private methods

  private initializeSDKListeners(): void {
    this.player.addListener('ready', (data: SpotifyDeviceReadyEvent) => {
      console.log('[PlayerSync] SDK ready:', data.device_id);
      
      // Only update to web device if we don't have an intended remote device
      if (!this.intendedActiveDevice || this.intendedActiveDevice === data.device_id) {
        this.updateState({
          ...this.state,
          activeDeviceId: data.device_id,
          isWebDeviceActive: true,
          lastSource: 'sdk'
        });
      } else {
        console.log('[PlayerSync] SDK ready but intended device is:', this.intendedActiveDevice, '- not switching');
      }
    });

    this.player.addListener('not_ready', (data: SpotifyDeviceReadyEvent) => {
      console.log('[PlayerSync] SDK not ready:', data.device_id);
      
      // Only update if this was the active web device
      if (this.state.isWebDeviceActive && this.state.activeDeviceId === data.device_id) {
        this.updateState({
          ...this.state,
          isWebDeviceActive: false,
          lastSource: 'unknown'
        });
      }
    });

    this.player.addListener('player_state_changed', (state: SpotifyPlayerState | null) => {
      if (!state) return;
      
      // CRITICAL: Only update if web device is active AND we're not preventing auto-transfer
      if (this.state.isWebDeviceActive && !this.preventAutoTransfer) {
        this.updateState({
          ...this.state,
          isPlaying: !state.paused,
          lastSource: 'sdk'
        });
      } else if (this.preventAutoTransfer) {
        console.log('[PlayerSync] Ignoring SDK state change - auto-transfer prevention active');
      }
    });
  }

  private initializeVisibilityHandling(): void {
    this.handleVisibilityChange = this.handleVisibilityChange.bind(this);
    document.addEventListener('visibilitychange', this.handleVisibilityChange);
  }

  private handleVisibilityChange = (): void => {
    // Restart polling with new interval based on visibility
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
    }
    this.startPolling();
  };

  private startPolling(): void {
    const pollInterval = document.visibilityState === 'visible' 
      ? this.opts.pollMsVisible!
      : this.opts.pollMsHidden!;
      
    this.pollTimer = setTimeout(async () => {
      if (!this.state.isWebDeviceActive) {
        await this.pollRemoteState();
      }
      this.startPolling();
    }, pollInterval);
  }

  private async pollRemoteState(): Promise<void> {
    try {
      const remoteState = await this.fetchRemoteState();
      if (remoteState) {
        this.updateState({
          ...this.state,
          activeDeviceId: remoteState.device?.id,
          isPlaying: remoteState.is_playing,
          isWebDeviceActive: false,
          lastSource: 'remote'
        });
      }
    } catch (error) {
      console.warn('[PlayerSync] Failed to poll remote state:', error);
    }
  }

  private async fetchRemoteState(): Promise<any> {
    try {
      const response = await this.opts.fetchJson('GET', '/me/player');
      return response;
    } catch (error: any) {
      if (error.status === 204) {
        // No active device / idle state
        return null;
      }
      throw error;
    }
  }

  private async executeCommand<T>(command: () => Promise<T>): Promise<T> {
    // Wait for any in-flight command to complete
    await this.commandMutex;
    
    // Create new mutex promise
    let resolve: () => void;
    this.commandMutex = new Promise(r => resolve = r);
    
    try {
      const result = await command();
      await this.reconcileState();
      return result;
    } finally {
      resolve!();
    }
  }

  private async reconcileState(): Promise<void> {
    // Give the command time to take effect
    await this.delay(200);
    
    const remoteState = await this.fetchRemoteState();
    
    if (this.stateMatches(remoteState, this.expectedState)) {
      this.updateStateFromRemote(remoteState);
    } else {
      // Single retry with jitter
      await this.delay(100 + Math.random() * 200);
      const retryState = await this.fetchRemoteState();
      
      if (this.stateMatches(retryState, this.expectedState)) {
        this.updateStateFromRemote(retryState);
      } else {
        // Surface unknown/idle state rather than guessing
        console.warn('[PlayerSync] State reconciliation failed, marking as unknown');
        this.updateState({
          ...this.state,
          isPlaying: null,
          lastSource: 'unknown'
        });
      }
    }
    
    // Clear expected state
    this.expectedState = {};
  }

  private stateMatches(remoteState: any, expectedState: Partial<PlayerSyncState>): boolean {
    if (!remoteState && expectedState.isPlaying !== null) {
      return false; // Expected playback but got idle state
    }
    
    if (expectedState.isPlaying !== undefined) {
      if (remoteState?.is_playing !== expectedState.isPlaying) {
        return false;
      }
    }
    
    if (expectedState.activeDeviceId !== undefined) {
      if (remoteState?.device?.id !== expectedState.activeDeviceId) {
        return false;
      }
    }
    
    return true;
  }

  private updateStateFromRemote(remoteState: any): void {
    if (!remoteState) {
      this.updateState({
        ...this.state,
        isPlaying: null,
        activeDeviceId: undefined,
        isWebDeviceActive: false,
        lastSource: 'remote'
      });
    } else {
      this.updateState({
        ...this.state,
        isPlaying: remoteState.is_playing,
        activeDeviceId: remoteState.device?.id,
        isWebDeviceActive: false,
        lastSource: 'remote'
      });
    }
  }

  private updateState(newState: PlayerSyncState): void {
    const changed = JSON.stringify(this.state) !== JSON.stringify(newState);
    this.state = newState;
    
    if (changed) {
      console.log('[PlayerSync] State updated:', this.state);
      this.callbacks.forEach(callback => callback(this.state));
    }
  }

  private async waitForTransferCompletion(deviceId: string, desiredPlaying?: boolean): Promise<void> {
    const maxAttempts = 10;
    const delayMs = 300;
    
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      await this.delay(delayMs);
      
      const state = await this.fetchRemoteState();
      if (state?.device?.id === deviceId) {
        if (desiredPlaying === undefined || state.is_playing === desiredPlaying) {
          console.log('[PlayerSync] Transfer completed successfully');
          return;
        }
      }
    }
    
    throw new Error(`Transfer to device ${deviceId} did not complete within timeout`);
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
