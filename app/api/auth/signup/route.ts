import { NextResponse } from "next/server";
import { db, uid } from "@/lib/db";
import { hashPassword, createSession } from "@/lib/auth";

export async function POST(req: Request) {
  const { name, email, password } = await req.json();
  if (!name?.trim() || !email?.trim() || !password || password.length < 8) {
    return NextResponse.json(
      { error: "Name, email, and a password of at least 8 characters are required." },
      { status: 400 }
    );
  }
  const existing = db().prepare("SELECT id FROM users WHERE email = ?").get(email.toLowerCase());
  if (existing) {
    return NextResponse.json({ error: "An account with that email already exists." }, { status: 409 });
  }
  const id = uid();
  db()
    .prepare("INSERT INTO users (id, email, name, password_hash, created_at) VALUES (?, ?, ?, ?, ?)")
    .run(id, email.toLowerCase(), name.trim(), hashPassword(password), Date.now());
  createSession(id);
  return NextResponse.json({ ok: true });
}
