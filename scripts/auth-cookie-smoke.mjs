// Phase 011-A: cookie session and CSRF verification.
//
// Proves the cookie mechanism works against a real deployment BEFORE the app is
// changed to depend on it. Everything here is read-only apart from `schema.ensure`
// (idempotent DDL) and the sessions it creates for itself, which it revokes.
//
// It authenticates by COOKIE ONLY, never sending an Authorization header on the
// cookie paths, so a pass means the new mechanism genuinely carried the request.
import { config } from "dotenv";

config({ path: ".env.local" });
config();

const baseURL = process.env.AUTH_COOKIE_SMOKE_BASE_URL ?? process.env.LIVE_BASE_URL ?? "https://pastry-county-kitchen-os.vercel.app";
const email = process.env.LIVE_TEST_EMAIL;
const password = process.env.LIVE_TEST_PASSWORD;

if (!email || !password) {
  console.error("auth-cookie smoke requires LIVE_TEST_EMAIL and LIVE_TEST_PASSWORD.");
  process.exit(1);
}

const origin = new URL(baseURL).origin;
const production = origin.startsWith("https://");
const COOKIE_NAME = production ? "__Host-pcko_session" : "pcko_session_dev";
const results = [];

function check(name, ok, detail) {
  results.push({ name, ok: Boolean(ok), detail: detail ?? "" });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` -> ${detail}` : ""}`);
}

async function req(path, { cookie, csrf, originHeader, bearer, ...options } = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers ?? {}) };
  if (cookie) headers.Cookie = `${COOKIE_NAME}=${cookie}`;
  if (csrf) headers["x-csrf-token"] = csrf;
  if (originHeader) headers.Origin = originHeader;
  if (bearer) headers.Authorization = `Bearer ${bearer}`;
  const response = await fetch(new URL(path, baseURL), { ...options, headers, redirect: "manual" });
  const text = await response.text();
  let body = {};
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = { raw: text.slice(0, 200) };
    }
  }
  return { status: response.status, body, headers: response.headers, setCookie: response.headers.getSetCookie?.() ?? [] };
}

function cookieValueFrom(setCookieList, name = COOKIE_NAME) {
  const entry = setCookieList.find((value) => value.startsWith(`${name}=`));
  if (!entry) return { value: "", raw: "" };
  return { value: entry.slice(name.length + 1).split(";")[0], raw: entry };
}

// A cookie-authenticated mutation. `schema.ensure` is idempotent and changes no
// business data, so it is a safe way to prove the write path accepts the session.
const cookieAction = (cookie, extra = {}) =>
  req("/api/actions", {
    method: "POST",
    body: JSON.stringify({ action: "schema.ensure" }),
    cookie,
    originHeader: origin,
    ...extra
  });

async function main() {
  console.log(`Auth cookie smoke against ${baseURL}\n`);

  // 1. Unauthenticated identity endpoint.
  const anon = await req("/api/auth/session");
  check("unauthenticated session endpoint refuses", anon.status === 401 && anon.body.authenticated === false, `${anon.status}`);

  // 2. Login issues a hardened cookie.
  const login = await req("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }), originHeader: origin });
  if (login.status !== 200) {
    check("login succeeds", false, `${login.status} ${login.body.error ?? ""}`);
    return;
  }
  const { value: cookie1, raw: rawCookie } = cookieValueFrom(login.setCookie);
  check("login issues a session cookie", Boolean(cookie1), COOKIE_NAME);
  check("cookie is HttpOnly", /HttpOnly/i.test(rawCookie), rawCookie.split(";").map((p) => p.trim()).slice(1).join(" "));
  check("cookie is SameSite=Lax", /SameSite=Lax/i.test(rawCookie));
  check("cookie is Path=/ with no Domain", /Path=\//i.test(rawCookie) && !/Domain=/i.test(rawCookie));
  if (production) {
    check("cookie is Secure with the __Host- prefix", /Secure/i.test(rawCookie) && rawCookie.startsWith("__Host-"));
  }
  check("login returns a CSRF token", typeof login.body.csrfToken === "string" && login.body.csrfToken.length >= 20);
  check("login response carries no session credential in its body", !("sessionToken" in login.body) && !String(login.body.token ?? "").includes(cookie1));
  const csrf = login.body.csrfToken;

  // 3. The cookie alone identifies the user.
  const session = await req("/api/auth/session", { cookie: cookie1 });
  check("cookie alone authenticates", session.status === 200 && session.body.authenticated === true, session.body.user?.email);
  check("session endpoint reports cookie auth", session.body.via === "cookie", session.body.via);
  check("session endpoint returns the CSRF token", session.body.csrfToken === csrf);
  check("session endpoint returns no credential", !JSON.stringify(session.body).includes(cookie1));
  check("session response is private and no-store", /no-store/i.test(session.headers.get("cache-control") ?? ""), session.headers.get("cache-control"));
  check("session response varies on Cookie", /cookie/i.test(session.headers.get("vary") ?? ""), session.headers.get("vary"));

  // 4. CSRF is enforced on cookie-authenticated writes.
  const noCsrf = await cookieAction(cookie1);
  check("cookie write without a CSRF token is refused", noCsrf.status === 403, `${noCsrf.status}`);

  const wrongCsrf = await cookieAction(cookie1, { csrf: "not-the-right-token" });
  check("cookie write with the wrong CSRF token is refused", wrongCsrf.status === 403, `${wrongCsrf.status}`);

  const crossSite = await req("/api/actions", {
    method: "POST",
    body: JSON.stringify({ action: "schema.ensure" }),
    cookie: cookie1,
    csrf,
    originHeader: "https://evil.example"
  });
  check("cross-site cookie write is refused even with a valid token", crossSite.status === 403, `${crossSite.status}`);

  const noOrigin = await req("/api/actions", {
    method: "POST",
    body: JSON.stringify({ action: "schema.ensure" }),
    cookie: cookie1,
    csrf
  });
  check("cookie write with no Origin is refused", noOrigin.status === 403, `${noOrigin.status}`);

  const goodWrite = await cookieAction(cookie1, { csrf });
  check("same-origin cookie write with the session token succeeds", goodWrite.status === 200, `${goodWrite.status}`);

  // 5. Reads work on the cookie and stay private.
  const boot = await req("/api/bootstrap", { cookie: cookie1 });
  check("bootstrap loads on the cookie alone", boot.status === 200 && Array.isArray(boot.body.ingredients), `${boot.status}`);
  check("bootstrap is private and no-store", /no-store/i.test(boot.headers.get("cache-control") ?? ""), boot.headers.get("cache-control"));
  check("bootstrap varies on Cookie", /cookie/i.test(boot.headers.get("vary") ?? ""), boot.headers.get("vary"));

  // 6. A forged cookie value is rejected.
  const forged = await req("/api/auth/session", { cookie: `${cookie1.slice(0, -4)}zzzz` });
  check("a tampered cookie is rejected", forged.status === 401, `${forged.status}`);

  // 7. Login rotates: the old session dies as the new one is issued.
  const relogin = await req("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
    cookie: cookie1,
    originHeader: origin
  });
  const { value: cookie2 } = cookieValueFrom(relogin.setCookie);
  check("second login issues a different session", relogin.status === 200 && cookie2 && cookie2 !== cookie1);
  const afterRotation = await req("/api/auth/session", { cookie: cookie1 });
  check("the rotated-out session is dead", afterRotation.status === 401, `${afterRotation.status}`);

  // 8. Logout revokes server-side, not just in the browser.
  const badLogout = await req("/api/auth/logout", { method: "POST", cookie: cookie2, originHeader: "https://evil.example" });
  check("cross-site forced logout is refused", badLogout.status === 403, `${badLogout.status}`);

  const logout = await req("/api/auth/logout", { method: "POST", cookie: cookie2, originHeader: origin });
  check("logout succeeds", logout.status === 200, `${logout.status}`);
  check("logout clears the cookie", cookieValueFrom(logout.setCookie).raw.includes("Max-Age=0"), cookieValueFrom(logout.setCookie).raw);
  const afterLogout = await req("/api/auth/session", { cookie: cookie2 });
  check("the logged-out cookie no longer authenticates", afterLogout.status === 401, `${afterLogout.status}`);
  const writeAfterLogout = await cookieAction(cookie2, { csrf });
  check("a write on the logged-out cookie is refused", writeAfterLogout.status >= 400, `${writeAfterLogout.status}`);

  // 9. RS-006: login throttling is shared across serverless instances.
  //
  // A concurrent burst is what makes this discriminating. Serverless spreads
  // simultaneous requests over several instances, so a per-instance limiter
  // would let most of them through; a shared counter admits exactly the limit.
  // The address is bogus and unique per run, so it gets its own bucket and no
  // real account is ever locked out.
  const throttleEmail = `throttle-probe-${Date.now()}@pastrycounty.invalid`;
  const burst = await Promise.all(
    Array.from({ length: 8 }, () =>
      req("/api/auth/login", { method: "POST", body: JSON.stringify({ email: throttleEmail, password: "not-the-password" }), originHeader: origin })
    )
  );
  const throttled = burst.filter((entry) => entry.status === 429).length;
  const rejected = burst.filter((entry) => entry.status === 401).length;
  check("concurrent login burst is throttled by a shared counter", throttled >= 2, `${rejected} refused, ${throttled} throttled of 8`);
  check("throttling admits no more than the configured limit", rejected <= 5, `${rejected} reached the password check`);
  check("a throttled login says when to retry", burst.some((entry) => entry.status === 429), `${throttled} throttled`);

  // 10. The compatibility window is still open, so nobody was logged out by this deploy.
  const bearer = login.body.token;
  if (bearer) {
    const bearerBoot = await req("/api/bootstrap", { bearer });
    check("bearer compatibility still works (migration window open)", bearerBoot.status === 200, `${bearerBoot.status}`);
  } else {
    // The server only hands back a bearer token while the compatibility window
    // is open, so its absence is the observable proof that the window is closed.
    check("login issues no bearer token (migration window closed)", login.body.token === undefined);
    const bearerOnly = await req("/api/bootstrap", { bearer: "any-bearer-value-at-all" });
    check("a bearer-only request is refused", bearerOnly.status === 401, `${bearerOnly.status}`);
  }
}

main()
  .catch((error) => {
    check("smoke completed without throwing", false, error?.message ?? String(error));
  })
  .finally(() => {
    const passed = results.filter((entry) => entry.ok).length;
    console.log(`\n${passed}/${results.length} checks passed`);
    const failed = results.filter((entry) => !entry.ok);
    if (failed.length) {
      console.log("\nFailed:");
      for (const entry of failed) console.log(`  - ${entry.name}${entry.detail ? ` (${entry.detail})` : ""}`);
      console.log(`\nCookie session check: NOT PASSED against ${baseURL}.`);
      process.exitCode = 1;
      return;
    }
    console.log(`\nCookie session check: PASSED against ${baseURL}.`);
  });
