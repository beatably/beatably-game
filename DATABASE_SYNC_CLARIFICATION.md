# Database Sync Clarification

## The Issue: Local vs Production Database Sync

### Current Situation
- **Local Environment**: Your `backend/cache/curated-songs.json` contains all your curated songs
- **OnRender Production**: Starts with an empty or missing `curated-songs.json` file
- **No Automatic Sync**: There is no mechanism to automatically transfer your local database to production

### Why This Happens
1. **Git Exclusion**: The `backend/cache/` directory is likely in `.gitignore` to prevent large cache files from being committed
2. **Ephemeral Storage**: OnRender's free tier doesn't persist files between deployments
3. **No Database Migration**: The application doesn't have a built-in mechanism to sync local data to production

### Solutions

#### Option 1: Include Database in Git (Quick Fix)
Remove `backend/cache/curated-songs.json` from `.gitignore` and commit it:
```bash
# Check if it's ignored
git status backend/cache/curated-songs.json

# If ignored, remove from .gitignore and commit
git add backend/cache/curated-songs.json
git commit -m "Include curated songs database for production"
git push
```

**Pros**: Immediate fix, database deploys with code
**Cons**: Large file in git history, not ideal for frequent updates

#### Option 2: Manual Database Upload (Recommended)
1. Set up persistent disk on OnRender (`/var/data`)
2. Deploy the updated code (already done)
3. Manually upload your local `curated-songs.json` to production:
   - Use OnRender's shell access
   - Or create an admin endpoint to upload the database
   - Or use the existing admin tools to repopulate

#### Option 3: Create Database Migration Script
Create a one-time migration script that copies your local database to production.

### Immediate Action Needed

Since your production is currently broken due to missing songs, I recommend **Option 1** as a quick fix:

1. Check if `backend/cache/curated-songs.json` is in `.gitignore`
2. If so, remove it from `.gitignore` 
3. Commit and push the database file
4. This will immediately fix your production issue

After that, you can implement the persistent disk solution for future updates.

### Long-term Strategy
- Use persistent disk for production database storage
- Keep local development database separate
- Use admin tools or migration scripts for database updates
- Consider a proper database solution (PostgreSQL) for production
