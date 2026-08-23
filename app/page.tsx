import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import {
  getHousehold,
  getMembers,
  getMonthSummary,
  getSpendingPace,
  listPresets,
  listRecentExpenses,
} from "@/lib/expenses";
import { formatMinor } from "@/lib/money";
import { personColorMap } from "@/lib/colors";
import { localToday } from "@/lib/parse";
import { materializeDueRecurring } from "@/lib/recurring";
import { listCategories } from "@/lib/categories";
import QuickAdd from "@/components/QuickAdd";
import PresetChips from "@/components/PresetChips";
import ExpenseList from "@/components/ExpenseList";
import AppNav from "@/components/AppNav";
import InviteManager from "@/components/InviteManager";
import SpendingPace from "@/components/SpendingPace";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Ledger | TwoCents" };

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
  materializeDueRecurring(user.householdId, today);
  const month = today.slice(0, 7);
  const summary = getMonthSummary(user.householdId, month);
  const pace = getSpendingPace(user.householdId, today);
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
    <main className="app-page max-w-2xl">
      <header className="mb-6">
        <h1 className="font-display text-xl font-semibold tracking-tight text-ink">
          two<span className="text-mint">¢</span>ents
        </h1>
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

      {pace && <SpendingPace pace={pace} currency={hh.home_currency} />}

      {members.length === 1 && recent.length === 0 && (
        <section className="mb-6" aria-label="Partner invitation">
          <InviteManager initialCode={hh.invite_code} canRotate={false} />
        </section>
      )}

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
      <AppNav />
    </main>
  );
}
