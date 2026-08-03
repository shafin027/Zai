// GET /api/telegram-login/callback
// Receives the Telegram Login Widget redirect with user data in the query.
// We:
//  1. Verify HMAC against TELEGRAM_BOT_TOKEN
//  2. Mint our own session JWT (httpOnly cookie)
//  3. Upsert a profiles row via service-role client (creating the friend record)
//  4. If an invite_token was provided, accept the relation
//  5. Redirect to the originating dashboard
import { NextRequest, NextResponse } from 'next/server';
import { verifyTelegramLogin, type TelegramUser } from '@/lib/auth/telegram';
import { signTelegramSession } from '@/lib/auth/jwt';
import { SESSION_COOKIE } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase/server';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const params = Object.fromEntries(url.searchParams.entries());
  const invite = url.searchParams.get('invite') ?? undefined;

  // Cast query -> TelegramUser
  const u: TelegramUser = {
    id: Number(params.id),
    first_name: params.first_name ?? '',
    last_name: params.last_name ?? undefined,
    username: params.username ?? undefined,
    photo_url: params.photo_url ?? undefined,
    auth_date: Number(params.auth_date || 0),
    hash: params.hash ?? ''
  };

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) return NextResponse.json({ error: 'server-misconfigured' }, { status: 500 });
  if (!verifyTelegramLogin(u, botToken)) {
    return NextResponse.json({ error: 'invalid-signature' }, { status: 401 });
  }

  const sb = supabaseAdmin();
  // Upsert profile (friend or owner — role decided by presence of invite).
  const { data: existing } = await sb
    .from('profiles')
    .select('*')
    .eq('telegram_id', u.id)
    .maybeSingle();

  let profileId: string;
  if (existing) {
    profileId = existing.id;
    await sb
      .from('profiles')
      .update({
        first_name: u.first_name,
        last_name: u.last_name ?? null,
        telegram_username: u.username ?? existing.telegram_username,
        photo_url: u.photo_url ?? existing.photo_url
      })
      .eq('id', profileId);
  } else {
    const role = invite ? 'friend' : 'owner';
    const { data: created, error } = await sb
      .from('profiles')
      .insert({
        telegram_id: u.id,
        first_name: u.first_name,
        last_name: u.last_name ?? null,
        telegram_username: u.username ?? null,
        photo_url: u.photo_url ?? null,
        role
      })
      .select('*')
      .single();
    if (error || !created) {
      return NextResponse.json({ error: 'profile-create-failed', detail: error?.message }, { status: 500 });
    }
    profileId = created.id;
    await sb.from('audit_log').insert({
      actor_id: profileId,
      event: 'auth.login',
      payload: { source: 'telegram_login' }
    });
  }

  // Accept invite if one was carried through.
  if (invite) {
    const { data: rel } = await sb
      .from('relations')
      .select('*')
      .eq('invite_token', invite)
      .maybeSingle();
    if (rel && rel.friend_id === profileId && rel.status === 'pending') {
      await sb
        .from('relations')
        .update({ status: 'active', accepted_at: new Date().toISOString() })
        .eq('id', rel.id);
      await sb.from('audit_log').insert({
        actor_id: profileId,
        event: 'relation.accepted',
        subject_id: rel.owner_id,
        payload: { relation_id: rel.id }
      });
    }
  }

  const token = signTelegramSession(u.id);
  const redirectTo = invite ? '/dashboard' : '/dashboard';

  const res = NextResponse.redirect(new URL(redirectTo, req.url));
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 12,
    secure: process.env.NODE_ENV === 'production'
  });
  return res;
}
