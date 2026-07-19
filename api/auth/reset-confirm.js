import bcrypt from "bcryptjs";
import { getSql, sendError, setPrivateNoStore } from "../_db.js";
import { enforceAuthRateLimit, sendRateLimit } from "../_rateLimit.js";
import { clearSessionCookie } from "../_sessions.js";
import { validatePasswordStrength } from "../../shared/policy.js";
import { GENERIC_RESET_FAILURE, consumeResetToken, revokeSessionsAfterReset } from "../_passwordReset.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    setPrivateNoStore(res);
    const sql = getSql();
    const token = String(req.body?.token ?? "");
    const password = String(req.body?.password ?? "");

    const limit = await enforceAuthRateLimit(sql, req, {
      scope: "auth.resetConfirm",
      identity: token.slice(0, 12) || "missing-token",
      limit: 5,
      windowMs: 15 * 60 * 1000
    });
    if (limit.limited) {
      sendRateLimit(res, limit);
      return;
    }

    // Password strength is checked before the token is spent, so a weak choice
    // does not burn a valid single-use link.
    const strengthError = validatePasswordStrength(password);
    if (strengthError) {
      res.status(400).json({ error: strengthError });
      return;
    }

    const userId = await consumeResetToken(sql, token);
    if (!userId) {
      // Unknown, expired, and already-used are one message: nothing here tells a
      // caller which addresses have pending resets.
      res.status(400).json({ error: GENERIC_RESET_FAILURE });
      return;
    }

    await sql`
      update app_users set password_hash = ${bcrypt.hashSync(password, 10)}, updated_at = now()
      where id = ${userId}
    `;
    await revokeSessionsAfterReset(sql, userId);

    // A reset proves control of the mailbox, not of the browser making the
    // request, so it never hands back a signed-in session. Any cookie on this
    // request is cleared and the user signs in with the new password.
    clearSessionCookie(res);
    res.status(200).json({ ok: true, message: "Password updated. Sign in with your new password." });
  } catch (error) {
    sendError(res, error);
  }
}
