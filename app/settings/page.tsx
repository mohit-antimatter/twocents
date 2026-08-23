import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { getHousehold, getMembers, listPresets } from "@/lib/expenses";
import { listCategories } from "@/lib/categories";
import { personColorMap } from "@/lib/colors";
import InviteManager from "@/components/InviteManager";
import PresetManager from "@/components/PresetManager";
import TokenManager from "@/components/TokenManager";
import SignOutButton from "@/components/SignOutButton";
import AppNav from "@/components/AppNav";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Settings | TwoCents" };

export default async function SettingsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!user.householdId) redirect("/onboarding");

  const hh = getHousehold(user.householdId);
  const members = getMembers(user.householdId);
  const personColors = personColorMap(members);
  const presets = listPresets(user.householdId);
  const categories = listCategories(user.householdId);
  const membership = db()
    .prepare("SELECT role FROM household_members WHERE household_id = ? AND user_id = ?")
    .get(user.householdId, user.id) as { role: string } | undefined;
  const tokens = db()
    .prepare(
      "SELECT id, label, created_at, last_used_at FROM api_tokens WHERE user_id = ? ORDER BY created_at DESC"
    )
    .all(user.id) as { id: string; label: string; created_at: number; last_used_at: number | null }[];

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

        {/* Account */}
        <section>
          <h2 className="mb-3 text-xs font-medium uppercase tracking-[0.14em] text-mute">
            Account
          </h2>
          <div className="flex flex-col gap-4 rounded-2xl border border-hairline bg-surface p-4 sm:flex-row sm:items-center sm:justify-between">
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
