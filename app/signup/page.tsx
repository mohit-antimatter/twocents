"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password }),
    });
    if (res.ok) {
      router.push("/onboarding");
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Couldn't create the account.");
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 pb-16">
      <h1 className="font-display text-3xl font-semibold tracking-tight text-ink">
        two<span className="text-mint">¢</span>ents
      </h1>
      <p className="mt-2 text-dim">Three seconds to log. Zero bank permissions.</p>

      <form onSubmit={submit} className="mt-8 space-y-3">
        <input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your first name"
          autoComplete="given-name"
          className="w-full rounded-xl border border-hairline bg-surface px-4 py-3 text-ink placeholder:text-mute focus:border-mint/50 focus:outline-none"
        />
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          autoComplete="email"
          className="w-full rounded-xl border border-hairline bg-surface px-4 py-3 text-ink placeholder:text-mute focus:border-mint/50 focus:outline-none"
        />
        <input
          type="password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password (8+ characters)"
          autoComplete="new-password"
          className="w-full rounded-xl border border-hairline bg-surface px-4 py-3 text-ink placeholder:text-mute focus:border-mint/50 focus:outline-none"
        />
        {error && <p className="text-sm text-danger">{error}</p>}
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-xl bg-mint py-3 font-medium text-bg transition-opacity disabled:opacity-50"
        >
          {busy ? "Creating…" : "Create account"}
        </button>
      </form>

      <p className="mt-6 text-sm text-mute">
        Already have one?{" "}
        <Link href="/login" className="text-mint underline-offset-4 hover:underline">
          Sign in
        </Link>
      </p>
    </main>
  );
}
