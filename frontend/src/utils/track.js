// Lightweight, privacy-first pageview tracking.
// Sends a single beacon per load to the backend, which aggregates visits for
// the admin dashboard. No cookies, no third parties — just a random visitor id
// in localStorage so we can count unique visitors.
//
// Nothing here runs until the visitor opts in (see utils/consent.js). Before
// that we write no id and send no beacon; a pageview that happens while the
// banner is still open is held in memory and flushed only if they say yes.

import { API_BASE_URL } from '../config';
import { hasAnalyticsConsent, onConsentChange } from './consent';

const VID_KEY = 'bt_vid';
const CAMPAIGN_PARAM_MAP = {
  utm_source: 'utmSource',
  utm_medium: 'utmMedium',
  utm_campaign: 'utmCampaign',
  utm_content: 'utmContent',
};

export function readCampaignParams(search = (typeof window !== 'undefined' ? window.location.search : '')) {
  const params = new URLSearchParams(search || '');
  return Object.fromEntries(
    Object.entries(CAMPAIGN_PARAM_MAP).map(([queryKey, payloadKey]) => [
      payloadKey,
      params.get(queryKey) || null,
    ])
  );
}

export function appendCampaignParams(url, search = (typeof window !== 'undefined' ? window.location.search : '')) {
  const destination = new URL(url);
  const source = new URLSearchParams(search || '');
  Object.keys(CAMPAIGN_PARAM_MAP).forEach((key) => {
    const value = source.get(key);
    if (value) destination.searchParams.set(key, value);
  });
  return destination.toString();
}

/** IANA timezone, used server-side to infer a country without touching IPs. */
function getTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch (e) {
    return null;
  }
}

export function getVisitorId() {
  if (!hasAnalyticsConsent()) return null;
  try {
    let id = localStorage.getItem(VID_KEY);
    if (!id) {
      id = (crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`);
      localStorage.setItem(VID_KEY, id);
    }
    return id;
  } catch (e) {
    // Private mode / storage disabled — visit still counts, just not as unique.
    return null;
  }
}

// Beacons raised before the visitor answered the banner. Flushed on "yes",
// dropped on "no".
let pendingPayloads = [];

function sendTrackingPayload(payload) {
  if (!hasAnalyticsConsent()) {
    if (pendingPayloads.length < 10) pendingPayloads.push(payload);
    return;
  }
  postTrackingPayload(payload);
}

function postTrackingPayload(payload) {
  fetch(`${API_BASE_URL}/api/track`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    keepalive: true,
  }).catch(() => {});
}

/**
 * Record a pageview. `site` is 'landing' or 'game'.
 */
export function trackPageview(site) {
  try {
    const campaign = readCampaignParams();
    const payload = {
      site,
      path: window.location.pathname,
      referrer: document.referrer || '',
      visitorId: getVisitorId(),
      timezone: getTimezone(),
      ...campaign,
    };
    sendTrackingPayload(payload);
  } catch (e) {
    // Tracking must never break the app.
  }
}


/**
 * Record an explicit conversion action without delaying navigation.
 */
export function trackEvent(event, target, site = 'landing', meta) {
  try {
    sendTrackingPayload({
      event,
      target,
      site,
      meta: meta || undefined,
      path: window.location.pathname,
      referrer: document.referrer || '',
      visitorId: getVisitorId(),
      timezone: getTimezone(),
      ...readCampaignParams(),
    });
  } catch (e) {
    // Tracking must never break the app.
  }
}

/**
 * Record a step in the play funnel, so the admin dashboard can show where
 * people drop out between arriving and actually finishing a game.
 */
export function trackFunnel(step) {
  trackEvent('funnel', step, 'game');
}

/** Record that a preview clip refused to play, with a short reason. */
export function trackAudioFailure(reason, meta) {
  trackEvent('audio_failure', String(reason || 'unknown').slice(0, 60), 'game', meta);
}

/**
 * Report a client-side crash to the backend so browser-only bugs show up in
 * admin next to server errors. Deduplicated per page load: one repeating error
 * must not flood the log.
 */
const reportedErrors = new Set();

export function reportClientError(errorType, error, extra = {}) {
  try {
    const message = String(error?.message || error || 'Unknown error').slice(0, 500);
    const key = `${errorType}|${message}`;
    if (reportedErrors.has(key) || reportedErrors.size > 20) return;
    reportedErrors.add(key);

    fetch(`${API_BASE_URL}/api/client-error`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        errorType,
        message,
        stack: String(error?.stack || '').slice(0, 1500),
        path: window.location.pathname,
        visitorId: getVisitorId(),
        ...extra,
      }),
      keepalive: true,
    }).catch(() => {});
  } catch (e) {
    // Reporting must never break the app.
  }
}

// On "yes", stamp the held beacons with the now-available visitor id and send
// them. On "no", throw them away.
onConsentChange((value) => {
  const queued = pendingPayloads;
  pendingPayloads = [];
  if (value !== 'granted') return;
  const visitorId = getVisitorId();
  queued.forEach((payload) => postTrackingPayload({ ...payload, visitorId }));
});

/** Catch uncaught errors and rejected promises once per page. */
export function installErrorReporting() {
  if (typeof window === 'undefined' || window.__beatablyErrorReporting) return;
  window.__beatablyErrorReporting = true;
  window.addEventListener('error', (event) => {
    reportClientError('client_js', event.error || { message: event.message });
  });
  window.addEventListener('unhandledrejection', (event) => {
    reportClientError('client_unhandled_rejection', event.reason);
  });
}
