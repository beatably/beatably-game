// Motion foundation for the landing page: GSAP + ScrollTrigger + Lenis
// weighted scrolling. Everything is disabled under prefers-reduced-motion —
// components must guard their gsap contexts with prefersReducedMotion() so
// content renders in its final state with no hidden elements.
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';

gsap.registerPlugin(ScrollTrigger);

export { gsap, ScrollTrigger };

export const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Weighted smooth scrolling, synced with ScrollTrigger. Touch scrolling stays
// native (Lenis default) — the weighting applies to wheel/trackpad.
export function initSmoothScroll() {
  if (prefersReducedMotion()) return () => {};

  const lenis = new Lenis({ duration: 1.15 });
  lenis.on('scroll', ScrollTrigger.update);
  const tick = (time) => lenis.raf(time * 1000);
  gsap.ticker.add(tick);
  gsap.ticker.lagSmoothing(0);

  // Trigger positions depend on media/fonts settling.
  const refresh = () => ScrollTrigger.refresh();
  window.addEventListener('load', refresh);
  if (document.fonts?.ready) document.fonts.ready.then(refresh);

  return () => {
    window.removeEventListener('load', refresh);
    gsap.ticker.remove(tick);
    lenis.destroy();
  };
}

// Shared enter-reveal: fades/slides `targets` up once when `trigger` scrolls
// into view. Call inside a guarded gsap.context.
export function revealOnEnter(trigger, targets, { y = 48, stagger = 0.12, start = 'top 74%' } = {}) {
  gsap.from(targets, {
    y,
    opacity: 0,
    duration: 0.9,
    ease: 'power3.out',
    stagger,
    scrollTrigger: { trigger, start, once: true },
  });
}
