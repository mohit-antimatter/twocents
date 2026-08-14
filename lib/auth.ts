import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { db, uid } from "./db";

const SESSION_COOKIE = "tc_session";
const SESSION_DAYS = 90;

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

export function createSession(userId: string): void {
  const id = crypto.randomBytes(32).toString("hex");
  const expires = Date.now() + SESSION_DAYS * 86400_000;
  db()
    .prepare("INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)")
    .run(id, userId, expires);
  cookies().set(SESSION_COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 86400,
  });
}

export function destroySession(): void {
  const sid = cookies().get(SESSION_COOKIE)?.value;
  if (sid) {
    db().prepare("DELETE FROM sessions WHERE id = ?").run(sid);
    cookies().delete(SESSION_COOKIE);
  }
}

export function getSessionUser(): SessionUser | null {
  const sid = cookies().get(SESSION_COOKIE)?.value;
  if (!sid) return null;
  const row = db()
    .prepare(
      `SELECT u.id, u.email, u.name
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.id = ? AND s.expires_at > ?`
    )
    .get(sid, Date.now()) as { id: string; email: string; name: string } | undefined;
  if (!row) return null;
  const hh = db()
    .prepare("SELECT household_id FROM household_members WHERE user_id = ? LIMIT 1")
    .get(row.id) as { household_id: string } | undefined;
  return { ...row, householdId: hh?.household_id ?? null };
}

/** Resolve a bearer token (iPhone Shortcuts path) to its user. */
export function getUserFromToken(bearer: string | null): SessionUser | null {
  if (!bearer?.startsWith("Bearer ")) return null;
  const token = bearer.slice(7).trim();
  if (!token) return null;
  const hash = crypto.createHash("sha256").update(token).digest("hex");
  const row = db()
    .prepare(
      `SELECT u.id, u.email, u.name, t.id AS token_id
       FROM api_tokens t JOIN users u ON u.id = t.user_id
       WHERE t.token_hash = ?`
    )
    .get(hash) as { id: string; email: string; name: string; token_id: string } | undefined;
  if (!row) return null;
  db()
    .prepare("UPDATE api_tokens SET last_used_at = ? WHERE id = ?")
    .run(Date.now(), row.token_id);
  const hh = db()
    .prepare("SELECT household_id FROM household_members WHERE user_id = ? LIMIT 1")
    .get(row.id) as { household_id: string } | undefined;
  return { id: row.id, email: row.email, name: row.name, householdId: hh?.household_id ?? null };
}

export function createApiToken(userId: string, label: string): string {
  const token = "tc_" + crypto.randomBytes(24).toString("hex");
  const hash = crypto.createHash("sha256").update(token).digest("hex");
  db()
    .prepare("INSERT INTO api_tokens (id, user_id, token_hash, label, created_at) VALUES (?, ?, ?, ?, ?)")
    .run(uid(), userId, hash, label, Date.now());
  return token;
}
