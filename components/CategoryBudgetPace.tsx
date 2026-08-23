import Link from "next/link";

import type { CategoryBudgetPace as CategoryBudgetPaceData } from "@/lib/budgets";
import { formatMinor } from "@/lib/money";

function paceMessage(pace: CategoryBudgetPaceData, currency: string): string {
  if (pace.remainingMinor < 0) {
    return `${formatMinor(Math.abs(pace.remainingMinor), currency)} beyond this month’s guide`;
  }
  if (pace.direction === "near") return "Close to an even monthly pace";
  if (pace.direction === "above") {
    return `${formatMinor(Math.abs(pace.differenceMinor), currency)} ahead of an even pace`;
  }
  return `${formatMinor(Math.abs(pace.differenceMinor), currency)} breathing room vs an even pace`;
}

export default function CategoryBudgetPace({
  paces,
  currency,
  compact = false,
}: {
  paces: CategoryBudgetPaceData[];
  currency: string;
  compact?: boolean;
}) {
  if (paces.length === 0) return null;
  const shown = compact ? paces.slice(0, 3) : paces;
  const hiddenCount = paces.length - shown.length;

  return (
    <section aria-labelledby={compact ? "home-category-guides" : "insights-category-guides"} className="mb-8">
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <h2 id={compact ? "home-category-guides" : "insights-category-guides"} className="text-xs font-medium uppercase tracking-[0.14em] text-mute">
            Category guides
          </h2>
          <p className="mt-1 text-xs text-mute">A steady pace, not a hard limit.</p>
        </div>
        <Link href={compact ? "/insights#category-guides" : "/settings#category-guides"} className="min-h-11 shrink-0 content-center text-xs font-medium text-mint hover:underline">
          {compact ? "See all" : "Adjust"}
        </Link>
      </div>
      <div id="category-guides" className="divide-y divide-hairline overflow-hidden rounded-2xl border border-hairline bg-surface">
        {shown.map((pace) => (
          <div key={pace.id} className="p-4">
            <div className="flex items-baseline justify-between gap-3">
              <p className="min-w-0 truncate text-sm font-medium text-ink">
                <span aria-hidden className="mr-2">{pace.emoji}</span>
                {pace.name}
              </p>
              <p className="shrink-0 font-money text-sm tabular-nums text-ink">
                {formatMinor(pace.spentMinor, currency)}
                <span className="font-sans text-mute"> / </span>
                {formatMinor(pace.budgetMinor, currency)}
              </p>
            </div>
            <div
              className="relative mt-3 h-2 rounded-full bg-bg"
              role="img"
              aria-label={`${pace.percentUsed}% of the ${pace.name} monthly guide used; ${pace.elapsedPercent}% of the month elapsed`}
            >
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.min(100, Math.max(0, pace.percentUsed))}%`,
                  backgroundColor: pace.color,
                }}
              />
              <span
                aria-hidden
                title="Today’s even-pace point"
                className="absolute top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-ink"
                style={{ left: `${pace.elapsedPercent}%` }}
              />
            </div>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs">
              <p className={pace.direction === "above" ? "text-amber" : pace.direction === "below" ? "text-mint" : "text-dim"}>
                {paceMessage(pace, currency)}
              </p>
              {!compact && pace.asOfDay >= 5 && pace.spentMinor > 0 && (
                <p className="text-mute">About {formatMinor(pace.projectedMinor, currency)} at this pace</p>
              )}
            </div>
          </div>
        ))}
        {hiddenCount > 0 && (
          <p className="px-4 py-3 text-xs text-mute">{hiddenCount} more {hiddenCount === 1 ? "guide" : "guides"} in Insights</p>
        )}
      </div>
    </section>
  );
}
