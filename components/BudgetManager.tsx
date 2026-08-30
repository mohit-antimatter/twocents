"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { CURRENCIES, formatMinor } from "@/lib/money";

type CategoryProp = {
  id: string;
  name: string;
  emoji: string;
  budget_minor: number | null;
};

function GuideRow({ category, currency }: { category: CategoryProp; currency: string }) {
  const router = useRouter();
  const [amount, setAmount] = useState(String((category.budget_minor ?? 0) / 100));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const unchanged = Math.round(Number(amount) * 100) === category.budget_minor;

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/categories/${category.id}/budget`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: Number(amount) }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setError(data.error ?? "Couldn't update this guide.");
      } else {
        router.refresh();
      }
    } catch {
      setError("Couldn't reach OurPool. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/categories/${category.id}/budget`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setError(data.error ?? "Couldn't remove this guide.");
      } else {
        router.refresh();
      }
    } catch {
      setError("Couldn't reach OurPool. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="px-3.5 py-3">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
        className="grid gap-2"
      >
        <div className="flex items-baseline justify-between gap-3">
          <p className="min-w-0 truncate text-sm font-medium text-ink">
            <span aria-hidden className="mr-2">{category.emoji}</span>{category.name}
          </p>
          <p className="shrink-0 text-xs text-mute">
            {formatMinor(category.budget_minor ?? 0, currency)} monthly
          </p>
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-1">
          <label>
            <span className="sr-only">Monthly guide for {category.name}</span>
            <div className="relative">
              <span aria-hidden className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-mute">
                {CURRENCIES[currency]?.symbol ?? currency}
              </span>
              <input
                required
                min="0.01"
                step="0.01"
                type="number"
                inputMode="decimal"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                className="field-control bg-bg pl-8 font-money"
              />
            </div>
          </label>
          <button
            type="button"
            onClick={() => void save()}
            aria-label={`Save monthly guide for ${category.name}`}
            disabled={busy || unchanged}
            className="min-h-11 rounded-xl border border-mint/30 px-3 text-xs font-medium text-mint transition-colors hover:bg-mint/10 disabled:opacity-40"
          >
            Save
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void remove()}
            aria-label={`Remove monthly guide for ${category.name}`}
            className="min-h-11 rounded-xl px-3 text-xs font-medium text-mute transition-colors hover:bg-bg hover:text-danger disabled:opacity-40"
          >
            Remove
          </button>
        </div>
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      </form>
    </li>
  );
}

export default function BudgetManager({
  categories,
  homeCurrency,
}: {
  categories: CategoryProp[];
  homeCurrency: string;
}) {
  const router = useRouter();
  const active = categories.filter((category) => category.budget_minor !== null);
  const available = categories.filter((category) => category.budget_minor === null);
  const [categoryId, setCategoryId] = useState(available[0]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectedCategoryId = available.some((category) => category.id === categoryId)
    ? categoryId
    : available[0]?.id ?? "";

  async function add(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/categories/${selectedCategoryId}/budget`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: Number(amount) }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setError(data.error ?? "Couldn't save this guide.");
      } else {
        setAmount("");
        router.refresh();
      }
    } catch {
      setError("Couldn't reach OurPool. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      {active.length > 0 && (
        <ul className="divide-y divide-hairline overflow-hidden rounded-xl border border-hairline bg-surface2">
          {active.map((category) => (
            <GuideRow key={`${category.id}-${category.budget_minor}`} category={category} currency={homeCurrency} />
          ))}
        </ul>
      )}

      {available.length > 0 && (
        <details className="group rounded-xl border border-hairline bg-surface" open={active.length === 0}>
          <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 text-sm font-medium text-ink marker:content-none">
            Add a monthly guide
            <span aria-hidden className="text-lg font-normal text-mint transition-transform group-open:rotate-45">+</span>
          </summary>
          <form onSubmit={add} className="grid gap-3 border-t border-hairline p-4 sm:grid-cols-[minmax(0,1fr)_8rem_auto] sm:items-end">
            <label>
              <span className="field-label">Category</span>
              <select value={selectedCategoryId} onChange={(event) => setCategoryId(event.target.value)} className="field-control bg-bg">
                {available.map((category) => (
                  <option key={category.id} value={category.id}>{category.emoji} {category.name}</option>
                ))}
              </select>
            </label>
            <label>
              <span className="field-label">Monthly amount</span>
              <input
                required
                min="0.01"
                step="0.01"
                type="number"
                inputMode="decimal"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                placeholder="10000"
                className="field-control bg-bg font-money"
              />
            </label>
            <button type="submit" disabled={busy || !selectedCategoryId} className="primary-button px-4">
              {busy ? "Saving…" : "Add"}
            </button>
            {error && <p role="alert" className="text-sm text-danger sm:col-span-3">{error}</p>}
          </form>
        </details>
      )}
      <p className="text-xs leading-relaxed text-mute">
        Shared monthly guides, not hard limits. Either partner can adjust them.
      </p>
    </div>
  );
}
