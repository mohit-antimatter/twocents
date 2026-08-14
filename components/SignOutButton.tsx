"use client";

import { useRouter } from "next/navigation";

export default function SignOutButton() {
  const router = useRouter();
  return (
    <button
      onClick={async () => {
        await fetch("/api/auth/logout", { method: "POST" });
        router.push("/login");
        router.refresh();
      }}
      className="rounded-xl border border-hairline px-4 py-2.5 text-sm text-dim transition-colors hover:border-danger/40 hover:text-danger"
    >
      Sign out
    </button>
  );
}
