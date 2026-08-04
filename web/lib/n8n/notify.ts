// Text ping to the counterparty when the owner records a lend/borrow entry.
//
// Bridge between the website and the n8n `cofre-notify` workflow.
// In v0.2 the n8n workflow synthesizes a Bangla/English voice reply and posts
// the audio. Here we POST the same payload (kind, owner, recipient) to the
// n8n webhook. The webhook URL is configured via N8N_WEBHOOK_INGRESS_URL.
// If that env is missing we fall back to the in-process text sender so v0.1
// still works without n8n.
//
// Counterparty must have a Telegram-linked Cofre account (i.e. they've logged
// in through the Telegram widget at least once). Pending invitees don't get a
// ping — they see the entry when they accept the invite.

import { createHmac } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

type Args = {
  ownerId: string;
  counterpartyId: string;
  kind: 'lend' | 'borrow' | 'settle';
  amountCents: number;
  currency: string;
};

export async function notifyCounterpartyText(args: Args) {
  if (!process.env.TELEGRAM_BOT_TOKEN) return;

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  const [{ data: owner }, { data: cp }] = await Promise.all([
    sb.from('profiles').select('first_name').eq('id', args.ownerId).maybeSingle(),
    sb.from('profiles').select('telegram_id, locale, first_name').eq('id', args.counterpartyId).maybeSingle()
  ]);
  if (!cp || !cp.telegram_id) return;

  const payload = {
    recipient: {
      telegram_id: cp.telegram_id,
      locale: cp.locale ?? 'en',
      first_name: cp.first_name ?? ''
    },
    origin: {
      first_name: owner?.first_name ?? 'Someone'
    },
    kind: args.kind,
    amount_cents: args.amountCents,
    currency: args.currency
  };

  // Prefer the n8n cofre-notify workflow (voice in v0.2). Fall through to the
  // in-process text sender if the env is not wired yet.
  const ingress = process.env.N8N_WEBHOOK_INGRESS_URL;
  const sharedSecret = process.env.N8N_SHARED_SECRET;

  if (ingress && sharedSecret) {
    try {
      const body = JSON.stringify(payload);
      const signature = createHmac('sha256', sharedSecret).update(body).digest('hex');
      await fetch(`${ingress.replace(/\/$/, '')}/webhook/cofre-notify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-cofre-signature': signature
        },
        body
      });
      return;
    } catch (err) {
      console.warn('[notify-counterparty] n8n webhook failed; falling back to direct send', err);
    }
  }

  // Fallback: direct Telegram text send (v0.1 behavior).
  const sender = (owner?.first_name as string | undefined) || 'Someone';
  const amount = formatAmount(args.amountCents, args.currency);
  const locale = (cp.locale as 'en' | 'bn') || 'en';
  const text =
    locale === 'bn'
      ? args.kind === 'lend'
        ? `${sender} তোমাকে ${amount} ধার দিয়েছে। লেজারে যোগ হয়েছে।`
        : args.kind === 'borrow'
          ? `তুমি ${sender} থেকে ${amount} ধার নিয়েছ। লেজারে যোগ হয়েছে।`
          : `তুমি ${sender} কে ${amount} শোধ করেছ।`
      : args.kind === 'lend'
        ? `${sender} just lent you ${amount}. Logged in the ledger.`
        : args.kind === 'borrow'
          ? `You just borrowed ${amount} from ${sender}. Logged in the ledger.`
          : `You just settled ${amount} with ${sender}.`;

  try {
    await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: cp.telegram_id, text, disable_web_page_preview: true })
    });
  } catch (err) {
    console.warn('[notify-counterparty] failed', err);
  }
}

function formatAmount(cents: number, ccy: string) {
  const amt = (cents / 100).toLocaleString('en-US', { maximumFractionDigits: 2 });
  if (['BDT', 'USD', 'EUR'].includes(ccy)) return `${ccy} ${amt}`;
  return `${amt} ${ccy}`;
}
