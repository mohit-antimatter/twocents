import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const { id } = await params;
  const res = db()
    .prepare("DELETE FROM api_tokens WHERE id = ? AND user_id = ?")
    .run(id, user.id);
  return res.changes > 0
    ? NextResponse.json({ ok: true })
    : NextResponse.json({ error: "Not found." }, { status: 404 });
}
