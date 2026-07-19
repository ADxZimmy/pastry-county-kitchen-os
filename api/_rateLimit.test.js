import { describe, expect, it, beforeEach } from "vitest";
import { clearRateLimitBuckets, enforceAuthRateLimit, hashBucketKey, rateLimit, rateLimitKey, sharedRateLimit } from "./_rateLimit.js";

describe("certification rate limiting", () => {
  beforeEach(() => {
    clearRateLimitBuckets();
  });

  it("limits repeated attempts within the same window", () => {
    const key = "auth.login:127.0.0.1:certification@example.com";
    expect(rateLimit({ key, limit: 2, windowMs: 60_000, now: 1_000 })).toMatchObject({ limited: false, remaining: 1 });
    expect(rateLimit({ key, limit: 2, windowMs: 60_000, now: 2_000 })).toMatchObject({ limited: false, remaining: 0 });
    expect(rateLimit({ key, limit: 2, windowMs: 60_000, now: 3_000 })).toMatchObject({ limited: true, remaining: 0 });
  });

  it("opens a new bucket after the window resets", () => {
    const key = "api.actions:127.0.0.1:unknown";
    expect(rateLimit({ key, limit: 1, windowMs: 1_000, now: 1_000 }).limited).toBe(false);
    expect(rateLimit({ key, limit: 1, windowMs: 1_000, now: 1_500 }).limited).toBe(true);
    expect(rateLimit({ key, limit: 1, windowMs: 1_000, now: 2_100 }).limited).toBe(false);
  });

  it("derives keys from forwarded client IP and normalized identity", () => {
    expect(rateLimitKey({
      headers: { "x-forwarded-for": "203.0.113.10, 10.0.0.1" }
    }, "auth.login", "Cert@Example.COM")).toBe("auth.login:203.0.113.10:cert@example.com");
  });
});

describe("shared rate limiting (RS-006)", () => {
  const req = { headers: { "x-forwarded-for": "203.0.113.10" } };

  beforeEach(() => {
    clearRateLimitBuckets();
  });

  it("never stores the address or email in the clear", () => {
    const key = "auth.login:203.0.113.10:owner@pastrycounty.ng";
    const hashed = hashBucketKey(key);
    expect(hashed).not.toContain("203.0.113.10");
    expect(hashed).not.toContain("owner@pastrycounty.ng");
    expect(hashBucketKey(key)).toBe(hashed);
    expect(hashBucketKey(`${key}x`)).not.toBe(hashed);
  });

  // The whole point of RS-006: the count must come back from one atomic
  // statement, so two serverless instances racing cannot both read "1 attempt".
  it("counts in a single upsert that resets its own window", async () => {
    const statements = [];
    const sql = async (strings) => {
      const text = strings.join("?");
      statements.push(text);
      return [{ attemptCount: 3, retryAfterSeconds: 42 }];
    };
    const result = await sharedRateLimit(sql, { key: "auth.login:ip:user", limit: 5, windowMs: 60_000 });
    expect(result).toMatchObject({ limited: false, limit: 5, remaining: 2, retryAfterSeconds: 42, shared: true });

    const upsert = statements.find((text) => text.includes("insert into auth_rate_limits"));
    expect(upsert).toBeTruthy();
    expect(upsert).toContain("on conflict (bucket_key) do update");
    // The expired-window reset happens inside the same statement, not as a
    // separate read-then-write that could interleave.
    expect(upsert).toContain("case when auth_rate_limits.expires_at <= now() then 1 else auth_rate_limits.attempt_count + 1 end");
  });

  it("limits once the shared count passes the limit", async () => {
    const sql = async () => [{ attemptCount: 6, retryAfterSeconds: 30 }];
    const result = await sharedRateLimit(sql, { key: "auth.login:ip:user", limit: 5, windowMs: 60_000 });
    expect(result).toMatchObject({ limited: true, remaining: 0 });
  });

  it("creates the table on first use rather than failing the request", async () => {
    let created = false;
    const sql = async (strings) => {
      const text = strings.join("?");
      if (text.includes("create table if not exists auth_rate_limits")) {
        created = true;
        return [];
      }
      if (text.includes("create index")) return [];
      if (!created) throw Object.assign(new Error("relation does not exist"), { code: "42P01" });
      return [{ attemptCount: 1, retryAfterSeconds: 60 }];
    };
    const result = await sharedRateLimit(sql, { key: "auth.login:ip:user", limit: 5, windowMs: 60_000 });
    expect(created).toBe(true);
    expect(result.limited).toBe(false);
  });

  it("stops an attacker at the per-instance layer before touching the database", async () => {
    const sql = () => {
      throw new Error("the shared counter must not be consulted once the local layer already refused");
    };
    const options = { scope: "auth.login", identity: "victim@example.com", limit: 1, windowMs: 60_000 };
    // First call is allowed locally and would consult the shared store, so give
    // it one that answers.
    await enforceAuthRateLimit(async () => [{ attemptCount: 1, retryAfterSeconds: 60 }], req, options);
    await enforceAuthRateLimit(async () => [{ attemptCount: 2, retryAfterSeconds: 60 }], req, options);
    // By now the local bucket alone is over the limit and short-circuits.
    const third = await enforceAuthRateLimit(sql, req, options);
    expect(third.limited).toBe(true);
  });

  // A database blip must degrade throttling, not remove it and not lock the
  // world out.
  it("falls back to the per-instance verdict when the shared store is unreachable", async () => {
    const previous = process.env.VERCEL_ENV;
    process.env.VERCEL_ENV = "production";
    try {
      const sql = async () => {
        throw new Error("connection refused");
      };
      const result = await enforceAuthRateLimit(sql, req, { scope: "auth.login", identity: "a@b.c", limit: 5, windowMs: 60_000 });
      expect(result.limited).toBe(false);
      expect(result.shared).toBeUndefined();
    } finally {
      if (previous === undefined) delete process.env.VERCEL_ENV;
      else process.env.VERCEL_ENV = previous;
    }
  });
});
