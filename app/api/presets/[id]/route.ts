import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { deletePreset } from "@/lib/expenses";

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const user = getSessionUser();
  if (!user?.householdId) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const ok = deletePreset(params.id, user.householdId);
  return ok
    ? NextResponse.json({ ok: true })
    : NextResponse.json({ error: "Not found." }, { status: 404 });
}
