# Challenge System Crash Fix

## Issue Summary
Backend was crashing with `TypeError: Cannot read properties of undefined (reading 'splice')` when processing challenge card placements.

## Root Cause
The `challenge_place_card` handler was mixing **persistent IDs** (used for timeline keys) with **socket IDs** (used for Socket.IO operations), causing it to try to access undefined timeline entries.

### The Bug (Lines ~3050-3113)
```javascript
// WRONG: Converting persistent ID to socket ID for timeline access
const originalPersistentId = game.challenge.originalPlayerId;
const originalPlayerId = getSocketId(originalPersistentId); // ❌ Returns socket ID
const originalTimeline = game.timelines[originalPersistentId] || [];

// Later...
game.timelines[originalPlayerId].splice(...); // ❌ Crashes! originalPlayerId is a socket ID, but timelines are keyed by persistent IDs
```

## The Fix

### 1. Challenge Initialization (Line ~3050)
**Before:**
```javascript
const originalPlayerId = getSocketId(originalPersistentId); // Convert to socket ID
```

**After:**
```javascript
// Removed the conversion - use persistent ID directly for timeline access
```

### 2. Challenge Outcome Logic (Lines ~3080-3130)
**Before:**
```javascript
game.timelines[playerId].splice(...);  // playerId is socket ID
game.timelines[originalPlayerId].splice(...);  // originalPlayerId is socket ID
```

**After:**
```javascript
game.timelines[challengerPersistentId].splice(...);  // Use persistent ID
game.timelines[originalPersistentId].splice(...);  // Use persistent ID
```

## Key Changes Made

### In `challenge_place_card` handler:
1. **Line ~3051**: Removed `getSocketId()` conversion - keep `originalPersistentId` as persistent ID
2. **Lines ~3080-3130**: Updated all timeline access to use persistent IDs:
   - `challengerPersistentId` instead of `playerId` (socket ID)
   - `originalPersistentId` instead of `originalPlayerId` (socket ID)

## Architecture Reminder

```
┌─────────────────┬──────────────────────┬─────────────────────┐
│ Purpose         │ Use Persistent ID    │ Use Socket ID       │
├─────────────────┼──────────────────────┼─────────────────────┤
│ Timeline Access │ ✅ Always            │ ❌ Never            │
│ Player Order    │ ✅ Always            │ ❌ Never            │
│ Game Logic      │ ✅ Always            │ ❌ Never            │
│ Socket.IO Emit  │ ❌ Never            │ ✅ Always           │
│ Broadcasts      │ ❌ Never            │ ✅ Always           │
└─────────────────┴──────────────────────┴─────────────────────┘
```

## Testing
After this fix:
1. Challenger can place card during challenge phase
2. Challenge outcome is correctly determined
3. Timelines are properly updated based on who was correct
4. No crashes occur during challenge resolution
5. Game continues normally after challenge

## Related Files
- `backend/index.js` - Challenge handlers fixed
- `PERSISTENT_ID_IMPLEMENTATION_COMPLETE.md` - Full persistent ID system documentation

## Date Fixed
2025-01-15
