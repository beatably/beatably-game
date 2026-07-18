import React, { useMemo } from "react";

// Port of iOS SpaceBackground (ios/Beatably/Components/SpaceBackground.swift):
// beatBg base + 3 blurred color orbs + 25 drifting stars on a 5x5 jittered grid.
// Star positions/colors come from a seeded RNG so the field is stable across mounts.

// mulberry32 — small deterministic PRNG (same idea as the iOS seeded generator)
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const STAR_PALETTE = [
  "rgba(153, 69, 255, 1)", // purple
  "rgba(0, 206, 209, 1)", // cyan
  "rgba(255, 20, 147, 1)", // magenta
  "rgba(255, 255, 255, 1)", // white
  "rgba(153, 69, 255, 1)",
  "rgba(0, 206, 209, 1)",
];

const ORBS = [
  {
    color: "rgba(153, 69, 255, 0.12)",
    width: "75vw",
    height: "42vh",
    left: "22%",
    top: "26%",
    blur: 72,
  },
  {
    color: "rgba(0, 206, 209, 0.09)",
    width: "80vw",
    height: "42vh",
    left: "78%",
    top: "66%",
    blur: 80,
  },
  {
    color: "rgba(255, 20, 147, 0.08)",
    width: "60vw",
    height: "36vh",
    left: "52%",
    top: "84%",
    blur: 64,
  },
];

function generateStars() {
  const rand = mulberry32(42);
  const stars = [];
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 5; col++) {
      const i = row * 5 + col;
      // 5x5 jittered grid: cell center ± up to 60% of cell size
      const x = ((col + 0.5) / 5 + (rand() - 0.5) * 0.12) * 100;
      const y = ((row + 0.5) / 5 + (rand() - 0.5) * 0.12) * 100;
      const radius = 0.8 + rand() * 1.6; // 0.8–2.4px
      const duration = 7 + rand() * 7; // 7–14s
      const delay = -rand() * duration; // desync
      const driftX = (rand() > 0.5 ? 1 : -1) * (10 + rand() * 8); // ±10–18px
      const driftY = (rand() > 0.5 ? 1 : -1) * (10 + rand() * 8);
      stars.push({
        x,
        y,
        radius,
        duration,
        delay,
        driftX,
        driftY,
        color: STAR_PALETTE[i % STAR_PALETTE.length],
      });
    }
  }
  return stars;
}

function SpaceBackground() {
  const stars = useMemo(generateStars, []);

  return (
    <div
      className="fixed inset-0 overflow-hidden pointer-events-none"
      style={{ zIndex: 0, backgroundColor: "#0C0A1A", contain: "layout paint style" }}
      aria-hidden="true"
    >
      <style>{`
        @keyframes space-star-drift {
          0%, 100% { transform: translate(0, 0); opacity: 0.25; }
          25% { transform: translate(var(--drift-x), calc(var(--drift-y) * -0.6)); opacity: 0.65; }
          50% { transform: translate(calc(var(--drift-x) * -0.4), var(--drift-y)); opacity: 0.35; }
          75% { transform: translate(calc(var(--drift-x) * 0.7), calc(var(--drift-y) * 0.5)); opacity: 0.6; }
        }
      `}</style>
      {ORBS.map((orb, i) => (
        <div
          key={i}
          className="absolute rounded-full"
          style={{
            width: orb.width,
            height: orb.height,
            left: orb.left,
            top: orb.top,
            transform: "translate(-50%, -50%)",
            backgroundColor: orb.color,
            filter: `blur(${orb.blur}px)`,
          }}
        />
      ))}
      {stars.map((star, i) => (
        <div
          key={i}
          className="absolute rounded-full"
          style={{
            left: `${star.x}%`,
            top: `${star.y}%`,
            width: `${star.radius * 2}px`,
            height: `${star.radius * 2}px`,
            backgroundColor: star.color,
            "--drift-x": `${star.driftX}px`,
            "--drift-y": `${star.driftY}px`,
            animation: `space-star-drift ${star.duration}s ease-in-out ${star.delay}s infinite`,
          }}
        />
      ))}
    </div>
  );
}

export default SpaceBackground;
