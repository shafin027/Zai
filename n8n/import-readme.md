---
title: n8n workflow import notes
---

# How to import the cofre workflows

The two JSON files under `n8n/workflows/` are complete n8n export payloads.
Before they run, two things in your n8n instance will need real values:

1. **Credential references** (`"credentials": { "telegramApi": { "id": "REPLACE", "name": "Telegram bot" } }`)
   - In n8n: Credentials → New → Telegram API → paste your bot token. After
     saving, n8n assigns a UUID. Open each workflow's Telegram node and pick
     the credential from the dropdown. Save and re-export the workflow if
     you want the JSON to carry the real ID.

2. **Webhook path** (`"webhookId": "REPLACE-WITH-N8N-WEBHOOK-ID"`)
   - On import, n8n will generate its own webhookId automatically. You do
     not need to edit the JSON; just copy the resulting webhook URL into
     your Vercel env as `N8N_WEBHOOK_INGRESS_URL`.

3. **Workflow variables** (Settings → Variables on each workflow)
   - `SUPABASE_URL` = your Supabase project URL (same value as `NEXT_PUBLIC_SUPABASE_URL`)
   - `SUPABASE_SERVICE_ROLE_KEY` = the service role key from Supabase dashboard
     (server-only; do NOT expose to client)
   - `N8N_SHARED_SECRET` = the HMAC secret you set in Vercel under the same
     name. Both sides must match.
   - `GROQ_API_KEY` = `gsk_…` from https://console.groq.com
   - `ANTHROPIC_API_KEY` = `sk-ant-…`
   - `GOOGLE_TTS_API_KEY` = `AIza…` from Google Cloud console

   In n8n these are addressed from a Code node as `process.env.X` once the
   workflow-level variable is set, OR you can use the credential store and
   bound HTTP Request headers.

# Activation checklist

After import:

- Activate each workflow
- Test the voice-ledger workflow by sending a Telegram message to your bot
  (with `rawBody` enabled in the webhook node, you can also curl the URL with
  a fake HMAC signature to confirm the 401 path then a real one for the 200 path)
- Test the notify workflow by hitting `POST /api/entries` from the web UI
  with a known counterparty, then check n8n execution history
