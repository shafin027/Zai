// GET /api/me — returns the authenticated Profile (or null).
import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { currentSession } from '@/lib/auth';

export async function GET() {
  const session = currentSession();
  if (!session) return NextResponse.json(null);
  const sb = await supabaseServer();
  const { data } = await sb.from('profiles').select('*').eq('telegram_id', session.telegram_id).maybeSingle();
  return NextResponse.json(data ?? null);
}
