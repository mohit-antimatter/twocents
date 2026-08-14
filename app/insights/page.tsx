import { redirect } from "next/navigation";
import Link from "next/link";
import { getSessionUser } from "@/lib/auth";
import { getHousehold, getMembers, getMonthSummary, prevMonth, nextMonth } from "@/lib/expenses";
import { formatMinor } from "@/lib/money";
import { personColorMap } from "@/lib/colors";
import { localToday } from "@/lib/parse";

export const dynamic = "force-dynamic";

// Chart chrome (dark), from the validated reference instance.
const GRID = "#2c2c2a";
const DAILY_BAR = "#3987e5"; // categorical slot 1 — single-series magnitude
const DELTA_UP = "#ec835a"; // spending rose — "serious" status
const DELTA_DOWN = "#0ca30c"; // spending fell — "good" status

export default function InsightsPage({
  searchParams,
}: {
  searchParams: { m?: string };
}) {
  const user = getSessionUser();
  if (!user) redirect("/login");
  if (!user.householdId) redirect("/onboarding");

  const today = localToday();
  const currentMonth = today.slice(0, 7);
  const month = /^\d{4}-\d{2}$/.test(searchParams.m ?? "") ? searchParams.m! : currentMonth;

  const hh = getHousehold(user.householdId);
  const members = getMembers(user.householdId);
  const personColors = personColorMap(members);
  const s = getMonthSummary(user.householdId, month);

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
  const topCats = s.byCategory.slice(0, 8);
  const restTotal = s.byCategory.slice(8).reduce((sum, c) => sum + c.totalMinor, 0);

  return (
    <main className="mx-auto max-w-md px-4 pb-16 pt-[max(1.25rem,env(safe-area-inset-top))]">
      <header className="mb-6 flex items-center justify-between">
        <Link
          href="/"
          className="grid h-10 w-10 place-items-center rounded-xl text-dim transition-colors hover:bg-surface hover:text-ink"
          aria-label="Back to home"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </Link>
        <div className="flex items-center gap-1">
          <Link
            href={`/insights?m=${prevMonth(month)}`}
            className="grid h-9 w-9 place-items-center rounded-lg text-dim hover:bg-surface hover:text-ink"
            aria-label="Previous month"
          >
            ‹
          </Link>
          <span className="min-w-[9rem] text-center text-sm font-medium text-ink">{monthLabel}</span>
          {month < currentMonth ? (
            <Link
              href={`/insights?m=${nextMonth(month)}`}
              className="grid h-9 w-9 place-items-center rounded-lg text-dim hover:bg-surface hover:text-ink"
              aria-label="Next month"
            >
              ›
            </Link>
          ) : (
            <span className="grid h-9 w-9 place-items-center text-mute/40">›</span>
          )}
        </div>
        <span className="w-10" aria-hidden />
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
            <h2 className="mb-3 text-xs font-medium uppercase tracking-[0.14em] text-mute">
              Where it went
            </h2>
            <div className="space-y-3 rounded-2xl border border-hairline bg-surface p-4">
              {topCats.map((c) => (
                <div key={c.name} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1">
                  <p className="truncate text-sm text-ink">
                    <span aria-hidden className="mr-1.5">{c.emoji}</span>
                    {c.name}
                  </p>
                  <p className="font-money text-sm tabular-nums text-ink">
                    {formatMinor(c.totalMinor, hh.home_currency)}
                  </p>
                  <div className="col-span-2 h-2.5 overflow-hidden rounded-r">
                    <div
                      className="h-full rounded-r"
                      style={{
                        width: `${Math.max(2, (c.totalMinor / maxCat) * 100)}%`,
                        backgroundColor: c.color,
                      }}
                    />
                  </div>
                </div>
              ))}
              {restTotal > 0 && (
                <div className="grid grid-cols-[1fr_auto] items-center gap-x-3 pt-1 text-mute">
                  <p className="text-sm">Everything else</p>
                  <p className="font-money text-sm tabular-nums">
                    {formatMinor(restTotal, hh.home_currency)}
                  </p>
                </div>
              )}
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
    </main>
  );
}
