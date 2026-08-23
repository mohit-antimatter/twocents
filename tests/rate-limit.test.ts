import assert from "node:assert/strict";
import test from "node:test";

import { closeDatabase, db } from "../lib/db";
import { clearRateLimit, consumeRateLimit } from "../lib/rate-limit";
import { installTestDatabase } from "./db-helpers";

test("rate limits block excess attempts, reset, and do not store raw identifiers", async () => {
  await installTestDatabase();
  try {
    const policy = { limit: 2, windowMs: 60_000 };
    const first = await consumeRateLimit("login", "203.0.113.10:user@example.com", policy, 1_000);
    const second = await consumeRateLimit("login", "203.0.113.10:user@example.com", policy, 2_000);
    const blocked = await consumeRateLimit("login", "203.0.113.10:user@example.com", policy, 3_000);

    assert.equal(first.allowed, true);
    assert.equal(first.remaining, 1);
    assert.equal(second.allowed, true);
    assert.equal(second.remaining, 0);
    assert.equal(blocked.allowed, false);
    assert.equal(blocked.retryAfterSeconds, 58);

    const stored = (
      await db().query<{ key_hash: string; attempts: number }>(
        "SELECT key_hash, attempts FROM rate_limits"
      )
    ).rows[0];
    assert.match(stored.key_hash, /^[a-f0-9]{64}$/);
    assert.equal(stored.key_hash.includes("203.0.113.10"), false);
    assert.equal(stored.attempts, 2);

    const reset = await consumeRateLimit("login", "203.0.113.10:user@example.com", policy, 61_000);
    assert.equal(reset.allowed, true);
    assert.equal(reset.remaining, 1);

    await clearRateLimit("login", "203.0.113.10:user@example.com");
    const afterClear = await consumeRateLimit("login", "203.0.113.10:user@example.com", policy, 62_000);
    assert.equal(afterClear.allowed, true);
    assert.equal(afterClear.remaining, 1);
  } finally {
    await closeDatabase();
  }
});

test("rate-limit scopes and identifiers remain independent", async () => {
  await installTestDatabase();
  try {
    const policy = { limit: 1, windowMs: 60_000 };
    assert.equal((await consumeRateLimit("signup", "address-a", policy, 100_000)).allowed, true);
    assert.equal((await consumeRateLimit("signup", "address-a", policy, 100_001)).allowed, false);
    assert.equal((await consumeRateLimit("signup", "address-b", policy, 100_001)).allowed, true);
    assert.equal((await consumeRateLimit("login", "address-a", policy, 100_001)).allowed, true);
  } finally {
    await closeDatabase();
  }
});
