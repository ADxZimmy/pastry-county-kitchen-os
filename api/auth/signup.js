import { setSessionCookie } from "../_sessions.js";
import { getSql, sendError, setPrivateNoStore } from "../_db.js";
import { enforceAuthRateLimit, sendRateLimit } from "../_rateLimit.js";
import {
  SIGNUP_INVITE_REJECTED,
  SIGNUP_UNAVAILABLE,
  inviteCodeMatches,
  performSignup,
  signupConfigured,
  validateSignupInput
} from "../_signup.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    setPrivateNoStore(res);

    // Refuse before anything else, and on server configuration alone. This
    // depends on no part of the request, so a closed deployment reveals nothing
    // beyond being closed.
    if (!signupConfigured()) {
      res.status(503).json({ error: SIGNUP_UNAVAILABLE });
      return;
    }

    const sql = getSql();

    // Throttle per IP with a constant identity. Keying on the submitted email
    // would hand an attacker a fresh bucket for every address they invent, which
    // is the opposite of a limit; the client IP is already part of the key.
    const limit = await enforceAuthRateLimit(sql, req, {
      scope: "auth.signup",
      identity: "",
      limit: 5,
      windowMs: 15 * 60 * 1000
    });
    if (limit.limited) {
      sendRateLimit(res, limit);
      return;
    }

    if (!inviteCodeMatches(req.body?.inviteCode)) {
      res.status(403).json({ error: SIGNUP_INVITE_REJECTED });
      return;
    }

    const input = validateSignupInput(req.body ?? {});
    if (input.error) {
      res.status(400).json({ error: input.error });
      return;
    }

    const { user, session } = await performSignup(sql, req, { ...input, password: req.body.password });
    setSessionCookie(res, session.token, { maxAgeSeconds: session.ttlSeconds });
    res.status(200).json({
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      dataMode: user.dataMode,
      csrfToken: session.csrfToken
    });
  } catch (error) {
    sendError(res, error);
  }
}
