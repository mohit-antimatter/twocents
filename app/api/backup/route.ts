import { getSessionUser } from "@/lib/auth";
import { backupFilename, createHouseholdBackup } from "@/lib/backup";
import { getHousehold } from "@/lib/expenses";
import { localToday } from "@/lib/parse";
import { materializeDueRecurring } from "@/lib/recurring";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return Response.json(
      { error: "Not signed in." },
      { status: 401, headers: { "Cache-Control": "no-store" } }
    );
  }
  if (!user.householdId) {
    return Response.json(
      { error: "Finish household setup first." },
      { status: 409, headers: { "Cache-Control": "no-store" } }
    );
  }

  const today = localToday();
  await materializeDueRecurring(user.householdId, today);
  const [household, backup] = await Promise.all([
    getHousehold(user.householdId),
    createHouseholdBackup(user.householdId),
  ]);
  return new Response(JSON.stringify(backup, null, 2), {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Disposition": `attachment; filename="${backupFilename(household.name, today)}"`,
      "Content-Type": "application/json; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
