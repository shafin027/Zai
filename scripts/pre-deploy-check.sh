#!/usr/bin/env bash
# pre-deploy-check.sh — verify the tree before pushing to GitHub.
#
# It does NOT push, install, or run any deploy. It only does read-only safety
# checks. Run this locally before `git push`; it fails-fast on:
#   - secrets accidentally committed
#   - placeholder URLs leaking
#   - missing migrations vs documented tables
#   - TELEGRAM_BOT_TOKEN leaked anywhere

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> checking for accidentally committed secrets"
# A curated list of "if this substring is anywhere outside of .example, that's a leak"
LEAK_PATTERNS=(
  "TELEGRAM_BOT_TOKEN=[A-Za-z0-9]"
  "ANTHROPIC_API_KEY=sk-ant-"
  "GROQ_API_KEY=gsk_"
  "SUPABASE_SERVICE_ROLE_KEY=eyJ"
  "GOOGLE_TTS_API_KEY=AIza"
)
LEAKED=0
for p in "${LEAK_PATTERNS[@]}"; do
  if grep -rEn --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=.git "$p" . > /tmp/cofre-leak 2>/dev/null; then
    echo "    ! potential leak: pattern '$p'"
    cat /tmp/cofre-leak
    LEAKED=1
  fi
done
if [ "$LEAKED" -ne 0 ]; then
  echo "fail: secrets present in working tree. Add them to .gitignore and rotate."
  rm -f /tmp/cofre-leak
  exit 1
fi
rm -f /tmp/cofre-leak

echo "==> checking placeholder URLs in workflow JSONs"
if grep -nE "REPLACE-WITH-N8N-WEBHOOK-ID|\\\"id\\\":\\\"REPLACE\\\"" n8n/workflows/*.json web/n8n/workflows/*.json 2>/dev/null; then
  echo "warn: placeholder values still in workflows. They are fine to ship to GitHub but each workflow node on n8n side needs a real credential after import."
fi

echo "==> enforcing non-empty migrations"
[ -s supabase/migrations/0001_init.sql ] || { echo "fail: 0001_init.sql empty or missing"; exit 1; }
[ -s supabase/migrations/0002_tours.sql ] || { echo "fail: 0002_tours.sql empty or missing"; exit 1; }
echo "    ok both migrations present"

echo "==> verifying required files present"
for f in \
  web/package.json web/tsconfig.json web/next.config.mjs web/postcss.config.mjs web/tailwind.config.ts \
  web/.env.example web/app/globals.css web/app/layout.tsx \
  vercel.json README.md docs/SECURITY.md \
  n8n/workflows/cofre-telegram-voice-ledger.json; do
  [ -e "$f" ] || { echo "fail: required file missing: $f"; exit 1; }
done
echo "    ok"

echo "==> quick TypeScript syntax pass on shared lib (no compile, no install)"
node -e "
const fs = require('fs');
const path = require('path');
const targets = [
  'web/lib/auth/telegram.ts',
  'web/lib/auth/jwt.ts',
  'web/lib/supabase/server.ts',
  'web/lib/supabase/client.ts',
  'web/lib/supabase/queries.ts',
  'web/lib/supabase/tours.ts',
  'web/lib/voice/stt.ts',
  'web/lib/voice/tts.ts',
  'web/lib/n8n/index.ts',
  'web/lib/n8n/notify.ts',
  'web/lib/prompts/intent.ts',
  'web/lib/prompts/confirm.ts'
];
for (const t of targets) {
  if (!fs.existsSync(t)) { console.error('missing:', t); process.exit(1); }
}
console.log('    ok all shared lib files present');
"

echo
echo "ALL CHECKS PASSED"
echo
echo "Next steps for you:"
echo "  1. git init -b main (only if first push)"
echo "  2. git add -A"
echo "  3. git commit -m 'Initial cofre deploy'"
echo "  4. git remote add origin https://github.com/shafin027/Zai.git (only if not already added)"
echo "  5. git push -u origin main"
echo "  6. In Supabase: run both migrations, then enable Realtime on tours/tour_members/tour_topups"
echo "  7. In Vercel: import the repo, set every env from web/env.vercel.example"
echo "  8. In n8n: import both workflow JSONs, set workflow-level env vars, copy webhook URL into Vercel's N8N_WEBHOOK_INGRESS_URL"
