import assert from "node:assert/strict";
import test from "node:test";

import { closeDatabase, db } from "../lib/db";
import { expensesToCsv, exportFilename } from "../lib/export";
import { listExpensesForExport, type ExpenseExportRow } from "../lib/expenses";
import { installTestDatabase } from "./db-helpers";

const row: ExpenseExportRow = {
  id: "expense-1",
  amount_minor: 12345,
  currency: "USD",
  fx_to_home: 88.2,
  merchant: '=HYPERLINK("https://example.com","Dinner")',
  note: "For both,\nincluding dessert",
  spent_on: "2026-08-23",
  spent_time: "19:30",
  source: "web",
  created_at: Date.UTC(2026, 7, 23, 14, 0),
  user_name: "Mohit, K",
  category_name: "Food & Drinks",
};

test("exports stable financial columns and snapshotted home values", () => {
  const csv = expensesToCsv([row], "INR");
  const [header, ...body] = csv.slice(1).trimEnd().split("\r\n");

  assert.equal(
    header,
    "date,time,merchant,note,category,paid_by,amount,currency,fx_to_home,home_amount,home_currency,source,created_at,expense_id"
  );
  assert.match(body.join("\r\n"), /123\.45,"USD",88\.2,10888\.29,"INR"/);
  assert.match(body.join("\r\n"), /"Mohit, K"/);
  assert.match(body.join("\r\n"), /"For both,\nincluding dessert"/);
});

test("neutralizes spreadsheet formulas in text cells", () => {
  const csv = expensesToCsv([row], "INR");
  assert.match(csv, /"'=HYPERLINK\(""https:\/\/example\.com"",""Dinner""\)"/);

  const whitespacePrefixed = expensesToCsv([{ ...row, merchant: "\n  +1+1" }], "INR");
  assert.match(whitespacePrefixed, /"'\n  \+1\+1"/);
});

test("returns a header-only UTF-8 CSV for an empty ledger", () => {
  const csv = expensesToCsv([], "INR");
  assert.equal(csv.charCodeAt(0), 0xfeff);
  assert.equal(csv.slice(1).split("\r\n").length, 2);
});

test("builds a bounded portable filename", () => {
  assert.equal(exportFilename("M & A / Home", "2026-08-23"), "twocents-m-a-home-2026-08-23.csv");
  assert.equal(exportFilename("✨", "2026-08-23"), "twocents-household-2026-08-23.csv");
});

test("export queries never cross the household boundary", async () => {
  await installTestDatabase();
  try {
    const database = db();
    await database.query(
      `INSERT INTO users (id, email, name, password_hash, created_at)
       VALUES ('user-1', 'export@example.com', 'Export', 'unused', $1)`,
      [Date.now()]
    );
    for (const [id, name, code] of [
      ["household-1", "Us", "EXPORT01"],
      ["household-2", "Other", "EXPORT02"],
    ]) {
      await database.query(
        `INSERT INTO households (id, name, home_currency, invite_code, created_at)
         VALUES ($1, $2, 'INR', $3, $4)`,
        [id, name, code, Date.now()]
      );
    }
    for (const [id, householdId] of [["ours", "household-1"], ["theirs", "household-2"]]) {
      await database.query(
        `INSERT INTO expenses
         (id, household_id, user_id, amount_minor, currency, fx_to_home, spent_on, source, created_at)
         VALUES ($1, $2, 'user-1', 10000, 'INR', 1, '2026-08-23', 'web', $3)`,
        [id, householdId, Date.now()]
      );
    }

    assert.deepEqual(
      (await listExpensesForExport("household-1")).map((item) => item.id),
      ["ours"]
    );
  } finally {
    await closeDatabase();
  }
});
