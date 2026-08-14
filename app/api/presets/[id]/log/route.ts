import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { logPreset } from "@/lib/expenses";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const user = getSessionUser();
  if (!user?.householdId) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const result = logPreset(params.id, user.householdId, user.id);
  return result
    ? NextResponse.json({ ok: true, ...result })
    : NextResponse.json({ error: "Preset not found." }, { status: 404 });
}
