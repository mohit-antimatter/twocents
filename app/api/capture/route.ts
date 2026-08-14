import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getHousehold, createExpenseFromParsed } from "@/lib/expenses";
import { listCategories } from "@/lib/categories";
import { parseExpenseText, localToday } from "@/lib/parse";

export async function POST(req: Request) {
  const user = getSessionUser();
  if (!user?.householdId) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { text, source } = await req.json();
  if (!text?.trim()) return NextResponse.json({ error: "Nothing to parse." }, { status: 400 });

  const hh = getHousehold(user.householdId);
  const categories = listCategories(user.householdId).map((c) => c.name);
  const parsed = parseExpenseText(text.trim(), {
    categories,
    homeCurrency: hh.home_currency,
    today: localToday(),
  });

  if (!parsed.amount) {
    return NextResponse.json(
      { error: "Couldn't find an amount in that. Try e.g. “swiggy 450”." },
      { status: 422 }
    );
  }

  const { id, summary } = createExpenseFromParsed({
    householdId: user.householdId,
    userId: user.id,
    parsed,
    source: source === "voice" ? "voice" : "web",
    rawInput: text.trim(),
  });

  return NextResponse.json({ ok: true, id, summary });
}
