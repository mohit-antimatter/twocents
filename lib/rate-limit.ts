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
export function consumeRateLimit(
  scope: string,
  identifier: string,
  policy: RateLimitPolicy,
  now = Date.now()
): RateLimitDecision {
  if (!Number.isInteger(policy.limit) || policy.limit < 1 || policy.windowMs < 1) {
    throw new Error("Invalid rate-limit policy.");
  }

  const keyHash = hashRateLimitKey(scope, identifier);
  const database = db();
  return database.transaction(() => {
    const row = database
      .prepare("SELECT attempts, reset_at FROM rate_limits WHERE key_hash = ?")
      .get(keyHash) as { attempts: number; reset_at: number } | undefined;

    if (!row || row.reset_at <= now) {
      const resetAt = now + policy.windowMs;
      database
        .prepare(
          `INSERT INTO rate_limits (key_hash, attempts, reset_at) VALUES (?, 1, ?)
           ON CONFLICT(key_hash) DO UPDATE SET attempts = 1, reset_at = excluded.reset_at`
        )
        .run(keyHash, resetAt);
      pruneExpiredLimits(now, keyHash);
      return decision(true, policy.limit - 1, resetAt, now);
    }

    if (row.attempts >= policy.limit) {
      return decision(false, 0, row.reset_at, now);
    }

    const attempts = row.attempts + 1;
    database
      .prepare("UPDATE rate_limits SET attempts = ? WHERE key_hash = ?")
      .run(attempts, keyHash);
    return decision(true, policy.limit - attempts, row.reset_at, now);
  }).immediate();
}

export function clearRateLimit(scope: string, identifier: string): void {
  db()
    .prepare("DELETE FROM rate_limits WHERE key_hash = ?")
    .run(hashRateLimitKey(scope, identifier));
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

function pruneExpiredLimits(now: number, currentKey: string): void {
  db()
    .prepare("DELETE FROM rate_limits WHERE reset_at <= ? AND key_hash != ?")
    .run(now, currentKey);
}
