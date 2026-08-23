import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyPassword, createSession } from "@/lib/auth";
import {
  RATE_LIMITS,
  clearRateLimit,
  clientAddress,
  consumeRateLimit,
  rateLimitHeaders,
} from "@/lib/rate-limit";

const DUMMY_PASSWORD_HASH = "$2b$10$GGfbQDY.BiporamOTfB9oOTGHOKiY7D4yYACf4O1ZMFajZEHGpjBy";

export async function POST(req: Request) {
  const address = clientAddress(req);
  const addressLimit = consumeRateLimit("login-address", address, RATE_LIMITS.loginByAddress);
  if (!addressLimit.allowed) {
    return NextResponse.json(
      { error: "Too many sign-in attempts. Try again in a few minutes." },
      { status: 429, headers: rateLimitHeaders(addressLimit) }
    );
  }

  const rawBody = await req.json().catch(() => null) as unknown;
  if (!rawBody || typeof rawBody !== "object" || Array.isArray(rawBody)) {
    return NextResponse.json({ error: "Enter your email and password." }, { status: 400 });
  }
  const body = rawBody as Record<string, unknown>;
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!email || email.length > 254 || !password || password.length > 128) {
    return NextResponse.json({ error: "Enter your email and password." }, { status: 400 });
  }

  const accountKey = `${address}\0${email}`;
  const accountLimit = consumeRateLimit(
    "login-account-address",
    accountKey,
    RATE_LIMITS.loginByAccountAndAddress
  );
  if (!accountLimit.allowed) {
    return NextResponse.json(
      { error: "Too many sign-in attempts. Try again in a few minutes." },
      { status: 429, headers: rateLimitHeaders(accountLimit) }
    );
  }

  const user = db()
    .prepare("SELECT id, password_hash FROM users WHERE email = ?")
    .get(email) as { id: string; password_hash: string } | undefined;
  const passwordMatches = verifyPassword(password, user?.password_hash ?? DUMMY_PASSWORD_HASH);
  if (!user || !passwordMatches) {
    return NextResponse.json({ error: "Wrong email or password." }, { status: 401 });
  }
  clearRateLimit("login-account-address", accountKey);
  await createSession(user.id);
  return NextResponse.json({ ok: true });
}
