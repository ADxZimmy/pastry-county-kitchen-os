// Shared session helper for the browser-driven smoke family.
//
// Phase 011 moved the session credential into an HttpOnly cookie, so a smoke can
// no longer put a signed-in user into localStorage — the app purges it and asks
// the server who it is. These helpers seed the real cookie on the browser
// context instead, which is what an operator's browser actually carries.

export function sessionCookieName(baseURL) {
  return new URL(baseURL).protocol === "https:" ? "__Host-pcko_session" : "pcko_session_dev";
}

// Headers that authenticate an API call as an operator's browser would: the
// session cookie, the CSRF token bound to it, and a same-origin Origin.
export function authHeaders(baseURL, session) {
  if (!session?.sessionCookie) {
    throw new Error("Smoke session is missing its cookie. Log in through loginForSmoke or inject one from the runner.");
  }
  return {
    Cookie: `${sessionCookieName(baseURL)}=${session.sessionCookie}`,
    ...(session.csrfToken ? { "x-csrf-token": session.csrfToken } : {}),
    Origin: new URL(baseURL).origin
  };
}

// Once login throttling is shared across instances (RS-006), a suite where every
// child logs in separately trips the limit on its own legitimate traffic. The
// runner signs in once and passes the session down through the environment.
export function injectedSession() {
  const sessionCookie = process.env.SMOKE_SESSION_COOKIE;
  if (!sessionCookie) return null;
  return {
    sessionCookie,
    csrfToken: process.env.SMOKE_CSRF_TOKEN ?? "",
    id: process.env.SMOKE_USER_ID ?? "",
    email: process.env.SMOKE_USER_EMAIL ?? "",
    fullName: process.env.SMOKE_USER_NAME ?? "",
    role: process.env.SMOKE_USER_ROLE ?? "Owner/Admin",
    injected: true
  };
}

export function sessionEnv(session) {
  return {
    SMOKE_SESSION_COOKIE: session.sessionCookie,
    SMOKE_CSRF_TOKEN: session.csrfToken ?? "",
    SMOKE_USER_ID: session.id ?? "",
    SMOKE_USER_EMAIL: session.email ?? "",
    SMOKE_USER_NAME: session.fullName ?? "",
    SMOKE_USER_ROLE: session.role ?? ""
  };
}

// Signs in and returns the identity plus the cookie and CSRF token. Retries once
// on a throttled response so a shared limiter does not turn into a flaky suite.
export async function loginForSmoke(baseURL, email, password, { label = "smoke" } = {}) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(new URL("/api/auth/login", baseURL), {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: new URL(baseURL).origin },
      body: JSON.stringify({ email, password })
    });
    const body = await response.json().catch(() => ({}));
    if (response.ok) {
      return { ...body, sessionCookie: sessionCookieFrom(response, baseURL) };
    }
    if (response.status === 429 && attempt < 2) {
      const retryAfter = Number(response.headers.get("Retry-After") || "60");
      console.log(`${label} login was throttled; waiting ${retryAfter}s before retrying.`);
      await new Promise((resolve) => setTimeout(resolve, (retryAfter + 1) * 1000));
      continue;
    }
    throw new Error(body.error || `Login failed with ${response.status}.`);
  }
  throw new Error("Login failed after throttle retries.");
}

// The session a smoke should use: the runner's if it supplied one, otherwise its
// own login. Either way the caller gets a cookie, never a bearer token.
export async function resolveSmokeSession(baseURL, email, password, options = {}) {
  return injectedSession() ?? (await loginForSmoke(baseURL, email, password, options));
}

// Pulls the session cookie out of a login response. Node's fetch keeps
// Set-Cookie separate from the merged header list, hence getSetCookie().
export function sessionCookieFrom(response, baseURL) {
  const name = sessionCookieName(baseURL);
  const list = typeof response?.headers?.getSetCookie === "function" ? response.headers.getSetCookie() : [];
  const entry = list.find((value) => value.startsWith(`${name}=`));
  return entry ? entry.slice(name.length + 1).split(";")[0] : "";
}

// Attaches the session cookie to the browser context and optionally restores the
// non-credential route state the app still keeps in localStorage.
export async function seedBrowserSession(page, baseURL, cookieValue, uiState = null) {
  if (!cookieValue) {
    throw new Error("Smoke login returned no session cookie. The deployment may predate Phase 011 cookie sessions.");
  }
  const url = new URL(baseURL);
  await page.context().addCookies([
    {
      name: sessionCookieName(baseURL),
      value: cookieValue,
      domain: url.hostname,
      path: "/",
      httpOnly: true,
      secure: url.protocol === "https:",
      sameSite: "Lax"
    }
  ]);
  if (uiState) {
    await page.addInitScript((session) => {
      window.localStorage.setItem("pastry-county-session", JSON.stringify(session));
    }, uiState);
  }
}
