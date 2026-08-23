import assert from "node:assert/strict";
import test from "node:test";

import Database from "better-sqlite3";

import { initializeDatabase } from "../lib/db";
import { importLegacySqlite } from "../scripts/migrate-sqlite-to-postgres";
import { createTestDatabase } from "./db-helpers";

test("imports an existing SQLite ledger into an empty PostgreSQL database", async () => {
  const source = new Database(":memory:");
  source.exec(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY, email TEXT NOT NULL, name TEXT NOT NULL,
      password_hash TEXT NOT NULL, created_at INTEGER NOT NULL
    );
    CREATE TABLE households (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, home_currency TEXT NOT NULL,
      invite_code TEXT NOT NULL, created_at INTEGER NOT NULL
    );
    CREATE TABLE household_members (
      household_id TEXT NOT NULL, user_id TEXT NOT NULL,
      role TEXT NOT NULL, joined_at INTEGER NOT NULL
    );
    CREATE TABLE categories (
      id TEXT PRIMARY KEY, household_id TEXT NOT NULL, name TEXT NOT NULL,
      emoji TEXT NOT NULL, color TEXT NOT NULL, sort INTEGER NOT NULL
    );
    CREATE TABLE expenses (
      id TEXT PRIMARY KEY, household_id TEXT NOT NULL, user_id TEXT NOT NULL,
      amount_minor INTEGER NOT NULL, currency TEXT NOT NULL, fx_to_home REAL NOT NULL,
      category_id TEXT, merchant TEXT, note TEXT, spent_on TEXT NOT NULL,
      source TEXT NOT NULL, raw_input TEXT, created_at INTEGER NOT NULL
    );
    INSERT INTO users VALUES ('user-1', 'owner@example.com', 'Owner', 'hash', 1700000000000);
    INSERT INTO households VALUES ('household-1', 'Us', 'INR', 'ABCD1234', 1700000000000);
    INSERT INTO household_members VALUES ('household-1', 'user-1', 'owner', 1700000000000);
    INSERT INTO categories VALUES ('other-1', 'household-1', 'Other', '🌀', '#6B7A70', 11);
    INSERT INTO expenses VALUES (
      'expense-1', 'household-1', 'user-1', 12500, 'INR', 1,
      'other-1', 'Market', NULL, '2026-08-23', 'web', 'market 125', 1700000000000
    );
  `);

  const target = await createTestDatabase();
  try {
    const counts = await importLegacySqlite(source, target);
    assert.equal(counts.users, 1);
    assert.equal(counts.expenses, 1);
    assert.equal(counts.recurring_expenses, 0);
    await initializeDatabase(target);
    await initializeDatabase(target);

    const expense = (
      await target.query<{
        amount_minor: number;
        spent_time: string | null;
        request_id: string | null;
      }>(
        "SELECT amount_minor, spent_time, request_id FROM expenses WHERE id = $1",
        ["expense-1"]
      )
    ).rows[0];
    assert.deepEqual(expense, {
      amount_minor: 12_500,
      spent_time: null,
      request_id: null,
    });

    const categories = (
      await target.query<{ name: string; emoji: string; sort: number }>(
        `SELECT name, emoji, sort FROM categories
         WHERE household_id = $1 ORDER BY sort`,
        ["household-1"]
      )
    ).rows;
    assert.deepEqual(categories, [
      { name: "Household Help", emoji: "🧹", sort: 11 },
      { name: "Other", emoji: "🌀", sort: 12 },
    ]);

    await assert.rejects(
      () => importLegacySqlite(source, target),
      /target already contains data/i
    );
  } finally {
    source.close();
    await target.close();
  }
});
