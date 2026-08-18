import { authenticateRequest } from "../_auth.js";
import { getSql, sendError, setPrivateNoStore } from "../_db.js";
import { canRoleSeeCosts, stripCostFieldsFromRows } from "../../shared/actionPolicy.js";
import { requireActiveSession } from "../_auth.js";
import { buildPage, clampLimit, decodeCursor, requireCollectionAccess } from "../_projection.js";

// Route-scoped reads. One dynamic route rather than four files so the project
// stays well clear of the serverless function limit; the resource is validated
// against an allow-list, never interpolated into SQL.
const RESOURCES = new Set(["summary", "orders", "audit", "movements", "batches"]);

// Lots are read FEFO — soonest expiry first — because that is the order a
// kitchen actually consumes them in. That ordering is the product behaviour, so
// this is a bounded top-N read rather than a browsable cursor: callers either
// want one ingredient's lots or the next lots to worry about.
async function fefoBatches(sql, { limit, ingredientId }) {
  const rows = await sql`
    select id, ingredient_id as "ingredientId", purchase_id as "purchaseId",
      quantity_received::float as "quantityReceived", quantity_remaining::float as "quantityRemaining",
      unit, expiry_date::text as "expiryDate", received_date::text as "receivedDate", notes,
      created_at as "createdAt"
    from ingredient_batches
    where quantity_remaining > 0
      and (${ingredientId}::text is null or ingredient_id = ${ingredientId})
    order by expiry_date nulls last, received_date, id
    limit ${limit + 1}
  `;
  return buildPage(rows, limit);
}

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

// entityType/entityId let a record's own page fetch just its history, instead of
// the client filtering a truncated copy of the whole trail.
async function pagedAudit(sql, { cursor, limit, entityType, entityId }) {
  const rows = cursor
    ? await sql`
        select id, entity_type as "entityType", entity_id as "entityId", action,
          before_data as "beforeData", after_data as "afterData", actor, created_at as "createdAt"
        from audit_logs
        where (${entityType}::text is null or entity_type = ${entityType})
          and (${entityId}::text is null or entity_id = ${entityId})
          and (created_at, id) < (${cursor.at}::timestamptz, ${cursor.id})
        order by created_at desc, id desc
        limit ${limit + 1}
      `
    : await sql`
        select id, entity_type as "entityType", entity_id as "entityId", action,
          before_data as "beforeData", after_data as "afterData", actor, created_at as "createdAt"
        from audit_logs
        where (${entityType}::text is null or entity_type = ${entityType})
          and (${entityId}::text is null or entity_id = ${entityId})
        order by created_at desc, id desc
        limit ${limit + 1}
      `;
  return buildPage(rows, limit);
}

async function pagedMovements(sql, { cursor, limit, ingredientId, movementType }) {
  const rows = cursor
    ? await sql`
        select id, ingredient_id as "ingredientId", movement_type as "movementType",
          quantity_change::float as "quantityChange", unit, related_order_id as "relatedOrderId",
          related_order_item_id as "relatedOrderItemId", related_purchase_id as "relatedPurchaseId",
          note, created_by as "createdBy", created_at as "createdAt"
        from inventory_movements
        where (${ingredientId}::text is null or ingredient_id = ${ingredientId})
          and (${movementType}::text is null or movement_type = ${movementType})
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
          and (${movementType}::text is null or movement_type = ${movementType})
        order by created_at desc, id desc
        limit ${limit + 1}
      `;
  return buildPage(rows, limit);
}

// Counts computed in the database rather than by shipping every row to the
// browser and calling .length on it, which is what bootstrap effectively does.
async function dashboardSummary(sql) {
  const [orderCounts, stockCounts, movementCount, auditCount, movementStats, topUsed] = await Promise.all([
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
    sql`select count(*)::int as total from audit_logs`,
    // Aggregated over the whole table. The dashboard used to compute these from
    // whatever fitted in the last 200 movements, so "most used ingredient" meant
    // "most used inside a truncated window" and quietly changed as history grew.
    sql`select count(*) filter (where movement_type = 'waste')::int as "wasteEvents" from inventory_movements`,
    sql`
      select ingredient_id as "ingredientId", sum(abs(quantity_change))::float as "quantityUsed"
      from inventory_movements
      where movement_type = 'production_use'
      group by ingredient_id
      order by sum(abs(quantity_change)) desc
      limit 1
    `
  ]);

  return {
    orders: orderCounts[0] ?? {},
    inventory: stockCounts[0] ?? {},
    movements: {
      wasteEvents: movementStats[0]?.wasteEvents ?? 0,
      topUsedIngredientId: topUsed[0]?.ingredientId ?? null,
      topUsedQuantity: topUsed[0]?.quantityUsed ?? 0
    },
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
      const summary = await dashboardSummary(sql);
      // The dashboard's money tiles are aggregates, so there is no field list to
      // filter -- they are simply withheld. A Viewer gets the counts.
      if (!canRoleSeeCosts(actor.role) && summary.orders) {
        const { netTotalValue, outstandingBalance, ...counts } = summary.orders;
        void netTotalValue;
        void outstandingBalance;
        summary.orders = counts;
      }
      res.status(200).json({ resource, summary });
      return;
    }

    const page = resource === "orders"
      ? await pagedOrders(sql, { cursor, limit })
      : resource === "audit"
        ? await pagedAudit(sql, {
            cursor,
            limit,
            entityType: req.query?.entityType || null,
            entityId: req.query?.entityId || null
          })
        : resource === "batches"
          ? await fefoBatches(sql, { limit, ingredientId: req.query?.ingredientId || null })
          : await pagedMovements(sql, {
              cursor,
              limit,
              ingredientId: req.query?.ingredientId || null,
              movementType: req.query?.movementType || null
            });

    // An orders page carries the same pricing columns the snapshot does, so it
    // gets the same projection. Without this the Viewer's costs would simply
    // arrive by a different route.
    if (resource === "orders" && !canRoleSeeCosts(actor.role) && Array.isArray(page.rows)) {
      page.rows = stripCostFieldsFromRows("orders", page.rows);
    }
    res.status(200).json({ resource, limit, ...page });
  } catch (error) {
    sendError(res, error);
  }
}
