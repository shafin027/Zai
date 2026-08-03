// Tour-specific data helpers. The personal ledger helpers stay sibling in
// `web/lib/supabase/queries.ts`; tours reuse the same `entries` table with
// extra filters, so the writes are intentionally similar.

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  Tour,
  TourMember,
  TourSummary,
  TourMemberSummary,
  TourTopup
} from '@/types/database';

export async function fetchTours(sb: SupabaseClient, ownerId: string): Promise<TourSummary[]> {
  const { data, error } = await sb.from('v_tour_summary').select('*').eq('owner_id', ownerId);
  if (error) throw error;
  return (data ?? []) as TourSummary[];
}

export async function fetchTour(sb: SupabaseClient, tourId: string): Promise<TourSummary | null> {
  const { data, error } = await sb.from('v_tour_summary').select('*').eq('tour_id', tourId).maybeSingle();
  if (error) throw error;
  return (data ?? null) as TourSummary | null;
}

export async function fetchTourMembers(
  sb: SupabaseClient,
  tourId: string
): Promise<(TourMember & { first_name: string; last_name: string | null; telegram_username: string | null })[]> {
  const { data, error } = await sb
    .from('tour_members')
    .select('*, profile:profile_id(first_name,last_name,telegram_username)')
    .eq('tour_id', tourId);
  if (error) throw error;
  return ((data ?? []) as any[]).map((row) => ({
    id: row.id,
    tour_id: row.tour_id,
    profile_id: row.profile_id,
    role: row.role,
    allocated_cents: row.allocated_cents,
    joined_at: row.joined_at,
    exited_at: row.exited_at,
    first_name: row.profile?.first_name ?? 'Unknown',
    last_name: row.profile?.last_name ?? null,
    telegram_username: row.profile?.telegram_username ?? null
  }));
}

export async function fetchMemberSummaries(
  sb: SupabaseClient,
  tourId: string
): Promise<TourMemberSummary[]> {
  const { data, error } = await sb.from('v_tour_member_summary').select('*').eq('tour_id', tourId);
  if (error) throw error;
  return (data ?? []) as TourMemberSummary[];
}

export async function fetchTourEntries(
  sb: SupabaseClient,
  tourId: string
): Promise<
  import('@/types/database').Entry[]
> {
  const { data, error } = await sb
    .from('entries')
    .select('*')
    .eq('tour_id', tourId)
    .order('occurred_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as any[];
}

export async function fetchTourTopups(sb: SupabaseClient, tourId: string): Promise<TourTopup[]> {
  const { data, error } = await sb
    .from('tour_topups')
    .select('*')
    .eq('tour_id', tourId)
    .order('occurred_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as TourTopup[];
}

export async function createTour(
  sb: SupabaseClient,
  row: Pick<Tour, 'name'> & Partial<Pick<Tour, 'nickname' | 'destination' | 'currency' | 'pot_cents' | 'starts_at' | 'ends_at' | 'notes'>>
): Promise<Tour> {
  const { data, error } = await sb.from('tours').insert(row).select('*').single();
  if (error) throw error;
  return data as Tour;
}

export async function addTourMember(
  sb: SupabaseClient,
  tourId: string,
  profileId: string,
  role: 'leader' | 'member',
  allocatedCents: number
): Promise<TourMember> {
  const { data, error } = await sb
    .from('tour_members')
    .insert({ tour_id: tourId, profile_id: profileId, role, allocated_cents: allocatedCents })
    .select('*')
    .single();
  if (error) throw error;
  return data as TourMember;
}

export async function addTourTopup(
  sb: SupabaseClient,
  tourId: string,
  amountCents: number,
  memo = '',
  source: 'web' | 'telegram' | 'telegram_voice' = 'web'
): Promise<TourTopup> {
  const { data, error } = await sb
    .from('tour_topups')
    .insert({ tour_id: tourId, amount_cents: amountCents, memo, source })
    .select('*')
    .single();
  if (error) throw error;
  return data as TourTopup;
}

export async function closeTour(sb: SupabaseClient, tourId: string): Promise<Tour> {
  const { data, error } = await sb
    .from('tours')
    .update({ status: 'closed', ends_at: new Date().toISOString().slice(0, 10) })
    .eq('id', tourId)
    .select('*')
    .single();
  if (error) throw error;
  return data as Tour;
}
