# TwoCents

The shared expense ledger for couples. Log an expense in three seconds, see where the month went — together. No bank permissions, no API keys, no data leaving your server.

## Why it exists

Expense trackers die from entry friction. TwoCents attacks that directly:

- **One parsing brain, many mouths.** Type `swiggy 450`, say it to Siri, or tap a preset — every surface funnels into the same local `text → structured expense` parser. It handles merchant keywords, dates ("yesterday", "last friday"), shorthand ("2k", "1.5 lakh"), currency symbols, and spelled-out numbers from voice dictation ("three hundred on chai").
- **Shared by design.** Expenses live in a *household*, not an account. Either partner logs, both see everything, and analysis covers "us" — sliceable by person.
- **Multi-currency.** Each expense keeps its own currency; the FX rate is snapshotted at capture so history never drifts. Totals roll up into the household home currency.
- **Fully self-contained.** Parsing is deterministic local code. Nothing is sent to any third-party service.

## Running it

```bash
npm install
npm run dev
```

Open http://localhost:3000, create an account, create a household, and share the invite code (Settings) with your partner.

### iPhone Shortcuts / Siri

Settings → *Siri & iPhone Shortcuts* → generate a token, then follow the 5-step guide there. You get "Hey Siri, log expense", Action Button, and Back Tap logging via a simple authenticated POST to `/api/shortcuts/capture`. Your phone must be able to reach the server (deploy it, or use your Mac's LAN IP in dev).

## Architecture

- **Next.js 14 (App Router) + TypeScript + Tailwind** — PWA (manifest + service worker + installable icons)
- **SQLite via better-sqlite3** in `data/` — schema kept Postgres-compatible for the launch migration
- **Cookie sessions + bcrypt**; personal API tokens (SHA-256 hashed) for Shortcuts
- **Deterministic local parser** in `lib/parse.ts` — keywords, dates, currencies, word-numbers
- Chart palette is CVD-validated for the dark surface

## Roadmap (phase 2)

- Native iOS app with App Intents (deepest Siri/widget integration) on the same API
- Budgets per category with alerts
- Live FX rates
- Postgres + hosted deploy for real users
