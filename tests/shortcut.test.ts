import assert from "node:assert/strict";
import { test } from "node:test";
import { GET } from "../app/add/route";
import { ADD_EXPENSE_INTENT_COOKIE } from "../lib/shortcut";

test("shortcut launch preserves only a short-lived form intent, never an external redirect", async () => {
  const response = await GET(new Request("https://ourpool.vercel.app/add?next=https://example.com"));
  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), "https://ourpool.vercel.app/");
  assert.match(response.headers.get("cache-control") ?? "", /no-store/);
  const intent = response.cookies.get(ADD_EXPENSE_INTENT_COOKIE);
  assert.equal(intent?.value, "1");
  assert.equal(intent?.maxAge, 600);
  assert.equal(intent?.path, "/");
  assert.equal(intent?.sameSite, "lax");
  assert.equal(intent?.secure, true);
  assert.equal(response.cookies.getAll().length, 1);
  assert.equal(response.cookies.get("tc_session"), undefined);
});

test("shortcut link works on local HTTP without requiring a Secure cookie", async () => {
  const response = await GET(new Request("http://127.0.0.1:3101/add"));
  assert.equal(response.headers.get("location"), "http://127.0.0.1:3101/");
  assert.equal(response.cookies.get(ADD_EXPENSE_INTENT_COOKIE)?.secure, false);
});
