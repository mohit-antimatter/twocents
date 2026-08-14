import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyPassword, createSession } from "@/lib/auth";

export async function POST(req: Request) {
  const { email, password } = await req.json();
  const user = db()
    .prepare("SELECT id, password_hash FROM users WHERE email = ?")
    .get((email ?? "").toLowerCase()) as { id: string; password_hash: string } | undefined;
  if (!user || !verifyPassword(password ?? "", user.password_hash)) {
    return NextResponse.json({ error: "Wrong email or password." }, { status: 401 });
  }
  createSession(user.id);
  return NextResponse.json({ ok: true });
}
