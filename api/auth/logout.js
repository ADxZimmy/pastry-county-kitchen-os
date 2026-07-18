import { clearSessionCookie, originAllowed, readSessionCookie, revokeSession } from "../_sessions.js";
import { getSql, sendError, setPrivateNoStore } from "../_db.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    setPrivateNoStore(res);
    const presented = readSessionCookie(req);
    // Same-origin is required so another site cannot force a logout, but a stale
    // CSRF token must never leave someone unable to sign out of their own session.
    if (presented && !originAllowed(req)) {
      res.status(403).json({ error: "This request did not come from the Kitchen OS app." });
      return;
    }
    if (presented) await revokeSession(getSql(), presented, "logout");
    clearSessionCookie(res);
    res.status(200).json({ ok: true });
  } catch (error) {
    sendError(res, error);
  }
}
