// Shared session helper for the browser-driven smoke family.
//
// Phase 011 moved the session credential into an HttpOnly cookie, so a smoke can
// no longer put a signed-in user into localStorage — the app purges it and asks
// the server who it is. These helpers seed the real cookie on the browser
// context instead, which is what an operator's browser actually carries.

export function sessionCookieName(baseURL) {
  return new URL(baseURL).protocol === "https:" ? "__Host-pcko_session" : "pcko_session_dev";
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
