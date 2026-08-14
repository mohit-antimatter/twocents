"use client";

import { useEffect, useState } from "react";
import CopyButton from "./CopyButton";

type TokenRow = { id: string; label: string; created_at: number; last_used_at: number | null };

export default function TokenManager({ initialTokens }: { initialTokens: TokenRow[] }) {
  const [tokens, setTokens] = useState(initialTokens);
  const [freshToken, setFreshToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [origin, setOrigin] = useState("https://your-app-url");

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  async function create() {
    setBusy(true);
    const res = await fetch("/api/tokens", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: "iPhone Shortcut" }),
    });
    const data = await res.json();
    if (res.ok) {
      setFreshToken(data.token);
      const list = await fetch("/api/tokens").then((r) => r.json());
      setTokens(list.tokens ?? []);
    }
    setBusy(false);
  }

  async function revoke(id: string) {
    await fetch(`/api/tokens/${id}`, { method: "DELETE" });
    setTokens((t) => t.filter((x) => x.id !== id));
  }

  return (
    <div className="space-y-4">
      {tokens.length > 0 && (
        <ul className="divide-y divide-hairline overflow-hidden rounded-xl border border-hairline bg-surface2">
          {tokens.map((t) => (
            <li key={t.id} className="flex items-center gap-3 px-3.5 py-2.5 text-sm">
              <span className="flex-1 text-ink">{t.label}</span>
              <span className="text-xs text-mute">
                {t.last_used_at ? "used " + new Date(t.last_used_at).toLocaleDateString() : "never used"}
              </span>
              <button
                onClick={() => revoke(t.id)}
                className="text-xs text-mute hover:text-danger"
              >
                Revoke
              </button>
            </li>
          ))}
        </ul>
      )}

      {freshToken ? (
        <div className="space-y-2 rounded-xl border border-mint/30 bg-surface2 p-3.5">
          <p className="text-xs text-dim">
            Your token — copy it now, it won&apos;t be shown again:
          </p>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-lg bg-bg px-2.5 py-1.5 font-money text-xs text-mint">
              {freshToken}
            </code>
            <CopyButton value={freshToken} />
          </div>
        </div>
      ) : (
        <button
          onClick={create}
          disabled={busy}
          className="rounded-xl border border-hairline px-4 py-2.5 text-sm text-ink transition-colors hover:border-mint/40 disabled:opacity-50"
        >
          {busy ? "Generating…" : "Generate a Shortcut token"}
        </button>
      )}

      <details className="rounded-xl border border-hairline bg-surface p-3.5 text-sm text-dim">
        <summary className="cursor-pointer select-none text-ink">
          Set up “Hey Siri, log expense” (2 minutes)
        </summary>
        <ol className="mt-3 list-decimal space-y-2 pl-5">
          <li>
            Open the <strong className="text-ink">Shortcuts</strong> app on your iPhone → tap{" "}
            <strong className="text-ink">+</strong> → name it{" "}
            <strong className="text-ink">Log Expense</strong>.
          </li>
          <li>
            Add action <strong className="text-ink">Dictate Text</strong>.
          </li>
          <li>
            Add action <strong className="text-ink">Get Contents of URL</strong> and configure:
            <ul className="mt-1.5 list-disc space-y-1 pl-4 text-xs">
              <li>
                URL: <code className="font-money text-mint">{origin}/api/shortcuts/capture</code>
              </li>
              <li>Method: <code className="font-money">POST</code></li>
              <li>
                Headers → <code className="font-money">Authorization</code>:{" "}
                <code className="font-money">Bearer &lt;your token&gt;</code>
              </li>
              <li>
                Request Body → JSON → key <code className="font-money">text</code> = the{" "}
                <em>Dictated Text</em> variable
              </li>
            </ul>
          </li>
          <li>
            Add action <strong className="text-ink">Show Notification</strong> with the{" "}
            <em>message</em> value from the URL contents.
          </li>
          <li>
            Say <em>“Hey Siri, Log Expense”</em> — or bind it to the{" "}
            <strong className="text-ink">Action Button</strong> (Settings → Action Button) or{" "}
            <strong className="text-ink">Back Tap</strong> (Settings → Accessibility → Touch).
          </li>
        </ol>
        <p className="mt-3 text-xs text-mute">
          Note: your phone must be able to reach this server — on localhost that means same Wi-Fi +
          your Mac&apos;s IP, or deploy the app first.
        </p>
      </details>
    </div>
  );
}
