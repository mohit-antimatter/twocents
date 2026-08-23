"use client";

import { useEffect, useRef, useState } from "react";

export default function CopyButton({ value, label }: { value: string; label?: string }) {
  const [status, setStatus] = useState<"idle" | "copied" | "error">("idle");
  const resetTimer = useRef<number | null>(null);

  useEffect(() => () => {
    if (resetTimer.current !== null) window.clearTimeout(resetTimer.current);
  }, []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setStatus("copied");
    } catch {
      setStatus("error");
    }
    if (resetTimer.current !== null) window.clearTimeout(resetTimer.current);
    resetTimer.current = window.setTimeout(() => setStatus("idle"), 1800);
  }

  return (
    <button
      type="button"
      onClick={() => void copy()}
      aria-live="polite"
      className="min-h-11 rounded-xl border border-hairline px-3 text-xs text-dim transition-colors hover:border-mint/40 hover:text-ink"
    >
      {status === "copied" ? "Copied ✓" : status === "error" ? "Copy failed" : label ?? "Copy"}
    </button>
  );
}
