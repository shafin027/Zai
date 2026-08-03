// /api/telegram-webhook
//
// v0.1 fallback: text-only Telegram entry point that runs the same intent
// pipeline as the (deferred) n8n voice workflow. See /docs/N8N-DEFERRED.md.
//
// Flow:
//   Telegram message -> HMAC verify against TELEGRAM_WEBHOOK_SECRET ->
//     IF /start -> welcome reply
//     ELSE    -> Load sender profile -> Load friends + active tours ->
//               OpenRouter Claude intent -> Validate -> Supabase REST insert ->
//               Text confirmation reply
//
// In v0.2 the audio stack (Groq Whisper STT + Google TTS) attaches here.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { loadPrompt, userPayload, type IntentInput } from '@/lib/prompts/intent';
import { currentSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const SECRET = process.env.TELEGRAM_WEBHOOK_SECRET;

function verifyHmac(sigHeader: string | null, rawBody: string, maxAgeSec = 86400): boolean {
  if (!SECRET || !sigHeader) return false;
  const expected = createHmac('sha256', SECRET).update(rawBody).digest('hex');
  const a = Buffer.from(sigHeader);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

// We use the supabase-js client with the service role key server-side. The
// service-role client bypasses RLS so we must strip the request down to the
// minimum trusted fields before any insert.
function sb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

// The Telegram-shaped payload we now allow through. Anything outside this
// shape is rejected as an upstream validation failure (4xx), per the API
// workflows guideline.
const TelegramUpdate = z.object({
  update_id: z.number(),
  message: z.object({
    chat: z.object({ id: z.number() }),
    from: z.object({ id: z.number(), first_name: z.string().optional() }),
    text: z.string().optional(),
    message_id: z.number().optional()
  })
});

export async function POST(req: NextRequest) {
  const raw = await req.text();
  const sig = req.headers.get('x-cofre-signature');
  if (!verifyHmac(sig, raw)) {
    return NextResponse.json({ error: 'bad-signature' }, { status: 401 });
  }

  let parsed;
  try {
    parsed = TelegramUpdate.parse(JSON.parse(raw));
  } catch {
    return NextResponse.json({ error: 'bad-input' }, { status: 400 });
  }

  const chatId = parsed.message.chat.id;
  const telegramId = parsed.message.from.id;
  const text = (parsed.message.text || '').trim();

  // /start or empty -> greeting
  if (text.startsWith('/start') || text === '') {
    return sendTelegramMessage(chatId, welcomeFor(parsed.message.from.first_name));
  }
  // Cheap commands
  if (text === '/help') {
    return sendTelegramMessage(
      chatId,
      'Cofre speaks Bangla and English. Send a text note like "lent Raihan 500 for lunch" or "spent 600 on lunch for the dhaka-trip". New tours / voice support land in v0.2.'
    );
  }

  // Load sender profile
  const client = sb();
  const { data: profiles } = await client
    .from('profiles')
    .select('id, first_name, locale, default_currency')
    .eq('telegram_id', telegramId);
  const profile = profiles?.[0];

  let friends: IntentInput['knownFriends'] = [];
  let tours: IntentInput['activeTours'] = [];
  if (profile) {
    const [{ data: rels }, { data: tourRows }] = await Promise.all([
      client.from('relations').select('friend:friend_id(first_name, last_name, telegram_username)').eq('owner_id', profile.id),
      client.from('tours').select('name, nickname').eq('owner_id', profile.id).eq('status', 'active')
    ]);
    friends = ((rels ?? []) as any[]).map((r) => r.friend).filter(Boolean) as IntentInput['knownFriends'];
    tours = (tourRows ?? []) as IntentInput['activeTours'];
  }

  // If the user is not signed in to the website, that's allowed for the bot
  // path. They'll be persisted to Supabase under the telegram identity and
  // can sign in to the website at any time and find their existing rows.
  // (We use the service-role profile resolved above; if no profile, we
  // upsert one quickly.)

  if (!profile) {
    const { data: created } = await client
      .from('profiles')
      .insert({
        telegram_id: telegramId,
        first_name: parsed.message.from.first_name || 'friend',
        default_currency: 'BDT',
        locale: 'en',
        role: 'friend'
      })
      .select('id, first_name, locale, default_currency')
      .single();
    if (!created) {
      return NextResponse.json({ error: 'no-profile' }, { status: 500 });
    }
    Object.assign(profile ?? {}, created);
  }

  // Build intent input
  const intentInput: IntentInput = {
    transcript: text,
    userLocale: (profile?.locale as 'en' | 'bn') || 'bn',
    knownFriends: friends,
    activeTours: tours,
    defaultCurrency: (profile?.default_currency as string) || 'BDT'
  };

  // Call OpenRouter Claude for intent extraction.
  if (!process.env.OPENROUTER_API_KEY) {
    return sendTelegramMessage(chatId, 'Server is not configured. Set OPENROUTER_API_KEY and try again.');
  }
  const intentRaw = await callOpenRouter(intentInput);
  const intent = safeParseIntent(intentRaw);
  const first = intent.actions[0];

  if (!first || first.kind === 'unknown' || first.amount_cents == null) {
    const follow = first?.followup_question || 'Could you rephrase that? Try: "lent Raihan 500 for lunch" or "spent 1200 for the dhaka-trip lunch".';
    return sendTelegramMessage(chatId, follow);
  }

  // Resolve counterparty_id and tour_id from names. We filter to friends +
  // tours already loaded to avoid hallucination. Confidence threshold from
  // the prompt: 0.7 confirmed; below 0.7 we mark unconfirmed.
  const counterparty = first.counterparty_name
    ? friends.find((f) => {
        const full = [f.first_name, f.last_name].filter(Boolean).join(' ').toLowerCase();
        return full === first.counterparty_name!.toLowerCase();
      })
    : undefined;

  const tour = first.tour_nickname
    ? tours.find((t) => (t.nickname || '').toLowerCase() === first.tour_nickname!.toLowerCase())
    : undefined;

  const counterparty_id = counterparty?.id ?? null;
  if (first.kind !== 'expense' && !counterparty_id) {
    return sendTelegramMessage(chatId, `I couldn't match a friend named "${first.counterparty_name}". Add them in the website's /friends page and try again.`);
  }

  // Write the entry.
  const row = {
    owner_id: profile!.id,
    counterparty_id,
    tour_id: tour?.id ?? null,
    kind: first.kind,
    amount_cents: first.amount_cents,
    currency: first.currency || (profile?.default_currency as string) || 'BDT',
    occurred_at: new Date().toISOString(),
    memo: first.memo || text,
    source: 'telegram',
    confirmed_by_owner: first.confidence >= 0.7,
    raw_transcript: text,
    source_message_id: String(parsed.message.message_id || '')
  };
  const { error: writeErr } = await client.from('entries').insert(row);
  if (writeErr) {
    return sendTelegramMessage(chatId, 'Could not save that. Try again in a moment.');
  }

  return sendTelegramMessage(chatId, confirmFor(first, profile?.locale as 'en' | 'bn' | undefined));
}

function welcomeFor(name?: string): string {
  const who = name ? `, ${name}` : '';
  return `Welcome${who}. Cofre speaks Bangla and English. Send a text note like "lent Raihan 500 for lunch" and I'll log it. Type /help for tips.`;
}

function confirmFor(
  a: { kind: string; amount_cents: number | null; currency: string | null; counterparty_name: string | null; memo: string },
  locale: 'en' | 'bn' | undefined
): string {
  const amt = a.amount_cents == null ? '' : `${a.currency || 'BDT'} ${Math.round(a.amount_cents / 100)}`;
  const cp = a.counterparty_name || 'them';
  const bn = locale === 'bn';
  switch (a.kind) {
    case 'lend':
      return bn
        ? `লগড। ${cp} কে ${amt} ধার দিয়েছ।`
        : `Logged. Lent ${amt} to ${cp}.`;
    case 'borrow':
      return bn
        ? `লগড। ${cp} থেকে ${amt} ধার নিয়েছ।`
        : `Logged. Borrowed ${amt} from ${cp}.`;
    case 'settle':
      return bn
        ? `লগড। ${cp} কে ${amt} শোধ করেছ।`
        : `Logged. Settled ${amt} with ${cp}.`;
    case 'expense':
      return bn
        ? `লগড। ${a.memo} — ${amt} খরচ।`
        : `Logged. ${amt} spent.`;
    default:
      return bn ? 'লগড।' : 'Logged.';
  }
}

async function callOpenRouter(input: IntentInput): Promise<string> {
  const systemPrompt = await loadPrompt();
  const prompt = userPayload(input);
  const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'anthropic/claude-sonnet-4.5',
      temperature: 0,
      max_tokens: 600,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt }
      ]
    })
  });
  if (!r.ok) throw new Error(`openrouter-${r.status}`);
  const j = (await r.json()) as { choices: { message: { content: string } }[] };
  return j.choices?.[0]?.message?.content ?? '{}';
}

type ParsedAction = {
  kind: 'expense' | 'lend' | 'borrow' | 'settle' | 'unknown';
  amount_cents: number | null;
  currency: string | null;
  counterparty_name: string | null;
  tour_nickname: string | null;
  assign_to_member_name: string | null;
  memo: string;
  confidence: number;
  followup_question: string | null;
};

function safeParseIntent(raw: string): { actions: ParsedAction[]; language: 'en' | 'bn' } {
  try {
    const obj = JSON.parse(raw);
    if (Array.isArray(obj?.actions)) return obj;
  } catch {
    /* fall through */
  }
  return { actions: [{ kind: 'unknown', amount_cents: null, currency: null, counterparty_name: null, tour_nickname: null, assign_to_member_name: null, memo: '', confidence: 0, followup_question: null }], language: 'en' };
}

async function sendTelegramMessage(chatId: number, text: string) {
  if (!process.env.TELEGRAM_BOT_TOKEN) {
    return NextResponse.json({ ok: false, error: 'TELEGRAM_BOT_TOKEN missing' }, { status: 500 });
  }
  const r = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true })
  });
  return NextResponse.json({ ok: r.ok, sent: text.length });
}
