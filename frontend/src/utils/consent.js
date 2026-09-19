// Analytics consent (ePrivacy / GDPR).
//
// Swedish law (Lag 2022:482 ch. 9 § 28) covers storing *anything* on the
// visitor's device, not only cookies — localStorage counts. Reconnect data and
// game preferences are exempt because the player asked for those features.
// The analytics visitor id is not, so it needs an explicit opt-in.
//
// The choice itself is stored locally. That storage is strictly necessary: we
// cannot honour a "no" without remembering it.

import { readShared, writeShared, clearShared } from './domainStore';

const CONSENT_KEY = 'bt_consent';
// Kept in sync with utils/track.js. Duplicated rather than imported so consent
// has no dependency on the thing it gates.
const VID_KEY = 'bt_vid';
export const GRANTED = 'granted';
export const DENIED = 'denied';

const listeners = new Set();

/** 'granted' | 'denied' | null (null = not asked yet). */
export function getConsent() {
  // Shared across beatably.app and play.beatably.app, so answering on the
  // landing page is not asked again when the player opens the game.
  const value = readShared(CONSENT_KEY);
  return value === GRANTED || value === DENIED ? value : null;
}

export function hasAnalyticsConsent() {
  return getConsent() === GRANTED;
}

/** Record the visitor's choice and tell everyone who is listening. */
export function setConsent(value) {
  const next = value === GRANTED ? GRANTED : DENIED;
  writeShared(CONSENT_KEY, next);
  // The privacy policy promises that saying no removes the id, not just that
  // we stop using it. Honour that literally, on both origins.
  if (next === DENIED) clearShared(VID_KEY);
  listeners.forEach((fn) => {
    try { fn(next); } catch (e) { /* a bad listener must not block the rest */ }
  });
  return next;
}

/** Forget the choice so the banner asks again. Used by "change your choice". */
export function resetConsent() {
  clearShared(CONSENT_KEY);
  listeners.forEach((fn) => {
    try { fn(null); } catch (e) { /* ignore */ }
  });
}

export function onConsentChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// Lets the privacy page (plain HTML, outside React) reopen the banner by
// linking to /?privacy=settings — see ConsentBanner.
export const CONSENT_SETTINGS_PARAM = 'privacy';
export const CONSENT_SETTINGS_VALUE = 'settings';

export function wantsConsentSettings(search = (typeof window !== 'undefined' ? window.location.search : '')) {
  try {
    return new URLSearchParams(search || '').get(CONSENT_SETTINGS_PARAM) === CONSENT_SETTINGS_VALUE;
  } catch (e) {
    return false;
  }
}
