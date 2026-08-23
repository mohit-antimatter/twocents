import assert from "node:assert/strict";
import test from "node:test";

import { closeDatabase, db } from "../lib/db";
import { calculateSpendingPace, getSpendingPace } from "../lib/expenses";
import { installTestDatabase } from "./db-helpers";

test("uses the median of three comparable months", () => {
  const pace = calculateSpendingPace(23, 25_000, [
    { month: "2026-05", totalMinor: 10_000 },
    { month: "2026-06", totalMinor: 30_000 },
    { month: "2026-07", totalMinor: 20_000 },
  ]);

  assert.deepEqual(pace, {
    asOfDay: 23,
    currentMinor: 25_000,
    typicalMinor: 20_000,
    differenceMinor: 5_000,
    differencePct: 25,
    direction: "above",
    comparisonMonths: ["2026-05", "2026-06", "2026-07"],
  });
});

test("averages the middle pair when two months are available", () => {
  const pace = calculateSpendingPace(10, 15_000, [
    { month: "2026-06", totalMinor: 10_000 },
    { month: "2026-07", totalMinor: 30_000 },
  ]);
  assert.equal(pace?.typicalMinor, 20_000);
  assert.equal(pace?.direction, "below");
});

test("treats a five-percent band as normal variation", () => {
  const pace = calculateSpendingPace(12, 20_800, [
    { month: "2026-06", totalMinor: 19_000 },
    { month: "2026-07", totalMinor: 21_000 },
  ]);
  assert.equal(pace?.typicalMinor, 20_000);
  assert.equal(pace?.direction, "near");
});

test("does not claim a typical pace from one month of history", () => {
  assert.equal(
    calculateSpendingPace(23, 25_000, [{ month: "2026-07", totalMinor: 20_000 }]),
    null
  );
});

test("compares only this household and only spend through the same day", async () => {
  await installTestDatabase();
  try {
    const database = db();
    await database.query(
      `INSERT INTO users (id, email, name, password_hash, created_at)
       VALUES ($1, $2, $3, $4, $5)`,
      ["user-1", "pace@example.com", "Pace", "unused", Date.now()]
    );
    for (const [id, name] of [["household-1", "Us"], ["household-2", "Other"]]) {
      await database.query(
        `INSERT INTO households (id, name, home_currency, invite_code, created_at)
         VALUES ($1, $2, 'INR', $3, $4)`,
        [id, name, id === "household-1" ? "PACE0001" : "PACE0002", Date.now()]
      );
    }

    const expenses = [
      ["may", "household-1", 10_000, "2026-05-20"],
      ["jun", "household-1", 20_000, "2026-06-20"],
      ["jul", "household-1", 30_000, "2026-07-20"],
      ["jul-late", "household-1", 90_000, "2026-07-24"],
      ["aug", "household-1", 25_000, "2026-08-23"],
      ["aug-future", "household-1", 80_000, "2026-08-24"],
      ["other", "household-2", 99_000, "2026-07-20"],
    ] as const;
    for (const [index, [id, householdId, amountMinor, spentOn]] of expenses.entries()) {
      await database.query(
        `INSERT INTO expenses
         (id, household_id, user_id, amount_minor, currency, fx_to_home, spent_on, source, created_at)
         VALUES ($1, $2, 'user-1', $3, 'INR', 1, $4, 'web', $5)`,
        [id, householdId, amountMinor, spentOn, Date.now() + index]
      );
    }

    const pace = await getSpendingPace("household-1", "2026-08-23");
    assert.equal(pace?.currentMinor, 25_000);
    assert.equal(pace?.typicalMinor, 20_000);
    assert.equal(pace?.differenceMinor, 5_000);
  } finally {
    await closeDatabase();
  }
});
