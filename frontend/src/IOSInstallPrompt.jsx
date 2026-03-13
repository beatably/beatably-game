import React, { useState, useEffect } from "react";

const STORAGE_KEY = "beatably_ios_prompt_dismissed";

function isIOSSafari() {
  const ua = navigator.userAgent;
  const iOS = /iPad|iPhone|iPod/.test(ua);
  const webkit = /WebKit/.test(ua);
  const chrome = /CriOS|Chrome/.test(ua);
  return iOS && webkit && !chrome;
}

function isStandalone() {
  return (
    window.navigator.standalone === true ||
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches
  );
}

export default function IOSInstallPrompt() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (isIOSSafari() && !isStandalone() && !localStorage.getItem(STORAGE_KEY)) {
      // Small delay so it doesn't pop immediately on load
      const t = setTimeout(() => setVisible(true), 1500);
      return () => clearTimeout(t);
    }
  }, []);

  if (!visible) return null;

  const dismiss = () => {
    localStorage.setItem(STORAGE_KEY, "1");
    setVisible(false);
  };

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-[9999] px-4 pb-6"
      style={{ paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }}
    >
      <div className="rounded-2xl p-4 flex items-start gap-3"
        style={{ background: "rgba(30, 20, 50, 0.97)", border: "1px solid rgba(255,255,255,0.12)" }}>

        {/* App icon */}
        <img src="/img/icon-192.png" alt="Beatably" className="w-12 h-12 rounded-xl flex-shrink-0" />

        {/* Text */}
        <div className="flex-1 min-w-0">
          <p className="text-white font-semibold text-sm leading-tight mb-1">Add to Home Screen</p>
          <p className="text-white/60 text-xs leading-snug">
            Tap&nbsp;
            {/* iOS share icon */}
            <svg
              className="inline-block align-middle"
              width="14" height="14" viewBox="0 0 24 24"
              fill="none" stroke="currentColor" strokeWidth="2.2"
              strokeLinecap="round" strokeLinejoin="round"
              style={{ color: "#4A90E2", verticalAlign: "-1px" }}
            >
              <path d="M8 6H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-2" />
              <polyline points="16 6 12 2 8 6" />
              <line x1="12" y1="2" x2="12" y2="15" />
            </svg>
            &nbsp;then <span className="text-white/90 font-medium">"Add to Home Screen"</span> for the full experience.
          </p>
        </div>

        {/* Dismiss */}
        <button
          onClick={dismiss}
          className="flex-shrink-0 text-white/40 hover:text-white/80 transition-colors p-1 -mt-1 -mr-1 no-focus-outline"
          aria-label="Dismiss"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    </div>
  );
}
