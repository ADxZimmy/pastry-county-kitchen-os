import { getSql, sendError } from "./_db.js";
import { handleAction } from "./_actions.js";
import { actorFromRequest } from "./_auth.js";
import { rateLimit, rateLimitKey, sendRateLimit } from "./_rateLimit.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const actor = actorFromRequest(req);
    const actionName = req.body?.action || "unknown";
    const actionLimit = rateLimit({
      key: rateLimitKey(req, actor ? "api.actions.authenticated" : "api.actions.unauthenticated", actor?.sub || actionName),
      limit: actor ? 120 : 20,
      windowMs: 60 * 1000
    });
    if (actionLimit.limited) {
      sendRateLimit(res, actionLimit);
      return;
    }
    res.status(200).json(await handleAction(getSql(), req.body ?? {}, actor));
  } catch (error) {
    sendError(res, error);
  }
}
