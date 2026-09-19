import React, { useEffect, useState } from 'react';
import {
  GRANTED, DENIED, getConsent, setConsent, onConsentChange, wantsConsentSettings,
} from '../utils/consent';

// Placement keeps the call-to-action clickable while the question is open:
// on phones every button (App Store, Play, Continue) sits low, so the card goes
// to the top; on wide screens those buttons are centred, so it docks bottom-right.
const CSS = `
.bt-consent {
  position: fixed;
  z-index: 2147483000;
  right: max(12px, env(safe-area-inset-right, 0px));
  left: max(12px, env(safe-area-inset-left, 0px));
  top: calc(12px + env(safe-area-inset-top, 0px));
  background: rgba(18, 15, 38, 0.97);
  border: 1px solid rgba(153, 69, 255, 0.35);
  border-radius: 14px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.55);
  color: #E8E8F0;
  padding: 14px 16px;
  font-size: 13.5px;
  line-height: 1.5;
  -webkit-backdrop-filter: blur(10px);
  backdrop-filter: blur(10px);
}
@media (min-width: 720px) {
  .bt-consent {
    left: auto;
    top: auto;
    bottom: calc(12px + env(safe-area-inset-bottom, 0px));
    width: 340px;
  }
}
.bt-consent p { margin: 0 0 12px; }
.bt-consent a { color: #B388F5; }
.bt-consent-actions { display: flex; gap: 8px; }
/* Both buttons are identical on purpose: EU guidance treats a prominent
   "accept" beside a played-down "reject" as invalid consent. */
.bt-consent-actions button {
  flex: 1 1 0;
  padding: 9px 12px;
  border-radius: 10px;
  border: 1px solid rgba(232, 232, 240, 0.28);
  background: rgba(232, 232, 240, 0.08);
  color: #E8E8F0;
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}
.bt-consent-actions button:hover { background: rgba(232, 232, 240, 0.16); }
.bt-consent-actions button:focus-visible { outline: 2px solid #9945FF; outline-offset: 2px; }
`;

/**
 * Analytics opt-in for the landing page and the game.
 *
 * Shown once, until the visitor answers. Reopens when the page is loaded with
 * ?privacy=settings, which is how the privacy policy offers "change your choice".
 */
function ConsentBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(getConsent() === null || wantsConsentSettings());
    return onConsentChange(() => setVisible(getConsent() === null));
  }, []);

  if (!visible) return null;

  const answer = (value) => {
    setConsent(value);
    setVisible(false);
    // Drop ?privacy=settings so a refresh does not reopen the banner.
    if (wantsConsentSettings()) {
      try {
        const url = new URL(window.location.href);
        url.searchParams.delete('privacy');
        window.history.replaceState({}, '', url.toString());
      } catch (e) { /* older browsers: harmless */ }
    }
  };

  return (
    <>
      <style>{CSS}</style>
      <div className="bt-consent" role="dialog" aria-label="Analytics choice">
        <p>
          Can we count your visit? It shows us how many people play and where they
          found us. Our own counter — no ads, no third parties, no tracking across
          other sites. <a href="/privacy.html">Privacy policy</a>
        </p>
        <div className="bt-consent-actions">
          <button type="button" onClick={() => answer(DENIED)}>No thanks</button>
          <button type="button" onClick={() => answer(GRANTED)}>Yes, that&apos;s fine</button>
        </div>
      </div>
    </>
  );
}

export default ConsentBanner;
