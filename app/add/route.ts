import { NextResponse } from "next/server";
import { ADD_EXPENSE_INTENT_COOKIE } from "@/lib/shortcut";

export const dynamic = "force-dynamic";

// A fixed destination prevents open redirects. The intent survives the existing
// login / Google / household setup flow, all of which finish on the Ledger.
export async function GET(request: Request) {
  const response = NextResponse.redirect(new URL("/", request.url), 303);
  response.headers.set("Cache-Control", "private, no-store");
  response.cookies.set(ADD_EXPENSE_INTENT_COOKIE, "1", {
    path: "/",
    maxAge: 600,
    sameSite: "lax",
    secure: new URL(request.url).protocol === "https:",
    // The form consumes this harmless flag once it opens, without changing auth.
    httpOnly: false,
  });
  return response;
}
