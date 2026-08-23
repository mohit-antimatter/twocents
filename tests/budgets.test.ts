import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  calculateCategoryBudgetPace,
  clearCategoryBudget,
  getCategoryBudgetPaces,
  setCategoryBudget,
  validateBudgetAmount,
} from "../lib/budgets";
import { db } from "../lib/db";

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

test("budget writes and pace reads stay inside the household", () => {
  const originalCwd = process.cwd();
  process.chdir(mkdtempSync(path.join(os.tmpdir(), "twocents-budgets-")));

  try {
    const database = db();
    database
      .prepare("INSERT INTO users (id, email, name, password_hash, created_at) VALUES (?, ?, ?, ?, ?)")
      .run("user-1", "budgets@example.com", "Budget", "unused", Date.now());
    for (const [id, code] of [["household-1", "BUDGET01"], ["household-2", "BUDGET02"]]) {
      database
        .prepare("INSERT INTO households (id, name, home_currency, invite_code, created_at) VALUES (?, ?, 'INR', ?, ?)")
        .run(id, id, code, Date.now());
    }
    const insertCategory = database.prepare(
      "INSERT INTO categories (id, household_id, name, emoji, color, sort) VALUES (?, ?, ?, '🍜', '#3987e5', 0)"
    );
    insertCategory.run("food-1", "household-1", "Food & Drinks");
    insertCategory.run("food-2", "household-2", "Food & Drinks");

    assert.deepEqual(setCategoryBudget("food-1", "household-1", 300), { ok: true });
    assert.equal(setCategoryBudget("food-2", "household-1", 300).ok, false);

    const insertExpense = database.prepare(
      `INSERT INTO expenses
       (id, household_id, user_id, amount_minor, currency, fx_to_home, category_id,
        spent_on, source, created_at)
       VALUES (?, ?, 'user-1', ?, 'INR', 1, ?, ?, 'web', ?)`
    );
    insertExpense.run("current", "household-1", 12_000, "food-1", "2026-08-10", Date.now());
    insertExpense.run("future", "household-1", 99_000, "food-1", "2026-08-11", Date.now());
    insertExpense.run("other", "household-2", 99_000, "food-2", "2026-08-10", Date.now());

    const paces = getCategoryBudgetPaces("household-1", "2026-08-10");
    assert.equal(paces.length, 1);
    assert.equal(paces[0].spentMinor, 12_000);
    assert.equal(paces[0].budgetMinor, 30_000);

    assert.equal(clearCategoryBudget("food-2", "household-1"), false);
    assert.equal(clearCategoryBudget("food-1", "household-1"), true);
    assert.deepEqual(getCategoryBudgetPaces("household-1", "2026-08-10"), []);
  } finally {
    global.__twocents_db?.close();
    global.__twocents_db = undefined;
    process.chdir(originalCwd);
  }
});
