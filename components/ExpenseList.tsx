"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatMinor, CURRENCIES } from "@/lib/money";

export type ExpenseItem = {
  id: string;
  spent_on: string;
  spent_time: string | null;
  amount_minor: number;
  currency: string;
  category_id: string | null;
  category_name: string | null;
  category_emoji: string | null;
  category_color: string | null;
  merchant: string | null;
  note: string | null;
  user_id: string;
  user_name: string;
  source: string;
};

export type CategoryOption = { id: string; name: string; emoji: string };

function dayLabel(iso: string, today: string): string {
  if (iso === today) return "Today";
  const d = new Date(iso + "T12:00:00");
  const t = new Date(today + "T12:00:00");
  if (t.getTime() - d.getTime() === 86400_000) return "Yesterday";
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

function timeLabel(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const ampm = h >= 12 ? "pm" : "am";
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

export default function ExpenseList({
  items,
  personColors,
  today,
  currentUserId,
  categories,
  initialEditId,
}: {
  items: ExpenseItem[];
  personColors: Record<string, string>;
  today: string;
  currentUserId: string;
  categories: CategoryOption[];
  initialEditId?: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<ExpenseItem | null>(() =>
    initialEditId
      ? items.find(
          (item) => item.id === initialEditId && item.user_id === currentUserId
        ) ?? null
      : null
  );

  function closeEditor() {
    setEditing(null);
    if (initialEditId) router.replace("/", { scroll: false });
  }

  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-hairline px-6 py-10 text-center">
        <p className="text-dim">Nothing logged yet.</p>
        <p className="mt-1 text-sm text-mute">
          Type <span className="font-money text-dim">coffee 250</span> above — that&apos;s the whole
          workflow.
        </p>
      </div>
    );
  }

  const groups: { day: string; rows: ExpenseItem[] }[] = [];
  for (const item of items) {
    const last = groups[groups.length - 1];
    if (last && last.day === item.spent_on) last.rows.push(item);
    else groups.push({ day: item.spent_on, rows: [item] });
  }

  return (
    <div className="space-y-5">
      {groups.map((g) => (
        <section key={g.day}>
          <h3 className="mb-2 text-xs font-medium uppercase tracking-[0.14em] text-mute">
            {dayLabel(g.day, today)}
          </h3>
          <ul className="divide-y divide-hairline overflow-hidden rounded-2xl border border-hairline bg-surface">
            {g.rows.map((e) => {
              const mine = e.user_id === currentUserId;
              const title = e.merchant || e.note || e.category_name || "Expense";
              const sub = [
                e.category_name,
                e.spent_time ? timeLabel(e.spent_time) : null,
                e.user_name.split(" ")[0],
              ]
                .filter(Boolean)
                .join(" · ");
              return (
                <li key={e.id}>
                  <div
                    role={mine ? "button" : undefined}
                    tabIndex={mine ? 0 : undefined}
                    onClick={mine ? () => setEditing(e) : undefined}
                    onKeyDown={
                      mine
                        ? (ev) => {
                            if (ev.key === "Enter" || ev.key === " ") setEditing(e);
                          }
                        : undefined
                    }
                    aria-label={mine ? `Edit ${title}` : undefined}
                    className={`flex items-center gap-3 px-3.5 py-3 ${
                      mine ? "cursor-pointer transition-colors hover:bg-surface2/60" : ""
                    }`}
                  >
                    <span
                      aria-hidden
                      className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-base"
                      style={{ backgroundColor: (e.category_color ?? "#6B7A70") + "26" }}
                    >
                      {e.category_emoji ?? "🧾"}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15px] text-ink">{title}</p>
                      <p className="flex items-center gap-1.5 truncate text-xs text-mute">
                        <span
                          aria-hidden
                          className="inline-block h-2 w-2 rounded-full"
                          style={{ backgroundColor: personColors[e.user_id] ?? "#6B7A70" }}
                        />
                        {sub}
                      </p>
                    </div>
                    <span className="font-money text-[15px] tabular-nums text-ink">
                      {formatMinor(e.amount_minor, e.currency)}
                    </span>
                    {mine && (
                      <svg
                        aria-hidden
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        className="shrink-0 text-mute/50"
                      >
                        <path d="M9 18l6-6-6-6" />
                      </svg>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      {editing && (
        <EditSheet
          expense={editing}
          categories={categories}
          onClose={closeEditor}
          onSaved={() => {
            closeEditor();
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function EditSheet({
  expense,
  categories,
  onClose,
  onSaved,
}: {
  expense: ExpenseItem;
  categories: CategoryOption[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [amount, setAmount] = useState(String(expense.amount_minor / 100));
  const [currency, setCurrency] = useState(expense.currency);
  const [categoryId, setCategoryId] = useState(expense.category_id ?? "");
  const [merchant, setMerchant] = useState(expense.merchant ?? "");
  const [note, setNote] = useState(expense.note ?? "");
  const [spentOn, setSpentOn] = useState(expense.spent_on);
  const [spentTime, setSpentTime] = useState(expense.spent_time ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/expenses/${expense.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: parseFloat(amount),
        currency,
        categoryId: categoryId || null,
        merchant,
        note,
        spentOn,
        spentTime: spentTime || null,
      }),
    });
    if (res.ok) {
      onSaved();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Couldn't save the changes.");
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm("Delete this expense?")) return;
    setBusy(true);
    const res = await fetch(`/api/expenses/${expense.id}`, { method: "DELETE" });
    if (res.ok) onSaved();
    else {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Couldn't delete.");
      setBusy(false);
    }
  }

  const inputCls =
    "rounded-xl border border-hairline bg-bg px-3 py-2.5 text-[15px] text-ink placeholder:text-mute focus:border-mint/50 focus:outline-none";

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Edit expense"
    >
      <div
        onClick={(ev) => ev.stopPropagation()}
        className="rise-in w-full max-w-md rounded-t-3xl border border-hairline bg-surface p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:rounded-3xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold text-ink">Edit expense</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="grid h-9 w-9 place-items-center rounded-xl text-dim hover:bg-surface2 hover:text-ink"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <div className="space-y-3">
          <div className="flex gap-2">
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              aria-label="Currency"
              className={`${inputCls} w-32 shrink-0`}
            >
              {Object.keys(CURRENCIES).map((c) => (
                <option key={c} value={c}>
                  {CURRENCIES[c].symbol} {c}
                </option>
              ))}
            </select>
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="decimal"
              aria-label="Amount"
              className={`${inputCls} min-w-0 flex-1 text-right font-money tabular-nums`}
            />
          </div>

          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            aria-label="Category"
            className={`${inputCls} w-full`}
          >
            <option value="">No category</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.emoji} {c.name}
              </option>
            ))}
          </select>

          <input
            value={merchant}
            onChange={(e) => setMerchant(e.target.value)}
            placeholder="Merchant / title (e.g. Swiggy)"
            className={`${inputCls} w-full`}
          />
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Note (optional)"
            className={`${inputCls} w-full`}
          />

          <div className="flex gap-2">
            <input
              type="date"
              value={spentOn}
              onChange={(e) => setSpentOn(e.target.value)}
              aria-label="Date of spend"
              className={`${inputCls} min-w-0 flex-1`}
            />
            <input
              type="time"
              value={spentTime}
              onChange={(e) => setSpentTime(e.target.value)}
              aria-label="Time of spend"
              className={`${inputCls} w-32 shrink-0`}
            />
          </div>

          {error && <p className="text-sm text-danger">{error}</p>}

          <div className="flex items-center justify-between pt-1">
            <button
              onClick={remove}
              disabled={busy}
              className="rounded-xl border border-hairline px-4 py-2.5 text-sm text-dim transition-colors hover:border-danger/40 hover:text-danger disabled:opacity-50"
            >
              Delete
            </button>
            <div className="flex gap-2">
              <button
                onClick={onClose}
                disabled={busy}
                className="rounded-xl border border-hairline px-4 py-2.5 text-sm text-dim hover:text-ink disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={save}
                disabled={busy}
                className="rounded-xl bg-mint px-5 py-2.5 text-sm font-medium text-bg transition-opacity disabled:opacity-50"
              >
                {busy ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
