# TwoCents — Handoff Context

Updated 2026-08-22 (Codex takeover in progress). Read this before touching code.

## What this is

TwoCents is a **shared household expense ledger for couples** — a product from day one, not a personal tool. Core promise: log an expense in ~3 seconds, both partners see one ledger, analysis covers "us." Differentiators: **no bank linking, no AI/API keys, no data leaving the server**. Repo: `github.com/mohitkhandelwal8-cy/twocents` (private). Working dir is the repo root.

## Locked product decisions (do not relitigate without the owner)

1. **PWA + API first; native iOS (App Intents) is phase 2** on the same API. iPhone Shortcuts/Siri already work via personal API tokens + `POST /api/shortcuts/capture`.
2. **No AI features, no API keys.** Parsing is deterministic local code in `lib/parse.ts`. Receipt scanning was deliberately removed (needs vision AI). Do not reintroduce Claude/OpenAI parsing or receipt capture unless the owner reopens it.
3. **No bank/SMS sync — ever the answer to entry friction.** It's the category's #1 complaint and the product's anti-positioning (see `docs/market-research.md`).
4. **Multi-currency**: each expense stores its own currency + `fx_to_home` snapshotted at capture (static table in `lib/money.ts`); totals roll up into the household home currency. Historical totals must never drift.
5. **Creator-only mutation**: only the user who logged an expense may edit/delete it. Enforced server-side (403), affordances hidden in UI.
6. **Couples framing is contribution, not debt.** "Who paid" shows percentages/amounts; never add settle-up/"you owe me" as a default frame.
7. **No red pass/fail budget states** anywhere, ever (research: shame UX kills retention). Progress/pace framing only.
8. **Design**: dark-first "midnight ledger." Tokens in `app/globals.css`; person identity colors mint `#7fe0b2` (member 1) / amber `#f0b860` (member 2) via `lib/colors.ts`, always paired with a name/initial, never color alone. Charts use the CVD-validated dark palette hardcoded in `lib/categories.ts` (first 8 categories) — do not invent new chart hues.

## Current state (all browser-verified)

Working end to end: signup/login (cookie sessions, bcrypt) → household create/join via invite code → NL quick-add (`swiggy 450`, `uber 340 yesterday`, `petrol 2k`, `$40 dinner`, `three hundred on chai`) → voice entry with transcript review before saving (Web Speech API feeding the same parser; needs HTTPS so works on localhost but not LAN-IP) → structured capture confirmation with Undo/Edit → one-tap presets → shared ledger with per-person dots → tap-to-edit sheet (amount, currency, category, merchant, note, date, time; delete inside sheet) → insights (month nav, hero total + delta vs prev month, daily bars, category bars, who-paid split) → settings (invite code, presets CRUD, API tokens, Shortcuts setup guide) → Shortcuts endpoint (bearer auth; returns `{"message": "₹450 · 🍜 Food & Drinks · Swiggy ✓"}` for the notification).

Capture trust work completed and browser-verified on 2026-08-22: negative and multi-number inputs are rejected instead of guessed; malformed dates/times, unsafe amounts, and cross-household category IDs are rejected; web captures use a per-request idempotency key; successful captures expose Undo and Edit; voice no longer auto-saves. Regression suite: `npm test` (12 tests at time of update).

Household/security work completed and browser-verified on 2026-08-23: a user can belong to only one household; households are capped at two people; invite codes rotate automatically after use and owners can replace an unused code; production session cookies are `Secure`; the service worker caches only public static assets and never authenticated pages/RSC responses. Regression suite: `npm test` (16 tests at time of update).

Authentication hardening completed on 2026-08-23: login, signup, invite attempts/rotation, and API-token creation have persistent rate limits with HMACed identifiers; malformed auth bodies and token labels are bounded; unknown-email login performs the same bcrypt work; session rotation removes the previous session, expired sessions are cleaned up, and users can sign out everywhere. Next/React/PostCSS were upgraded to patched production releases and `npm audit --omit=dev` reports zero vulnerabilities. `RATE_LIMIT_SECRET` is required in production.

## Architecture / file map

- `lib/db.ts` — better-sqlite3 singleton (`global.__twocents_db`), schema (Postgres-compatible: TEXT ids, INTEGER ms), and `migrate()` for additive ALTERs. Web captures store a nullable `request_id` with a per-user unique index for idempotency.
- `lib/auth.ts` — sessions (cookie `tc_session`, 90d, `HttpOnly` + `SameSite=Lax` + `Secure` in production), session rotation/revocation, bcrypt, bearer-token resolution (SHA-256 hashes in `api_tokens`).
- `lib/rate-limit.ts` — database-backed fixed-window limits for auth/invite/token abuse; request identifiers are HMACed before storage.
- `lib/households.ts` — transactional household creation/joining, two-person enforcement, single-use invite rotation, and owner-only manual invite replacement.
- `lib/parse.ts` — THE parsing brain. Every capture surface funnels here. Currency symbols/words, digit + `k`/`lakh` shorthand, spelled-out word-numbers, date words (yesterday/day before/weekdays), category+merchant from `CATEGORY_KEYWORDS`.
- `lib/categories.ts` — default category set with chart colors + the keyword dictionary.
- `lib/expenses.ts` — all expense ops: create-from-parsed (stamps `spent_time` only when spent_on == today), update/delete with creator checks, month summaries, presets.
- `lib/money.ts` — currency table, static per-USD rates, `formatMinor` (en-IN grouping for INR).
- `app/api/*` — routes: auth (signup/login/logout), household (create/join), capture, expenses/[id] (PATCH/DELETE, creator-only), presets (+ [id]/log), tokens, shortcuts/capture (bearer).
- `app/page.tsx` (home), `app/insights/`, `app/settings/`, `app/login|signup|onboarding/` — pages; server components + client islands in `components/`.
- `components/ExpenseList.tsx` — list + EditSheet modal. `components/QuickAdd.tsx` — capture bar + voice.
- PWA: `app/manifest.ts`, `public/sw.js` (registers only in production), icons generated by `scripts/gen-icons.mjs`.

## Data model (SQLite, `data/twocents.db` — gitignored, contains REAL user data; never commit or wipe)

users · sessions · households (home_currency, invite_code) · household_members · categories (per-household, seeded on create) · expenses (amount_minor INT, currency, fx_to_home REAL, category_id, merchant, note, spent_on 'YYYY-MM-DD', spent_time 'HH:MM' nullable, source web|voice|preset|shortcut, raw_input) · presets · api_tokens (hash only).

Money rule: integers in minor units; `home_minor = round(amount_minor * fx_to_home)`.

## Dev workflow & hard-won gotchas

- Run: `npm run dev` (port 3000). Checks: `npm test`, `npx tsc --noEmit`, `npm run lint`, and `npm run build`.
- **NEVER run `npm run build` while the dev server is running.** Both write `.next/`; the build corrupts the live server (this happened; symptom: every route 500s with `Cannot find module './NNN.js'`). Recovery: stop server, `rm -rf .next`, restart.
- **Schema changes need a server restart**: the DB singleton is cached in `global`, so `migrate()` only runs on a fresh process. Symptom of forgetting: `SqliteError: table X has no column named Y`.
- Tailwind: don't stack `w-full` (in a shared class string) with `w-32`-style overrides — stylesheet order wins, not class order. Pattern in EditSheet: base class has no width; add `w-full` / `flex-1 min-w-0` / `w-32 shrink-0` per use.
- tsconfig target is ES2017 (spread-of-Map-iterators needs it).
- Phone testing: same Wi-Fi → `http://<mac-ip>:3000` (`ipconfig getifaddr en0`). Mic/PWA-install polish need HTTPS (deferred to deployment).
- Test accounts (local db): `mohit@example.com` / `testpass123` and `ananya@example.com` / `testpass123`, both in household "M & A" (invite code 9F128D78).

## Roadmap (research-ranked; see docs/market-research.md) — none started

1. CSV export (trivial; answers the data-ownership trust wound)
2. Glanceable pace number (spend-so-far vs typical-by-this-date; progress framing)
3. Recurring expenses (auto-log rent/Netflix on schedule; extends presets)
4. Gentle per-category budgets (pace framing)
5. Private-expense flag (mixed-finances couples: counted, but details hidden from partner)
6. Insights drill-down within a category grouped by title (proposed to owner as the no-friction alternative to formal subcategories — owner has NOT yet approved; formal subcategories, if ever, must be optional + keyword-auto-assigned)
7. Deployment: GitHub done; next is Vercel + Postgres swap (schema is ready) — owner is deployment-beginner, explain steps plainly.

Known parser gap the owner flagged: household-help words (`cook`, `nanny`, `driver`…) aren't in `CATEGORY_KEYWORDS` → land in Other ("maid" is mapped). Fix pending as part of the owner's next feedback batch — consider a dedicated Household Help category.

## Working with the owner

Product-savvy growth executive, not an engineer; India-based (INR home currency, IST). Explain infra/deployment from first principles. They give feedback in batches — implement faithfully, verify in the browser, and flag design trade-offs explicitly (e.g., "creator-only applies to edit too — loosen for categories?"). Never make claims about what works without having verified it.
