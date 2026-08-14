import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { deleteExpense, updateExpense } from "@/lib/expenses";
import { CURRENCIES } from "@/lib/money";

function statusResponse(result: "ok" | "not_found" | "forbidden") {
  if (result === "ok") return NextResponse.json({ ok: true });
  if (result === "forbidden") {
    return NextResponse.json(
      { error: "Only the person who logged an expense can change it." },
      { status: 403 }
    );
  }
  return NextResponse.json({ error: "Not found." }, { status: 404 });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const user = getSessionUser();
  if (!user?.householdId) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  return statusResponse(deleteExpense(params.id, user.householdId, user.id));
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const user = getSessionUser();
  if (!user?.householdId) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body = await req.json();
  const amount = Number(body.amount);
  if (!amount || amount <= 0) {
    return NextResponse.json({ error: "Amount must be a positive number." }, { status: 400 });
  }
  if (!CURRENCIES[body.currency]) {
    return NextResponse.json({ error: "Unknown currency." }, { status: 400 });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(body.spentOn ?? "")) {
    return NextResponse.json({ error: "Date must be YYYY-MM-DD." }, { status: 400 });
  }
  const spentTime =
    body.spentTime && /^\d{2}:\d{2}$/.test(body.spentTime) ? body.spentTime : null;

  const result = updateExpense(params.id, user.householdId, user.id, {
    amount,
    currency: body.currency,
    categoryId: body.categoryId || null,
    merchant: (body.merchant ?? "").trim() || null,
    note: (body.note ?? "").trim() || null,
    spentOn: body.spentOn,
    spentTime,
  });
  return statusResponse(result);
}
