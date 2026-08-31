"use client";

import { useRef } from "react";
import { ADD_EXPENSE_SHORTCUT_PATH } from "@/lib/shortcut";
import { useShortcutSetup } from "./useShortcutSetup";

export default function ShortcutSetup() {
  const { status, setStatus } = useShortcutSetup();
  const heading = useRef<HTMLHeadingElement>(null);
  const step = status === "assign" ? 2 : status === "test" ? 3 : 1;
  const complete = status === "complete";

  function advance(next: "install" | "assign" | "test" | "complete") {
    setStatus(next);
    window.requestAnimationFrame(() => heading.current?.focus());
  }

  return (
    <div className="mb-5 space-y-4 rounded-2xl border border-mint/25 bg-surface p-4">
      <div>
        <h3 ref={heading} tabIndex={-1} className="font-medium text-ink focus:outline-none">
          {complete ? "Shortcut setup confirmed" : "Double-tap to add an expense"}
        </h3>
        <p className="mt-1 text-sm leading-relaxed text-dim">
          Open the expense form with a tap on the back of your iPhone. Name, amount,
          currency and category stay together on one screen. No dictation or token needed.
        </p>
      </div>
      {complete ? (
        <div className="space-y-3">
          <p role="status" className="text-sm text-dim">You confirmed it works. We won’t show the setup reminder in this browser again.</p>
          <button type="button" onClick={() => advance("install")} className="min-h-12 rounded-xl border border-hairline px-4 text-sm text-ink hover:bg-surface2">Review setup</button>
        </div>
      ) : (
        <div className="space-y-4">
          <p aria-live="polite" className="text-xs font-medium uppercase tracking-[0.14em] text-mint">Step {step} of 3 · {step === 1 ? "Install" : step === 2 ? "Assign Back Tap" : "Try it"}</p>
          {step === 1 && <>
            <p className="text-sm leading-relaxed text-dim">On your iPhone, download the file, open it from Safari Downloads or Files, then tap <strong className="text-ink">Add Shortcut</strong>.</p>
            <a href={ADD_EXPENSE_SHORTCUT_PATH} className="primary-button inline-flex items-center justify-center">Download iPhone Shortcut</a>
            <p className="text-sm leading-relaxed text-dim">Run <strong className="text-ink">Add OurPool Expense</strong> once. Sign in in your browser if asked, then return here.</p>
            <button type="button" onClick={() => advance("assign")} className="min-h-12 rounded-xl border border-hairline px-4 text-sm text-ink hover:bg-surface2">I’ve added the Shortcut →</button>
          </>}
          {step === 2 && <>
            <p className="text-sm leading-relaxed text-dim">Open iPhone <strong className="text-ink">Settings → Accessibility → Touch → Back Tap → Double Tap</strong> and select <strong className="text-ink">Add OurPool Expense</strong>.</p>
            <p className="text-sm text-mute">This is an iPhone setting; OurPool can’t switch it on for you.</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => advance("install")} className="min-h-12 rounded-xl px-4 text-sm text-dim hover:bg-surface2">Back</button>
              <button type="button" onClick={() => advance("test")} className="primary-button">I’ve assigned Double Tap →</button>
            </div>
          </>}
          {step === 3 && <>
            <p className="text-sm leading-relaxed text-dim">Double-tap the back of your iPhone. Does the expense form open? You don’t need to save an expense to test it.</p>
            <p className="text-sm text-dim">Return to these setup steps in the same browser or home-screen app, then confirm below.</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => advance("assign")} className="min-h-12 rounded-xl px-4 text-sm text-dim hover:bg-surface2">Back</button>
              <button type="button" onClick={() => advance("complete")} className="primary-button">It works</button>
            </div>
            <p className="text-xs text-mute">Only your confirmation marks setup complete. Downloading or opening the form does not.</p>
          </>}
        </div>
      )}
      <p className="text-xs leading-relaxed text-mute">Your choice and progress are saved in this browser on this device. Other browsers and home-screen installs may show setup separately.</p>
      <p className="text-xs leading-relaxed text-mute">
        Currency defaults to your household currency; the date defaults to today.
        You still tap Save expense to log it. Internet access is needed, and your phone
        may ask you to unlock. An installed home-screen app may have a separate sign-in
        from your browser. This download opens the live app at ourpool.vercel.app.
      </p>
      <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
        {/* Full navigation: /add sets a one-shot cookie and must never be prefetched. */}
        <a href="/add" className="inline-flex min-h-11 items-center text-mint underline-offset-4 hover:underline">Test only the form link</a>
        <a href="https://support.apple.com/en-us/111772" target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center text-dim underline-offset-4 hover:underline">Apple’s Back Tap guide ↗</a>
      </div>
      <details className="border-t border-hairline pt-3 text-sm text-dim">
        <summary className="min-h-11 cursor-pointer py-2 text-ink">Prefer to create it yourself?</summary>
        <p className="mt-1 leading-relaxed">
          In Shortcuts, tap + and add Open URLs. Set the URL to
          {" "}<code className="break-all text-mint">https://ourpool.vercel.app/add</code>{" "}
          and name it Add OurPool Expense. Then assign it under iPhone Settings → Accessibility → Touch → Back Tap → Double Tap.
          You can also run it from Siri or assign it to the Action Button on supported iPhones.
        </p>
      </details>
    </div>
  );
}
