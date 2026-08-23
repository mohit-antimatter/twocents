import { NextResponse } from "next/server";
import { db, isUniqueViolation, uid } from "@/lib/db";
import { hashPassword, createSession } from "@/lib/auth";
import {
  RATE_LIMITS,
  clientAddress,
  consumeRateLimit,
  rateLimitHeaders,
} from "@/lib/rate-limit";

export async function POST(req: Request) {
  const limit = await consumeRateLimit(
    "signup-address",
    clientAddress(req),
    RATE_LIMITS.signupByAddress
  );
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many accounts created from this connection. Try again later." },
      { status: 429, headers: rateLimitHeaders(limit) }
    );
  }

  const rawBody = await req.json().catch(() => null) as unknown;
  if (!rawBody || typeof rawBody !== "object" || Array.isArray(rawBody)) {
    return NextResponse.json({ error: "Invalid account details." }, { status: 400 });
  }
  const body = rawBody as Record<string, unknown>;
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const validEmail = email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  if (!name || name.length > 80 || !validEmail || password.length < 8 || password.length > 128) {
    return NextResponse.json(
      { error: "Enter a name, a valid email, and a password between 8 and 128 characters." },
      { status: 400 }
    );
  }
  const existing = (
    await db().query<{ id: string }>("SELECT id FROM users WHERE email = $1", [email])
  ).rows[0];
  if (existing) {
    return NextResponse.json({ error: "An account with that email already exists." }, { status: 409 });
  }
  const id = uid();
  try {
    await db().query(
      `INSERT INTO users (id, email, name, password_hash, created_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [id, email, name, hashPassword(password), Date.now()]
    );
  } catch (error) {
    if (isUniqueViolation(error)) {
      return NextResponse.json(
        { error: "An account with that email already exists." },
        { status: 409 }
      );
    }
    throw error;
  }
  await createSession(id);
  return NextResponse.json({ ok: true });
}
