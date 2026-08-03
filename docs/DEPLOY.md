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

- `web/` — Next.js app, including `/api/telegram-webhook` (no n8n dependency)
- `supabase/` — DB migrations + seed
- `n8n/import-readme.md` — DEFERRED marker; n8n workflows are NOT in v0.1, see `docs/N8N-DEFERRED.md`
- `docs/` — audit + deploy runbook + n8n-deferred note
- `vercel.json` — at root, with `cd web && npm run build` wired in
- `mcp.json` — tokenless, reads env-vars at runtime
- `.gitignore` — at root + inside `web/`, both exclude secrets
- `scripts/pre-deploy-check.sh` — local verifier

## What does NOT land (intentionally)

- `.env`, `.env.local` (both top-level and `web/`)
- `web/node_modules`, `web/.next`, `web/.vercel`
- `coverage`, `dist`, `out`
- `lib/n8n/`, `lib/voice/` (deleted; their functions are now in `/api/telegram-webhook` and `lib/telegram/notify-counterparty.ts`)

## After push — Vercel side

1. Open Vercel → New Project → Import `shafin027/Zai`.
2. **Build settings**: Vercel auto-detects Next.js. If it picks `web/` as root
   with the wrong settings, override:
   - Build command: `cd web && npm run build`
   - Output directory: `web/.next`
   - Install command: `cd web && npm install`
3. **Environment variables**: open `web/env.vercel.example` and add every
   key it lists to **Production**. Click "Add" for each, paste the value.

   v0.1 needs only: Supabase URL/anon/service, Telegram bot token + login
   bot id + webhook secret, SESSION_SECRET, OPENROUTER_API_KEY, NEXT_PUBLIC_SITE_URL.

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

## After push — Telegram side

@BotFather:

```
/setdomain   → your Vercel domain (for Login Widget)
/setwebhook  → https://<your-vercel-domain>/api/telegram-webhook
                (your bot must point HERE in v0.1, NOT at n8n)

# Optional: /setcommands
   start  - Begin with Cofre
   help   - Show usage tips
```

The webhook URL above is served by `web/app/api/telegram-webhook/route.ts` —
Next.js is the entry point in v0.1. HMAC verification uses the
`TELEGRAM_WEBHOOK_SECRET` value you've added in step 3.

## After push — n8n side

In v0.1 **there is no n8n dependency**. Skip this section.

If you are bringing n8n back (v0.2), see **`docs/N8N-DEFERRED.md`** first —
it describes what was removed, why, and how to safely reintroduce.

## Local MCP setup (Claude Code plugin)

`mcp.json` at the repo root references two environment variables:

- `N8N_MCP_URL` — e.g. `https://<your-host>/mcp-server/http`
- `N8N_MCP_TOKEN` — the bearer JWT minted by your n8n instance

Both stay in your shell. Recommended pattern:

```bash
# ~/.zshenv (or ~/.bashrc)
export N8N_MCP_URL="https://<your-host>/mcp-server/http"
# token stored via your secret manager, macOS Keychain, or a chmod-600 file
```

Install the MCP server into Claude Code without the token ever appearing in
argv or shell history:

```bash
# 1. Read the (already-rotated) token into a temp var.
read -r -s -p "Paste the rotated N8N MCP token: " N8N_MCP_TOKEN && echo
[ -z "${N8N_MCP_TOKEN:-}" ] && { echo "aborted"; exit 1; }

# 2. Build the JSON in Python so quoting never breaks.
python3 - "$N8N_MCP_URL" "$N8N_MCP_TOKEN" <<'PY' | claude mcp add-json --scope user n8n-mcp --stdin
import json, sys
url, token = sys.argv[1], sys.argv[2]
print(json.dumps({"mcpServers":{"n8n-mcp":{"type":"http","url":url,"headers":{"Authorization":f"Bearer {token}"}}}}))
PY

# 3. Wipe immediately.
unset N8N_MCP_TOKEN
```

Verify with `claude mcp list` and `claude mcp get n8n-mcp`. The token output
will be redacted to `Bearer **********`.

If you must install interactively instead, use `claude mcp add` with
`--transport http --url <url>` — Claude will prompt for the bearer out-of-band,
keeping it out of argv.

## End-to-end smoke test (do this once before declaring success)

1. Open the Vercel URL.
2. Click "Sign in with Telegram." The widget pops up. After login you land
   on `/dashboard`. If you 401 / 500, check Vercel runtime logs — most
   common cause is `TELEGRAM_WEBHOOK_SECRET` mismatch between Vercel and
   the secret your bot's Telegram Login Widget sends.
3. Open Telegram and send a TEXT note to your bot (voice is deferred in v0.1):
   `spent 250 for the dhaka-trip lunch` or `lent Raihan 500`.
   Confirm:
   - Bot replies with a Bangla or English text line (`Logged. ...`).
   - Refresh `https://<your-domain>/dashboard` — entry appears within ~1s.
   - If the entry is `lend` / `borrow` AND the friend has a Cofre account,
     that friend gets a text ping too.
4. Open `/tours/new`, create a tour, give it a nickname like `dhaka-trip`,
   add a friend. Then say `spent 60 on lunch for the dhaka-trip` to the
   bot — same flow works.
5. Verify tour live-updates by writing an entry on the website: it should
   appear in the same friend's view within ~1s via Supabase Realtime.

## What if a step fails

- **Telegram widget won't load**: in the browser console, check that the
  iframe origin matches the Vercel domain. If `Refused to display in a frame`,
  your BotFather `/setdomain` value is wrong.
- **Bot replies with "Server is not configured"**: OPENROUTER_API_KEY is
  missing in Vercel env. Add it and redeploy.
- **Realtime not updating on `/dashboard`**: confirm the publication
  additions from step Supabase-side have run; verify in Supabase Studio →
  API Docs → "Realtime".
- **Friend never gets the lend/borrow ping**: the friend's profile has
  `telegram_id` set only after they sign in to the website for the first
  time via the Telegram widget. Invite them via `/friends` and wait.

The full audit lives in `docs/SECURITY.md` — read it before going live.
