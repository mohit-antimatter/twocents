import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { deleteExpense, updateExpense } from "@/lib/expenses";
import { listCategories } from "@/lib/categories";
import { validateExpenseEdit } from "@/lib/validation";

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

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user?.householdId) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const { id } = await params;
  return statusResponse(await deleteExpense(id, user.householdId, user.id));
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user?.householdId) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const rawBody = (await req.json()) as unknown;
  if (!rawBody || typeof rawBody !== "object" || Array.isArray(rawBody)) {
    return NextResponse.json({ error: "Invalid expense details." }, { status: 400 });
  }
  const body = rawBody as Record<string, unknown>;
  const categories = await listCategories(user.householdId);
  const validation = validateExpenseEdit(body, categories.map((category) => category.id));
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  const { id } = await params;
  const result = await updateExpense(
    id,
    user.householdId,
    user.id,
    validation.value
  );
  return statusResponse(result);
}
