import React, { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import SpaceBackground from '@/components/design/SpaceBackground';
import HeroCinematic from './HeroCinematic';
import Statement from './Statement';
import { ListenSection, PlaceSection, EarnSection, StealSection } from './BeatSections';
import TryItDemo from './TryItDemo';
import CtaButtons from './CtaButtons';
import { PLAY_URL } from './CtaButtons';
import { gsap, prefersReducedMotion, initSmoothScroll, revealOnEnter } from './fx';

// Marketing landing page for beatably.app. The game itself lives at
// play.beatably.app (see netlify.toml host routing). Built from the game's
// own primitives — timeline nodes, spring curves, cosmic backdrop, gradient
// CTAs — and choreographed with Lenis weighted scrolling + GSAP ScrollTrigger.

function TryIt() {
  const ref = useRef(null);
  const reduced = useMemo(prefersReducedMotion, []);

  useLayoutEffect(() => {
    if (reduced) return undefined;
    const ctx = gsap.context(() => {
      revealOnEnter(ref.current, '[data-reveal]');
    }, ref);
    return () => ctx.revert();
  }, [reduced]);

  return (
    <section
      ref={ref}
      className="max-w-3xl mx-auto px-6 py-20 sm:py-36 text-center"
      aria-labelledby="try-heading"
    >
      <p
        data-reveal
        className="text-xs sm:text-sm font-black tracking-[0.24em] uppercase text-foreground/55"
      >
        No spectators here
      </p>
      <h2 id="try-heading" data-reveal className="landing-h2 mt-3">
        Your turn.
      </h2>
      <p data-reveal className="mt-4 text-base sm:text-lg text-foreground/75">
        Umbrella — Rihanna. When did it drop? Place it on the timeline.
      </p>
      <div data-reveal className="mt-10 sm:scale-105 lg:scale-110 origin-top">
        <TryItDemo />
      </div>
    </section>
  );
}

function CtaBand() {
  const ref = useRef(null);
  const reduced = useMemo(prefersReducedMotion, []);

  useLayoutEffect(() => {
    if (reduced) return undefined;
    const ctx = gsap.context(() => {
      revealOnEnter(ref.current, '[data-reveal]');
    }, ref);
    return () => ctx.revert();
  }, [reduced]);

  return (
    <section
      ref={ref}
      className="relative px-6 py-24 sm:py-40 text-center overflow-hidden"
      aria-labelledby="cta-heading"
    >
      {/* Local glow so the finale feels lit, not boxed */}
      <div
        aria-hidden="true"
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full pointer-events-none"
        style={{
          width: '90vw',
          height: '60vh',
          background: 'rgba(153, 69, 255, 0.10)',
          filter: 'blur(90px)',
        }}
      />
      <div className="relative max-w-3xl mx-auto">
        <h2 id="cta-heading" data-reveal className="landing-display">
          Ready when
          <br />
          you are.
        </h2>
        <p data-reveal className="mt-6 text-base sm:text-xl text-foreground/75 max-w-xl mx-auto">
          Grab your friends, pick a name, and settle whose music memory actually
          holds up. First to fill their timeline wins.
        </p>
        <div data-reveal className="mt-10 flex justify-center">
          <CtaButtons className="justify-center" />
        </div>
        <p data-reveal className="mt-4 text-xs sm:text-sm text-foreground/55">
          Free in the browser · No account — pick a name and play
        </p>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="max-w-6xl mx-auto px-6 pb-10 pt-4">
      <div className="border-t border-border/60 pt-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-foreground/50">
        <p>© 2026 Beatably</p>
        <nav className="flex items-center gap-5" aria-label="Footer">
          <a href="/privacy.html" className="hover:text-foreground transition-colors">
            Privacy
          </a>
          <a href={PLAY_URL} className="hover:text-foreground transition-colors">
            Play in browser
          </a>
        </nav>
        <p>Song previews &amp; artwork from Apple Music</p>
      </div>
    </footer>
  );
}

function LandingPage() {
  useEffect(() => initSmoothScroll(), []);

  return (
    <div className="landing-page relative min-h-screen text-foreground font-sans">
      <SpaceBackground parallax={{ orbs: 0.02, stars: 0.05 }} />
      <div className="relative" style={{ zIndex: 1 }}>
        <HeroCinematic />
        <main>
          <Statement />
          <ListenSection />
          <PlaceSection />
          <EarnSection />
          <StealSection />
          <TryIt />
          <CtaBand />
        </main>
        <Footer />
      </div>
    </div>
  );
}

export default LandingPage;
