// GET /api/tours/[id] — full detail rollup (summary + members + entries + topups)
// POST /api/tours/[id]/topup — record a top-up (leader only)
// POST /api/tours/[id]/members — add a member (leader only)
// POST /api/tours/[id]/close — close the tour and lock new entries
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { currentSession } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';
import {
  addTourTopup,
  fetchMemberSummaries,
  fetchTour,
  fetchTourEntries,
  fetchTourMembers,
  fetchTourTopups,
  closeTour
} from '@/lib/supabase/tours';

const TopupSchema = z.object({
  amount_cents: z.number().int().positive(),
  memo: z.string().max(200).default('')
});
const MemberSchema = z.object({
  profile_id: z.string().uuid(),
  allocated_cents: z.number().int().min(0).default(0)
});

export async function GET(_req: NextRequest, ctx: { params: { id: string } }) {
  const session = currentSession();
  if (!session) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  const sb = await supabaseServer();
  const tour = await fetchTour(sb, ctx.params.id);
  if (!tour) return NextResponse.json({ error: 'tour-not-found' }, { status: 404 });
  const [members, summaries, entries, topups] = await Promise.all([
    fetchTourMembers(sb, ctx.params.id),
    fetchMemberSummaries(sb, ctx.params.id),
    fetchTourEntries(sb, ctx.params.id),
    fetchTourTopups(sb, ctx.params.id)
  ]);
  return NextResponse.json({
    tour,
    members,
    summaries,
    entries,
    topups
  });
}

export async function POST(req: NextRequest, ctx: { params: { id: string }; url?: string }) {
  // Dispatch by /subpath: handled by sibling files. This generic POST 405s.
  const url = req.nextUrl ?? new URL(req.url);
  return NextResponse.json({ error: 'use-specific-endpoint' }, { status: 405 });
}
