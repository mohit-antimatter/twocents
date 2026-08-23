import assert from "node:assert/strict";
import test from "node:test";

import { sessionCookieOptions } from "../lib/auth";

test("production sessions are inaccessible to scripts and sent only over HTTPS", () => {
  const options = sessionCookieOptions(true);
  assert.equal(options.httpOnly, true);
  assert.equal(options.secure, true);
  assert.equal(options.sameSite, "lax");
  assert.equal(options.path, "/");
  assert.equal(options.maxAge, 90 * 86400);
});

test("local development remains usable over HTTP", () => {
  assert.equal(sessionCookieOptions(false).secure, false);
});
