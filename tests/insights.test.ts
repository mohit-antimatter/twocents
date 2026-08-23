import assert from "node:assert/strict";
import test from "node:test";

import { closeDatabase, db } from "../lib/db";
import { getMonthSummary } from "../lib/expenses";
import { installTestDatabase } from "./db-helpers";

test("groups a household's category spend by merchant or title", async () => {
  await installTestDatabase();
  try {
    const database = db();
    await database.query(
      `INSERT INTO users (id, email, name, password_hash, created_at)
       VALUES ($1, $2, $3, $4, $5)`,
      ["user-1", "insights@example.com", "Insights", "unused", Date.now()]
    );
    for (const [id, name, code] of [
      ["household-1", "One", "INSIGHT1"],
      ["household-2", "Two", "INSIGHT2"],
    ]) {
      await database.query(
        `INSERT INTO households (id, name, home_currency, invite_code, created_at)
         VALUES ($1, $2, 'INR', $3, $4)`,
        [id, name, code, Date.now()]
      );
    }
    for (const [id, householdId] of [["food-1", "household-1"], ["food-2", "household-2"]]) {
      await database.query(
        `INSERT INTO categories (id, household_id, name, emoji, color, sort)
         VALUES ($1, $2, 'Food & Drinks', '🍜', '#3987e5', 0)`,
        [id, householdId]
      );
    }

    for (const [id, householdId, amount, categoryId, merchant, note] of [
      ["swiggy-1", "household-1", 10_000, "food-1", "Swiggy", null],
      ["swiggy-2", "household-1", 20_000, "food-1", "swiggy", null],
      ["market", "household-1", 15_000, "food-1", null, "Farmers market"],
      ["untitled", "household-1", 5_000, "food-1", null, null],
      ["other-household", "household-2", 99_000, "food-2", "Hidden", null],
    ] as const) {
      await database.query(
        `INSERT INTO expenses
         (id, household_id, user_id, amount_minor, currency, fx_to_home, category_id,
          merchant, note, spent_on, source, created_at)
         VALUES ($1, $2, 'user-1', $3, 'INR', 1, $4, $5, $6, '2026-08-10', 'web', $7)`,
        [id, householdId, amount, categoryId, merchant, note, Date.now()]
      );
    }

    const summary = await getMonthSummary("household-1", "2026-08");
    assert.equal(summary.totalMinor, 50_000);
    assert.equal(summary.count, 4);
    assert.equal(summary.byCategory.length, 1);
    assert.deepEqual(summary.byCategory[0].titles, [
      { title: "Swiggy", totalMinor: 30_000, count: 2 },
      { title: "Farmers market", totalMinor: 15_000, count: 1 },
      { title: "Other expenses", totalMinor: 5_000, count: 1 },
    ]);
  } finally {
    await closeDatabase();
  }
});
