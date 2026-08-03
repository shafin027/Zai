'use client';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';

export default function TourActions({ tourId, status }: { tourId: string; status: 'planning' | 'active' | 'closed' }) {
  const qc = useQueryClient();
  const [topup, setTopup] = useState('');

  const topupM = useMutation({
    mutationFn: async () => {
      const cents = Math.round(parseFloat(topup.replace(/,/g, '')) * 100);
      if (!Number.isFinite(cents) || cents <= 0) throw new Error('amount-required');
      const r = await fetch(`/api/tours/${tourId}/topup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount_cents: cents })
      });
      if (!r.ok) throw new Error('post-failed');
      return r.json();
    },
    onSuccess: () => {
      setTopup('');
      qc.invalidateQueries({ queryKey: ['tour', tourId] });
    }
  });

  const closeM = useMutation({
    mutationFn: async () => {
      const r = await fetch(`/api/tours/${tourId}/close`, { method: 'POST' });
      if (!r.ok) throw new Error('close-failed');
      return r.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tour', tourId] })
  });

  return (
    <div className="mt-6 pt-6 border-t border-surface-line grid gap-4">
      <div className="grid gap-2">
        <p className="text-xs muted uppercase tracking-[0.18em]">Top-up the pot</p>
        <div className="flex gap-2">
          <input
            value={topup}
            onChange={(e) => setTopup(e.target.value)}
            placeholder="5000"
            inputMode="decimal"
            className="flex-1 bg-transparent border-b border-surface-line py-2 text-sm tabular focus:border-accent outline-none"
          />
          <button
            type="button"
            onClick={() => topupM.mutate()}
            disabled={topupM.isPending || !topup}
            className="px-4 h-9 border border-surface-line text-ink-muted hover:text-ink hover:border-accent rounded-sm text-sm tracking-tight disabled:opacity-40"
          >
            {topupM.isPending ? 'Saving' : 'Add'}
          </button>
        </div>
      </div>

      {status !== 'closed' ? (
        <button
          type="button"
          onClick={() => {
            if (confirm('Close this tour? You won\'t be able to add new entries, but the ledger stays auditable.')) closeM.mutate();
          }}
          className="text-xs muted hover:text-loss tracking-tight text-left"
        >
          Close tour
        </button>
      ) : null}
    </div>
  );
}
