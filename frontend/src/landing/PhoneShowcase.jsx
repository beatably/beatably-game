import React, { useLayoutEffect, useMemo, useRef } from 'react';
import { gsap, prefersReducedMotion, revealOnEnter } from './fx';
import { APP_STORE_URL } from './CtaButtons';

// Real iOS app shown inside phone frames. These are actual App Store
// screenshots ("displaying your app's functionality"), so the real album art
// they contain is fine to show. One phone on mobile, a clean horizontal fan of
// three on desktop.

function Phone({ src, alt, priority = false, className = '', style, ...rest }) {
  return (
    <div className={className} style={style} {...rest}>
      <div
        style={{
          borderRadius: 38,
          background: '#08060f',
          padding: 6,
          border: '1px solid rgba(255,255,255,0.14)',
          boxShadow: priority
            ? '0 30px 80px rgba(0,0,0,0.55), 0 0 60px rgba(153,69,255,0.18)'
            : '0 18px 44px rgba(0,0,0,0.5)',
        }}
      >
        <img src={src} alt={alt} loading="lazy" className="block w-full" style={{ borderRadius: 32 }} />
      </div>
    </div>
  );
}

function PhoneShowcase() {
  const ref = useRef(null);
  const reduced = useMemo(prefersReducedMotion, []);

  useLayoutEffect(() => {
    if (reduced) return undefined;
    const ctx = gsap.context(() => {
      revealOnEnter(ref.current, '[data-reveal]');
      gsap.from('[data-phone]', {
        y: 54,
        opacity: 0,
        duration: 0.9,
        ease: 'power3.out',
        stagger: 0.1,
        scrollTrigger: { trigger: ref.current, start: 'top 70%', once: true },
      });
      // Subtle, uniform drift on the whole cluster (stays cohesive).
      gsap.to('[data-phone-stage]', {
        yPercent: -6,
        ease: 'none',
        scrollTrigger: { trigger: ref.current, start: 'top bottom', end: 'bottom top', scrub: true },
      });
    }, ref);
    return () => ctx.revert();
  }, [reduced]);

  return (
    <section ref={ref} className="max-w-6xl mx-auto px-6 py-20 sm:py-28 text-center" aria-labelledby="app-heading">
      <p data-reveal className="text-xs sm:text-sm font-black tracking-[0.24em] uppercase text-foreground/55">
        Everyone gets a phone
      </p>
      <h2 id="app-heading" data-reveal className="landing-h2 mt-3">
        Play from your own phone
      </h2>
      <p data-reveal className="mt-4 text-base sm:text-lg text-foreground/75 max-w-xl mx-auto">
        Each player joins on their own phone — free in the browser or the iOS app.
        The host runs the music and can send it to a speaker over AirPlay or
        Bluetooth, so the whole room hears every track.
      </p>

      <div data-phone-stage className="mt-16 flex items-end justify-center">
        {/* Left (desktop only) */}
        <Phone
          data-phone
          src="/img/landing/ios-challenge.jpg"
          alt="Beatably on iOS — challenging a rival's placement"
          className="hidden lg:block relative"
          style={{ width: 208, transform: 'rotate(-5deg)', marginRight: -28, marginBottom: 22, zIndex: 0 }}
        />
        {/* Center (always) */}
        <Phone
          data-phone
          src="/img/landing/ios-reveal.jpg"
          alt="Beatably on iOS — a correct guess revealed on the timeline"
          priority
          className="relative"
          style={{ width: 262, maxWidth: '74vw', zIndex: 2 }}
        />
        {/* Right (desktop only) */}
        <Phone
          data-phone
          src="/img/landing/ios-guess.jpg"
          alt="Beatably on iOS — guessing the song for a bonus"
          className="hidden lg:block relative"
          style={{ width: 208, transform: 'rotate(5deg)', marginLeft: -28, marginBottom: 22, zIndex: 0 }}
        />
      </div>

      <div data-reveal className="mt-16 flex justify-center">
        <a href={APP_STORE_URL} className="press-scale inline-flex">
          <img
            src="/img/landing/appstore-badge.svg"
            alt="Download Beatably on the App Store"
            width={192}
            height={64}
            className="h-16 w-auto"
          />
        </a>
      </div>
    </section>
  );
}

export default PhoneShowcase;
