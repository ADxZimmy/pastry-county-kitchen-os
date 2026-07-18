import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  clearedSessionCookie,
  csrfViolation,
  hashSessionToken,
  isSafeMethod,
  originAllowed,
  parseCookies,
  readSessionCookie,
  requestOrigin,
  serializeSessionCookie,
  sessionCookieName,
  timingSafeEquals
} from "./_sessions.js";
import { authenticateRequest, bearerCompatEnabled, createSessionToken, enforceRequestCsrf } from "./_auth.js";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

function request({ method = "POST", headers = {} } = {}) {
  return { method, headers };
}

describe("session cookie attributes", () => {
  it("uses the __Host- prefix and full protection in production", () => {
    const cookie = serializeSessionCookie("abc123", { production: true });
    expect(cookie).toContain("__Host-pcko_session=abc123");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Path=/");
    // __Host- is only honoured by browsers when no Domain is set.
    expect(cookie).not.toContain("Domain=");
  });

  it("uses a separate non-Secure cookie for local development", () => {
    const cookie = serializeSessionCookie("abc123", { production: false });
    expect(cookie).toContain("pcko_session_dev=abc123");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).not.toContain("Secure");
    expect(sessionCookieName(false)).not.toBe(sessionCookieName(true));
  });

  it("expires the cookie when cleared", () => {
    expect(clearedSessionCookie({ production: true })).toContain("Max-Age=0");
  });

  it("parses cookies and ignores malformed pairs", () => {
    const jar = parseCookies("a=1; __Host-pcko_session=tok%20en; broken; =nokey");
    expect(jar.a).toBe("1");
    expect(jar["__Host-pcko_session"]).toBe("tok en");
    expect(jar.broken).toBeUndefined();
  });

  it("reads the cookie matching the runtime", () => {
    const req = request({ headers: { cookie: "__Host-pcko_session=prod; pcko_session_dev=dev" } });
    expect(readSessionCookie(req, true)).toBe("prod");
    expect(readSessionCookie(req, false)).toBe("dev");
  });
});

describe("token storage", () => {
  it("hashes session tokens so a database dump cannot be replayed", () => {
    const token = "super-secret-token";
    const hash = hashSessionToken(token);
    expect(hash).not.toContain(token);
    expect(hash).toHaveLength(64);
    expect(hashSessionToken(token)).toBe(hash);
    expect(hashSessionToken("other")).not.toBe(hash);
  });

  it("compares values without leaking length-independent timing", () => {
    expect(timingSafeEquals("abc", "abc")).toBe(true);
    expect(timingSafeEquals("abc", "abd")).toBe(false);
    expect(timingSafeEquals("abc", "abcd")).toBe(false);
    expect(timingSafeEquals("", "")).toBe(false);
    expect(timingSafeEquals(undefined, undefined)).toBe(false);
  });
});

describe("origin validation", () => {
  it("accepts the forwarded production host", () => {
    const req = request({
      headers: {
        origin: "https://pastry-county-kitchen-os.vercel.app",
        "x-forwarded-host": "pastry-county-kitchen-os.vercel.app",
        "x-forwarded-proto": "https"
      }
    });
    expect(originAllowed(req)).toBe(true);
  });

  it("rejects a different origin posting to the same host", () => {
    const req = request({
      headers: {
        origin: "https://evil.example",
        "x-forwarded-host": "pastry-county-kitchen-os.vercel.app",
        "x-forwarded-proto": "https"
      }
    });
    expect(originAllowed(req)).toBe(false);
  });

  it("falls back to the referer origin when Origin is absent", () => {
    const req = request({
      headers: { referer: "https://app.example/orders", "x-forwarded-host": "app.example", "x-forwarded-proto": "https" }
    });
    expect(requestOrigin(req)).toBe("https://app.example");
    expect(originAllowed(req)).toBe(true);
  });

  it("rejects a request with neither Origin nor Referer", () => {
    expect(originAllowed(request({ headers: { host: "app.example" } }))).toBe(false);
  });

  it("treats reads as safe methods", () => {
    expect(isSafeMethod("GET")).toBe(true);
    expect(isSafeMethod("head")).toBe(true);
    expect(isSafeMethod("POST")).toBe(false);
  });
});

describe("CSRF enforcement", () => {
  const cookieActor = { sub: "u1", role: "Owner/Admin", csrfToken: "csrf-value", via: "cookie" };
  const sameOrigin = { origin: "https://app.example", "x-forwarded-host": "app.example", "x-forwarded-proto": "https" };

  it("allows a same-origin mutation carrying the session CSRF token", () => {
    const req = request({ headers: { ...sameOrigin, "x-csrf-token": "csrf-value" } });
    expect(csrfViolation(req, cookieActor)).toBeNull();
  });

  it("rejects a cookie mutation with no CSRF token", () => {
    const req = request({ headers: sameOrigin });
    expect(csrfViolation(req, cookieActor)?.statusCode).toBe(403);
  });

  it("rejects a cookie mutation carrying another session's token", () => {
    const req = request({ headers: { ...sameOrigin, "x-csrf-token": "someone-elses" } });
    expect(csrfViolation(req, cookieActor)?.statusCode).toBe(403);
  });

  it("rejects a cross-site mutation even if it guesses a token", () => {
    const req = request({
      headers: { origin: "https://evil.example", "x-forwarded-host": "app.example", "x-forwarded-proto": "https", "x-csrf-token": "csrf-value" }
    });
    expect(csrfViolation(req, cookieActor)?.statusCode).toBe(403);
  });

  it("does not require CSRF for reads", () => {
    expect(csrfViolation(request({ method: "GET", headers: sameOrigin }), cookieActor)).toBeNull();
  });

  it("does not apply CSRF to bearer callers, which browsers never attach automatically", () => {
    const bearerActor = { sub: "u1", role: "Owner/Admin", via: "bearer" };
    expect(csrfViolation(request({ headers: {} }), bearerActor)).toBeNull();
  });

  it("does not apply CSRF to unauthenticated requests, which fail on permission instead", () => {
    expect(csrfViolation(request({ headers: {} }), null)).toBeNull();
  });

  it("throws a 403 through the enforcement helper", () => {
    expect(() => enforceRequestCsrf(request({ headers: sameOrigin }), cookieActor)).toThrowError(/security token/i);
    try {
      enforceRequestCsrf(request({ headers: sameOrigin }), cookieActor);
    } catch (error) {
      expect(error.statusCode).toBe(403);
    }
  });
});

describe("bearer compatibility window", () => {
  beforeEach(() => {
    delete process.env.AUTH_BEARER_COMPAT;
  });

  it("is on by default during the Phase 011 migration", () => {
    expect(bearerCompatEnabled()).toBe(true);
  });

  it("can be switched off without a deploy", () => {
    process.env.AUTH_BEARER_COMPAT = "off";
    expect(bearerCompatEnabled()).toBe(false);
  });

  it("ignores bearer tokens entirely once disabled", async () => {
    const token = createSessionToken({ id: "u1", email: "a@b.c", role: "Owner/Admin" });
    const req = request({ headers: { authorization: `Bearer ${token}` } });
    const sql = () => {
      throw new Error("the database must not be consulted for a bearer-only request");
    };

    process.env.AUTH_BEARER_COMPAT = "on";
    expect((await authenticateRequest(sql, req))?.sub).toBe("u1");

    process.env.AUTH_BEARER_COMPAT = "off";
    expect(await authenticateRequest(sql, req)).toBeNull();
  });
});

describe("credential resolution", () => {
  const cookieRow = {
    sessionId: "ses-1",
    userId: "cookie-user",
    csrfToken: "csrf-value",
    revokedAt: null,
    expired: false,
    issuedAt: 1000,
    email: "cookie@example.com",
    fullName: "Cookie User",
    role: "Baker",
    active: true,
    userRevokedAt: null
  };

  beforeEach(() => {
    delete process.env.AUTH_BEARER_COMPAT;
  });

  it("resolves a cookie-only request as a cookie session", async () => {
    const req = request({ headers: { cookie: `${sessionCookieName()}=cookie-token` } });
    const resolved = await authenticateRequest(async () => [cookieRow], req);
    expect(resolved.sub).toBe("cookie-user");
    expect(resolved.via).toBe("cookie");
  });

  // During the rollout a browser holds both credentials at once. Preferring the
  // bearer token keeps the shipped frontend working; classifying those requests
  // as cookie-authenticated would demand a CSRF header it does not send yet.
  it("prefers a valid bearer credential while the compatibility window is open", async () => {
    const token = createSessionToken({ id: "bearer-user", email: "a@b.c", role: "Owner/Admin" });
    const req = request({ headers: { cookie: `${sessionCookieName()}=cookie-token`, authorization: `Bearer ${token}` } });
    const resolved = await authenticateRequest(async () => [cookieRow], req);
    expect(resolved.sub).toBe("bearer-user");
    expect(resolved.via).toBe("bearer");
  });

  it("uses the cookie once bearer compatibility is disabled", async () => {
    const token = createSessionToken({ id: "bearer-user", email: "a@b.c", role: "Owner/Admin" });
    const req = request({ headers: { cookie: `${sessionCookieName()}=cookie-token`, authorization: `Bearer ${token}` } });
    process.env.AUTH_BEARER_COMPAT = "off";
    const resolved = await authenticateRequest(async () => [cookieRow], req);
    expect(resolved.sub).toBe("cookie-user");
    expect(resolved.via).toBe("cookie");
  });

  it("falls through to the cookie when the bearer token is not valid", async () => {
    const req = request({ headers: { cookie: `${sessionCookieName()}=cookie-token`, authorization: "Bearer nonsense" } });
    expect((await authenticateRequest(async () => [cookieRow], req))?.sub).toBe("cookie-user");
  });

  it("returns nothing when neither credential resolves", async () => {
    const req = request({ headers: { cookie: `${sessionCookieName()}=cookie-token` } });
    expect(await authenticateRequest(async () => [], req)).toBeNull();
    expect(await authenticateRequest(async () => [], request({ headers: {} }))).toBeNull();
  });

  it("refuses a revoked, expired, disabled, or staff-revoked session", async () => {
    const req = request({ headers: { cookie: `${sessionCookieName()}=cookie-token` } });
    const base = {
      sessionId: "ses-1",
      userId: "u1",
      csrfToken: "c",
      revokedAt: null,
      expired: false,
      issuedAt: 1000,
      email: "a@b.c",
      fullName: "A",
      role: "Baker",
      active: true,
      userRevokedAt: null
    };
    const rejected = [
      { ...base, revokedAt: "2026-01-01T00:00:00Z" },
      { ...base, expired: true },
      { ...base, active: false },
      // Staff revoked all sessions after this one was issued.
      { ...base, userRevokedAt: 2000 }
    ];
    for (const row of rejected) {
      expect(await authenticateRequest(async () => [row], req)).toBeNull();
    }
    // A session issued after the revocation stamp is still valid.
    expect((await authenticateRequest(async () => [{ ...base, issuedAt: 3000, userRevokedAt: 2000 }], req))?.sub).toBe("u1");
  });

  it("treats a missing app_sessions table as no session rather than a 500", async () => {
    const req = request({ headers: { cookie: `${sessionCookieName()}=cookie-token` } });
    const sql = async () => {
      throw Object.assign(new Error('relation "app_sessions" does not exist'), { code: "42P01" });
    };
    expect(await authenticateRequest(sql, req)).toBeNull();
  });
});
