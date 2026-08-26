"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import GoogleSignInButton from "@/components/GoogleSignInButton";

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
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-5 py-12 sm:px-8">
      <h1 className="font-display text-3xl font-semibold tracking-tight text-ink">
        two<span className="text-mint">¢</span>ents
      </h1>
      <p className="mt-2 text-dim">Three seconds to log. Zero bank permissions.</p>

      <div className="mt-8">
        <GoogleSignInButton />
      </div>

      <div className="my-6 flex items-center gap-3 text-xs text-mute" aria-hidden="true">
        <span className="h-px flex-1 bg-hairline" />
        <span>or use email</span>
        <span className="h-px flex-1 bg-hairline" />
      </div>

      <form onSubmit={submit} className="space-y-4">
        <label className="block">
          <span className="field-label">First name</span>
          <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Your first name" autoComplete="given-name" className="field-control" />
        </label>
        <label className="block">
          <span className="field-label">Email</span>
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" className="field-control" />
        </label>
        <label className="block">
          <span className="field-label">Password</span>
          <input type="password" required minLength={8} maxLength={128} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" autoComplete="new-password" className="field-control" />
        </label>
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <button
          type="submit"
          disabled={busy}
          className="primary-button w-full"
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
