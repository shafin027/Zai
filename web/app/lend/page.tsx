'use client';
// Lend / Borrow — record a money movement against a friend. Triggers the
// outbound Telegram voice notification on success.
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import Reveal from '@/components/motion/Reveal';

type Friend = { id: string; first_name: string; last_name?: string | null; telegram_username?: string | null };

export default function LendPage() {
  const qc = useQueryClient();
  const friends = useQuery({
    queryKey: ['friends'],
    queryFn: async () => (await fetch('/api/friends').then((r) => r.json())) as Friend[]
  });
  const [kind, setKind] = useState<'lend' | 'borrow'>('lend');
  const [counterpartyId, setCounterpartyId] = useState<string>('');
  const [amount, setAmount] = useState('');
  const [memo, setMemo] = useState('');
  const [currency, setCurrency] = useState('BDT');

  useEffect(() => {
    if (!counterpartyId && friends.data?.[0]) setCounterpartyId(friends.data[0].id);
  }, [counterpartyId, friends.data]);

  const m = useMutation({
    mutationFn: async () => {
      const cents = Math.round(parseFloat(amount.replace(/,/g, '')) * 100);
      if (!Number.isFinite(cents) || cents <= 0) throw new Error('amount-required');
      if (!counterpartyId) throw new Error('no-friend');
      const r = await fetch('/api/entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind,
          counterparty_id: counterpartyId,
          amount_cents: cents,
          currency,
          memo: memo.trim()
        })
      });
      if (!r.ok) throw new Error('post-failed');
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['entries'] });
      qc.invalidateQueries({ queryKey: ['balances'] });
      setAmount('');
      setMemo('');
    }
  });

  return (
    <div className="mx-auto max-w-2xl px-6 py-12">
      <Reveal>
        <p className="text-xs uppercase tracking-[0.18em] muted mb-2">New Ledger Entry</p>
      </Reveal>
      <Reveal delay={0.06}>
        <h1 className="mb-10">Lent or borrowed.</h1>
      </Reveal>

      <Reveal delay={0.12}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            m.mutate();
          }}
          className="border border-surface-line rounded-md bg-surface-raised p-8 grid gap-6"
        >
          {/* Kind toggle — restrained, hairline around the active pill. */}
          <div className="flex items-center gap-2">
            {(['lend', 'borrow'] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                className={`px-4 h-9 text-sm rounded-sm border tracking-tight ${
                  kind === k
                    ? 'border-accent text-accent-glow bg-surface-sunken'
                    : 'border-surface-line text-ink-muted hover:text-ink'
                }`}
              >
                {k === 'lend' ? 'I lent them' : 'I borrowed from them'}
              </button>
            ))}
          </div>

          <label className="grid gap-2">
            <span className="text-xs muted uppercase tracking-[0.18em]">Friend</span>
            {friends.isLoading ? (
              <span className="dim text-sm">Loading…</span>
            ) : (friends.data?.length ?? 0) === 0 ? (
              <a href="/friends" className="text-sm text-accent underline-offset-4 hover:underline">
                Add a friend first →
              </a>
            ) : (
              <select
                value={counterpartyId}
                onChange={(e) => setCounterpartyId(e.target.value)}
                className="bg-transparent border-b border-surface-line py-3 text-sm focus:border-accent outline-none"
              >
                {friends.data!.map((f) => (
                  <option key={f.id} value={f.id} className="bg-surface-raised">
                    {[f.first_name, f.last_name].filter(Boolean).join(' ')}
                    {f.telegram_username ? ` · @${f.telegram_username}` : ''}
                  </option>
                ))}
              </select>
            )}
          </label>

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
            <span className="text-xs muted uppercase tracking-[0.18em]">Note</span>
            <input
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="Cash for dinner"
              className="bg-transparent border-b border-surface-line py-3 text-base focus:border-accent outline-none"
            />
          </label>

          <p className="muted text-xs">
            On submit, {kind === 'lend' ? "they'll hear about it" : "they'll hear about it"} on Telegram by voice within seconds.
          </p>

          <div className="flex items-center justify-end pt-4">
            <Button type="submit" disabled={m.isPending || !counterpartyId}>
              {m.isPending ? 'Recording' : 'Record'}
            </Button>
          </div>
          {m.error ? <p className="text-loss text-sm">Something went wrong, try again.</p> : null}
        </form>
      </Reveal>
    </div>
  );
}
