import crypto from "node:crypto";

import { db, uid, type AppDatabase } from "./db";
import { hashPassword } from "./auth";

const GOOGLE_AUTHORIZATION_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_ENDPOINT = "https://openidconnect.googleapis.com/v1/userinfo";
const GOOGLE_ISSUERS = new Set(["https://accounts.google.com", "accounts.google.com"]);

export const GOOGLE_STATE_COOKIE = "tc_google_state";
export const GOOGLE_NONCE_COOKIE = "tc_google_nonce";
export const GOOGLE_VERIFIER_COOKIE = "tc_google_verifier";
export const GOOGLE_MODE_COOKIE = "tc_google_mode";

export type GoogleProfile = {
  subject: string;
  email: string;
  name: string;
};

export class GoogleAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GoogleAuthError";
  }
}

export class GoogleLinkRequiredError extends GoogleAuthError {
  constructor() {
    super("This email already has an OurPool account.");
    this.name = "GoogleLinkRequiredError";
  }
}

export function googleCookieOptions(
  isProduction = process.env.NODE_ENV === "production"
) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: isProduction,
    path: "/api/auth/google",
    maxAge: 10 * 60,
  };
}

export function googleCredentials() {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    throw new GoogleAuthError("Google sign-in is not configured.");
  }
  return { clientId, clientSecret };
}

export function googleRedirectUri(request: Request): string {
  const requestOrigin = new URL(request.url).origin;
  const configuredOrigin = process.env.APP_URL?.trim();
  let origin: URL;
  try {
    origin = new URL(configuredOrigin || requestOrigin);
  } catch {
    throw new GoogleAuthError("APP_URL is not a valid URL.");
  }
  if (!new Set(["http:", "https:"]).has(origin.protocol)) {
    throw new GoogleAuthError("APP_URL must use HTTP or HTTPS.");
  }
  if (process.env.NODE_ENV === "production" && origin.protocol !== "https:") {
    throw new GoogleAuthError("APP_URL must use HTTPS in production.");
  }
  return new URL("/api/auth/google/callback", origin.origin).toString();
}

function randomBase64Url(bytes = 32): string {
  return crypto.randomBytes(bytes).toString("base64url");
}

function sha256Base64Url(value: string): string {
  return crypto.createHash("sha256").update(value).digest("base64url");
}

export function createGoogleAuthorization(clientId: string, redirectUri: string) {
  const state = randomBase64Url();
  const nonce = randomBase64Url();
  const verifier = randomBase64Url(48);
  const url = new URL(GOOGLE_AUTHORIZATION_ENDPOINT);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", state);
  url.searchParams.set("nonce", nonce);
  url.searchParams.set("code_challenge", sha256Base64Url(verifier));
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("prompt", "select_account");
  return { authorizationUrl: url.toString(), state, nonce, verifier };
}

function stringsEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

export function verifyGoogleState(expected: string | undefined, received: string | null): boolean {
  return Boolean(expected && received && stringsEqual(expected, received));
}

type GoogleIdTokenClaims = {
  iss?: unknown;
  aud?: unknown;
  sub?: unknown;
  email?: unknown;
  email_verified?: unknown;
  name?: unknown;
  nonce?: unknown;
  exp?: unknown;
  iat?: unknown;
};

function decodeTokenClaims(idToken: string): GoogleIdTokenClaims {
  const parts = idToken.split(".");
  if (parts.length !== 3) throw new GoogleAuthError("Google returned an invalid identity token.");
  try {
    return JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as GoogleIdTokenClaims;
  } catch {
    throw new GoogleAuthError("Google returned an invalid identity token.");
  }
}

/**
 * The token is decoded only after it arrives directly from Google's HTTPS token
 * endpoint in a client-secret-authenticated code exchange. It is never accepted
 * from the browser or another app component.
 */
export function validateGoogleIdToken(
  idToken: string,
  clientId: string,
  expectedNonce: string,
  nowSeconds = Math.floor(Date.now() / 1000)
): GoogleProfile {
  const claims = decodeTokenClaims(idToken);
  const audienceMatches =
    claims.aud === clientId ||
    (Array.isArray(claims.aud) && claims.aud.some((audience) => audience === clientId));
  const emailVerified = claims.email_verified === true || claims.email_verified === "true";

  if (
    typeof claims.iss !== "string" ||
    !GOOGLE_ISSUERS.has(claims.iss) ||
    !audienceMatches ||
    typeof claims.exp !== "number" ||
    claims.exp <= nowSeconds ||
    (typeof claims.iat === "number" && claims.iat > nowSeconds + 300) ||
    typeof claims.nonce !== "string" ||
    !stringsEqual(claims.nonce, expectedNonce) ||
    typeof claims.sub !== "string" ||
    !claims.sub ||
    claims.sub.length > 255 ||
    typeof claims.email !== "string" ||
    !emailVerified
  ) {
    throw new GoogleAuthError("Google could not verify this account.");
  }

  const email = claims.email.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new GoogleAuthError("Google did not return a valid email address.");
  }
  const claimedName = typeof claims.name === "string" ? claims.name.trim() : "";
  const name = (claimedName || email.split("@")[0] || "Partner").slice(0, 80);
  return { subject: claims.sub, email, name };
}

type GoogleTokenResponse = {
  access_token?: unknown;
  id_token?: unknown;
};

type GoogleUserInfo = {
  sub?: unknown;
  email?: unknown;
  email_verified?: unknown;
};

export async function exchangeGoogleCode(input: {
  code: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  verifier: string;
  nonce: string;
}): Promise<GoogleProfile> {
  const body = new URLSearchParams({
    code: input.code,
    client_id: input.clientId,
    client_secret: input.clientSecret,
    redirect_uri: input.redirectUri,
    grant_type: "authorization_code",
    code_verifier: input.verifier,
  });
  const tokenResponse = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  }).catch(() => null);
  if (!tokenResponse?.ok) throw new GoogleAuthError("Google sign-in could not be completed.");
  const tokens = (await tokenResponse.json().catch(() => null)) as GoogleTokenResponse | null;
  if (typeof tokens?.id_token !== "string" || typeof tokens.access_token !== "string") {
    throw new GoogleAuthError("Google returned an incomplete sign-in response.");
  }

  const profile = validateGoogleIdToken(tokens.id_token, input.clientId, input.nonce);
  const userInfoResponse = await fetch(GOOGLE_USERINFO_ENDPOINT, {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  }).catch(() => null);
  if (!userInfoResponse?.ok) throw new GoogleAuthError("Google account details could not be verified.");
  const userInfo = (await userInfoResponse.json().catch(() => null)) as GoogleUserInfo | null;
  const userInfoEmail = typeof userInfo?.email === "string" ? userInfo.email.trim().toLowerCase() : "";
  const userInfoVerified = userInfo?.email_verified === true || userInfo?.email_verified === "true";
  if (userInfo?.sub !== profile.subject || userInfoEmail !== profile.email || !userInfoVerified) {
    throw new GoogleAuthError("Google account details did not match.");
  }
  return profile;
}

export async function findOrCreateGoogleUser(
  profile: GoogleProfile,
  database: AppDatabase = db()
): Promise<{ id: string; created: boolean }> {
  return database.transaction(async (client) => {
    const linked = (
      await client.query<{ id: string }>(
        `SELECT u.id
         FROM auth_identities i JOIN users u ON u.id = i.user_id
         WHERE i.provider = 'google' AND i.provider_user_id = $1`,
        [profile.subject]
      )
    ).rows[0];
    if (linked) return { id: linked.id, created: false };

    const existing = (
      await client.query<{ id: string }>("SELECT id FROM users WHERE email = $1", [profile.email])
    ).rows[0];
    if (existing) throw new GoogleLinkRequiredError();

    const userId = uid();
    const unusablePassword = hashPassword(randomBase64Url(48));
    await client.query(
      `INSERT INTO users (id, email, name, password_hash, created_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [userId, profile.email, profile.name, unusablePassword, Date.now()]
    );
    await client.query(
      `INSERT INTO auth_identities (provider, provider_user_id, user_id, created_at)
       VALUES ('google', $1, $2, $3)`,
      [profile.subject, userId, Date.now()]
    );
    return { id: userId, created: true };
  });
}

export async function linkGoogleIdentity(
  userId: string,
  userEmail: string,
  profile: GoogleProfile,
  database: AppDatabase = db()
): Promise<void> {
  if (profile.email !== userEmail.trim().toLowerCase()) {
    throw new GoogleAuthError("Choose the Google account that uses your OurPool email.");
  }
  await database.transaction(async (client) => {
    const subjectOwner = (
      await client.query<{ user_id: string }>(
        `SELECT user_id FROM auth_identities
         WHERE provider = 'google' AND provider_user_id = $1`,
        [profile.subject]
      )
    ).rows[0];
    if (subjectOwner && subjectOwner.user_id !== userId) {
      throw new GoogleAuthError("That Google account is already connected elsewhere.");
    }
    const current = (
      await client.query<{ provider_user_id: string }>(
        `SELECT provider_user_id FROM auth_identities
         WHERE provider = 'google' AND user_id = $1`,
        [userId]
      )
    ).rows[0];
    if (current && current.provider_user_id !== profile.subject) {
      throw new GoogleAuthError("A different Google account is already connected.");
    }
    if (!current && !subjectOwner) {
      await client.query(
        `INSERT INTO auth_identities (provider, provider_user_id, user_id, created_at)
         VALUES ('google', $1, $2, $3)`,
        [profile.subject, userId, Date.now()]
      );
    }
  });
}

export async function hasGoogleIdentity(
  userId: string,
  database: AppDatabase = db()
): Promise<boolean> {
  const result = await database.query<{ connected: number }>(
    `SELECT 1 AS connected FROM auth_identities
     WHERE provider = 'google' AND user_id = $1 LIMIT 1`,
    [userId]
  );
  return result.rows.length > 0;
}
