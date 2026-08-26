import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import {
  GOOGLE_MODE_COOKIE,
  GOOGLE_NONCE_COOKIE,
  GOOGLE_STATE_COOKIE,
  GOOGLE_VERIFIER_COOKIE,
  createGoogleAuthorization,
  googleCookieOptions,
  googleCredentials,
  googleRedirectUri,
} from "@/lib/google-auth";

export async function GET(request: Request) {
  try {
    const mode = new URL(request.url).searchParams.get("mode") === "link" ? "link" : "signin";
    if (mode === "link" && !(await getSessionUser())) {
      return NextResponse.redirect(new URL("/login?google=signin-first", request.url));
    }
    const { clientId } = googleCredentials();
    const auth = createGoogleAuthorization(clientId, googleRedirectUri(request));
    const response = NextResponse.redirect(auth.authorizationUrl);
    response.headers.set("Cache-Control", "no-store");
    const options = googleCookieOptions();
    response.cookies.set(GOOGLE_STATE_COOKIE, auth.state, options);
    response.cookies.set(GOOGLE_NONCE_COOKIE, auth.nonce, options);
    response.cookies.set(GOOGLE_VERIFIER_COOKIE, auth.verifier, options);
    response.cookies.set(GOOGLE_MODE_COOKIE, mode, options);
    return response;
  } catch {
    return NextResponse.redirect(new URL("/login?google=unavailable", request.url));
  }
}
