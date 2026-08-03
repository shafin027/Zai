// POST /api/tours/[id]/close — leader closes the tour. This locks new entries
// but does NOT auto-generate settlements — the leader manually settles via
// the per-member "settle leftover" button to keep human judgement in the loop.
import { NextRequest, NextResponse } from 'next/server';
import { currentSession } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';
import { closeTour } from '@/lib/supabase/tours';

export async function POST(_req: NextRequest, ctx: { params: { id: string } }) {
  const session = currentSession();
  if (!session) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  const sb = await supabaseServer();
  const { data: profile } = await sb.from('profiles').select('*').eq('telegram_id', session.telegram_id).maybeSingle();
  if (!profile) return NextResponse.json({ error: 'profile-missing' }, { status: 404 });
  const { data: tour } = await sb.from('tours').select('*').eq('id', ctx.params.id).maybeSingle();
  if (!tour) return NextResponse.json({ error: 'tour-not-found' }, { status: 404 });
  if (tour.owner_id !== profile.id) return NextResponse.json({ error: 'not-leader' }, { status: 403 });
  const updated = await closeTour(sb, ctx.params.id);
  return NextResponse.json(updated);
}
