import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { localToday } from "@/lib/parse";
import {
  deleteRecurringRule,
  materializeDueRecurring,
  setRecurringActive,
} from "@/lib/recurring";

function statusResponse(result: "ok" | "not_found" | "forbidden") {
  if (result === "ok") return null;
  if (result === "forbidden") {
    return NextResponse.json(
      { error: "Only the person who created this schedule can change it." },
      { status: 403 }
    );
  }
  return NextResponse.json({ error: "Not found." }, { status: 404 });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user?.householdId) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ error: "Choose pause or resume." }, { status: 400 });
  }
  if (!rawBody || typeof rawBody !== "object" || Array.isArray(rawBody)) {
    return NextResponse.json({ error: "Choose pause or resume." }, { status: 400 });
  }
  const active = (rawBody as Record<string, unknown>).active;
  if (typeof active !== "boolean") {
    return NextResponse.json({ error: "Choose pause or resume." }, { status: 400 });
  }

  const { id } = await params;
  const today = localToday();
  const result = setRecurringActive(id, user.householdId, user.id, active, today);
  const error = statusResponse(result);
  if (error) return error;
  const logged = active ? materializeDueRecurring(user.householdId, today) : 0;
  return NextResponse.json({ ok: true, logged });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user?.householdId) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  const { id } = await params;
  const result = deleteRecurringRule(id, user.householdId, user.id);
  const error = statusResponse(result);
  return error ?? NextResponse.json({ ok: true });
}
