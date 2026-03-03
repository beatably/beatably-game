# Song Debug Features

This document describes the debugging features added to help troubleshoot Spotify song fetching and verify that game settings are working correctly.

## Features Added

### 1. Backend Debug Endpoints

#### `/api/debug/songs`
- **Purpose**: View the last songs fetched from Spotify
- **Returns**: 
  - Last fetch metadata (difficulty, genres, year range, etc.)
  - List of fetched songs with details
  - History of recent fetches
- **Usage**: `GET http://localhost:3001/api/debug/songs`

#### `/api/debug/games`
- **Purpose**: View all active games and their song statistics
- **Returns**:
  - Game overview (players, phase, current song)
  - Song statistics (year range, genre distribution, popularity stats)
  - Next few songs in queue
- **Usage**: `GET http://localhost:3001/api/debug/games`

#### `/api/debug/games/:code/songs`
- **Purpose**: View detailed song list for a specific game
- **Returns**:
  - Complete list of songs in the game
  - Current song index and progress
  - Song metadata (title, artist, year, popularity, genre)
- **Usage**: `GET http://localhost:3001/api/debug/games/1234/songs`

### 2. Enhanced Backend Logging

The backend now provides detailed console logging for:
- Song fetch requests with metadata
- Sample songs from each fetch
- Difficulty filtering results
- Genre and market distribution

### 3. Frontend Debug Panel

#### Access Methods
- **Keyboard Shortcut**: `Ctrl+D` (Windows/Linux) or `Cmd+D` (Mac)
- **UI Button**: Yellow bug icon (🐛) in bottom-right corner during games

#### Features
- **Current Game Songs Tab**: View all songs in the current game with status indicators
- **Last Fetch Tab**: View the most recent Spotify fetch with metadata
- **All Games Tab**: Overview of all active games and their statistics
- **Real-time Updates**: Refresh buttons to get latest data
- **Raw Data View**: Expandable section showing complete JSON responses

#### Game Settings Debug Panel
- **Location**: In the Game Settings section of the waiting room
- **Features**:
  - Test current settings against Spotify API
  - View last fetched songs with applied filters
  - See fetch history and metadata
  - Verify that genre, year, and market filters are working

## How to Use for Debugging

### Problem: Same songs repeating
1. Open debug panel during game (`Ctrl+D` or click 🐛 button)
2. Go to "Current Game Songs" tab
3. Check if songs are actually different or if there are duplicates
4. Look at song metadata to see genre/year distribution

### Problem: Settings not working (genres, years, etc.)
1. In waiting room, open "Game Settings"
2. Scroll down to "Song Debug Panel"
3. Click "Test Current Settings" to fetch songs with current filters
4. Check the metadata to verify:
   - Genres match your selection
   - Years are within your specified range
   - Markets are correct

### Problem: Too many songs from one album
1. Use the debug panel to view current game songs
2. Look for patterns in artist names and years
3. Check the "All Games" tab for song statistics
4. Review genre distribution and popularity stats

### Problem: Difficulty settings not working
1. Test different difficulty settings in Game Settings debug panel
2. Compare the "After Filtering" count vs "Total Found"
3. Check popularity scores of returned songs:
   - Easy: Should have popularity ≥ 70
   - Normal: Should have popularity ≥ 50
   - Hard: All songs included

## Console Logging

Enable detailed console logging by opening browser developer tools:
- **Chrome/Edge**: F12 → Console tab
- **Firefox**: F12 → Console tab
- **Safari**: Cmd+Option+I → Console tab

Look for log entries prefixed with:
- `[Spotify]` - Song fetching and playback
- `[Backend]` - Server-side game logic
- `[App]` - Frontend game state

## Temporary Feature

These debug features are intended for development and testing. Once the song selection issues are resolved, they can be:
- Hidden behind a developer flag
- Removed entirely
- Kept as admin-only features

## API Examples

```bash
# View last fetched songs
curl http://localhost:3001/api/debug/songs

# View all active games
curl http://localhost:3001/api/debug/games

# View songs for specific game
curl http://localhost:3001/api/debug/games/1234/songs

# Test song fetching with custom settings
curl -X POST http://localhost:3001/api/fetch-songs \
  -H "Content-Type: application/json" \
  -d '{
    "musicPreferences": {
      "genres": ["rock", "pop"],
      "yearRange": {"min": 2000, "max": 2020},
      "markets": ["US"],
      "limit": 30
    },
    "difficulty": "normal"
  }'
