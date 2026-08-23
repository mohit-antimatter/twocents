import assert from "node:assert/strict";
import test from "node:test";

import { closeDatabase, db } from "../lib/db";
import { createExpenseFromParsed } from "../lib/expenses";
import { installTestDatabase } from "./db-helpers";

test("reusing a capture request ID returns the original expense", async () => {
  await installTestDatabase();
  try {
    const database = db();
    await database.query(
      `INSERT INTO users (id, email, name, password_hash, created_at)
       VALUES ($1, $2, $3, $4, $5)`,
      ["user-1", "test@example.com", "Test", "unused", Date.now()]
    );
    await database.query(
      `INSERT INTO households (id, name, home_currency, invite_code, created_at)
       VALUES ($1, $2, $3, $4, $5)`,
      ["household-1", "Test household", "INR", "TESTCODE", Date.now()]
    );
    await database.query(
      `INSERT INTO categories (id, household_id, name, emoji, color, sort)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      ["other", "household-1", "Other", "🌀", "#6B7A70", 0]
    );

    const options = {
      householdId: "household-1",
      userId: "user-1",
      parsed: {
        amount: 450,
        currency: null,
        category: null,
        merchant: "Swiggy",
        note: null,
        spent_on: "2026-08-22",
        issue: null,
      },
      source: "web",
      rawInput: "swiggy 450",
      requestId: "65f2d5bc-418f-4cec-95e7-59a673f4c905",
    } as const;

    const first = await createExpenseFromParsed(options);
    const retry = await createExpenseFromParsed(options);
    const count = (
      await database.query<{ count: number }>("SELECT COUNT(*) AS count FROM expenses")
    ).rows[0];

    assert.equal(first.created, true);
    assert.equal(retry.created, false);
    assert.equal(retry.id, first.id);
    assert.equal(count.count, 1);
  } finally {
    await closeDatabase();
  }
});
