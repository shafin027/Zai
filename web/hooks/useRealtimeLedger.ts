'use client';
// Realtime hook: subscribes to entries & relations changes for the current
// authenticated user. UI sections pull from React Query which refreshes on
// these events so the ledger updates within ~200ms of a Telegram write.
import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabaseBrowser } from '@/lib/supabase/client';

export function useRealtimeLedger() {
  const qc = useQueryClient();
  useEffect(() => {
    const sb = supabaseBrowser();
    const channel = sb
      .channel('cofre-ledger')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'entries' }, () => {
        qc.invalidateQueries({ queryKey: ['entries'] });
        qc.invalidateQueries({ queryKey: ['balances'] });
        qc.invalidateQueries({ queryKey: ['tour'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'relations' }, () => {
        qc.invalidateQueries({ queryKey: ['friends'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'settlements' }, () => {
        qc.invalidateQueries({ queryKey: ['entries'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tours' }, () => {
        qc.invalidateQueries({ queryKey: ['tours'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tour_members' }, () => {
        qc.invalidateQueries({ queryKey: ['tour'] });
        qc.invalidateQueries({ queryKey: ['tours'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tour_topups' }, () => {
        qc.invalidateQueries({ queryKey: ['tour'] });
      });
    channel.subscribe();
    return () => {
      void channel.unsubscribe();
    };
  }, [qc]);
}
