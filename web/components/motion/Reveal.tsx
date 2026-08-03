'use client';
// GSAP-powered reveal — used by section headings & cards.
// Mounts in view, lifts in with a 360-720ms cycle, never bounces.
import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';

type Props = {
  children: React.ReactNode;
  delay?: number;
  y?: number;
  as?: keyof JSX.IntrinsicElements;
  className?: string;
};

export default function Reveal({ children, delay = 0, y = 14, as: As = 'div', className }: Props) {
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      gsap.set(el, { opacity: 1, y: 0 });
      return;
    }
    gsap.fromTo(
      el,
      { opacity: 0, y },
      {
        opacity: 1,
        y: 0,
        duration: 0.62,
        delay,
        ease: 'power3.out',
        scrollTrigger: {
          trigger: el,
          start: 'top 92%',
          once: true
        }
      }
    );
  }, [delay, y]);

  // @ts-expect-error — generic ref for any tag
  return <As ref={ref} className={className}>{children}</As>;
}
