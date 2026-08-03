'use client';
// React context exposing the current Telegram profile to any client component.
// Source of truth is our /api/me route; SessionProvider fetches on mount.
// We deliberately do not run this on the server — server components call
// `currentSession()` from lib/auth directly (no cookie leak).
import { createContext, useContext } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Profile } from '@/types/database';

const SessionCtx = createContext<Profile | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const { data } = useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      const r = await fetch('/api/me', { credentials: 'include' });
      if (!r.ok) return null;
      return (await r.json()) as Profile | null;
    },
    staleTime: 60_000
  });
  return <SessionCtx.Provider value={data ?? null}>{children}</SessionCtx.Provider>;
}

export function useSession() {
  return useContext(SessionCtx);
}
