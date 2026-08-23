import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { db } from "../lib/db";
import { clearRateLimit, consumeRateLimit } from "../lib/rate-limit";

test("rate limits block excess attempts, reset, and do not store raw identifiers", () => {
  const originalCwd = process.cwd();
  process.chdir(mkdtempSync(path.join(os.tmpdir(), "twocents-rate-limit-")));

  try {
    const policy = { limit: 2, windowMs: 60_000 };
    const first = consumeRateLimit("login", "203.0.113.10:user@example.com", policy, 1_000);
    const second = consumeRateLimit("login", "203.0.113.10:user@example.com", policy, 2_000);
    const blocked = consumeRateLimit("login", "203.0.113.10:user@example.com", policy, 3_000);

    assert.equal(first.allowed, true);
    assert.equal(first.remaining, 1);
    assert.equal(second.allowed, true);
    assert.equal(second.remaining, 0);
    assert.equal(blocked.allowed, false);
    assert.equal(blocked.retryAfterSeconds, 58);

    const stored = db()
      .prepare("SELECT key_hash, attempts FROM rate_limits")
      .get() as { key_hash: string; attempts: number };
    assert.match(stored.key_hash, /^[a-f0-9]{64}$/);
    assert.equal(stored.key_hash.includes("203.0.113.10"), false);
    assert.equal(stored.attempts, 2);

    const reset = consumeRateLimit("login", "203.0.113.10:user@example.com", policy, 61_000);
    assert.equal(reset.allowed, true);
    assert.equal(reset.remaining, 1);

    clearRateLimit("login", "203.0.113.10:user@example.com");
    const afterClear = consumeRateLimit("login", "203.0.113.10:user@example.com", policy, 62_000);
    assert.equal(afterClear.allowed, true);
    assert.equal(afterClear.remaining, 1);
  } finally {
    process.chdir(originalCwd);
  }
});

test("rate-limit scopes and identifiers remain independent", () => {
  const policy = { limit: 1, windowMs: 60_000 };
  assert.equal(consumeRateLimit("signup", "address-a", policy, 100_000).allowed, true);
  assert.equal(consumeRateLimit("signup", "address-a", policy, 100_001).allowed, false);
  assert.equal(consumeRateLimit("signup", "address-b", policy, 100_001).allowed, true);
  assert.equal(consumeRateLimit("login", "address-a", policy, 100_001).allowed, true);
});
