import React, { useLayoutEffect, useMemo, useRef } from 'react';
import { gsap, prefersReducedMotion, revealOnEnter } from './fx';
import { APP_STORE_URL } from './CtaButtons';

// Real iOS app shown inside a phone frame. These are actual App Store
// screenshots ("displaying your app's functionality"), so the real album art
// they contain is fine to show. One phone on mobile, two overlapping on desktop.

function Phone({ src, alt, priority = false, className = '', style, ...rest }) {
  return (
    <div className={`relative ${className}`} style={style} {...rest}>
      <div
        style={{
          borderRadius: 40,
          background: '#08060f',
          padding: 7,
          border: '1px solid rgba(255,255,255,0.14)',
          boxShadow: priority
            ? '0 30px 80px rgba(0,0,0,0.55), 0 0 60px rgba(153,69,255,0.18)'
            : '0 20px 50px rgba(0,0,0,0.5)',
        }}
      >
        <img
          src={src}
          alt={alt}
          loading="lazy"
          className="block w-full"
          style={{ borderRadius: 33 }}
        />
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
      // Phones rise + settle as the section enters.
      gsap.from('[data-phone-front]', {
        y: 60,
        opacity: 0,
        duration: 1,
        ease: 'power3.out',
        scrollTrigger: { trigger: ref.current, start: 'top 68%', once: true },
      });
      gsap.from('[data-phone-back]', {
        y: 30,
        opacity: 0,
        duration: 1,
        delay: 0.12,
        ease: 'power3.out',
        scrollTrigger: { trigger: ref.current, start: 'top 68%', once: true },
      });
      // Gentle two-depth drift on scroll.
      gsap.to('[data-phone-back]', {
        yPercent: -8,
        ease: 'none',
        scrollTrigger: { trigger: ref.current, start: 'top bottom', end: 'bottom top', scrub: true },
      });
      gsap.to('[data-phone-front]', {
        yPercent: 4,
        ease: 'none',
        scrollTrigger: { trigger: ref.current, start: 'top bottom', end: 'bottom top', scrub: true },
      });
    }, ref);
    return () => ctx.revert();
  }, [reduced]);

  return (
    <section ref={ref} className="max-w-6xl mx-auto px-6 py-20 sm:py-28 text-center" aria-labelledby="app-heading">
      <p data-reveal className="text-xs sm:text-sm font-black tracking-[0.24em] uppercase text-foreground/55">
        The real thing
      </p>
      <h2 id="app-heading" data-reveal className="landing-h2 mt-3">
        Even better on your phone
      </h2>
      <p data-reveal className="mt-4 text-base sm:text-lg text-foreground/75 max-w-md mx-auto">
        Every timeline, reveal, and 30-second preview — polished for iOS and built
        for passing the phone around the room.
      </p>

      {/* Fixed-width centered stage so the absolutely-positioned back phones
          stay inside it and never widen the page. */}
      <div className="relative mx-auto mt-14" style={{ width: 560, maxWidth: '100%', minHeight: 400 }}>
        {/* Back phone left (desktop only) */}
        <Phone
          src="/img/landing/ios-place.jpg"
          alt="Beatably on iOS — placing a song on the timeline"
          data-phone-back
          className="hidden lg:block absolute"
          style={{ width: 208, left: 14, top: 40, transform: 'rotate(-7deg)', zIndex: 1 }}
        />
        {/* Back phone right (desktop only) */}
        <Phone
          src="/img/landing/ios-challenge.jpg"
          alt="Beatably on iOS — challenging a rival's placement"
          data-phone-back
          className="hidden lg:block absolute"
          style={{ width: 208, right: 14, top: 40, transform: 'rotate(7deg)', zIndex: 1 }}
        />
        {/* Front phone (centered) */}
        <div
          data-phone-front
          className="relative mx-auto"
          style={{ zIndex: 2, width: 250, maxWidth: '76vw' }}
        >
          <Phone
            src="/img/landing/ios-correct.jpg"
            alt="Beatably on iOS — a correct guess revealed on the timeline"
            priority
          />
        </div>
      </div>

      <div data-reveal className="mt-14 flex justify-center">
        <a href={APP_STORE_URL} className="press-scale inline-flex">
          <img
            src="/img/landing/appstore-badge.svg"
            alt="Download Beatably on the App Store"
            width={168}
            height={56}
            className="h-14 w-auto"
          />
        </a>
      </div>
    </section>
  );
}

export default PhoneShowcase;
