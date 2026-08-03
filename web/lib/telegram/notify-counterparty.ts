// Text ping to the counterparty when the owner records a lend/borrow entry.
// v0.1: text only. Voice reply lands in v0.2 when audio returns.
//
// Counterpary.must have a Telegram-linked Cofre account (i.e. they've logged in
// through the Telegram widget at least once). Pending invitees don't receive
// the ping — they see the entry the moment they accept the invite.

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

  // Don't notify people who haven't signed in to Cofre yet. The invite flow
  // handles them once they accept.
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
