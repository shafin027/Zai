# `n8n-workflows/sdk-v2/` — cofre workflows in n8n Workflow SDK form

This directory holds the **four n8n workflows** that augment the text-only
Telegram bot in `web/app/api/telegram-webhook/route.ts` and bring back the
voice entry / voice reply / daily tour summary / error-catch-all flows.

| File | Trigger | Purpose |
|---|---|---|
| `cofre-voice-ledger.js` | webhook (`cofre-telegram`) | Voice entrypoint. Receives voice notes or text, transcribes via Groq, classifies via OpenRouter Claude, writes to Supabase, replies with TTS voice. |
| `cofre-notify.js`        | webhook (`cofre-notify`) | Counterparty voice ping. Receives a signed event from `web/lib/telegram/notify-counterparty.ts` and sends a Bangla/English voice reply to a friend. |
| `cofre-tour-daily-summary.js` | cron `0 21 * * *` Asia/Dhaka | Per active tour, sends one voice note to the leader with today's spend + leftover. |
| `cofre-error-workflow.js` | n8n error trigger | Catches failures from any cofre workflow and sends the owner a Telegram alert. |

## Status

Authored 2026-08-04 against n8n Workflow SDK rules derived from `get_sdk_reference`,
validated against the **current node type defs** (Telegram v1.2, httpRequest v4.4,
ifElse v2.3, code v2, scheduleTrigger v1.3, errorTrigger v1, splitInBatches v3,
limit v1, noOp v1, set v3.5, respondToWebhook v1.5, webhook v2.1).

The user's n8n instance has only the **two existing credentials**:

- `Telegram account` (type `telegramApi`)
- `OpenRouter account` (type `openRouterApi`)

We deliberately avoid creating new HTTP-bearer credentials. Instead:

- **`OpenRouter Claude calls** go through the **OpenRouter account** credential
  via the **HTTP Request node's** `authentication: 'genericCredentialType'`,
  `genericAuthType: 'httpBearerAuth'` shape with `credentials: { httpBearerAuth: 'OpenRouter account' }`.
  On the user's instance the credential is named **`OpenRouter account`** — the
  SDK call references it by that name. If the bearer shape differs in n8n,
  rebind the credential.

- **`Groq Whisper calls** use `credentials: { httpBearerAuth: 'GROQ Bearer' }`.
  This credential slot **does not yet exist** on the user's instance. Import-time
  resolution will prompt the user to bind a credential named `GROQ Bearer` with
  the `httpBearerAuth` shape. (They can paste their Groq API key in the dialog.)

- **Google Cloud TTS calls** use `?key={{ $env.GOOGLE_TTS_API_KEY }}` so the bearer isn't
  embedded inline (it's read from Vercel env in production, dev uses local).
  This violates the SDK's "no inline API keys" guidance, but Google TTS's only
  auth shape today is `?key=…`. Alternative: an `httpBearerAuth` credential with
  Google's access token — but the mtls flow is heavier. We're keeping the
  query-key shape because that's how `lib/voice/tts.ts` (now removed) and the
  current Google docs canonicalise it.

## How to import

These files are **not directly importable as JSON** into n8n. They use the
SDK's JS source form (`@n8n/workflow-sdk`). The recommended import path
when the user re-enables the `n8n-mcp` plugin:

```bash
# Once per workflow:
mcp__n8n-mcp__create_workflow_from_code({
  code: <contents of the .js file>,
  name: 'Cofre Voice Ledger',
  projectId: undefined  # defaults to the user's personal project
})
```

Then validate each workflow:

```bash
mcp__n8n-mcp__validate_workflow({ id: '<workflow-id>' })
```

The user's instance has only one project listed via `list_credentials` so
the import defaults there.

After import, bind credentials when prompted:

| Slot | Type | Where the user gets the value |
|---|---|---|
| `Telegram account` | `telegramApi` | already bound |
| `OpenRouter account` | `openRouterApi` (or `httpBearerAuth`) | already bound |
| `GROQ Bearer` | `httpBearerAuth` | https://console.groq.com → API Keys |
| `Google Cloud TTS` (optional switch from inline key) | `httpBearerAuth` | https://console.cloud.google.com → API keys |

Activate each workflow after binding.

## Known validator pitfalls (static read-through)

The MCP server `validate_workflow` tool can't be exercised in the current
session (offline). These are issues I caught and fixed while writing:

1. **All node-specific params under `config.parameters`.** The validator flags
   any node with discriminator fields at `config` top-level. Verified — every
   node in every workflow follows this.

2. **`nodeJson(node, 'field.path')` for non-immediate-predecessor access.** Verified — every reference to `$('X').item.json.Y` for a node that is **not** the immediate predecessor uses `nodeJson(X, 'Y')`. Adjacent-pairs that share data use `$json.Y` directly.

3. **`executeOnce: true` on shared-context fetchers** (`Load Friends`, `Load Active Tours`, `Load Owner Profile`, `Fetch Sender Locale`). These nodes would otherwise run once per item from the previous batch, triggering item-multiplication if upstream delivered more than one item.

4. **`splitInBatches` done-output terminator.** `cofre-tour-daily-summary` has a Limit-1 + body terminator. Without it, the `onDone` branch runs once and immediately exits, leaving in-flight items stranded.

5. **Credentials only via credential store, never inline.** TTS API key is the one exception; rationale above.

## What will need careful verification once MCP is back on

- **Webhook path uniqueness.** The n8n default taxonomy allocates URLs by
  path. The voice-ledger and notify workflows declare distinct paths
  (`cofre-telegram` vs `cofre-notify`), so they coexist. If a developer
  renames either path, the two collide.

- **Webhook auth headers.** Both workflows declare
  `authentication: 'headerAuth'`. The user's Next.js side sends
  `X-Cofre-Signature`; n8n's `headerAuth` looks at whatever the developer
  names the header on import. Both sides must agree.

- **Cron timezone.** tour-daily-summary declares `timezone: 'Asia/Dhaka'`.
  If the user's n8n base-timezone isn't Dhaka, the deploy-time validation
  surfaces a notice (the workflow itself still runs at the configured time).

## If you'd rather these be JSON

These SDK source files can be transformed into n8n JSON exports with one
`mcp__n8n-mcp__create_workflow_from_code({ code: <file> })` call per
workflow. Once created, fetch each with `mcp__n8n-mcp__n8n_get_workflow({ id })`
and export as JSON if you want checked-in equivalents. Re-creating as JSON
loses the SDK's compile-time type safety but gains grep-friendly diffs.
