---
status: deferred
moved-to: ../docs/N8N-DEFERRED.md
---

# n8n workflows — DEFERRED (this folder is empty by design)

The four workflow JSONs that previously lived under `n8n/workflows/` were
deleted on 2026-08-04 because each had at least one of:

- `operation: "sendVoice"` (does not exist on `n8n-nodes-base.telegram` v1.2)
- `fetch()` inside a Code node (sandbox forbids network access)
- Conflicting webhook paths on the same n8n instance
- Wiring antipatterns the SDK reference flagged (`splitInBatches`
  done/done-path confusion, orphan `ifElse` gates, dead nodes)

See `../docs/N8N-DEFERRED.md` for the full explanation and the path to
bringing them back with the proper workflow SDK + repeated
`validate_workflow → fix → revalidate` cycles.

Until they come back, the Telegram surface is text-only via the Next.js
fallback at `web/app/api/telegram-webhook/route.ts`.

This file remains so the directory isn't accidentally re-created with
stale content. Delete it when n8n workflows return.
