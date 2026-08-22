import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { db } from "../lib/db";
import { createExpenseFromParsed } from "../lib/expenses";

test("reusing a capture request ID returns the original expense", () => {
  const originalCwd = process.cwd();
  const tempDir = mkdtempSync(path.join(os.tmpdir(), "twocents-idempotency-"));
  process.chdir(tempDir);

  try {
    const database = db();
    database
      .prepare("INSERT INTO users (id, email, name, password_hash, created_at) VALUES (?, ?, ?, ?, ?)")
      .run("user-1", "test@example.com", "Test", "unused", Date.now());
    database
      .prepare("INSERT INTO households (id, name, home_currency, invite_code, created_at) VALUES (?, ?, ?, ?, ?)")
      .run("household-1", "Test household", "INR", "TESTCODE", Date.now());
    database
      .prepare("INSERT INTO categories (id, household_id, name, emoji, color, sort) VALUES (?, ?, ?, ?, ?, ?)")
      .run("other", "household-1", "Other", "🌀", "#6B7A70", 0);

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

    const first = createExpenseFromParsed(options);
    const retry = createExpenseFromParsed(options);
    const count = database.prepare("SELECT COUNT(*) AS count FROM expenses").get() as {
      count: number;
    };

    assert.equal(first.created, true);
    assert.equal(retry.created, false);
    assert.equal(retry.id, first.id);
    assert.equal(count.count, 1);
  } finally {
    process.chdir(originalCwd);
  }
});
