---
title: Deploy runbook
audience: operator (you)
status: ready
---

# Cofre deploy runbook — the exact sequence

You said:
> upload all the updated files here and before that make sure all the webhook
> and all the .env are working and it should be linked with supabase and the
> vercel hosting

I cannot do step 4 (`git push`) from this session — and you shouldn't trust any
agent that runs `git push` against a real GitHub account for you. Below is the
exact sequence you run yourself, plus the checks performed upstream of git.

## Pre-push (read-only, on your machine)

```bash
# 1. Make sure you're in the project root.
cd "/Users/shafin.mahamud/Documents/Claude/Personal Project"

# 2. Run the pre-deploy scan.
chmod +x scripts/pre-deploy-check.sh
./scripts/pre-deploy-check.sh
# This fails fast on:
#  - any committed secret (TELEGRAM_BOT_TOKEN, etc.)
#  - missing migrations
#  - 404 in required files
```

## Push

```bash
git init -b main                  # only if first push
git add -A
git commit -m "Cofre: personal ledger + tour mode, ready for deploy"
git remote add origin https://github.com/shafin027/Zai.git
git push -u origin main
```

If the push is rejected due to existing remote content, use
`git pull --rebase origin main` then push again; do not force-push.

## What lands in the repo

- `web/` — Next.js app
- `supabase/` — DB migrations + seed
- `n8n/workflows/` — two ready-to-import workflow JSONs
- `docs/` — audit + deploy runbook
- `vercel.json` — at root, with `cd web && npm run build` wired in
- `.gitignore` — at root + inside `web/`, both exclude secrets
- `scripts/pre-deploy-check.sh` — local verifier

## What does NOT land (intentionally)

- `.env`, `.env.local` (both top-level and `web/`)
- `web/node_modules`, `web/.next`, `web/.vercel`
- `coverage`, `dist`, `out`

## After push — Vercel side

1. Open Vercel → New Project → Import `shafin027/Zai`.
2. **Build settings**: Vercel auto-detects Next.js. If it picks `web/` as root
   with the wrong settings, override:
   - Build command: `cd web && npm run build`
   - Output directory: `web/.next`
   - Install command: `cd web && npm install`
3. **Environment variables**: open `web/env.vercel.example` and add every
   key it lists to **Production**. Click "Add" for each, paste the value.

   Critical: the **same** `N8N_SHARED_SECRET` and `SUPABASE_URL` values must
   exist in BOTH Vercel AND n8n.

4. **Custom domain** (when ready): add a domain in Vercel, set `NEXT_PUBLIC_SITE_URL`
   to that URL, redeploy.

## After push — Supabase side

```bash
# Once. Requires the Supabase CLI to be installed and `supabase link` run.
supabase db push
# That applies BOTH 0001_init.sql and 0002_tours.sql in order.

# Then enable Realtime on the new tables:
psql "$(supabase db remote get-uri)" -c "
  alter publication supabase_realtime add table entries;
  alter publication supabase_realtime add table relations;
  alter publication supabase_realtime add table settlements;
  alter publication supabase_realtime add table tours;
  alter publication supabase_realtime add table tour_members;
  alter publication supabase_realtime add table tour_topups;
"
```

In Supabase dashboard:

- Auth → URL Configuration → add your Vercel domain to Site URL + Redirect URLs.
- Auth → Providers → keep Email **disabled** (we use Telegram only).

## After push — n8n side

1. Open your n8n instance (self-host or Cloud).
2. Workflows → Import from File → `n8n/workflows/cofre-telegram-voice-ledger.json`.
3. Repeat for `web/n8n/workflows/cofre-telegram-notify.json` — it's the
   notify fan-out.
4. In each workflow:
   - Set workflow variables (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
     `N8N_SHARED_SECRET`, `GROQ_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_TTS_API_KEY`).
   - Replace the placeholder Telegram credential on every Telegram node.
   - Activate the workflow; copy the webhook URL it generates.

5. Set `Telegram Webhook URL` (BotFather side) to `https://your-n8n-host/webhook/cofre-telegram`.
   n8n setWebhook call: `https://api.telegram.org/bot<TOKEN>/setWebhook?url=<WH_URL>&secret_token=<secret>`.

6. In Vercel, set `N8N_WEBHOOK_INGRESS_URL` = the **notify** workflow's webhook URL
   (`/webhook/cofre-notify`).

## After push — Telegram side

In @BotFather:

```
/setdomain   → your Vercel domain (for Login Widget)
/setcommands → (optional):
   start - Begin with Cofre
   tours - List active tours
   help  - Show usage tips
```

## End-to-end smoke test (do this once before declaring success)

1. Open the Vercel URL.
2. Click "Sign in with Telegram." Confirm the widget pops up correctly.
   After login, you land on `/dashboard`. If you 401 / 500, check Vercel
   runtime logs — most common cause is `N8N_SHARED_SECRET` mismatch.
3. Open Telegram, send a voice note to your bot: "spent 250 for the dhaka-trip lunch".
   Confirm in n8n execution history:
   - Telegram Webhook → 200
   - Verify HMAC → ok
   - Groq Whisper STT → returns the transcript
   - Extract Intent (Claude) → JSON with tour_nickname="dhaka-trip"
   - Write Entries (Supabase) → row inserted
   - Send Reply Voice → 200

4. Refresh the Vercel dashboard. The entry appears within ~1s (Realtime).
5. Send a `lend` entry against a friend who has accepted an invite: confirm
   they receive a Telegram voice note in their own language within ~2s.

## What if a step fails

- **Webhook signature errors** in n8n: rotate `N8N_SHARED_SECRET` to the same
  value on both sides. Restart the workflow.
- **Telegram widget won't load**: in the browser console, check that the
  iframe origin matches the Vercel domain. If `Refused to display in a frame`,
  your BotFather `/setdomain` value is wrong.
- **n8n Code node can't read `NEXT_PUBLIC_*`**: the secret was set only in
  Vercel. Set the same value (without `NEXT_PUBLIC_`) as a workflow variable
  named `SUPABASE_URL`.
- **Realtime not updating**: confirm the publication additions from step
  Supabase-side have run; verify in Supabase Studio → API Docs → "Realtime".

The full audit lives in `docs/SECURITY.md` — read it before going live.
