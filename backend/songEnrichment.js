/**
 * Unified Song Enrichment Module
 * 
 * This module provides a single pipeline for enriching songs with:
 * - MusicBrainz data (genre, artist origin)
 * - Preview URLs (via web scraping)
 * - International classification
 * - Album art validation
 * 
 * Used by both admin interface and batch scripts.
 */

const axios = require('axios');
const { detectGeographyForArtist, detectGenresForArtist } = require('./geographyDetection');

// Rate limiting for external APIs
const MUSICBRAINZ_DELAY = 1100; // 1.1 seconds between requests
const PREVIEW_SCRAPE_DELAY = 500; // 0.5 seconds between requests

/**
 * Sleep utility for rate limiting
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Fetch preview URL from Spotify web player
 * Uses the same scraping logic as populate-preview-urls.js
 */
async function fetchPreviewUrl(spotifyUri) {
  if (!spotifyUri || !spotifyUri.startsWith('spotify:track:')) {
    return null;
  }

  const trackId = spotifyUri.replace('spotify:track:', '');
  
  try {
    const response = await axios.get(`https://open.spotify.com/track/${trackId}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
      },
      timeout: 10000
    });

    const html = response.data;
    
    // Look for preview URL in the HTML
    const previewMatch = html.match(/"audioPreview":\{"url":"([^"]+)"/);
    if (previewMatch && previewMatch[1]) {
      return previewMatch[1];
    }

    return null;
  } catch (error) {
    console.warn(`[SongEnrichment] Preview URL fetch failed for ${trackId}:`, error.message);
    return null;
  }
}

/**
 * Classify song as international based on our rules
 * 
 * isInternational = true IF:
 * 1. Geography is US or GB (inherent international reach), OR
 * 2. isBillboardChart === true (proven US chart success), OR
 * 3. hasMultiCountryCharts === true (3+ countries including US/GB), OR
 * 4. Artist in curated international list
 */
function classifyAsInternational(song) {
  const geography = (song.geography || '').toUpperCase();
  
  // Rule 1: US/GB origin
  if (geography === 'US' || geography === 'GB') {
    return true;
  }
  
  // Rule 2: Billboard chart
  if (song.isBillboardChart === true) {
    return true;
  }
  
  // Rule 3: Multi-country charts
  if (song.hasMultiCountryCharts === true) {
    return true;
  }
  
  // Rule 4: Curated international Swedish artists
  const internationalSwedishArtists = [
    'ABBA', 'Roxette', 'Ace of Base', 'Europe', 'The Cardigans',
    'Robyn', 'Avicii', 'Swedish House Mafia', 'Icona Pop', 
    'Neneh Cherry', 'Eagle-Eye Cherry', 'José González',
    'The Hives', 'Peter Bjorn and John', 'First Aid Kit',
    'Mando Diao', 'Miike Snow'
  ];
  
  if (geography === 'SE') {
    const artistLower = (song.artist || '').toLowerCase();
    const isInternational = internationalSwedishArtists.some(intlArtist => 
      artistLower.includes(intlArtist.toLowerCase())
    );
    if (isInternational) {
      return true;
    }
  }
  
  return false;
}

/**
 * Enrich a single song with all available data
 * 
 * @param {Object} song - Song object to enrich
 * @param {Object} options - Enrichment options
 * @param {boolean} options.fetchPreview - Whether to fetch preview URL (default: true)
 * @param {boolean} options.fetchMusicBrainz - Whether to fetch MusicBrainz data (default: true)
 * @param {boolean} options.rateLimit - Whether to apply rate limiting (default: true)
 * @returns {Object} Enriched song object
 */
async function enrichSong(song, options = {}) {
  const {
    fetchPreview = true,
    fetchMusicBrainz = true,
    rateLimit = true
  } = options;

  console.log(`[SongEnrichment] Enriching: ${song.artist} - "${song.title}"`);

  const enriched = { ...song };
  const updates = {
    preview: false,
    musicbrainz: false,
    geography: false,
    classification: false
  };

  try {
    // Step 1: Detect genre if missing
    if (fetchMusicBrainz && !enriched.genre && song.artist) {
      try {
        if (rateLimit) await sleep(MUSICBRAINZ_DELAY);
        
        const genreData = await detectGenresForArtist(song.artist);
        
        if (genreData && genreData.genres && genreData.genres.length > 0) {
          enriched.genre = genreData.genres[0];
          enriched.genres = genreData.genres;
          updates.musicbrainz = true;
          console.log(`  ✓ Genre: ${genreData.genres.join(', ')}`);
        }
      } catch (genreError) {
        console.warn(`  ⚠ Genre detection failed:`, genreError.message);
      }
    }

    // Step 2: Detect geography if missing
    if (fetchMusicBrainz && !enriched.geography && song.artist) {
      try {
        if (rateLimit) await sleep(MUSICBRAINZ_DELAY);
        
        const geoData = await detectGeographyForArtist(song.artist);
        
        if (geoData && geoData.geography) {
          enriched.geography = geoData.geography;
          updates.geography = true;
          console.log(`  ✓ Origin: ${geoData.geography} (confidence: ${geoData.confidence})`);
        }
      } catch (geoError) {
        console.warn(`  ⚠ Geography detection failed:`, geoError.message);
      }
    }

    // Step 3: Fetch preview URL if requested and missing
    if (fetchPreview && !enriched.previewUrl && song.spotifyUri) {
      try {
        if (rateLimit) await sleep(PREVIEW_SCRAPE_DELAY);
        
        const previewUrl = await fetchPreviewUrl(song.spotifyUri);
        if (previewUrl) {
          enriched.previewUrl = previewUrl;
          updates.preview = true;
          console.log(`  ✓ Preview URL found`);
        } else {
          console.log(`  ✗ No preview URL available`);
        }
      } catch (previewError) {
        console.warn(`  ⚠ Preview URL fetch failed:`, previewError.message);
      }
    }

    // Step 4: Classify as international
    const wasInternational = enriched.isInternational;
    enriched.isInternational = classifyAsInternational(enriched);
    
    if (enriched.isInternational !== wasInternational) {
      updates.classification = true;
      console.log(`  ✓ International: ${enriched.isInternational}`);
    }

    // Log summary
    const updatedFields = Object.keys(updates).filter(k => updates[k]);
    if (updatedFields.length > 0) {
      console.log(`  → Updated: ${updatedFields.join(', ')}`);
    } else {
      console.log(`  → No updates needed`);
    }

    return enriched;

  } catch (error) {
    console.error(`[SongEnrichment] Error enriching song:`, error);
    return enriched; // Return partially enriched song
  }
}

/**
 * Enrich multiple songs in batch
 * 
 * @param {Array} songs - Array of song objects to enrich
 * @param {Object} options - Enrichment options
 * @param {Function} onProgress - Progress callback (current, total)
 * @returns {Array} Array of enriched songs
 */
async function enrichBatch(songs, options = {}, onProgress = null) {
  console.log(`[SongEnrichment] Starting batch enrichment of ${songs.length} songs`);
  
  const enriched = [];
  const stats = {
    total: songs.length,
    processed: 0,
    updated: 0,
    errors: 0
  };

  for (let i = 0; i < songs.length; i++) {
    const song = songs[i];
    stats.processed++;

    try {
      const enrichedSong = await enrichSong(song, options);
      enriched.push(enrichedSong);
      
      // Check if any fields were actually updated
      const hasUpdates = 
        enrichedSong.genre !== song.genre ||
        enrichedSong.geography !== song.geography ||
        enrichedSong.previewUrl !== song.previewUrl ||
        enrichedSong.isInternational !== song.isInternational;
      
      if (hasUpdates) {
        stats.updated++;
      }

      // Progress callback
      if (onProgress) {
        onProgress(stats.processed, stats.total);
      }

      // Progress logging every 50 songs
      if (stats.processed % 50 === 0) {
        console.log(`  Progress: ${stats.processed}/${stats.total} (${Math.round(stats.processed/stats.total*100)}%)`);
      }

    } catch (error) {
      console.error(`  Error processing song ${i + 1}:`, error.message);
      stats.errors++;
      enriched.push(song); // Keep original on error
    }
  }

  console.log(`[SongEnrichment] Batch complete:`);
  console.log(`  - Processed: ${stats.processed}`);
  console.log(`  - Updated: ${stats.updated}`);
  console.log(`  - Errors: ${stats.errors}`);

  return enriched;
}

module.exports = {
  enrichSong,
  enrichBatch,
  fetchPreviewUrl,
  classifyAsInternational
};
