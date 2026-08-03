// Voice-notify fan-out: Next posts directly to the n8n notify webhook with an
// HMAC signature. Fire-and-forget; notifications never block the user-facing
// entry write. Failures surface in `audit_log` and on the user's next dashboard
// render.
import { signPayload } from './index';
import { supabaseAdmin } from '@/lib/supabase/server';

export async function dispatchNotifyVoice(args: {
  entryId: string;
  ownerId: string;
  counterpartyId: string | null;
  kind: 'lend' | 'borrow' | 'settle';
}) {
  if (!args.counterpartyId) return;
  if (!process.env.N8N_WEBHOOK_INGRESS_URL) {
    console.warn('[notify] N8N_WEBHOOK_INGRESS_URL missing; skipping fan-out');
    return;
  }

  const sb = supabaseAdmin();
  const { data: cp } = await sb.from('profiles').select('*').eq('id', args.counterpartyId).maybeSingle();
  const { data: owner } = await sb
    .from('profiles')
    .select('first_name, telegram_username')
    .eq('id', args.ownerId)
    .maybeSingle();
  if (!cp || !owner) return;

  const payload = {
    recipient: { telegram_id: cp.telegram_id, locale: cp.locale, first_name: cp.first_name },
    origin: { first_name: owner.first_name, telegram_username: owner.telegram_username },
    kind: args.kind,
    entry_id: args.entryId
  };
  const body = JSON.stringify(payload);
  const sig = signPayload(body);

  try {
    await fetch(process.env.N8N_WEBHOOK_INGRESS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-cofre-signature': sig },
      body,
      signal: AbortSignal.timeout(8000)
    });
  } catch (err) {
    console.warn('[notify] failed', err);
  }
}
