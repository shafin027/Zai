// POST /api/tours/[id]/members — leader adds a member (looks up by friend id)
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { currentSession } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';
import { addTourMember } from '@/lib/supabase/tours';

const Schema = z.object({
  profile_id: z.string().uuid(),
  allocated_cents: z.number().int().min(0).default(0)
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

  const member = await addTourMember(sb, ctx.params.id, parsed.data.profile_id, 'member', parsed.data.allocated_cents);
  return NextResponse.json(member);
}
