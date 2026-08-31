import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { listCategories } from "@/lib/categories";
import { createExpenseFromFields } from "@/lib/expenses";
import { validateExpenseEdit } from "@/lib/validation";

const json = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user?.householdId) return json({ error: "Not signed in." }, 401);

  const body: unknown = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return json({ error: "Enter the expense details." }, 400);
  }
  const input = body as Record<string, unknown>;
  if (typeof input.requestId !== "string" || !/^[0-9a-f-]{36}$/i.test(input.requestId)) {
    return json({ error: "Invalid request ID." }, 400);
  }
  if (typeof input.merchant !== "string" || !input.merchant.trim()) {
    return json({ error: "Enter an expense name." }, 422);
  }
  if (typeof input.amount !== "number" || Math.round(input.amount * 100) < 1) {
    return json({ error: "Enter an amount of at least 0.01." }, 422);
  }
  const categories = await listCategories(user.householdId);
  const validated = validateExpenseEdit(input, categories.map((category) => category.id));
  if (!validated.ok) return json({ error: validated.error }, 422);

  const result = await createExpenseFromFields({
    householdId: user.householdId,
    userId: user.id,
    fields: validated.value,
    requestId: input.requestId,
  });
  return json({ ok: true, ...result }, result.created ? 201 : 200);
}
