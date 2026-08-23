import crypto from "crypto";

import { seedCategories } from "./categories";
import { db, uid } from "./db";
import { CURRENCIES } from "./money";

export type HouseholdError =
  | "already_member"
  | "invalid_input"
  | "not_found"
  | "full"
  | "forbidden";

export type HouseholdResult =
  | { ok: true; householdId: string; inviteCode: string }
  | { ok: false; error: HouseholdError };

const MAX_HOUSEHOLD_NAME = 80;

export function createHousehold(
  userId: string,
  input: { name: unknown; homeCurrency: unknown }
): HouseholdResult {
  const name = typeof input.name === "string" ? input.name.trim() : "";
  const homeCurrency = typeof input.homeCurrency === "string" ? input.homeCurrency : "";
  if (name.length > MAX_HOUSEHOLD_NAME || !CURRENCIES[homeCurrency]) {
    return { ok: false, error: "invalid_input" };
  }

  const database = db();
  return database.transaction(() => {
    if (membershipForUser(userId)) return { ok: false, error: "already_member" } as const;

    const householdId = uid();
    const inviteCode = freshInviteCode();
    database
      .prepare(
        "INSERT INTO households (id, name, home_currency, invite_code, created_at) VALUES (?, ?, ?, ?, ?)"
      )
      .run(householdId, name || "Our Household", homeCurrency, inviteCode, Date.now());
    database
      .prepare(
        "INSERT INTO household_members (household_id, user_id, role, joined_at) VALUES (?, ?, 'owner', ?)"
      )
      .run(householdId, userId, Date.now());
    seedCategories(householdId);
    return { ok: true, householdId, inviteCode } as const;
  }).immediate();
}

export function joinHousehold(userId: string, rawCode: unknown): HouseholdResult {
  const code = typeof rawCode === "string" ? rawCode.trim().toUpperCase() : "";
  if (!/^[0-9A-F]{8}$/.test(code)) return { ok: false, error: "not_found" };

  const database = db();
  return database.transaction(() => {
    if (membershipForUser(userId)) return { ok: false, error: "already_member" } as const;

    const household = database
      .prepare("SELECT id FROM households WHERE invite_code = ?")
      .get(code) as { id: string } | undefined;
    if (!household) return { ok: false, error: "not_found" } as const;

    const memberCount = database
      .prepare("SELECT COUNT(*) AS count FROM household_members WHERE household_id = ?")
      .get(household.id) as { count: number };
    if (memberCount.count >= 2) return { ok: false, error: "full" } as const;

    database
      .prepare(
        "INSERT INTO household_members (household_id, user_id, role, joined_at) VALUES (?, ?, 'member', ?)"
      )
      .run(household.id, userId, Date.now());

    // Invite codes are single-use. A successful join invalidates the shared secret.
    const inviteCode = freshInviteCode();
    database
      .prepare("UPDATE households SET invite_code = ? WHERE id = ?")
      .run(inviteCode, household.id);
    return { ok: true, householdId: household.id, inviteCode } as const;
  }).immediate();
}

export function rotateHouseholdInvite(
  householdId: string,
  userId: string
): HouseholdResult {
  const database = db();
  return database.transaction(() => {
    const membership = database
      .prepare(
        "SELECT role FROM household_members WHERE household_id = ? AND user_id = ?"
      )
      .get(householdId, userId) as { role: string } | undefined;
    if (membership?.role !== "owner") return { ok: false, error: "forbidden" } as const;

    const inviteCode = freshInviteCode();
    database
      .prepare("UPDATE households SET invite_code = ? WHERE id = ?")
      .run(inviteCode, householdId);
    return { ok: true, householdId, inviteCode } as const;
  }).immediate();
}

function membershipForUser(userId: string): { household_id: string } | undefined {
  return db()
    .prepare("SELECT household_id FROM household_members WHERE user_id = ? LIMIT 1")
    .get(userId) as { household_id: string } | undefined;
}

function freshInviteCode(): string {
  const database = db();
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = crypto.randomBytes(4).toString("hex").toUpperCase();
    const existing = database
      .prepare("SELECT 1 FROM households WHERE invite_code = ?")
      .get(code);
    if (!existing) return code;
  }
  throw new Error("Couldn't generate a unique household invite code.");
}
