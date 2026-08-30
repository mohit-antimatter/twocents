"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Counts = {
  expenses: number;
  recurring: number;
  presets: number;
  categoryGuides: number;
};

function countSummary(counts: Counts): string {
  return `${counts.expenses} expenses, ${counts.recurring} recurring schedules, ${counts.presets} presets, and ${counts.categoryGuides} category guides`;
}

export default function DataManager({ canManage }: { canManage: boolean }) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [importConfirmation, setImportConfirmation] = useState("");
  const [clearConfirmation, setClearConfirmation] = useState("");
  const [busy, setBusy] = useState<"import" | "clear" | null>(null);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  async function importBackup(event: React.FormEvent) {
    event.preventDefault();
    setMessage(null);
    if (!file) {
      setMessage({ kind: "error", text: "Choose an OurPool backup first." });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setMessage({ kind: "error", text: "That backup is larger than 10 MB." });
      return;
    }
    if (importConfirmation !== "IMPORT") {
      setMessage({ kind: "error", text: "Type IMPORT exactly to replace the current data." });
      return;
    }
    setBusy("import");
    try {
      const response = await fetch("/api/data/import", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-TwoCents-Confirmation": importConfirmation,
        },
        body: await file.text(),
      });
      const result = (await response.json().catch(() => ({}))) as {
        error?: string;
        counts?: Counts;
      };
      if (!response.ok || !result.counts) {
        setMessage({ kind: "error", text: result.error ?? "The backup couldn't be imported." });
        return;
      }
      setMessage({ kind: "ok", text: `Backup restored: ${countSummary(result.counts)}.` });
      setFile(null);
      setImportConfirmation("");
      if (fileInput.current) fileInput.current.value = "";
      router.refresh();
    } catch {
      setMessage({ kind: "error", text: "The backup couldn't be imported. Check your connection." });
    } finally {
      setBusy(null);
    }
  }

  async function clearData(event: React.FormEvent) {
    event.preventDefault();
    setMessage(null);
    if (clearConfirmation !== "CLEAR") {
      setMessage({ kind: "error", text: "Type CLEAR exactly to remove the shared financial data." });
      return;
    }
    setBusy("clear");
    try {
      const response = await fetch("/api/data/clear", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation: clearConfirmation }),
      });
      const result = (await response.json().catch(() => ({}))) as {
        error?: string;
        counts?: Counts;
      };
      if (!response.ok || !result.counts) {
        setMessage({ kind: "error", text: result.error ?? "The data couldn't be cleared." });
        return;
      }
      setMessage({ kind: "ok", text: `Cleared ${countSummary(result.counts)}.` });
      setClearConfirmation("");
      router.refresh();
    } catch {
      setMessage({ kind: "error", text: "The data couldn't be cleared. Check your connection." });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4 rounded-2xl border border-hairline bg-surface p-4">
      <div>
        <p className="text-sm font-medium text-ink">Download</p>
        <p className="mt-1 text-xs leading-relaxed text-mute">
          JSON is a complete, restorable backup. CSV is the expense ledger for spreadsheets.
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <a
            href="/api/backup"
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-mint/30 px-3 text-center text-sm font-medium text-mint transition-colors hover:bg-mint/10"
          >
            Backup · JSON
          </a>
          <a
            href="/api/export"
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-hairline px-3 text-center text-sm font-medium text-dim transition-colors hover:bg-surface2 hover:text-ink"
          >
            Expenses · CSV
          </a>
        </div>
      </div>

      <div className="border-t border-hairline pt-4">
        <p className="text-sm font-medium text-ink">Restore a backup</p>
        <p className="mt-1 text-xs leading-relaxed text-mute">
          Replaces expenses, recurring schedules, presets, and category guides. Download a fresh backup first.
        </p>
        {canManage ? (
          <form onSubmit={importBackup} className="mt-3 space-y-3">
            <label className="block">
              <span className="sr-only">OurPool JSON backup</span>
              <input
                ref={fileInput}
                type="file"
                accept="application/json,.json"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                className="block min-h-12 w-full rounded-xl border border-hairline bg-bg px-3 py-2 text-sm text-dim file:mr-3 file:rounded-lg file:border-0 file:bg-surface2 file:px-3 file:py-2 file:text-sm file:text-ink"
              />
            </label>
            <label className="block">
              <span className="field-label">Type IMPORT to replace current data</span>
              <input
                value={importConfirmation}
                onChange={(event) => setImportConfirmation(event.target.value)}
                autoComplete="off"
                className="field-control"
                placeholder="IMPORT"
              />
            </label>
            <button
              type="submit"
              disabled={busy !== null || !file || importConfirmation !== "IMPORT"}
              className="min-h-11 w-full rounded-xl border border-amber/40 px-4 text-sm font-medium text-amber transition-colors hover:bg-amber/10 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy === "import" ? "Restoring…" : "Replace from backup"}
            </button>
          </form>
        ) : (
          <p className="mt-3 text-xs text-mute">Only the household owner can restore a backup.</p>
        )}
      </div>

      <div className="border-t border-hairline pt-4">
        <p className="text-sm font-medium text-ink">Clear shared financial data</p>
        <p className="mt-1 text-xs leading-relaxed text-mute">
          Removes expenses, recurring schedules, presets, and category guides. Accounts, members, categories, and sign-in settings stay.
        </p>
        {canManage ? (
          <form onSubmit={clearData} className="mt-3 space-y-3">
            <label className="block">
              <span className="field-label">Type CLEAR to confirm</span>
              <input
                value={clearConfirmation}
                onChange={(event) => setClearConfirmation(event.target.value)}
                autoComplete="off"
                className="field-control"
                placeholder="CLEAR"
              />
            </label>
            <button
              type="submit"
              disabled={busy !== null || clearConfirmation !== "CLEAR"}
              className="min-h-11 w-full rounded-xl border border-danger/40 px-4 text-sm font-medium text-danger transition-colors hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy === "clear" ? "Clearing…" : "Clear shared data"}
            </button>
          </form>
        ) : (
          <p className="mt-3 text-xs text-mute">Only the household owner can clear shared data.</p>
        )}
      </div>

      {message && (
        <p
          role={message.kind === "error" ? "alert" : "status"}
          className={`text-sm ${message.kind === "error" ? "text-danger" : "text-mint"}`}
        >
          {message.text}
        </p>
      )}
    </div>
  );
}
