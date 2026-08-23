import { NextResponse } from "next/server";

import { destroyAllSessions, getSessionUser } from "@/lib/auth";

export async function DELETE() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  await destroyAllSessions(user.id);
  return NextResponse.json({ ok: true });
}
