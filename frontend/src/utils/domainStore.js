// Storage that survives the hop between our two origins.
//
// The landing page is beatably.app and the game is play.beatably.app.
// localStorage is per-origin, so anything written on one is invisible to the
// other — which is why the consent banner used to appear twice, and why one
// person counted as two visitors.
//
// A cookie on the parent domain (.beatably.app) is readable from both. We keep
// writing localStorage too: Safari caps the lifetime of a cookie set from
// JavaScript at 7 days, so localStorage is what makes the choice stick
// long-term on whichever origin the person actually uses.

const ONE_YEAR_SECONDS = 365 * 24 * 60 * 60;

/**
 * The widest domain we may scope a cookie to. Only our own apex qualifies:
 * a Netlify preview (*.netlify.app) or localhost must not get one, because the
 * browser rejects cookies set on a public suffix.
 */
function cookieDomain() {
  try {
    const host = window.location.hostname;
    return (host === 'beatably.app' || host.endsWith('.beatably.app')) ? '.beatably.app' : null;
  } catch (e) {
    return null;
  }
}

function readCookie(key) {
  try {
    const prefix = `${encodeURIComponent(key)}=`;
    const hit = document.cookie.split('; ').find((c) => c.startsWith(prefix));
    return hit ? decodeURIComponent(hit.slice(prefix.length)) : null;
  } catch (e) {
    return null;
  }
}

function writeCookie(key, value, maxAgeSeconds) {
  try {
    const domain = cookieDomain();
    const parts = [
      `${encodeURIComponent(key)}=${encodeURIComponent(value)}`,
      'path=/',
      `max-age=${maxAgeSeconds}`,
      'SameSite=Lax',
    ];
    if (domain) parts.push(`domain=${domain}`);
    if (window.location.protocol === 'https:') parts.push('Secure');
    document.cookie = parts.join('; ');
  } catch (e) {
    // Cookies blocked: localStorage still covers the current origin.
  }
}

/** Read a value written on either origin. Backfills localStorage when the
 *  cookie is the only copy, so this origin keeps it past any cookie expiry. */
export function readShared(key) {
  let local = null;
  try {
    local = localStorage.getItem(key);
  } catch (e) {
    // private mode / storage disabled
  }
  if (local) return local;

  const fromCookie = readCookie(key);
  if (fromCookie) {
    try { localStorage.setItem(key, fromCookie); } catch (e) { /* ignore */ }
  }
  return fromCookie;
}

export function writeShared(key, value) {
  try { localStorage.setItem(key, value); } catch (e) { /* ignore */ }
  writeCookie(key, value, ONE_YEAR_SECONDS);
}

export function clearShared(key) {
  try { localStorage.removeItem(key); } catch (e) { /* ignore */ }
  writeCookie(key, '', 0);
}
