import { getSql, sendError } from "./_db.js";
import { handleAction } from "./_actions.js";
import { actorFromRequest } from "./_auth.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    res.status(200).json(await handleAction(getSql(), req.body ?? {}, actorFromRequest(req)));
  } catch (error) {
    sendError(res, error);
  }
}
