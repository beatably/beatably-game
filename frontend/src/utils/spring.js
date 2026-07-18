// Closed-form damped-spring progress curves matching SwiftUI's
// spring(duration:bounce:) closely enough for visual parity.
// t is seconds since the animation started; returns progress (unclamped —
// underdamped springs overshoot past 1 and oscillate back).

export function springProgress(t, duration, bounce = 0) {
  if (t <= 0) return 0;
  const omega0 = (2 * Math.PI) / duration;
  const zeta = 1 - bounce; // damping ratio: bounce 0 = critically damped
  if (zeta >= 1) {
    const a = omega0 * t;
    return 1 - Math.exp(-a) * (1 + a);
  }
  const omegaD = omega0 * Math.sqrt(1 - zeta * zeta);
  const decay = Math.exp(-zeta * omega0 * t);
  return (
    1 - decay * (Math.cos(omegaD * t) + ((zeta * omega0) / omegaD) * Math.sin(omegaD * t))
  );
}

export function easeOut(t) {
  const x = Math.min(Math.max(t, 0), 1);
  return 1 - Math.pow(1 - x, 3);
}

export function smoothstep(x, e0, e1) {
  const t = Math.min(Math.max((x - e0) / (e1 - e0), 0), 1);
  return t * t * (3 - 2 * t);
}
