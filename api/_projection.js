// One place that decides who may read which collection, and how a page of rows
// is addressed. Every route-scoped endpoint goes through here, so a new endpoint
// cannot accidentally hand a Viewer the staff list or the audit trail that
// /api/bootstrap has always filtered out.

// Collections whose visibility is narrower than "any signed-in user". Anything
// absent from this map is readable by every authenticated role.
const RESTRICTED_COLLECTIONS = {
  audit: ["Owner/Admin"],
  users: ["Owner/Admin"]
};

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export function rolesAllowedToRead(collection) {
  return RESTRICTED_COLLECTIONS[collection] ?? null;
}

export function canRoleRead(role, collection) {
  const allowed = rolesAllowedToRead(collection);
  return allowed === null ? Boolean(role) : allowed.includes(role);
}

export function requireCollectionAccess(actor, collection) {
  if (!actor) throw Object.assign(new Error("Sign in again to continue."), { statusCode: 401 });
  if (!canRoleRead(actor.role, collection)) {
    throw Object.assign(new Error(`${actor.role} cannot read ${collection}.`), { statusCode: 403 });
  }
  return actor;
}

// A page size a caller cannot use to pull the whole table in one request, which
// is the behaviour this phase exists to remove.
export function clampLimit(value, { fallback = DEFAULT_LIMIT, max = MAX_LIMIT } = {}) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return fallback;
  return Math.min(Math.floor(numeric), max);
}

// Keyset pagination, not OFFSET. A cursor names the last row seen as
// (timestamp, id); rows inserted or archived while an operator pages through
// cannot shift the window and cause a skipped or repeated row.
export function encodeCursor(row) {
  if (!row?.createdAt || !row?.id) return null;
  const at = row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt);
  return Buffer.from(JSON.stringify({ at, id: String(row.id) }), "utf8").toString("base64url");
}

export function decodeCursor(cursor) {
  if (!cursor) return null;
  try {
    const parsed = JSON.parse(Buffer.from(String(cursor), "base64url").toString("utf8"));
    if (!parsed?.at || !parsed?.id) return null;
    if (Number.isNaN(Date.parse(parsed.at))) return null;
    return { at: String(parsed.at), id: String(parsed.id) };
  } catch {
    // A malformed cursor starts from the beginning rather than erroring: it is
    // a position hint, not a credential.
    return null;
  }
}

// Fetches one extra row to decide whether another page exists, without a second
// count query that would be wrong by the time it returned.
export function buildPage(rows, limit) {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  return {
    items,
    hasMore,
    nextCursor: hasMore ? encodeCursor(items[items.length - 1]) : null
  };
}

// Mirrors what /api/bootstrap has always withheld, so the two paths cannot
// drift into disagreeing about what a role may see.
export function projectSettingsForRole(settings, role) {
  if (role === "Owner/Admin") return settings;
  return { ...settings, lowStockNotificationEmail: "" };
}
