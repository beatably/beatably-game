import React, { useLayoutEffect, useMemo, useRef } from 'react';
import { gsap, prefersReducedMotion } from './fx';

// Kinetic-type bridge between the hero and the gameplay story: words light up
// one by one as the section scrubs through the viewport (Apple-style).
const LINE_1 = 'You know every word.';
const LINE_2 = 'But do you know';

function Words({ text }) {
  return text.split(' ').map((w, i) => (
    <span key={i} data-statement-word className="inline-block">
      {w}
      {' '}
    </span>
  ));
}

function Statement() {
  const ref = useRef(null);
  const reduced = useMemo(prefersReducedMotion, []);

  useLayoutEffect(() => {
    if (reduced) return undefined;
    const ctx = gsap.context(() => {
      gsap.fromTo(
        '[data-statement-word]',
        { opacity: 0.13, y: 10 },
        {
          opacity: 1,
          y: 0,
          stagger: 0.05,
          ease: 'none',
          scrollTrigger: {
            trigger: ref.current,
            start: 'top 78%',
            end: 'center 42%',
            scrub: 0.5,
          },
        }
      );
    }, ref);
    return () => ctx.revert();
  }, [reduced]);

  return (
    <section ref={ref} className="max-w-5xl mx-auto px-6 py-28 sm:py-40 text-center">
      <p className="landing-statement">
        <Words text={LINE_1} />
        <br />
        <Words text={LINE_2} />
        <span data-statement-word className="inline-block landing-gradient-text">
          the year?
        </span>
      </p>
    </section>
  );
}

export default Statement;
