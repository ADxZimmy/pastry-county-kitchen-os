import { getSql, sendError, setPrivateNoStore } from "../../_db.js";
import { produceOrder } from "../../_actions.js";
import { authenticateRequest, enforceRequestCsrf } from "../../_auth.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    setPrivateNoStore(res);
    const sql = getSql();
    const { orderId } = req.query;
    const actor = await authenticateRequest(sql, req);
    enforceRequestCsrf(req, actor);
    res.status(200).json(await produceOrder(sql, orderId, actor, req.body?.qcLog ?? {}));
  } catch (error) {
    sendError(res, error);
  }
}
