# TwoCents — Handoff Context

Updated 2026-08-23 (Codex takeover in progress). Read this before touching code.

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

Working end to end: signup/login (cookie sessions, bcrypt) → household create/join via invite code → NL quick-add (`swiggy 450`, `uber 340 yesterday`, `petrol 2k`, `$40 dinner`, `three hundred on chai`) → voice entry with transcript review before saving (Web Speech API feeding the same parser; needs HTTPS so works on localhost but not LAN-IP) → structured capture confirmation with Undo/Edit → one-tap presets → weekly/monthly recurring schedules → shared ledger with per-person dots → tap-to-edit sheet (amount, currency, category, merchant, note, date, time; delete inside sheet) → insights (month nav, hero total + delta vs prev month, daily bars, category bars, who-paid split) → settings (invite code, presets CRUD, recurring schedules, API tokens, Shortcuts setup guide) → Shortcuts endpoint (bearer auth; returns `{"message": "₹450 · 🍜 Food & Drinks · Swiggy ✓"}` for the notification).

Capture trust work completed and browser-verified on 2026-08-22: negative and multi-number inputs are rejected instead of guessed; malformed dates/times, unsafe amounts, and cross-household category IDs are rejected; web captures use a per-request idempotency key; successful captures expose Undo and Edit; voice no longer auto-saves. Regression suite: `npm test` (12 tests at time of update).

Household/security work completed and browser-verified on 2026-08-23: a user can belong to only one household; households are capped at two people; invite codes rotate automatically after use and owners can replace an unused code; production session cookies are `Secure`; the service worker caches only public static assets and never authenticated pages/RSC responses. Regression suite: `npm test` (16 tests at time of update).

Authentication hardening completed on 2026-08-23: login, signup, invite attempts/rotation, and API-token creation have persistent rate limits with HMACed identifiers; malformed auth bodies and token labels are bounded; unknown-email login performs the same bcrypt work; session rotation removes the previous session, expired sessions are cleaned up, and users can sign out everywhere. Next/React/PostCSS were upgraded to patched production releases and `npm audit --omit=dev` reports zero vulnerabilities. `RATE_LIMIT_SECRET` is required in production.

Partner onboarding and the accessibility/UI foundation were completed and browser-verified on 2026-08-23. New households now land on a dedicated one-time invite handoff with plain instructions before entering the ledger; single-member empty ledgers keep the invite visible. Logged-in pages share a persistent Ledger/Insights/Settings navigation that stays at the bottom through tablet widths and becomes a desktop rail. Auth/setup/edit forms have visible labels, 16px controls, 44px touch targets, stronger muted-text contrast, and page metadata; pinch zoom is enabled. The expense editor now traps focus, closes with Escape/backdrop, restores focus, locks background scroll, and fits short mobile viewports. Regression suite: `npm test` (21 tests at time of update); TypeScript, lint, production build, responsive screenshots, console checks, and authenticated/onboarding browser flows pass.

Data ownership and spending pace were completed and browser-verified on 2026-08-23. Settings now downloads the full shared ledger as an authenticated, private/no-store UTF-8 CSV with original amounts, snapshotted home-currency values, categories, notes, payer, source, timestamps, and expense IDs; text cells are neutralized against spreadsheet-formula injection and the query is household-scoped. Home shows a neutral pace card only after at least two comparable active months: spend through today is compared with the median of up to three recent months through the same day, with a ±5% “usual variation” band and no red/shame framing. Regression suite: `npm test` (31 tests at time of update); authenticated download headers/body, unauthenticated rejection, responsive UI, console checks, TypeScript, lint, and production build pass.

Recurring expenses were completed and browser-verified on 2026-08-23. Either partner can create a weekly or monthly schedule in Settings; the creator is the payer and is the only person who can pause, resume, or delete it. Due charges are materialized transactionally before the ledger, insights, settings, or CSV export is read, with one charge per due date, catch-up after time away, preserved month anchors (31 Jan → 28 Feb → 31 Mar), snapshotted FX, and no duplicates on reload. Pausing skips dates during the paused period; deleting a schedule keeps its already-logged expenses. Until a deployed background worker exists, a due charge posts when either partner next opens TwoCents rather than at midnight, and the UI says this plainly. Regression suite: `npm test` (36 tests at time of update); existing-database migration, unauthenticated API rejection, create/pause/resume/delete, idempotent reload, responsive UI, console checks, TypeScript, lint, and production build pass.

Gentle category guides were completed and browser-verified on 2026-08-23. Either partner can set, edit, or remove a shared monthly amount for a category in the household home currency. Home shows the three categories most ahead of an even month-to-date pace; current-month Insights shows every active guide. Copy stays neutral (ahead, breathing room, or close to pace), the progress track marks both spend and elapsed month, and no hard-stop or red failure state is used. Future-dated expenses are excluded and multi-currency expenses use their capture-time FX snapshot. Regression suite: `npm test` (40 tests at time of update); household scoping, validation, existing-database migration, future-date exclusion, unauthenticated API rejection, create/edit/remove, responsive UI, console checks, TypeScript, lint, and production build pass.

## Architecture / file map

- `lib/db.ts` — better-sqlite3 singleton (`global.__twocents_db`), schema (Postgres-compatible: TEXT ids, INTEGER ms), and `migrate()` for additive ALTERs. Web captures store a nullable `request_id` with a per-user unique index for idempotency; recurring charges store `recurring_rule_id` with a per-rule/date unique index.
- `lib/auth.ts` — sessions (cookie `tc_session`, 90d, `HttpOnly` + `SameSite=Lax` + `Secure` in production), session rotation/revocation, bcrypt, bearer-token resolution (SHA-256 hashes in `api_tokens`).
- `lib/rate-limit.ts` — database-backed fixed-window limits for auth/invite/token abuse; request identifiers are HMACed before storage.
- `lib/households.ts` — transactional household creation/joining, two-person enforcement, single-use invite rotation, and owner-only manual invite replacement.
- `lib/parse.ts` — THE parsing brain. Every capture surface funnels here. Currency symbols/words, digit + `k`/`lakh` shorthand, spelled-out word-numbers, date words (yesterday/day before/weekdays), category+merchant from `CATEGORY_KEYWORDS`.
- `lib/categories.ts` — default category set with chart colors + the keyword dictionary.
- `lib/expenses.ts` — all expense ops: create-from-parsed (stamps `spent_time` only when spent_on == today), update/delete with creator checks, month summaries, presets.
- `lib/recurring.ts` — validates and manages weekly/monthly schedules, advances monthly anchor dates, and transactionally materializes due charges without duplicates.
- `lib/budgets.ts` — validates shared category guides, enforces household scope, rolls current-month expenses into home currency, and calculates neutral pace/projection values.
- `lib/money.ts` — currency table, static per-USD rates, `formatMinor` (en-IN grouping for INR).
- `app/api/*` — routes: auth (signup/login/logout), household (create/join), capture, expenses/[id] (PATCH/DELETE, creator-only), presets (+ [id]/log), recurring (+ [id] PATCH/DELETE, creator-only), categories/[id]/budget (PATCH/DELETE, household-scoped), tokens, shortcuts/capture (bearer), and export (authenticated household CSV).
- `app/page.tsx` (home), `app/insights/`, `app/settings/`, `app/login|signup|onboarding/` — pages; server components + client islands in `components/`. `components/AppNav.tsx` owns shared logged-in navigation; `components/OnboardingFlow.tsx` owns create/join and the post-create invite handoff.
- `components/ExpenseList.tsx` — list + EditSheet modal. `components/QuickAdd.tsx` — capture bar + voice. `components/RecurringManager.tsx` owns recurring schedule creation and controls. `components/BudgetManager.tsx` owns category-guide settings; `components/CategoryBudgetPace.tsx` renders the compact Home and full Insights views. `components/SpendingPace.tsx` renders the home pace card; the calculation/query lives in `lib/expenses.ts`. CSV serialization and filename safety live in `lib/export.ts`.
- PWA: `app/manifest.ts`, `public/sw.js` (registers only in production), icons generated by `scripts/gen-icons.mjs`.

## Data model (SQLite, `data/twocents.db` — gitignored, contains REAL user data; never commit or wipe)

users · sessions · households (home_currency, invite_code) · household_members · categories (per-household, seeded on create, `budget_minor` nullable shared monthly guide) · recurring_expenses (payer, label, amount/currency/category, weekly|monthly, anchor_day, next_due_on, active) · expenses (amount_minor INT, currency, fx_to_home REAL, category_id, merchant, note, spent_on 'YYYY-MM-DD', spent_time 'HH:MM' nullable, source web|voice|preset|shortcut|recurring, raw_input, recurring_rule_id nullable) · presets · api_tokens (hash only).

Money rule: integers in minor units; `home_minor = round(amount_minor * fx_to_home)`.

## Dev workflow & hard-won gotchas

- Run: `npm run dev` (port 3000). Checks: `npm test`, `npx tsc --noEmit`, `npm run lint`, and `npm run build`.
- **NEVER run `npm run build` while the dev server is running.** Both write `.next/`; the build corrupts the live server (this happened; symptom: every route 500s with `Cannot find module './NNN.js'`). Recovery: stop server, `rm -rf .next`, restart.
- **Schema changes need a server restart**: the DB singleton is cached in `global`, so `migrate()` only runs on a fresh process. Symptom of forgetting: `SqliteError: table X has no column named Y`.
- Tailwind: don't stack `w-full` (in a shared class string) with `w-32`-style overrides — stylesheet order wins, not class order. Pattern in EditSheet: base class has no width; add `w-full` / `flex-1 min-w-0` / `w-32 shrink-0` per use.
- Settings becomes a two-column grid at desktop widths, so each child section is still only about 400px wide. Keep row controls stacked or intrinsically narrow; do not assume a desktop viewport means a full-width child card.
- tsconfig target is ES2017 (spread-of-Map-iterators needs it).
- Phone testing: same Wi-Fi → `http://<mac-ip>:3000` (`ipconfig getifaddr en0`). Mic/PWA-install polish need HTTPS (deferred to deployment).
- Local QA accounts and invite codes live only in the gitignored database. Do not put reusable credentials or live invite codes in committed documentation; create a throwaway account through `/signup` when a clean onboarding state is needed.

## Roadmap (research-ranked; see docs/market-research.md)

Completed: CSV export; glanceable spend-so-far vs typical-by-this-date pace; recurring expenses; gentle per-category guides.

1. Private-expense flag (mixed-finances couples: counted, but details hidden from partner)
2. Insights drill-down within a category grouped by title (proposed to owner as the no-friction alternative to formal subcategories — owner has NOT yet approved; formal subcategories, if ever, must be optional + keyword-auto-assigned)
3. Deployment: GitHub done; next is Vercel + Postgres swap (schema is ready) — owner is deployment-beginner, explain steps plainly.

Known parser gap the owner flagged: household-help words (`cook`, `nanny`, `driver`…) aren't in `CATEGORY_KEYWORDS` → land in Other ("maid" is mapped). Fix pending as part of the owner's next feedback batch — consider a dedicated Household Help category.

## Working with the owner

Product-savvy growth executive, not an engineer; India-based (INR home currency, IST). Explain infra/deployment from first principles. They give feedback in batches — implement faithfully, verify in the browser, and flag design trade-offs explicitly (e.g., "creator-only applies to edit too — loosen for categories?"). Never make claims about what works without having verified it.
