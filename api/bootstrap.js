import { authenticateRequest, requireActiveSession, sessionAccessError } from "./_auth.js";
import { getSql, loadKitchenSnapshot, sendError, setPrivateNoStore } from "./_db.js";
import { stripCostsForRole } from "../shared/actionPolicy.js";

export function bootstrapAccessError(actor, userRow = { active: true }) {
  return sessionAccessError(actor, userRow);
}

export function filterKitchenSnapshotForActor(snapshot, actor) {
  if (actor?.role === "Owner/Admin") return snapshot;
  // A Viewer sees the kitchen's operations, not its money. This used to be true
  // only of what the assistant sent to a provider, while this endpoint handed the
  // same figures to the Viewer's own browser -- so the projection existed in a
  // comment and not in the response. The field list is shared, so this and the
  // assistant's redaction cannot disagree.
  const costFiltered = stripCostsForRole(snapshot, actor?.role);
  return {
    ...costFiltered,
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
