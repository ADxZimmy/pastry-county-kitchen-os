import { actorFromRequest } from "./_auth.js";
import { loadKitchenSnapshot, sendError } from "./_db.js";

export function bootstrapAccessError(actor) {
  if (actor) return null;
  return {
    message: "Sign in again to continue.",
    statusCode: 401
  };
}

export async function loadAuthenticatedKitchenSnapshot(req) {
  const actor = actorFromRequest(req);
  const accessError = bootstrapAccessError(actor);
  if (accessError) {
    throw Object.assign(new Error(accessError.message), { statusCode: accessError.statusCode });
  }
  return loadKitchenSnapshot();
}

export default async function handler(req, res) {
  try {
    res.status(200).json(await loadAuthenticatedKitchenSnapshot(req));
  } catch (error) {
    sendError(res, error);
  }
}
