import assert from "node:assert/strict";
import test from "node:test";

import {
  createGoogleAuthorization,
  exchangeGoogleCode,
  findOrCreateGoogleUser,
  linkGoogleIdentity,
  validateGoogleIdToken,
  verifyGoogleState,
} from "../lib/google-auth";
import { GET as startGoogleSignIn } from "../app/api/auth/google/start/route";
import { createTestDatabase } from "./db-helpers";

function fakeIdToken(payload: Record<string, unknown>): string {
  return [
    Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url"),
    Buffer.from(JSON.stringify(payload)).toString("base64url"),
    "test-signature",
  ].join(".");
}

test("builds a state, nonce, and PKCE-protected Google authorization request", () => {
  const auth = createGoogleAuthorization(
    "client-id.apps.googleusercontent.com",
    "http://localhost:3000/api/auth/google/callback"
  );
  const url = new URL(auth.authorizationUrl);
  assert.equal(url.origin, "https://accounts.google.com");
  assert.equal(url.searchParams.get("scope"), "openid email profile");
  assert.equal(url.searchParams.get("state"), auth.state);
  assert.equal(url.searchParams.get("nonce"), auth.nonce);
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.ok(url.searchParams.get("code_challenge"));
  assert.equal(verifyGoogleState(auth.state, auth.state), true);
  assert.equal(verifyGoogleState(auth.state, "another-state"), false);
});

test("the Google start route sets short-lived OAuth cookies and never caches", async () => {
  const previousClientId = process.env.GOOGLE_CLIENT_ID;
  const previousClientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const previousAppUrl = process.env.APP_URL;
  process.env.GOOGLE_CLIENT_ID = "client-id.apps.googleusercontent.com";
  process.env.GOOGLE_CLIENT_SECRET = "client-secret";
  process.env.APP_URL = "http://localhost:3000";
  try {
    const response = await startGoogleSignIn(
      new Request("http://localhost:3000/api/auth/google/start")
    );
    assert.equal(response.status, 307);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.match(response.headers.get("location") ?? "", /^https:\/\/accounts\.google\.com\//);
    const setCookie = response.headers.get("set-cookie") ?? "";
    assert.match(setCookie, /tc_google_state=/);
    assert.match(setCookie, /tc_google_nonce=/);
    assert.match(setCookie, /tc_google_verifier=/);
    assert.match(setCookie, /HttpOnly/i);
    assert.match(setCookie, /SameSite=lax/i);
  } finally {
    if (previousClientId === undefined) delete process.env.GOOGLE_CLIENT_ID;
    else process.env.GOOGLE_CLIENT_ID = previousClientId;
    if (previousClientSecret === undefined) delete process.env.GOOGLE_CLIENT_SECRET;
    else process.env.GOOGLE_CLIENT_SECRET = previousClientSecret;
    if (previousAppUrl === undefined) delete process.env.APP_URL;
    else process.env.APP_URL = previousAppUrl;
  }
});

test("accepts a fresh Google identity token for this client and nonce", () => {
  const profile = validateGoogleIdToken(
    fakeIdToken({
      iss: "https://accounts.google.com",
      aud: "client-id",
      sub: "google-user-1",
      email: "Partner@Example.com",
      email_verified: true,
      name: "Partner",
      nonce: "expected-nonce",
      iat: 1_700_000_000,
      exp: 1_700_003_600,
    }),
    "client-id",
    "expected-nonce",
    1_700_000_100
  );
  assert.deepEqual(profile, {
    subject: "google-user-1",
    email: "partner@example.com",
    name: "Partner",
  });
});

test("rejects tokens for another client, nonce, or unverified email", () => {
  const base = {
    iss: "https://accounts.google.com",
    aud: "client-id",
    sub: "google-user-1",
    email: "partner@example.com",
    email_verified: true,
    nonce: "expected-nonce",
    exp: 1_700_003_600,
  };
  assert.throws(
    () => validateGoogleIdToken(fakeIdToken({ ...base, aud: "another-client" }), "client-id", "expected-nonce", 1_700_000_100),
    /could not verify/i
  );
  assert.throws(
    () => validateGoogleIdToken(fakeIdToken({ ...base, nonce: "wrong" }), "client-id", "expected-nonce", 1_700_000_100),
    /could not verify/i
  );
  assert.throws(
    () => validateGoogleIdToken(fakeIdToken({ ...base, email_verified: false }), "client-id", "expected-nonce", 1_700_000_100),
    /could not verify/i
  );
});

test("the code exchange confirms Google userinfo matches the identity token", async () => {
  const originalFetch = global.fetch;
  const token = fakeIdToken({
    iss: "https://accounts.google.com",
    aud: "client-id",
    sub: "google-user-1",
    email: "partner@example.com",
    email_verified: true,
    name: "Partner",
    nonce: "expected-nonce",
    iat: 1,
    exp: Math.floor(Date.now() / 1000) + 3600,
  });
  let call = 0;
  global.fetch = async () => {
    call += 1;
    if (call === 1) {
      return Response.json({ access_token: "google-access-token", id_token: token });
    }
    return Response.json({
      sub: "google-user-1",
      email: "partner@example.com",
      email_verified: true,
    });
  };
  try {
    assert.deepEqual(
      await exchangeGoogleCode({
        code: "one-time-code",
        clientId: "client-id",
        clientSecret: "client-secret",
        redirectUri: "http://localhost:3000/api/auth/google/callback",
        verifier: "pkce-verifier",
        nonce: "expected-nonce",
      }),
      { subject: "google-user-1", email: "partner@example.com", name: "Partner" }
    );
    assert.equal(call, 2);
  } finally {
    global.fetch = originalFetch;
  }
});

test("requires an existing password user to connect Google explicitly", async () => {
  const database = await createTestDatabase();
  try {
    await database.query(
      `INSERT INTO users (id, email, name, password_hash, created_at)
       VALUES ($1, $2, $3, $4, $5)`,
      ["existing-user", "partner@example.com", "Existing", "password-hash", 1]
    );
    const profile = {
      subject: "google-user-1",
      email: "partner@example.com",
      name: "Partner",
    };
    await assert.rejects(
      () => findOrCreateGoogleUser(profile, database),
      /already has a TwoCents account/i
    );
    await linkGoogleIdentity("existing-user", "partner@example.com", profile, database);
    assert.deepEqual(await findOrCreateGoogleUser(profile, database), {
      id: "existing-user",
      created: false,
    });
    const users = await database.query<{ count: number }>("SELECT COUNT(*) AS count FROM users");
    const identities = await database.query<{ count: number }>(
      "SELECT COUNT(*) AS count FROM auth_identities"
    );
    assert.equal(users.rows[0].count, 1);
    assert.equal(identities.rows[0].count, 1);
  } finally {
    await database.close();
  }
});

test("refuses to connect a different Google email to a password account", async () => {
  const database = await createTestDatabase();
  try {
    await database.query(
      `INSERT INTO users (id, email, name, password_hash, created_at)
       VALUES ($1, $2, $3, $4, $5)`,
      ["existing-user", "partner@example.com", "Existing", "password-hash", 1]
    );
    await assert.rejects(
      () =>
        linkGoogleIdentity(
          "existing-user",
          "partner@example.com",
          { subject: "google-user-2", email: "someone-else@example.com", name: "Else" },
          database
        ),
      /uses your TwoCents email/i
    );
  } finally {
    await database.close();
  }
});

test("creates a new local user for a new verified Google account", async () => {
  const database = await createTestDatabase();
  try {
    const user = await findOrCreateGoogleUser(
      { subject: "google-user-2", email: "new@example.com", name: "New Partner" },
      database
    );
    assert.equal(user.created, true);
    const stored = (
      await database.query<{ email: string; name: string; password_hash: string }>(
        "SELECT email, name, password_hash FROM users WHERE id = $1",
        [user.id]
      )
    ).rows[0];
    assert.equal(stored.email, "new@example.com");
    assert.equal(stored.name, "New Partner");
    assert.ok(stored.password_hash.startsWith("$2"));
  } finally {
    await database.close();
  }
});
