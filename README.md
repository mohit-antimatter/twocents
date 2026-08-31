# OurPool

Household expenses, tracked together. Log everyday spending, plan your monthly budget, and see where your money goes. No bank connection required.

[Open OurPool](https://ourpool.vercel.app) · [GitHub repository](https://github.com/mohit-antimatter/ourpool) · [Contributor context](CODEX_CONTEXT.md)

## Why it exists

Expense trackers die from entry friction. OurPool attacks that directly:

- **One parsing brain, many mouths.** Type `swiggy 450`, say it to Siri, or tap a preset — every surface funnels into the same local `text → structured expense` parser. It handles merchant keywords, dates ("yesterday", "last friday"), shorthand ("2k", "1.5 lakh"), currency symbols, and spelled-out numbers from voice dictation ("three hundred on chai").
- **Shared by design.** Expenses live in a *household*, not an account. Either partner logs, both see everything, and analysis covers "us" — sliceable by person.
- **Multi-currency.** Each expense keeps its own currency; the FX rate is snapshotted at capture so history never drifts. Totals roll up into the household home currency.
- **Local parsing.** Expense parsing is deterministic code, with no third-party AI service. Hosted data is stored in PostgreSQL; optional Google sign-in uses Google for authentication.

## Running it

```bash
npm install
cp .env.example .env.local
npm run dev
```

Add your PostgreSQL connection strings and a random `RATE_LIMIT_SECRET` to `.env.local` before starting. Use a pooled connection for `DATABASE_URL`; if your provider gives you a direct connection too, put it in `DIRECT_DATABASE_URL` for one-off imports. Then open http://localhost:3000, create an account, create a household, and share the invite code (Settings) with your partner.

### Continue with Google

Create a Google Cloud OAuth client with the **Web application** type, then add these values to `.env.local`:

```bash
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
APP_URL=http://localhost:3000
```

Register `http://localhost:3000/api/auth/google/callback` as an authorized redirect URI. For production, replace the origin with the deployed HTTPS domain in both Google Cloud and `APP_URL`. OurPool requests only basic identity scopes: name, email, and Google account ID. Existing password users connect Google explicitly from Settings after signing in; this prevents an unverified email address from being linked automatically.

### Brand assets

The OurPool mark combines an O and P in the app's existing mint and ivory palette. `components/BrandLogo.tsx` pairs `public/ourpool-mark.svg` with the wordmark; the SVG also supplies the browser favicon and installed-app icons. After editing the SVG, run `npm run icons:generate` and commit the generated files too. Bump the icon query version in the metadata/manifest and the public service-worker cache version when shipping new icons.

The rebrand does not change database tables, session cookies, Google callbacks, Shortcuts tokens, or the `twocents-household-backup` format identifier. Older backups remain compatible; new downloaded filenames begin with `ourpool-`. An existing iPhone home-screen shortcut may need to be removed and re-added to refresh its saved name and icon; this does not delete server-side household data.

### Adding an expense

On the Ledger, choose **Add expense** to open the standard form. Give the expense a name (such as Coffee, Taxi, or a merchant's name), enter the amount, choose a currency and category, and pick the date. The name is required and becomes the ledger title; time and note are optional. The date defaults to today on your device, and the currency defaults to your household currency. Expenses are recorded as paid by the signed-in person.

After saving, the confirmation offers **Undo** and **Edit details**. If the connection drops, your draft stays in the form and retrying the same submission does not add a duplicate. Quick text entry, voice, and presets remain available alongside the form.

### Household data backup and restore

Settings → **Your data** provides:

- A restorable JSON backup containing expenses, recurring schedules, presets, category guides, categories, and payer mapping.
- The existing spreadsheet-friendly expense CSV.
- Owner-only JSON restore, which replaces the current shared financial data after an `IMPORT` confirmation.
- Owner-only clear, which removes expenses, recurring schedules, presets, and category guides after a `CLEAR` confirmation.

Accounts, household membership, passwords, sessions, invite codes, Google identities, and API-token secrets are never included in the backup or removed by the clear action. Restore requires the backup home currency and referenced member emails to match the current household.

### Moving the existing SQLite ledger

This is optional migration tooling, not a deployment or rebrand requirement. The current deployment does not need the old test data imported. If an import is explicitly needed, the importer reads the old database without changing it and refuses to run if PostgreSQL already contains application data:

```bash
npm run db:import-sqlite -- data/twocents.db
```

Keep `data/twocents.db` as a backup until the deployed app has been checked. Never commit `.env.local` or anything in `data/`.

### iPhone Shortcuts / Siri

Settings → *Siri & iPhone Shortcuts* → generate a token, then follow the 5-step guide there. You get "Hey Siri, log expense", Action Button, and Back Tap logging via a simple authenticated POST to `/api/shortcuts/capture`. Your phone must be able to reach the server (deploy it, or use your Mac's LAN IP in dev).

## Architecture

- **Next.js 16 (App Router) + React 19 + TypeScript + Tailwind** — PWA (manifest + service worker + installable icons)
- **PostgreSQL via node-postgres** — pooled connections, real concurrent transactions, and `BIGINT` millisecond timestamps
- **Cookie sessions + bcrypt**; personal API tokens (SHA-256 hashed) for Shortcuts
- **Persistent API rate limits** with HMACed identifiers; set `RATE_LIMIT_SECRET` in production
- **Deterministic local parser** in `lib/parse.ts` — keywords, dates, currencies, word-numbers
- Chart palette is CVD-validated for the dark surface

## Roadmap (phase 2)

- Native iOS app with App Intents (deepest Siri/widget integration) on the same API
- Category-guide alerts (shared monthly guides are already available)
- Live FX rates
