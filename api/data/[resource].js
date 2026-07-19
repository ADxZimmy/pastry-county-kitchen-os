import { authenticateRequest } from "../_auth.js";
import { getSql, sendError, setPrivateNoStore } from "../_db.js";
import { requireActiveSession } from "../_auth.js";
import { buildPage, clampLimit, decodeCursor, requireCollectionAccess } from "../_projection.js";

// Route-scoped reads. One dynamic route rather than four files so the project
// stays well clear of the serverless function limit; the resource is validated
// against an allow-list, never interpolated into SQL.
const RESOURCES = new Set(["summary", "orders", "audit", "movements"]);

// Keyset pagination. The cursor names the last row seen as (created_at, id) and
// every query orders by that same pair, so a row inserted mid-pagination cannot
// shift the window and cause a skipped or duplicated row the way OFFSET does.
async function pagedOrders(sql, { cursor, limit }) {
  const rows = cursor
    ? await sql`
        select id, customer_name as "customerName", customer_phone as "customerPhone", due_date::text as "dueDate",
          delivery_method as "deliveryMethod", status, payment_status as "paymentStatus",
          production_status as "productionStatus", stock_status as "stockStatus", notes,
          delivery_fee::float as "deliveryFee", discount_amount::float as "discountAmount",
          tax_rate::float as "taxRate", amount_paid::float as "amountPaid", subtotal::float as "subtotal",
          tax_amount::float as "taxAmount", net_total::float as "netTotal", gross_total::float as "grossTotal",
          balance::float as "balance", created_at as "createdAt"
        from orders
        where coalesce(archived, false) = false and (created_at, id) < (${cursor.at}::timestamptz, ${cursor.id})
        order by created_at desc, id desc
        limit ${limit + 1}
      `
    : await sql`
        select id, customer_name as "customerName", customer_phone as "customerPhone", due_date::text as "dueDate",
          delivery_method as "deliveryMethod", status, payment_status as "paymentStatus",
          production_status as "productionStatus", stock_status as "stockStatus", notes,
          delivery_fee::float as "deliveryFee", discount_amount::float as "discountAmount",
          tax_rate::float as "taxRate", amount_paid::float as "amountPaid", subtotal::float as "subtotal",
          tax_amount::float as "taxAmount", net_total::float as "netTotal", gross_total::float as "grossTotal",
          balance::float as "balance", created_at as "createdAt"
        from orders
        where coalesce(archived, false) = false
        order by created_at desc, id desc
        limit ${limit + 1}
      `;
  return buildPage(rows, limit);
}

async function pagedAudit(sql, { cursor, limit }) {
  const rows = cursor
    ? await sql`
        select id, entity_type as "entityType", entity_id as "entityId", action,
          before_data as "beforeData", after_data as "afterData", actor, created_at as "createdAt"
        from audit_logs
        where (created_at, id) < (${cursor.at}::timestamptz, ${cursor.id})
        order by created_at desc, id desc
        limit ${limit + 1}
      `
    : await sql`
        select id, entity_type as "entityType", entity_id as "entityId", action,
          before_data as "beforeData", after_data as "afterData", actor, created_at as "createdAt"
        from audit_logs
        order by created_at desc, id desc
        limit ${limit + 1}
      `;
  return buildPage(rows, limit);
}

async function pagedMovements(sql, { cursor, limit, ingredientId }) {
  const rows = cursor
    ? await sql`
        select id, ingredient_id as "ingredientId", movement_type as "movementType",
          quantity_change::float as "quantityChange", unit, related_order_id as "relatedOrderId",
          related_order_item_id as "relatedOrderItemId", related_purchase_id as "relatedPurchaseId",
          note, created_by as "createdBy", created_at as "createdAt"
        from inventory_movements
        where (${ingredientId}::text is null or ingredient_id = ${ingredientId})
          and (created_at, id) < (${cursor.at}::timestamptz, ${cursor.id})
        order by created_at desc, id desc
        limit ${limit + 1}
      `
    : await sql`
        select id, ingredient_id as "ingredientId", movement_type as "movementType",
          quantity_change::float as "quantityChange", unit, related_order_id as "relatedOrderId",
          related_order_item_id as "relatedOrderItemId", related_purchase_id as "relatedPurchaseId",
          note, created_by as "createdBy", created_at as "createdAt"
        from inventory_movements
        where (${ingredientId}::text is null or ingredient_id = ${ingredientId})
        order by created_at desc, id desc
        limit ${limit + 1}
      `;
  return buildPage(rows, limit);
}

// Counts computed in the database rather than by shipping every row to the
// browser and calling .length on it, which is what bootstrap effectively does.
async function dashboardSummary(sql) {
  const [orderCounts, stockCounts, movementCount, auditCount] = await Promise.all([
    sql`
      select count(*)::int as total,
        count(*) filter (where status = 'Draft')::int as draft,
        count(*) filter (where status in ('Confirmed','Stock Reserved'))::int as upcoming,
        count(*) filter (where status = 'In Production')::int as "inProduction",
        count(*) filter (where status = 'Produced')::int as produced,
        count(*) filter (where status = 'Delivered')::int as delivered,
        coalesce(sum(net_total) filter (where status <> 'Cancelled'), 0)::float as "netTotalValue",
        coalesce(sum(balance) filter (where status <> 'Cancelled'), 0)::float as "outstandingBalance"
      from orders where coalesce(archived, false) = false
    `,
    sql`
      select count(*)::int as total,
        count(*) filter (where current_stock <= reorder_level)::int as "atOrBelowReorder",
        count(*) filter (where current_stock <= 0)::int as "outOfStock"
      from ingredients where active = true
    `,
    sql`select count(*)::int as total from inventory_movements`,
    sql`select count(*)::int as total from audit_logs`
  ]);

  return {
    orders: orderCounts[0] ?? {},
    inventory: stockCounts[0] ?? {},
    totals: {
      inventoryMovements: movementCount[0]?.total ?? 0,
      auditLogs: auditCount[0]?.total ?? 0
    }
  };
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    setPrivateNoStore(res);
    res.setHeader("Vary", "Cookie");

    const resource = String(req.query?.resource ?? "");
    if (!RESOURCES.has(resource)) {
      res.status(404).json({ error: "Unknown resource." });
      return;
    }

    const sql = getSql();
    // Same session checks as bootstrap: a disabled or revoked account cannot
    // reach these reads just because they are a different route.
    const actor = await requireActiveSession(sql, await authenticateRequest(sql, req));
    requireCollectionAccess(actor, resource === "audit" ? "audit" : resource);

    const limit = clampLimit(req.query?.limit);
    const cursor = decodeCursor(req.query?.cursor);

    if (resource === "summary") {
      res.status(200).json({ resource, summary: await dashboardSummary(sql) });
      return;
    }

    const page = resource === "orders"
      ? await pagedOrders(sql, { cursor, limit })
      : resource === "audit"
        ? await pagedAudit(sql, { cursor, limit })
        : await pagedMovements(sql, { cursor, limit, ingredientId: req.query?.ingredientId || null });

    res.status(200).json({ resource, limit, ...page });
  } catch (error) {
    sendError(res, error);
  }
}
