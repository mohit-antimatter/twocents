"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Toast = { kind: "ok" | "err"; msg: string } | null;

export default function QuickAdd() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<Toast>(null);
  const [listening, setListening] = useState(false);
  const [speechOK, setSpeechOK] = useState(false);
  const toastTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    const w = window as unknown as Record<string, unknown>;
    if (w.SpeechRecognition || w.webkitSpeechRecognition) setSpeechOK(true);
  }, []);

  const showToast = useCallback((t: Toast) => {
    setToast(t);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 4500);
  }, []);

  const submit = useCallback(
    async (value: string, source: "web" | "voice") => {
      if (!value.trim() || busy) return;
      setBusy(true);
      try {
        const res = await fetch("/api/capture", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: value, source }),
        });
        const data = await res.json();
        if (res.ok) {
          setText("");
          showToast({ kind: "ok", msg: data.summary });
          router.refresh();
        } else {
          showToast({ kind: "err", msg: data.error ?? "Something went wrong." });
        }
      } catch {
        showToast({ kind: "err", msg: "Network error — is the server up?" });
      } finally {
        setBusy(false);
      }
    },
    [busy, router, showToast]
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
        void submit(transcript, "voice");
      }
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => {
      setListening(false);
      showToast({ kind: "err", msg: "Didn't catch that — try again." });
    };
    setListening(true);
    rec.start();
  }, [listening, submit, showToast]);

  return (
    <div className="relative">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit(text, "web");
        }}
        className="flex items-center gap-2 rounded-2xl border border-hairline bg-surface px-3 py-2 focus-within:border-mint/50 transition-colors"
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={listening ? "Listening…" : "coffee 250 · uber 340 yesterday"}
          aria-label="Log an expense"
          enterKeyHint="done"
          autoComplete="off"
          className="min-w-0 flex-1 bg-transparent py-2 text-[15px] text-ink placeholder:text-mute focus:outline-none"
        />
        {speechOK && (
          <button
            type="button"
            onClick={startVoice}
            aria-label="Log by voice"
            title="Log by voice"
            className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl transition-colors ${
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
          className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-mint text-bg transition-opacity disabled:opacity-30"
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
          role="status"
          className={`rise-in absolute inset-x-0 top-full z-10 mt-2 rounded-xl border px-4 py-3 text-sm ${
            toast.kind === "ok"
              ? "border-mint/30 bg-surface2 text-ink"
              : "border-danger/40 bg-surface2 text-danger"
          }`}
        >
          {toast.msg}
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
