import assert from "node:assert/strict";
import test from "node:test";

import Database from "better-sqlite3";

import { migrate } from "../lib/db";

test("upgrades an existing ledger before creating recurring indexes", () => {
  const database = new Database(":memory:");
  database.exec(`
    CREATE TABLE expenses (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      spent_on TEXT NOT NULL
    );
    CREATE TABLE household_members (
      household_id TEXT NOT NULL,
      user_id TEXT NOT NULL
    );
    CREATE TABLE households (
      id TEXT PRIMARY KEY
    );
    CREATE TABLE categories (
      id TEXT PRIMARY KEY,
      household_id TEXT NOT NULL,
      name TEXT NOT NULL,
      emoji TEXT NOT NULL,
      color TEXT NOT NULL,
      sort INTEGER NOT NULL
    );
    INSERT INTO households (id) VALUES ('household-1');
    INSERT INTO categories (id, household_id, name, emoji, color, sort)
    VALUES ('other-1', 'household-1', 'Other', '🌀', '#6B7A70', 11);
  `);

  assert.doesNotThrow(() => migrate(database));

  const columns = database
    .prepare("PRAGMA table_info(expenses)")
    .all() as { name: string }[];
  assert.deepEqual(
    columns.map((column) => column.name),
    ["id", "user_id", "spent_on", "spent_time", "request_id", "recurring_rule_id"]
  );

  const indexes = database
    .prepare("SELECT name FROM sqlite_master WHERE type = 'index'")
    .all() as { name: string }[];
  assert.ok(indexes.some((index) => index.name === "idx_expenses_recurring_due"));

  const categoryColumns = database
    .prepare("PRAGMA table_info(categories)")
    .all() as { name: string }[];
  assert.ok(categoryColumns.some((column) => column.name === "budget_minor"));

  const householdHelp = database
    .prepare("SELECT name, emoji, sort FROM categories WHERE household_id = ? ORDER BY sort")
    .all("household-1") as { name: string; emoji: string; sort: number }[];
  assert.deepEqual(householdHelp, [
    { name: "Household Help", emoji: "🧹", sort: 11 },
    { name: "Other", emoji: "🌀", sort: 12 },
  ]);
  assert.doesNotThrow(() => migrate(database));
  const helpCount = database
    .prepare("SELECT COUNT(*) AS count FROM categories WHERE name = 'Household Help'")
    .get() as { count: number };
  assert.equal(helpCount.count, 1);
  database.close();
});
