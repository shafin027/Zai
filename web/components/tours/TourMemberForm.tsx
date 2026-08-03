'use client';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

type Friend = { id: string; first_name: string; last_name?: string | null; telegram_username?: string | null };
type Member = {
  id: string;
  profile_id: string;
  role: 'leader' | 'member';
  first_name: string;
  last_name: string | null;
  allocated_cents: number;
};

export default function TourMemberForm({ tourId, members }: { tourId: string; members: Member[] }) {
  const qc = useQueryClient();
  const friends = useQuery({
    queryKey: ['friends'],
    queryFn: async () => (await fetch('/api/friends').then((r) => r.json())) as Friend[]
  });
  const [selectedFriendId, setSelectedFriendId] = useState('');
  const [allocation, setAllocation] = useState('');

  const memberIds = new Set(members.map((m) => m.profile_id));
  const candidates = (friends.data ?? []).filter((f) => !memberIds.has(f.id));

  const m = useMutation({
    mutationFn: async () => {
      if (!selectedFriendId) throw new Error('no-friend');
      const cents = Math.round(parseFloat(allocation.replace(/,/g, '')) * 100) || 0;
      const r = await fetch(`/api/tours/${tourId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile_id: selectedFriendId, allocated_cents: cents })
      });
      if (!r.ok) throw new Error('post-failed');
      return r.json();
    },
    onSuccess: () => {
      setSelectedFriendId('');
      setAllocation('');
      qc.invalidateQueries({ queryKey: ['tour', tourId] });
    }
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        m.mutate();
      }}
      className="grid gap-3"
    >
      {candidates.length === 0 ? (
        <p className="dim text-xs">All your friends are already on this tour, or you haven't added any yet.</p>
      ) : (
        <>
          <select
            value={selectedFriendId}
            onChange={(e) => setSelectedFriendId(e.target.value)}
            className="bg-transparent border-b border-surface-line py-2 text-sm focus:border-accent outline-none"
          >
            <option value="" className="bg-surface-raised">Pick a friend…</option>
            {candidates.map((f) => (
              <option key={f.id} value={f.id} className="bg-surface-raised">
                {[f.first_name, f.last_name].filter(Boolean).join(' ')}{f.telegram_username ? ` · @${f.telegram_username}` : ''}
              </option>
            ))}
          </select>
          <input
            value={allocation}
            onChange={(e) => setAllocation(e.target.value)}
            placeholder="Their allocation (optional)"
            inputMode="decimal"
            className="bg-transparent border-b border-surface-line py-2 text-sm tabular focus:border-accent outline-none"
          />
          <div className="flex items-center justify-end pt-1">
            <button
              type="submit"
              disabled={m.isPending || !selectedFriendId}
              className="px-4 h-9 bg-ink text-surface rounded-sm hover:bg-accent-glow text-sm tracking-tight disabled:opacity-40"
            >
              {m.isPending ? 'Adding' : 'Add member'}
            </button>
          </div>
        </>
      )}
      {m.error ? <p className="text-loss text-xs">Failed to add member.</p> : null}
    </form>
  );
}
