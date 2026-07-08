// Apple Music catalog client (MusicKit developer token + ISRC/search lookup).
// Used by the admin enrichment endpoint to attach Apple preview URLs and album
// art to curated songs, replacing the scraped Spotify preview pipeline for
// consumer-facing playback.
//
// Env (see .env.example):
//   APPLE_MUSIC_TEAM_ID          - 10-char Apple Developer Team ID
//   APPLE_MUSIC_KEY_ID           - 10-char MusicKit key ID
//   APPLE_MUSIC_PRIVATE_KEY      - .p8 contents (PEM; \n-escaped OK), or
//   APPLE_MUSIC_PRIVATE_KEY_PATH - absolute path to the .p8 file
const fs = require('fs');
const crypto = require('crypto');

const API_BASE = 'https://api.music.apple.com/v1';
const TOKEN_TTL_S = 12 * 3600; // mint 12h tokens, refresh after ~11h
const ARTWORK_SIZE = '640x640';

let _token = null;
let _tokenExp = 0;

function isConfigured() {
  return !!(process.env.APPLE_MUSIC_TEAM_ID && process.env.APPLE_MUSIC_KEY_ID &&
    (process.env.APPLE_MUSIC_PRIVATE_KEY || process.env.APPLE_MUSIC_PRIVATE_KEY_PATH));
}

// Reconstruct a valid PEM even if newlines were mangled in transit (a common
// problem when a .p8 is pasted into an env var or a hosting "secret file" —
// newlines get escaped as literal "\n" or collapsed entirely, which makes
// OpenSSL fail with "DECODER routines::unsupported").
function normalizePem(raw) {
  let k = String(raw).trim().replace(/\\n/g, '\n').replace(/\r/g, '');
  if (!k.includes('\n')) {
    const m = k.match(/-----BEGIN ([A-Z0-9 ]+)-----(.*?)-----END \1-----/);
    if (m) {
      const body = m[2].replace(/\s+/g, '').match(/.{1,64}/g).join('\n');
      k = `-----BEGIN ${m[1]}-----\n${body}\n-----END ${m[1]}-----`;
    }
  }
  return k.endsWith('\n') ? k : k + '\n';
}

function privateKey() {
  const raw = process.env.APPLE_MUSIC_PRIVATE_KEY
    || fs.readFileSync(process.env.APPLE_MUSIC_PRIVATE_KEY_PATH, 'utf8');
  return normalizePem(raw);
}

function getDeveloperToken() {
  const now = Math.floor(Date.now() / 1000);
  if (_token && now < _tokenExp - 3600) return _token;
  const b64url = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const header = { alg: 'ES256', kid: process.env.APPLE_MUSIC_KEY_ID };
  const payload = { iss: process.env.APPLE_MUSIC_TEAM_ID, iat: now, exp: now + TOKEN_TTL_S };
  const input = `${b64url(header)}.${b64url(payload)}`;
  const sign = crypto.createSign('SHA256');
  sign.update(input);
  const sig = sign.sign({ key: privateKey(), dsaEncoding: 'ieee-p1363' });
  _token = `${input}.${sig.toString('base64url')}`;
  _tokenExp = now + TOKEN_TTL_S;
  return _token;
}

async function amGet(pathAndQuery, { retries = 4 } = {}) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetch(`${API_BASE}${pathAndQuery}`, {
      headers: { Authorization: `Bearer ${getDeveloperToken()}` },
    });
    if (res.status === 429 || res.status >= 500) {
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
      continue;
    }
    if (!res.ok) throw new Error(`Apple Music API ${res.status} for ${pathAndQuery}`);
    return res.json();
  }
  throw new Error(`Apple Music API retries exhausted for ${pathAndQuery}`);
}

// Song attributes -> the fields we store on curated songs.
function toResult(attrs, songId) {
  return {
    appleSongId: String(songId),
    applePreviewUrl: attrs.previews?.[0]?.url || null,
    appleAlbumArt: attrs.artwork?.url
      ? attrs.artwork.url.replace('{w}x{h}', ARTWORK_SIZE)
      : null,
  };
}

// Resolve up to 25 ISRCs at once. Returns Map<isrc, result>; when several
// releases share an ISRC (single/album/compilation) prefer one with a preview.
async function resolveIsrcBatch(isrcs, storefront) {
  const out = new Map();
  if (!isrcs.length) return out;
  const data = await amGet(
    `/catalog/${storefront}/songs?filter[isrc]=${encodeURIComponent(isrcs.join(','))}`
  );
  for (const d of data?.data || []) {
    const a = d.attributes;
    if (!a?.isrc) continue;
    const cur = toResult(a, d.id);
    const prev = out.get(a.isrc);
    if (!prev || (!prev.applePreviewUrl && cur.applePreviewUrl)) out.set(a.isrc, cur);
  }
  return out;
}

// Fallback for songs Apple has no ISRC match for.
async function searchSong(artist, title, storefront) {
  const term = encodeURIComponent(`${artist} ${title}`.slice(0, 120));
  const data = await amGet(
    `/catalog/${storefront}/search?types=songs&limit=1&term=${term}`
  );
  const d = data?.results?.songs?.data?.[0];
  return d ? toResult(d.attributes, d.id) : null;
}

module.exports = { isConfigured, getDeveloperToken, resolveIsrcBatch, searchSong };
