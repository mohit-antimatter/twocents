import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { logPreset } from "@/lib/expenses";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user?.householdId) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const { id } = await params;
  const result = logPreset(id, user.householdId, user.id);
  return result
    ? NextResponse.json({ ok: true, ...result })
    : NextResponse.json({ error: "Preset not found." }, { status: 404 });
}
