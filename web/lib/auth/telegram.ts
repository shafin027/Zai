// Telegram Login Widget verification.
// Algorithm (per Telegram docs): build data-check-string from fields (sans hash),
// sort by key, append with newline, HMAC-SHA256 with key = sha256(bot_token),
// compare constant-time to the widget-provided hash.
//
// https://core.telegram.org/widgets/login#checking-authorization

import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export type TelegramUser = {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
};

export function verifyTelegramLogin(user: TelegramUser, botToken: string, maxAgeSec = 86400): boolean {
  if (!user?.hash) return false;
  const ageSec = Math.floor(Date.now() / 1000) - Number(user.auth_date);
  if (!Number.isFinite(ageSec) || ageSec < 0 || ageSec > maxAgeSec) return false;

  const { hash, ...rest } = user;
  const dataCheckString = Object.keys(rest)
    .sort()
    .map((k) => `${k}=${(rest as Record<string, unknown>)[k]}`)
    .join('\n');

  const secret = createHash('sha256').update(botToken).digest();
  const computed = createHmac('sha256', secret).update(dataCheckString).digest();

  const provided = Buffer.from(hash, 'hex');
  if (provided.length !== computed.length) return false;
  return timingSafeEqual(provided, computed);
}
