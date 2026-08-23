import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateCategoryBudgetPace,
  clearCategoryBudget,
  getCategoryBudgetPaces,
  setCategoryBudget,
  validateBudgetAmount,
} from "../lib/budgets";
import { closeDatabase, db } from "../lib/db";
import { installTestDatabase } from "./db-helpers";

const category = {
  id: "food",
  name: "Food & Drinks",
  emoji: "🍜",
  color: "#3987e5",
  budgetMinor: 30_000,
};

test("compares category spend with an even monthly pace", () => {
  assert.deepEqual(calculateCategoryBudgetPace(category, 12_000, 10, 30), {
    ...category,
    spentMinor: 12_000,
    expectedMinor: 10_000,
    differenceMinor: 2_000,
    remainingMinor: 18_000,
    projectedMinor: 36_000,
    percentUsed: 40,
    elapsedPercent: 33,
    direction: "above",
    asOfDay: 10,
    daysInMonth: 30,
  });
});

test("uses a five-percent monthly-guide band for normal variation", () => {
  assert.equal(calculateCategoryBudgetPace(category, 11_000, 10, 30).direction, "near");
  assert.equal(calculateCategoryBudgetPace(category, 8_000, 10, 30).direction, "below");
});

test("validates positive safe monthly amounts", () => {
  assert.deepEqual(validateBudgetAmount("2500.50"), { ok: true, amountMinor: 250_050 });
  assert.equal(validateBudgetAmount(0).ok, false);
  assert.equal(validateBudgetAmount(0.001).ok, false);
  assert.equal(validateBudgetAmount(-1).ok, false);
  assert.equal(validateBudgetAmount(Number.POSITIVE_INFINITY).ok, false);
});

test("budget writes and pace reads stay inside the household", async () => {
  await installTestDatabase();
  try {
    const database = db();
    await database.query(
      `INSERT INTO users (id, email, name, password_hash, created_at)
       VALUES ($1, $2, $3, $4, $5)`,
      ["user-1", "budgets@example.com", "Budget", "unused", Date.now()]
    );
    for (const [id, code] of [["household-1", "BUDGET01"], ["household-2", "BUDGET02"]]) {
      await database.query(
        `INSERT INTO households (id, name, home_currency, invite_code, created_at)
         VALUES ($1, $2, 'INR', $3, $4)`,
        [id, id, code, Date.now()]
      );
    }
    for (const [id, householdId] of [["food-1", "household-1"], ["food-2", "household-2"]]) {
      await database.query(
        `INSERT INTO categories (id, household_id, name, emoji, color, sort)
         VALUES ($1, $2, 'Food & Drinks', '🍜', '#3987e5', 0)`,
        [id, householdId]
      );
    }

    assert.deepEqual(await setCategoryBudget("food-1", "household-1", 300), { ok: true });
    assert.equal((await setCategoryBudget("food-2", "household-1", 300)).ok, false);

    for (const [id, householdId, amount, categoryId, date] of [
      ["current", "household-1", 12_000, "food-1", "2026-08-10"],
      ["future", "household-1", 99_000, "food-1", "2026-08-11"],
      ["other", "household-2", 99_000, "food-2", "2026-08-10"],
    ] as const) {
      await database.query(
        `INSERT INTO expenses
         (id, household_id, user_id, amount_minor, currency, fx_to_home, category_id,
          spent_on, source, created_at)
         VALUES ($1, $2, 'user-1', $3, 'INR', 1, $4, $5, 'web', $6)`,
        [id, householdId, amount, categoryId, date, Date.now()]
      );
    }

    const paces = await getCategoryBudgetPaces("household-1", "2026-08-10");
    assert.equal(paces.length, 1);
    assert.equal(paces[0].spentMinor, 12_000);
    assert.equal(paces[0].budgetMinor, 30_000);

    assert.equal(await clearCategoryBudget("food-2", "household-1"), false);
    assert.equal(await clearCategoryBudget("food-1", "household-1"), true);
    assert.deepEqual(await getCategoryBudgetPaces("household-1", "2026-08-10"), []);
  } finally {
    await closeDatabase();
  }
});
