"use client";

import Link from "next/link";
import { useShortcutSetup } from "./useShortcutSetup";

export default function ShortcutPrompt({ suppressed = false }: { suppressed?: boolean }) {
  const { status, setStatus, iPhone } = useShortcutSetup();
  if (suppressed || !iPhone || status === "dismissed" || status === "complete") return null;
  const started = status !== "new";

  return (
    <aside aria-labelledby="shortcut-prompt-title" className="mb-6 rounded-2xl border border-hairline bg-surface p-4">
      <p className="text-xs font-medium uppercase tracking-[0.14em] text-mute">Optional · iPhone Shortcut</p>
      <h2 id="shortcut-prompt-title" className="mt-1 font-medium text-ink">
        {started ? "Finish your Shortcut setup" : "Add expenses with a double tap"}
      </h2>
      <p className="mt-1 text-sm leading-relaxed text-dim">
        {started ? "Pick up where you left off, then try it on your iPhone." : "Open the expense form by tapping the back of your iPhone."}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Link href="/settings#iphone-shortcuts" onClick={() => { if (!started) setStatus("install"); }} className="primary-button inline-flex items-center justify-center">
          {started ? "Continue setup" : "Set up Shortcut"}
        </Link>
        <button type="button" onClick={() => {
          setStatus("dismissed");
          document.querySelector<HTMLButtonElement>('button[aria-haspopup="dialog"]')?.focus();
        }} className="min-h-12 rounded-xl px-4 text-sm text-dim hover:bg-surface2">Not now</button>
      </div>
      <p className="mt-2 text-xs text-mute">You can always find this in Settings.</p>
    </aside>
  );
}
