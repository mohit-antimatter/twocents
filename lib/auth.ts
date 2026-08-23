import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { db, uid } from "./db";

const SESSION_COOKIE = "tc_session";
const SESSION_DAYS = 90;

export function sessionCookieOptions(isProduction = process.env.NODE_ENV === "production") {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: isProduction,
    path: "/",
    maxAge: SESSION_DAYS * 86400,
  };
}

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  householdId: string | null;
};

export function hashPassword(pw: string): string {
  return bcrypt.hashSync(pw, 10);
}

export function verifyPassword(pw: string, hash: string): boolean {
  return bcrypt.compareSync(pw, hash);
}

export async function createSession(userId: string): Promise<void> {
  const cookieStore = await cookies();
  const previousSessionId = cookieStore.get(SESSION_COOKIE)?.value;
  const id = crypto.randomBytes(32).toString("hex");
  const expires = Date.now() + SESSION_DAYS * 86400_000;
  const database = db();
  await database.transaction(async (client) => {
    if (previousSessionId) {
      await client.query("DELETE FROM sessions WHERE id = $1", [previousSessionId]);
    }
    await client.query(
      "INSERT INTO sessions (id, user_id, expires_at) VALUES ($1, $2, $3)",
      [id, userId, expires]
    );
  });
  cookieStore.set(SESSION_COOKIE, id, sessionCookieOptions());
}

export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  const sid = cookieStore.get(SESSION_COOKIE)?.value;
  if (sid) {
    await db().query("DELETE FROM sessions WHERE id = $1", [sid]);
  }
  cookieStore.delete(SESSION_COOKIE);
}

export async function destroyAllSessions(userId: string): Promise<void> {
  await db().query("DELETE FROM sessions WHERE user_id = $1", [userId]);
  (await cookies()).delete(SESSION_COOKIE);
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const sid = cookieStore.get(SESSION_COOKIE)?.value;
  if (!sid) return null;
  const row = (
    await db().query<{ id: string; email: string; name: string; expires_at: number }>(
      `SELECT u.id, u.email, u.name, s.expires_at
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.id = $1`,
      [sid]
    )
  ).rows[0];
  if (!row || row.expires_at <= Date.now()) {
    await db().query("DELETE FROM sessions WHERE id = $1", [sid]);
    cookieStore.delete(SESSION_COOKIE);
    return null;
  }
  const hh = (
    await db().query<{ household_id: string }>(
      "SELECT household_id FROM household_members WHERE user_id = $1 LIMIT 1",
      [row.id]
    )
  ).rows[0];
  return { ...row, householdId: hh?.household_id ?? null };
}

/** Resolve a bearer token (iPhone Shortcuts path) to its user. */
export async function getUserFromToken(bearer: string | null): Promise<SessionUser | null> {
  if (!bearer?.startsWith("Bearer ")) return null;
  const token = bearer.slice(7).trim();
  if (!token) return null;
  const hash = crypto.createHash("sha256").update(token).digest("hex");
  const row = (
    await db().query<{ id: string; email: string; name: string; token_id: string }>(
      `SELECT u.id, u.email, u.name, t.id AS token_id
       FROM api_tokens t JOIN users u ON u.id = t.user_id
       WHERE t.token_hash = $1`,
      [hash]
    )
  ).rows[0];
  if (!row) return null;
  await db().query("UPDATE api_tokens SET last_used_at = $1 WHERE id = $2", [
    Date.now(),
    row.token_id,
  ]);
  const hh = (
    await db().query<{ household_id: string }>(
      "SELECT household_id FROM household_members WHERE user_id = $1 LIMIT 1",
      [row.id]
    )
  ).rows[0];
  return { id: row.id, email: row.email, name: row.name, householdId: hh?.household_id ?? null };
}

export async function createApiToken(userId: string, label: string): Promise<string> {
  const token = "tc_" + crypto.randomBytes(24).toString("hex");
  const hash = crypto.createHash("sha256").update(token).digest("hex");
  await db().query(
    `INSERT INTO api_tokens (id, user_id, token_hash, label, created_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [uid(), userId, hash, label, Date.now()]
  );
  return token;
}
