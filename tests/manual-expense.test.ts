import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, mock, test } from "node:test";
import headers from "next/headers";

import { POST } from "../app/api/expenses/route";
import { closeDatabase, db } from "../lib/db";
import { getEditableExpense, listRecentExpenses } from "../lib/expenses";
import { fxRate } from "../lib/money";
import { installTestDatabase } from "./db-helpers";

let sessionId: string | null = "session-one";
const fields = {
  amount: 12.75,
  currency: "USD",
  categoryId: "food-one",
  merchant: "7 Eleven 24",
  note: "  Weekly groceries  ",
  spentOn: "2026-08-20",
  spentTime: "18:35",
};

before(async () => {
  await installTestDatabase();
  for (const suffix of ["one", "two", "new"]) {
    await db().query(
      "INSERT INTO users (id, email, name, password_hash, created_at) VALUES ($1, $2, $3, $4, $5)",
      [`user-${suffix}`, `${suffix}@example.com`, `Person ${suffix}`, "unused", Date.now()]
    );
    await db().query("INSERT INTO sessions (id, user_id, expires_at) VALUES ($1, $2, $3)",
      [`session-${suffix}`, `user-${suffix}`, Date.now() + 60_000]);
    if (suffix === "new") continue;
    await db().query(
      "INSERT INTO households (id, name, home_currency, invite_code, created_at) VALUES ($1, $2, $3, $4, $5)",
      [`home-${suffix}`, `Household ${suffix}`, "INR", `INVITE-${suffix}`, Date.now()]
    );
    await db().query("INSERT INTO household_members (household_id, user_id, joined_at) VALUES ($1, $2, $3)",
      [`home-${suffix}`, `user-${suffix}`, Date.now()]);
    await db().query(
      "INSERT INTO categories (id, household_id, name, emoji, color, sort) VALUES ($1, $2, $3, $4, $5, $6)",
      [`food-${suffix}`, `home-${suffix}`, "Food & Drinks", "🍜", "#6B7A70", 0]
    );
  }
  // Keep real session/household resolution; only supply Next's request cookie store.
  mock.method(headers, "cookies", async () => ({
    get: (name: string) => name === "tc_session" && sessionId ? { value: sessionId } : undefined,
  }));
});

after(async () => {
  mock.restoreAll();
  await closeDatabase();
});

function request(body: unknown) {
  return new Request("http://localhost/api/expenses", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
}

async function count() {
  return (await db().query<{ count: number }>("SELECT COUNT(*) AS count FROM expenses")).rows[0].count;
}

test("manual capture requires a session and household membership", async () => {
  for (const sid of [null, "session-new"]) {
    sessionId = sid;
    assert.equal((await POST(request({ ...fields, requestId: randomUUID() }))).status, 401);
  }
  assert.equal(await count(), 0);
  sessionId = "session-one";
});

test("manual capture saves exact fields and uses the session's payer and household", async () => {
  const response = await POST(request({ ...fields, requestId: randomUUID(), userId: "user-two", householdId: "home-two" }));
  assert.equal(response.status, 201);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const result = await response.json();
  const row = (await db().query<Record<string, unknown>>("SELECT * FROM expenses WHERE id = $1", [result.id])).rows[0];
  assert.equal(row.household_id, "home-one");
  assert.equal(row.user_id, "user-one");
  assert.equal(row.amount_minor, 1275);
  assert.equal(row.fx_to_home, fxRate("USD", "INR"));
  assert.equal(row.category_id, "food-one");
  assert.equal(row.merchant, "7 Eleven 24");
  assert.equal(row.note, "Weekly groceries");
  assert.equal(row.spent_on, fields.spentOn);
  assert.equal(row.spent_time, fields.spentTime);
  assert.equal(row.raw_input, null);
  assert.equal(row.source, "web");
  assert.match(result.summary, /Food & Drinks.*7 Eleven 24/);
});

test("manual capture allows a named expense with optional details left blank", async () => {
  const response = await POST(request({
    amount: 0.01, merchant: "  Coffee  ", currency: "INR", spentOn: "2026-08-30", requestId: randomUUID(),
  }));
  assert.equal(response.status, 201);
  const { id } = await response.json();
  const row = (await db().query<Record<string, unknown>>("SELECT * FROM expenses WHERE id = $1", [id])).rows[0];
  assert.equal(row.amount_minor, 1);
  assert.equal(row.merchant, "Coffee");
  for (const key of ["category_id", "note", "spent_time"]) assert.equal(row[key], null);
});

test("manual capture requires an expense name even when a category or note is provided", async () => {
  const initialCount = await count();
  for (const merchant of [undefined, null, "", "   ", "\t\n", 123]) {
    const response = await POST(request({ ...fields, amount: 5, merchant, requestId: randomUUID() }));
    assert.equal(response.status, 422);
    assert.deepEqual(await response.json(), { error: "Enter an expense name." });
  }
  assert.equal(await count(), initialCount);
});

test("manual capture rejects invalid fields and foreign categories without writing", async () => {
  const initialCount = await count();
  for (const invalid of [
    { amount: 0 }, { amount: -1 }, { amount: 0.001 }, { amount: true }, { amount: "12.75" },
    { amount: 1e20 }, { currency: "XYZ" }, { currency: "toString" },
    { categoryId: "food-two" }, { spentOn: "2026-02-30" }, { spentTime: "25:00" },
    { merchant: "x".repeat(121) }, { note: "x".repeat(501) },
  ]) {
    const response = await POST(request({ ...fields, ...invalid, requestId: randomUUID() }));
    assert.equal(response.status, 422, JSON.stringify(invalid));
  }
  assert.equal(await count(), initialCount);
});

test("manual capture rejects malformed requests and missing retry IDs", async () => {
  const initialCount = await count();
  for (const body of [null, [], "text", fields, { ...fields, requestId: "invalid" }]) {
    assert.equal((await POST(request(body))).status, 400);
  }
  const malformed = new Request("http://localhost/api/expenses", { method: "POST", body: "not-json" });
  assert.equal((await POST(malformed)).status, 400);
  assert.equal(await count(), initialCount);
});

test("concurrent manual retries create one expense and return the same receipt", async () => {
  const initialCount = await count();
  const body = { ...fields, requestId: randomUUID() };
  const responses = await Promise.all([POST(request(body)), POST(request(body))]);
  assert.deepEqual(responses.map((response) => response.status).sort(), [200, 201]);
  const [first, retry] = await Promise.all(responses.map((response) => response.json()));
  assert.equal(first.id, retry.id);
  assert.equal(first.summary, retry.summary);
  assert.equal(await count(), initialCount + 1);
});

test("saved older expenses remain editable outside the latest 40 with household and payer scoping", async () => {
  const response = await POST(request({ ...fields, merchant: "Older purchase", spentOn: "2025-01-01", requestId: randomUUID() }));
  assert.equal(response.status, 201);
  const { id } = await response.json();
  for (let i = 0; i < 40; i++) {
    assert.equal((await POST(request({ ...fields, requestId: randomUUID() }))).status, 201);
  }
  const recent = await listRecentExpenses("home-one", 40);
  assert.equal(recent.length, 40);
  assert.equal(recent.some((expense) => expense.id === id), false);
  const editable = await getEditableExpense("home-one", "user-one", id);
  assert.equal(editable?.merchant, "Older purchase");
  assert.equal(editable?.category_name, "Food & Drinks");
  assert.equal(await getEditableExpense("home-two", "user-one", id), null);
  assert.equal(await getEditableExpense("home-one", "user-two", id), null);
  assert.equal(await getEditableExpense("home-one", "user-one", "missing"), null);
});
