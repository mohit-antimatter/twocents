import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { listPresets, createPreset } from "@/lib/expenses";

export async function GET() {
  const user = await getSessionUser();
  if (!user?.householdId) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  return NextResponse.json({ presets: await listPresets(user.householdId) });
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user?.householdId) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const body = await req.json();
  const amount = Number(body.amount);
  if (!body.label?.trim() || !amount || amount <= 0) {
    return NextResponse.json({ error: "A label and a positive amount are required." }, { status: 400 });
  }
  const preset = await createPreset({
    householdId: user.householdId,
    label: body.label.trim(),
    emoji: (body.emoji ?? "⚡").slice(0, 4) || "⚡",
    amountMinor: Math.round(amount * 100),
    currency: body.currency ?? "INR",
    categoryId: body.categoryId ?? null,
  });
  return NextResponse.json({ ok: true, preset });
}
