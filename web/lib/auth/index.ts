// Reads the session cookie for the current request. Used by:
// - server components rendering the user's profile/ledger
// - API routes that need to confirm the caller
// - n8n callback validation
import { cookies } from 'next/headers';
import { verifyTelegramSession } from './jwt';

export const SESSION_COOKIE = 'cf_session';

export function currentSession(): { telegram_id: number } | null {
  return verifyTelegramSession(cookies().get(SESSION_COOKIE)?.value);
}

export async function requireSession() {
  const s = currentSession();
  if (!s) throw new Error('UNAUTHENTICATED');
  return s;
}
