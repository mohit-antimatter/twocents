import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getHousehold, createExpenseFromParsed } from "@/lib/expenses";
import { listCategories } from "@/lib/categories";
import { parseExpenseText, parsedExpenseError, localToday } from "@/lib/parse";

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user?.householdId) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { text, source, requestId } = await req.json();
  if (typeof text !== "string" || !text.trim()) {
    return NextResponse.json({ error: "Nothing to parse." }, { status: 400 });
  }
  if (
    requestId !== undefined &&
    (typeof requestId !== "string" || !/^[0-9a-f-]{36}$/i.test(requestId))
  ) {
    return NextResponse.json({ error: "Invalid request ID." }, { status: 400 });
  }

  const hh = getHousehold(user.householdId);
  const categories = listCategories(user.householdId).map((c) => c.name);
  const parsed = parseExpenseText(text.trim(), {
    categories,
    homeCurrency: hh.home_currency,
    today: localToday(),
  });

  const parseError = parsedExpenseError(parsed);
  if (parseError) return NextResponse.json({ error: parseError }, { status: 422 });

  const { id, summary, created } = createExpenseFromParsed({
    householdId: user.householdId,
    userId: user.id,
    parsed,
    source: source === "voice" ? "voice" : "web",
    rawInput: text.trim(),
    requestId: requestId ?? null,
  });

  return NextResponse.json({ ok: true, id, summary, created });
}
