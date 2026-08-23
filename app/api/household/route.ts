import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import {
  createHousehold,
  joinHousehold,
  rotateHouseholdInvite,
  type HouseholdResult,
} from "@/lib/households";

function resultResponse(result: HouseholdResult) {
  if (result.ok) {
    return NextResponse.json({ ok: true, inviteCode: result.inviteCode });
  }
  if (result.error === "already_member") {
    return NextResponse.json({ error: "You already belong to a household." }, { status: 409 });
  }
  if (result.error === "not_found") {
    return NextResponse.json({ error: "No household found for that code." }, { status: 404 });
  }
  if (result.error === "full") {
    return NextResponse.json({ error: "That household already has two people." }, { status: 409 });
  }
  if (result.error === "forbidden") {
    return NextResponse.json({ error: "Only the household owner can replace the invite code." }, { status: 403 });
  }
  return NextResponse.json({ error: "Check the household name and currency." }, { status: 400 });
}

export async function POST(req: Request) {
  const user = getSessionUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const rawBody = (await req.json()) as unknown;
  if (!rawBody || typeof rawBody !== "object" || Array.isArray(rawBody)) {
    return NextResponse.json({ error: "Invalid household request." }, { status: 400 });
  }
  const body = rawBody as Record<string, unknown>;

  if (body.action === "create") {
    return resultResponse(
      createHousehold(user.id, { name: body.name, homeCurrency: body.homeCurrency })
    );
  }

  if (body.action === "join") {
    return resultResponse(joinHousehold(user.id, body.code));
  }

  if (body.action === "rotate") {
    if (!user.householdId) {
      return NextResponse.json({ error: "Finish household setup first." }, { status: 409 });
    }
    return resultResponse(rotateHouseholdInvite(user.householdId, user.id));
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
