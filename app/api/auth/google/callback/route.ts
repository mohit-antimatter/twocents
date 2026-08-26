import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { createSession, getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  GOOGLE_NONCE_COOKIE,
  GOOGLE_MODE_COOKIE,
  GOOGLE_STATE_COOKIE,
  GOOGLE_VERIFIER_COOKIE,
  exchangeGoogleCode,
  findOrCreateGoogleUser,
  GoogleLinkRequiredError,
  googleCookieOptions,
  googleCredentials,
  googleRedirectUri,
  linkGoogleIdentity,
  verifyGoogleState,
} from "@/lib/google-auth";

function clearGoogleCookies(response: NextResponse) {
  const options = { ...googleCookieOptions(), maxAge: 0 };
  response.cookies.set(GOOGLE_STATE_COOKIE, "", options);
  response.cookies.set(GOOGLE_NONCE_COOKIE, "", options);
  response.cookies.set(GOOGLE_VERIFIER_COOKIE, "", options);
  response.cookies.set(GOOGLE_MODE_COOKIE, "", options);
  return response;
}

function loginRedirect(request: Request, reason: string) {
  return clearGoogleCookies(
    NextResponse.redirect(new URL(`/login?google=${encodeURIComponent(reason)}`, request.url))
  );
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  if (url.searchParams.get("error")) return loginRedirect(request, "cancelled");

  const cookieStore = await cookies();
  const expectedState = cookieStore.get(GOOGLE_STATE_COOKIE)?.value;
  const nonce = cookieStore.get(GOOGLE_NONCE_COOKIE)?.value;
  const verifier = cookieStore.get(GOOGLE_VERIFIER_COOKIE)?.value;
  const mode = cookieStore.get(GOOGLE_MODE_COOKIE)?.value === "link" ? "link" : "signin";
  const code = url.searchParams.get("code");
  if (!verifyGoogleState(expectedState, url.searchParams.get("state")) || !nonce || !verifier || !code) {
    return loginRedirect(request, "failed");
  }

  try {
    const { clientId, clientSecret } = googleCredentials();
    const profile = await exchangeGoogleCode({
      code,
      clientId,
      clientSecret,
      redirectUri: googleRedirectUri(request),
      verifier,
      nonce,
    });
    if (mode === "link") {
      const currentUser = await getSessionUser();
      if (!currentUser) return loginRedirect(request, "signin-first");
      await linkGoogleIdentity(currentUser.id, currentUser.email, profile);
      return clearGoogleCookies(
        NextResponse.redirect(new URL("/settings?google=connected", request.url))
      );
    }
    const user = await findOrCreateGoogleUser(profile);
    await createSession(user.id);
    const membership = (
      await db().query<{ household_id: string }>(
        "SELECT household_id FROM household_members WHERE user_id = $1 LIMIT 1",
        [user.id]
      )
    ).rows[0];
    return clearGoogleCookies(
      NextResponse.redirect(new URL(membership ? "/" : "/onboarding", request.url))
    );
  } catch (error) {
    console.error(
      "Google sign-in failed",
      error instanceof Error ? error.message : "Unknown Google sign-in error"
    );
    if (error instanceof GoogleLinkRequiredError) {
      return loginRedirect(request, "link-required");
    }
    if (mode === "link") {
      return clearGoogleCookies(
        NextResponse.redirect(new URL("/settings?google=failed", request.url))
      );
    }
    return loginRedirect(request, "failed");
  }
}
