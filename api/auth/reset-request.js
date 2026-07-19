import { first, getSql, sendError, setPrivateNoStore } from "../_db.js";
import { sendResendEmail } from "../_actions.js";
import { enforceAuthRateLimit, sendRateLimit } from "../_rateLimit.js";
import {
  GENERIC_RESET_RESPONSE,
  RESET_UNAVAILABLE,
  issueResetToken,
  normalizeEmail,
  padResponseTime,
  resetEmailBody,
  resetDeliveryConfigured,
  resetLinkFor
} from "../_passwordReset.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const startedAt = Date.now();
  try {
    setPrivateNoStore(res);
    // Refused before anything is looked up, so the answer cannot depend on -- or
    // leak -- whether the submitted address belongs to an account.
    if (!resetDeliveryConfigured()) {
      res.status(503).json({ error: RESET_UNAVAILABLE });
      return;
    }
    const sql = getSql();
    const email = normalizeEmail(req.body?.email);

    const limit = await enforceAuthRateLimit(sql, req, {
      scope: "auth.resetRequest",
      identity: email || "missing-email",
      limit: 3,
      windowMs: 15 * 60 * 1000
    });
    if (limit.limited) {
      sendRateLimit(res, limit);
      return;
    }

    if (email) {
      const user = first(await sql`
        select id, email, full_name
        from app_users
        where lower(email) = ${email} and coalesce(active, true) = true
        limit 1
      `);
      if (user) {
        const token = await issueResetToken(sql, user, req);
        const delivery = await sendResendEmail({
          to: user.email,
          subject: "Reset your Pastry County Kitchen OS password",
          text: resetEmailBody(resetLinkFor(token, req))
        });
        // Logged for operators, never returned: the caller must not learn
        // whether an account exists or whether delivery succeeded.
        if (delivery.status !== "sent") {
          console.warn(`[password-reset] delivery not completed: ${delivery.status}${delivery.error ? ` (${delivery.error})` : ""}`);
        }
      }
    }

    // Same body, same status, for a known address, an unknown address, and a
    // blank one. Padded to a floor so timing does not answer the question either.
    await padResponseTime(startedAt);
    res.status(200).json(GENERIC_RESET_RESPONSE);
  } catch (error) {
    // Even a failure must not distinguish accounts. Unexpected faults are logged
    // with a correlation id by sendError; anything else returns the same body.
    if (!Number.isFinite(Number(error?.statusCode))) {
      console.error("[password-reset] request failed", error);
      await padResponseTime(startedAt);
      res.status(200).json(GENERIC_RESET_RESPONSE);
      return;
    }
    sendError(res, error);
  }
}
