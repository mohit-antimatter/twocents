import crypto from "crypto";

import { seedCategories } from "./categories";
import { db, uid, type Queryable } from "./db";
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

export async function createHousehold(
  userId: string,
  input: { name: unknown; homeCurrency: unknown }
): Promise<HouseholdResult> {
  const name = typeof input.name === "string" ? input.name.trim() : "";
  const homeCurrency = typeof input.homeCurrency === "string" ? input.homeCurrency : "";
  if (name.length > MAX_HOUSEHOLD_NAME || !CURRENCIES[homeCurrency]) {
    return { ok: false, error: "invalid_input" };
  }

  const database = db();
  return database.transaction(async (client) => {
    await client.query("SELECT id FROM users WHERE id = $1 FOR UPDATE", [userId]);
    if (await membershipForUser(userId, client)) {
      return { ok: false, error: "already_member" } as const;
    }

    const householdId = uid();
    const inviteCode = await freshInviteCode(client);
    await client.query(
      `INSERT INTO households (id, name, home_currency, invite_code, created_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [householdId, name || "Our Household", homeCurrency, inviteCode, Date.now()]
    );
    await client.query(
      `INSERT INTO household_members (household_id, user_id, role, joined_at)
       VALUES ($1, $2, 'owner', $3)`,
      [householdId, userId, Date.now()]
    );
    await seedCategories(householdId, client);
    return { ok: true, householdId, inviteCode } as const;
  });
}

export async function joinHousehold(
  userId: string,
  rawCode: unknown
): Promise<HouseholdResult> {
  const code = typeof rawCode === "string" ? rawCode.trim().toUpperCase() : "";
  if (!/^[0-9A-F]{8}$/.test(code)) return { ok: false, error: "not_found" };

  const database = db();
  return database.transaction(async (client) => {
    await client.query("SELECT id FROM users WHERE id = $1 FOR UPDATE", [userId]);
    if (await membershipForUser(userId, client)) {
      return { ok: false, error: "already_member" } as const;
    }

    const household = (
      await client.query<{ id: string }>(
        "SELECT id FROM households WHERE invite_code = $1 FOR UPDATE",
        [code]
      )
    ).rows[0];
    if (!household) return { ok: false, error: "not_found" } as const;

    const memberCount = (
      await client.query<{ count: number }>(
        "SELECT COUNT(*) AS count FROM household_members WHERE household_id = $1",
        [household.id]
      )
    ).rows[0];
    if (memberCount.count >= 2) return { ok: false, error: "full" } as const;

    await client.query(
      `INSERT INTO household_members (household_id, user_id, role, joined_at)
       VALUES ($1, $2, 'member', $3)`,
      [household.id, userId, Date.now()]
    );

    // Invite codes are single-use. A successful join invalidates the shared secret.
    const inviteCode = await freshInviteCode(client);
    await client.query("UPDATE households SET invite_code = $1 WHERE id = $2", [
      inviteCode,
      household.id,
    ]);
    return { ok: true, householdId: household.id, inviteCode } as const;
  });
}

export async function rotateHouseholdInvite(
  householdId: string,
  userId: string
): Promise<HouseholdResult> {
  const database = db();
  return database.transaction(async (client) => {
    const membership = (
      await client.query<{ role: string }>(
        `SELECT role FROM household_members
         WHERE household_id = $1 AND user_id = $2 FOR UPDATE`,
        [householdId, userId]
      )
    ).rows[0];
    if (membership?.role !== "owner") return { ok: false, error: "forbidden" } as const;

    const inviteCode = await freshInviteCode(client);
    await client.query("UPDATE households SET invite_code = $1 WHERE id = $2", [
      inviteCode,
      householdId,
    ]);
    return { ok: true, householdId, inviteCode } as const;
  });
}

export async function isHouseholdOwner(
  householdId: string,
  userId: string,
  database: Queryable = db()
): Promise<boolean> {
  const membership = (
    await database.query<{ role: string }>(
      `SELECT role FROM household_members
       WHERE household_id = $1 AND user_id = $2`,
      [householdId, userId]
    )
  ).rows[0];
  return membership?.role === "owner";
}

async function membershipForUser(
  userId: string,
  database: Queryable
): Promise<{ household_id: string } | undefined> {
  return (
    await database.query<{ household_id: string }>(
      "SELECT household_id FROM household_members WHERE user_id = $1 LIMIT 1",
      [userId]
    )
  ).rows[0];
}

async function freshInviteCode(database: Queryable): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = crypto.randomBytes(4).toString("hex").toUpperCase();
    const existing = (
      await database.query<{ exists: number }>(
        "SELECT 1 AS exists FROM households WHERE invite_code = $1",
        [code]
      )
    ).rows[0];
    if (!existing) return code;
  }
  throw new Error("Couldn't generate a unique household invite code.");
}
