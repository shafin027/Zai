'use client';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import Reveal from '@/components/motion/Reveal';

export default function NewTourPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [nickname, setNickname] = useState('');
  const [destination, setDestination] = useState('');
  const [currency, setCurrency] = useState('BDT');
  const [pot, setPot] = useState('');
  const [startsAt, setStartsAt] = useState(() => new Date().toISOString().slice(0, 10));

  const m = useMutation({
    mutationFn: async () => {
      const cents = Math.round(parseFloat(pot.replace(/,/g, '')) * 100);
      const r = await fetch('/api/tours', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          nickname: nickname.trim() || undefined,
          destination: destination.trim() || undefined,
          currency,
          pot_cents: Number.isFinite(cents) && cents > 0 ? cents : 0,
          starts_at: new Date(startsAt).toISOString()
        })
      });
      if (!r.ok) throw new Error('create-failed');
      return r.json() as Promise<{ id: string }>;
    },
    onSuccess: (tour) => {
      qc.invalidateQueries({ queryKey: ['tours'] });
      router.push(`/tours/${tour.id}`);
    }
  });

  return (
    <div className="mx-auto max-w-2xl px-6 py-12">
      <Reveal>
        <p className="text-xs uppercase tracking-[0.18em] muted mb-2">New Tour</p>
      </Reveal>
      <Reveal delay={0.06}>
        <p className="muted text-sm mb-2 max-w-lg">
          A tour is a shared pot owned by you, with team members whose consumption rolls up under it.
        </p>
      </Reveal>
      <Reveal delay={0.12}>
        <h1 className="mb-10">Who are you travelling with?</h1>
      </Reveal>

      <Reveal delay={0.18}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            m.mutate();
          }}
          className="border border-surface-line rounded-md bg-surface-raised p-8 grid gap-6"
        >
          <label className="grid gap-2">
            <span className="text-xs muted uppercase tracking-[0.18em]">Tour name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Dhaka sales run"
              required
              className="bg-transparent border-b border-surface-line py-3 text-base focus:border-accent outline-none"
            />
          </label>

          <label className="grid gap-2">
            <span className="text-xs muted uppercase tracking-[0.18em]">Voice nickname (optional)</span>
            <input
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="dhaka-trip"
              className="bg-transparent border-b border-surface-line py-3 text-sm font-mono focus:border-accent outline-none"
            />
            <p className="text-xs muted">
              Speak <span className="font-mono">spent 600 for the dhaka-trip</span> and it auto-attaches here.
            </p>
          </label>

          <label className="grid gap-2">
            <span className="text-xs muted uppercase tracking-[0.18em]">Destination</span>
            <input
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              placeholder="Dhaka, Chittagong, Sylhet"
              className="bg-transparent border-b border-surface-line py-3 text-sm focus:border-accent outline-none"
            />
          </label>

          <div className="grid sm:grid-cols-2 gap-6">
            <label className="grid gap-2">
              <span className="text-xs muted uppercase tracking-[0.18em]">Starting pot</span>
              <div className="flex items-stretch">
                <input
                  value={pot}
                  onChange={(e) => setPot(e.target.value)}
                  placeholder="50000"
                  inputMode="decimal"
                  className="flex-1 bg-transparent border-b border-surface-line py-3 font-serif text-xl tabular focus:border-accent outline-none"
                />
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="bg-transparent border-b border-surface-line py-3 text-sm muted focus:border-accent outline-none"
                >
                  {['BDT', 'USD', 'EUR', 'INR'].map((c) => (
                    <option className="bg-surface-raised" key={c}>{c}</option>
                  ))}
                </select>
              </div>
            </label>
            <label className="grid gap-2">
              <span className="text-xs muted uppercase tracking-[0.18em]">Starts</span>
              <input
                type="date"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
                className="bg-transparent border-b border-surface-line py-3 text-sm tabular focus:border-accent outline-none"
              />
            </label>
          </div>

          <div className="flex items-center justify-end pt-4">
            <Button type="submit" disabled={m.isPending || !name.trim()}>
              {m.isPending ? 'Creating' : 'Create tour'}
            </Button>
          </div>
          {m.error ? <p className="text-loss text-sm">Something went wrong, try again.</p> : null}
        </form>
      </Reveal>
    </div>
  );
}
