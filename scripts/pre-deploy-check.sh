#!/usr/bin/env bash
# pre-deploy-check.sh — verify the tree before pushing to GitHub.
#
# It does NOT push, install, or run any deploy. It only does read-only safety
# checks. Run this locally before `git push`; it fails-fast on:
#   - secrets accidentally committed
#   - deleted/expected file paths mismatched
#   - missing migrations vs documented tables
#   - Bearer JWTs or API tokens anywhere
#   - leftover refs to removed paths (n8n workflows, /lib/n8n, etc.)
#
# Exit code: 0 if clean, 1 if any check fails.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# ============================================================
# 1) Secrets scan
# ============================================================
echo "==> checking for accidentally committed secrets"
LEAK_PATTERNS=(
  'TELEGRAM_BOT_TOKEN=[A-Za-z0-9]'
  'OPENROUTER_API_KEY=sk-or-'
  'ANTHROPIC_API_KEY=sk-ant-'
  'GROQ_API_KEY=gsk_'
  'SUPABASE_SERVICE_ROLE_KEY=eyJ'
  'GOOGLE_TTS_API_KEY=AIza'
  '"Authorization": "Bearer eyJ'
  'Bearer eyJhbGciOi'
)
LEAKED=0
for p in "${LEAK_PATTERNS[@]}"; do
  if grep -rEn --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=.git --exclude='*.example' --exclude='pre-deploy-check.sh' "$p" . > /tmp/cofre-leak 2>/dev/null; then
    echo "    ! potential leak: pattern '$p'"
    cat /tmp/cofre-leak
    LEAKED=1
  fi
done
# allow mcp.json env:VAR references as non-leak
if [ "$LEAKED" -ne 0 ]; then
  if grep -E 'env:[A-Z_]+' /tmp/cofre-leak >/dev/null 2>&1; then
    echo "    (matches with env:VAR references are not real secrets — re-check by hand)"
  fi
  echo "fail: secrets present in working tree. Add them to .gitignore and rotate."
  rm -f /tmp/cofre-leak
  exit 1
fi
rm -f /tmp/cofre-leak
echo "    ok no leaked secrets"

# ============================================================
# 2) Migrations
# ============================================================
echo "==> enforcing non-empty migrations"
[ -s supabase/migrations/0001_init.sql ] || { echo "fail: 0001_init.sql empty or missing"; exit 1; }
[ -s supabase/migrations/0002_tours.sql ] || { echo "fail: 0002_tours.sql empty or missing"; exit 1; }
echo "    ok both migrations present"

# ============================================================
# 3) Required files
# ============================================================
echo "==> verifying required files present"
for f in \
  web/package.json web/tsconfig.json web/next.config.mjs web/postcss.config.mjs web/tailwind.config.ts \
  web/.env.example web/env.vercel.example web/app/globals.css web/app/layout.tsx \
  web/app/api/telegram-webhook/route.ts web/lib/telegram/notify-counterparty.ts \
  vercel.json README.md docs/SECURITY.md docs/DEPLOY.md docs/N8N-DEFERRED.md \
  mcp.json n8n/import-readme.md; do
  [ -e "$f" ] || { echo "fail: required file missing: $f"; exit 1; }
done
echo "    ok"

# ============================================================
# 4) No leftover references to removed paths
# ============================================================
echo "==> checking for references to removed voice / n8n paths"
if grep -rEn --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=.git --exclude='.env.local' 'lib/voice|stt\.ts|tts\.ts|cofre-error-workflow|cofre-tour-daily-summary|cofre-voice-ledger|cofre-telegram-notify|cofre-starter-chime|/api/notify|N8N_WEBHOOK_INGRESS_URL|N8N_SHARED_SECRET' web/ > /tmp/cofre-stale 2>/dev/null; then
  echo "    ! references to removed/optional paths still present"
  cat /tmp/cofre-stale
  rm -f /tmp/cofre-stale
  exit 1
fi
rm -f /tmp/cofre-stale
echo "    ok"

# ============================================================
# 5) Shared lib files present
# ============================================================
echo "==> verifying shared lib files present"
node -e "
const fs = require('fs');
const targets = [
  'web/lib/auth/telegram.ts',
  'web/lib/auth/jwt.ts',
  'web/lib/supabase/server.ts',
  'web/lib/supabase/client.ts',
  'web/lib/supabase/queries.ts',
  'web/lib/supabase/tours.ts',
  'web/lib/telegram/notify-counterparty.ts',
  'web/lib/prompts/intent.ts',
  'web/lib/prompts/confirm.ts'
];
for (const t of targets) {
  if (!fs.existsSync(t)) { console.error('missing:', t); process.exit(1); }
}
console.log('    ok');
"

echo
echo "ALL CHECKS PASSED"
echo
echo "Next steps for you:"
echo "  1. git add -A"
echo "  2. git commit -m 'cofre v0.1'"
echo "  3. git push -u origin main            (only after this script passes)"
echo "  4. Supabase: apply 0001 + 0002, enable Realtime on entries/relations/settlements/tours/tour_members/tour_topups"
echo "  5. Telegram @BotFather: /setdomain <your Vercel domain>"
echo "  6. Vercel: import the repo, set every env from web/env.vercel.example"
echo "  7. Telegram webhook URL: https://<your-domain>/api/telegram-webhook"
echo "  8. Smoke test: send 'spent 200 for lunch' to the bot (text only in v0.1)"
echo
echo "Audio entry (voice notes, voice replies) is deferred. See docs/N8N-DEFERRED.md."
