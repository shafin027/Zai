// GET  /api/friends — list relations + balances
// POST /api/friends — create a placeholder friend + invite link
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { currentSession } from '@/lib/auth';
import { supabaseAdmin, supabaseServer } from '@/lib/supabase/server';
import { supabaseBrowser } from '@/lib/supabase/client';

const Schema = z.object({ display_name: z.string().min(1).max(120) });

export async function GET() {
  const session = currentSession();
  if (!session) return NextResponse.json([]);
  const sb = await supabaseServer();
  const { data: profile } = await sb.from('profiles').select('*').eq('telegram_id', session.telegram_id).maybeSingle();
  if (!profile) return NextResponse.json([]);

  const { data: rels } = await sb
    .from('relations')
    .select('*, friend:friend_id(*)')
    .eq('owner_id', profile.id);

  const { data: bals } = await sb.from('v_balances').select('*').eq('owner_id', profile.id);
  const balMap = new Map((bals ?? []).map((b) => [b.counterparty_id, Number(b.net_cents)]));

  const rows = (rels ?? []).map((r: any) => ({
    id: r.friend?.id ?? r.friend_id,
    first_name: r.friend?.first_name ?? 'Unknown',
    last_name: r.friend?.last_name,
    telegram_username: r.friend?.telegram_username,
    photo_url: r.friend?.photo_url,
    relation_status: r.status,
    invite_url: inviteUrl(r.invite_token),
    net_cents: balMap.get(r.friend_id) ?? 0
  }));
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const parsed = Schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: 'bad-input' }, { status: 400 });
  const session = currentSession();
  if (!session) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const sb = await supabaseServer();
  const { data: owner } = await sb.from('profiles').select('*').eq('telegram_id', session.telegram_id).maybeSingle();
  if (!owner || owner.role !== 'owner') {
    return NextResponse.json({ error: 'only-owner-can-invite' }, { status: 403 });
  }

  // Create a placeholder friend profile (no telegram_id yet).
  const admin = supabaseAdmin();
  const placeholder = `pending-${crypto.randomUUID().slice(0, 8)}`;
  const { data: friend, error: e1 } = await admin
    .from('profiles')
    .insert({
      telegram_id: hashTelegramPlaceholder(parsed.data.display_name, owner.id),
      first_name: parsed.data.display_name.split(' ').slice(0, 2).join(' '),
      last_name: parsed.data.display_name.split(' ').slice(2).join(' ') || null,
      role: 'friend'
    })
    .select('*')
    .single();
  if (e1 || !friend) return NextResponse.json({ error: 'friend-create-failed', detail: e1?.message }, { status: 500 });

  const token = crypto.randomUUID().replace(/-/g, '');
  const { data: rel, error: e2 } = await admin
    .from('relations')
    .insert({
      owner_id: owner.id,
      friend_id: friend.id,
      status: 'pending',
      invite_token: token
    })
    .select('*')
    .single();
  if (e2 || !rel) return NextResponse.json({ error: 'relation-create-failed', detail: e2?.message }, { status: 500 });

  await admin.from('audit_log').insert({
    actor_id: owner.id,
    event: 'relation.invited',
    subject_id: rel.id,
    payload: { display_name: parsed.data.display_name }
  });

  return NextResponse.json({ ok: true, invite_url: inviteUrl(token), friend });
}

function inviteUrl(token: string) {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
  return `${base}/invite/${token}`;
}

// Deterministic, unique negative-looking telegram_id so we satisfy the unique
// constraint until the real friend signs in and gets their true telegram_id
// merged (via a future migration to drop the unique index for non-authed ids
// and add a fast lookup). Range is below 0 so they're easy to spot in admin.
function hashTelegramPlaceholder(name: string, ownerId: string) {
  let h = 0;
  for (const c of `${name}::${ownerId}`) h = (h * 31 + c.charCodeAt(0)) | 0;
  // Map to range -1..-2^31 with ownerId salt to keep collisions small.
  return -100000 - (Math.abs(h) + Math.abs(hash(ownerId))) % 2_000_000_000;
}
function hash(s: string) {
  let h = 0;
  for (const c of s) h = (h * 33 + c.charCodeAt(0)) | 0;
  return h;
}
