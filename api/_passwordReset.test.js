import { describe, expect, it } from "vitest";
import {
  GENERIC_RESET_FAILURE,
  GENERIC_RESET_RESPONSE,
  RESET_UNAVAILABLE,
  consumeResetToken,
  hashResetToken,
  normalizeEmail,
  resetDeliveryConfigured,
  resetEmailBody,
  resetLinkFor
} from "./_passwordReset.js";
import { MINIMUM_PASSWORD_LENGTH, passwordsMatch, validatePasswordStrength } from "../shared/policy.js";

describe("reset token storage", () => {
  it("stores only a hash, never the token", () => {
    const token = "a-high-entropy-reset-token";
    const hash = hashResetToken(token);
    expect(hash).not.toContain(token);
    expect(hash).toHaveLength(64);
    expect(hashResetToken(token)).toBe(hash);
    expect(hashResetToken("different")).not.toBe(hash);
  });

  it("normalizes the email so casing and padding cannot fork the lookup", () => {
    expect(normalizeEmail("  Owner@PastryCounty.NG ")).toBe("owner@pastrycounty.ng");
    expect(normalizeEmail(undefined)).toBe("");
  });
});

describe("reset token redemption", () => {
  // The UPDATE carries the validity check in its WHERE clause, so an already
  // used or expired token simply matches no row.
  const rowsFor = (statement, matched) => {
    const sql = String(statement.join("?"));
    expect(sql).toContain("used_at is null");
    expect(sql).toContain("expires_at > now()");
    return matched ? [{ userId: "user-1" }] : [];
  };

  it("returns the user for a valid token", async () => {
    expect(await consumeResetToken(async (s) => rowsFor(s, true), "good-token")).toBe("user-1");
  });

  it("refuses an unknown, expired, or already-used token identically", async () => {
    expect(await consumeResetToken(async (s) => rowsFor(s, false), "stale-token")).toBeNull();
  });

  it("refuses an empty token without touching the database", async () => {
    const sql = () => {
      throw new Error("must not query for an empty token");
    };
    expect(await consumeResetToken(sql, "")).toBeNull();
  });

  it("treats a missing table as an invalid token rather than a 500", async () => {
    const sql = async () => {
      throw Object.assign(new Error('relation "password_reset_tokens" does not exist'), { code: "42P01" });
    };
    expect(await consumeResetToken(sql, "any")).toBeNull();
  });
});

describe("account enumeration", () => {
  it("uses one response for every reset request", () => {
    expect(GENERIC_RESET_RESPONSE.ok).toBe(true);
    // Nothing in the wording distinguishes a known address from an unknown one.
    expect(GENERIC_RESET_RESPONSE.message).toMatch(/if that email belongs/i);
    expect(GENERIC_RESET_RESPONSE.message).not.toMatch(/\bnot found|no account|unknown|does not exist/i);
  });

  it("uses one failure message for unknown, expired, and used links", () => {
    expect(GENERIC_RESET_FAILURE).toMatch(/no longer valid/i);
    expect(GENERIC_RESET_FAILURE).not.toMatch(/expired|already used|unknown/i);
  });
});

describe("delivery capability", () => {
  const withEnv = (values, run) => {
    const previous = { RESEND_API_KEY: process.env.RESEND_API_KEY, RESEND_FROM_EMAIL: process.env.RESEND_FROM_EMAIL };
    Object.entries(values).forEach(([key, value]) => {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    });
    try {
      run();
    } finally {
      Object.entries(previous).forEach(([key, value]) => {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      });
    }
  };

  it("is false when no sender is configured", () => {
    withEnv({ RESEND_API_KEY: undefined, RESEND_FROM_EMAIL: undefined }, () => {
      expect(resetDeliveryConfigured()).toBe(false);
    });
    withEnv({ RESEND_API_KEY: "key", RESEND_FROM_EMAIL: undefined }, () => {
      expect(resetDeliveryConfigured()).toBe(false);
    });
  });

  it("is false for the Resend sandbox sender, which cannot reach real inboxes", () => {
    withEnv({ RESEND_API_KEY: "key", RESEND_FROM_EMAIL: "onboarding@resend.dev" }, () => {
      expect(resetDeliveryConfigured()).toBe(false);
    });
  });

  it("is true once a real sender domain is configured", () => {
    withEnv({ RESEND_API_KEY: "key", RESEND_FROM_EMAIL: "kitchen@pastrycounty.ng" }, () => {
      expect(resetDeliveryConfigured()).toBe(true);
    });
  });

  it("says so plainly rather than claiming a link was sent", () => {
    expect(RESET_UNAVAILABLE).toMatch(/not set up yet/i);
    expect(RESET_UNAVAILABLE).not.toMatch(/on its way|sent|check your/i);
  });
});

describe("reset link construction", () => {
  const req = (headers) => ({ headers });

  it("prefers configured origin over request headers", () => {
    const previous = process.env.APP_ORIGIN;
    process.env.APP_ORIGIN = "https://kitchen.example/";
    try {
      const link = resetLinkFor("tok en/value", req({ "x-forwarded-host": "attacker.example" }));
      expect(link.startsWith("https://kitchen.example/#/reset/")).toBe(true);
      expect(link).not.toContain("attacker.example");
      // The token is URL-encoded, so it survives the round trip intact.
      expect(link).toContain(encodeURIComponent("tok en/value"));
    } finally {
      if (previous === undefined) delete process.env.APP_ORIGIN;
      else process.env.APP_ORIGIN = previous;
    }
  });

  it("states the single-use expiry in the email", () => {
    const body = resetEmailBody("https://kitchen.example/#/reset/abc");
    expect(body).toContain("https://kitchen.example/#/reset/abc");
    expect(body).toMatch(/works once/i);
    expect(body).toMatch(/30 minutes/);
    expect(body).toMatch(/did not request/i);
  });
});

describe("password strength policy", () => {
  it("requires a workable length", () => {
    expect(validatePasswordStrength("")).toMatch(/enter a new password/i);
    expect(validatePasswordStrength("short1234")).toMatch(new RegExp(`${MINIMUM_PASSWORD_LENGTH} characters`));
    expect(validatePasswordStrength("a".repeat(201))).toMatch(/200 characters or fewer/i);
  });

  it("rejects low-variety and padded values", () => {
    expect(validatePasswordStrength("aaaaaaaaaaaaaa")).toMatch(/more varied/i);
    expect(validatePasswordStrength(" leadingspace1234")).toMatch(/space at the start or end/i);
  });

  it("accepts a long passphrase without demanding symbols", () => {
    expect(validatePasswordStrength("correct horse battery staple")).toBeNull();
  });

  it("accepts a shorter password that mixes letters and numbers", () => {
    expect(validatePasswordStrength("kitchen0psrun")).toBeNull();
    expect(validatePasswordStrength("kitchenopsrun")).toMatch(/add a number/i);
  });

  it("compares confirmation exactly", () => {
    expect(passwordsMatch("correct horse battery staple", "correct horse battery staple")).toBe(true);
    expect(passwordsMatch("correct horse battery staple", "correct horse battery stapl")).toBe(false);
  });
});
