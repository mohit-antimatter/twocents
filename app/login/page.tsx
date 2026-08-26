"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import GoogleSignInButton from "@/components/GoogleSignInButton";

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-bg" />}>
      <LoginPageContent />
    </Suspense>
  );
}

function LoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const googleError = {
    cancelled: "Google sign-in was cancelled.",
    failed: "Google couldn't sign you in. Please try again.",
    unavailable: "Google sign-in hasn't been configured yet.",
    "signin-first": "Sign in with your password before connecting Google.",
    "link-required": "This email already has a TwoCents account. Sign in with your password, then connect Google in Settings.",
  }[searchParams.get("google") ?? ""];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (res.ok) {
      router.push("/");
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Couldn't sign in.");
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-5 py-12 sm:px-8">
      <h1 className="font-display text-3xl font-semibold tracking-tight text-ink">
        two<span className="text-mint">¢</span>ents
      </h1>
      <p className="mt-2 text-dim">The shared expense ledger for couples.</p>

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
          <span className="field-label">Email</span>
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" className="field-control" />
        </label>
        <label className="block">
          <span className="field-label">Password</span>
          <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Your password" autoComplete="current-password" className="field-control" />
        </label>
        {(error || googleError) && (
          <p role="alert" className="text-sm text-danger">{error || googleError}</p>
        )}
        <button
          type="submit"
          disabled={busy}
          className="primary-button w-full"
        >
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>

      <p className="mt-6 text-sm text-mute">
        New here?{" "}
        <Link href="/signup" className="text-mint underline-offset-4 hover:underline">
          Create an account
        </Link>
      </p>
    </main>
  );
}
