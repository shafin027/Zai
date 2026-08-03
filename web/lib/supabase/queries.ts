import type { SupabaseClient } from '@supabase/supabase-js';
import type { Entry, Profile, Relation, Balance } from '@/types/database';

export async function fetchRecentEntries(
  sb: SupabaseClient,
  ownerId: string,
  limit = 30
): Promise<Entry[]> {
  const { data, error } = await sb
    .from('entries')
    .select('*')
    .or(`owner_id.eq.${ownerId},counterparty_id.eq.${ownerId}`)
    .order('occurred_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data as Entry[];
}

export async function fetchBalances(sb: SupabaseClient, ownerId: string): Promise<Balance[]> {
  const { data, error } = await sb.from('v_balances').select('*').eq('owner_id', ownerId);
  if (error) throw error;
  return (data ?? []) as Balance[];
}

export async function fetchRelations(sb: SupabaseClient, ownerId: string): Promise<Relation[]> {
  const { data, error } = await sb
    .from('relations')
    .select('*')
    .or(`owner_id.eq.${ownerId},friend_id.eq.${ownerId}`);
  if (error) throw error;
  return (data ?? []) as Relation[];
}

export async function fetchProfilesByIds(
  sb: SupabaseClient,
  ids: string[]
): Promise<Profile[]> {
  if (!ids.length) return [];
  const { data, error } = await sb.from('profiles').select('*').in('id', ids);
  if (error) throw error;
  return (data ?? []) as Profile[];
}

export async function insertEntry(
  sb: SupabaseClient,
  row: Omit<Entry, 'id' | 'created_at' | 'updated_at' | 'status'> & {
    status?: Entry['status'];
  }
): Promise<Entry> {
  const { data, error } = await sb.from('entries').insert(row).select('*').single();
  if (error) throw error;
  return data as Entry;
}

export async function insertSettlement(
  sb: SupabaseClient,
  entryId: string,
  amountCents: number,
  note = '',
  source: 'web' | 'telegram' | 'telegram_voice' = 'web'
): Promise<void> {
  const { error } = await sb.from('settlements').insert({
    entry_id: entryId,
    amount_cents: amountCents,
    note,
    source
  });
  if (error) throw error;
  // Recompute parent status.
  const { data: all, error: e2 } = await sb
    .from('settlements')
    .select('amount_cents')
    .eq('entry_id', entryId);
  if (e2) throw e2;
  const totalSettled = (all ?? []).reduce((s, r) => s + r.amount_cents, 0);
  const { data: entry } = await sb.from('entries').select('amount_cents').eq('id', entryId).single();
  if (!entry) return;
  const next =
    totalSettled === 0
      ? 'open'
      : totalSettled >= entry.amount_cents
      ? 'settled'
      : 'partially_settled';
  await sb.from('entries').update({ status: next }).eq('id', entryId);
}
