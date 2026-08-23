import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { db } from "../lib/db";
import {
  createHousehold,
  joinHousehold,
  rotateHouseholdInvite,
} from "../lib/households";

test("households remain two-person and invite codes are single-use", () => {
  const originalCwd = process.cwd();
  process.chdir(mkdtempSync(path.join(os.tmpdir(), "twocents-households-")));

  try {
    const database = db();
    for (const id of ["owner", "partner", "third", "fourth"]) {
      database
        .prepare(
          "INSERT INTO users (id, email, name, password_hash, created_at) VALUES (?, ?, ?, ?, ?)"
        )
        .run(id, `${id}@example.com`, id, "unused", Date.now());
    }

    const created = createHousehold("owner", { name: "Us", homeCurrency: "INR" });
    assert.equal(created.ok, true);
    if (!created.ok) return;

    const joined = joinHousehold("partner", created.inviteCode);
    assert.equal(joined.ok, true);
    if (!joined.ok) return;
    assert.notEqual(joined.inviteCode, created.inviteCode);

    const staleCode = joinHousehold("third", created.inviteCode);
    assert.deepEqual(staleCode, { ok: false, error: "not_found" });

    const fullHousehold = joinHousehold("third", joined.inviteCode);
    assert.deepEqual(fullHousehold, { ok: false, error: "full" });

    const memberRotation = rotateHouseholdInvite(created.householdId, "partner");
    assert.deepEqual(memberRotation, { ok: false, error: "forbidden" });

    const ownerRotation = rotateHouseholdInvite(created.householdId, "owner");
    assert.equal(ownerRotation.ok, true);
    if (ownerRotation.ok) assert.notEqual(ownerRotation.inviteCode, joined.inviteCode);

    const duplicateMembership = createHousehold("owner", {
      name: "Another",
      homeCurrency: "INR",
    });
    assert.deepEqual(duplicateMembership, { ok: false, error: "already_member" });

    database
      .prepare(
        "INSERT INTO households (id, name, home_currency, invite_code, created_at) VALUES (?, ?, ?, ?, ?)"
      )
      .run("other-household", "Other", "INR", "DEADBEEF", Date.now());
    assert.throws(() =>
      database
        .prepare(
          "INSERT INTO household_members (household_id, user_id, role, joined_at) VALUES (?, ?, 'owner', ?)"
        )
        .run("other-household", "owner", Date.now())
    );

    const count = database
      .prepare("SELECT COUNT(*) AS count FROM household_members WHERE household_id = ?")
      .get(created.householdId) as { count: number };
    assert.equal(count.count, 2);
  } finally {
    process.chdir(originalCwd);
  }
});
