import React, { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import beatablyLogo from '@/assets/beatably_logo.png';
import CtaButtons, { PLAY_URL } from './CtaButtons';
import { gsap, prefersReducedMotion } from './fx';

// Fullscreen cinematic hero: the ghost mascot video (the game's own landing
// backdrop) with a staggered headline reveal, then a scroll-scrubbed exit —
// content drifts up and the video eases scale as the page takes over.
// Autoplay is polite: muted/playsInline, paused off-screen, and if playback
// is blocked (iOS Low Power Mode) the poster frame — the same shot — stands.
function HeroCinematic() {
  const rootRef = useRef(null);
  const videoRef = useRef(null);
  const reduced = useMemo(prefersReducedMotion, []);

  useEffect(() => {
    const v = videoRef.current;
    if (!v || reduced) return undefined;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) v.play().catch(() => {});
        else v.pause();
      },
      { threshold: 0.08 }
    );
    io.observe(v);
    return () => io.disconnect();
  }, [reduced]);

  useLayoutEffect(() => {
    if (reduced) return undefined;
    const ctx = gsap.context(() => {
      gsap.from('[data-hero-stagger]', {
        y: 46,
        opacity: 0,
        duration: 1.05,
        ease: 'power4.out',
        stagger: 0.09,
        delay: 0.2,
      });
      gsap.to('[data-hero-content]', {
        y: -80,
        opacity: 0.15,
        ease: 'none',
        scrollTrigger: { trigger: rootRef.current, start: 'top top', end: 'bottom 25%', scrub: true },
      });
      gsap.to(videoRef.current, {
        scale: 1.08,
        ease: 'none',
        scrollTrigger: { trigger: rootRef.current, start: 'top top', end: 'bottom top', scrub: true },
      });
      gsap.to('[data-hero-cue]', {
        opacity: 0,
        ease: 'none',
        scrollTrigger: { trigger: rootRef.current, start: '4% top', end: '18% top', scrub: true },
      });
    }, rootRef);
    return () => ctx.revert();
  }, [reduced]);

  return (
    <section ref={rootRef} className="relative h-[100svh] overflow-hidden">
      {/* Backdrop video (poster = identical first frame for any no-play case) */}
      <video
        ref={videoRef}
        muted
        loop
        playsInline
        preload="auto"
        poster="/img/first_frame.jpg"
        className="absolute inset-0 w-full h-full object-cover"
        aria-hidden="true"
      >
        <source src="/videos/ghost5.mp4" type="video/mp4" />
      </video>
      {/* Legibility + seamless hand-off into the page's cosmic background */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/20 to-[#0C0A1A]" />
      {/* Desktop: the headline sits over the ghost's pale headphone — scrim the text column */}
      <div className="absolute inset-y-0 left-0 w-[62%] hidden lg:block bg-gradient-to-r from-[#0C0A1A]/80 via-[#0C0A1A]/30 to-transparent" />

      <div className="relative h-full flex flex-col" style={{ zIndex: 2 }}>
        <header className="max-w-6xl w-full mx-auto px-6 pt-6 flex items-center justify-between">
          <img
            src={beatablyLogo}
            alt="Beatably"
            className="h-8 sm:h-10 w-auto"
            width={156}
            height={40}
            data-hero-stagger
          />
          <a
            href={PLAY_URL}
            data-hero-stagger
            className="text-sm sm:text-base font-bold text-foreground/85 hover:text-foreground transition-colors press-scale"
          >
            Play in browser →
          </a>
        </header>

        <div className="flex-1 flex items-end pb-20 sm:pb-24">
          <div className="max-w-6xl w-full mx-auto px-6" data-hero-content>
            <p
              data-hero-stagger
              className="text-xs sm:text-sm font-extrabold tracking-[0.24em] uppercase text-foreground/65"
            >
              The music timeline party game
            </p>
            <h1 className="landing-display mt-4">
              <span className="block" data-hero-stagger>
                Hear it.
              </span>
              <span className="block" data-hero-stagger>
                Place it.
              </span>
              <span className="block" data-hero-stagger style={{ color: '#FF1493' }}>
                Steal it.
              </span>
            </h1>
            <p
              data-hero-stagger
              className="mt-6 text-base sm:text-xl text-foreground/80 max-w-xl"
            >
              Guess when songs dropped, build your timeline, and steal the cards your
              friends get wrong. First full timeline wins.
            </p>
            <div data-hero-stagger>
              <CtaButtons className="mt-8" />
            </div>
            <p data-hero-stagger className="mt-3.5 text-xs sm:text-sm text-foreground/55">
              Free on iOS and web · No account — pick a name and play
            </p>
          </div>
        </div>

        <div
          data-hero-cue
          className="absolute bottom-5 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1.5 text-foreground/60"
          aria-hidden="true"
        >
          <span className="text-[10px] font-extrabold tracking-[0.3em] uppercase">Scroll</span>
          <svg
            className="landing-scroll-cue"
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M3 5.5 8 10.5 13 5.5" />
          </svg>
        </div>
      </div>
    </section>
  );
}

export default HeroCinematic;
