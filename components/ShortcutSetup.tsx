import { ADD_EXPENSE_SHORTCUT_PATH } from "@/lib/shortcut";

export default function ShortcutSetup() {
  return (
    <div className="mb-5 space-y-4 rounded-2xl border border-mint/25 bg-surface p-4">
      <div>
        <h3 className="font-medium text-ink">Double-tap to add an expense</h3>
        <p className="mt-1 text-sm leading-relaxed text-dim">
          Open the expense form with a tap on the back of your iPhone. Name, amount,
          currency and category stay together on one screen. No dictation or token needed.
        </p>
      </div>
      <a href={ADD_EXPENSE_SHORTCUT_PATH} className="primary-button inline-flex items-center justify-center">
        Download iPhone Shortcut
      </a>
      <ol className="list-decimal space-y-3 pl-5 text-sm leading-relaxed text-dim">
        <li>On your iPhone, download the file, open it from Safari Downloads or Files, then tap <strong className="text-ink">Add Shortcut</strong>.</li>
        <li>Run <strong className="text-ink">Add OurPool Expense</strong> once. It opens OurPool in your browser. Sign in there if asked; the form opens after sign-in.</li>
        <li>Go to <strong className="text-ink">Settings → Accessibility → Touch → Back Tap → Double Tap</strong> and select <strong className="text-ink">Add OurPool Expense</strong>.</li>
      </ol>
      <p className="text-xs leading-relaxed text-mute">
        Currency defaults to your household currency; the date defaults to today.
        You still tap Save expense to log it. Internet access is needed, and your phone
        may ask you to unlock. An installed home-screen app may have a separate sign-in
        from your browser. This download opens the live app at ourpool.vercel.app.
      </p>
      <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
        {/* Full navigation: /add sets a one-shot cookie and must never be prefetched. */}
        <a href="/add" className="inline-flex min-h-11 items-center text-mint underline-offset-4 hover:underline">Try the direct form link</a>
        <a href="https://support.apple.com/en-us/111772" target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center text-dim underline-offset-4 hover:underline">Apple’s Back Tap guide ↗</a>
      </div>
      <details className="border-t border-hairline pt-3 text-sm text-dim">
        <summary className="min-h-11 cursor-pointer py-2 text-ink">Prefer to create it yourself?</summary>
        <p className="mt-1 leading-relaxed">
          In Shortcuts, tap + and add Open URLs. Set the URL to
          {" "}<code className="break-all text-mint">https://ourpool.vercel.app/add</code>{" "}
          and name it Add OurPool Expense. Then assign it to Back Tap using step 3 above.
          You can also run it from Siri or assign it to the Action Button on supported iPhones.
        </p>
      </details>
    </div>
  );
}
