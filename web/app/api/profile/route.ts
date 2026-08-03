// POST /api/profile — update default_currency, locale.
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { currentSession } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';

const Schema = z.object({
  default_currency: z.string().length(3).optional(),
  locale: z.enum(['en', 'bn']).optional()
});

export async function POST(req: NextRequest) {
  const session = currentSession();
  if (!session) return NextResponse.redirect(new URL('/', req.url));
  const parsed = Schema.safeParse(Object.fromEntries((await req.formData()).entries()));
  if (!parsed.success) return NextResponse.json({ error: 'bad-input' }, { status: 400 });
  const sb = await supabaseServer();
  await sb.from('profiles').update(parsed.data).eq('telegram_id', session.telegram_id);
  return NextResponse.redirect(new URL('/settings', req.url));
}
