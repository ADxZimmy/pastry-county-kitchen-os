import { describe, expect, it, beforeEach } from "vitest";
import { clearRateLimitBuckets, rateLimit, rateLimitKey } from "./_rateLimit.js";

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
