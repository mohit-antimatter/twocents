"use client";

import { useState } from "react";

import CopyButton from "@/components/CopyButton";

export default function InviteManager({
  initialCode,
  canRotate,
}: {
  initialCode: string;
  canRotate: boolean;
}) {
  const [code, setCode] = useState(initialCode);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function rotate() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/household", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "rotate" }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error ?? "Couldn't replace the invite code.");
        return;
      }
      setCode(data.inviteCode);
    } catch {
      setError("Couldn't replace the code while offline.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-amber/30 bg-surface2 p-3">
      <p className="text-sm text-ink">Invite your partner</p>
      <p className="mt-0.5 text-xs text-mute">
        This code works once. Your partner enters it after signing up.
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <code className="rounded-lg bg-bg px-3 py-2 font-money text-sm tracking-[0.2em] text-amber">
          {code}
        </code>
        <CopyButton value={code} />
        {canRotate && (
          <button
            type="button"
            onClick={() => void rotate()}
            disabled={busy}
            className="min-h-11 rounded-xl border border-hairline px-3 text-xs text-dim transition-colors hover:border-amber/40 hover:text-ink disabled:opacity-50"
          >
            {busy ? "Replacing…" : "Replace code"}
          </button>
        )}
      </div>
      {error && <p role="alert" className="mt-2 text-xs text-danger">{error}</p>}
    </div>
  );
}
