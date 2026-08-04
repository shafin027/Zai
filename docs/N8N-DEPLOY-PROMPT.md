---
title: n8n deploy prompt — paste this into the new session
audience: the fresh agent that takes over deploy
status: ready
---

# n8n deploy runbook — for the new agent session

The four SDK workflow files are at:

```
/Users/shafin.mahamud/Documents/Claude/Personal Project/n8n-workflows/sdk-v2/
  cofre-voice-ledger.js          → Telegram voice/text ingest (27 nodes)
  cofre-notify.js                → counterparty voice ping (9 nodes)
  cofre-tour-daily-summary.js    → cron 21:00 Asia/Dhaka leader summary (9 nodes)
  cofre-error-workflow.js        → error-trigger catch-all (3 nodes)
```

Static validation and `node --check` already passed for all four. The
remaining gate is the live MCP deploy.

## What this new agent does

1. **Up-front skills** — load these explicitly before any MCP tool call:
   - `using-n8n-mcp-skills` (router)
   - `n8n-workflow-patterns`
   - `n8n-node-configuration`
   - `n8n-expression-syntax`
   - `n8n-error-handling`
   - `n8n-code-javascript`
   - `n8n-mcp-tools-expert`
   - `n8n-validation-expert`
2. **Health-check** the n8n-mcp plugin and the user's n8n instance:

   ```js
   mcp__n8n-mcp__tools_documentation({ topic: 'ai_agents_guide', depth: 'full' });
   mcp__n8n-mcp__n8n_health_check();
   ```

   If any of these fails, the deploy stops. The failure modes I expect to
   see, and what to do:

   | Failure | Likely cause | Fix |
   |---|---|---|
   | "MCP server 'n8n-mcp' is not connected" | Plugin not registered for THIS session | Run `claude mcp list`, then `/exit` and relaunch Claude Code so the tool surface picks it up. |
   | `n8n_health_check` returns degraded status | Tunnel down or n8n instance crashed | Restart n8n, verify the bearer JWT against your secret manager |
   | 401 from API | JWT expired | Rotate the JWT in n8n, update `N8N_MCP_TOKEN` env, restart Claude Code |

3. **Confirm credentials are present**. Use `mcp__n8n-mcp__list_credentials` and
   assert both `Telegram account` (type `telegramApi`) and
   `OpenRouter account` (type `openRouterApi`) are in the result. If not,
   the user must add them before any workflow can complete an activation
   round.

4. **Deploy each workflow, validating first**. For each file `f`:
   - Run `mcp__n8n-mcp__validate_workflow({ code: <read f as text> })`.
     The validator returns `{ valid: bool, errors: […], warnings: […] }`.
     Fix any errors in-place. Warnings are typically harmless
     (`UNKNOWN_CONFIG_KEY`) but resolve them when the SDK has an exact
     name match.
   - Run `mcp__n8n-mcp__create_workflow_from_code({ code, name })`.
     This returns `{ id, name, … }` — store the id per workflow.
   - Run `mcp__n8n-mcp__n8n_validate_workflow({ id })` — that's
     the validation gate against the **uploaded** workflow, not the
     source.
   - Run `mcp__n8n-mcp__n8n_get_workflow({ id, mode: 'filtered',
     nodeNames: ['Verify HMAC','Fetch Friends','Fetch Active Tours',
     'Extract Intent (OpenRouter Claude)','Write Entries
     (Supabase)','Synthesize Voice (Google TTS)','Send Reply Audio'] })`.
     Inspect each node's `onError` (must be `continueErrorOutput`) and
     confirm the connections map wires `main[1]` to a handler on each
     one. **This is the gate the SDK reference calls "necessary, not
     sufficient"; skipping it means failures land in the void.**
   - Bind credentials when prompted:
     - `Telegram account` (telegramApi) — auto-binds.
     - `OpenRouter HTTP` (httpBearerAuth) — user creates from their
       OpenRouter key.
     - `GROQ Bearer` (httpBearerAuth) — user creates from
       https://console.groq.com → API keys.
     - **Do not paste the bearer tokens in this chat.** Even when
       driving `manage_credentials`, the user pastes them in their
       own shell and the pass-through uses env-only references.

5. **Activate each workflow**:

   ```js
   mcp__n8n-mcp__n8n_update_partial_workflow({
     id: '<workflow-id>',
     operations: [{ type: 'activateWorkflow' }]
   });
   ```

   Repeat for the four ids. After each activation, the workflow has an
   `active: true` flag.

6. **Required UI steps the MCP server cannot perform** (per the
   `using-n8n-mcp-skills` router):

   - **Workflow Settings → Error Workflow**: for each of the three
     unattended workflows (`cofre-voice-ledger`,
     `cofre-tour-daily-summary`, `cofre-notify`), set the Error Workflow
     to `cofre-error-workflow`. The MCP server explicitly says this is
     UI-only.
   - **Telegram @BotFather** — `/setwebhook
     https://<n8n-host>/webhook/cofre-telegram` — point the bot at the
     voice-ledger webhook.
   - **Per-workflow Credentials** — wire the bound credentials to the
     right nodes. The express pattern in
     `n8n-workflows/sdk-v2/README.md` calls this out.

7. **Wire secrets to Vercel**. Once the workflow URLs are known, set:
   - `N8N_WEBHOOK_BASE_URL` = the n8n instance URL (next → n8n fan-in)
   - `N8N_SHARED_SECRET` = the same value used in **workflow
     variables** on every cofre workflow. Both sides must match.

8. **Smoke-test**:
   - Open Telegram, send `"spent 200 for the dhaka-trip lunch"` to the
     bot. The voice-ledger workflow should respond with a Bangla voice
     note: "লগড। লগড। BDT 200 খরচ। মনে রাখলাম।" or equivalent.
   - Send a `lend` entry against a friend who has a Cofre-linked
     Telegram account. The notify workflow should pick it up and fire
     a voice reply to them.
   - Manually trigger `cofre-error-workflow` from the n8n UI to verify
     the alert channel reaches the user's Telegram.

## Known validator patterns to fix in-flight

If `validate_workflow` returns `UNKNOWN_CONFIG_KEY` warnings, the SDK's
actual schema (queried via `mcp__n8n-mcp__get_node_types`) is the source
of truth. Common ones:

| Warning | Fix |
|---|---|
| Node `X` has unknown top-level key `httpMethod` | Move the key into `config.parameters` |
| If node `X` is missing `output:` property | Add `output: [<sample-shape>]` |
| Code node calls `fetch()` | Refactor to use an HTTP Request node |
| Missing credential binding for `httpBearerAuth` | Add `credentials: { httpBearerAuth: '<slot-name>' }` |

## Failure modes for the new agent to triage

- **`create_workflow_from_code` returns a JSON parse error** — the SDK
  source has a malformed string literal. Read the file line-by-line,
  patch, retry.
- **`n8n_get_workflow` shows no `main[1]` connections on a fallible
  node** — the `.onError(handler)` was wired but onError wasn't set
  on the node config. Set `onError: 'continueErrorOutput'` in
  `config.parameters.onError` for that node, then re-add the
  connection.
- **`activateWorkflow` returns "Workflow has unsaved changes"** — run
  `n8n_get_workflow` and inspect. Usually a stale `pinData` from a
  prior test run.
- **Telegram bot returns 401 Unauthorized** — bot token revoked or
  wrong instance. The user re-mints via @BotFather and updates
  `TELEGRAM_BOT_TOKEN` in both Vercel and the n8n workflow variable.

## What not to do

- **Don't paste a real Telegram bot token or any bearer into this
  chat.** It has happened before (Groq key, MCP JWT). Treat any
  sensitive identifier with the same hygiene — through env-var
  references and secret-manager tooling, never inline in any
  artifact.
- **Don't `git push` until you've handed the workflow IDs to the user
  privately.** The four `.js` source files can be committed without
  risk; the deploy artifacts (workflow IDs, webhook URLs) stay in the
  user's hand.

## Quick recap on what's been built so far

- **Next.js app** at `web/` (Vercel-ready, text-only Telegram bot in
  v0.1).
- **Supabase schema** at `supabase/migrations/0001_init.sql` (personal
  + friends ledger) + `0002_tours.sql` (tours with allocations).
- **n8n workflow SDK sources** at
  `n8n-workflows/sdk-v2/cofre-{voice-ledger,notify,tour-daily-summary,
  error-workflow}.js`.
- **Security audit** at `docs/SECURITY.md`.
- **Deploy runbook** at `docs/DEPLOY.md`.
- **Pre-deploy checks** at `scripts/pre-deploy-check.sh` —
  fails-fast on any committed secret, broken required-file path, or
  leftover reference to removed paths.

The text-mode Telegram fallback at `web/app/api/telegram-webhook/route.ts`
is **already running in production-equivalent** without n8n. Adding
n8n is the audio layer the user asked to bring back. None of that
breaks when n8n comes online; it's pure additive.
