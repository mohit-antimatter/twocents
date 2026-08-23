import { redirect } from "next/navigation";
import Link from "next/link";
import { getSessionUser } from "@/lib/auth";
import {
  getHousehold,
  getMembers,
  getMonthSummary,
  listPresets,
  listRecentExpenses,
} from "@/lib/expenses";
import { formatMinor } from "@/lib/money";
import { personColorMap } from "@/lib/colors";
import { localToday } from "@/lib/parse";
import { listCategories } from "@/lib/categories";
import QuickAdd from "@/components/QuickAdd";
import PresetChips from "@/components/PresetChips";
import ExpenseList from "@/components/ExpenseList";

export const dynamic = "force-dynamic";

export default async function Home({
  searchParams,
}: {
  searchParams?: Promise<{ edit?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!user.householdId) redirect("/onboarding");

  const hh = getHousehold(user.householdId);
  const members = getMembers(user.householdId);
  const personColors = personColorMap(members);
  const today = localToday();
  const month = today.slice(0, 7);
  const summary = getMonthSummary(user.householdId, month);
  const presets = listPresets(user.householdId);
  const recent = listRecentExpenses(user.householdId, 40);
  const categories = listCategories(user.householdId).map((c) => ({
    id: c.id,
    name: c.name,
    emoji: c.emoji,
  }));

  const monthName = new Date(month + "-01T12:00:00").toLocaleDateString("en-GB", {
    month: "long",
  });

  return (
    <main className="mx-auto max-w-md px-4 pb-16 pt-[max(1.25rem,env(safe-area-inset-top))]">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="font-display text-xl font-semibold tracking-tight text-ink">
          two<span className="text-mint">¢</span>ents
        </h1>
        <nav className="flex items-center gap-1">
          <Link
            href="/insights"
            className="grid h-10 w-10 place-items-center rounded-xl text-dim transition-colors hover:bg-surface hover:text-ink"
            aria-label="Insights"
            title="Insights"
          >
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
            </svg>
          </Link>
          <Link
            href="/settings"
            className="grid h-10 w-10 place-items-center rounded-xl text-dim transition-colors hover:bg-surface hover:text-ink"
            aria-label="Settings"
            title="Settings"
          >
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </Link>
        </nav>
      </header>

      <section className="mb-6">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-mute">
          {monthName} · {hh.name}
        </p>
        <p className="mt-1 font-money text-4xl font-medium tabular-nums text-ink">
          {formatMinor(summary.totalMinor, hh.home_currency)}
        </p>
        <p className="mt-1 text-sm text-mute">
          {summary.count} expense{summary.count === 1 ? "" : "s"} this month
          {members.length > 1 && " · both of you"}
        </p>
      </section>

      <section className="mb-4">
        <QuickAdd />
      </section>

      <section className="mb-7">
        <PresetChips presets={presets} />
      </section>

      <ExpenseList
        items={recent}
        personColors={personColors}
        today={today}
        currentUserId={user.id}
        categories={categories}
        initialEditId={(await searchParams)?.edit}
      />
    </main>
  );
}
