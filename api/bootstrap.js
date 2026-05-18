import { loadKitchenSnapshot, sendError } from "./_db.js";

export default async function handler(_req, res) {
  try {
    res.status(200).json(await loadKitchenSnapshot());
  } catch (error) {
    sendError(res, error);
  }
}
