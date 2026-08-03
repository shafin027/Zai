'use client';
// Expenses — record a private spend.
// Form posts to /api/entries. The mutation writes both via this UI and via the
// real-time channel the Telegram bot pushes through.
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import Reveal from '@/components/motion/Reveal';

export default function ExpensePage() {
  const qc = useQueryClient();
  const [amount, setAmount] = useState('');
  const [memo, setMemo] = useState('');
  const [currency, setCurrency] = useState('BDT');
  const [occurredAt, setOccurredAt] = useState(() => new Date().toISOString().slice(0, 10));

  const m = useMutation({
    mutationFn: async () => {
      const cents = Math.round(parseFloat(amount.replace(/,/g, '')) * 100);
      if (!Number.isFinite(cents) || cents <= 0) throw new Error('amount-required');
      const r = await fetch('/api/entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'expense',
          amount_cents: cents,
          currency,
          memo: memo.trim(),
          occurred_at: new Date(occurredAt).toISOString()
        })
      });
      if (!r.ok) throw new Error('post-failed');
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['entries'] });
      setAmount('');
      setMemo('');
    }
  });

  return (
    <div className="mx-auto max-w-2xl px-6 py-12">
      <Reveal>
        <p className="text-xs uppercase tracking-[0.18em] muted mb-2">Add Expense</p>
      </Reveal>
      <Reveal delay={0.06}>
        <h1 className="mb-10">Spent something.</h1>
      </Reveal>

      <Reveal delay={0.12}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            m.mutate();
          }}
          className="border border-surface-line rounded-md bg-surface-raised p-8 grid gap-6"
        >
          <label className="grid gap-2">
            <span className="text-xs muted uppercase tracking-[0.18em]">Amount</span>
            <div className="flex items-stretch">
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="500"
                inputMode="decimal"
                className="flex-1 bg-transparent border-b border-surface-line py-3 font-serif text-2xl tabular focus:border-accent outline-none"
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
            <span className="text-xs muted uppercase tracking-[0.18em]">What for</span>
            <input
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="Lunch with Raihan"
              className="bg-transparent border-b border-surface-line py-3 text-base focus:border-accent outline-none"
            />
          </label>

          <label className="grid gap-2">
            <span className="text-xs muted uppercase tracking-[0.18em]">Date</span>
            <input
              type="date"
              value={occurredAt}
              onChange={(e) => setOccurredAt(e.target.value)}
              className="bg-transparent border-b border-surface-line py-3 text-sm focus:border-accent outline-none tabular"
            />
          </label>

          <div className="flex items-center justify-end pt-4">
            <Button type="submit" disabled={m.isPending}>
              {m.isPending ? 'Saving' : 'Record expense'}
            </Button>
          </div>
          {m.error ? <p className="text-loss text-sm">Something went wrong, try again.</p> : null}
        </form>
      </Reveal>
    </div>
  );
}
