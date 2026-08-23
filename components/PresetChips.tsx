"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { formatMinor } from "@/lib/money";

type PresetProp = {
  id: string;
  label: string;
  emoji: string;
  amount_minor: number;
  currency: string;
};

export default function PresetChips({ presets }: { presets: PresetProp[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  async function log(id: string) {
    if (busyId) return;
    setBusyId(id);
    try {
      const res = await fetch(`/api/presets/${id}/log`, { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setFlash(data.summary);
        window.setTimeout(() => setFlash(null), 3500);
        router.refresh();
      }
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <div className="flex gap-2 overflow-x-auto pb-1 [-webkit-overflow-scrolling:touch]">
        {presets.map((p) => (
          <button
            key={p.id}
            onClick={() => log(p.id)}
            disabled={busyId !== null}
            className={`flex min-h-11 shrink-0 items-center gap-2 rounded-full border border-hairline bg-surface px-3.5 text-sm transition-all hover:border-mint/40 hover:bg-surface2 active:scale-95 ${
              busyId === p.id ? "opacity-50" : ""
            }`}
          >
            <span aria-hidden>{p.emoji}</span>
            <span className="text-ink">{p.label}</span>
            <span className="font-money text-xs text-dim">
              {formatMinor(p.amount_minor, p.currency)}
            </span>
          </button>
        ))}
        <Link
          href="/settings#presets"
          className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border border-dashed border-hairline px-3.5 text-sm text-mute transition-colors hover:border-mint/40 hover:text-dim"
        >
          <span aria-hidden>+</span> preset
        </Link>
      </div>
      {flash && (
        <p role="status" className="rise-in mt-2 text-sm text-mint">
          {flash}
        </p>
      )}
    </div>
  );
}
