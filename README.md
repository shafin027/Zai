---
title: Cofre
subtitle: Personal expenses + lend/borrow ledger with friends, via Telegram voice
status: complete, runnable
stack: Next.js 14 (TS) + Supabase + n8n + Telegram Bot
---

# Cofre

A personal-finance app with two doors: a website (React + TS, on Vercel) and a
Telegram bot driven by an n8n workflow. The bot accepts Bangla or English voice
notes, transcribes them, classifies the intent via Claude, persists to Supabase,
and replies with a voice note of its own. Counterparties receive their own
voice note when a new lend/borrow entry appears.

```
web/                Next.js app (App Router; install, deploy)
supabase/           DB migrations + seed
n8n/workflows/      Two JSON workflows for import
docs/SECURITY.md    Audit + hardening checklist
```

## Decision summary

| Concern | Choice | Where it lives |
|---|---|---|
| Web stack | Next.js 14 + TS on Vercel | `web/` |
| Database | Supabase (Postgres + Auth + Realtime + Storage) | `supabase/migrations/` |
| Authentication | Telegram Login Widget (no email/password) | `web/components/auth/TelegramLoginButton.tsx` |
| Personal ledger | Expenses + lend/borrow between you and friends | `web/app/expenses`, `web/app/lend`, `web/app/api/entries` |
| Tour ledger | One leader's shared pot, per-member allocation, leftover reconciliation | `web/app/tours/*`, `supabase/migrations/0002_tours.sql`, `web/lib/supabase/tours.ts` |
| STT | Groq Whisper Large-v3 (free tier) | in `n8n/workflows/cofre-telegram-voice-ledger.json` |
| LLM | Claude Sonnet, structured-output via JSON-mode | `web/lib/prompts/intent.system.md` |
| TTS | Google Cloud TTS Standard voices, Edge TTS fallback | `web/lib/voice/tts.ts` + n8n HTTP Request |
| Voice notify | One-way fan-out via n8n HMAC-signed webhooks | `web/app/api/notify/route.ts` |
| Animation | GSAP + Three.js | `web/components/motion/*`, `web/components/three/Hero.tsx` |

## Quick start (local)

```bash
# 1. Install
cd web && npm install

# 2. Pull env
cp .env.example .env.local
# fill in the values in the env table below

# 3. Supabase (apply BOTH migrations)
supabase link --project-ref <your-ref>
supabase db push
# optional: seed for dev
psql "$(supabase db remote get-uri)" < supabase/seed.sql

# Enable Realtime on the new tables too:
psql "$(supabase db remote get-uri)" -c "alter publication supabase_realtime add table tours; alter publication supabase_realtime add table tour_members; alter publication supabase_realtime add table tour_topups;"

# 4. n8n
# - self-host n8n (see docs) OR use n8n Cloud
# - import both workflows from n8n/workflows/
# - rotate N8N_SHARED_SECRET, set TELEGRAM_BOT_TOKEN credentials
# - copy the webhook URLs into .env.local

# 5. Run
npm run dev
# open http://localhost:3000
```

## Environment variables

```
NEXT_PUBLIC_SUPABASE_URL                Supabase project URL
NEXT_PUBLIC_SUPABASE_ANON_KEY           Anon public key
SUPABASE_SERVICE_ROLE_KEY               Service role (server-only)

NEXT_PUBLIC_TELEGRAM_BOT_USERNAME       e.g. cofre_bot (used in <a href>)
TELEGRAM_BOT_TOKEN                      Server-side, never exposed
TELEGRAM_LOGIN_BOT_ID                   Bot numeric id (for the widget)
TELEGRAM_WEBHOOK_SECRET                 HMAC secret (>=32 chars)

N8N_WEBHOOK_BASE_URL                    e.g. https://n8n.example.com
N8N_WEBHOOK_INGRESS_URL                 full webhook path entry to n8n
N8N_SHARED_SECRET                       HMAC secret shared with n8n

GROQ_API_KEY                            Whisper (free)
ANTHROPIC_API_KEY                       Sonnet (intent)
GOOGLE_TTS_API_KEY                      Standard voices (free quota)

NEXT_PUBLIC_SITE_URL                    e.g. https://cofre.app (prod)
```

## Deploy

The full sequenced runbook lives in **[docs/DEPLOY.md](docs/DEPLOY.md)**, including:

- GitHub push checklist (with a `./scripts/pre-deploy-check.sh` script that
  refuses to let secrets leak into the commit)
- Vercel env-by-env setup
- Supabase migrations and Realtime publication commands
- n8n workflow import + variable wiring
- End-to-end smoke-test recipe

TL;DR for the deployment once the repo is pushed:

```bash
# Vercel
cd web && vercel link
# then add every key from web/env.vercel.example under "Production"
vercel --prod

# Supabase (once)
supabase db push
psql "$(supabase db remote get-uri)" -c "
  alter publication supabase_realtime add table entries;
  alter publication supabase_realtime add table relations;
  alter publication supabase_realtime add table settlements;
  alter publication supabase_realtime add table tours;
  alter publication supabase_realtime add table tour_members;
  alter publication supabase_realtime add table tour_topups;
"

# n8n — see docs/DEPLOY.md, "After push — n8n side"
```

## Telegram bot

Send `/start` to the bot, then send a voice note or text saying e.g.
"lent Raihan 500 for lunch", "spent 600 for the dhaka-trip lunch",
or "আজ রায়হানকে ৫০০ টাকা ধার দিলাম".

The bot shows a typing indicator, transcribes, classifies, writes the entry
to Supabase (auto-attached to a tour if you spoke the tour's nickname),
then replies with a confirmation voice in your language.

When you record a `lend` or `borrow` entry involving a friend, that friend
gets their own Telegram message as a voice note within seconds if they also
have Cofre open against you.

## Tour mode

Create a tour from `/tours/new`. Give it a name like "Dhaka sales run" and
an optional voice nickname like `dhaka-trip`. Add members from your existing
friends list and allocate a starting pot. Add members' allocations either
upfront (e.g. each person owes 5000 BDT into the pot) or move money in via
"top-up the pot".

Once active:
- Spend on the trip via `/tours/[id]` or by voice "spent 1200 for lunch for
  the dhaka-trip", and the spend is attributed to whichever member you named
  (or split evenly if you didn't).
- The `Leftover` field always shows (pot + top-ups) − (spent) + repayments.
- Per-member `Leftover` shows allocated − consumed. Positive means the
  member goes home with money. Negative means the member owes the leader.
- `Close tour` locks the tour ledger — new entries are rejected, but every
  entry stays queryable.

## End-to-end test

After deploying:

1. Open `https://<your-domain>/` and complete Telegram login.
2. Open Telegram, send a voice note to the bot: "lent Raihan 500 for lunch".
   The bot shows typing, then returns a voice reply.
3. Refresh the website dashboard; you should see the entry within ~1s.
4. Sign up a second Telegram account (the friend), accept the invite link
   from `/friends`. Send a lend entry to them from the website; the bot
   pings the friend by voice in their locale.

## Project conventions

- Money is stored in integer cents. No exceptions.
- All copy is one human breath. No emoji in user-facing strings.
- Em-dash is banned in user-visible copy (UI + voice). Allowed in code comments.
- Tables are styled with hairline borders, generous air, no shadows, no
  gradient text, no glassmorphism.
- 3D hero is intentionally restrained: brass cubes around a torus ring, no
  particles, no bloom, no neon.
- Motion respects `prefers-reduced-motion: reduce` automatically.
- All ports communicate over HMAC-signed JSON.

## Hardening before launch

See `docs/SECURITY.md` for the full audit. Critical:

- Rotate service role + webhook secrets
- Set Vercel's deployment protection on
- Whitelist domain in BotFather
- Force HTTPS on the n8n webhook host

## License

Personal project; private use. Add a license before any public sharing.
