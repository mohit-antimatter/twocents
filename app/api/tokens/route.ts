import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, createApiToken } from "@/lib/auth";
import { RATE_LIMITS, consumeRateLimit, rateLimitHeaders } from "@/lib/rate-limit";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const tokens = (
    await db().query(
      `SELECT id, label, created_at, last_used_at
       FROM api_tokens WHERE user_id = $1 ORDER BY created_at DESC`,
      [user.id]
    )
  ).rows;
  return NextResponse.json({ tokens });
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const limit = await consumeRateLimit(
    "token-creation-user",
    user.id,
    RATE_LIMITS.tokenCreationByUser
  );
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many tokens generated. Try again later." },
      { status: 429, headers: rateLimitHeaders(limit) }
    );
  }
  const rawBody = await req.json().catch(() => ({})) as unknown;
  if (!rawBody || typeof rawBody !== "object" || Array.isArray(rawBody)) {
    return NextResponse.json({ error: "Invalid token details." }, { status: 400 });
  }
  const body = rawBody as Record<string, unknown>;
  if (body.label !== undefined && typeof body.label !== "string") {
    return NextResponse.json({ error: "Token label must be text." }, { status: 400 });
  }
  const label = (typeof body.label === "string" ? body.label.trim() : "") || "iPhone Shortcut";
  if (label.length > 60) {
    return NextResponse.json({ error: "Token label must be 60 characters or fewer." }, { status: 400 });
  }
  const tokenCount = (
    await db().query<{ count: number }>(
      "SELECT COUNT(*) AS count FROM api_tokens WHERE user_id = $1",
      [user.id]
    )
  ).rows[0];
  if (tokenCount.count >= 10) {
    return NextResponse.json(
      { error: "You can keep up to 10 active tokens. Revoke one before creating another." },
      { status: 409 }
    );
  }
  const token = await createApiToken(user.id, label);
  // The plaintext token is returned exactly once; only its hash is stored.
  return NextResponse.json({ ok: true, token });
}
