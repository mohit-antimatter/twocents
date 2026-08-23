import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { db } from "../lib/db";
import { getMonthSummary } from "../lib/expenses";

test("groups a household's category spend by merchant or title", () => {
  const originalCwd = process.cwd();
  process.chdir(mkdtempSync(path.join(os.tmpdir(), "twocents-insights-")));

  try {
    const database = db();
    database
      .prepare("INSERT INTO users (id, email, name, password_hash, created_at) VALUES (?, ?, ?, ?, ?)")
      .run("user-1", "insights@example.com", "Insights", "unused", Date.now());
    database
      .prepare("INSERT INTO households (id, name, home_currency, invite_code, created_at) VALUES (?, ?, 'INR', ?, ?)")
      .run("household-1", "One", "INSIGHT1", Date.now());
    database
      .prepare("INSERT INTO households (id, name, home_currency, invite_code, created_at) VALUES (?, ?, 'INR', ?, ?)")
      .run("household-2", "Two", "INSIGHT2", Date.now());
    database
      .prepare("INSERT INTO categories (id, household_id, name, emoji, color, sort) VALUES (?, ?, ?, ?, ?, ?)")
      .run("food-1", "household-1", "Food & Drinks", "🍜", "#3987e5", 0);
    database
      .prepare("INSERT INTO categories (id, household_id, name, emoji, color, sort) VALUES (?, ?, ?, ?, ?, ?)")
      .run("food-2", "household-2", "Food & Drinks", "🍜", "#3987e5", 0);

    const insertExpense = database.prepare(
      `INSERT INTO expenses
       (id, household_id, user_id, amount_minor, currency, fx_to_home, category_id,
        merchant, note, spent_on, source, created_at)
       VALUES (?, ?, 'user-1', ?, 'INR', 1, ?, ?, ?, '2026-08-10', 'web', ?)`
    );
    insertExpense.run("swiggy-1", "household-1", 10_000, "food-1", "Swiggy", null, Date.now());
    insertExpense.run("swiggy-2", "household-1", 20_000, "food-1", "swiggy", null, Date.now());
    insertExpense.run("market", "household-1", 15_000, "food-1", null, "Farmers market", Date.now());
    insertExpense.run("untitled", "household-1", 5_000, "food-1", null, null, Date.now());
    insertExpense.run("other-household", "household-2", 99_000, "food-2", "Hidden", null, Date.now());

    const summary = getMonthSummary("household-1", "2026-08");
    assert.equal(summary.totalMinor, 50_000);
    assert.equal(summary.count, 4);
    assert.equal(summary.byCategory.length, 1);
    assert.deepEqual(summary.byCategory[0].titles, [
      { title: "Swiggy", totalMinor: 30_000, count: 2 },
      { title: "Farmers market", totalMinor: 15_000, count: 1 },
      { title: "Other expenses", totalMinor: 5_000, count: 1 },
    ]);
  } finally {
    global.__twocents_db?.close();
    global.__twocents_db = undefined;
    process.chdir(originalCwd);
  }
});
