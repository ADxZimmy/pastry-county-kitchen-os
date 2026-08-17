// Phase 016: invite-gated signup.
//
// This is the first endpoint in the app that creates an account from an
// unauthenticated request, so the things it must not do matter as much as the
// things it must. It must not open when unconfigured, must not create a
// server-mode account by accident, and must not store an email in a case that
// breaks the case-insensitive login lookup.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  SIGNUP_UNAVAILABLE,
  inviteCodeMatches,
  performSignup,
  signupConfigured,
  validateSignupInput
} from "./_signup.js";
import { MINIMUM_PASSWORD_LENGTH } from "../shared/policy.js";

const GOOD_PASSWORD = "Buttercream-Frosting-99";

// Records every statement so a test can assert what did and did not run.
function recordingSql({ existing = [], onInsert } = {}) {
  const statements = [];
  const sql = (strings, ...values) => {
    const text = Array.isArray(strings) ? strings.join("?") : String(strings);
    statements.push({ text: text.replace(/\s+/g, " ").trim(), values });
    if (/select id from app_users/i.test(text)) return Promise.resolve(existing);
    if (/insert into app_users/i.test(text)) {
      if (onInsert) return onInsert(values);
      return Promise.resolve([]);
    }
    if (/insert into app_sessions/i.test(text)) return Promise.resolve([]);
    if (/insert into audit_logs/i.test(text)) return Promise.resolve([]);
    return Promise.resolve([]);
  };
  sql.statements = statements;
  sql.ran = (pattern) => statements.some((s) => pattern.test(s.text));
  return sql;
}

describe("signup is closed unless the deployment opts in", () => {
  const original = process.env.SIGNUP_INVITE_CODE;
  afterEach(() => {
    if (original === undefined) delete process.env.SIGNUP_INVITE_CODE;
    else process.env.SIGNUP_INVITE_CODE = original;
  });

  it("reports unconfigured when the invite code is unset", () => {
    delete process.env.SIGNUP_INVITE_CODE;
    expect(signupConfigured()).toBe(false);
  });

  it("treats a blank or whitespace code as unset rather than as an empty password", () => {
    process.env.SIGNUP_INVITE_CODE = "   ";
    expect(signupConfigured()).toBe(false);
  });

  it("is configured once a real code is set", () => {
    process.env.SIGNUP_INVITE_CODE = "kitchen-test-2026";
    expect(signupConfigured()).toBe(true);
  });

  it("has an honest message that names no account", () => {
    expect(SIGNUP_UNAVAILABLE).toMatch(/not open/i);
    expect(SIGNUP_UNAVAILABLE).not.toMatch(/@/);
  });
});

describe("the invite code is compared without leaking its contents", () => {
  const original = process.env.SIGNUP_INVITE_CODE;
  beforeEach(() => {
    process.env.SIGNUP_INVITE_CODE = "kitchen-test-2026";
  });
  afterEach(() => {
    if (original === undefined) delete process.env.SIGNUP_INVITE_CODE;
    else process.env.SIGNUP_INVITE_CODE = original;
  });

  it("accepts the configured code", () => {
    expect(inviteCodeMatches("kitchen-test-2026")).toBe(true);
  });

  it("rejects a wrong code of the same length", () => {
    expect(inviteCodeMatches("kitchen-test-2025")).toBe(false);
  });

  it("rejects a shorter and a longer code without throwing", () => {
    // Both sides are hashed before comparison, so a length mismatch cannot
    // short-circuit the comparison and cannot raise on unequal buffer lengths.
    expect(inviteCodeMatches("short")).toBe(false);
    expect(inviteCodeMatches("kitchen-test-2026-with-extra")).toBe(false);
  });

  it("rejects an absent, empty or non-string code", () => {
    expect(inviteCodeMatches(undefined)).toBe(false);
    expect(inviteCodeMatches("")).toBe(false);
    expect(inviteCodeMatches(null)).toBe(false);
    expect(inviteCodeMatches({})).toBe(false);
  });

  it("rejects everything when no code is configured, so an unset env cannot open signup", () => {
    delete process.env.SIGNUP_INVITE_CODE;
    expect(inviteCodeMatches("")).toBe(false);
    expect(inviteCodeMatches("anything")).toBe(false);
  });
});

describe("input validation", () => {
  it("lowercases and trims the email so login's case-insensitive lookup stays sound", () => {
    const result = validateSignupInput({ fullName: " Ada Baker ", email: "  Ada.Baker@Example.COM ", password: GOOD_PASSWORD });
    expect(result.error).toBeUndefined();
    expect(result.email).toBe("ada.baker@example.com");
    expect(result.fullName).toBe("Ada Baker");
  });

  it("requires a name", () => {
    expect(validateSignupInput({ fullName: "  ", email: "a@b.com", password: GOOD_PASSWORD }).error).toMatch(/name/i);
  });

  it("rejects an address that is not an email", () => {
    for (const email of ["not-an-email", "no@domain", "@example.com", "spaces in@example.com", ""]) {
      expect(validateSignupInput({ fullName: "Ada", email, password: GOOD_PASSWORD }).error, email).toMatch(/email/i);
    }
  });

  it("applies the same password policy as a password reset", () => {
    const tooShort = "a".repeat(MINIMUM_PASSWORD_LENGTH - 1);
    expect(validateSignupInput({ fullName: "Ada", email: "a@b.com", password: tooShort }).error).toBeTruthy();
    expect(validateSignupInput({ fullName: "Ada", email: "a@b.com", password: GOOD_PASSWORD }).error).toBeUndefined();
  });
});

describe("performSignup writes a device account, or refuses cleanly", () => {
  const req = { headers: {}, socket: {} };

  it("stores the lowercased email, the device mode, and a hash rather than the password", async () => {
    const sql = recordingSql();
    const result = await performSignup(sql, req, { fullName: "Ada Baker", email: "ada@example.com", password: GOOD_PASSWORD });

    expect(result.user.email).toBe("ada@example.com");
    expect(result.user.dataMode).toBe("device");
    expect(result.user.role).toBe("Owner/Admin");

    const insert = sql.statements.find((s) => /insert into app_users/i.test(s.text));
    expect(insert).toBeTruthy();
    expect(insert.values).toContain("device");
    expect(insert.values).toContain("Owner/Admin");
    expect(insert.values).toContain("ada@example.com");
    expect(insert.values).not.toContain(GOOD_PASSWORD);
    expect(insert.values.some((v) => typeof v === "string" && v.startsWith("$2"))).toBe(true);
  });

  it("checks for an existing account case-insensitively", async () => {
    const sql = recordingSql();
    await performSignup(sql, req, { fullName: "Ada", email: "ada@example.com", password: GOOD_PASSWORD });
    const lookup = sql.statements.find((s) => /select id from app_users/i.test(s.text));
    expect(lookup.text).toMatch(/lower\(email\)/i);
  });

  it("refuses a duplicate with 409 and creates nothing", async () => {
    const sql = recordingSql({ existing: [{ id: "user-existing" }] });
    await expect(performSignup(sql, req, { fullName: "Ada", email: "ada@example.com", password: GOOD_PASSWORD }))
      .rejects.toMatchObject({ statusCode: 409 });
    expect(sql.ran(/insert into app_users/i)).toBe(false);
  });

  it("maps a concurrent duplicate insert to the same 409", async () => {
    const sql = recordingSql({
      onInsert: () => Promise.reject(Object.assign(new Error("duplicate key value violates unique constraint"), { code: "23505" }))
    });
    await expect(performSignup(sql, req, { fullName: "Ada", email: "ada@example.com", password: GOOD_PASSWORD }))
      .rejects.toMatchObject({ statusCode: 409 });
  });

  it("refuses with 503 on an unmigrated database rather than creating a server-mode account", async () => {
    // This is the invariant that makes every data_mode read safe during the
    // window between deploying and migrating: if the column is missing, no
    // device account can exist, so defaulting a missing column to "server" is
    // provably correct rather than merely tolerable.
    const sql = recordingSql({
      onInsert: () => Promise.reject(Object.assign(new Error('column "data_mode" of relation "app_users" does not exist'), { code: "42703" }))
    });
    await expect(performSignup(sql, req, { fullName: "Ada", email: "ada@example.com", password: GOOD_PASSWORD }))
      .rejects.toMatchObject({ statusCode: 503 });
    expect(sql.ran(/insert into app_sessions/i)).toBe(false);
  });

  it("issues a session, because signing up proves the credential", async () => {
    const sql = recordingSql();
    const result = await performSignup(sql, req, { fullName: "Ada", email: "ada@example.com", password: GOOD_PASSWORD });
    expect(result.session.token).toBeTruthy();
    expect(result.session.csrfToken).toBeTruthy();
    expect(sql.ran(/insert into app_sessions/i)).toBe(true);
  });

  it("records the self-registration in the audit trail without the password hash", async () => {
    const sql = recordingSql();
    await performSignup(sql, req, { fullName: "Ada", email: "ada@example.com", password: GOOD_PASSWORD });
    const auditRow = sql.statements.find((s) => /insert into audit_logs/i.test(s.text));
    expect(auditRow).toBeTruthy();
    expect(JSON.stringify(auditRow.values)).not.toMatch(/\$2[aby]\$/);
    expect(JSON.stringify(auditRow.values)).not.toContain(GOOD_PASSWORD);
  });
});
