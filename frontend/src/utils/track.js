// Lightweight, privacy-first pageview tracking.
// Sends a single beacon per load to the backend, which aggregates visits for
// the admin dashboard. No cookies, no third parties — just a random visitor id
// in localStorage so we can count unique visitors.

import { API_BASE_URL } from '../config';

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

function getVisitorId() {
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
      ...campaign,
    };
    fetch(`${API_BASE_URL}/api/track`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => {});
  } catch (e) {
    // Tracking must never break the app.
  }
}
