// GET  /api/tours — list the current user's tours
// POST /api/tours — create a new tour
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { currentSession } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';
import { createTour } from '@/lib/supabase/tours';

const Currency = z.string().length(3).default('BDT');
const Schema = z.object({
  name: z.string().min(1).max(120),
  nickname: z.string().min(1).max(64).optional(),
  destination: z.string().max(120).optional(),
  currency: Currency,
  pot_cents: z.number().int().min(0).default(0),
  starts_at: z.string().datetime().optional(),
  ends_at: z.string().datetime().optional(),
  notes: z.string().max(2000).default('')
});

export async function GET() {
  const session = currentSession();
  if (!session) return NextResponse.json([]);
  const sb = await supabaseServer();
  const { data: profile } = await sb.from('profiles').select('*').eq('telegram_id', session.telegram_id).maybeSingle();
  if (!profile) return NextResponse.json([]);
  const { data, error } = await sb.from('v_tour_summary').select('*').eq('owner_id', profile.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest) {
  const session = currentSession();
  if (!session) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  const parsed = Schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: 'bad-input', detail: parsed.error.flatten() }, { status: 400 });
  const sb = await supabaseServer();
  const { data: profile } = await sb.from('profiles').select('*').eq('telegram_id', session.telegram_id).maybeSingle();
  if (!profile) return NextResponse.json({ error: 'profile-missing' }, { status: 404 });

  // First tour → leader is auto-added. The leader "owns" their personal tour by being the owner.
  const tour = await createTour(sb, {
    name: parsed.data.name,
    nickname: parsed.data.nickname ?? null,
    destination: parsed.data.destination ?? null,
    currency: parsed.data.currency,
    pot_cents: parsed.data.pot_cents,
    starts_at: parsed.data.starts_at ?? new Date().toISOString(),
    ends_at: parsed.data.ends_at ?? null,
    notes: parsed.data.notes,
    owner_id: profile.id
  });

  // Leader is automatically a member.
  await sb.from('tour_members').insert({
    tour_id: tour.id,
    profile_id: profile.id,
    role: 'leader',
    allocated_cents: parsed.data.pot_cents
  });

  return NextResponse.json(tour);
}
