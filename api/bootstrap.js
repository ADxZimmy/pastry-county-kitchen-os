import { actorFromRequest, requireActiveSession, sessionAccessError } from "./_auth.js";
import { getSql, loadKitchenSnapshot, sendError } from "./_db.js";

export function bootstrapAccessError(actor, userRow = { active: true }) {
  return sessionAccessError(actor, userRow);
}

export function filterKitchenSnapshotForActor(snapshot, actor) {
  if (actor?.role === "Owner/Admin") return snapshot;
  return {
    ...snapshot,
    appUsers: [],
    auditLogs: [],
    settings: {
      ...snapshot.settings,
      lowStockNotificationEmail: ""
    }
  };
}

export async function loadAuthenticatedKitchenSnapshot(req) {
  const sql = getSql();
  const actor = await requireActiveSession(sql, actorFromRequest(req));
  return filterKitchenSnapshotForActor(await loadKitchenSnapshot(sql), actor);
}

export default async function handler(req, res) {
  try {
    res.status(200).json(await loadAuthenticatedKitchenSnapshot(req));
  } catch (error) {
    sendError(res, error);
  }
}
