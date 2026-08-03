// Mints a short-lived HMAC token representing a Telegram-authenticated user.
// Stored in an httpOnly cookie. Validated on every page render + API call.
// We choose HMAC over issuing Supabase Auth tokens ourselves so we don't need
// the service-role path for sign-in. The token carries { sub: telegram_id, iat, exp }.

import { createHmac, timingSafeEqual } from 'node:crypto';

const SECRET = () => {
  // Session JWT has its own secret. Falls back to TELEGRAM_WEBHOOK_SECRET so a
  // single value still works in dev, but production should use SESSION_SECRET.
  const s = process.env.SESSION_SECRET ?? process.env.TELEGRAM_WEBHOOK_SECRET ?? process.env.N8N_SHARED_SECRET;
  if (!s) throw new Error('SESSION_SECRET missing');
  return s;
};

export function signTelegramSession(telegramId: number, ttlSec = 60 * 60 * 12): string {
  const iat = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(JSON.stringify({ sub: telegramId, iat, exp: iat + ttlSec })).toString(
    'base64url'
  );
  const sig = createHmac('sha256', SECRET()).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export function verifyTelegramSession(token: string | null | undefined): { telegram_id: number } | null {
  if (!token) return null;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const expected = createHmac('sha256', SECRET()).update(payload).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      sub: number;
      iat: number;
      exp: number;
    };
    if (decoded.exp < Math.floor(Date.now() / 1000)) return null;
    return { telegram_id: Number(decoded.sub) };
  } catch {
    return null;
  }
}
