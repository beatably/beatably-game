# Preview URL Sync Solution for Onrender

## Problem Identified

The database with preview URLs IS in git and IS deployed, but **the persistent disk on Onrender has an older version of the database** (from before preview URLs were added).

### Why This Happens

1. ✅ Your local database has preview URLs (3MB file with populated `previewUrl` fields)
2. ✅ The database is committed to git (commit `474dab8` from Oct 14, 15:19)
3. ✅ Git is pushed to origin/main
4. ✅ Onrender deploys the code with the database in `backend/cache/curated-songs.json`
5. ❌ **BUT** the persistent disk `/var/data/cache/curated-songs.json` has an old version from before
6. ❌ The backend migration logic checks if persistent disk has songs - if yes, it keeps using the old one
7. ❌ Result: Production uses the old database WITHOUT preview URLs

### Code Evidence

From `backend/curatedDb.js` line 35-44:
```javascript
if (fs.existsSync(persistentDbFile)) {
  const persistentData = JSON.parse(fs.readFileSync(persistentDbFile, 'utf8'));
  const persistentCount = Array.isArray(persistentData) ? persistentData.length : 0;
  
  // If persistent disk has songs, use it (EVEN IF IT'S OUTDATED!)
  if (persistentCount > 0) {
    return persistentPath; // Uses OLD database
  }
}
```

## Solutions

### Solution 1: Manual Database Sync (Recommended - Fastest)

**SSH into Onrender and overwrite the persistent disk database:**

```bash
# SSH into your Onrender service
# (Get the command from Onrender dashboard -> Shell)

# Check current database
cat /var/data/cache/curated-songs.json | head -n 30

# Copy the deployed (new) database to persistent disk
cp /opt/render/project/src/backend/cache/curated-songs.json /var/data/cache/curated-songs.json

# Verify the copy
cat /var/data/cache/curated-songs.json | grep -o '"previewUrl":"http[^"]*"' | head -n 5

# Restart the service
# (Do this from Onrender dashboard)
```

### Solution 2: API-Based Update (If SSH Not Available)

Use the admin interface to re-populate:

1. Go to your production site: `https://your-app.onrender.com/admin.html`
2. The database will auto-migrate on first load
3. However, you'll need to run the populate script on production

**Option A: Add a migration endpoint**

Create a new API endpoint that forces database update:

```javascript
// Add to backend/index.js
app.post('/api/admin/force-db-migration', (req, res) => {
  const deployedDb = path.join(__dirname, 'cache', 'curated-songs.json');
  const persistentDb = '/var/data/cache/curated-songs.json';
  
  try {
    if (fs.existsSync(deployedDb)) {
      fs.copyFileSync(deployedDb, persistentDb);
      curatedDb.load(true); // Force reload
      res.json({ success: true, message: 'Database migrated' });
    } else {
      res.status(404).json({ success: false, message: 'Deployed database not found' });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});
```

### Solution 3: Improve Migration Logic (Long-term Fix)

Update `backend/curatedDb.js` to check if deployed database is NEWER:

```javascript
// Around line 35-44, add timestamp comparison
if (fs.existsSync(persistentDbFile)) {
  try {
    const persistentData = JSON.parse(fs.readFileSync(persistentDbFile, 'utf8'));
    const deployedData = fs.existsSync(deployedDbFile) 
      ? JSON.parse(fs.readFileSync(deployedDbFile, 'utf8')) 
      : [];
    
    const persistentCount = Array.isArray(persistentData) ? persistentData.length : 0;
    const deployedCount = Array.isArray(deployedData) ? deployedData.length : 0;
    
    // Check if deployed version has preview URLs but persistent doesn't
    const persistentHasPreview = persistentData.some(s => s.previewUrl);
    const deployedHasPreview = deployedData.some(s => s.previewUrl);
    
    if (deployedHasPreview && !persistentHasPreview) {
      console.log('[CuratedDB] Deployed database has preview URLs, migrating...');
      fs.copyFileSync(deployedDbFile, persistentDbFile);
      return persistentPath;
    }
    
    if (persistentCount > 0) {
      return persistentPath;
    }
  } catch (error) {
    // Continue with existing migration logic
  }
}
```

## Recommended Action Plan

1. **Immediate Fix**: Use Solution 1 (SSH and copy)
   - Takes 2 minutes
   - Immediately syncs preview URLs
   
2. **Long-term Fix**: Implement Solution 3
   - Add smarter migration logic
   - Prevents this issue in future updates

3. **Verification**:
   ```bash
   # After fix, verify preview URLs exist
   curl https://your-app.onrender.com/api/admin/curated | grep -o '"previewUrl":"http[^"]*"' | head -n 5
   ```

## File Summary

- ✅ Local database: `/Users/tim/Game/backend/cache/curated-songs.json` (3MB, HAS preview URLs)
- ✅ Git commit: `474dab8` (Oct 14, 15:19) - includes database
- ✅ Deployed location: `/opt/render/project/src/backend/cache/curated-songs.json` (HAS preview URLs)
- ❌ Persistent disk: `/var/data/cache/curated-songs.json` (OLD version, NO preview URLs)

## After Fix

Once synced, preview mode should work because:
1. Database will have `previewUrl` fields populated
2. `selectForGame()` with `previewMode: true` will filter songs with preview URLs
3. Frontend will be able to play 30-second previews
