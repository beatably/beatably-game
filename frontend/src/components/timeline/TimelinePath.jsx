import React from 'react';

// Neon-tube path: a wide blurred magenta glow layer under a thin 4px core
// stroked with the diagonal purple→magenta→cyan gradient (iOS pathLayers).
// `trim` (0–1) grows the path in via pathLength/dash; `opacity` crossfades
// the old path out during placement animation.
export function PathPair({ d, trim = null, opacity = 1 }) {
  if (!d) return null;
  const trimProps =
    trim != null
      ? { pathLength: 1, strokeDasharray: 1, strokeDashoffset: 1 - Math.min(Math.max(trim, 0), 1) }
      : {};
  return (
    <g style={{ opacity }}>
      <path
        d={d}
        stroke="rgba(255, 20, 147, 0.6)"
        strokeWidth="30"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
        // SVG filter (not CSS `filter: blur`): mobile Safari drops/ignores CSS
        // filters on SVG children, which left this glow stroke rendering hard
        // and visually distorting the neon path. feGaussianBlur is honored.
        filter="url(#beat-path-blur)"
        style={{ opacity: 0.18 }}
        {...trimProps}
      />
      <path
        d={d}
        stroke="url(#beat-path-gradient)"
        strokeWidth="4"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
        {...trimProps}
      />
    </g>
  );
}

export function PathGradientDefs({ width = 0, height = 0 }) {
  // Blur-filter region in user space (pixels). objectBoundingBox would collapse
  // on a zero-height horizontal path (same reason the gradient uses
  // userSpaceOnUse), so span the container plus a margin for the glow bleed.
  const w = Math.max(width, 1);
  const h = Math.max(height, 1);
  return (
    <defs>
      <linearGradient
        id="beat-path-gradient"
        gradientUnits="userSpaceOnUse"
        x1="0" y1="0" x2="100%" y2="100%"
      >
        <stop offset="0%" stopColor="rgba(153, 69, 255, 0.65)" />
        <stop offset="50%" stopColor="rgba(255, 20, 147, 0.55)" />
        <stop offset="100%" stopColor="rgba(0, 206, 209, 0.55)" />
      </linearGradient>
      <filter
        id="beat-path-blur"
        filterUnits="userSpaceOnUse"
        x={-60}
        y={-60}
        width={w + 120}
        height={h + 120}
      >
        <feGaussianBlur stdDeviation="12" />
      </filter>
    </defs>
  );
}
