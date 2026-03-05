/**
 * Geography detection (POC)
 * - Uses MusicBrainz artist country + Spotify artist genres to infer origin market
 * - Returns ISO 3166-1 alpha-2 country codes (e.g. "SE", "US", "GB")
 */
const axios = require('axios');
const querystring = require('querystring');
const { config } = require('./config');

// --- Helpers ---
function norm(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // strip accents
    .replace(/\s+/g, ' ')
    .trim();
}

const REGION_GENRE_MAP = [
  { hints: ['swedish', 'sweden', 'scandipop'], code: 'SE' },
  { hints: ['norwegian', 'norway'], code: 'NO' },
  { hints: ['danish', 'denmark'], code: 'DK' },
  { hints: ['finnish', 'finland'], code: 'FI' },
  { hints: ['icelandic', 'iceland'], code: 'IS' },
  { hints: ['k-pop', 'kpop'], code: 'KR' },
  { hints: ['j-pop', 'jpop'], code: 'JP' },
  { hints: ['french', 'france'], code: 'FR' },
  { hints: ['german', 'germany'], code: 'DE' },
  { hints: ['italian', 'italy'], code: 'IT' },
  { hints: ['spanish', 'spain'], code: 'ES' },
  { hints: ['portuguese', 'brazilian', 'brazil'], code: 'BR' },
  { hints: ['mexican', 'mexico'], code: 'MX' },
  { hints: ['argentinian', 'argentine', 'argentina'], code: 'AR' },
  { hints: ['colombian', 'colombia'], code: 'CO' },
  { hints: ['dutch', 'netherlands'], code: 'NL' },
  { hints: ['belgian', 'belgium'], code: 'BE' },
  { hints: ['polish', 'poland'], code: 'PL' },
  { hints: ['czech', 'czechia', 'czech republic'], code: 'CZ' },
  { hints: ['austrian', 'austria'], code: 'AT' },
  { hints: ['swiss', 'switzerland'], code: 'CH' },
  { hints: ['irish', 'ireland'], code: 'IE' },
  { hints: ['scottish'], code: 'GB' },
  { hints: ['british', 'uk', 'english'], code: 'GB' },
  { hints: ['canadian', 'canada'], code: 'CA' },
  { hints: ['australian', 'australia'], code: 'AU' },
  { hints: ['new zealand', 'kiwi'], code: 'NZ' }
];

function mapGenresToCountry(genres = []) {
  const gs = (genres || []).map(norm);
  for (const entry of REGION_GENRE_MAP) {
    if (entry.hints.some(h => gs.some(g => g.includes(h)))) {
      return entry.code;
    }
  }
  return null;
}

// --- Spotify: client credentials token (app-only) ---
let __clientToken = null;
let __clientTokenExpiry = 0;

async function getClientToken() {
  if (__clientToken && Date.now() < __clientTokenExpiry) return __clientToken;
  const res = await axios.post(
    'https://accounts.spotify.com/api/token',
    querystring.stringify({
      grant_type: 'client_credentials',
      client_id: process.env.SPOTIFY_CLIENT_ID,
      client_secret: process.env.SPOTIFY_CLIENT_SECRET
    }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 12000 }
  );
  __clientToken = res.data.access_token;
  __clientTokenExpiry = Date.now() + (Number(res.data.expires_in || 3600) * 1000) - 60000;
  return __clientToken;
}

async function spotifySearchArtistByName(name) {
  try {
    const token = await getClientToken();
    const resp = await axios.get('https://api.spotify.com/v1/search', {
      headers: { Authorization: `Bearer ${token}` },
      params: { q: name, type: 'artist', limit: 3 }
    });
    const items = resp?.data?.artists?.items || [];
    // Prefer exact (normalized) name match; otherwise top item
    const n = norm(name);
    const exact = items.find(a => norm(a.name) === n);
    return exact || items[0] || null;
  } catch (e) {
    return null;
  }
}

// --- MusicBrainz: artist country + genre lookup ---
const MB_BASE = 'https://musicbrainz.org/ws/2';

// MusicBrainz tag to canonical genre mapping
const MB_GENRE_MAP = [
  // Electronic/Dance
  { tags: ['electronic', 'edm', 'house', 'techno', 'trance', 'dubstep', 'drum and bass', 'dnb', 'electro', 'synthpop', 'electropop', 'dance', 'disco', 'dance-pop'], genre: 'electronic' },

  // Hip-Hop/Rap
  { tags: ['hip hop', 'hip-hop', 'rap', 'trap', 'grime', 'drill', 'gangsta rap', 'conscious hip hop', 'old school hip hop'], genre: 'hip-hop' },

  // Rock variants (including metal, post-hardcore, blues rock etc.)
  { tags: ['rock', 'hard rock', 'classic rock', 'alternative rock', 'punk rock', 'punk', 'metal', 'heavy metal', 'death metal', 'black metal', 'thrash metal', 'progressive rock', 'grunge', 'emo', 'post-rock', 'garage rock', 'blues rock', 'post-grunge', 'nu metal', 'rap rock', 'rap metal', 'neo-psychedelia', 'psychedelic rock', 'psychedelic pop', 'post-hardcore', 'melodic hardcore', 'easycore', 'power metal', 'speed metal', 'stoner rock', 'doom metal', 'glam rock', 'indie metal'], genre: 'rock' },

  // Pop variants
  { tags: ['pop', 'pop rock', 'dance pop', 'teen pop', 'k-pop', 'j-pop', 'europop', 'bubblegum pop', 'power pop'], genre: 'pop' },

  // Indie/Alternative
  { tags: ['indie', 'indie rock', 'indie pop', 'alternative', 'indie folk', 'indie electronic', 'lo-fi', 'lofi', 'shoegaze', 'dream pop', 'art rock'], genre: 'indie' },

  // R&B/Soul/Funk → pop
  { tags: ['r&b', 'rnb', 'soul', 'funk', 'neo-soul', 'contemporary r&b', 'motown'], genre: 'pop' },

  // Country/Folk → indie
  { tags: ['country', 'folk', 'americana', 'bluegrass', 'country rock', 'folk rock', 'singer-songwriter', 'folk pop', 'indie folk', 'stomp and holler'], genre: 'indie' },

  // Jazz/Blues → indie
  { tags: ['jazz', 'blues', 'smooth jazz', 'bebop', 'swing', 'fusion'], genre: 'indie' },

  // Classical/Instrumental → indie
  { tags: ['classical', 'orchestral', 'instrumental', 'ambient', 'new age', 'soundtrack'], genre: 'indie' }
];

// Takes array of {name, count} tag objects (or plain strings for backward compat).
// Accumulates votes per genre bucket and returns { primary, secondary }.
// secondary is only set if its vote total is ≥25% of primary's.
function mapMusicBrainzTagsToGenres(tagObjects = []) {
  const bucketVotes = {};

  for (const tagObj of tagObjects) {
    const tagName = norm(String(tagObj.name || tagObj || ''));
    const votes = Number(tagObj.count) || 1;

    for (const mapping of MB_GENRE_MAP) {
      let matched = false;
      for (const tagPattern of mapping.tags) {
        if (tagName.includes(tagPattern) || tagPattern.includes(tagName)) {
          bucketVotes[mapping.genre] = (bucketVotes[mapping.genre] || 0) + votes;
          matched = true;
          break; // one tag → first matching bucket only
        }
      }
      if (matched) break; // one tag → one bucket total
    }
  }

  const buckets = Object.keys(bucketVotes);
  if (buckets.length === 0) return { primary: null, secondary: null };

  // Sort by votes desc; ties broken alphabetically for determinism
  buckets.sort((a, b) => bucketVotes[b] - bucketVotes[a] || a.localeCompare(b));

  const primary = buckets[0];
  const primaryVotes = bucketVotes[primary];
  const secondary = (buckets[1] && bucketVotes[buckets[1]] >= primaryVotes * 0.25)
    ? buckets[1]
    : null;

  return { primary, secondary };
}

async function mbSearchArtistCountry(artistName) {
  try {
    const resp = await axios.get(`${MB_BASE}/artist`, {
      params: { query: `artist:"${artistName}"`, fmt: 'json', limit: 5, offset: 0 },
      headers: { 'User-Agent': (config.musicbrainz && config.musicbrainz.userAgent) || 'beatably/1.0 (geodetect)' },
      timeout: 12000
    });
    const arts = Array.isArray(resp.data?.artists) ? resp.data.artists : [];
    if (!arts.length) return null;

    const n = norm(artistName);
    let best = arts.find(a => norm(a.name) === n) || arts[0];
    if (!best) return null;

    // Prefer explicit country, else from area codes
    let code = null;
    if (best.country) code = String(best.country).toUpperCase();
    else if (best.area && Array.isArray(best.area['iso-3166-1-codes']) && best.area['iso-3166-1-codes'][0]) {
      code = String(best.area['iso-3166-1-codes'][0]).toUpperCase();
    } else if (best['begin-area'] && Array.isArray(best['begin-area']['iso-3166-1-codes']) && best['begin-area']['iso-3166-1-codes'][0]) {
      code = String(best['begin-area']['iso-3166-1-codes'][0]).toUpperCase();
    }

    if (!code) return null;
    return { code, source: 'musicbrainz', match: best.name, score: best.score };
  } catch (e) {
    return null;
  }
}

async function mbSearchArtistGenres(artistName) {
  try {
    const resp = await axios.get(`${MB_BASE}/artist`, {
      params: { 
        query: `artist:"${artistName}"`, 
        fmt: 'json', 
        limit: 3, 
        offset: 0,
        inc: 'tags' // Include tags/genres in response
      },
      headers: { 'User-Agent': (config.musicbrainz && config.musicbrainz.userAgent) || 'beatably/1.0 (genredetect)' },
      timeout: 12000
    });
    
    const arts = Array.isArray(resp.data?.artists) ? resp.data.artists : [];
    if (!arts.length) return null;

    const n = norm(artistName);
    let best = arts.find(a => norm(a.name) === n) || arts[0];
    if (!best || !Array.isArray(best.tags)) return null;

    // Keep tag objects with vote counts for weighted genre detection
    const tagObjects = best.tags
      .filter(tag => tag.count && tag.count >= 1)
      .sort((a, b) => (b.count || 0) - (a.count || 0))
      .slice(0, 20); // Top 20 — more data improves vote weighting

    if (!tagObjects.length) return null;

    const { primary, secondary } = mapMusicBrainzTagsToGenres(tagObjects);

    return {
      genres: [primary, secondary].filter(Boolean),
      primary,
      secondary,
      rawTags: tagObjects.map(t => t.name),
      source: 'musicbrainz',
      match: best.name,
      confidence: primary ? 0.8 : 0.1
    };
  } catch (e) {
    return null;
  }
}

/**
 * Detect geography for an artist by name, using:
 * - MusicBrainz artist country (primary)
 * - Spotify artist genres (secondary hints)
 */
async function detectGeographyForArtist(artistName) {
  const details = { artist: artistName, candidates: [] };

  // 1) MusicBrainz country
  const mb = await mbSearchArtistCountry(artistName);
  if (mb && mb.code) {
    details.candidates.push({ source: 'musicbrainz', code: mb.code, confidence: 0.9, reason: 'Artist country', meta: mb });
  }

  // 2) Spotify genres
  const sp = await spotifySearchArtistByName(artistName);
  if (sp && Array.isArray(sp.genres) && sp.genres.length) {
    const gCode = mapGenresToCountry(sp.genres);
    if (gCode) {
      details.candidates.push({
        source: 'spotify-genres',
        code: gCode,
        confidence: 0.7,
        reason: `Genre hints: ${sp.genres.slice(0, 5).join(', ')}`,
        meta: { id: sp.id, name: sp.name }
      });
    }
  }

  // Decide
  if (details.candidates.length === 0) {
    return { geography: null, confidence: 0, source: null, details };
  }

  // If multiple and agree -> boost
  const codes = Array.from(new Set(details.candidates.map(c => c.code)));
  if (codes.length === 1) {
    const code = codes[0];
    const maxConf = Math.max(...details.candidates.map(c => c.confidence));
    const conf = Math.min(0.98, Math.max(0.9, maxConf + 0.05));
    return { geography: code, confidence: conf, source: 'consensus', details };
  }

  // If disagree, prefer MusicBrainz but lower confidence
  const mbPick = details.candidates.find(c => c.source === 'musicbrainz');
  if (mbPick) {
    return { geography: mbPick.code, confidence: 0.6, source: 'musicbrainz-preferred', details };
  }

  // Otherwise pick highest confidence
  const best = details.candidates.sort((a, b) => b.confidence - a.confidence)[0];
  return { geography: best.code, confidence: best.confidence, source: best.source, details };
}

/**
 * Detect geography for a curated item-like object: { artist, title, ... }
 */
async function detectGeographyForItem(item) {
  const artistName = item?.artist || '';
  if (!artistName) {
    return { geography: null, confidence: 0, source: null, details: { reason: 'missing artist' } };
  }
  return detectGeographyForArtist(artistName);
}

/**
 * Detect genres for an artist using hybrid MusicBrainz + Spotify approach
 */
async function detectGenresForArtist(artistName) {
  const results = { artist: artistName, genres: [], primary: null, secondary: null, sources: [] };

  // 1) Try MusicBrainz first — vote-weighted, returns primary + optional secondary
  const mbGenres = await mbSearchArtistGenres(artistName);
  if (mbGenres && mbGenres.primary) {
    results.primary = mbGenres.primary;
    results.secondary = mbGenres.secondary || null;
    results.genres = mbGenres.genres; // [primary] or [primary, secondary]
    results.sources.push({
      source: 'musicbrainz',
      genres: mbGenres.genres,
      primary: mbGenres.primary,
      secondary: mbGenres.secondary,
      rawTags: mbGenres.rawTags,
      confidence: mbGenres.confidence
    });
  }

  // 2) Spotify fallback — only if MusicBrainz found nothing
  if (!results.primary) {
    try {
      const sp = await spotifySearchArtistByName(artistName);
      if (sp && Array.isArray(sp.genres) && sp.genres.length) {
        const spotifyMapped = mapSpotifyGenres(sp.genres);
        if (spotifyMapped.length > 0) {
          results.primary = spotifyMapped[0];
          results.secondary = null; // Spotify path: single genre only
          results.genres = [results.primary];
          results.sources.push({
            source: 'spotify',
            genres: results.genres,
            primary: results.primary,
            secondary: null,
            rawGenres: sp.genres,
            confidence: 0.7
          });
        }
      }
    } catch (e) {
      // Spotify might be rate limited, that's ok
    }
  }

  // 3) Final fallback to 'pop' if nothing found
  if (!results.primary) {
    results.primary = 'pop';
    results.secondary = null;
    results.genres = ['pop'];
    results.sources.push({
      source: 'fallback',
      genres: ['pop'],
      primary: 'pop',
      secondary: null,
      confidence: 0.1,
      reason: 'No genre data found, using pop as fallback'
    });
  }

  return results;
}

// Helper function to map Spotify genres (from reclassify-batched.js)
function mapSpotifyGenres(genresArr) {
  const g = (genresArr || []).map(s => String(s || '').toLowerCase());
  const genres = [];
  
  const has = (...keys) => keys.some(k => g.some(s => s.includes(k)));
  
  if (has('hip hop', 'rap', 'trap', 'grime', 'drill')) genres.push('hip-hop');
  if (has('rock', 'metal', 'punk', 'grunge', 'emo')) genres.push('rock');
  if (has('electronic', 'edm', 'house', 'techno', 'trance', 'dubstep', 'electro', 'drum and bass', 'dnb')) genres.push('electronic');
  if (has('indie', 'alt', 'alternative', 'shoegaze', 'lo-fi', 'lofi')) genres.push('indie');
  if (has('pop', 'k-pop', 'dance pop', 'synthpop', 'electropop', 'teen pop', 'r&b', 'soul', 'funk')) genres.push('pop');
  
  return genres.length > 0 ? genres : [];
}

module.exports = {
  detectGeographyForArtist,
  detectGeographyForItem,
  detectGenresForArtist,
  mbSearchArtistGenres,
  // expose internals for testing if needed
  _internals: {
    mapGenresToCountry,
    spotifySearchArtistByName,
    mbSearchArtistCountry,
    mapMusicBrainzTagsToGenres,
    mapSpotifyGenres
  }
};
