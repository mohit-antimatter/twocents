"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import CopyButton from "@/components/CopyButton";

const CURRENCIES = ["INR", "USD", "EUR", "GBP", "AED", "SGD", "AUD", "CAD"];

export default function OnboardingFlow() {
  const router = useRouter();
  const [mode, setMode] = useState<"create" | "join">("create");
  const [name, setName] = useState("");
  const [currency, setCurrency] = useState("INR");
  const [code, setCode] = useState("");
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function chooseMode(nextMode: "create" | "join", moveFocus = false) {
    setMode(nextMode);
    setError(null);
    if (moveFocus) {
      window.requestAnimationFrame(() => document.getElementById(`household-${nextMode}-tab`)?.focus());
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const body = mode === "create" ? { action: "create", name, homeCurrency: currency } : { action: "join", code };
    try {
      const response = await fetch("/api/household", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error ?? "Something went wrong.");
        return;
      }
      if (mode === "create" && typeof data.inviteCode === "string") {
        setInviteCode(data.inviteCode);
        return;
      }
      router.push("/");
      router.refresh();
    } catch {
      setError("Couldn't connect. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  if (inviteCode) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-5 py-12 sm:px-8">
        <div className="rise-in rounded-3xl border border-mint/25 bg-surface p-6 shadow-2xl shadow-black/20 sm:p-8">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-mint/10 text-2xl text-mint" aria-hidden>✓</div>
          <p className="mt-5 text-xs font-medium uppercase tracking-[0.16em] text-mint">Household ready</p>
          <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-ink">Now bring your partner in</h1>
          <p className="mt-2 text-dim">Send them this one-time code. They create their own account, choose “Join with a code,” and you&apos;ll both see the same ledger.</p>
          <div className="mt-6 rounded-2xl border border-amber/25 bg-bg p-4 text-center">
            <p className="text-xs uppercase tracking-[0.14em] text-mute">Your invite code</p>
            <code className="mt-2 block font-money text-3xl font-semibold tracking-[0.2em] text-amber">{inviteCode}</code>
            <div className="mt-4 flex justify-center"><CopyButton value={inviteCode} label="Copy invite code" /></div>
          </div>
          <ol className="mt-6 space-y-3 text-sm text-dim">
            <li className="flex gap-3"><span className="text-mint">1</span> Your partner creates their own TwoCents account.</li>
            <li className="flex gap-3"><span className="text-mint">2</span> They choose “Join with a code.”</li>
            <li className="flex gap-3"><span className="text-mint">3</span> They enter this code once.</li>
          </ol>
          <button type="button" onClick={() => { router.push("/"); router.refresh(); }} className="mt-7 min-h-12 w-full rounded-xl bg-mint px-5 font-medium text-bg transition-colors hover:bg-mint/90">Continue to your ledger</button>
          <p className="mt-3 text-center text-xs text-mute">You can find or replace this code later in Settings.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-5 py-12 sm:px-8">
      <p className="text-xs font-medium uppercase tracking-[0.16em] text-mint">Set up TwoCents</p>
      <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-ink">One ledger, two people</h1>
      <p className="mt-2 max-w-md text-dim">Start a household and invite your partner, or use the code they sent you.</p>
      <div className="mt-8 grid grid-cols-2 rounded-2xl border border-hairline bg-surface p-1" role="tablist" aria-label="Household setup">
        {(["create", "join"] as const).map((item) => (
          <button
            key={item}
            id={`household-${item}-tab`}
            type="button"
            role="tab"
            aria-selected={mode === item}
            aria-controls="household-setup-panel"
            tabIndex={mode === item ? 0 : -1}
            onClick={() => chooseMode(item)}
            onKeyDown={(event) => {
              if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
                event.preventDefault();
                chooseMode(item === "create" ? "join" : "create", true);
              } else if (event.key === "Home" || event.key === "End") {
                event.preventDefault();
                chooseMode(event.key === "Home" ? "create" : "join", true);
              }
            }}
            className={`min-h-11 rounded-xl px-3 text-sm font-medium transition-colors ${mode === item ? "bg-surface2 text-ink" : "text-mute hover:text-dim"}`}
          >
            {item === "create" ? "Start a household" : "Join with a code"}
          </button>
        ))}
      </div>
      <form id="household-setup-panel" role="tabpanel" aria-labelledby={`household-${mode}-tab`} onSubmit={submit} className="mt-5 space-y-4">
        {mode === "create" ? (
          <>
            <label className="block">
              <span className="field-label">Household name</span>
              <input value={name} onChange={(event) => setName(event.target.value)} placeholder="For example, M & A" autoComplete="organization" className="field-control" />
              <span className="mt-1.5 block text-xs text-mute">Optional. “Our Household” works too.</span>
            </label>
            <label className="block">
              <span className="field-label">Home currency</span>
              <select value={currency} onChange={(event) => setCurrency(event.target.value)} className="field-control">
                {CURRENCIES.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
              <span className="mt-1.5 block text-xs text-mute">Shared totals roll up into this currency.</span>
            </label>
          </>
        ) : (
          <label className="block">
            <span className="field-label">Invite code</span>
            <input required value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} placeholder="8-character code" autoComplete="one-time-code" maxLength={8} className="field-control font-money uppercase tracking-[0.18em]" />
            <span className="mt-1.5 block text-xs text-mute">Ask your partner for the code shown after setup or in Settings.</span>
          </label>
        )}
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <button type="submit" disabled={busy} className="primary-button w-full">{busy ? "Setting up…" : mode === "create" ? "Create household" : "Join household"}</button>
      </form>
    </main>
  );
}
