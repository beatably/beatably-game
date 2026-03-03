# Database Reload Guide for Onrender Production

## Overview
This guide explains how to ensure your updated curated songs database is properly loaded and reloaded in production on Onrender, including the automatic migration system and manual reload procedures.

## How Database Loading Works

### 1. Automatic Database Loading on Startup

Your backend (`backend/index.js`) automatically loads the curated database on startup:

```javascript
// Lines 13-22 in backend/index.js
console.log('[Startup] ===== CURATED DATABASE INITIALIZATION START =====');
try {
  curatedDb.load(); // This triggers getCacheDir() and migration logic
  console.log('[Startup] curatedDb.load() completed successfully');
} catch (error) {
  console.error('[Startup] ERROR during curatedDb.load():', error.message);
}
```

### 2. Smart Migration System

The database system (`backend/curatedDb.js`) has intelligent migration logic:

**Production Path Priority:**
1. **Persistent Disk**: `/var/data/cache/curated-songs.json` (preferred)
2. **Deployed Cache**: `backend/cache/curated-songs.json` (fallback for migration)

**Automatic Migration Scenarios:**
- If persistent disk is empty but deployed cache has songs → Automatically migrates
- If deployed cache has preview URLs but persistent doesn't → Automatically migrates
- If deployed cache has significantly more songs (>10%) → Automatically migrates

### 3. Force Reload Mechanism

Admin endpoints support force reload with the `forceReload` parameter:

```javascript
// In backend/index.js - Admin endpoints
curatedDb.load(true); // Pass true to force reload
```

## How to Update the Database in Production

### Method 1: Deploy with Updated Database (Recommended)

**When deploying code with an updated `backend/cache/curated-songs.json` file:**

1. **Commit your updated database file:**
   ```bash
   git add backend/cache/curated-songs.json
   git commit -m "Update curated songs database"
   git push origin main
   ```

2. **Onrender auto-deploys from GitHub**
   - The new `backend/cache/curated-songs.json` is deployed
   - On startup, the migration system detects the new file
   - Database automatically migrates to persistent disk

3. **Verify the migration** (check Onrender logs):
   ```
   [CuratedDB] Deployed database has 450 songs
   [CuratedDB] Migrating database from deployed to persistent disk...
   [CuratedDB] Migration complete
   [CuratedDB] Using persistent disk cache directory: /var/data/cache
   ```

### Method 2: Manual Deployment Trigger

**If you just want to reload the database without code changes:**

1. **Option A: Manual Deploy via Onrender Dashboard**
   - Go to your Onrender service dashboard
   - Click "Manual Deploy" → "Deploy latest commit"
   - This restarts the service and triggers migration logic

2. **Option B: Trigger via Empty Commit**
   ```bash
   git commit --allow-empty -m "Trigger database reload"
   git push origin main
   ```

### Method 3: Force Reload via Admin API (Advanced)

**If the database is already deployed but not loading:**

1. **Access the admin endpoint** (requires ADMIN_PASSWORD):
   ```bash
   curl -X GET "https://beatably-backend.onrender.com/api/admin/curated-songs?limit=1" \
     -H "x-admin-secret: YOUR_ADMIN_PASSWORD"
   ```
   
   This endpoint automatically calls `curatedDb.load(true)` to force reload.

2. **Check the response for diagnostics:**
   ```json
   {
     "ok": true,
     "diagnostics": {
       "databasePath": "/var/data/cache/curated-songs.json",
       "totalSongs": 450,
       "environment": "production",
       "timestamp": "2025-10-19T18:00:00.000Z"
     }
   }
   ```

### Method 4: Use the Admin Panel

**Via the web admin interface:**

1. Open `https://beatably.app/admin.html`
2. Log in with your admin password
3. Navigate to the songs list
4. The page automatically forces a reload when fetching songs
5. Check the diagnostics section at the bottom of the response

## Verifying Database Reload

### 1. Check Onrender Logs

**Look for these log messages after deployment:**

✅ **Successful Migration:**
```
[CuratedDB] Production paths: { 
  persistentPath: '/var/data/cache',
  deployedPath: '/Users/backend/cache',
  persistentExists: true,
  deployedDirExists: true
}
[CuratedDB] Deployed database has 450 songs
[CuratedDB] Migrating database from deployed to persistent disk...
[CuratedDB] Migration complete
[CuratedDB] Loaded 450 songs from deployed database
```

✅ **Using Existing Persistent Database:**
```
[CuratedDB] Persistent disk database exists with 450 songs
[CuratedDB] Using persistent disk cache directory: /var/data/cache
[CuratedDB] Successfully parsed 450 songs from DB file
```

❌ **Problem Indicators:**
```
[CuratedDB] No deployed database found at: /backend/cache/curated-songs.json
[CuratedDB] Production mode with 0 songs - checking deployed database as backup
```

### 2. Use the Debug Endpoint

**Check database status via API:**

```bash
curl https://beatably-backend.onrender.com/api/admin/curated-songs?limit=1 \
  -H "x-admin-secret: YOUR_ADMIN_PASSWORD"
```

**Expected response:**
```json
{
  "ok": true,
  "items": [ /* song objects */ ],
  "total": 450,
  "diagnostics": {
    "databasePath": "/var/data/cache/curated-songs.json",
    "totalSongs": 450,
    "environment": "production"
  }
}
```

### 3. Test Game Creation

**Create a test game and check for warnings:**

❌ **Problem:** Console shows `"Only found 0 curated songs, but need at least 60"`
✅ **Success:** Game creates without warnings, songs load properly

## Troubleshooting

### Issue 1: Database Not Migrating

**Symptoms:**
- Logs show 0 songs after deployment
- Old song data still appears in games

**Solution:**
```bash
# Force a clean deployment
git commit --allow-empty -m "Force database migration"
git push origin main

# Then check logs for migration messages
```

### Issue 2: Persistent Disk Not Mounted

**Symptoms:**
- Logs show: `[CuratedDB] No persistent disk, checking fallback`
- Using deployed cache instead of persistent disk

**Solution:**
1. Go to Onrender dashboard → Your service → "Disks"
2. Verify disk is attached at `/var/data`
3. If not, add a persistent disk:
   - **Mount Path**: `/var/data`
   - **Size**: 1 GB
4. Redeploy the service

### Issue 3: Stale Data in Persistent Disk

**Symptoms:**
- New songs in `backend/cache/curated-songs.json` but old songs appear in games
- Migration didn't trigger because persistent disk already has data

**Solution A - Force Migration via Version Update:**
Add more songs to trigger the 10% threshold:
```javascript
// The system migrates if deployed has significantly more songs
if (deployedCount > persistentCount * 1.1) {
  // Auto-migrates
}
```

**Solution B - Clear Persistent Disk:**
1. Use SSH access (if available) or contact Onrender support
2. Delete `/var/data/cache/curated-songs.json`
3. Redeploy to trigger fresh migration

**Solution C - Use Admin Panel to Re-populate:**
1. Go to admin panel
2. Use the bulk import feature to add songs
3. This overwrites the persistent database

### Issue 4: Admin Endpoint Not Force-Reloading

**Symptoms:**
- Admin API still shows old song count
- Force reload doesn't seem to work

**Solution:**
Check the admin endpoint is actually being called with force reload:
```javascript
// backend/index.js line 374-378
app.get('/api/admin/curated-songs', requireAdmin, (req, res) => {
  console.log('[Admin] Force reloading curated database for admin request');
  curatedDb.load(true); // This forces reload
  // ...
});
```

Verify you're hitting this endpoint and check logs for the force reload message.

## Best Practices

### 1. Always Commit Database Changes
```bash
# After updating songs locally
git add backend/cache/curated-songs.json
git commit -m "feat: add 50 new songs from 1990s"
git push origin main
```

### 2. Monitor Deployment Logs
- Always check Onrender logs after deployment
- Look for migration success messages
- Verify song count matches your expectations

### 3. Use Version Comments
Add a version comment in your database file:
```json
{
  "_metadata": {
    "version": "2.1",
    "updated": "2025-10-19",
    "totalSongs": 450,
    "lastUpdate": "Added 50 songs from 1990s era"
  },
  "songs": [...]
}
```

### 4. Test Before Full Deployment
```bash
# Test locally first
npm start  # in backend directory

# Check logs show correct song count
# Test game creation with new songs
```

### 5. Keep Backups
Onrender persistent disks are persistent, but:
- Commit database changes to Git (primary backup)
- Consider downloading database via admin API periodically
- Use the analytics endpoint to track song counts over time

## Quick Reference

### Force Reload Command
```bash
curl -X GET "https://beatably-backend.onrender.com/api/admin/curated-songs?limit=1" \
  -H "x-admin-secret: YOUR_ADMIN_PASSWORD"
```

### Check Database Status
```bash
curl "https://beatably-backend.onrender.com/api/admin/analytics" \
  -H "x-admin-secret: YOUR_ADMIN_PASSWORD"
```

### Trigger Redeploy
```bash
git commit --allow-empty -m "Trigger database reload"
git push origin main
```

### Log Messages to Watch For
- `[CuratedDB] Migration complete` ✅
- `[CuratedDB] Loaded X songs` ✅
- `[CuratedDB] Production mode with 0 songs` ❌
- `[CuratedDB] Using persistent disk cache directory` ✅

## Summary

Your system has a sophisticated automatic migration mechanism that should handle most database updates automatically when you deploy. The key points:

1. **Deploy with updated database file** → Auto-migration happens
2. **Check logs** → Verify migration success
3. **Use admin endpoints** → Force reload if needed
4. **Monitor song counts** → Ensure data is current

If you follow the deployment method (Method 1), the database should reload automatically every time you push changes to GitHub.
