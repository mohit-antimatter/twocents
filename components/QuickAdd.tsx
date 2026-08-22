"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Toast =
  | { kind: "ok"; msg: string; expenseId: string }
  | { kind: "err" | "voice"; msg: string }
  | null;

export default function QuickAdd() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<Toast>(null);
  const [listening, setListening] = useState(false);
  const [speechOK, setSpeechOK] = useState(false);
  const [draftSource, setDraftSource] = useState<"web" | "voice">("web");
  const [undoing, setUndoing] = useState(false);
  const toastTimer = useRef<number | undefined>(undefined);
  const busyRef = useRef(false);
  const pendingRequest = useRef<{ text: string; id: string } | null>(null);

  useEffect(() => {
    const w = window as unknown as Record<string, unknown>;
    if (w.SpeechRecognition || w.webkitSpeechRecognition) setSpeechOK(true);
    return () => window.clearTimeout(toastTimer.current);
  }, []);

  const showToast = useCallback((t: Toast) => {
    setToast(t);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), t?.kind === "ok" ? 9000 : 6000);
  }, []);

  const submit = useCallback(
    async (value: string, source: "web" | "voice") => {
      const trimmed = value.trim();
      if (!trimmed || busyRef.current) return;
      busyRef.current = true;
      setBusy(true);
      const requestId =
        pendingRequest.current?.text === trimmed
          ? pendingRequest.current.id
          : crypto.randomUUID();
      pendingRequest.current = { text: trimmed, id: requestId };
      try {
        const res = await fetch("/api/capture", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: trimmed, source, requestId }),
        });
        const data = await res.json();
        if (res.ok) {
          pendingRequest.current = null;
          setText("");
          setDraftSource("web");
          showToast({ kind: "ok", msg: data.summary, expenseId: data.id });
          router.refresh();
        } else {
          if (res.status < 500) pendingRequest.current = null;
          showToast({ kind: "err", msg: data.error ?? "Something went wrong." });
        }
      } catch {
        showToast({ kind: "err", msg: "Connection lost. Try again — it won't log twice." });
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    },
    [router, showToast]
  );

  const undo = useCallback(
    async (expenseId: string) => {
      if (undoing) return;
      setUndoing(true);
      try {
        const res = await fetch(`/api/expenses/${expenseId}`, { method: "DELETE" });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          showToast({ kind: "err", msg: data.error ?? "Couldn't undo that expense." });
          return;
        }
        showToast(null);
        router.refresh();
      } catch {
        showToast({ kind: "err", msg: "Couldn't undo while offline. Try again." });
      } finally {
        setUndoing(false);
      }
    },
    [router, showToast, undoing]
  );

  const startVoice = useCallback(() => {
    const w = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionLike;
      webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    };
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!SR || listening) return;
    const rec = new SR();
    rec.lang = "en-IN";
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (e) => {
      const transcript = e.results[0]?.[0]?.transcript ?? "";
      if (transcript) {
        setText(transcript);
        setDraftSource("voice");
        showToast({ kind: "voice", msg: `Heard “${transcript}”. Check it, then tap + to save.` });
      }
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => {
      setListening(false);
      showToast({ kind: "err", msg: "Didn't catch that — try again." });
    };
    setListening(true);
    rec.start();
  }, [listening, showToast]);

  return (
    <div className="relative">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit(text, draftSource);
        }}
        className="flex items-center gap-2 rounded-2xl border border-hairline bg-surface px-3 py-2 focus-within:border-mint/50 transition-colors"
      >
        <input
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setDraftSource("web");
          }}
          placeholder={listening ? "Listening…" : "coffee 250 · uber 340 yesterday"}
          aria-label="Log an expense"
          enterKeyHint="done"
          autoComplete="off"
          className="min-w-0 flex-1 bg-transparent py-2 text-base text-ink placeholder:text-mute focus:outline-none"
        />
        {speechOK && (
          <button
            type="button"
            onClick={startVoice}
            aria-label="Log by voice"
            title="Log by voice"
            className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl transition-colors ${
              listening ? "bg-mint text-bg" : "text-dim hover:bg-surface2 hover:text-ink"
            }`}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <rect x="9" y="3" width="6" height="11" rx="3" />
              <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
            </svg>
          </button>
        )}
        <button
          type="submit"
          disabled={busy || !text.trim()}
          aria-label="Add expense"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-mint text-bg transition-opacity disabled:opacity-30"
        >
          {busy ? (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-bg/30 border-t-bg" />
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
          )}
        </button>
      </form>

      {toast && (
        <div
          role={toast.kind === "err" ? "alert" : "status"}
          className={`rise-in mt-2 rounded-xl border px-4 py-3 text-sm ${
            toast.kind === "ok"
              ? "border-mint/30 bg-surface2 text-ink"
              : toast.kind === "voice"
                ? "border-amber/30 bg-surface2 text-ink"
              : "border-danger/40 bg-surface2 text-danger"
          }`}
        >
          <p>{toast.msg}</p>
          {toast.kind === "ok" && (
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={() => void undo(toast.expenseId)}
                disabled={undoing}
                className="min-h-11 rounded-xl border border-hairline px-4 font-medium text-dim transition-colors hover:border-mint/40 hover:text-ink disabled:opacity-50"
              >
                {undoing ? "Undoing…" : "Undo"}
              </button>
              <button
                type="button"
                onClick={() => {
                  showToast(null);
                  router.push(`/?edit=${toast.expenseId}`, { scroll: false });
                }}
                className="min-h-11 rounded-xl px-4 font-medium text-mint transition-colors hover:bg-mint/10"
              >
                Edit details
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: { results: { [i: number]: { [j: number]: { transcript: string } } } }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
};
