// POST /api/entries — record an entry. Broadcasts a Supabase Realtime event
// AND, for lend/borrow rows, dispatches a Telegram voice note to the
// counterparty via n8n.
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { currentSession } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';
import { insertEntry } from '@/lib/supabase/queries';
import { dispatchNotifyVoice } from '@/lib/n8n/notify';

const Schema = z.object({
  kind: z.enum(['expense', 'lend', 'borrow', 'settle']),
  counterparty_id: z.string().uuid().nullable().optional(),
  tour_id: z.string().uuid().nullable().optional(),
  tour_member_id: z.string().uuid().nullable().optional(),
  amount_cents: z.number().int().positive(),
  currency: z.string().length(3).default('BDT'),
  memo: z.string().max(200).default(''),
  occurred_at: z.string().datetime().optional()
});

export async function POST(req: NextRequest) {
  const session = currentSession();
  if (!session) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const parsed = Schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: 'bad-input', detail: parsed.error.flatten() }, { status: 400 });

  const sb = await supabaseServer();
  const { data: profile } = await sb.from('profiles').select('*').eq('telegram_id', session.telegram_id).maybeSingle();
  if (!profile) return NextResponse.json({ error: 'profile-missing' }, { status: 404 });

  const counterpartyId = parsed.data.counterparty_id ?? null;
  if (parsed.data.kind !== 'expense' && !counterpartyId) {
    return NextResponse.json({ error: 'counterparty-required' }, { status: 400 });
  }

  // Verify the relation (or auto-create pending) for lend/borrow.
  let relationId: string | null = null;
  if (counterpartyId) {
    const { data: rel } = await sb
      .from('relations')
      .select('*')
      .eq('owner_id', profile.id)
      .eq('friend_id', counterpartyId)
      .maybeSingle();
    relationId = rel?.id ?? null;
  }

  // Tour scope: validate membership if a tour is supplied.
  if (parsed.data.tour_id) {
    const { data: tour } = await sb.from('tours').select('*').eq('id', parsed.data.tour_id).maybeSingle();
    if (!tour) return NextResponse.json({ error: 'tour-not-found' }, { status: 404 });
    if (tour.owner_id !== profile.id) {
      const { data: membership } = await sb
        .from('tour_members')
        .select('*')
        .eq('tour_id', tour.id)
        .eq('profile_id', profile.id)
        .maybeSingle();
      if (!membership) return NextResponse.json({ error: 'not-a-tour-member' }, { status: 403 });
    }
    if (tour.status === 'closed') return NextResponse.json({ error: 'tour-closed' }, { status: 409 });
  }

  const row = await insertEntry(sb, {
    owner_id: profile.id,
    counterparty_id: counterpartyId,
    relation_id: relationId,
    kind: parsed.data.kind,
    amount_cents: parsed.data.amount_cents,
    currency: parsed.data.currency,
    occurred_at: parsed.data.occurred_at ?? new Date().toISOString(),
    memo: parsed.data.memo,
    source: 'web',
    confirmed_by_owner: true,
    tour_id: parsed.data.tour_id ?? null,
    tour_member_id: parsed.data.tour_member_id ?? null
  });

  await sb.from('audit_log').insert({
    actor_id: profile.id,
    event: 'entry.created',
    subject_id: row.id,
    payload: { kind: row.kind, amount_cents: row.amount_cents, source: 'web' }
  });

  // For lend/borrow: fire-and-forget Telegram voice notify to the counterparty.
  if (row.kind === 'lend' || row.kind === 'borrow') {
    void dispatchNotifyVoice({ entryId: row.id, ownerId: profile.id, counterpartyId, kind: row.kind });
  }

  return NextResponse.json(row);
}
