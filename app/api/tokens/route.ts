import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, createApiToken } from "@/lib/auth";

export async function GET() {
  const user = getSessionUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const tokens = db()
    .prepare(
      "SELECT id, label, created_at, last_used_at FROM api_tokens WHERE user_id = ? ORDER BY created_at DESC"
    )
    .all(user.id);
  return NextResponse.json({ tokens });
}

export async function POST(req: Request) {
  const user = getSessionUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const label = (body.label ?? "iPhone Shortcut").slice(0, 60);
  const token = createApiToken(user.id, label);
  // The plaintext token is returned exactly once; only its hash is stored.
  return NextResponse.json({ ok: true, token });
}
