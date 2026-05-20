import { getSql, sendError } from "../../_db.js";
import { produceOrder } from "../../_actions.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const sql = getSql();
    const { orderId } = req.query;
    res.status(200).json(await produceOrder(sql, orderId));
  } catch (error) {
    sendError(res, error);
  }
}
