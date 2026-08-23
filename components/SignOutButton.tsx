"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function SignOutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState<"current" | "all" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function signOut(allSessions: boolean) {
    if (allSessions && !window.confirm("Sign out on every device?")) return;
    setBusy(allSessions ? "all" : "current");
    setError(null);
    const response = await fetch(allSessions ? "/api/auth/sessions" : "/api/auth/logout", {
      method: allSessions ? "DELETE" : "POST",
    });
    if (!response.ok) {
      setError("Couldn't sign out. Please try again.");
      setBusy(null);
      return;
    }
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="flex w-full flex-col items-start gap-2">
      <div className="grid w-full grid-cols-2 gap-2">
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => signOut(false)}
          className="min-h-11 rounded-xl border border-hairline px-3 text-sm text-dim transition-colors hover:border-danger/40 hover:text-danger disabled:opacity-50"
        >
          {busy === "current" ? "Signing out…" : "Sign out"}
        </button>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => signOut(true)}
          className="min-h-11 rounded-xl border border-hairline px-3 text-sm text-dim transition-colors hover:border-danger/40 hover:text-danger disabled:opacity-50"
        >
          {busy === "all" ? "Signing out…" : "Sign out everywhere"}
        </button>
      </div>
      {error && <p role="alert" className="text-xs text-danger">{error}</p>}
    </div>
  );
}
