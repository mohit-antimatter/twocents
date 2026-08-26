import { getSessionUser } from "@/lib/auth";
import { clearHouseholdFinancialData } from "@/lib/backup";
import { isHouseholdOwner } from "@/lib/households";

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return json({ error: "Not signed in." }, 401);
  }
  if (!user.householdId) {
    return json({ error: "Finish household setup first." }, 409);
  }
  if (!(await isHouseholdOwner(user.householdId, user.id))) {
    return json({ error: "Only the household owner can clear shared data." }, 403);
  }
  const body = (await request.json().catch(() => null)) as { confirmation?: unknown } | null;
  if (body?.confirmation !== "CLEAR") {
    return json({ error: "Type CLEAR to confirm." }, 400);
  }
  const counts = await clearHouseholdFinancialData(user.householdId);
  return json({ ok: true, counts });
}
