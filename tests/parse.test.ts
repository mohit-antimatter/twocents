import assert from "node:assert/strict";
import test from "node:test";

import { parseExpenseText, parsedExpenseError, type ParseContext } from "../lib/parse";

const context: ParseContext = {
  categories: ["Food & Drinks", "Groceries", "Transport", "Household Help", "Other"],
  homeCurrency: "INR",
  today: "2026-08-22",
};

function parse(text: string) {
  return parseExpenseText(text, context);
}

test("parses the supported fast-entry formats", () => {
  assert.deepEqual(
    parse("uber 340 yesterday"),
    {
      amount: 340,
      currency: null,
      category: "Transport",
      merchant: "Uber",
      note: null,
      spent_on: "2026-08-21",
      issue: null,
    }
  );

  const words = parse("three hundred on chai");
  assert.equal(words.amount, 300);
  assert.equal(words.category, "Food & Drinks");
  assert.equal(words.issue, null);

  const shorthand = parse("petrol 1.2k");
  assert.equal(shorthand.amount, 1200);
  assert.equal(shorthand.issue, null);
});

test("recognizes common household-help roles", () => {
  for (const role of ["maid", "cook", "nanny", "driver", "cleaner", "babysitter"]) {
    const parsed = parse(`${role} 1500`);
    assert.equal(parsed.category, "Household Help", role);
    assert.equal(parsed.merchant, role.charAt(0).toUpperCase() + role.slice(1), role);
  }
});

test("rejects negative amounts instead of silently making them positive", () => {
  const digits = parse("coffee -500");
  assert.equal(digits.amount, -500);
  assert.equal(digits.issue, "negative_amount");
  assert.match(parsedExpenseError(digits) ?? "", /positive/i);

  const words = parse("minus five hundred coffee");
  assert.equal(words.issue, "negative_amount");
  assert.match(parsedExpenseError(words) ?? "", /positive/i);
});

test("rejects inputs with multiple numeric phrases rather than guessing", () => {
  const parsed = parse("2026 dinner 2");
  assert.equal(parsed.issue, "ambiguous_amount");
  assert.match(parsedExpenseError(parsed) ?? "", /more than one number/i);
});

test("keeps formatted and foreign-currency amounts unambiguous", () => {
  const rupees = parse("groceries 2,500");
  assert.equal(rupees.amount, 2500);
  assert.equal(rupees.issue, null);

  const dollars = parse("$40 dinner");
  assert.equal(dollars.amount, 40);
  assert.equal(dollars.currency, "USD");
  assert.equal(dollars.issue, null);

  const compactCurrency = parse("USD40 dinner");
  assert.equal(compactCurrency.amount, 40);
  assert.equal(compactCurrency.currency, "USD");
  assert.equal(compactCurrency.issue, null);
});

test("rejects amounts that cannot be stored safely in minor units", () => {
  const parsed = parse("coffee 999999999999999999999999");
  assert.match(parsedExpenseError(parsed) ?? "", /too large/i);
});
