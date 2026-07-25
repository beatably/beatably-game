// Lightweight, privacy-first pageview tracking.
// Sends a single beacon per load to the backend, which aggregates visits for
// the admin dashboard. No cookies, no third parties — just a random visitor id
// in localStorage so we can count unique visitors.

import { API_BASE_URL } from '../config';

const VID_KEY = 'bt_vid';

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
    const params = new URLSearchParams(window.location.search);
    const payload = {
      site,
      path: window.location.pathname,
      referrer: document.referrer || '',
      visitorId: getVisitorId(),
      utmSource: params.get('utm_source') || null,
      utmMedium: params.get('utm_medium') || null,
      utmCampaign: params.get('utm_campaign') || null,
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
