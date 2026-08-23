import assert from "node:assert/strict";
import test from "node:test";

import { closeDatabase, db } from "../lib/db";
import {
  createHousehold,
  joinHousehold,
  rotateHouseholdInvite,
} from "../lib/households";
import { installTestDatabase } from "./db-helpers";

test("households remain two-person and invite codes are single-use", async () => {
  await installTestDatabase();
  try {
    const database = db();
    for (const id of ["owner", "partner", "third", "fourth"]) {
      await database.query(
        `INSERT INTO users (id, email, name, password_hash, created_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [id, `${id}@example.com`, id, "unused", Date.now()]
      );
    }

    const created = await createHousehold("owner", { name: "Us", homeCurrency: "INR" });
    assert.equal(created.ok, true);
    if (!created.ok) return;

    const joined = await joinHousehold("partner", created.inviteCode);
    assert.equal(joined.ok, true);
    if (!joined.ok) return;
    assert.notEqual(joined.inviteCode, created.inviteCode);

    const staleCode = await joinHousehold("third", created.inviteCode);
    assert.deepEqual(staleCode, { ok: false, error: "not_found" });

    const fullHousehold = await joinHousehold("third", joined.inviteCode);
    assert.deepEqual(fullHousehold, { ok: false, error: "full" });

    const memberRotation = await rotateHouseholdInvite(created.householdId, "partner");
    assert.deepEqual(memberRotation, { ok: false, error: "forbidden" });

    const ownerRotation = await rotateHouseholdInvite(created.householdId, "owner");
    assert.equal(ownerRotation.ok, true);
    if (ownerRotation.ok) assert.notEqual(ownerRotation.inviteCode, joined.inviteCode);

    const duplicateMembership = await createHousehold("owner", {
      name: "Another",
      homeCurrency: "INR",
    });
    assert.deepEqual(duplicateMembership, { ok: false, error: "already_member" });

    await database.query(
      `INSERT INTO households (id, name, home_currency, invite_code, created_at)
       VALUES ($1, $2, $3, $4, $5)`,
      ["other-household", "Other", "INR", "DEADBEEF", Date.now()]
    );
    await assert.rejects(() =>
      database.query(
        `INSERT INTO household_members (household_id, user_id, role, joined_at)
         VALUES ($1, $2, 'owner', $3)`,
        ["other-household", "owner", Date.now()]
      )
    );

    const count = (
      await database.query<{ count: number }>(
        "SELECT COUNT(*) AS count FROM household_members WHERE household_id = $1",
        [created.householdId]
      )
    ).rows[0];
    assert.equal(count.count, 2);
  } finally {
    await closeDatabase();
  }
});
