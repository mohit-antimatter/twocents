import assert from "node:assert/strict";
import test from "node:test";

import { POST as login } from "../app/api/auth/login/route";
import { POST as signup } from "../app/api/auth/signup/route";
import { closeDatabase } from "../lib/db";
import { installTestDatabase } from "./db-helpers";

test("login route rejects malformed JSON without crashing", async () => {
  await installTestDatabase();
  try {
    const response = await login(
      new Request("http://localhost/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-forwarded-for": "203.0.113.20" },
        body: "not-json",
      })
    );
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: "Enter your email and password." });
  } finally {
    await closeDatabase();
  }
});

test("login route throttles repeated guesses for one address and account", async () => {
  await installTestDatabase();
  const request = () =>
    new Request("http://localhost/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": "203.0.113.21" },
      body: JSON.stringify({ email: "missing@example.com", password: "wrong-password" }),
    });

  try {
    for (let attempt = 0; attempt < 5; attempt++) {
      assert.equal((await login(request())).status, 401);
    }
    const blocked = await login(request());
    assert.equal(blocked.status, 429);
    assert.ok(Number(blocked.headers.get("retry-after")) > 0);
    assert.equal(blocked.headers.get("cache-control"), "no-store");
  } finally {
    await closeDatabase();
  }
});

test("signup route validates bounded account fields", async () => {
  await installTestDatabase();
  try {
    const response = await signup(
      new Request("http://localhost/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-forwarded-for": "203.0.113.22" },
        body: JSON.stringify({
          name: "A".repeat(81),
          email: "not-an-email",
          password: "x".repeat(129),
        }),
      })
    );
    assert.equal(response.status, 400);
  } finally {
    await closeDatabase();
  }
});
