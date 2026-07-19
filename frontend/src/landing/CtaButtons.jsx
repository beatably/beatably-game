import React from 'react';

export const PLAY_URL = 'https://play.beatably.app';

// No country code → Apple routes each visitor to their local App Store
// storefront (the game has SE + international regions).
export const APP_STORE_URL = 'https://apps.apple.com/app/beatably/id6788660791';

function PlayGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden="true">
      <path d="M3.5 1.868a.75.75 0 0 1 1.14-.64l8.16 4.882a.75.75 0 0 1 0 1.28l-8.16 4.882a.75.75 0 0 1-1.14-.64V1.868Z" />
    </svg>
  );
}

// The page's CTA pair: official App Store badge + the game's gradient button.
// Both are 48px tall so they sit as one row wherever they appear.
export function CtaButtons({ className = '' }) {
  return (
    <div className={`flex flex-wrap items-center gap-3 ${className}`}>
      <a href={APP_STORE_URL} className="press-scale inline-flex flex-none">
        <img
          src="/img/landing/appstore-badge.svg"
          alt="Download on the App Store"
          width={144}
          height={48}
          className="h-12 w-auto"
        />
      </a>
      <a
        href={PLAY_URL}
        className="bg-primary h-12 px-6 rounded-md text-base font-bold inline-flex items-center justify-center gap-2 press-scale whitespace-nowrap"
      >
        <PlayGlyph />
        Play in browser
      </a>
    </div>
  );
}

export default CtaButtons;
