# Song Database Management Guide

This guide explains how the Beatably song database works, how to enrich songs with metadata, and how to maintain data quality.

## Overview

The song database consists of:
- **Billboard hits**: Chart data from 1960-2024
- **Spotify discoveries**: Genre and market-specific songs
- **Enriched metadata**: Genre, geography, preview URLs, and international classification

## Database Architecture

```
Song Data Flow:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. Initial Import
   Billboard API → chartProvider.js
   Spotify Search → discovery.js
                    ↓
2. Storage
   curated-songs.json (via curatedDb.js)
                    ↓
3. Enrichment (NEW!)
   songEnrichment.js
   ├── MusicBrainz (genre detection)
   ├── Spotify + MusicBrainz (geography detection)
   ├── Web scraping (preview URLs)
   └── Classification rules (international flag)
                    ↓
4. Game Selection
   curatedDb.selectForGame()
```

## Song Enrichment System

### What Gets Enriched?

The enrichment system adds/updates:

1. **Genre** (via MusicBrainz + Spotify)
   - Primary: MusicBrainz artist tags → mapped to game genres
   - Fallback: Spotify artist genres
   - Final fallback: 'pop'

2. **Geography** (artist origin via MusicBrainz + Spotify)
   - Primary: MusicBrainz artist country
   - Secondary: Spotify genre hints (e.g., "swedish rock" → SE)
   - Confidence scoring

3. **Preview URL** (via Spotify web scraping)
   - 30-second audio clips for gameplay
   - Note: Can be fragile due to Spotify HTML changes

4. **International Classification**
   - Based on origin (US/GB automatic)
   - Billboard chart presence
   - Multi-country chart success
   - Curated international Swedish artists

### Enrichment Module

Location: `backend/songEnrichment.js`

Key functions:
```javascript
const { enrichSong, enrichBatch } = require('./songEnrichment');

// Enrich single song
const enriched = await enrichSong(song, {
  fetchPreview: true,
  fetchMusicBrainz: true,
  rateLimit: true
});

// Enrich multiple songs
const enriched = await enrichBatch(songs, options, progressCallback);
```

## CLI Tools

### 1. Test Enrichment

**Purpose**: Test the enrichment system with sample songs

```bash
cd backend
node scripts/test-enrichment.js
```

**What it does**:
- Tests enrichment on 3 sample songs
- Shows before/after state
- Verifies all systems work

**Example output**:
```
TEST 1/3: Ebba Grön - "Ung & kåt"
Before: Genre: (missing), Geography: (missing)
  ✓ Genre: rock
  ✓ Origin: SE (confidence: 0.95)
  ✓ International: false
After: Genre: rock, Geography: SE
```

### 2. Enrich Single Song

**Purpose**: Enrich a specific song by ID or Spotify URI

```bash
cd backend
node scripts/enrich-song.js <song-id-or-uri>
```

**Examples**:
```bash
# By database ID
node scripts/enrich-song.js cur_123456

# By Spotify URI
node scripts/enrich-song.js spotify:track:3W2ZcrRsInZbjWylOi6KhZ
```

**Use cases**:
- Fix missing data for specific songs
- Test enrichment on new additions
- Quality assurance

### 3. Batch Enrichment

**Purpose**: Enrich multiple songs with filtering options

```bash
cd backend
node scripts/enrich-batch.js [options]
```

**Options**:
- `--missing-genre`: Only songs without genre
- `--missing-geo`: Only songs without geography  
- `--missing-preview`: Only songs without preview URL
- `--limit N`: Process only N songs
- `--dry-run`: Show what would be enriched

**Examples**:
```bash
# Dry run to see what needs enrichment
node scripts/enrich-batch.js --missing-genre --dry-run

# Enrich first 50 songs missing geography
node scripts/enrich-batch.js --missing-geo --limit 50

# Enrich all songs missing preview URLs
node scripts/enrich-batch.js --missing-preview
```

**Important notes**:
- Rate limited to ~1 request per second for external APIs
- Large batches can take hours
- Progress shown every 10 songs

## Data Quality Maintenance

### Regular Tasks

1. **Check for missing data**:
```bash
# See what needs enrichment
node scripts/enrich-batch.js --dry-run
```

2. **Enrich new imports**:
```bash
# After bulk import, enrich missing fields
node scripts/enrich-batch.js --missing-genre --missing-geo
```

3. **Update preview URLs**:
```bash
# Preview URLs can expire
node scripts/enrich-batch.js --missing-preview --limit 100
```

### Data Sources

#### MusicBrainz
- **Rate limit**: ~1 request/second (enforced)
- **Reliability**: High for genre/geography
- **Coverage**: Excellent for Western music

#### Spotify
- **Rate limit**: ~100 requests/minute (client credentials)
- **Reliability**: High for metadata
- **Preview URLs**: Can be fragile (web scraping)

#### Billboard Charts
- **Source**: Remote JSON files
- **Coverage**: 1960-2024 (updated weekly)
- **Reliability**: High

## Admin Integration (Future)

### Current Endpoint

The admin interface currently has a simple endpoint:

```javascript
POST /api/admin/curated-songs
Body: { song data }
```

### Recommended Integration

Add enrichment endpoint:

```javascript
POST /api/admin/curated-songs/enrich/:id
Response: { enriched song data }
```

Frontend button:
```javascript
<button onClick={() => enrichSong(song.id)}>
  Enrich Metadata
</button>
```

This allows manual enrichment from the admin UI without CLI access.

## Troubleshooting

### Genre Detection Fails

**Symptom**: Songs get genre 'pop' as fallback

**Solutions**:
1. Check MusicBrainz has the artist
2. Verify artist name spelling
3. Check Spotify artist page manually

### Geography Detection Fails

**Symptom**: Geography stays empty or gets wrong country

**Solutions**:
1. Verify artist name in MusicBrainz
2. Check if artist has country metadata
3. Manual override may be needed for edge cases

### Preview URLs Don't Work

**Symptom**: `previewUrl` is null

**Causes**:
- Song not available for preview on Spotify
- Web scraping HTML structure changed
- Regional availability issues

**Solutions**:
- Preview URLs are optional (game works without them)
- Spotify SDK can play full tracks with user auth
- Consider alternative preview sources

### Rate Limiting

**Symptom**: Enrichment is very slow

**This is normal!**
- MusicBrainz: 1 request/second enforced
- Spotify: Client credentials token cached
- Web scraping: 0.5 second delays

For 1000 songs with all enrichments:
- Genre: ~17 minutes
- Geography: ~17 minutes  
- Preview: ~8 minutes
- **Total: ~40-50 minutes**

## Best Practices

### 1. Enrich in Stages

```bash
# Stage 1: Genre (fast, reliable)
node scripts/enrich-batch.js --missing-genre

# Stage 2: Geography (fast, reliable)
node scripts/enrich-batch.js --missing-geo

# Stage 3: Preview URLs (slow, can fail)
node scripts/enrich-batch.js --missing-preview --limit 100
```

### 2. Test Before Batch

```bash
# Test on one song first
node scripts/enrich-song.js cur_123456

# Then do small batch
node scripts/enrich-batch.js --missing-genre --limit 10

# Finally full batch
node scripts/enrich-batch.js --missing-genre
```

### 3. Use Dry Runs

```bash
# Always check what will be processed
node scripts/enrich-batch.js --dry-run

# Verify counts make sense
# Then run without --dry-run
```

### 4. Monitor Progress

- Enrichment logs show each song processed
- Progress updates every 10 songs
- Errors are logged but don't stop the batch

## Architecture Decisions

### Why Hybrid MusicBrainz + Spotify?

- **MusicBrainz**: Better genre tags, artist origin data
- **Spotify**: Better for recent music, fallback option
- **Combined**: Best coverage across all eras

### Why Web Scraping for Previews?

- Spotify Web API doesn't always provide preview URLs
- Web player HTML includes preview links
- Trade-off: Reliability vs. completeness

### Why International Classification?

Game design requirement:
- Swedish vs. International song mix
- Different difficulty tiers
- Market-based selection

## File Structure

```
backend/
├── songEnrichment.js        # Core enrichment module
├── geographyDetection.js    # Geography detection logic
├── musicbrainz.js           # MusicBrainz API client
├── curatedDb.js             # Database operations
└── scripts/
    ├── test-enrichment.js   # Test enrichment system
    ├── enrich-song.js       # Enrich single song CLI
    └── enrich-batch.js      # Batch enrichment CLI
```

## Related Documentation

- `MARKET_CLASSIFICATION_SOLUTION.md`: Market classification rules
- `backend/scripts/POPULATION_GUIDE.md`: Database population
- `backend/geographyDetection.js`: Geography detection implementation
- `backend/musicbrainz.js`: MusicBrainz integration

## Future Enhancements

### Planned
1. Admin UI integration for one-click enrichment
2. Automatic enrichment on import
3. Scheduled background enrichment jobs

### Possible
1. Alternative preview URL sources
2. Manual override system for edge cases
3. Confidence scores in admin UI
4. Batch enrichment progress UI

## Quick Reference

```bash
# Test system
node scripts/test-enrichment.js

# Check what needs enrichment
node scripts/enrich-batch.js --dry-run

# Enrich missing genres
node scripts/enrich-batch.js --missing-genre

# Enrich specific song
node scripts/enrich-song.js spotify:track:ABC123

# Enrich with limit
node scripts/enrich-batch.js --missing-geo --limit 50
```

## Support

For issues or questions:
1. Check this guide first
2. Review error logs in console
3. Test with single song before batch
4. Consider manual data entry for edge cases
