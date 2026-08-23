"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatMinor } from "@/lib/money";

type PresetProp = {
  id: string;
  label: string;
  emoji: string;
  amount_minor: number;
  currency: string;
};

type CategoryProp = { id: string; name: string; emoji: string };

export default function PresetManager({
  presets,
  categories,
  homeCurrency,
}: {
  presets: PresetProp[];
  categories: CategoryProp[];
  homeCurrency: string;
}) {
  const router = useRouter();
  const [label, setLabel] = useState("");
  const [emoji, setEmoji] = useState("⚡");
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/presets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        label,
        emoji,
        amount: parseFloat(amount),
        currency: homeCurrency,
        categoryId: categoryId || null,
      }),
    });
    if (res.ok) {
      setLabel("");
      setEmoji("⚡");
      setAmount("");
      setCategoryId("");
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Couldn't save the preset.");
    }
    setBusy(false);
  }

  async function remove(id: string) {
    await fetch(`/api/presets/${id}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <div className="space-y-3">
      {presets.length > 0 && (
        <ul className="divide-y divide-hairline overflow-hidden rounded-xl border border-hairline bg-surface2">
          {presets.map((p) => (
            <li key={p.id} className="flex min-h-14 items-center gap-3 px-3.5 py-2 text-sm">
              <span aria-hidden>{p.emoji}</span>
              <span className="flex-1 text-ink">{p.label}</span>
              <span className="font-money tabular-nums text-dim">
                {formatMinor(p.amount_minor, p.currency)}
              </span>
              <button
                onClick={() => remove(p.id)}
                aria-label={`Delete preset ${p.label}`}
                className="grid h-11 w-11 place-items-center rounded-xl text-mute hover:bg-bg hover:text-danger"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={add} className="grid gap-3 sm:grid-cols-[5rem_1fr_7rem]">
        <label>
          <span className="field-label">Emoji</span>
          <input value={emoji} onChange={(e) => setEmoji(e.target.value)} className="field-control px-0 text-center" />
        </label>
        <label>
          <span className="field-label">Label</span>
          <input required value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Morning coffee" className="field-control" />
        </label>
        <label>
          <span className="field-label">Amount</span>
          <input required value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="250" className="field-control text-right font-money" />
        </label>
        <label className="sm:col-span-2">
          <span className="field-label">Category</span>
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="field-control">
            <option value="">Pick a category…</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.emoji} {c.name}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-end">
          <button
            type="submit"
            disabled={busy}
            className="primary-button w-full"
          >
            Add
          </button>
        </div>
        {error && <p role="alert" className="text-sm text-danger sm:col-span-3">{error}</p>}
      </form>
    </div>
  );
}
