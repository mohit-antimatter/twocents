"use client";

import { useEffect, useRef, useState } from "react";
import { CURRENCIES } from "@/lib/money";
import type { CategoryOption } from "./ExpenseList";

export default function AddExpenseForm({
  categories,
  homeCurrency,
  payerName,
  onSaved,
}: {
  categories: CategoryOption[];
  homeCurrency: string;
  payerName: string;
  onSaved: (expense: { id: string; summary: string }) => void;
}) {
  const defaultCategory = categories.find((category) => category.name === "Other")?.id ?? "";
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState(homeCurrency);
  const [categoryId, setCategoryId] = useState(defaultCategory);
  const [spentOn, setSpentOn] = useState("");
  const [spentTime, setSpentTime] = useState("");
  const [merchant, setMerchant] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const busyRef = useRef(false);
  const previousOverflow = useRef<string | null>(null);
  const pendingRequest = useRef<{ payload: string; id: string } | null>(null);

  useEffect(() => () => {
    if (previousOverflow.current !== null) document.body.style.overflow = previousOverflow.current;
  }, []);

  function open() {
    if (!spentOn) {
      const now = new Date();
      setSpentOn(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`);
    }
    previousOverflow.current = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.showModal();
    nameRef.current?.focus();
  }

  function close() {
    if (!busyRef.current) dialogRef.current?.close();
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (busyRef.current) return;
    if (!merchant.trim()) {
      setError("Enter an expense name.");
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setError(null);
    const fields = {
      amount: Number(amount), currency, categoryId: categoryId || null,
      spentOn, spentTime: spentTime || null, merchant, note,
    };
    const payload = JSON.stringify(fields);
    const requestId = pendingRequest.current?.payload === payload
      ? pendingRequest.current.id : crypto.randomUUID();
    pendingRequest.current = { payload, id: requestId };
    try {
      const response = await fetch("/api/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...fields, requestId }),
      });
      const result = await response.json();
      if (!response.ok) {
        if (response.status < 500) pendingRequest.current = null;
        setError(result.error ?? "Couldn't save the expense. Try again.");
        return;
      }
      pendingRequest.current = null;
      setAmount("");
      setCurrency(homeCurrency);
      setCategoryId(defaultCategory);
      setSpentOn("");
      setSpentTime("");
      setMerchant("");
      setNote("");
      dialogRef.current?.close();
      onSaved(result);
    } catch {
      setError("Connection lost. Your details are still here. Retry to check whether it saved without adding it twice.");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  return (
    <>
      <div className="mb-4 flex items-center gap-3">
        <button type="button" onClick={open} className="primary-button inline-flex shrink-0 items-center gap-2" aria-haspopup="dialog">
          <span aria-hidden="true" className="text-xl">+</span> Add expense
        </button>
        <p className="max-w-44 text-sm leading-snug text-mute">Enter a name, amount and category.</p>
      </div>

      <dialog
        ref={dialogRef}
        aria-labelledby="add-expense-title"
        aria-describedby="add-expense-description"
        className="fixed inset-x-0 bottom-0 top-auto m-0 max-h-[calc(100dvh-1rem)] w-full max-w-none overflow-y-auto rounded-t-3xl border border-hairline bg-surface p-0 text-ink [color-scheme:dark] backdrop:bg-black/60 sm:inset-0 sm:m-auto sm:max-w-md sm:rounded-3xl"
        onCancel={(event) => { if (busyRef.current) event.preventDefault(); }}
        onClose={() => {
          if (previousOverflow.current !== null) document.body.style.overflow = previousOverflow.current;
          previousOverflow.current = null;
        }}
        onClick={(event) => {
          if (event.target !== event.currentTarget) return;
          const bounds = event.currentTarget.getBoundingClientRect();
          if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) close();
        }}
      >
        <div className="p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          <div className="mb-1 flex items-center justify-between gap-3">
            <h2 id="add-expense-title" className="font-display text-xl font-semibold">Add expense</h2>
            <button type="button" onClick={close} disabled={busy} aria-label="Close expense form" className="icon-button disabled:opacity-50">✕</button>
          </div>
          <p id="add-expense-description" className="mb-5 text-sm text-dim">Paid by {payerName}. Shared with your household.</p>

          <form onSubmit={save}>
            <fieldset disabled={busy} className="min-w-0 space-y-4">
              <label className="block"><span className="field-label">Expense name</span><input ref={nameRef} type="text" required value={merchant} onChange={(event) => setMerchant(event.target.value)} maxLength={120} placeholder="e.g. Coffee, taxi or grocery store" className="field-control bg-bg" /></label>
              <div className="grid grid-cols-[minmax(0,1fr)_7rem] gap-3">
                <label><span className="field-label">Amount</span><input type="number" inputMode="decimal" min="0.01" step="0.01" required value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0.00" className="field-control bg-bg font-money" /></label>
                <label><span className="field-label">Currency</span><select value={currency} onChange={(event) => setCurrency(event.target.value)} className="field-control bg-bg px-3">{Object.keys(CURRENCIES).map((code) => <option key={code} value={code}>{code}</option>)}</select></label>
              </div>
              <label className="block"><span className="field-label">Category</span><select value={categoryId} onChange={(event) => setCategoryId(event.target.value)} className="field-control bg-bg"><option value="">Uncategorized</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.emoji} {category.name}</option>)}</select></label>
              <div className="grid grid-cols-1 gap-3 min-[360px]:grid-cols-2">
                <label className="min-w-0"><span className="field-label">Date</span><input type="date" required value={spentOn} onChange={(event) => setSpentOn(event.target.value)} className="field-control min-w-0 bg-bg px-3" /></label>
                <label className="min-w-0"><span className="field-label">Time <span className="font-normal text-mute">(optional)</span></span><input type="time" value={spentTime} onChange={(event) => setSpentTime(event.target.value)} className="field-control min-w-0 bg-bg px-3" /></label>
              </div>
              <label className="block"><span className="field-label">Note <span className="font-normal text-mute">(optional)</span></span><textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} rows={2} placeholder="Anything you'd like to remember" className="field-control resize-y bg-bg" /></label>
              {error && <p role="alert" className="text-sm text-danger">{error}</p>}
              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={close} className="min-h-12 rounded-xl px-4 text-dim hover:bg-surface2">Cancel</button>
                <button type="submit" className="primary-button">{busy ? "Saving…" : "Save expense"}</button>
              </div>
            </fieldset>
          </form>
        </div>
      </dialog>
    </>
  );
}
