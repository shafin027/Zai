'use client';
// Friends list + invite. Generates a deep-link invite URL when the user adds one.
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Reveal from '@/components/motion/Reveal';
import { Avatar } from '@/components/ui/Avatar';

type Friend = {
  id: string;
  first_name: string;
  last_name?: string | null;
  telegram_username?: string | null;
  photo_url?: string | null;
  relation_status: 'pending' | 'active' | 'blocked';
  invite_url: string;
  net_cents: number;
};

export default function FriendsPage() {
  const qc = useQueryClient();
  const list = useQuery({
    queryKey: ['friends'],
    queryFn: async () => (await fetch('/api/friends').then((r) => r.json())) as Friend[]
  });

  const [name, setName] = useState('');
  const add = useMutation({
    mutationFn: async () => {
      const r = await fetch('/api/friends', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ display_name: name.trim() })
      });
      if (!r.ok) throw new Error('invite-failed');
      return r.json();
    },
    onSuccess: () => {
      setName('');
      qc.invalidateQueries({ queryKey: ['friends'] });
    }
  });

  const cpLink = (url: string) => typeof navigator !== 'undefined' ? navigator.clipboard.writeText(url) : null;

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <Reveal>
        <p className="text-xs uppercase tracking-[0.18em] muted mb-2">Friends</p>
      </Reveal>
      <Reveal delay={0.06}>
        <h1 className="mb-12">People in your ledger.</h1>
      </Reveal>

      <Reveal delay={0.12}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            add.mutate();
          }}
          className="border border-surface-line rounded-md bg-surface-raised p-6 flex items-center gap-3 mb-12"
        >
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Their full name (we'll match later)"
            className="flex-1 bg-transparent border-b border-surface-line py-3 text-sm focus:border-accent outline-none"
          />
          <button
            type="submit"
            disabled={!name.trim() || add.isPending}
            className="px-4 h-10 bg-ink text-surface rounded-sm hover:bg-accent-glow disabled:opacity-40 text-sm tracking-tight"
          >
            {add.isPending ? 'Generating' : 'Invite'}
          </button>
        </form>
      </Reveal>

      <Reveal delay={0.16}>
        <div className="divide-y divide-surface-line border-t border-surface-line">
          {list.isLoading ? (
            <p className="dim py-6 text-sm">Loading…</p>
          ) : (list.data ?? []).length === 0 ? (
            <p className="dim py-6 text-sm">No friends yet.</p>
          ) : (
            (list.data ?? []).map((f) => (
              <div key={f.id} className="py-5 flex items-center gap-4">
                <Avatar src={f.photo_url ?? null} name={f.first_name} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm">{[f.first_name, f.last_name].filter(Boolean).join(' ')}</p>
                  <p className="text-xs muted">
                    {f.relation_status === 'active' ? `Net ${f.net_cents >= 0 ? 'owes you' : 'you owe'} · ${Math.abs(f.net_cents) / 100} BDT` : 'Invite pending'}
                  </p>
                </div>
                {f.relation_status !== 'active' ? (
                  <button
                    onClick={() => cpLink(f.invite_url)}
                    className="text-xs text-accent underline-offset-4 hover:underline"
                  >
                    Copy invite link
                  </button>
                ) : null}
              </div>
            ))
          )}
        </div>
      </Reveal>
    </div>
  );
}
