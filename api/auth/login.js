import bcrypt from "bcryptjs";
import { bearerCompatEnabled, createSessionToken } from "../_auth.js";
import { issueSession, readSessionCookie, revokeSession, setSessionCookie } from "../_sessions.js";
import { first, getSql, sendError, setPrivateNoStore } from "../_db.js";
import { enforceAuthRateLimit, sendRateLimit } from "../_rateLimit.js";
import { isMissingColumn, normalizeDataMode } from "../_runtime.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    setPrivateNoStore(res);
    const sql = getSql();
    const { email, password } = req.body;
    const loginLimit = await enforceAuthRateLimit(sql, req, {
      scope: "auth.login",
      identity: email || "missing-email",
      limit: 5,
      windowMs: 60 * 1000
    });
    if (loginLimit.limited) {
      sendRateLimit(res, loginLimit);
      return;
    }
    let user;
    try {
      user = first(await sql`
        select id, email, full_name, role, password_hash, data_mode
        from app_users
        where lower(email) = lower(${email}) and coalesce(active, true) = true
        limit 1
      `);
    } catch (error) {
      // Migration 007 has not run yet. Every account is necessarily server-mode
      // in that state, because signup refuses to create a device one until the
      // column exists.
      if (!isMissingColumn(error, "data_mode")) throw error;
      user = first(await sql`
        select id, email, full_name, role, password_hash
        from app_users
        where lower(email) = lower(${email}) and coalesce(active, true) = true
        limit 1
      `);
    }
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }

    // Rotate: whatever session the browser arrived with is retired before a new
    // one is issued, so a fixated cookie cannot survive a login.
    const presented = readSessionCookie(req);
    if (presented) await revokeSession(sql, presented, "login-rotation");

    const session = await issueSession(sql, user, req);
    setSessionCookie(res, session.token, { maxAgeSeconds: session.ttlSeconds });
    res.status(200).json({
      id: user.id,
      email: user.email,
      fullName: user.full_name,
      role: user.role,
      dataMode: normalizeDataMode(user.data_mode),
      csrfToken: session.csrfToken,
      ...(bearerCompatEnabled() ? { token: createSessionToken(user) } : {})
    });
  } catch (error) {
    sendError(res, error);
  }
}
