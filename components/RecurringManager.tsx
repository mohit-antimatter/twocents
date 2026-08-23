"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { CURRENCIES, formatMinor } from "@/lib/money";

type RecurringRuleProp = {
  id: string;
  user_id: string;
  user_name: string;
  label: string;
  amount_minor: number;
  currency: string;
  category_name: string | null;
  category_emoji: string | null;
  frequency: "weekly" | "monthly";
  next_due_on: string;
  active: number;
};

type CategoryProp = { id: string; name: string; emoji: string };

function friendlyDate(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function RecurringManager({
  rules,
  categories,
  homeCurrency,
  today,
  currentUserId,
}: {
  rules: RecurringRuleProp[];
  categories: CategoryProp[];
  homeCurrency: string;
  today: string;
  currentUserId: string;
}) {
  const router = useRouter();
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState(homeCurrency);
  const [categoryId, setCategoryId] = useState("");
  const [frequency, setFrequency] = useState<"weekly" | "monthly">("monthly");
  const [nextDueOn, setNextDueOn] = useState(today);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function add(event: React.FormEvent) {
    event.preventDefault();
    setBusy("new");
    setError(null);
    const response = await fetch("/api/recurring", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        label,
        amount: Number(amount),
        currency,
        categoryId: categoryId || null,
        frequency,
        nextDueOn,
      }),
    });
    if (response.ok) {
      setLabel("");
      setAmount("");
      setCategoryId("");
      setFrequency("monthly");
      setNextDueOn(today);
      router.refresh();
    } else {
      const data = await response.json().catch(() => ({}));
      setError(data.error ?? "Couldn't save the schedule.");
    }
    setBusy(null);
  }

  async function setActive(id: string, active: boolean) {
    setBusy(id);
    setError(null);
    const response = await fetch(`/api/recurring/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active }),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      setError(data.error ?? "Couldn't update the schedule.");
    }
    setBusy(null);
    router.refresh();
  }

  async function remove(id: string, name: string) {
    if (!window.confirm(`Delete the schedule for “${name}”? Already logged expenses will stay.`)) {
      return;
    }
    setBusy(id);
    setError(null);
    const response = await fetch(`/api/recurring/${id}`, { method: "DELETE" });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      setError(data.error ?? "Couldn't delete the schedule.");
    }
    setBusy(null);
    router.refresh();
  }

  return (
    <div className="space-y-3">
      {rules.length > 0 && (
        <ul className="divide-y divide-hairline overflow-hidden rounded-xl border border-hairline bg-surface2">
          {rules.map((rule) => {
            const owned = rule.user_id === currentUserId;
            return (
              <li key={rule.id} className="px-3.5 py-3">
                <div className="flex items-start gap-3">
                  <span aria-hidden className="mt-0.5 text-lg">
                    {rule.category_emoji ?? "↻"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                      <p className="truncate text-sm font-medium text-ink">{rule.label}</p>
                      <p className="font-money text-sm tabular-nums text-ink">
                        {formatMinor(rule.amount_minor, rule.currency)}
                      </p>
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-mute">
                      {rule.active
                        ? `Every ${rule.frequency === "weekly" ? "week" : "month"} · next ${friendlyDate(rule.next_due_on)}`
                        : "Paused"}
                      {` · ${rule.user_name} pays`}
                      {rule.category_name ? ` · ${rule.category_name}` : ""}
                    </p>
                  </div>
                </div>
                {owned && (
                  <div className="mt-2 flex justify-end gap-1">
                    <button
                      type="button"
                      disabled={busy === rule.id}
                      onClick={() => void setActive(rule.id, !rule.active)}
                      className="min-h-11 rounded-xl px-3 text-xs font-medium text-dim transition-colors hover:bg-bg hover:text-ink disabled:opacity-50"
                    >
                      {rule.active ? "Pause" : "Resume"}
                    </button>
                    <button
                      type="button"
                      disabled={busy === rule.id}
                      onClick={() => void remove(rule.id, rule.label)}
                      className="min-h-11 rounded-xl px-3 text-xs font-medium text-mute transition-colors hover:bg-bg hover:text-danger disabled:opacity-50"
                    >
                      Delete
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <details className="group rounded-xl border border-hairline bg-surface" open={rules.length === 0}>
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 text-sm font-medium text-ink marker:content-none">
          Add recurring expense
          <span aria-hidden className="text-lg font-normal text-mint transition-transform group-open:rotate-45">+</span>
        </summary>
        <form onSubmit={add} className="grid gap-3 border-t border-hairline p-4 sm:grid-cols-2">
          <label className="sm:col-span-2">
            <span className="field-label">Name</span>
            <input
              required
              maxLength={120}
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder="Rent, Netflix, cleaner…"
              className="field-control bg-bg"
            />
          </label>
          <label>
            <span className="field-label">Amount</span>
            <input
              required
              min="0.01"
              step="0.01"
              type="number"
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="2500"
              className="field-control bg-bg font-money"
            />
          </label>
          <label>
            <span className="field-label">Currency</span>
            <select value={currency} onChange={(event) => setCurrency(event.target.value)} className="field-control bg-bg">
              {Object.entries(CURRENCIES).map(([code, value]) => (
                <option key={code} value={code}>{code} — {value.name}</option>
              ))}
            </select>
          </label>
          <label>
            <span className="field-label">Repeats</span>
            <select
              value={frequency}
              onChange={(event) => setFrequency(event.target.value as "weekly" | "monthly")}
              className="field-control bg-bg"
            >
              <option value="weekly">Every week</option>
              <option value="monthly">Every month</option>
            </select>
          </label>
          <label>
            <span className="field-label">First date</span>
            <input
              required
              type="date"
              min={today}
              value={nextDueOn}
              onChange={(event) => setNextDueOn(event.target.value)}
              className="field-control bg-bg"
            />
          </label>
          <label className="sm:col-span-2">
            <span className="field-label">Category <span className="font-normal text-mute">(optional)</span></span>
            <select value={categoryId} onChange={(event) => setCategoryId(event.target.value)} className="field-control bg-bg">
              <option value="">No category</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>{category.emoji} {category.name}</option>
              ))}
            </select>
          </label>
          <p className="text-xs leading-relaxed text-mute sm:col-span-2">
            Due expenses are logged when either of you next opens TwoCents. Editing a logged expense won&apos;t change this schedule.
          </p>
          <button type="submit" disabled={busy === "new"} className="primary-button sm:col-span-2">
            {busy === "new" ? "Saving…" : "Save schedule"}
          </button>
        </form>
      </details>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    </div>
  );
}
