# PlayerSync - Spotify Playback Synchronization Layer

PlayerSync is a centralized solution for managing Spotify playback state across Web Playback SDK and Web API, designed to solve device switching and autoplay reliability issues.

## Features

- **Unified State Management**: Single source of truth for playback state across SDK and Web API
- **Device Transfer Reliability**: Proper state reconciliation after device switches
- **Autoplay Guard**: iOS Safari autoplay restriction handling
- **Command Serialization**: Prevents overlapping play/pause/transfer commands
- **Polling for Remote Devices**: Visibility-aware polling when non-web devices are active
- **Error Recovery**: Retry logic and clear unknown/idle state handling

## Usage

### Enabling PlayerSync v2

Set the environment variable to enable the new sync layer:

```bash
VITE_SPOTIFY_SYNC_V2=true
```

### Basic Integration

```javascript
import { createPlayerSync, isPlayerSyncEnabled } from './lib/spotify';

// Check if enabled
if (isPlayerSyncEnabled()) {
  // Create PlayerSync instance
  const playerSync = createPlayerSync(spotifyPlayer);
  
  // Subscribe to state changes
  const unsubscribe = playerSync.onChange((state) => {
    console.log('Playback state:', state);
    // Update UI based on state.isPlaying, state.activeDeviceId, etc.
  });
  
  // Control playback
  await playerSync.setPlaying(true);
  await playerSync.toggle();
  await playerSync.transferTo(deviceId, shouldPlay);
  
  // Activate autoplay guard (call in user gesture)
  await playerSync.activateAutoplayGuard();
  
  // Cleanup
  unsubscribe();
  playerSync.destroy();
}
```

### State Object

```typescript
interface PlayerSyncState {
  activeDeviceId?: string;           // Current active device ID
  isWebDeviceActive: boolean;        // True if web SDK device is active
  isPlaying: boolean | null;         // null = unknown/idle state
  lastSource: 'sdk' | 'remote' | 'unknown'; // Source of last state update
}
```

### Methods

- `setPlaying(target: boolean)` - Set desired playing state (idempotent)
- `toggle()` - Toggle play/pause state
- `transferTo(deviceId, desiredPlaying?)` - Transfer to device with optional play state
- `refresh()` - Force refresh state from remote
- `activateAutoplayGuard()` - Enable autoplay (call in user gesture)

## Architecture

### Two Sources of Truth

1. **Web SDK Device Active**: Derive state from SDK events (`player_state_changed`)
2. **Remote Device Active**: Poll `/me/player` endpoint with visibility-aware intervals

### Command Serialization

All commands go through an async mutex to prevent overlapping operations:

```typescript
private async executeCommand<T>(command: () => Promise<T>): Promise<T> {
  await this.commandMutex;
  // Execute command and reconcile state
}
```

### State Reconciliation

After each command:
1. Wait for command to take effect (200ms)
2. Fetch remote state and compare with expected
3. Retry once with jitter if mismatch
4. Surface unknown/idle state rather than guessing

### Polling Strategy

- **Visible**: 1.5s intervals
- **Hidden**: 5s intervals
- **Only when remote device active** (not web SDK)

## Migration from Legacy Code

### Before (Scattered Logic)
```javascript
// Multiple useEffects handling autoplay
useEffect(() => {
  if (isPlaying && currentCard?.uri) {
    // Complex autoplay logic...
  }
}, [isPlaying, currentCard]);

// Direct SDK calls
player.resume();
player.pause();

// Manual device transfers
await spotifyAuth.transferPlayback(deviceId);
```

### After (PlayerSync)
```javascript
// Single effect for autoplay
useEffect(() => {
  if (playerSync && isPlaying) {
    playerSync.setPlaying(true);
  }
}, [isPlaying, playerSync]);

// Unified controls
await playerSync.toggle();
await playerSync.transferTo(deviceId, shouldPlay);
```

## Error Handling

- **HTTP 204**: Treated as idle/unknown state, not error
- **Token Expiration**: Handled by underlying spotifyAuth layer
- **Transfer Failures**: Clear error messages with retry suggestions
- **State Mismatches**: Single retry with jitter, then surface unknown state

## Testing

Enable PlayerSync v2 and test these scenarios:

1. **Device Switching**: Transfer between web player and mobile app
2. **Autoplay**: Ensure works after calling `activateAutoplayGuard()`
3. **State Sync**: Play/pause on remote device, verify UI updates
4. **Error Recovery**: Test with expired tokens, offline devices
5. **Visibility Changes**: Verify polling intervals adjust correctly

## Rollback

If issues arise, disable the feature flag:

```bash
VITE_SPOTIFY_SYNC_V2=false
```

The system will fall back to legacy behavior automatically.
