import { getSessionUser } from "@/lib/auth";
import { expensesToCsv, exportFilename } from "@/lib/export";
import { getHousehold, listExpensesForExport } from "@/lib/expenses";
import { localToday } from "@/lib/parse";

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

  const household = getHousehold(user.householdId);
  const csv = expensesToCsv(
    listExpensesForExport(user.householdId),
    household.home_currency
  );
  const filename = exportFilename(household.name, localToday());

  return new Response(csv, {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Type": "text/csv; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
