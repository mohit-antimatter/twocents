import { getSessionUser } from "@/lib/auth";
import { BackupValidationError, replaceHouseholdFromBackup } from "@/lib/backup";
import { isHouseholdOwner } from "@/lib/households";

const MAX_BACKUP_BYTES = 10 * 1024 * 1024;

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
    return json({ error: "Only the household owner can import a backup." }, 403);
  }
  if (request.headers.get("x-twocents-confirmation") !== "IMPORT") {
    return json({ error: "Type IMPORT to confirm." }, 400);
  }
  if (request.headers.get("content-type")?.split(";")[0] !== "application/json") {
    return json({ error: "Choose an OurPool JSON backup." }, 415);
  }
  const declaredSize = Number(request.headers.get("content-length") ?? 0);
  if (declaredSize > MAX_BACKUP_BYTES) {
    return json({ error: "That backup is larger than 10 MB." }, 413);
  }
  const body = await request.text();
  if (Buffer.byteLength(body, "utf8") > MAX_BACKUP_BYTES) {
    return json({ error: "That backup is larger than 10 MB." }, 413);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return json({ error: "That file is not valid JSON." }, 400);
  }

  try {
    const counts = await replaceHouseholdFromBackup(user.householdId, parsed);
    return json({ ok: true, counts });
  } catch (error) {
    if (error instanceof BackupValidationError) {
      return json({ error: error.message }, 400);
    }
    throw error;
  }
}
