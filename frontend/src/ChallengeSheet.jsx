import React from 'react';

// Challenge-resolved outcome icon (iOS ChallengeResolvedOverlay):
// trophy (magenta) when the challenge was won, shield (green) when defended,
// x-circle (magenta) when both were wrong.
export function ResolvedIcon({ kind }) {
  const color = kind === 'defended' ? '#22C55E' : '#FF1493';
  const glow = kind === 'defended' ? '34, 197, 94' : '255, 20, 147';
  const paths = {
    won: (
      <path d="M8 21h8m-4-4v4m-6-17h12v5a6 6 0 0 1-12 0V4Zm12 1h2a1 1 0 0 1 1 1v1a3 3 0 0 1-3 3M6 5H4a1 1 0 0 0-1 1v1a3 3 0 0 0 3 3" />
    ),
    defended: <path d="M12 3l8 3v5c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6l8-3Z" />,
    none: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M15 9l-6 6m0-6l6 6" />
      </>
    ),
  };
  return (
    <span
      className="inline-flex items-center justify-center"
      style={{ color, filter: `drop-shadow(0 0 6px rgba(${glow}, 0.7))` }}
    >
      <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        {paths[kind] || paths.none}
      </svg>
    </span>
  );
}

const blurOnTouch = (e) => e.currentTarget.blur();

// Footer action button (iOS BeatPrimaryLabel / BeatSecondaryLabel).
// w-full so a standalone button fills the row; flex-1 so paired buttons split evenly.
export function SheetButton({ variant = 'secondary', children, onClick, disabled }) {
  const base =
    'w-full flex-1 h-12 px-4 font-semibold touch-button whitespace-nowrap flex items-center justify-center gap-2 setting-button no-focus-outline rounded-xl';
  const styles =
    variant === 'primary'
      ? `${base} bg-primary hover:bg-primary/90 text-primary-foreground`
      : `${base} border border-border`;
  return (
    <button
      onClick={onClick}
      onTouchEnd={blurOnTouch}
      disabled={disabled}
      className={styles}
      style={
        variant === 'primary'
          ? { WebkitTapHighlightColor: 'transparent' }
          : { background: 'transparent', WebkitTapHighlightColor: 'transparent' }
      }
    >
      {children}
    </button>
  );
}
