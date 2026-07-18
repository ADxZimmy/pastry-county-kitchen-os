import { authenticateRequest } from "../_auth.js";
import { clearSessionCookie, readSessionCookie } from "../_sessions.js";
import { getSql, sendError, setPrivateNoStore } from "../_db.js";

// The browser cannot read the HttpOnly session cookie, so this is how the app
// learns who it is signed in as and gets the CSRF token for mutating requests.
export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    setPrivateNoStore(res);
    res.setHeader("Vary", "Cookie");
    const actor = await authenticateRequest(getSql(), req);
    if (!actor) {
      // Clear a cookie that no longer resolves so the browser stops sending it.
      if (readSessionCookie(req)) clearSessionCookie(res);
      res.status(401).json({ error: "Sign in again to continue.", authenticated: false });
      return;
    }
    res.status(200).json({
      authenticated: true,
      user: { id: actor.sub, email: actor.email, fullName: actor.fullName, role: actor.role },
      csrfToken: actor.csrfToken ?? null,
      via: actor.via ?? "cookie"
    });
  } catch (error) {
    sendError(res, error);
  }
}
