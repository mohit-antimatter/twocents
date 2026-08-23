import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { POST as login } from "../app/api/auth/login/route";
import { POST as signup } from "../app/api/auth/signup/route";

test("login route rejects malformed JSON without crashing", async () => {
  const originalCwd = process.cwd();
  process.chdir(mkdtempSync(path.join(os.tmpdir(), "twocents-auth-routes-")));

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
    process.chdir(originalCwd);
  }
});

test("login route throttles repeated guesses for one address and account", async () => {
  const request = () =>
    new Request("http://localhost/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": "203.0.113.21" },
      body: JSON.stringify({ email: "missing@example.com", password: "wrong-password" }),
    });

  for (let attempt = 0; attempt < 5; attempt++) {
    assert.equal((await login(request())).status, 401);
  }
  const blocked = await login(request());
  assert.equal(blocked.status, 429);
  assert.ok(Number(blocked.headers.get("retry-after")) > 0);
  assert.equal(blocked.headers.get("cache-control"), "no-store");
});

test("signup route validates bounded account fields", async () => {
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
});
