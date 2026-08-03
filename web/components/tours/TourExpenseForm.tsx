'use client';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';

type Member = {
  id: string;
  profile_id: string;
  role: 'leader' | 'member';
  first_name: string;
  last_name: string | null;
  allocated_cents: number;
};

export default function TourExpenseForm({
  tourId,
  currency,
  members
}: {
  tourId: string;
  currency: string;
  members: Member[];
}) {
  const qc = useQueryClient();
  const [amount, setAmount] = useState('');
  const [memo, setMemo] = useState('');
  const [memberId, setMemberId] = useState<string>(members[0]?.profile_id ?? '');
  const [kind, setKind] = useState<'expense' | 'lend' | 'settle'>('expense');

  const m = useMutation({
    mutationFn: async () => {
      const cents = Math.round(parseFloat(amount.replace(/,/g, '')) * 100);
      if (!Number.isFinite(cents) || cents <= 0) throw new Error('amount-required');
      const r = await fetch('/api/entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind,
          amount_cents: cents,
          currency,
          memo: memo.trim(),
          tour_id: tourId,
          ...(kind === 'expense'
            ? { tour_member_id: members.find((x) => x.profile_id === memberId)?.id }
            : { counterparty_id: memberId })
        })
      });
      if (!r.ok) throw new Error('post-failed');
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tour', tourId] });
      setAmount('');
      setMemo('');
    }
  });

  const selMembers = members.filter((m) => m.role === 'member');

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        m.mutate();
      }}
      className="grid gap-4"
    >
      <div className="flex gap-2">
        {(['expense', 'lend', 'settle'] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setKind(k)}
            className={`px-3 h-9 text-xs rounded-sm border tracking-tight uppercase ${
              kind === k
                ? 'border-accent text-accent-glow bg-surface-sunken'
                : 'border-surface-line text-ink-muted hover:text-ink'
            }`}
          >
            {k}
          </button>
        ))}
      </div>

      {kind === 'expense' ? (
        selMembers.length === 0 ? (
          <p className="dim text-xs">Add members first to attribute expenses.</p>
        ) : (
          <select
            value={memberId}
            onChange={(e) => setMemberId(e.target.value)}
            className="bg-transparent border-b border-surface-line py-2 text-sm focus:border-accent outline-none"
          >
            {selMembers.map((m) => (
              <option key={m.profile_id} value={m.profile_id} className="bg-surface-raised">
                {m.first_name}{m.last_name ? ' ' + m.last_name : ''}
              </option>
            ))}
          </select>
        )
      ) : (
        <select
          value={memberId}
          onChange={(e) => setMemberId(e.target.value)}
          className="bg-transparent border-b border-surface-line py-2 text-sm focus:border-accent outline-none"
        >
          {members.map((m) => (
            <option key={m.profile_id} value={m.profile_id} className="bg-surface-raised">
              {m.first_name}{m.last_name ? ' ' + m.last_name : ''}{m.role === 'leader' ? ' (leader)' : ''}
            </option>
          ))}
        </select>
      )}

      <input
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        placeholder="500"
        inputMode="decimal"
        className="bg-transparent border-b border-surface-line py-2 font-serif text-xl tabular focus:border-accent outline-none"
      />
      <input
        value={memo}
        onChange={(e) => setMemo(e.target.value)}
        placeholder="Lunch at the bistro"
        className="bg-transparent border-b border-surface-line py-2 text-sm focus:border-accent outline-none"
      />

      <div className="flex items-center justify-end pt-2">
        <button
          type="submit"
          disabled={m.isPending || !amount}
          className="px-5 h-10 bg-ink text-surface rounded-sm hover:bg-accent-glow text-sm tracking-tight disabled:opacity-40"
        >
          {m.isPending ? 'Saving' : 'Record'}
        </button>
      </div>
      {m.error ? <p className="text-loss text-xs">Something went wrong, try again.</p> : null}
    </form>
  );
}
