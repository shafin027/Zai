# n8n workflows — deferred

This folder originally shipped four hand-written n8n workflow JSONs that
parsed as valid n8n exports but were guaranteed to fail against the actual
Telegram v1.2 node schema:

- Each workflow called `operation: "sendVoice"`, which **does not exist**
  on `n8n-nodes-base.telegram` v1.2. The closest op is `sendAudio` with
  `binaryData: true`. Detected via `mcp__n8n-mcp__get_node_types`.
- Two of the workflow code nodes called `fetch()` from inside the
  sandbox, which the n8n Code node **explicitly forbids**. Detected via
  `@builderHint` on `n8n-nodes-base.code` v2.
- One workflow used a separate webhook path for the `/start` handler,
  which conflicts with the other voice workflow on the same n8n instance.
  Only one webhook can own a path.

All four JSONs were deleted on 2026-08-04 along with the SDK v2 draft
(`web/n8n-workflows/sdk-v2/`) that was a partial rewrite of the same
workflows using the `n8n-workflow-sdk`. The SDK draft passed the SDK top‑
level shape (`config.parameters`, `expr()`, `newCredential()`) but the
internal wiring of branch chains still had unfixed bugs (`hasVoiceData
.onFalse(undefined)`, missing .to on the voice branch). It would have
needed several more `validate_workflow → fix → revalidate` cycles to clear,
per the SDK's "validate, validate, validate again" guidance.

## What's shipped instead

`web/lib/telegram/text-fallback.ts` + `web/app/api/telegram-webhook/route.ts`.

The website now accepts **text messages** from Telegram with no external
n8n dependency. A user can:

- Send text instead of voice: "lent Raihan 500"
- Get a typed text reply: "Logged. Lent BDT 500 to Raihan."
- Receive friend notifications on lend/borrow via the same webhook
  (text-only; voice promised in v0.2)

There is **no STT** and **no TTS** in this version. Voice capture,
voice reply, and the original "different from the market" pitch are
not in v0.1.

## How to bring n8n back

When you're ready, the path is:

1. In a fresh agent session with the `n8n-mcp` plugin initialized and
   the rotated JWT in shell env, ask it to build the four workflows
   properly using the SDK.
2. Each workflow must:
   - Use `operation: "sendAudio"` instead of `sendVoice`.
   - Do all HTTP calls via `httpRequest` v4.4 nodes, never from a
     `code` node.
   - Use one webhook per workflow, not per branch — branch via
     `ifElse` instead.
3. Validate via `validate_workflow({ code })` — repeat 2-3 times.
4. Create via `create_workflow_from_code`.
5. Activate.
6. Set Vercel `N8N_WEBHOOK_INGRESS_URL` to the notify workflow's URL.
7. Set BotFather @setdomain to your Vercel domain.
8. Smoke-test by sending a voice note and confirming audio lands in
   Supabase.

Files referenced by this folder before the deletion:

- `n8n/workflows/cofre-telegram-voice-ledger.json` — main voice ingest
- `n8n/workflows/cofre-telegram-notify.json` (under `web/`) — counterparty notify
- `n8n/workflows/cofre-tour-daily-summary.json` — daily tour voice summary
- `n8n/workflows/cofre-error-workflow.json` — error-workflow catch-all

Replacing them is safe — there's no Vercel env point at them right now.
`N8N_WEBHOOK_INGRESS_URL` is left blank by default; set it when the
workflows come back.
