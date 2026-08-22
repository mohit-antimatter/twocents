import assert from "node:assert/strict";
import test from "node:test";

import { isValidISODate, isValidTime, validateExpenseEdit } from "../lib/validation";

const validEdit = {
  amount: 450,
  currency: "INR",
  categoryId: "food",
  merchant: "Swiggy",
  note: "Dinner",
  spentOn: "2026-08-22",
  spentTime: "19:30",
};

test("validates actual calendar dates rather than only their shape", () => {
  assert.equal(isValidISODate("2026-02-28"), true);
  assert.equal(isValidISODate("2024-02-29"), true);
  assert.equal(isValidISODate("2026-02-30"), false);
  assert.equal(isValidISODate("2026-13-01"), false);
  assert.equal(isValidISODate("not-a-date"), false);
});

test("validates 24-hour times", () => {
  assert.equal(isValidTime("00:00"), true);
  assert.equal(isValidTime("23:59"), true);
  assert.equal(isValidTime("24:00"), false);
  assert.equal(isValidTime("19:99"), false);
});

test("accepts a valid edit and normalizes optional text", () => {
  const result = validateExpenseEdit(
    { ...validEdit, merchant: "  Swiggy  ", note: "" },
    ["food"]
  );
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.merchant, "Swiggy");
    assert.equal(result.value.note, null);
  }
});

test("rejects categories from another household", () => {
  const result = validateExpenseEdit(validEdit, ["transport"]);
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error, /doesn't belong/i);
});

test("rejects impossible time, date, and unsafe amount values", () => {
  for (const body of [
    { ...validEdit, spentOn: "2026-02-30" },
    { ...validEdit, spentTime: "19:99" },
    { ...validEdit, amount: Number.POSITIVE_INFINITY },
  ]) {
    assert.equal(validateExpenseEdit(body, ["food"]).ok, false);
  }
});

test("limits merchant and note lengths", () => {
  assert.equal(
    validateExpenseEdit({ ...validEdit, merchant: "m".repeat(121) }, ["food"]).ok,
    false
  );
  assert.equal(
    validateExpenseEdit({ ...validEdit, note: "n".repeat(501) }, ["food"]).ok,
    false
  );
});
