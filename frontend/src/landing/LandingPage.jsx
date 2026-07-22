import React, { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import SpaceBackground from '@/components/design/SpaceBackground';
import HeroCinematic from './HeroCinematic';
import Statement from './Statement';
import { ListenSection, PlaceSection, EarnSection, StealSection } from './BeatSections';
import PhoneShowcase from './PhoneShowcase';
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
        A real track's playing. You know the song — but do you know the year? Tap
        the gap where it belongs.
      </p>
      <div data-reveal className="mt-10">
        <TryItDemo />
      </div>
    </section>
  );
}

// The catalog USP — Beatably's edge over similar games is a big, hand-curated
// library of songs people actually recognize (not obscure filler). Presented as
// a scannable three-stat band.
function MusicDbBand() {
  const ref = useRef(null);
  const reduced = useMemo(prefersReducedMotion, []);

  useLayoutEffect(() => {
    if (reduced) return undefined;
    const ctx = gsap.context(() => {
      revealOnEnter(ref.current, '[data-reveal]');
    }, ref);
    return () => ctx.revert();
  }, [reduced]);

  const stats = [
    { value: '3,700+', label: 'hand-picked tracks' },
    { value: '6 decades', label: '1960 to today' },
    { value: 'Every genre', label: 'pop · rock · hip-hop · more' },
  ];

  return (
    <section
      ref={ref}
      className="max-w-5xl mx-auto px-6 py-20 sm:py-32 text-center"
      aria-labelledby="catalog-heading"
    >
      <p
        data-reveal
        className="text-xs sm:text-sm font-black tracking-[0.24em] uppercase text-foreground/55"
      >
        The catalog
      </p>
      <h2 id="catalog-heading" data-reveal className="landing-h2 mt-3">
        Songs you <span className="landing-gradient-text">actually</span> know.
      </h2>
      <p data-reveal className="mt-4 text-base sm:text-lg text-foreground/75 max-w-xl mx-auto">
        Every track is curated by hand — real hits people recognize, not obscure
        filler dug up to pad a deck. That's the difference between a lucky guess
        and a genuine memory.
      </p>
      <div data-reveal className="mt-12 grid grid-cols-1 sm:grid-cols-3 gap-8 sm:gap-6">
        {stats.map((s) => (
          <div key={s.label} className="flex flex-col items-center">
            <span className="landing-gradient-text font-black leading-none text-4xl sm:text-5xl">
              {s.value}
            </span>
            <span className="mt-2 text-xs sm:text-sm font-bold tracking-wide text-foreground/60">
              {s.label}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

// Two ways to play — party (multiplayer) and solo survival streak.
function ModesBand() {
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
      className="max-w-4xl mx-auto px-6 py-20 sm:py-32 text-center"
      aria-labelledby="modes-heading"
    >
      <p
        data-reveal
        className="text-xs sm:text-sm font-black tracking-[0.24em] uppercase text-foreground/55"
      >
        Two ways to play
      </p>
      <h2 id="modes-heading" data-reveal className="landing-h2 mt-3">
        Bring friends — or go it alone.
      </h2>
      <div data-reveal className="mt-12 grid grid-cols-1 sm:grid-cols-2 gap-5 text-left">
        <div className="beat-card p-6">
          <div className="text-lg font-black" style={{ color: '#9945FF' }}>
            Party mode
          </div>
          <p className="mt-2 text-sm sm:text-base text-foreground/75 leading-relaxed">
            Gather round one device, pass it, and place your song. Earn coins,
            challenge each other's cards — first to fill their timeline wins.
          </p>
        </div>
        <div className="beat-card p-6">
          <div className="text-lg font-black" style={{ color: '#00CED1' }}>
            Solo streak
          </div>
          <p className="mt-2 text-sm sm:text-base text-foreground/75 leading-relaxed">
            On your own? Chase your longest survival streak — the songs get
            harder as you go, one miss ends the run — and climb the global Top 10.
          </p>
        </div>
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
      {/* Distinct near-black band so the finale clearly reads as its own zone,
          fading into the cosmic background at the edges rather than a hard box. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'linear-gradient(180deg, transparent 0%, rgba(2,1,7,0.9) 10%, #020106 26%, #020106 100%)',
        }}
      />
      {/* Local glow so the finale feels lit, not boxed */}
      <div
        aria-hidden="true"
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full pointer-events-none"
        style={{
          width: '90vw',
          height: '60vh',
          background: 'rgba(153, 69, 255, 0.12)',
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
          Free on iOS and web · No account — pick a name and play
        </p>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="max-w-6xl mx-auto px-6 pb-10 pt-4" style={{ background: '#020106' }}>
      <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-foreground/50">
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
          <MusicDbBand />
          <PhoneShowcase />
          <TryIt />
          <ModesBand />
          <CtaBand />
        </main>
        <Footer />
      </div>
    </div>
  );
}

export default LandingPage;
