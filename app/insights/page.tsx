import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getSessionUser } from "@/lib/auth";
import { getHousehold, getMembers, getMonthSummary, prevMonth, nextMonth } from "@/lib/expenses";
import { formatMinor } from "@/lib/money";
import { personColorMap } from "@/lib/colors";
import { localToday } from "@/lib/parse";
import { materializeDueRecurring } from "@/lib/recurring";
import { getCategoryBudgetPaces } from "@/lib/budgets";
import AppNav from "@/components/AppNav";
import CategoryBudgetPace from "@/components/CategoryBudgetPace";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Insights | TwoCents" };

// Chart chrome (dark), from the validated reference instance.
const GRID = "#2c2c2a";
const DAILY_BAR = "#3987e5"; // categorical slot 1 — single-series magnitude
const DELTA_UP = "#ec835a"; // spending rose — "serious" status
const DELTA_DOWN = "#0ca30c"; // spending fell — "good" status

export default async function InsightsPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!user.householdId) redirect("/onboarding");

  const today = localToday();
  await materializeDueRecurring(user.householdId, today);
  const currentMonth = today.slice(0, 7);
  const query = await searchParams;
  const month = /^\d{4}-\d{2}$/.test(query.m ?? "") ? query.m! : currentMonth;

  const [hh, members, s, budgetPaces] = await Promise.all([
    getHousehold(user.householdId),
    getMembers(user.householdId),
    getMonthSummary(user.householdId, month),
    month === currentMonth
      ? getCategoryBudgetPaces(user.householdId, today)
      : Promise.resolve([]),
  ]);
  const personColors = personColorMap(members);

  const monthLabel = new Date(month + "-01T12:00:00").toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
  });
  const prevLabel = new Date(prevMonth(month) + "-01T12:00:00").toLocaleDateString("en-GB", {
    month: "short",
  });

  const deltaPct =
    s.prevTotalMinor > 0
      ? Math.round(((s.totalMinor - s.prevTotalMinor) / s.prevTotalMinor) * 100)
      : null;

  // Daily bars geometry
  const [yy, mm] = month.split("-").map(Number);
  const daysInMonth = new Date(yy, mm, 0).getDate();
  const dayTotals = new Map(s.byDay.map((d) => [Number(d.day.slice(8)), d.totalMinor]));
  const maxDay = Math.max(1, ...s.byDay.map((d) => d.totalMinor));
  const W = 336;
  const H = 96;
  const gap = 2;
  const barW = (W - gap * (daysInMonth - 1)) / daysInMonth;

  const maxCat = Math.max(1, ...s.byCategory.map((c) => c.totalMinor));

  return (
    <main className="app-page">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-mint">TwoCents</p>
          <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight text-ink">Insights</h1>
        </div>
        <div className="flex items-center gap-1">
          <Link
            href={`/insights?m=${prevMonth(month)}`}
            className="grid h-11 w-11 place-items-center rounded-xl text-dim hover:bg-surface hover:text-ink"
            aria-label="Previous month"
          >
            ‹
          </Link>
          <span className="min-w-[9rem] text-center text-sm font-medium text-ink">{monthLabel}</span>
          {month < currentMonth ? (
            <Link
              href={`/insights?m=${nextMonth(month)}`}
              className="grid h-11 w-11 place-items-center rounded-xl text-dim hover:bg-surface hover:text-ink"
              aria-label="Next month"
            >
              ›
            </Link>
          ) : (
            <span className="grid h-11 w-11 place-items-center text-mute/40">›</span>
          )}
        </div>
      </header>

      {/* Hero */}
      <section className="mb-8">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-mute">Total spend</p>
        <p className="mt-1 font-money text-4xl font-medium tabular-nums text-ink">
          {formatMinor(s.totalMinor, hh.home_currency)}
        </p>
        {deltaPct !== null && (
          <p className="mt-1.5 text-sm" style={{ color: deltaPct >= 0 ? DELTA_UP : DELTA_DOWN }}>
            {deltaPct >= 0 ? "▲" : "▼"} {Math.abs(deltaPct)}% vs {prevLabel}
          </p>
        )}
      </section>

      <CategoryBudgetPace paces={budgetPaces} currency={hh.home_currency} />

      {s.count === 0 ? (
        <div className="rounded-2xl border border-dashed border-hairline px-6 py-10 text-center text-dim">
          No expenses in {monthLabel}.
        </div>
      ) : (
        <>
          {/* Daily rhythm */}
          <section className="mb-8">
            <h2 className="mb-3 text-xs font-medium uppercase tracking-[0.14em] text-mute">
              Day by day
            </h2>
            <div className="rounded-2xl border border-hairline bg-surface p-4">
              <svg viewBox={`0 0 ${W} ${H + 16}`} className="w-full" role="img" aria-label="Daily spend for the month">
                <line x1="0" y1={H} x2={W} y2={H} stroke={GRID} strokeWidth="1" />
                {Array.from({ length: daysInMonth }, (_, i) => {
                  const day = i + 1;
                  const v = dayTotals.get(day) ?? 0;
                  const h = v > 0 ? Math.max(3, (v / maxDay) * (H - 8)) : 0;
                  const x = i * (barW + gap);
                  const iso = `${month}-${String(day).padStart(2, "0")}`;
                  return (
                    <g key={day}>
                      {v > 0 && (
                        <rect
                          x={x}
                          y={H - h}
                          width={barW}
                          height={h}
                          rx={Math.min(2.5, barW / 2)}
                          fill={DAILY_BAR}
                        >
                          <title>{`${iso}: ${formatMinor(v, hh.home_currency)}`}</title>
                        </rect>
                      )}
                      {(day === 1 || day === 15 || day === daysInMonth) && (
                        <text
                          x={x + barW / 2}
                          y={H + 13}
                          textAnchor="middle"
                          fontSize="9"
                          fill="#898781"
                        >
                          {day}
                        </text>
                      )}
                    </g>
                  );
                })}
              </svg>
            </div>
          </section>

          {/* Where it went */}
          <section className="mb-8">
            <h2 className="mb-1 text-xs font-medium uppercase tracking-[0.14em] text-mute">
              Where it went
            </h2>
            <p className="mb-3 text-xs text-mute">Open a category to see what made up the total.</p>
            <div className="divide-y divide-hairline overflow-hidden rounded-2xl border border-hairline bg-surface">
              {s.byCategory.map((c) => {
                const expenseCount = c.titles.reduce((sum, title) => sum + title.count, 0);
                return (
                  <details key={c.name} className="group">
                    <summary className="min-h-16 cursor-pointer list-none px-4 py-3.5 marker:content-none hover:bg-surface2 focus-visible:bg-surface2">
                      <div className="flex items-baseline gap-3">
                        <p className="min-w-0 flex-1 truncate text-sm text-ink">
                          <span aria-hidden className="mr-1.5">{c.emoji}</span>
                          {c.name}
                        </p>
                        <p className="shrink-0 font-money text-sm tabular-nums text-ink">
                          {formatMinor(c.totalMinor, hh.home_currency)}
                        </p>
                        <span aria-hidden className="shrink-0 text-base text-mint transition-transform group-open:rotate-45">+</span>
                      </div>
                      <div className="mt-2.5 h-2 overflow-hidden rounded-r bg-bg">
                        <div
                          className="h-full rounded-r"
                          style={{
                            width: `${Math.max(2, (c.totalMinor / maxCat) * 100)}%`,
                            backgroundColor: c.color,
                          }}
                        />
                      </div>
                      <p className="mt-2 text-xs text-mute">
                        {c.titles.length} {c.titles.length === 1 ? "group" : "groups"} · {expenseCount} {expenseCount === 1 ? "expense" : "expenses"}
                      </p>
                    </summary>
                    <ul className="divide-y divide-hairline border-t border-hairline bg-bg/35 px-4">
                      {c.titles.map((title) => (
                        <li key={title.title.toLocaleLowerCase("en")} className="flex min-h-12 items-center gap-3 py-2">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm text-ink">{title.title}</p>
                            <p className="mt-0.5 text-xs text-mute">
                              {title.count} {title.count === 1 ? "expense" : "expenses"}
                            </p>
                          </div>
                          <p className="shrink-0 font-money text-sm tabular-nums text-dim">
                            {formatMinor(title.totalMinor, hh.home_currency)}
                          </p>
                        </li>
                      ))}
                    </ul>
                  </details>
                );
              })}
            </div>
          </section>

          {/* Who paid */}
          {s.byPerson.length > 0 && (
            <section className="mb-8">
              <h2 className="mb-3 text-xs font-medium uppercase tracking-[0.14em] text-mute">
                Who paid
              </h2>
              <div className="rounded-2xl border border-hairline bg-surface p-4">
                <div className="flex h-3 gap-0.5 overflow-hidden rounded-full" role="img" aria-label="Split of spend between people">
                  {s.byPerson.map((p) => (
                    <div
                      key={p.id}
                      style={{
                        width: `${(p.totalMinor / Math.max(1, s.totalMinor)) * 100}%`,
                        backgroundColor: personColors[p.id] ?? "#6B7A70",
                      }}
                      title={`${p.name}: ${formatMinor(p.totalMinor, hh.home_currency)}`}
                    />
                  ))}
                </div>
                <ul className="mt-3 space-y-2">
                  {s.byPerson.map((p) => (
                    <li key={p.id} className="flex items-center gap-2 text-sm">
                      <span
                        aria-hidden
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: personColors[p.id] ?? "#6B7A70" }}
                      />
                      <span className="flex-1 text-ink">{p.name}</span>
                      <span className="font-money tabular-nums text-ink">
                        {formatMinor(p.totalMinor, hh.home_currency)}
                      </span>
                      <span className="w-10 text-right text-xs text-mute">
                        {Math.round((p.totalMinor / Math.max(1, s.totalMinor)) * 100)}%
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          )}
        </>
      )}
      <AppNav />
    </main>
  );
}
