import crypto from "crypto";

import { db } from "./db";

export type RateLimitPolicy = {
  limit: number;
  windowMs: number;
};

export type RateLimitDecision = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
  resetAt: number;
};

export const RATE_LIMITS = {
  loginByAddress: { limit: 30, windowMs: 15 * 60_000 },
  loginByAccountAndAddress: { limit: 5, windowMs: 15 * 60_000 },
  signupByAddress: { limit: 5, windowMs: 60 * 60_000 },
  joinByUser: { limit: 10, windowMs: 15 * 60_000 },
  inviteRotationByUser: { limit: 5, windowMs: 60 * 60_000 },
  tokenCreationByUser: { limit: 5, windowMs: 60 * 60_000 },
} satisfies Record<string, RateLimitPolicy>;

/**
 * Fixed-window limiter persisted in the application database. Identifiers are
 * HMACed before storage, so IP addresses and email addresses are not retained.
 */
export async function consumeRateLimit(
  scope: string,
  identifier: string,
  policy: RateLimitPolicy,
  now = Date.now()
): Promise<RateLimitDecision> {
  if (!Number.isInteger(policy.limit) || policy.limit < 1 || policy.windowMs < 1) {
    throw new Error("Invalid rate-limit policy.");
  }

  const keyHash = hashRateLimitKey(scope, identifier);
  const resetAt = now + policy.windowMs;
  const row = (
    await db().query<{ attempts: number; reset_at: number; allowed: boolean }>(
      `WITH consumed AS (
         INSERT INTO rate_limits (key_hash, attempts, reset_at)
         VALUES ($1, 1, $2)
         ON CONFLICT (key_hash) DO UPDATE SET
           attempts = CASE
             WHEN rate_limits.reset_at <= $3 THEN 1
             ELSE rate_limits.attempts + 1
           END,
           reset_at = CASE
             WHEN rate_limits.reset_at <= $3 THEN EXCLUDED.reset_at
             ELSE rate_limits.reset_at
           END
         WHERE rate_limits.reset_at <= $3 OR rate_limits.attempts < $4
         RETURNING attempts, reset_at
       )
       SELECT attempts, reset_at, TRUE AS allowed FROM consumed
       UNION ALL
       SELECT attempts, reset_at, FALSE AS allowed
       FROM rate_limits
       WHERE key_hash = $1 AND NOT EXISTS (SELECT 1 FROM consumed)`,
      [keyHash, resetAt, now, policy.limit]
    )
  ).rows[0];
  await pruneExpiredLimits(now, keyHash);
  return decision(
    row.allowed,
    Math.max(0, policy.limit - row.attempts),
    row.reset_at,
    now
  );
}

export async function clearRateLimit(scope: string, identifier: string): Promise<void> {
  await db().query("DELETE FROM rate_limits WHERE key_hash = $1", [
    hashRateLimitKey(scope, identifier),
  ]);
}

export function clientAddress(request: Request): string {
  const forwarded =
    request.headers.get("x-vercel-forwarded-for") ??
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for") ??
    request.headers.get("x-real-ip");
  return forwarded?.split(",")[0]?.trim() || "unknown";
}

export function rateLimitHeaders(result: RateLimitDecision): HeadersInit {
  return {
    "Cache-Control": "no-store",
    "Retry-After": String(result.retryAfterSeconds),
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": String(Math.ceil(result.resetAt / 1000)),
  };
}

function hashRateLimitKey(scope: string, identifier: string): string {
  const configuredSecret = process.env.RATE_LIMIT_SECRET;
  if (!configuredSecret && process.env.NODE_ENV === "production") {
    throw new Error("RATE_LIMIT_SECRET is required in production.");
  }
  return crypto
    .createHmac("sha256", configuredSecret || "twocents-development-rate-limit")
    .update(`${scope}\0${identifier}`)
    .digest("hex");
}

function decision(
  allowed: boolean,
  remaining: number,
  resetAt: number,
  now: number
): RateLimitDecision {
  return {
    allowed,
    remaining,
    resetAt,
    retryAfterSeconds: Math.max(1, Math.ceil((resetAt - now) / 1000)),
  };
}

async function pruneExpiredLimits(now: number, currentKey: string): Promise<void> {
  await db().query(
    "DELETE FROM rate_limits WHERE reset_at <= $1 AND key_hash != $2",
    [now, currentKey]
  );
}
