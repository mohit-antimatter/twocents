import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { getHousehold, getMembers, listPresets } from "@/lib/expenses";
import { listCategories } from "@/lib/categories";
import { personColorMap } from "@/lib/colors";
import { localToday } from "@/lib/parse";
import { listRecurringRules, materializeDueRecurring } from "@/lib/recurring";
import BudgetManager from "@/components/BudgetManager";
import InviteManager from "@/components/InviteManager";
import PresetManager from "@/components/PresetManager";
import RecurringManager from "@/components/RecurringManager";
import TokenManager from "@/components/TokenManager";
import SignOutButton from "@/components/SignOutButton";
import AppNav from "@/components/AppNav";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Settings | TwoCents" };

export default async function SettingsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!user.householdId) redirect("/onboarding");

  const today = localToday();
  await materializeDueRecurring(user.householdId, today);
  const [hh, members, presets, categories, recurring, membershipResult, tokenResult] =
    await Promise.all([
      getHousehold(user.householdId),
      getMembers(user.householdId),
      listPresets(user.householdId),
      listCategories(user.householdId),
      listRecurringRules(user.householdId),
      db().query<{ role: string }>(
        `SELECT role FROM household_members
         WHERE household_id = $1 AND user_id = $2`,
        [user.householdId, user.id]
      ),
      db().query<{
        id: string;
        label: string;
        created_at: number;
        last_used_at: number | null;
      }>(
        `SELECT id, label, created_at, last_used_at
         FROM api_tokens WHERE user_id = $1 ORDER BY created_at DESC`,
        [user.id]
      ),
    ]);
  const personColors = personColorMap(members);
  const membership = membershipResult.rows[0];
  const tokens = tokenResult.rows;

  return (
    <main className="app-page">
      <header className="mb-8">
        <p className="text-xs font-medium uppercase tracking-[0.16em] text-mint">TwoCents</p>
        <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight text-ink">Settings</h1>
      </header>

      <div className="grid gap-8 md:grid-cols-2 md:items-start md:gap-x-8">
        {/* Household */}
        <section>
          <h2 className="mb-3 text-xs font-medium uppercase tracking-[0.14em] text-mute">
            Household
          </h2>
          <div className="space-y-4 rounded-2xl border border-hairline bg-surface p-4">
            <div>
              <p className="text-sm text-mute">Name</p>
              <p className="text-ink">{hh.name}</p>
            </div>
            <div>
              <p className="text-sm text-mute">Home currency</p>
              <p className="text-ink">{hh.home_currency} — every expense rolls up into this</p>
            </div>
            <div>
              <p className="mb-1.5 text-sm text-mute">Members</p>
              <ul className="space-y-1.5">
                {members.map((m) => (
                  <li key={m.id} className="flex items-center gap-2 text-sm text-ink">
                    <span
                      aria-hidden
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: personColors[m.id] }}
                    />
                    {m.name}
                    {m.id === user.id && <span className="text-xs text-mute">(you)</span>}
                  </li>
                ))}
              </ul>
            </div>
            {members.length < 2 && (
              <InviteManager
                initialCode={hh.invite_code}
                canRotate={membership?.role === "owner"}
              />
            )}
          </div>
        </section>

        {/* Presets */}
        <section id="presets">
          <h2 className="mb-1 text-xs font-medium uppercase tracking-[0.14em] text-mute">
            One-tap presets
          </h2>
          <p className="mb-3 text-sm text-mute">
            Your repeat expenses as single-tap chips on the home screen.
          </p>
          <PresetManager
            presets={presets}
            categories={categories.map((c) => ({ id: c.id, name: c.name, emoji: c.emoji }))}
            homeCurrency={hh.home_currency}
          />
        </section>

        {/* Recurring expenses */}
        <section id="recurring">
          <h2 className="mb-1 text-xs font-medium uppercase tracking-[0.14em] text-mute">
            Recurring expenses
          </h2>
          <p className="mb-3 text-sm text-mute">
            Rent, subscriptions, and other fixed costs logged on schedule.
          </p>
          <RecurringManager
            rules={recurring}
            categories={categories.map((category) => ({
              id: category.id,
              name: category.name,
              emoji: category.emoji,
            }))}
            homeCurrency={hh.home_currency}
            today={today}
            currentUserId={user.id}
          />
        </section>

        {/* Category guides */}
        <section id="category-guides">
          <h2 className="mb-1 text-xs font-medium uppercase tracking-[0.14em] text-mute">
            Monthly category guides
          </h2>
          <p className="mb-3 text-sm text-mute">
            Set a comfortable monthly guide for everyday spending.
          </p>
          <BudgetManager categories={categories} homeCurrency={hh.home_currency} />
        </section>

        {/* Siri & Shortcuts */}
        <section>
          <h2 className="mb-1 text-xs font-medium uppercase tracking-[0.14em] text-mute">
            Siri &amp; iPhone Shortcuts
          </h2>
          <p className="mb-3 text-sm text-mute">
            Log expenses by voice from anywhere — Action Button, Back Tap, or “Hey Siri”.
          </p>
          <TokenManager initialTokens={tokens} />
        </section>

        {/* Categories */}
        <section>
          <h2 className="mb-3 text-xs font-medium uppercase tracking-[0.14em] text-mute">
            Categories
          </h2>
          <div className="flex flex-wrap gap-1.5">
            {categories.map((c) => (
              <span
                key={c.id}
                className="rounded-full border border-hairline bg-surface px-3 py-1.5 text-xs text-dim"
              >
                {c.emoji} {c.name}
              </span>
            ))}
          </div>
        </section>

        {/* Data export */}
        <section>
          <h2 className="mb-1 text-xs font-medium uppercase tracking-[0.14em] text-mute">
            Your data
          </h2>
          <p className="mb-3 text-sm text-mute">
            Take the complete household ledger with you at any time.
          </p>
          <div className="rounded-2xl border border-hairline bg-surface p-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-medium text-ink">All expenses · CSV</p>
                <p className="mt-1 text-xs leading-relaxed text-mute">
                  Includes original amounts, home-currency values, categories, notes, and who paid.
                </p>
              </div>
              <a
                href="/api/export"
                className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-mint/30 px-4 text-sm font-medium text-mint transition-colors hover:bg-mint/10"
              >
                <svg aria-hidden="true" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 3v12m0 0 4-4m-4 4-4-4M5 21h14" />
                </svg>
                Download CSV
              </a>
            </div>
          </div>
        </section>

        {/* Account */}
        <section>
          <h2 className="mb-3 text-xs font-medium uppercase tracking-[0.14em] text-mute">
            Account
          </h2>
          <div className="flex flex-col gap-4 rounded-2xl border border-hairline bg-surface p-4">
            <div>
              <p className="text-ink">{user.name}</p>
              <p className="text-sm text-mute">{user.email}</p>
            </div>
            <SignOutButton />
          </div>
        </section>
      </div>
      <AppNav />
    </main>
  );
}
