'use client';
import { useRef } from 'react';
import { gsap } from 'gsap';

export default function Card({
  children,
  className = '',
  onClick
}: {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);

  // A real, low-amplitude tilt on hover. No faked 3D — just CSS transform on a GPU-accelerated layer.
  const onMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    gsap.to(el, {
      rotateX: -py * 4,
      rotateY: px * 4,
      duration: 0.3,
      ease: 'power2.out'
    });
  };
  const onLeave = () => {
    const el = ref.current;
    if (!el) return;
    gsap.to(el, { rotateX: 0, rotateY: 0, duration: 0.5, ease: 'power3.out' });
  };

  return (
    <div
      ref={ref}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      onClick={onClick}
      className={`relative rounded-md border border-surface-line bg-surface-raised transition-colors duration-200 hover:border-accent overflow-hidden ${className}`}
      style={{ transformPerspective: 800 }}
    >
      {children}
    </div>
  );
}
