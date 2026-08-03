---
status: audit complete, closed-loops
last_updated: 2026-08-03
auditor: claude build agent
---

# Cofre Security Audit

This is the audit record for the build. It is read alongside the code; every
finding is either resolved in the listed file or carries a non-negotiable
rationale for not fixing it now.

## Authentication

| Concern | Status | Where it's enforced |
|---|---|---|
| Telegram Login Widget forgery | FIXED | `lib/auth/telegram.ts` — HMAC-SHA256 over `data-check-string` using `sha256(bot_token)` as key, `timingSafeEqual` compare |
| HMAC replay window | FIXED | Same file, `maxAgeSec=86400` (Telegram default) |
| Cookie theft via XSS | MITIGATED | `app/api/telegram-login/callback/route.ts` sets `httpOnly` + `sameSite=lax` + `secure` in prod |
| Cookie theft via CSRF | MITIGATED | SameSite lax + all mutating routes require session that we just verified |
| Cookie tampering | FIXED | `lib/auth/jwt.ts` — HMAC signature verified on every read via `timingSafeEqual` |
| Stolen session token replay | MITIGATED | Same file, `exp` claim; sessions are 12h max |
| Service role key exposure to client | FIXED | Only `lib/supabase/server.ts`'s `supabaseAdmin()` uses it; never imported into any client component |
| Bot token exposure to client | FIXED | Only `lib/telegram/send.ts` & `download.ts` use it server-side; the widget uses the public `data-telegram-login` ID at runtime |
| API key exposure via `NEXT_PUBLIC_` | FIXED | Only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are public; both are designed to be client-visible (RLS protects them) |

## Authorization (RLS)

| Concern | Status | Where it's enforced |
|---|---|---|
| Friend can read owner's other expenses | FIXED | `supabase/migrations/0001_init.sql` policies — `entries_read` requires `owner_id = current_profile_id() OR counterparty_id = current_profile_id()` |
| Friend can write owner's entries | FIXED | `entries_owner_write` requires owner |
| Friend can modify owner's balance by claiming different role | FIXED | `profiles_self_update` requires `id = current_profile_id()`; role changes are impossible because `profiles` is upsert-only via API and we only set role on first insert |
| User can list relations they aren't a party to | FIXED | `relations_read` requires `owner_id OR friend_id = current_profile_id()` |
| User can forge a relation invitation as the friend | FIXED | `relations_friend_accept` allows the friend to update, but only to `status='active'`. They cannot change owner_id, invite_token, etc. |
| Anonymous reads | FIXED | All tables have RLS enabled; no policy allows `using (true)` without a session |
| Profile lookup across users | FIXED | `profiles_self_read` + `profiles_relation_read` — only self + adhered relations, not the whole profiles table |

## Webhook ingress

| Concern | Status | Where it's enforced |
|---|---|---|
| Telegram webhook signature | CONFIG | Configure via `@BotFather /setwebhook` to point at `https://<your-domain>/api/telegram-webhook`. The route requires the `X-Cofre-Signature` HMAC header on every call and rejects on mismatch (401). |
| Inbound HMAC verification | FIXED | `web/app/api/telegram-webhook/route.ts` HMAC-SHA256 over the raw body, `timingSafeEqual` compare against `TELEGRAM_WEBHOOK_SECRET` env var; 24h max age via `X-Telegram-Auth-Date` if Telegram enforces |
| Internal notify forgery | FIXED | `lib/telegram/notify-counterparty.ts` uses `https://api.telegram.org/bot<token>/sendMessage` directly; no n8n intermediary, so no second HMAC channel to verify |
| Outbound reply forgery | MITIGATED | Outbound messages use `TELEGRAM_BOT_TOKEN` server-side; the token is never exposed to the client. Bound by Telegram's server-side authentication. |

## Input handling

| Concern | Status | Where it's enforced |
|---|---|---|
| Mass-assignment of role on profile upsert | FIXED | `app/api/telegram-login/callback/route.ts` only sets `role = invite ? 'friend' : 'owner'`; `role` is never read from the widget payload |
| Mass-assignment on entry insert | FIXED | `app/api/entries/route.ts` uses Zod schema whitelist; fields outside the schema are dropped |
| Profile form CSRF | MITIGATED | SameSite lax cookie + server check of session — form POST will fail when unauthenticated and redirect to `/` |
| Friend invite leak | PARTIAL | Acceptable: invite tokens are 24 random bytes (192 bits of entropy); brute force is infeasible. They are not enumerated anywhere public |
| Counterparty mismatch | FIXED | `app/api/entries/route.ts` requires `counterparty_id` for lend/borrow; reject if relation doesn't exist OR counterparty is set to anything but a friend ID |
| Ledger amount overflow | FIXED | DB has `check (amount_cents > 0)`; API also checks positive integer; signed BigInt comparison would be needed for debits which we don't accept yet |

## Storage & secrets

| Concern | Status | Where it's enforced |
|---|---|---|
| .env committed | FIXED | `.gitignore` excludes `.env`/`.env.local`; CI should still gate |
| Service role present in `NEXT_PUBLIC_*` | FIXED | None of the server-only secrets are prefixed `NEXT_PUBLIC_` |
| Supabase anon key in client | INFORMATIONAL | This is by design — RLS is the security boundary |
| Database password in repo | FIXED | Not present; password rotation handled in Supabase dashboard |

## AI

| Concern | Status | Where it's enforced |
|---|---|---|
| LLM prompt injection via transcript | LOW-RISK | The intent prompt's rules forbid prose/markdown/echo; counterparty resolution is restricted to `knownFriends`; amount sanity-check is positive integer only. Confidence < 0.7 entries land with `confirmed_by_owner=false`. |
| LLM data exfiltration via transcript | LOW-RISK | We only pass transcript + a static friend list to Claude. No personal profile fields are forwarded, no system prompt instructions are forwarded. |
| Counterparty name hallucination | MITIGATED | The intent prompt's rule #3 says counterparty resolution requires a name in `knownFriends`. If three-condition match fails, the entry is rejected at the route (`I couldn't match a friend named "<name>"`). |
| OpenRouter key exposure | FIXED | `OPENROUTER_API_KEY` is server-only, prefixed with `OPENROUTER_API_KEY=` (no `PUBLIC_` variant). Vercel-side env, never bundled to client. |

## Things deliberately not done

- **Rate limiting on web routes** — Supabase's free tier doesn't include it natively. Real protection is via Supabase Pro (and Cloudflare/Vercel firewall) — documented in README.
- **Audit log of login attempts** — Telegram Login Widget only logs successful auth; bots can't try it. The audit table does have `auth.login` events for each successful sign-in.
- **PIN/2FA** — Not in scope; Telegram identity is the factor.

## Hardening checklist before you ship

1. Rotate the Supabase service-role key on first deploy.
2. Generate `TELEGRAM_WEBHOOK_SECRET` (32+ chars) and `SESSION_SECRET` (different value, 32+ chars) — never reuse values from dev.
3. In Telegram BotFather, register a domain whitelist for the Login Widget (`/setdomain`) to your Vercel URL, and point `/setwebhook` to `https://<your-domain>/api/telegram-webhook`.
4. Enable Supabase email/password**disabled** (we use Telegram only), as set in `supabase/config.toml`.
5. Force HTTPS for the Vercel webhook URL; Telegram already requires HTTPS for webhooks.
6. Set up Vercel's env var protection for the deploy branch.

If you want to harden further:

- Add Supabase RLS policies that require `entries.confirmed_by_owner = true` on read for friends (until owner explicitly confirms). Currently default `true` on web inserts.
- Add Sentry or equivalent for `/api/*` errors.
- Add a daily reconciliation job: compare `entries.amount_cents` vs `settlements.amount_cents` per owner and dispatch a daily Telegram summary.
