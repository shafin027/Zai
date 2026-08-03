'use client';
// A single hair-thin progress bar that fills left→right when a Telegram interaction
// is mid-flight. Mirrors the typing indicator behaviour so the website feels
// alive in lockstep with the bot.
import { useEffect, useState } from 'react';

export default function Ticker({ active }: { active: boolean }) {
  const [pct, setPct] = useState(0);
  useEffect(() => {
    if (!active) {
      setPct(0);
      return;
    }
    let raf = 0;
    let start: number | null = null;
    const tick = (t: number) => {
      if (start === null) start = t;
      const d = Math.min((t - start) / 4000, 1);
      // Indeterminate-ish but bounded — accelerating slightly.
      setPct(20 + 80 * Math.pow(d, 1.3));
      if (d < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active]);
  return (
    <div
      role="progressbar"
      aria-label="Working"
      className="relative h-px w-full overflow-hidden bg-surface-line"
    >
      <div
        className="absolute inset-y-0 left-0 bg-accent"
        style={{
          width: active ? `${pct}%` : '0%',
          transition: active ? 'none' : 'width 220ms cubic-bezier(.22,.61,.36,1)'
        }}
      />
    </div>
  );
}
