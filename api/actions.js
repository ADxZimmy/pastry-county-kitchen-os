import { getSql, sendError, setPrivateNoStore } from "./_db.js";
import { handleAction } from "./_actions.js";
import { authenticateRequest, enforceRequestCsrf } from "./_auth.js";
import { rateLimit, rateLimitKey, sendRateLimit } from "./_rateLimit.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    setPrivateNoStore(res);
    res.setHeader("Vary", "Cookie");
    const sql = getSql();
    const actor = await authenticateRequest(sql, req);
    enforceRequestCsrf(req, actor);
    const actionName = req.body?.action || "unknown";
    // Deliberately the per-instance limiter, not the shared one: this is coarse
    // abuse control on an already-authenticated path, and a database round trip
    // on every action would tax the whole app. The credential checks above are
    // the security boundary here; RS-006's shared counter guards the auth
    // endpoints, where guessing attempts are the threat.
    const actionLimit = rateLimit({
      key: rateLimitKey(req, actor ? "api.actions.authenticated" : "api.actions.unauthenticated", actor?.sub || actionName),
      limit: actor ? 120 : 20,
      windowMs: 60 * 1000
    });
    if (actionLimit.limited) {
      sendRateLimit(res, actionLimit);
      return;
    }
    res.status(200).json(await handleAction(sql, req.body ?? {}, actor));
  } catch (error) {
    sendError(res, error);
  }
}
