import { NextResponse } from "next/server";
import { getUserFromToken } from "@/lib/auth";
import { getHousehold, createExpenseFromParsed } from "@/lib/expenses";
import { listCategories } from "@/lib/categories";
import { parseExpenseText, parsedExpenseError, localToday } from "@/lib/parse";

// The iPhone Shortcuts / Siri endpoint. Authenticated with a personal API
// token (Bearer). Accepts JSON {"text": "..."} from a dictation shortcut.
// Returns {"message": "₹450 · 🍜 Food & Drinks · Swiggy ✓"} for the
// shortcut's confirmation notification.

export async function POST(req: Request) {
  const user = getUserFromToken(req.headers.get("authorization"));
  if (!user) {
    return NextResponse.json({ message: "Invalid token — regenerate it in Settings." }, { status: 401 });
  }
  if (!user.householdId) {
    return NextResponse.json({ message: "Finish household setup in the app first." }, { status: 409 });
  }

  const hh = getHousehold(user.householdId);
  const categories = listCategories(user.householdId).map((c) => c.name);
  const ctx = { categories, homeCurrency: hh.home_currency, today: localToday() };

  try {
    const { text } = await req.json();
    if (typeof text !== "string" || !text.trim()) {
      return NextResponse.json({ message: "Nothing heard — try again." }, { status: 400 });
    }
    const parsed = parseExpenseText(text.trim(), ctx);
    const parseError = parsedExpenseError(parsed);
    if (parseError) return NextResponse.json({ message: parseError }, { status: 422 });
    const { summary } = createExpenseFromParsed({
      householdId: user.householdId,
      userId: user.id,
      parsed,
      source: "shortcut",
      rawInput: text.trim(),
    });
    return NextResponse.json({ message: summary });
  } catch {
    return NextResponse.json({ message: "Something went wrong — try again." }, { status: 500 });
  }
}
