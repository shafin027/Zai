// POST /api/tours/[id]/topup — leader adds more money to the pot
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { currentSession } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';
import { addTourTopup } from '@/lib/supabase/tours';

const Schema = z.object({
  amount_cents: z.number().int().positive(),
  memo: z.string().max(200).default('')
});

export async function POST(req: NextRequest, ctx: { params: { id: string } }) {
  const session = currentSession();
  if (!session) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  const parsed = Schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: 'bad-input' }, { status: 400 });

  const sb = await supabaseServer();
  const { data: profile } = await sb.from('profiles').select('*').eq('telegram_id', session.telegram_id).maybeSingle();
  if (!profile) return NextResponse.json({ error: 'profile-missing' }, { status: 404 });

  const { data: tour } = await sb.from('tours').select('*').eq('id', ctx.params.id).maybeSingle();
  if (!tour) return NextResponse.json({ error: 'tour-not-found' }, { status: 404 });
  if (tour.owner_id !== profile.id) return NextResponse.json({ error: 'not-leader' }, { status: 403 });
  if (tour.status === 'closed') return NextResponse.json({ error: 'tour-closed' }, { status: 409 });

  const topup = await addTourTopup(sb, ctx.params.id, parsed.data.amount_cents, parsed.data.memo, 'web');
  return NextResponse.json(topup);
}
