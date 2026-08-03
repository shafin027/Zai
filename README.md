---
title: Cofre
subtitle: Personal expenses + lend/borrow ledger with friends, text entry from Telegram
status: complete, runnable (v0.1)
stack: Next.js 14 (TS) + Supabase + Telegram Bot + OpenRouter Claude
---

# Cofre

A personal-finance app with two doors: a website (React + TS, on Vercel) and
a Telegram bot whose webhook is served directly from Next.js — **no n8n
required in v0.1**. Send a Bangla or English text note to the bot; it
classifies the intent via Claude, persists to Supabase, and replies with
a confirmation line.

When you record a `lend` or `borrow` against a friend, that friend gets their
own text ping in their own language if they have a Cofre account linked.

> The original ask for voice notes and voice replies is **deferred to v0.2**
> and lives in `docs/N8N-DEFERRED.md`. v0.1 ships text-only via the Next.js
> route at `web/app/api/telegram-webhook/route.ts`.

```
web/                Next.js app (App Router)
supabase/           DB migrations + seed
docs/SECURITY.md    Audit + hardening checklist
docs/DEPLOY.md      Deploy runbook
docs/N8N-DEFERRED.md  Why v0.1 is text-only + path back to audio
```

## Decision summary (v0.1)

| Concern | Choice | Where it lives |
|---|---|---|
| Web stack | Next.js 14 + TS on Vercel | `web/` |
| Database | Supabase (Postgres + Auth + Realtime + Storage) | `supabase/migrations/` |
| Authentication | Telegram Login Widget (no email/password) | `web/components/auth/TelegramLoginButton.tsx` |
| Personal ledger | Expenses + lend/borrow between you and friends | `web/app/expenses`, `web/app/lend`, `web/app/api/entries` |
| Tour ledger | One leader's shared pot, per-member allocation, leftover reconciliation | `web/app/tours/*`, `supabase/migrations/0002_tours.sql`, `web/lib/supabase/tours.ts` |
| Telegram ingress | Next.js webhook at `/api/telegram-webhook` | `web/app/api/telegram-webhook/route.ts` |
| Telegram egress | Direct `sendMessage` from Next.js | `web/lib/telegram/notify-counterparty.ts` |
| LLM | Claude Sonnet via OpenRouter (model `anthropic/claude-sonnet-4.5`) | `web/lib/prompts/intent.system.md` |
| Animation | GSAP + Three.js | `web/components/motion/*`, `web/components/three/Hero.tsx` |

## Quick start (local)

```bash
# 1. Install
cd web && npm install

# 2. Pull env
cp .env.example .env.local
# fill in the values — see web/.env.example for each key

# 3. Supabase (apply BOTH migrations)
supabase link --project-ref <your-ref>
supabase db push
# optional: dev seed
psql "$(supabase db remote get-uri)" < supabase/seed.sql

# 4. Enable Realtime on the new tables:
psql "$(supabase db remote get-uri)" -c "
  alter publication supabase_realtime add table entries;
  alter publication supabase_realtime add table relations;
  alter publication supabase_realtime add table settlements;
  alter publication supabase_realtime add table tours;
  alter publication supabase_realtime add table tour_members;
  alter publication supabase_realtime add table tour_topups;
"

# 5. Run
npm run dev
# open http://localhost:3000
```

## Environment variables (v0.1)

```
NEXT_PUBLIC_SUPABASE_URL                Supabase project URL
NEXT_PUBLIC_SUPABASE_ANON_KEY           Anon public key
SUPABASE_SERVICE_ROLE_KEY               Service role (server-only)
SUPABASE_URL                            Same value (no NEXT_PUBLIC_ prefix) — convenience for any external service

NEXT_PUBLIC_TELEGRAM_BOT_USERNAME       e.g. cofre_bot (used in /<a href>)
TELEGRAM_BOT_TOKEN                      Server-side, never exposed
TELEGRAM_LOGIN_BOT_ID                   Bot numeric id (for the widget)
TELEGRAM_WEBHOOK_SECRET                 HMAC secret (>=32 chars)

SESSION_SECRET                          HMAC secret for our session JWT; rotate in production

OPENROUTER_API_KEY                      Fronts claude-sonnet-4.5

NEXT_PUBLIC_SITE_URL                    e.g. https://cofre.app (prod)

# Optional MCP tooling (developer-local only — not in Vercel):
# N8N_MCP_URL    — e.g. https://<host>/mcp-server/http
# N8N_MCP_TOKEN  — bearer JWT for n8n MCP plugin
```

## Deploy

The full sequenced runbook lives in **[docs/DEPLOY.md](docs/DEPLOY.md)** —
walk it once before the first push. It includes:

- A `./scripts/pre-deploy-check.sh` script that fails-fast on any committed
  secret, missing migration, or dangling reference to removed paths.
- Vercel env-by-env setup (only the keys above are needed in v0.1).
- Supabase migrations + Realtime publication commands.
- Telegram `@BotFather` steps — the webhook URL is your Vercel URL +
  `/api/telegram-webhook`, NOT n8n.
- End-to-end smoke-test recipe.

## Telegram bot

In Telegram, send `/start` to the bot, then a text note like:

- `lent Raihan 500 for lunch`
- `spent 600 for the dhaka-trip lunch`
- `আজ রায়হানকে ৫০০ টাকা ধার দিলাম`

The bot classifies via Claude, writes the row, and replies with a one-line
text confirmation in your language.

When you record a `lend` or `borrow` entry on the website (or via the bot),
the other Cofre-linked user gets a text ping within seconds. Voice replies
arrive in v0.2.

## Tour mode

Create a tour from `/tours/new`. Give it a name like "Dhaka sales run" and an
optional voice nickname like `dhaka-trip`. Add members from your existing
friends list, allocate a starting pot, and use top-ups when the leader adds
funds mid-trip.

Once active:
- Spend via `/tours/[id]` or by text "spent 1200 for lunch for the dhaka-trip"
  to attribute the spend to whichever member you named.
- The `Leftover` field shows `(pot + top-ups) − spent + repaid`. Negative means
  the leader is short.
- Per-member `Leftover` shows `allocated − consumed`. Positive means the
  member goes home with cash. Negative means the member owes the leader.
- `Close tour` locks the tour ledger — new entries are rejected, but the
  history stays queryable.

## Project conventions

- Money is stored in integer cents. No exceptions.
- All copy is one human breath. No emoji in user-facing strings.
- Em-dash is banned in user-visible copy. Allowed in code comments.
- Tables use hairline borders, generous air, no shadows, no gradient text,
  no glassmorphism.
- 3D hero is intentionally restrained: brass cubes around a torus ring, no
  particles, no bloom, no neon.
- Motion respects `prefers-reduced-motion: reduce` automatically.

## Hardening before launch

See `docs/SECURITY.md` for the full audit. Critical:

- Rotate service role + webhook secrets.
- Set Vercel's deployment protection on.
- Whitelist domain in `@BotFather` (`/setdomain`) and point
  `/setwebhook` at the Vercel URL + `/api/telegram-webhook`.

## License

Personal project; private use. Add a license before any public sharing.
