// The local answer to GET /api/data/:resource.
//
// Same envelope the server returns, so src/lib/routeData.ts and every screen that
// uses it work unchanged. Aggregates are computed over the WHOLE local ledger,
// not over whatever fitted in the last page — phase 012-C found that a truncated
// window made "most used ingredient" quietly mean "most used recently", and a
// device workspace must not reintroduce that.
import { currentWorkspace } from "./store";
import type { LocalWorkspace } from "./types";

type AnyRecord = Record<string, any>;

interface PageResponse<T> {
  resource: string;
  limit: number;
  items: T[];
  hasMore: boolean;
  nextCursor: string | null;
  summary?: AnyRecord;
}

function clampLimit(value: unknown, fallback = 50) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(200, Math.floor(parsed));
}

// Keyset paging on (createdAt, id) descending, matching the server's cursor so a
// row inserted mid-pagination cannot cause a skip or a duplicate.
function encodeCursor(row: AnyRecord) {
  return btoa(JSON.stringify({ at: row.createdAt ?? "", id: row.id ?? "" }));
}

function decodeCursor(cursor: unknown) {
  if (typeof cursor !== "string" || !cursor) return null;
  try {
    const parsed = JSON.parse(atob(cursor));
    return { at: String(parsed.at ?? ""), id: String(parsed.id ?? "") };
  } catch {
    // A malformed cursor starts from the beginning rather than erroring, which is
    // what the server does too.
    return null;
  }
}

function sortDesc(rows: AnyRecord[]) {
  return [...rows].sort((a, b) => {
    const byDate = String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? ""));
    if (byDate) return byDate;
    return String(b.id ?? "").localeCompare(String(a.id ?? ""));
  });
}

function page<T>(resource: string, rows: AnyRecord[], params: AnyRecord): PageResponse<T> {
  const limit = clampLimit(params.limit);
  const cursor = decodeCursor(params.cursor);
  const ordered = sortDesc(rows);
  const after = cursor
    ? ordered.filter((row) => {
        const at = String(row.createdAt ?? "");
        if (at !== cursor.at) return at < cursor.at;
        return String(row.id ?? "") < cursor.id;
      })
    : ordered;
  const slice = after.slice(0, limit + 1);
  const hasMore = slice.length > limit;
  const items = hasMore ? slice.slice(0, limit) : slice;
  return {
    resource,
    limit,
    items: items as T[],
    hasMore,
    nextCursor: hasMore && items.length ? encodeCursor(items[items.length - 1]) : null
  };
}

function summary(ws: LocalWorkspace) {
  const liveOrders = ws.orders.filter((row: AnyRecord) => !row.archived) as AnyRecord[];
  const counted = liveOrders.filter((row) => row.status !== "Cancelled");
  const ingredients = ws.ingredients.filter((row: AnyRecord) => row.active !== false) as AnyRecord[];

  const usage = new Map<string, number>();
  for (const movement of ws.inventoryMovements as AnyRecord[]) {
    if (movement.movementType !== "production_use") continue;
    usage.set(movement.ingredientId, (usage.get(movement.ingredientId) ?? 0) + Math.abs(Number(movement.quantityChange)));
  }
  let topIngredientId: string | null = null;
  let topQuantity = 0;
  for (const [ingredientId, quantity] of usage) {
    if (quantity > topQuantity) {
      topQuantity = quantity;
      topIngredientId = ingredientId;
    }
  }
  const topIngredient = ingredients.find((row) => row.id === topIngredientId);

  return {
    orders: {
      total: liveOrders.length,
      byStatus: liveOrders.reduce<Record<string, number>>((acc, row) => {
        acc[row.status] = (acc[row.status] ?? 0) + 1;
        return acc;
      }, {}),
      netTotal: counted.reduce((sum, row) => sum + Number(row.netTotal ?? 0), 0),
      balance: counted.reduce((sum, row) => sum + Number(row.balance ?? 0), 0)
    },
    ingredients: {
      total: ingredients.length,
      atOrBelowReorder: ingredients.filter((row) => Number(row.currentStock ?? 0) <= Number(row.reorderLevel ?? 0)).length,
      outOfStock: ingredients.filter((row) => Number(row.currentStock ?? 0) <= 0).length
    },
    movements: { total: ws.inventoryMovements.length },
    audit: { total: ws.auditLogs.length },
    waste: { events: (ws.inventoryMovements as AnyRecord[]).filter((row) => row.movementType === "waste").length },
    topIngredient: topIngredient ? { id: topIngredient.id, name: topIngredient.name, quantity: topQuantity } : null
  };
}

export function localResourcePage<T>(resource: string, params: AnyRecord = {}): PageResponse<T> {
  const ws = currentWorkspace();
  if (!ws) throw Object.assign(new Error("The device workspace is not open."), { statusCode: 409 });

  switch (resource) {
    case "summary":
      return { resource, limit: 0, items: [], hasMore: false, nextCursor: null, summary: summary(ws) };

    case "orders":
      return page<T>(resource, (ws.orders as AnyRecord[]).filter((row) => !row.archived), params);

    case "audit": {
      let rows = ws.auditLogs as AnyRecord[];
      if (params.entityType) rows = rows.filter((row) => row.entityType === params.entityType);
      if (params.entityId) rows = rows.filter((row) => row.entityId === params.entityId);
      return page<T>(resource, rows, params);
    }

    case "movements": {
      let rows = ws.inventoryMovements as AnyRecord[];
      if (params.ingredientId) rows = rows.filter((row) => row.ingredientId === params.ingredientId);
      if (params.movementType) rows = rows.filter((row) => row.movementType === params.movementType);
      return page<T>(resource, rows, params);
    }

    case "batches": {
      // Bounded top-N in FEFO order rather than a cursor, matching the server.
      const limit = clampLimit(params.limit);
      let rows = (ws.ingredientBatches as AnyRecord[]).filter((row) => Number(row.quantityRemaining) > 0);
      if (params.ingredientId) rows = rows.filter((row) => row.ingredientId === params.ingredientId);
      const ordered = [...rows].sort((a, b) => {
        const ax = a.expiryDate ?? "";
        const bx = b.expiryDate ?? "";
        if (ax !== bx) {
          if (!ax) return 1;
          if (!bx) return -1;
          return ax.localeCompare(bx);
        }
        const ar = String(a.receivedDate ?? "");
        const br = String(b.receivedDate ?? "");
        if (ar !== br) return ar.localeCompare(br);
        return String(a.id ?? "").localeCompare(String(b.id ?? ""));
      });
      return { resource, limit, items: ordered.slice(0, limit) as T[], hasMore: ordered.length > limit, nextCursor: null };
    }

    default:
      throw Object.assign(new Error(`Unknown resource: ${resource}`), { statusCode: 404 });
  }
}
