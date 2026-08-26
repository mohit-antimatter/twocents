import assert from "node:assert/strict";
import test from "node:test";

import {
  BackupValidationError,
  backupFilename,
  clearHouseholdFinancialData,
  createHouseholdBackup,
  replaceHouseholdFromBackup,
  validateHouseholdBackup,
} from "../lib/backup";
import { createTestDatabase } from "./db-helpers";

async function seedHouseholdData() {
  const database = await createTestDatabase();
  for (const [id, email, name] of [
    ["user-1", "owner@example.com", "Owner"],
    ["user-2", "partner@example.com", "Partner"],
  ]) {
    await database.query(
      `INSERT INTO users (id, email, name, password_hash, created_at)
       VALUES ($1, $2, $3, 'secret-password-hash', 1)`,
      [id, email, name]
    );
  }
  await database.query(
    `INSERT INTO households (id, name, home_currency, invite_code, created_at)
     VALUES ('household-1', 'Our Home', 'INR', 'BACKUP01', 1)`
  );
  await database.query(
    `INSERT INTO household_members (household_id, user_id, role, joined_at)
     VALUES ('household-1', 'user-1', 'owner', 1),
            ('household-1', 'user-2', 'member', 2)`
  );
  await database.query(
    `INSERT INTO categories (id, household_id, name, emoji, color, sort, budget_minor)
     VALUES ('food-1', 'household-1', 'Food & Drinks', '🍜', '#ff0000', 1, 500000),
            ('other-1', 'household-1', 'Other', '🌀', '#00ff00', 2, NULL)`
  );
  await database.query(
    `INSERT INTO recurring_expenses
     (id, household_id, user_id, label, amount_minor, currency, category_id,
      frequency, anchor_day, next_due_on, active, created_at)
     VALUES ('rule-1', 'household-1', 'user-1', 'Rent', 5000000, 'INR', 'other-1',
             'monthly', 1, '2026-09-01', 1, 10)`
  );
  await database.query(
    `INSERT INTO expenses
     (id, household_id, user_id, amount_minor, currency, fx_to_home, category_id,
      merchant, note, spent_on, spent_time, source, raw_input, recurring_rule_id, created_at)
     VALUES ('expense-1', 'household-1', 'user-1', 12500, 'INR', 1, 'food-1',
             'Market', 'Dinner', '2026-08-25', '19:30', 'web', 'market 125', NULL, 20),
            ('expense-2', 'household-1', 'user-2', 5000000, 'INR', 1, 'other-1',
             'Rent', NULL, '2026-08-01', NULL, 'recurring', NULL, 'rule-1', 21)`
  );
  await database.query(
    `INSERT INTO presets
     (id, household_id, label, emoji, amount_minor, currency, category_id, sort)
     VALUES ('preset-1', 'household-1', 'Coffee', '☕', 25000, 'INR', 'food-1', 1)`
  );
  await database.query(
    `INSERT INTO api_tokens (id, user_id, token_hash, label, created_at)
     VALUES ('token-1', 'user-1', 'private-token-hash', 'Phone', 1)`
  );
  return database;
}

test("exports every shared financial-data type without credentials", async () => {
  const database = await seedHouseholdData();
  try {
    const backup = await createHouseholdBackup("household-1", database);
    assert.equal(backup.format, "twocents-household-backup");
    assert.equal(backup.version, 1);
    assert.equal(backup.expenses.length, 2);
    assert.equal(backup.recurring.length, 1);
    assert.equal(backup.presets.length, 1);
    assert.equal(backup.categories.find((item) => item.name === "Food & Drinks")?.budget_minor, 500000);
    const serialized = JSON.stringify(backup);
    assert.doesNotMatch(serialized, /secret-password-hash/);
    assert.doesNotMatch(serialized, /private-token-hash/);
  } finally {
    await database.close();
  }
});

test("clear removes shared financial data but keeps accounts, members, and categories", async () => {
  const database = await seedHouseholdData();
  try {
    assert.deepEqual(await clearHouseholdFinancialData("household-1", database), {
      expenses: 2,
      recurring: 1,
      presets: 1,
      categoryGuides: 1,
    });
    for (const table of ["expenses", "recurring_expenses", "presets"]) {
      const result = await database.query<{ count: number }>(
        `SELECT COUNT(*) AS count FROM ${table}`
      );
      assert.equal(result.rows[0].count, 0);
    }
    assert.equal((await database.query<{ count: number }>("SELECT COUNT(*) AS count FROM users")).rows[0].count, 2);
    assert.equal((await database.query<{ count: number }>("SELECT COUNT(*) AS count FROM categories")).rows[0].count, 2);
    assert.equal(
      (await database.query<{ count: number }>("SELECT COUNT(*) AS count FROM categories WHERE budget_minor IS NOT NULL")).rows[0].count,
      0
    );
    assert.equal((await database.query<{ count: number }>("SELECT COUNT(*) AS count FROM api_tokens")).rows[0].count, 1);
  } finally {
    await database.close();
  }
});

test("a backup restores expenses, recurring links, presets, and category guides", async () => {
  const database = await seedHouseholdData();
  try {
    const backup = await createHouseholdBackup("household-1", database);
    await clearHouseholdFinancialData("household-1", database);
    assert.deepEqual(await replaceHouseholdFromBackup("household-1", backup, database), {
      expenses: 2,
      recurring: 1,
      presets: 1,
      categoryGuides: 1,
    });
    const restoredRule = (
      await database.query<{ id: string; user_id: string; label: string }>(
        "SELECT id, user_id, label FROM recurring_expenses"
      )
    ).rows[0];
    assert.equal(restoredRule.user_id, "user-1");
    assert.equal(restoredRule.label, "Rent");
    assert.notEqual(restoredRule.id, "rule-1");
    const linkedExpense = (
      await database.query<{ user_id: string; recurring_rule_id: string }>(
        "SELECT user_id, recurring_rule_id FROM expenses WHERE source = 'recurring'"
      )
    ).rows[0];
    assert.equal(linkedExpense.user_id, "user-2");
    assert.equal(linkedExpense.recurring_rule_id, restoredRule.id);
    assert.equal(
      (
        await database.query<{ budget_minor: number }>(
          "SELECT budget_minor FROM categories WHERE name = 'Food & Drinks'"
        )
      ).rows[0].budget_minor,
      500000
    );
  } finally {
    await database.close();
  }
});

test("invalid or incompatible backups are rejected before current data is cleared", async () => {
  const database = await seedHouseholdData();
  try {
    const backup = await createHouseholdBackup("household-1", database);
    await assert.rejects(
      () => replaceHouseholdFromBackup("household-1", {
        ...backup,
        household: { ...backup.household, home_currency: "USD" },
      }, database),
      BackupValidationError
    );
    await assert.rejects(
      () => replaceHouseholdFromBackup("household-1", {
        ...backup,
        expenses: [{ ...backup.expenses[0], user_email: "missing@example.com" }],
      }, database),
      /not listed as a member/i
    );
    await assert.rejects(
      () => replaceHouseholdFromBackup("household-1", {
        ...backup,
        expenses: [{ ...backup.expenses[0], category_name: "Missing category" }],
      }, database),
      /referenced but not included/i
    );
    await assert.rejects(
      () => replaceHouseholdFromBackup("household-1", {
        ...backup,
        expenses: [{ ...backup.expenses[0], recurring_rule_id: "missing-rule" }],
      }, database),
      /referenced but not included/i
    );
    assert.equal(
      (await database.query<{ count: number }>("SELECT COUNT(*) AS count FROM expenses")).rows[0].count,
      2
    );
  } finally {
    await database.close();
  }
});

test("validates the backup envelope and builds a portable filename", () => {
  assert.throws(() => validateHouseholdBackup({ version: 1 }), /not a supported/i);
  assert.equal(
    backupFilename("M & A / Home", "2026-08-26"),
    "twocents-m-a-home-2026-08-26.backup.json"
  );
});
