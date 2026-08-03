// Shared HMAC helpers between the Next.js API and the n8n workflow.
// n8n signs every callback with N8N_SHARED_SECRET (HMAC-SHA256 hex).
// We re-verify on the Next side before trusting the payload.

import { createHmac, timingSafeEqual } from 'node:crypto';

export function signPayload(body: string): string {
  return createHmac('sha256', process.env.N8N_SHARED_SECRET ?? '').update(body).digest('hex');
}

export function verifySignature(body: string, provided: string | null | undefined): boolean {
  if (!provided) return false;
  const expected = signPayload(body);
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
