import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { db } from "../lib/db";
import {
  createRecurringRule,
  deleteRecurringRule,
  listRecurringRules,
  materializeDueRecurring,
  nextRecurringDate,
  setRecurringActive,
  validateRecurringInput,
} from "../lib/recurring";

test("monthly dates preserve their anchor after shorter months", () => {
  const february = nextRecurringDate("2026-01-31", "monthly", 31);
  const march = nextRecurringDate(february, "monthly", 31);
  assert.equal(february, "2026-02-28");
  assert.equal(march, "2026-03-31");
});

test("weekly dates advance by exactly seven calendar days", () => {
  assert.equal(nextRecurringDate("2026-12-29", "weekly", 29), "2027-01-05");
});

test("validates bounded schedule input and household categories", () => {
  const valid = {
    label: "Rent",
    amount: 25_000,
    currency: "INR",
    categoryId: "housing",
    frequency: "monthly",
    nextDueOn: "2026-09-01",
  };
  assert.equal(validateRecurringInput(valid, "2026-08-23", ["housing"]).ok, true);

  for (const input of [
    { ...valid, nextDueOn: "2026-08-22" },
    { ...valid, frequency: "daily" },
    { ...valid, categoryId: "another-household" },
    { ...valid, amount: Number.POSITIVE_INFINITY },
    { ...valid, label: "x".repeat(121) },
  ]) {
    assert.equal(validateRecurringInput(input, "2026-08-23", ["housing"]).ok, false);
  }
});

test("materializes due dates once and skips the paused period on resume", () => {
  const originalCwd = process.cwd();
  process.chdir(mkdtempSync(path.join(os.tmpdir(), "twocents-recurring-")));

  try {
    const database = db();
    for (const [id, email, name] of [
      ["owner", "owner@example.com", "Owner"],
      ["partner", "partner@example.com", "Partner"],
    ]) {
      database
        .prepare("INSERT INTO users (id, email, name, password_hash, created_at) VALUES (?, ?, ?, 'unused', ?)")
        .run(id, email, name, Date.now());
    }
    database
      .prepare("INSERT INTO households (id, name, home_currency, invite_code, created_at) VALUES ('household-1', 'Us', 'INR', 'RECUR001', ?)")
      .run(Date.now());
    database
      .prepare("INSERT INTO categories (id, household_id, name, emoji, color, sort) VALUES ('housing', 'household-1', 'Housing & Bills', '🏠', '#d55181', 0)")
      .run();

    const created = createRecurringRule(
      "household-1",
      "owner",
      {
        label: "Rent",
        amount: 25_000,
        currency: "INR",
        categoryId: "housing",
        frequency: "monthly",
        nextDueOn: "2026-01-31",
      },
      "2026-01-31"
    );
    assert.equal(created.ok, true);
    if (!created.ok) return;

    assert.equal(materializeDueRecurring("household-1", "2026-03-31"), 3);
    assert.equal(materializeDueRecurring("household-1", "2026-03-31"), 0);

    const dates = database
      .prepare("SELECT spent_on FROM expenses WHERE recurring_rule_id = ? ORDER BY spent_on")
      .all(created.id) as { spent_on: string }[];
    assert.deepEqual(dates.map((row) => row.spent_on), [
      "2026-01-31",
      "2026-02-28",
      "2026-03-31",
    ]);
    assert.equal(listRecurringRules("household-1")[0].next_due_on, "2026-04-30");

    assert.equal(
      setRecurringActive(created.id, "household-1", "partner", false, "2026-04-15"),
      "forbidden"
    );
    assert.equal(
      setRecurringActive(created.id, "household-1", "owner", false, "2026-04-15"),
      "ok"
    );
    assert.equal(materializeDueRecurring("household-1", "2026-06-15"), 0);
    assert.equal(
      setRecurringActive(created.id, "household-1", "owner", true, "2026-06-15"),
      "ok"
    );
    assert.equal(listRecurringRules("household-1")[0].next_due_on, "2026-06-30");
    assert.equal(materializeDueRecurring("household-1", "2026-06-30"), 1);

    assert.equal(
      deleteRecurringRule(created.id, "household-1", "partner"),
      "forbidden"
    );
    assert.equal(deleteRecurringRule(created.id, "household-1", "owner"), "ok");
    const expenseCount = database
      .prepare("SELECT COUNT(*) AS count FROM expenses WHERE recurring_rule_id = ?")
      .get(created.id) as { count: number };
    assert.equal(expenseCount.count, 4);
  } finally {
    global.__twocents_db?.close();
    global.__twocents_db = undefined;
    process.chdir(originalCwd);
  }
});
