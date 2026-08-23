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
  database.close();
});
