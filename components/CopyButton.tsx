"use client";

import { useState } from "react";

export default function CopyButton({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(value).then(() => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1800);
        });
      }}
      className="rounded-lg border border-hairline px-2.5 py-1 text-xs text-dim transition-colors hover:border-mint/40 hover:text-ink"
    >
      {copied ? "Copied ✓" : label ?? "Copy"}
    </button>
  );
}
