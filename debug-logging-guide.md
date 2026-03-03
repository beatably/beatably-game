# Debug Logging System Guide

## Overview

A comprehensive logging system has been implemented to capture frontend client logs and make them available via backend REST API endpoints. This is particularly useful for debugging issues in production or when multiple browser windows are involved.

## Architecture

### Frontend (`frontend/src/utils/debugLogger.js`)

The frontend logging system:
- Intercepts all `console.log`, `console.warn`, and `console.error` calls
- Attaches player context (name, ID, room code, etc.) to each log entry
- Sends logs to the backend via POST requests
- Stores logs in memory with a 1000-entry limit (FIFO)

### Backend (`backend/index.js`)

The backend provides REST endpoints:
- `POST /api/debug/log` - Receives log entries from frontend
- `GET /api/debug/frontend-logs` - Retrieves all logs
- `GET /api/debug/frontend-logs?playerName=Alice` - Filter by player name
- `GET /api/debug/frontend-logs?roomCode=1234` - Filter by room code
- `DELETE /api/debug/frontend-logs` - Clear all logs

## Setup

### 1. Initialize Debug Logger (Frontend)

In your main App component:

```javascript
import { debugLog } from './utils/debugLogger';

function App() {
  useEffect(() => {
    // Initialize with player context
    debugLog.updatePlayerInfo({
      playerName: name,
      playerId: socket?.id,
      roomCode: code,
      isCreator: isCreator,
      view: view
    });
  }, [name, socket?.id, code, isCreator, view]);
  
  return <div>...</div>;
}
```

### 2. Use Console Normally

No changes needed! Just use console methods as usual:

```javascript
console.log('[GameFooter] Challenge UI check:', { challengerId, myPlayerId });
console.warn('Potential issue detected');
console.error('Error occurred:', error);
```

## Retrieving Logs

### View All Logs

```bash
curl http://localhost:3001/api/debug/frontend-logs
```

### Filter by Player

```bash
curl "http://localhost:3001/api/debug/frontend-logs?playerName=Alice"
```

### Filter by Room

```bash
curl "http://localhost:3001/api/debug/frontend-logs?roomCode=4799"
```

### Clear Logs

```bash
curl -X DELETE http://localhost:3001/api/debug/frontend-logs
```

## Log Entry Format

Each log entry includes:

```json
{
  "timestamp": "2025-10-15T18:41:40.863Z",
  "level": "log",
  "message": "[GameFooter] Challenge UI check:",
  "playerInfo": {
    "playerName": "Bob",
    "playerId": "_1vu_XzY-yqJq3cDAAAB",
    "roomCode": "4799",
    "isCreator": false,
    "view": "game"
  },
  "data": [
    {
      "challengerId": "_1vu_XzY-yqJq3cDAAAB",
      "myPlayerId": "_1vu_XzY-yqJq3cDAAAB",
      "isMe": true
    }
  ],
  "receivedAt": "2025-10-15T18:41:40.900Z"
}
```

## Use Cases

### 1. Debugging Reconnection Issues

```bash
# Get logs from a specific player's reconnection
curl "http://localhost:3001/api/debug/frontend-logs?playerName=Alice" | \
  jq '.logs[] | select(.message | contains("reconnect"))'
```

### 2. Analyzing Challenge Flow

```bash
# Get challenge-related logs
curl http://localhost:3001/api/debug/frontend-logs | \
  jq '.logs[] | select(.message | contains("Challenge"))'
```

### 3. Tracking Player State Changes

```bash
# Monitor session saves
curl http://localhost:3001/api/debug/frontend-logs | \
  jq '.logs[] | select(.message | contains("Session saved"))'
```

## Production Considerations

### Security

- **Important**: This debug system exposes player information. In production:
  - Add authentication to the debug endpoints
  - Consider removing or disabling in production builds
  - Or restrict access by IP/authentication

### Performance

- Logs are stored in memory (max 1000 entries)
- Old logs are automatically removed (FIFO)
- Each POST request is async and non-blocking
- Minimal impact on game performance

### Privacy

- Logs may contain:
  - Player names
  - Room codes
  - Game state information
  - Socket IDs
- Consider implementing log retention policies
- Add data anonymization if needed

## Example: Debugging Challenge System

Here's how we used this system to debug the challenge UI bug:

```bash
# 1. Start the game with Alice and Bob
# 2. Alice places a card incorrectly
# 3. Bob challenges
# 4. Bob refreshes the page
# 5. Retrieve logs to see what happened:

curl "http://localhost:3001/api/debug/frontend-logs?playerName=Bob" | \
  jq '.logs[] | select(.message | contains("Challenge UI check"))'
```

This revealed that the `challengerId` was being compared as socket IDs instead of persistent IDs, which broke after reconnection.

## Extending the System

### Add Custom Log Categories

```javascript
// In your component
debugLog.updatePlayerInfo({ ...existingInfo, category: 'challenge-flow' });
console.log('[Challenge] Initiating challenge');
```

### Add Performance Metrics

```javascript
const startTime = performance.now();
// ... operation ...
console.log('[Performance] Operation took:', performance.now() - startTime, 'ms');
```

### Stream Logs in Real-Time

```javascript
// Backend: Add WebSocket support for real-time log streaming
socket.on('debug-log-subscribe', () => {
  // Stream new logs as they arrive
});
```

## Troubleshooting

### Logs Not Appearing

1. Check that debugLogger is initialized in App.jsx
2. Verify backend is running on port 3001
3. Check browser console for CORS errors
4. Ensure playerInfo is being updated correctly

### Too Many Logs

1. Adjust `MAX_LOGS` in backend/index.js
2. Use more specific filters when retrieving
3. Clear logs periodically with DELETE endpoint

### Missing Player Context

1. Ensure `debugLog.updatePlayerInfo()` is called with all fields
2. Check that updates happen after socket connection
3. Verify player info persists across reconnections
