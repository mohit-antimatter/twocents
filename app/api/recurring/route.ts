import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { localToday } from "@/lib/parse";
import { createRecurringRule, materializeDueRecurring } from "@/lib/recurring";

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user?.householdId) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ error: "Check the recurring expense details." }, { status: 400 });
  }
  if (!rawBody || typeof rawBody !== "object" || Array.isArray(rawBody)) {
    return NextResponse.json({ error: "Check the recurring expense details." }, { status: 400 });
  }

  const today = localToday();
  const result = createRecurringRule(
    user.householdId,
    user.id,
    rawBody as Record<string, unknown>,
    today
  );
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  const logged = materializeDueRecurring(user.householdId, today);
  return NextResponse.json({ ok: true, id: result.id, logged });
}
