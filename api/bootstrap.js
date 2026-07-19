import { authenticateRequest, requireActiveSession, sessionAccessError } from "./_auth.js";
import { getSql, loadKitchenSnapshot, sendError, setPrivateNoStore } from "./_db.js";

export function bootstrapAccessError(actor, userRow = { active: true }) {
  return sessionAccessError(actor, userRow);
}

export function filterKitchenSnapshotForActor(snapshot, actor) {
  if (actor?.role === "Owner/Admin") return snapshot;
  return {
    ...snapshot,
    appUsers: [],
    // The audit trail moved to /api/data/audit and is no longer in the snapshot.
    // The blanking stays as a safety net: if it ever returns to bootstrap, it
    // must not reach a lower role just because this line was tidied away.
    auditLogs: [],
    settings: {
      ...snapshot.settings,
      lowStockNotificationEmail: ""
    }
  };
}

export async function loadAuthenticatedKitchenSnapshot(req) {
  const sql = getSql();
  const actor = await requireActiveSession(sql, await authenticateRequest(sql, req));
  return filterKitchenSnapshotForActor(await loadKitchenSnapshot(sql), actor);
}

export default async function handler(req, res) {
  try {
    setPrivateNoStore(res);
    res.setHeader("Vary", "Cookie");
    res.status(200).json(await loadAuthenticatedKitchenSnapshot(req));
  } catch (error) {
    sendError(res, error);
  }
}
