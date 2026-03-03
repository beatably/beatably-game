# Playback Issues Analysis and Fixes

## Issues Identified

### 1. **Device Initialization Race Condition**
- `deviceAwarePlayback.initialize()` is called in SpotifyPlayer.jsx but App.jsx tries to use it before initialization
- The SDK device ID may not be properly set when autoplay attempts occur

### 2. **URI Format Inconsistency**
- Curated songs use `spotifyUri` field but App.jsx expects `uri` field
- This causes undefined/null URIs to be passed to playback functions

### 3. **Autoplay Logic Conflicts**
- Multiple autoplay triggers in App.jsx can conflict with each other
- The `lastPlayedUriRef` tracking may not work correctly with curated songs

### 4. **Device Selection Override**
- SpotifyPlayer.jsx may override user-selected devices with SDK device
- Device switching logic doesn't properly handle curated song URIs

### 5. **Position Reset Bug**
- The "~30s start bug" fix may be too aggressive and cause audio cutoff
- Position reset logic conflicts with Spotify's internal buffering

### 6. **Error Handling Gaps**
- Missing validation for curated song URI format
- No fallback when deviceAwarePlayback is not initialized

## Fixes Applied

### Fix 1: URI Field Mapping
- Ensure curated songs map `spotifyUri` to `uri` field consistently
- Add validation for URI format before playback attempts

### Fix 2: Device Initialization
- Add proper initialization checks before using deviceAwarePlayback
- Implement fallback to spotifyAuth when deviceAwarePlayback is not ready

### Fix 3: Autoplay Coordination
- Consolidate autoplay logic to prevent conflicts
- Improve URI change detection for curated songs

### Fix 4: Position Management
- Refine position reset logic to prevent audio cutoff
- Add better handling for Spotify's buffering behavior

### Fix 5: Error Recovery
- Add comprehensive error handling for playback failures
- Implement automatic retry logic for transient issues
