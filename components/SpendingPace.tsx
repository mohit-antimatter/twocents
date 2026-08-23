import { formatMinor } from "@/lib/money";
import type { SpendingPace as SpendingPaceData } from "@/lib/expenses";

function monthList(months: string[]): string {
  return months
    .map((month) =>
      new Date(month + "-01T12:00:00").toLocaleDateString("en-GB", { month: "short" })
    )
    .join(", ");
}

function ordinal(day: number): string {
  const lastTwo = day % 100;
  if (lastTwo >= 11 && lastTwo <= 13) return `${day}th`;
  return `${day}${day % 10 === 1 ? "st" : day % 10 === 2 ? "nd" : day % 10 === 3 ? "rd" : "th"}`;
}

export default function SpendingPace({
  pace,
  currency,
}: {
  pace: SpendingPaceData;
  currency: string;
}) {
  const difference = Math.abs(pace.differenceMinor);
  const status =
    pace.direction === "near"
      ? "Close to your usual pace"
      : `${formatMinor(difference, currency)} ${pace.direction} your usual pace`;
  const statusColor =
    pace.direction === "above" ? "text-amber" : pace.direction === "below" ? "text-mint" : "text-dim";

  return (
    <section aria-labelledby="spending-pace-title" className="mb-6 overflow-hidden rounded-2xl border border-hairline bg-surface">
      <div className="grid sm:grid-cols-[0.9fr_1.1fr]">
        <div className="p-4 sm:p-5">
          <p id="spending-pace-title" className="text-xs font-medium uppercase tracking-[0.16em] text-mute">
            By the {ordinal(pace.asOfDay)}
          </p>
          <p className="mt-1 font-money text-2xl font-medium tabular-nums text-ink">
            {formatMinor(pace.currentMinor, currency)}
          </p>
          <p className="mt-0.5 text-xs text-mute">spent so far</p>
        </div>
        <div className="border-t border-hairline bg-surface2/45 p-4 sm:border-l sm:border-t-0 sm:p-5">
          <p className={`text-sm font-medium ${statusColor}`}>{status}</p>
          <p className="mt-1.5 text-xs leading-relaxed text-mute">
            Usually {formatMinor(pace.typicalMinor, currency)} by now · based on {monthList(pace.comparisonMonths)}
          </p>
        </div>
      </div>
    </section>
  );
}
