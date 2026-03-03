# Troubleshooting Database Migration - Still Seeing Old Data

## Issue
After deploying with the force migration flag, the admin panel still shows old data (not the 3,747 songs we just pushed).

## Most Likely Causes

### 1. Persistent Disk Not Configured ⚠️ (MOST LIKELY)

**From PERSISTENT_DISK_IMPLEMENTATION.md:**
> "OnRender free tier doesn't have persistent disks by default"

**Check if persistent disk is mounted:**

1. Go to Onrender dashboard → Your backend service
2. Look for "Disks" section in the left sidebar
3. Check if there's a disk mounted at `/var/data`

**If NO disk is configured:**
- The backend is using the deployed cache directory
- Changes ARE being deployed, but persistent disk migration isn't happening
- **Solution: Configure persistent disk (see below)**

**If disk IS configured:**
- Check Onrender logs for migration messages (see below)

### 2. Force Migration Flag Not Deployed

**Check what was committed:**
```bash
git log --oneline -1
git show HEAD --stat
```

**Should see:**
- `backend/cache/.force-migration`
- `backend/cache/.migration-info.json`
- `backend/curatedDb.js` (modified)
- `backend/scripts/` (new files)

**If files missing:**
```bash
# Re-run the force migration script
cd backend
node scripts/force-database-migration.js

# Commit everything in backend/
git add backend/
git status  # Verify files are staged
git commit -m "Force database migration with flag files"
git push origin main
```

### 3. Migration Failed Silently

**Check Onrender logs for these patterns:**

❌ **Problem indicators:**
```
[CuratedDB] No persistent disk, checking fallback
[CuratedDB] Using deployed cache directory
[CuratedDB] Failed to compare databases
```

✅ **Success indicators:**
```
[CuratedDB] Force migration flag detected
[CuratedDB] Forced migration complete
[CuratedDB] Using persistent disk cache directory: /var/data/cache
```

## Solution Steps

### Step 1: Verify Persistent Disk Configuration

**Check Onrender Dashboard:**

1. Go to: https://dashboard.render.com
2. Click on your backend service (`beatably-backend`)
3. Look in left sidebar for **"Disks"** or **"Storage"**
4. Check if disk is mounted at `/var/data`

**If NO persistent disk exists:**

**A. Add Persistent Disk:**
1. Click "Add Disk" or "Create Disk"
2. **Mount Path**: `/var/data`
3. **Size**: 1 GB (minimum)
4. **Name**: `beatably-data` (or your choice)
5. Click "Create" or "Save"
6. **Wait for the disk to be created and mounted**
7. **Manual Deploy**: Click "Manual Deploy" → "Deploy latest commit"

**B. After disk is created, trigger migration:**
```bash
# The force flag should already be in your repo
# Just trigger a redeploy
git commit --allow-empty -m "Trigger migration with persistent disk"
git push origin main
```

### Step 2: Check Deployment Logs

**On Onrender:**
1. Go to your backend service
2. Click "Logs" tab
3. Look for the startup sequence

**What to look for:**

**Scenario A - No Persistent Disk:**
```
[CuratedDB] Production paths: {
  persistentPath: '/var/data/cache',
  persistentExists: false,  ← PROBLEM!
  deployedDirExists: true
}
[CuratedDB] No persistent disk, checking fallback
```
**Action:** Configure persistent disk (see Step 1)

**Scenario B - Force Flag Not Deployed:**
```
[CuratedDB] Database comparison: {
  persistentCount: 3692,  ← Old count
  deployedCount: 3747,    ← New count
  ...
}
```
But NO message about "Force migration flag detected"

**Action:** Check if flag files were committed

**Scenario C - Migration Successful:**
```
[CuratedDB] Force migration flag detected - migrating...
[CuratedDB] Forced migration complete
[CuratedDB] Loaded 3747 songs  ← New count!
```
**Action:** Check admin panel again, hard refresh (Cmd+Shift+R)

### Step 3: Verify Flag Files Were Deployed

**Check on GitHub:**
1. Go to: https://github.com/beatably/beatably-game
2. Navigate to: `backend/cache/`
3. Look for:
   - `.force-migration` ✅
   - `.migration-info.json` ✅
   - `curated-songs.json` (should be large, ~3.3MB) ✅

**If files are missing from GitHub:**
```bash
# Check local status
cd backend
ls -la cache/ | grep force

# If files exist locally but not committed:
git add cache/.force-migration
git add cache/.migration-info.json
git commit -m "Add force migration flag files"
git push origin main
```

### Step 4: Manual Migration Check

**SSH into Onrender (if available) or use Onrender Shell:**

```bash
# Check if persistent disk exists
ls -la /var/data/

# Check if migration happened
ls -la /var/data/cache/curated-songs.json

# Check file size and song count
du -h /var/data/cache/curated-songs.json
head -20 /var/data/cache/curated-songs.json

# Check if flag file is still there (should be deleted after migration)
ls -la /var/data/cache/.force-migration
```

### Step 5: Force Reload via Admin API

**If database is deployed but not loaded in memory:**

```bash
curl -X GET "https://beatably-backend.onrender.com/api/admin/curated-songs?limit=1" \
  -H "x-admin-secret: YOUR_ADMIN_PASSWORD"
```

This endpoint calls `curatedDb.load(true)` which forces a reload from disk.

**Check the response:**
```json
{
  "ok": true,
  "diagnostics": {
    "totalSongs": 3747,  ← Should be new count
    "environment": "production"
  }
}
```

## Quick Diagnosis Commands

### Check what was committed
```bash
git log -1 --stat
git show HEAD:backend/cache/.force-migration
```

### Check if Onrender has persistent disk
**Look in Onrender dashboard → Disks section**

### Check current production database
```bash
curl "https://beatably-backend.onrender.com/api/admin/curated-songs?limit=1" \
  -H "x-admin-secret: YOUR_PASSWORD" | jq '.total'
```

## Most Common Issue Resolution

**If you see 3692 songs in production but have 3747 locally:**

**The persistent disk is probably not configured!**

1. ✅ Configure persistent disk on Onrender at `/var/data`
2. ✅ Wait for disk to be created and mounted
3. ✅ Trigger a manual deploy
4. ✅ Check logs for migration success
5. ✅ Verify in admin panel

## Alternative: Lower the Migration Threshold

If you don't want to use the force flag for future updates, **lower the threshold permanently:**

Edit `backend/curatedDb.js` around line 107:

```javascript
// Change from 10% to 2% threshold
if (deployedCount > persistentCount * 1.02) {  // Was: * 1.1
  console.log('[CuratedDB] Deployed database has more songs - migrating...');
  fs.copyFileSync(deployedDbFile, persistentDbFile);
  console.log('[CuratedDB] Migration complete');
}
```

This way any update > 2% will trigger automatic migration.

## Need More Help?

**Share these details:**
1. Does your Onrender service have a persistent disk mounted at `/var/data`?
2. What do the Onrender logs show during startup?
3. What does this command return:
   ```bash
   curl "https://beatably-backend.onrender.com/api/admin/curated-songs?limit=1" \
     -H "x-admin-secret: YOUR_PASSWORD"
   ```

Most likely the issue is **no persistent disk configured** - configure it and redeploy!
