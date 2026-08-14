"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const CURRENCIES = ["INR", "USD", "EUR", "GBP", "AED", "SGD", "AUD", "CAD"];

export default function OnboardingPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"create" | "join">("create");
  const [name, setName] = useState("");
  const [currency, setCurrency] = useState("INR");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const body =
      mode === "create"
        ? { action: "create", name, homeCurrency: currency }
        : { action: "join", code };
    const res = await fetch("/api/household", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      router.push("/");
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Something went wrong.");
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 pb-16">
      <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">
        One ledger, two people
      </h1>
      <p className="mt-2 text-dim">
        Expenses live in a shared household. Start one, or join your partner&apos;s.
      </p>

      <div className="mt-8 flex rounded-xl border border-hairline bg-surface p-1">
        {(["create", "join"] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${
              mode === m ? "bg-surface2 text-ink" : "text-mute hover:text-dim"
            }`}
          >
            {m === "create" ? "Start fresh" : "Join with a code"}
          </button>
        ))}
      </div>

      <form onSubmit={submit} className="mt-4 space-y-3">
        {mode === "create" ? (
          <>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Household name (e.g. “M & A”)"
              className="w-full rounded-xl border border-hairline bg-surface px-4 py-3 text-ink placeholder:text-mute focus:border-mint/50 focus:outline-none"
            />
            <label className="block">
              <span className="mb-1 block text-xs uppercase tracking-[0.14em] text-mute">
                Home currency — totals roll up into this
              </span>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="w-full rounded-xl border border-hairline bg-surface px-4 py-3 text-ink focus:border-mint/50 focus:outline-none"
              >
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
          </>
        ) : (
          <input
            required
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="Invite code (in your partner's Settings)"
            className="w-full rounded-xl border border-hairline bg-surface px-4 py-3 font-money uppercase tracking-widest text-ink placeholder:font-body placeholder:normal-case placeholder:tracking-normal placeholder:text-mute focus:border-mint/50 focus:outline-none"
          />
        )}
        {error && <p className="text-sm text-danger">{error}</p>}
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-xl bg-mint py-3 font-medium text-bg transition-opacity disabled:opacity-50"
        >
          {busy ? "Setting up…" : mode === "create" ? "Create household" : "Join household"}
        </button>
      </form>
    </main>
  );
}
