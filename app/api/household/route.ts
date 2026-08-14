import { NextResponse } from "next/server";
import crypto from "crypto";
import { db, uid } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { seedCategories } from "@/lib/categories";
import { CURRENCIES } from "@/lib/money";

export async function POST(req: Request) {
  const user = getSessionUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (user.householdId) {
    return NextResponse.json({ error: "You already belong to a household." }, { status: 409 });
  }
  const body = await req.json();

  if (body.action === "create") {
    const name = (body.name ?? "").trim() || "Our Household";
    const currency = CURRENCIES[body.homeCurrency] ? body.homeCurrency : "INR";
    const id = uid();
    const code = crypto.randomBytes(4).toString("hex").toUpperCase();
    db()
      .prepare(
        "INSERT INTO households (id, name, home_currency, invite_code, created_at) VALUES (?, ?, ?, ?, ?)"
      )
      .run(id, name, currency, code, Date.now());
    db()
      .prepare(
        "INSERT INTO household_members (household_id, user_id, role, joined_at) VALUES (?, ?, 'owner', ?)"
      )
      .run(id, user.id, Date.now());
    seedCategories(id);
    return NextResponse.json({ ok: true, inviteCode: code });
  }

  if (body.action === "join") {
    const code = (body.code ?? "").trim().toUpperCase();
    const hh = db()
      .prepare("SELECT id FROM households WHERE invite_code = ?")
      .get(code) as { id: string } | undefined;
    if (!hh) return NextResponse.json({ error: "No household found for that code." }, { status: 404 });
    db()
      .prepare(
        "INSERT INTO household_members (household_id, user_id, role, joined_at) VALUES (?, ?, 'member', ?)"
      )
      .run(hh.id, user.id, Date.now());
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
