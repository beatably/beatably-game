# Persistent Disk Implementation for OnRender

## Overview
This document outlines the implementation of persistent disk storage to resolve production playback issues on OnRender. The main problem was that OnRender's free tier uses ephemeral storage, causing the curated song database to be lost on each deployment.

## Root Cause Analysis
- **Issue**: Play button not working in production, showing stale progress from previous Spotify sessions
- **Cause**: OnRender free tier doesn't have persistent disks, so the curated song database (`backend/cache/curated-songs.json`) was lost on each restart
- **Symptom**: Console warning "Only found 0 curated songs, but need at least 60 for 1 players"
- **Secondary Issue**: AudioContext autoplay restrictions on mobile browsers

## Solution Implemented

### 1. Persistent Disk Configuration
- **Recommended Path**: `/var/data`
- **Recommended Size**: 1 GB (expandable later)
- **Structure**: 
  ```
  /var/data/
  ├── cache/
  │   ├── curated-songs.json
  │   └── state.json
  └── logs/ (future use)
  ```

### 2. Backend Changes

#### Updated `backend/curatedDb.js`
- Added environment detection for cache directory path
- **Production**: Uses `/var/data/cache`
- **Development**: Uses `backend/cache` (unchanged)
- Added logging to show which directory is being used

#### Updated `backend/index.js`
- Updated state persistence to use the same persistent disk path
- **Production**: Uses `/var/data/cache` for `state.json`
- **Development**: Uses `backend/cache` (unchanged)
- Added logging for state directory usage

### 3. Frontend Enhancements

#### Enhanced Production Playback Error Handling
Updated `frontend/src/utils/productionPlaybackFix.js`:
- Added detection for empty curated database scenarios
- Enhanced error messaging for database-related issues
- Better handling of edge cases in production environment

#### Improved AudioContext User Gesture Handling
Updated `frontend/src/SpotifyPlayer.jsx`:
- Enhanced AudioContext unlock mechanism with better error handling
- Improved Safari compatibility with `activateElement()` calls
- Added persistent AudioContext management
- Better logging for debugging autoplay issues
- More robust gesture-based unlock process

## Deployment Steps

### 1. Configure Persistent Disk in OnRender
1. Go to your OnRender service dashboard
2. Navigate to "Disks" section
3. Click "Add Disk"
4. Configure:
   - **Mount Path**: `/var/data`
   - **Size**: 1 GB
5. Deploy the service

### 2. Deploy Code Changes
The code changes are already implemented and will automatically:
- Detect the production environment
- Use `/var/data/cache` for persistent storage
- Maintain backward compatibility with local development

### 3. Populate the Database
After deployment with persistent disk:
1. Use the admin interface at `/admin.html`
2. Populate the curated database using existing admin tools
3. The database will now persist across deployments

## Technical Details

### Environment Detection
```javascript
const CACHE_DIR = process.env.NODE_ENV === 'production' 
  ? '/var/data/cache' 
  : path.join(__dirname, 'cache');
```

### Automatic Directory Creation
Both `curatedDb.js` and `index.js` include automatic directory creation:
```javascript
if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}
```

### Logging
Added comprehensive logging to track:
- Which cache directory is being used
- AudioContext state changes
- Playback unlock attempts
- Production fix applications

## Expected Results

After implementation:
1. ✅ Curated songs database persists across deployments
2. ✅ Play button works reliably in production
3. ✅ No more "0 curated songs" warnings
4. ✅ Better AudioContext handling on mobile browsers
5. ✅ Improved error messages for troubleshooting

## Monitoring

### Console Logs to Watch For
- `[CuratedDB] Using cache directory: /var/data/cache` (production)
- `[State] Using state directory: /var/data/cache` (production)
- `[Playback] Playback successfully unlocked via user gesture`
- `[ProductionFix] No song item in game context - possible empty database`

### Success Indicators
- Game creation works without curated song warnings
- Play button responds immediately without stale progress
- AudioContext unlocks properly on first user interaction
- Songs load and play correctly across different devices

## Rollback Plan
If issues occur:
1. The code maintains full backward compatibility
2. Local development is unaffected
3. Can revert to previous deployment while keeping persistent disk
4. Database content is preserved on the persistent disk

## Future Enhancements
- Consider migrating to a proper database (PostgreSQL) for better performance
- Add automated database backup to the persistent disk
- Implement database health checks and auto-recovery
- Add metrics for tracking playback success rates
