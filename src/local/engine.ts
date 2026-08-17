// The device-mode action engine.
//
// Every mutation a device account makes runs here instead of at POST
// /api/actions. It is deliberately pure: a workspace goes in, a result and a set
// of changed collections come out, and nothing touches IndexedDB or the network.
// That is what lets the whole thing be tested with plain objects, and it is also
// what makes the store's job safe -- it can write every changed collection in one
// transaction, and an action that throws leaves nothing behind.
//
// Where a rule is shared with the server it is imported from shared/, not
// re-implemented (see shared/engine-parity.test.js). Where the server's version
// is SQL -- requirements for an order, reservation balances, FEFO lot selection --
// it is ported here against arrays, holding the same arithmetic.
//
// One trap worth naming: src/lib/kitchen.ts already computes recipe requirements,
// and reusing it here would have been the obvious shortcut. It applies DISPLAY
// rounding (whole eggs, ceil for pcs, one decimal for measured units) before
// summing, which is right for a preview and wrong for a deduction. The server
// rounds nothing. This file ports the server's formula.
import {
  actorLabel,
  archiveTableForEntity,
  canRolePerformAction,
  conversionApplyConflict,
  conversionFactor,
  convertPurchaseQuantity,
  id,
  isValidOrderTransition,
  movementTypes,
  normalizeDeductionStage,
  normalizeStockHoldStage,
  num,
  planBatchDeductions,
  productionCompletionPreflight,
  RECIPE_ITEM_UNITS,
  required,
  shouldHoldStockForStatus
} from "../../shared/actionPolicy.js";
import { computeOrderPricing } from "../../shared/orderPricing.js";
import { validatePositiveNumber, validateQuantityIncrement } from "../../shared/policy.js";
import type { CollectionKey, EngineActor, EngineChanges, EngineResult, LocalWorkspace, ProductionRun } from "./types";

type AnyRecord = Record<string, any>;

function fail(message: string, statusCode = 400): never {
  throw Object.assign(new Error(message), { statusCode });
}

// A working copy of the workspace. Arrays are copied up front and records are
// replaced rather than mutated, so the caller's workspace is untouched until the
// store commits the result.
class Draft {
  ws: LocalWorkspace;
  // Set when an action claims a production run, so the store knows to insert it
  // with IndexedDB add() rather than put().
  claim: ProductionRun | null = null;
  private dirty = new Set<string>();

  constructor(source: LocalWorkspace) {
    this.ws = {
      suppliers: [...source.suppliers],
      ingredients: [...source.ingredients],
      products: [...source.products],
      recipes: [...source.recipes],
      recipeItems: [...source.recipeItems],
      orders: [...source.orders],
      orderItems: [...source.orderItems],
      orderEvents: [...source.orderEvents],
      inventoryMovements: [...source.inventoryMovements],
      ingredientBatches: [...source.ingredientBatches],
      productionQcLogs: [...source.productionQcLogs],
      auditLogs: [...source.auditLogs],
      conversionRules: [...source.conversionRules],
      purchaseLogs: [...source.purchaseLogs],
      importBatches: [...source.importBatches],
      productionRuns: [...source.productionRuns],
      settings: { ...source.settings }
    };
  }

  list(key: CollectionKey): AnyRecord[] {
    return this.ws[key] as unknown as AnyRecord[];
  }

  touch(key: CollectionKey | "settings") {
    this.dirty.add(key);
  }

  add(key: CollectionKey, record: AnyRecord) {
    this.list(key).push(record);
    this.touch(key);
  }

  // Replaces the record rather than mutating it, so a rejected action cannot
  // leave a half-applied object in the caller's workspace.
  patch(key: CollectionKey, matcher: (row: AnyRecord) => boolean, changes: AnyRecord | ((row: AnyRecord) => AnyRecord)) {
    const list = this.list(key);
    let touched = false;
    for (let i = 0; i < list.length; i += 1) {
      if (!matcher(list[i])) continue;
      const next = typeof changes === "function" ? changes(list[i]) : changes;
      list[i] = { ...list[i], ...next };
      touched = true;
    }
    if (touched) this.touch(key);
    return touched;
  }

  removeWhere(key: CollectionKey, matcher: (row: AnyRecord) => boolean) {
    const list = this.list(key);
    const kept = list.filter((row) => !matcher(row));
    if (kept.length !== list.length) {
      (this.ws as AnyRecord)[key] = kept;
      this.touch(key);
    }
  }

  changes(extra: Partial<EngineChanges> = {}): EngineChanges {
    const collections: EngineChanges["collections"] = {};
    let settings: LocalWorkspace["settings"] | undefined;
    for (const key of this.dirty) {
      if (key === "settings") settings = this.ws.settings;
      else collections[key as CollectionKey] = (this.ws as AnyRecord)[key];
    }
    const out: EngineChanges = { ...extra };
    if (Object.keys(collections).length) out.collections = collections;
    if (settings) out.settings = settings;
    return out;
  }
}

// ---------------------------------------------------------------------------
// Ledger helpers
// ---------------------------------------------------------------------------

function writeAudit(
  draft: Draft,
  entityType: string,
  entityId: string,
  action: string,
  beforeData: unknown,
  afterData: unknown,
  actor: EngineActor | null,
  nowIso: string
) {
  draft.add("auditLogs", {
    id: id("audit"),
    entityType,
    entityId,
    action,
    beforeData: beforeData ?? null,
    afterData: afterData ?? null,
    actor: actorLabel(actor),
    createdAt: nowIso
  });
}

function writeOrderEvent(
  draft: Draft,
  {
    orderId,
    eventType,
    actor,
    previousStatus = null,
    newStatus = null,
    metadata = {},
    note = null
  }: {
    orderId: string;
    eventType: string;
    actor: EngineActor | null;
    previousStatus?: string | null;
    newStatus?: string | null;
    metadata?: AnyRecord;
    note?: string | null;
  },
  nowIso: string
) {
  draft.add("orderEvents", {
    id: id("oevt"),
    orderId,
    eventType,
    actorUserId: actor?.sub ?? null,
    actorName: actorLabel(actor),
    previousStatus,
    newStatus,
    metadata,
    note,
    createdAt: nowIso
  });
}

function writeMovement(
  draft: Draft,
  {
    ingredientId,
    movementType,
    quantityChange,
    unit,
    relatedOrderId = null,
    relatedPurchaseId = null,
    note = "",
    actor
  }: {
    ingredientId: string;
    movementType: string;
    quantityChange: number;
    unit: string;
    relatedOrderId?: string | null;
    relatedPurchaseId?: string | null;
    note?: string;
    actor: EngineActor | null;
  },
  nowIso: string
) {
  draft.add("inventoryMovements", {
    id: id("mov"),
    ingredientId,
    movementType,
    quantityChange,
    unit,
    relatedOrderId,
    relatedOrderItemId: null,
    relatedPurchaseId,
    note,
    createdBy: actorLabel(actor),
    createdAt: nowIso
  });
}

// ---------------------------------------------------------------------------
// Requirements, reservations, FEFO
// ---------------------------------------------------------------------------

function scopeMatches(ruleValue: unknown, candidate: unknown) {
  if (ruleValue === null || ruleValue === undefined || ruleValue === "") return true;
  return String(ruleValue).toLowerCase() === String(candidate ?? "").toLowerCase();
}

// Ports the LEFT JOIN LATERAL in the server's requirementsForOrder: among active
// rules for this ingredient and unit pair, prefer the most specifically scoped,
// then verified, then most recently updated.
function scopedConversionRule(ws: LocalWorkspace, ingredientId: string, fromUnit: string, toUnit: string, item: AnyRecord, recipe: AnyRecord) {
  const prep = (item?.prepState ?? {}) as AnyRecord;
  const context = (recipe?.formulaMetadata as AnyRecord)?.productFamily ?? recipe?.category ?? "";
  const candidates = ws.conversionRules.filter((rule: AnyRecord) => {
    if (rule.active === false) return false;
    if (rule.ingredientId !== ingredientId) return false;
    if (rule.fromUnit !== fromUnit || rule.toUnit !== toUnit) return false;
    return (
      scopeMatches(rule.ingredientState, prep.ingredientState) &&
      scopeMatches(rule.temperatureState, prep.temperatureState) &&
      scopeMatches(rule.formulaContext, context)
    );
  }) as AnyRecord[];
  if (!candidates.length) return null;
  const score = (rule: AnyRecord) =>
    (rule.ingredientState ? 1 : 0) + (rule.temperatureState ? 1 : 0) + (rule.formulaContext ? 1 : 0);
  return [...candidates].sort((a, b) => {
    const byScore = score(b) - score(a);
    if (byScore) return byScore;
    const byVerified = Number(Boolean(b.verified)) - Number(Boolean(a.verified));
    if (byVerified) return byVerified;
    return String(b.updatedAt ?? "").localeCompare(String(a.updatedAt ?? ""));
  })[0];
}

export interface Requirement {
  ingredientId: string;
  unit: string;
  quantity: number;
}

// The server's formula, unrounded:
//   quantity * (1 + waste/100) * requestedYield / baseYield * multiplier
// summed per ingredient and base unit.
export function requirementsForOrder(ws: LocalWorkspace, orderId: string): Requirement[] {
  const lines = ws.orderItems.filter((row: AnyRecord) => row.orderId === orderId) as AnyRecord[];
  const totals = new Map<string, Requirement>();

  for (const line of lines) {
    const recipe = ws.recipes.find((r: AnyRecord) => r.id === line.recipeId) as AnyRecord | undefined;
    if (!recipe) continue;
    const baseYield = Number(recipe.baseYieldQuantity);
    if (!Number.isFinite(baseYield) || baseYield <= 0) continue;
    const requestedYield = Number(line.requestedYieldQuantity ?? 0);
    const multiplier = Number(line.quantityMultiplier ?? 1);

    for (const item of ws.recipeItems.filter((ri: AnyRecord) => ri.recipeId === recipe.id) as AnyRecord[]) {
      const ingredient = ws.ingredients.find((ing: AnyRecord) => ing.id === item.ingredientId) as AnyRecord | undefined;
      if (!ingredient) continue;
      const baseUnit = ingredient.baseUnit || item.unit;
      const waste = Number(item.wastePercentage ?? 0);
      const raw = Number(item.quantity) * (1 + waste / 100) * (requestedYield / baseYield) * multiplier;
      const rule = scopedConversionRule(ws, item.ingredientId, item.unit, baseUnit, item, recipe);
      const factor = conversionFactor(item.unit, baseUnit, rule?.conversionFactor);
      const key = `${item.ingredientId}:${baseUnit}`;
      const existing = totals.get(key) ?? { ingredientId: item.ingredientId, unit: baseUnit, quantity: 0 };
      existing.quantity += raw * factor;
      totals.set(key, existing);
    }
  }
  return [...totals.values()];
}

// Reservation state is not a column: it is the ledger, netted per ingredient and
// unit. ingredients.reservedStock mirrors it.
export function reservationBalances(ws: LocalWorkspace, orderId: string) {
  const balances = new Map<string, number>();
  for (const movement of ws.inventoryMovements as AnyRecord[]) {
    if (movement.relatedOrderId !== orderId) continue;
    const key = `${movement.ingredientId}:${movement.unit}`;
    if (movement.movementType === "reservation") {
      balances.set(key, (balances.get(key) ?? 0) + Number(movement.quantityChange));
    } else if (movement.movementType === "reservation_release") {
      balances.set(key, (balances.get(key) ?? 0) - Math.abs(Number(movement.quantityChange)));
    }
  }
  for (const [key, value] of balances) balances.set(key, Math.max(0, value));
  return balances;
}

function shortagesForProduction(ws: LocalWorkspace, orderId: string, requirements: Requirement[]) {
  const reserved = reservationBalances(ws, orderId);
  const shortages: AnyRecord[] = [];
  for (const requirement of requirements) {
    const ingredient = ws.ingredients.find((row: AnyRecord) => row.id === requirement.ingredientId) as AnyRecord | undefined;
    const currentStock = Number(ingredient?.currentStock ?? 0);
    const reservedStock = Number(ingredient?.reservedStock ?? 0);
    const forThisOrder = reserved.get(`${requirement.ingredientId}:${requirement.unit}`) ?? 0;
    const usable = currentStock - Math.max(0, reservedStock - forThisOrder);
    const shortage = Math.max(0, requirement.quantity - usable);
    if (shortage > 1e-9) {
      shortages.push({
        ingredientId: requirement.ingredientId,
        ingredientName: ingredient?.name ?? requirement.ingredientId,
        unit: requirement.unit,
        requiredQuantity: requirement.quantity,
        availableQuantity: usable,
        shortageQuantity: shortage
      });
    }
  }
  return shortages;
}

function shortageSummaryText(shortages: AnyRecord[]) {
  return shortages
    .map((item) => `${item.ingredientName}: short ${Number(item.shortageQuantity).toFixed(1)}${item.unit || ""}`)
    .join(", ");
}

// FEFO order: soonest expiry first with undated lots last, then received, then
// created. Matches `order by expiry_date nulls last, received_date, created_at`.
function fefoLots(ws: LocalWorkspace, ingredientId: string, unit: string) {
  return (ws.ingredientBatches as AnyRecord[])
    .filter((lot) => lot.ingredientId === ingredientId && lot.unit === unit && Number(lot.quantityRemaining) > 0)
    .sort((a, b) => {
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
      return String(a.createdAt ?? "").localeCompare(String(b.createdAt ?? ""));
    })
    .map((lot) => ({ id: lot.id, quantity_remaining: Number(lot.quantityRemaining) }));
}

function applyLotDeductions(draft: Draft, plan: { batchId: string; quantity: number }[], nowIso: string) {
  for (const deduction of plan) {
    draft.patch("ingredientBatches", (row) => row.id === deduction.batchId, (row) => ({
      quantityRemaining: Math.max(0, Number(row.quantityRemaining) - deduction.quantity),
      updatedAt: nowIso
    }));
  }
}

function stockStatusFor(ws: LocalWorkspace, requirements: Requirement[]) {
  if (!requirements.length) return "In Stock";
  for (const requirement of requirements) {
    const ingredient = ws.ingredients.find((row: AnyRecord) => row.id === requirement.ingredientId) as AnyRecord | undefined;
    const available = Number(ingredient?.currentStock ?? 0) - Number(ingredient?.reservedStock ?? 0);
    if (available < requirement.quantity) return "Shortage";
  }
  return "In Stock";
}

// ---------------------------------------------------------------------------
// Reserve / release / deduct
// ---------------------------------------------------------------------------

function reserveOrder(draft: Draft, orderId: string, actor: EngineActor | null, nowIso: string) {
  const order = draft.list("orders").find((row) => row.id === orderId);
  if (!order) fail("Order not found.", 404);
  if (["Produced", "Delivered", "Cancelled"].includes(order.status)) {
    return { reserved: false, alreadyFinal: true };
  }

  const requirements = requirementsForOrder(draft.ws, orderId);
  const reserved = reservationBalances(draft.ws, orderId);
  const plan = requirements.map((requirement) => {
    const ingredient = draft.list("ingredients").find((row) => row.id === requirement.ingredientId);
    const alreadyReserved = reserved.get(`${requirement.ingredientId}:${requirement.unit}`) ?? 0;
    const remaining = Math.max(0, requirement.quantity - alreadyReserved);
    const available = Math.max(0, Number(ingredient?.currentStock ?? 0) - Number(ingredient?.reservedStock ?? 0));
    const reserveQuantity = Math.min(remaining, available);
    return {
      ingredientId: requirement.ingredientId,
      unit: requirement.unit,
      requiredQuantity: requirement.quantity,
      alreadyReserved,
      reserveQuantity,
      shortageQuantity: Math.max(0, remaining - reserveQuantity)
    };
  });

  const toCreate = plan.filter((item) => item.reserveQuantity > 1e-9);
  const shortages = plan.filter((item) => item.shortageQuantity > 1e-9);
  // A partial reservation is allowed on purpose: a kitchen must be able to accept
  // an order it still needs to shop for. The order keeps its status and is flagged.
  const isComplete = shortages.length === 0;
  const previousStatus = order.status;

  for (const item of toCreate) {
    writeMovement(
      draft,
      {
        ingredientId: item.ingredientId,
        movementType: "reservation",
        quantityChange: item.reserveQuantity,
        unit: item.unit,
        relatedOrderId: orderId,
        note: isComplete ? "Reserved stock for confirmed order" : "Partially reserved available stock for confirmed order",
        actor
      },
      nowIso
    );
    draft.patch("ingredients", (row) => row.id === item.ingredientId, (row) => ({
      reservedStock: Number(row.reservedStock ?? 0) + item.reserveQuantity,
      updatedAt: nowIso
    }));
  }

  draft.patch("orders", (row) => row.id === orderId, {
    status: isComplete ? "Stock Reserved" : previousStatus,
    stockStatus: isComplete ? "Reserved" : "Shortage",
    productionStatus: isComplete ? "Ready" : order.productionStatus ?? "Not Started",
    updatedAt: nowIso
  });

  if (toCreate.length) {
    writeOrderEvent(
      draft,
      {
        orderId,
        eventType: "reserved",
        actor,
        previousStatus,
        newStatus: isComplete ? "Stock Reserved" : previousStatus,
        metadata: { complete: isComplete, reservedLines: toCreate.length, shortages: shortages.length },
        note: isComplete ? "Stock reserved for order." : "Partial stock reserved; shortages remain."
      },
      nowIso
    );
  }

  return {
    reserved: toCreate.length > 0,
    partial: !isComplete,
    alreadyReserved: toCreate.length === 0 && plan.some((item) => item.alreadyReserved > 0),
    shortage: !isComplete,
    reservedLines: toCreate.length,
    shortages
  };
}

function releaseReservation(draft: Draft, orderId: string, actor: EngineActor | null, nowIso: string) {
  const balances = reservationBalances(draft.ws, orderId);
  const pending = [...balances.entries()].filter(([, quantity]) => quantity > 1e-9);
  if (!pending.length) return { released: false };

  for (const [key, quantity] of pending) {
    const [ingredientId, unit] = key.split(":");
    writeMovement(
      draft,
      {
        ingredientId,
        movementType: "reservation_release",
        quantityChange: -quantity,
        unit,
        relatedOrderId: orderId,
        note: "Released order reservation",
        actor
      },
      nowIso
    );
    draft.patch("ingredients", (row) => row.id === ingredientId, (row) => ({
      reservedStock: Math.max(0, Number(row.reservedStock ?? 0) - quantity),
      updatedAt: nowIso
    }));
  }
  writeOrderEvent(
    draft,
    { orderId, eventType: "reservation_released", actor, metadata: { lines: pending.length }, note: "Order reservation released." },
    nowIso
  );
  return { released: true, lines: pending.length };
}

interface DeductOptions {
  stage?: string;
  finalize?: boolean;
  qcLog?: AnyRecord | null;
  qcInput?: AnyRecord;
  requireStock?: boolean;
  allowNegative?: boolean;
}

// Deducts exactly once. The production-run claim is returned as
// `claimProductionRun` rather than pushed into a collection, so the store can
// insert it with IndexedDB add() -- a repeat or concurrent completion raises
// ConstraintError and aborts the whole transaction, which is the same guarantee
// the unique index on production_runs.order_id gives the server.
function deductOrderStock(
  draft: Draft,
  orderId: string,
  actor: EngineActor | null,
  nowIso: string,
  { stage = "production_completion", finalize = false, qcLog = null, qcInput = {}, requireStock = true, allowNegative = false }: DeductOptions = {}
): { deducted: boolean; shortage?: AnyRecord[]; claim?: ProductionRun } {
  if (draft.ws.productionRuns.some((run) => run.orderId === orderId)) {
    return { deducted: false };
  }

  const requirements = requirementsForOrder(draft.ws, orderId);
  const shortages = shortagesForProduction(draft.ws, orderId, requirements);
  const isBackorder = shortages.length > 0;
  if (isBackorder && !requireStock) return { deducted: false, shortage: shortages };
  if (isBackorder && !allowNegative) {
    draft.patch("orders", (row) => row.id === orderId, { stockStatus: "Shortage", updatedAt: nowIso });
    fail(`Cannot mark produced while ingredients are short: ${shortageSummaryText(shortages)}.`, 409);
  }

  const order = draft.list("orders").find((row) => row.id === orderId);
  const previousStatus = order?.status ?? null;
  const stageLabel = `${stage.replace(/_/g, " ")}${isBackorder ? " (backorder)" : ""}`;
  const finalStockStatus = isBackorder ? "Shortage" : "In Stock";

  for (const requirement of requirements) {
    const plan = planBatchDeductions(fefoLots(draft.ws, requirement.ingredientId, requirement.unit), requirement.quantity);
    writeMovement(
      draft,
      {
        ingredientId: requirement.ingredientId,
        movementType: "production_use",
        quantityChange: -requirement.quantity,
        unit: requirement.unit,
        relatedOrderId: orderId,
        note: `Deducted at ${stageLabel}`,
        actor
      },
      nowIso
    );
    draft.patch("ingredients", (row) => row.id === requirement.ingredientId, (row) => ({
      currentStock: Number(row.currentStock ?? 0) - requirement.quantity,
      reservedStock: Math.max(0, Number(row.reservedStock ?? 0) - requirement.quantity),
      updatedAt: nowIso
    }));
    applyLotDeductions(draft, plan, nowIso);
  }

  if (finalize && qcLog) draft.add("productionQcLogs", qcLog);
  if (finalize) {
    draft.patch("orders", (row) => row.id === orderId, {
      status: "Produced",
      productionStatus: "Completed",
      stockStatus: finalStockStatus,
      updatedAt: nowIso
    });
  }

  writeOrderEvent(
    draft,
    finalize
      ? {
          orderId,
          eventType: "produced",
          actor,
          previousStatus,
          newStatus: "Produced",
          metadata: { qcLogId: qcLog?.id, passedQc: qcLog?.passedQc, stage, backorder: isBackorder },
          note: isBackorder
            ? "Order marked produced on backorder; aggregate stock is negative."
            : "Order marked produced; ingredients deducted from stock."
        }
      : {
          orderId,
          eventType: "deducted",
          actor,
          previousStatus,
          newStatus: previousStatus,
          metadata: { stage, backorder: isBackorder },
          note: `Ingredients deducted from stock at ${stageLabel}.`
        },
    nowIso
  );

  const claim: ProductionRun = {
    orderId,
    id: id("prun"),
    batchKey: qcLog?.batchKey ?? null,
    actor: actorLabel(actor),
    plannedYield: qcLog?.expectedYieldQuantity ?? null,
    actualYield: qcLog?.actualYieldQuantity ?? null,
    wasteQuantity: qcLog
      ? num(qcInput.wasteQuantity) > 0
        ? num(qcInput.wasteQuantity)
        : Math.max(0, Number(qcLog.expectedYieldQuantity ?? 0) - Number(qcLog.actualYieldQuantity ?? 0))
      : null,
    qcLogId: qcLog?.id ?? null,
    createdAt: nowIso
  };
  draft.ws.productionRuns.push(claim);
  draft.claim = claim;
  return { deducted: true, claim };
}

function buildQcLog(draft: Draft, orderId: string, qcInput: AnyRecord, actor: EngineActor | null, nowIso: string) {
  const line = draft.list("orderItems").find((row) => row.orderId === orderId);
  const recipe = line ? draft.list("recipes").find((row) => row.id === line.recipeId) : undefined;
  const expected = Number(qcInput.expectedYieldQuantity ?? line?.requestedYieldQuantity ?? 0);
  const actual = Number(qcInput.actualYieldQuantity ?? expected);
  return {
    id: id("qc"),
    orderId,
    recipeId: recipe?.id ?? null,
    batchKey: qcInput.batchKey ?? null,
    formulaVersion: (recipe?.formulaMetadata as AnyRecord)?.version ?? null,
    expectedYieldQuantity: expected,
    actualYieldQuantity: actual,
    yieldUnit: recipe?.yieldUnit ?? null,
    roomTemperature: qcInput.roomTemperature ?? null,
    mixTemperature: qcInput.mixTemperature ?? null,
    ovenTemperature: qcInput.ovenTemperature ?? null,
    bakeTimeMinutes: qcInput.bakeTimeMinutes ?? null,
    restTimeMinutes: qcInput.restTimeMinutes ?? null,
    sensoryNotes: qcInput.sensoryNotes ?? null,
    defects: qcInput.defects ?? null,
    nextAdjustment: qcInput.nextAdjustment ?? null,
    passedQc: qcInput.passedQc === undefined ? true : Boolean(qcInput.passedQc),
    loggedBy: actorLabel(actor),
    createdAt: nowIso
  };
}

function produceOrder(draft: Draft, orderId: string, actor: EngineActor | null, qcInput: AnyRecord, nowIso: string) {
  const order = draft.list("orders").find((row) => row.id === orderId);
  if (!order) fail("Order not found.", 404);
  const status = order.status;
  const preflight = productionCompletionPreflight(status);
  if (preflight) return preflight;

  const qcLog = buildQcLog(draft, orderId, qcInput, actor, nowIso);
  const alreadyDeducted = draft.ws.productionRuns.some((run) => run.orderId === orderId);

  if (!alreadyDeducted) {
    const result = deductOrderStock(draft, orderId, actor, nowIso, {
      stage: "production_completion",
      finalize: true,
      qcLog,
      qcInput,
      requireStock: true,
      allowNegative: draft.ws.settings.allowNegativeInventory === true
    });
    if (result.deducted) {
      writeAudit(draft, "orders", orderId, "produce", { status }, { status: "Produced" }, actor, nowIso);
      return { produced: true, qcLogId: qcLog.id };
    }
  }

  // Stock left at an earlier stage. Finish without deducting again.
  draft.add("productionQcLogs", qcLog);
  draft.patch("orders", (row) => row.id === orderId, {
    status: "Produced",
    productionStatus: "Completed",
    stockStatus: "In Stock",
    updatedAt: nowIso
  });
  writeOrderEvent(
    draft,
    {
      orderId,
      eventType: "produced",
      actor,
      previousStatus: status,
      newStatus: "Produced",
      metadata: { qcLogId: qcLog.id, passedQc: qcLog.passedQc, deductedEarlier: true },
      note: "Order marked produced; stock was deducted at an earlier stage."
    },
    nowIso
  );
  writeAudit(draft, "orders", orderId, "produce", { status }, { status: "Produced" }, actor, nowIso);
  return { produced: true, qcLogId: qcLog.id, deductedEarlier: true };
}

function maybeDeductAtStage(draft: Draft, orderId: string, actor: EngineActor | null, stage: string, nowIso: string) {
  const configured = normalizeDeductionStage(draft.ws.settings.defaultDeductionStage);
  if (configured !== stage) return null;
  return deductOrderStock(draft, orderId, actor, nowIso, { stage, finalize: false, requireStock: false });
}

function holdIfConfigured(draft: Draft, orderId: string, status: string, actor: EngineActor | null, nowIso: string) {
  if (!shouldHoldStockForStatus(status, normalizeStockHoldStage(draft.ws.settings.stockHoldStage))) return null;
  return reserveOrder(draft, orderId, actor, nowIso);
}

export { deductOrderStock, produceOrder, releaseReservation, reserveOrder };

// ---------------------------------------------------------------------------
// Action dispatch
// ---------------------------------------------------------------------------

const CENTRAL_ONLY = new Set(["user.save", "user.disable", "user.revokeSessions", "schema.ensure"]);
const SERVER_ONLY = new Set(["import.extract", "notification.lowStockEmail"]);

export function runLocalAction(
  workspace: LocalWorkspace,
  action: string,
  payload: AnyRecord,
  actor: EngineActor | null,
  nowIso: string = new Date().toISOString()
): EngineResult {
  if (SERVER_ONLY.has(action)) fail(`${action} runs on the server, not in the local engine.`, 500);
  if (CENTRAL_ONLY.has(action)) {
    fail("Accounts are managed centrally and cannot be changed from a device workspace.", 403);
  }
  if (actor?.role && !canRolePerformAction(actor.role, action)) {
    fail(`${actor.role} cannot perform ${action}.`, 403);
  }

  const draft = new Draft(workspace);
  const result = runAction(draft, action, payload ?? {}, actor, nowIso);
  return { result, changes: draft.changes(draft.claim ? { claimProductionRun: draft.claim } : {}) };
}

function runAction(draft: Draft, action: string, body: AnyRecord, actor: EngineActor | null, nowIso: string): unknown {
  switch (action) {
    case "settings.save":
      return saveSettings(draft, body, actor, nowIso);
    case "supplier.save":
      return saveSupplier(draft, body, actor, nowIso);
    case "supplier.delete":
      return deleteSupplier(draft, body, actor, nowIso);
    case "ingredient.save":
      return saveIngredient(draft, body, actor, nowIso);
    case "ingredient.delete":
      return archiveIngredient(draft, body, actor, nowIso);
    case "ingredient.restore":
      return restoreEntity(draft, { entityType: "ingredient", id: body.id }, actor, nowIso);
    case "inventory.adjust":
      return adjustInventory(draft, body, actor, nowIso);
    case "shopping.purchaseSuggested":
      return purchaseSuggested(draft, body, actor, nowIso);
    case "recipe.save":
      return saveRecipe(draft, body, actor, nowIso);
    case "recipe.delete":
      return archiveRecipe(draft, body, actor, nowIso);
    case "conversion.save":
      return saveConversion(draft, body, actor, nowIso);
    case "conversion.verify":
      return verifyConversion(draft, body, actor, nowIso);
    case "conversion.delete":
      return archiveConversion(draft, body, actor, nowIso);
    case "conversion.applyToRecipeItem":
      return applyConversion(draft, body, actor, nowIso);
    case "order.save":
      return saveOrder(draft, body, actor, nowIso);
    case "order.reserve":
      return reserveAction(draft, body, actor, nowIso);
    case "order.releaseReservation":
      return releaseReservation(draft, required(body.orderId, "Order"), actor, nowIso);
    case "order.status":
      return changeOrderStatus(draft, body, actor, nowIso);
    case "order.produce":
      return produceOrder(draft, required(body.orderId, "Order"), actor, body.qcLog ?? {}, nowIso);
    case "order.delete":
      return deleteOrder(draft, body, actor, nowIso);
    case "production.batchStatus":
      return batchStatus(draft, body, actor, nowIso);
    case "archive.list":
      return listArchive(draft);
    case "archive.restore":
      return restoreEntity(draft, body, actor, nowIso);
    case "import.commit":
      return commitImport(draft, body, actor, nowIso);
    default:
      return fail(`Unknown action: ${action}`, 400);
  }
}

// --- settings -------------------------------------------------------------

function saveSettings(draft: Draft, body: AnyRecord, actor: EngineActor | null, nowIso: string) {
  const input = (body.settings ?? {}) as AnyRecord;
  const before = { ...draft.ws.settings };
  const next = {
    ...draft.ws.settings,
    businessName: String(input.businessName ?? draft.ws.settings.businessName ?? ""),
    currency: input.currency ?? draft.ws.settings.currency ?? "NGN",
    defaultDeductionStage: normalizeDeductionStage(input.defaultDeductionStage),
    stockHoldStage: normalizeStockHoldStage(input.stockHoldStage),
    allowNegativeInventory: input.allowNegativeInventory === true,
    // Forced true on the server too: a conversion must always be reviewed before
    // it changes a recipe.
    requireAiConversionConfirmation: true,
    gramRoundingPreference: [1, 5, 10].includes(Number(input.gramRoundingPreference))
      ? Number(input.gramRoundingPreference)
      : draft.ws.settings.gramRoundingPreference,
    eggRoundingPreference:
      input.eggRoundingPreference === "allow_gram_conversion" ? "allow_gram_conversion" : "nearest_whole_egg",
    safetyMarginPercentage: Math.max(0, num(input.safetyMarginPercentage, draft.ws.settings.safetyMarginPercentage ?? 0)),
    defaultTaxPercentage: Math.max(0, num(input.defaultTaxPercentage, draft.ws.settings.defaultTaxPercentage ?? 0)),
    lowStockNotificationEmail: String(input.lowStockNotificationEmail ?? draft.ws.settings.lowStockNotificationEmail ?? "")
  };
  draft.ws.settings = next as LocalWorkspace["settings"];
  draft.touch("settings");
  writeAudit(draft, "settings", "default", "update", before, next, actor, nowIso);
  return { ok: true };
}

// --- suppliers ------------------------------------------------------------

function saveSupplier(draft: Draft, body: AnyRecord, actor: EngineActor | null, nowIso: string) {
  const input = (body.supplier ?? {}) as AnyRecord;
  const name = required(input.name, "Supplier name");
  const existing = input.id ? draft.list("suppliers").find((row) => row.id === input.id) : undefined;
  const record = {
    id: input.id || id("sup"),
    name,
    contactName: input.contactName ?? "",
    phone: input.phone ?? "",
    email: input.email ?? "",
    address: input.address ?? "",
    defaultCurrency: input.defaultCurrency ?? "NGN",
    leadTimeDays: Math.max(0, num(input.leadTimeDays, 2)),
    suppliedIngredientIds: Array.isArray(input.suppliedIngredientIds) ? input.suppliedIngredientIds : [],
    notes: input.notes ?? "",
    active: true,
    createdAt: existing?.createdAt ?? nowIso,
    updatedAt: nowIso
  };
  if (existing) draft.patch("suppliers", (row) => row.id === record.id, record);
  else draft.add("suppliers", record);
  writeAudit(draft, "suppliers", record.id, existing ? "update" : "create", existing ?? null, record, actor, nowIso);
  return { ok: true, id: record.id };
}

function deleteSupplier(draft: Draft, body: AnyRecord, actor: EngineActor | null, nowIso: string) {
  const supplierId = required(body.id, "Supplier");
  const linked = draft.list("ingredients").filter((row) => row.supplierId === supplierId && row.active !== false);
  if (linked.length) {
    const names = linked.slice(0, 5).map((row) => row.name).join(", ");
    fail(`This supplier is still linked to ${linked.length} active ingredient(s): ${names}. Reassign them first.`, 409);
  }
  const before = draft.list("suppliers").find((row) => row.id === supplierId);
  if (!before) fail("Supplier not found.", 404);
  draft.patch("suppliers", (row) => row.id === supplierId, { active: false, updatedAt: nowIso });
  writeAudit(draft, "suppliers", supplierId, "archive", before, { ...before, active: false }, actor, nowIso);
  return { ok: true, archived: true };
}

// --- ingredients ----------------------------------------------------------

function saveIngredient(draft: Draft, body: AnyRecord, actor: EngineActor | null, nowIso: string) {
  const input = (body.ingredient ?? {}) as AnyRecord;
  const name = required(input.name, "Ingredient name");
  const category = required(input.category, "Category");
  const baseUnit = String(input.baseUnit || "g");
  const existing = input.id ? draft.list("ingredients").find((row) => row.id === input.id) : undefined;

  if (!existing) {
    const duplicate = draft
      .list("ingredients")
      .find((row) => row.active !== false && String(row.name).toLowerCase() === name.toLowerCase());
    if (duplicate) fail(`An ingredient named "${duplicate.name}" already exists.`, 409);
  }

  const increments = { allowsDecimals: input.allowsDecimals, minimumIncrement: input.minimumIncrement };
  const currentStock = num(input.currentStock, existing?.currentStock ?? 0);
  const reorderLevel = num(input.reorderLevel, existing?.reorderLevel ?? 0);
  for (const [value, label] of [
    [currentStock, "Current stock"],
    [reorderLevel, "Reorder level"]
  ] as const) {
    if (value < 0) fail(`${label} cannot be negative.`);
    const incrementError = validateQuantityIncrement(value, baseUnit, label, increments);
    if (incrementError) fail(incrementError);
  }

  const purchaseQuantity = num(input.purchaseQuantity, 0);
  const purchasePrice = num(input.purchasePrice, 0);
  const purchaseUnit = String(input.purchaseUnit || baseUnit);
  let latestUnitCost = num(input.latestUnitCost, existing?.latestUnitCost ?? 0);
  let convertedQuantity = 0;
  if (purchaseQuantity > 0) {
    const incrementError = validateQuantityIncrement(purchaseQuantity, purchaseUnit, "Purchase quantity", increments);
    if (incrementError) fail(incrementError);
    convertedQuantity = convertPurchaseQuantity(purchaseQuantity, purchaseUnit, baseUnit);
    if (purchasePrice > 0) latestUnitCost = purchasePrice / convertedQuantity;
  }

  const expiryDays = num(input.defaultExpiryDays, existing?.defaultExpiryDays ?? 0);
  const record = {
    id: input.id || id("ing"),
    name,
    category,
    baseUnit,
    purchaseUnit,
    currentStock: currentStock + convertedQuantity,
    reservedStock: existing?.reservedStock ?? 0,
    reorderLevel,
    latestUnitCost,
    supplierId: input.supplierId || null,
    allowsDecimals: input.allowsDecimals ?? existing?.allowsDecimals ?? null,
    minimumIncrement: input.minimumIncrement ?? existing?.minimumIncrement ?? null,
    expiryTrackingEnabled: input.expiryTrackingEnabled ?? existing?.expiryTrackingEnabled ?? false,
    defaultExpiryDays: expiryDays || null,
    expiryDate: input.expiryDate ?? existing?.expiryDate ?? null,
    allergenProfile: input.allergenProfile ?? existing?.allergenProfile ?? {},
    storageProfile: input.storageProfile ?? existing?.storageProfile ?? {},
    notes: input.notes ?? existing?.notes ?? "",
    active: true,
    createdAt: existing?.createdAt ?? nowIso,
    updatedAt: nowIso
  };

  if (existing) draft.patch("ingredients", (row) => row.id === record.id, record);
  else draft.add("ingredients", record);

  if (purchaseQuantity > 0) {
    const purchaseId = id("pur");
    const expiryDate = input.expiryDate ?? (expiryDays > 0 ? new Date(Date.parse(nowIso) + expiryDays * 86400000).toISOString().slice(0, 10) : null);
    draft.add("purchaseLogs", {
      id: purchaseId,
      supplierId: record.supplierId,
      ingredientId: record.id,
      purchaseQuantity,
      purchaseUnit,
      purchasePrice,
      convertedQuantityInBaseUnit: convertedQuantity,
      costPerBaseUnit: latestUnitCost,
      purchaseDate: nowIso.slice(0, 10),
      expiryDate,
      notes: "Recorded with ingredient save",
      createdAt: nowIso
    });
    writeMovement(
      draft,
      {
        ingredientId: record.id,
        movementType: "purchase",
        quantityChange: convertedQuantity,
        unit: baseUnit,
        relatedPurchaseId: purchaseId,
        note: "Stock received",
        actor
      },
      nowIso
    );
    draft.add("ingredientBatches", {
      id: id("bat"),
      ingredientId: record.id,
      purchaseId,
      quantityReceived: convertedQuantity,
      quantityRemaining: convertedQuantity,
      unit: baseUnit,
      expiryDate,
      receivedDate: nowIso.slice(0, 10),
      createdAt: nowIso,
      updatedAt: nowIso
    });
  } else {
    writeMovement(
      draft,
      { ingredientId: record.id, movementType: "correction", quantityChange: 0, unit: baseUnit, note: existing ? "Ingredient updated" : "Ingredient created", actor },
      nowIso
    );
  }

  writeAudit(draft, "ingredients", record.id, existing ? "update" : "create", existing ?? null, record, actor, nowIso);
  return { ok: true, id: record.id };
}

function archiveIngredient(draft: Draft, body: AnyRecord, actor: EngineActor | null, nowIso: string) {
  const ingredientId = required(body.id, "Ingredient");
  const before = draft.list("ingredients").find((row) => row.id === ingredientId);
  if (!before) fail("Ingredient not found.", 404);
  draft.patch("ingredients", (row) => row.id === ingredientId, { active: false, updatedAt: nowIso });
  writeMovement(
    draft,
    { ingredientId, movementType: "correction", quantityChange: 0, unit: before.baseUnit, note: "Ingredient archived", actor },
    nowIso
  );
  writeAudit(draft, "ingredients", ingredientId, "archive", before, { ...before, active: false }, actor, nowIso);
  return { ok: true, archived: true };
}

function adjustInventory(draft: Draft, body: AnyRecord, actor: EngineActor | null, nowIso: string) {
  const ingredientId = required(body.ingredientId, "Ingredient");
  const ingredient = draft.list("ingredients").find((row) => row.id === ingredientId);
  if (!ingredient) fail("Ingredient not found.", 404);
  const movementType = String(body.movementType || "adjustment");
  if (!movementTypes.has(movementType)) fail(`Unsupported movement type: ${movementType}`);
  const quantityChange = num(body.quantityChange, 0);
  if (quantityChange === 0) fail("Quantity change must not be zero.");
  const unit = String(body.unit || ingredient.baseUnit);
  const incrementError = validateQuantityIncrement(Math.abs(quantityChange), unit, "Quantity change", {
    allowsDecimals: ingredient.allowsDecimals,
    minimumIncrement: ingredient.minimumIncrement
  });
  if (incrementError) fail(incrementError);

  const resulting = Number(ingredient.currentStock ?? 0) + quantityChange;
  if (resulting < 0) fail("This adjustment would take stock below zero.");

  writeMovement(
    draft,
    { ingredientId, movementType, quantityChange, unit, note: body.note ?? "Manual stock adjustment", actor },
    nowIso
  );
  draft.patch("ingredients", (row) => row.id === ingredientId, { currentStock: resulting, updatedAt: nowIso });

  if (quantityChange < 0) {
    applyLotDeductions(draft, planBatchDeductions(fefoLots(draft.ws, ingredientId, unit), Math.abs(quantityChange)), nowIso);
  } else if (movementType === "purchase") {
    draft.add("ingredientBatches", {
      id: id("bat"),
      ingredientId,
      purchaseId: null,
      quantityReceived: quantityChange,
      quantityRemaining: quantityChange,
      unit,
      expiryDate: body.expiryDate ?? null,
      receivedDate: nowIso.slice(0, 10),
      createdAt: nowIso,
      updatedAt: nowIso
    });
  }

  writeAudit(draft, "ingredients", ingredientId, "stock_adjust", { currentStock: ingredient.currentStock }, { currentStock: resulting, movementType, quantityChange }, actor, nowIso);
  return { ok: true };
}

function purchaseSuggested(draft: Draft, body: AnyRecord, actor: EngineActor | null, nowIso: string) {
  const items = Array.isArray(body.items) ? body.items : [];
  if (!items.length) fail("No purchases were supplied.");
  let count = 0;
  for (const item of items as AnyRecord[]) {
    const ingredient = draft.list("ingredients").find((row) => row.id === item.ingredientId);
    if (!ingredient) fail("Ingredient not found.", 404);
    const quantity = num(item.purchaseQuantity ?? item.suggestedBuyQuantity, 0);
    if (quantity <= 0) fail("Purchase quantity must be greater than zero.");
    const unitCost = num(item.unitCost, 0);
    if (unitCost <= 0) fail("Unit cost must be greater than zero.");
    const purchasePrice = item.purchasePrice === undefined ? quantity * unitCost : num(item.purchasePrice, 0);
    const unit = String(item.unit || ingredient.baseUnit);
    const purchaseId = id("pur");

    draft.add("purchaseLogs", {
      id: purchaseId,
      supplierId: item.supplierId || ingredient.supplierId || null,
      ingredientId: ingredient.id,
      purchaseQuantity: quantity,
      purchaseUnit: unit,
      purchasePrice,
      convertedQuantityInBaseUnit: quantity,
      costPerBaseUnit: purchasePrice / quantity,
      purchaseDate: nowIso.slice(0, 10),
      expiryDate: item.expiryDate ?? null,
      notes: item.note ?? "Marked purchased from shopping list",
      createdAt: nowIso
    });
    writeMovement(
      draft,
      { ingredientId: ingredient.id, movementType: "purchase", quantityChange: quantity, unit, relatedPurchaseId: purchaseId, note: "Marked purchased from shopping list", actor },
      nowIso
    );
    draft.patch("ingredients", (row) => row.id === ingredient.id, (row) => ({
      currentStock: Number(row.currentStock ?? 0) + quantity,
      latestUnitCost: purchasePrice / quantity,
      updatedAt: nowIso
    }));
    draft.add("ingredientBatches", {
      id: id("bat"),
      ingredientId: ingredient.id,
      purchaseId,
      quantityReceived: quantity,
      quantityRemaining: quantity,
      unit,
      expiryDate: item.expiryDate ?? null,
      receivedDate: nowIso.slice(0, 10),
      createdAt: nowIso,
      updatedAt: nowIso
    });
    writeAudit(draft, "ingredients", ingredient.id, "purchase", null, { quantity, unit, purchasePrice }, actor, nowIso);
    count += 1;
  }
  return { ok: true, count };
}

// --- recipes --------------------------------------------------------------

function saveRecipe(draft: Draft, body: AnyRecord, actor: EngineActor | null, nowIso: string) {
  const input = (body.recipe ?? {}) as AnyRecord;
  const name = required(input.name, "Recipe name");
  const baseYield = num(input.baseYieldQuantity, 0);
  const yieldError = validatePositiveNumber(baseYield, "Base yield");
  if (yieldError) fail(yieldError);

  const items = Array.isArray(input.items) ? (input.items as AnyRecord[]) : [];
  if (!items.length) fail("A recipe needs at least one ingredient.");
  items.forEach((item, index) => {
    const error = validatePositiveNumber(num(item.quantity, 0), `Ingredient ${index + 1} quantity`);
    if (error) fail(error);
  });

  const existing = input.id ? draft.list("recipes").find((row) => row.id === input.id) : undefined;
  const productId = existing?.productId || input.productId || id("prod");
  const recipeId = input.id || id("rec");

  const product = {
    id: productId,
    name,
    category: input.category ?? "",
    description: input.description ?? "",
    active: true,
    createdAt: draft.list("products").find((row) => row.id === productId)?.createdAt ?? nowIso,
    updatedAt: nowIso
  };
  if (draft.list("products").some((row) => row.id === productId)) draft.patch("products", (row) => row.id === productId, product);
  else draft.add("products", product);

  const instructions = Array.isArray(input.instructions)
    ? input.instructions
    : String(input.instructions ?? "").split("\n").map((line) => line.trim()).filter(Boolean);

  const record = {
    id: recipeId,
    productId,
    name,
    category: input.category ?? "",
    baseYieldQuantity: baseYield,
    yieldUnit: input.yieldUnit ?? "pcs",
    instructions,
    formulaMetadata: input.formulaMetadata ?? existing?.formulaMetadata ?? {},
    costProfile: input.costProfile ?? existing?.costProfile ?? {},
    notes: input.notes ?? "",
    active: true,
    createdAt: existing?.createdAt ?? nowIso,
    updatedAt: nowIso
  };
  if (existing) draft.patch("recipes", (row) => row.id === recipeId, record);
  else draft.add("recipes", record);

  // The server deletes and re-inserts every line with fresh ids on each save, so
  // a held recipe_item id is invalidated by an unrelated edit. Matching that here
  // is what keeps conversionApplyConflict meaningful in both engines.
  draft.removeWhere("recipeItems", (row) => row.recipeId === recipeId);
  items.forEach((item, index) => {
    draft.add("recipeItems", {
      id: `ri-${index}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      recipeId,
      ingredientId: item.ingredientId,
      quantity: num(item.quantity, 0),
      unit: item.unit ?? "g",
      wastePercentage: Math.max(0, num(item.wastePercentage, 0)),
      prepState: item.prepState ?? {},
      notes: item.notes ?? "",
      createdAt: nowIso,
      updatedAt: nowIso
    });
  });

  writeAudit(draft, "recipes", recipeId, existing ? "update" : "create", existing ?? null, record, actor, nowIso);
  return { ok: true, id: recipeId, productId };
}

function archiveRecipe(draft: Draft, body: AnyRecord, actor: EngineActor | null, nowIso: string) {
  const recipeId = required(body.id, "Recipe");
  const before = draft.list("recipes").find((row) => row.id === recipeId);
  if (!before) fail("Recipe not found.", 404);
  draft.patch("recipes", (row) => row.id === recipeId, { active: false, updatedAt: nowIso });
  draft.patch("products", (row) => row.id === before.productId, { active: false, updatedAt: nowIso });
  writeAudit(draft, "recipes", recipeId, "archive", before, { ...before, active: false }, actor, nowIso);
  return { ok: true, archived: true };
}

// --- conversions ----------------------------------------------------------

function saveConversion(draft: Draft, body: AnyRecord, actor: EngineActor | null, nowIso: string) {
  const input = (body.rule ?? body.conversion ?? {}) as AnyRecord;
  const ingredientId = required(input.ingredientId, "Ingredient");
  const fromUnit = required(input.fromUnit, "From unit");
  const toUnit = required(input.toUnit, "To unit");
  const factorError = validatePositiveNumber(num(input.conversionFactor, 0), "Conversion factor");
  if (factorError) fail(factorError);

  const existing = input.id ? draft.list("conversionRules").find((row) => row.id === input.id) : undefined;
  const record = {
    id: input.id || id("cr"),
    ingredientId,
    fromUnit,
    toUnit,
    conversionFactor: num(input.conversionFactor, 0),
    conversionType: input.conversionType ?? "ingredient_specific",
    confidenceLevel: input.confidenceLevel ?? "Medium",
    source: input.source ?? "manual entry",
    verified: input.verified === true,
    ingredientState: input.ingredientState ?? null,
    temperatureState: input.temperatureState ?? null,
    formulaContext: input.formulaContext ?? null,
    notes: input.notes ?? "",
    active: true,
    createdAt: existing?.createdAt ?? nowIso,
    updatedAt: nowIso
  };
  if (existing) draft.patch("conversionRules", (row) => row.id === record.id, record);
  else draft.add("conversionRules", record);
  writeAudit(draft, "conversion_rules", record.id, existing ? "update" : "create", existing ?? null, record, actor, nowIso);
  return { ok: true, id: record.id };
}

function verifyConversion(draft: Draft, body: AnyRecord, actor: EngineActor | null, nowIso: string) {
  const ruleId = required(body.id, "Conversion");
  const before = draft.list("conversionRules").find((row) => row.id === ruleId);
  if (!before) fail("Conversion rule not found.", 404);
  draft.patch("conversionRules", (row) => row.id === ruleId, {
    verified: true,
    source: "measured in kitchen",
    updatedAt: nowIso
  });
  writeAudit(draft, "conversion_rules", ruleId, "verify", before, { ...before, verified: true }, actor, nowIso);
  return { ok: true };
}

function archiveConversion(draft: Draft, body: AnyRecord, actor: EngineActor | null, nowIso: string) {
  const ruleId = required(body.id, "Conversion");
  const before = draft.list("conversionRules").find((row) => row.id === ruleId);
  if (!before) fail("Conversion rule not found.", 404);
  draft.patch("conversionRules", (row) => row.id === ruleId, { active: false, updatedAt: nowIso });
  writeAudit(draft, "conversion_rules", ruleId, "archive", before, { ...before, active: false }, actor, nowIso);
  return { ok: true, archived: true };
}

function applyConversion(draft: Draft, body: AnyRecord, actor: EngineActor | null, nowIso: string) {
  const recipeItemId = required(body.recipeItemId, "Recipe ingredient");
  const finalUnit = String(body.finalUnit ?? "");
  if (!RECIPE_ITEM_UNITS.includes(finalUnit)) fail(`Unsupported unit: ${finalUnit}`);
  const quantityError = validatePositiveNumber(num(body.finalQuantity, 0), "Converted quantity");
  if (quantityError) fail(quantityError);

  const current = draft.list("recipeItems").find((row) => row.id === recipeItemId);
  const conflict = conversionApplyConflict(current, { quantity: body.expectedQuantity, unit: body.expectedUnit });
  if (conflict) fail(conflict, 409);

  const prepState = {
    ...(current!.prepState ?? {}),
    convertedFromQuantity: current!.quantity,
    convertedFromUnit: current!.unit,
    conversionRuleId: body.conversionRuleId ?? null,
    conversionAppliedBy: actorLabel(actor),
    conversionAppliedAt: nowIso
  };
  draft.patch("recipeItems", (row) => row.id === recipeItemId, {
    quantity: num(body.finalQuantity, 0),
    unit: finalUnit,
    prepState,
    updatedAt: nowIso
  });
  writeAudit(draft, "recipe_items", recipeItemId, "conversion_apply", current ?? null, { quantity: body.finalQuantity, unit: finalUnit }, actor, nowIso);
  return { ok: true, recipeId: current!.recipeId, quantity: num(body.finalQuantity, 0), unit: finalUnit };
}

// --- orders ---------------------------------------------------------------

function saveOrder(draft: Draft, body: AnyRecord, actor: EngineActor | null, nowIso: string) {
  const input = (body.order ?? {}) as AnyRecord;
  const customerName = required(input.customerName, "Customer name");
  const lines = (Array.isArray(input.items) ? input.items : []).filter((line: AnyRecord) => line?.recipeId);
  if (!lines.length) fail("An order needs at least one item.");

  const pricing = computeOrderPricing({
    lines: lines.map((line: AnyRecord) => ({ saleQuantity: line.saleQuantity ?? 0, unitSellingPrice: line.unitSellingPrice ?? 0 })),
    deliveryFee: input.deliveryFee ?? 0,
    discountAmount: input.discountAmount ?? 0,
    taxRate: input.taxRate ?? 0,
    amountPaid: input.amountPaid ?? 0
  });

  const existing = input.id ? draft.list("orders").find((row) => row.id === input.id) : undefined;
  const orderId = input.id || id("ord");
  const status = input.status || existing?.status || "Draft";

  const record = {
    id: orderId,
    customerName,
    customerPhone: input.customerPhone ?? "",
    deliveryMethod: input.deliveryMethod ?? "Pickup",
    deliveryAddress: input.deliveryAddress ?? "",
    dueDate: input.dueDate ?? nowIso.slice(0, 10),
    status,
    paymentStatus: input.paymentStatus ?? "Unpaid",
    productionStatus: existing?.productionStatus ?? "Not Started",
    stockStatus: existing?.stockStatus ?? "In Stock",
    notes: input.notes ?? "",
    archived: false,
    deliveryFee: pricing.hasPricing ? pricing.deliveryFee : null,
    discountAmount: pricing.hasPricing ? pricing.discountAmount : null,
    taxRate: pricing.hasPricing ? pricing.taxRate : null,
    amountPaid: pricing.hasPricing ? pricing.amountPaid : null,
    subtotal: pricing.hasPricing ? pricing.subtotal : null,
    taxAmount: pricing.hasPricing ? pricing.taxAmount : null,
    netTotal: pricing.hasPricing ? pricing.netTotal : null,
    grossTotal: pricing.hasPricing ? pricing.grossTotal : null,
    balance: pricing.hasPricing ? pricing.balance : null,
    createdAt: existing?.createdAt ?? nowIso,
    updatedAt: nowIso
  };
  if (existing) draft.patch("orders", (row) => row.id === orderId, record);
  else draft.add("orders", record);

  draft.removeWhere("orderItems", (row) => row.orderId === orderId);
  lines.forEach((line: AnyRecord, index: number) => {
    draft.add("orderItems", {
      id: `oi-${index}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      orderId,
      productId: line.productId ?? null,
      recipeId: line.recipeId,
      requestedYieldQuantity: num(line.requestedYieldQuantity, 0),
      quantityMultiplier: num(line.quantityMultiplier, 1) || 1,
      saleQuantity: pricing.lines[index]?.saleQuantity ?? null,
      unitSellingPrice: pricing.hasPricing ? pricing.lines[index]?.unitSellingPrice ?? null : null,
      notes: line.notes ?? "",
      createdAt: nowIso,
      updatedAt: nowIso
    });
  });

  writeOrderEvent(
    draft,
    {
      orderId,
      eventType: existing ? "updated" : "created",
      actor,
      previousStatus: existing?.status ?? null,
      newStatus: status,
      metadata: { lines: lines.length },
      note: existing ? "Order updated." : "Order created."
    },
    nowIso
  );

  const requirements = requirementsForOrder(draft.ws, orderId);
  draft.patch("orders", (row) => row.id === orderId, { stockStatus: stockStatusFor(draft.ws, requirements) });

  let reservation = null;
  if (body.reserve || shouldHoldStockForStatus(status, normalizeStockHoldStage(draft.ws.settings.stockHoldStage))) {
    reservation = reserveOrder(draft, orderId, actor, nowIso);
  }
  if (body.reserve) maybeDeductAtStage(draft, orderId, actor, "confirmation", nowIso);

  writeAudit(draft, "orders", orderId, existing ? "update" : "create", existing ?? null, record, actor, nowIso);
  const saved = draft.list("orders").find((row) => row.id === orderId);
  return { ok: true, id: orderId, stockStatus: saved?.stockStatus, reservation };
}

function reserveAction(draft: Draft, body: AnyRecord, actor: EngineActor | null, nowIso: string) {
  const orderId = required(body.orderId, "Order");
  const result = reserveOrder(draft, orderId, actor, nowIso);
  maybeDeductAtStage(draft, orderId, actor, "confirmation", nowIso);
  return result;
}

function changeOrderStatus(draft: Draft, body: AnyRecord, actor: EngineActor | null, nowIso: string) {
  const orderId = required(body.orderId, "Order");
  const status = required(body.status, "Status");
  const order = draft.list("orders").find((row) => row.id === orderId);
  if (!order) fail("Order not found.", 404);
  const previousStatus = order.status;
  if (previousStatus === status) return { ok: true };
  if (!isValidOrderTransition(previousStatus, status)) {
    fail(`An order cannot move from ${previousStatus} to ${status}.`, 409);
  }
  if (status === "Cancelled" && !String(body.reason ?? "").trim()) {
    fail("A cancellation needs a reason.");
  }
  if (status === "Delivered") {
    if (previousStatus !== "Produced") fail("Only a produced order can be delivered.", 409);
    if (order.stockStatus === "Shortage") fail("This order is short on ingredients and cannot be delivered.", 409);
  }

  if (status === "Produced") {
    return produceOrder(draft, orderId, actor, body.qcLog ?? {}, nowIso);
  }

  let hold = null;
  if (status === "In Production") {
    hold = reserveOrder(draft, orderId, actor, nowIso);
    const requirements = requirementsForOrder(draft.ws, orderId);
    const shortages = shortagesForProduction(draft.ws, orderId, requirements);
    if (shortages.length && draft.ws.settings.allowNegativeInventory !== true) {
      fail(`Cannot start production while ingredients are short: ${shortageSummaryText(shortages)}.`, 409);
    }
  } else {
    hold = holdIfConfigured(draft, orderId, status, actor, nowIso);
  }

  const productionStatus =
    status === "In Production" ? "In Progress" : status === "Cancelled" ? "Not Started" : order.productionStatus ?? "Not Started";
  draft.patch("orders", (row) => row.id === orderId, {
    status,
    productionStatus,
    ...(status === "Cancelled" ? { stockStatus: "In Stock" } : {}),
    updatedAt: nowIso
  });

  const eventType =
    status === "Delivered" ? "delivered" : status === "Cancelled" ? "cancelled" : status === "In Production" ? "production_started" : "status_changed";
  writeOrderEvent(
    draft,
    { orderId, eventType, actor, previousStatus, newStatus: status, metadata: {}, note: body.reason ?? null },
    nowIso
  );

  if (status === "In Production") maybeDeductAtStage(draft, orderId, actor, "production_start", nowIso);
  if (status === "Cancelled") releaseReservation(draft, orderId, actor, nowIso);

  writeAudit(draft, "orders", orderId, "status_change", { status: previousStatus }, { status, reason: body.reason ?? null }, actor, nowIso);
  return { ok: true, hold };
}

function deleteOrder(draft: Draft, body: AnyRecord, actor: EngineActor | null, nowIso: string) {
  const orderId = required(body.id ?? body.orderId, "Order");
  const before = draft.list("orders").find((row) => row.id === orderId);
  if (!before) fail("Order not found.", 404);
  releaseReservation(draft, orderId, actor, nowIso);
  draft.patch("orders", (row) => row.id === orderId, {
    archived: true,
    status: "Cancelled",
    stockStatus: "In Stock",
    updatedAt: nowIso
  });
  writeOrderEvent(
    draft,
    { orderId, eventType: "cancelled", actor, previousStatus: before.status, newStatus: "Cancelled", note: body.reason ?? "Order archived." },
    nowIso
  );
  writeAudit(draft, "orders", orderId, "archive", before, { ...before, archived: true }, actor, nowIso);
  return { ok: true, archived: true };
}

function batchStatus(draft: Draft, body: AnyRecord, actor: EngineActor | null, nowIso: string) {
  const orderIds = Array.isArray(body.orderIds) ? body.orderIds.map(String) : [];
  if (!orderIds.length) fail("No orders were supplied.");
  const status = required(body.status, "Status");
  const results: AnyRecord[] = [];

  for (const orderId of orderIds) {
    const order = draft.list("orders").find((row) => row.id === orderId);
    if (!order || ["Produced", "Delivered", "Cancelled"].includes(order.status)) {
      results.push({ orderId, skipped: true });
      continue;
    }
    if (status === "Produced") {
      reserveOrder(draft, orderId, actor, nowIso);
      const shortages = shortagesForProduction(draft.ws, orderId, requirementsForOrder(draft.ws, orderId));
      if (shortages.length && draft.ws.settings.allowNegativeInventory !== true) {
        results.push({ orderId, produced: false, shortage: shortages });
        continue;
      }
      draft.patch("orders", (row) => row.id === orderId, { status: "In Production", productionStatus: "In Progress", updatedAt: nowIso });
      const produced = produceOrder(draft, orderId, actor, {}, nowIso) as AnyRecord;
      results.push({ orderId, ...produced });
    } else {
      draft.patch("orders", (row) => row.id === orderId, { status, updatedAt: nowIso });
      writeOrderEvent(draft, { orderId, eventType: "status_changed", actor, previousStatus: order.status, newStatus: status, metadata: { batch: true } }, nowIso);
      results.push({ orderId, ok: true });
    }
  }
  return { ok: true, count: results.filter((row) => !row.skipped).length, results };
}

// --- archive --------------------------------------------------------------

function listArchive(draft: Draft) {
  const last50 = (rows: AnyRecord[]) => rows.slice(-50).reverse();
  return {
    ok: true,
    ingredients: last50(draft.list("ingredients").filter((row) => row.active === false)),
    recipes: last50(draft.list("recipes").filter((row) => row.active === false)),
    orders: last50(draft.list("orders").filter((row) => row.archived === true)).map((row) => ({ ...row, name: row.customerName })),
    suppliers: last50(draft.list("suppliers").filter((row) => row.active === false)),
    conversions: last50(draft.list("conversionRules").filter((row) => row.active === false)).map((row) => ({
      ...row,
      name: `${row.fromUnit} to ${row.toUnit}`
    })),
    auditRows: last50(draft.list("auditLogs")).map((row) => ({
      id: row.id,
      entityType: row.entityType,
      entityId: row.entityId,
      action: row.action,
      createdAt: row.createdAt
    }))
  };
}

function restoreEntity(draft: Draft, body: AnyRecord, actor: EngineActor | null, nowIso: string) {
  const entityType = String(body.entityType ?? "");
  const entityId = required(body.id, "Record");
  // Reuses the server's mapping so an unsupported type is refused identically.
  archiveTableForEntity(entityType);

  if (entityType === "order") {
    draft.patch("orders", (row) => row.id === entityId, { archived: false, updatedAt: nowIso });
    writeOrderEvent(draft, { orderId: entityId, eventType: "restored", actor, note: "Order restored from archive." }, nowIso);
  } else if (entityType === "recipe") {
    const recipe = draft.list("recipes").find((row) => row.id === entityId);
    draft.patch("recipes", (row) => row.id === entityId, { active: true, updatedAt: nowIso });
    if (recipe) draft.patch("products", (row) => row.id === recipe.productId, { active: true, updatedAt: nowIso });
  } else if (entityType === "ingredient") {
    draft.patch("ingredients", (row) => row.id === entityId, { active: true, updatedAt: nowIso });
  } else if (entityType === "supplier") {
    draft.patch("suppliers", (row) => row.id === entityId, { active: true, updatedAt: nowIso });
  } else if (entityType === "conversion") {
    draft.patch("conversionRules", (row) => row.id === entityId, { active: true, updatedAt: nowIso });
  }
  writeAudit(draft, entityType, entityId, "restore", null, { restored: true }, actor, nowIso);
  return { ok: true, restored: true };
}

// --- import ---------------------------------------------------------------

function commitImport(draft: Draft, body: AnyRecord, actor: EngineActor | null, nowIso: string) {
  const drafted = (body.draft ?? {}) as AnyRecord;
  if (!drafted || typeof drafted !== "object") fail("Import draft is required.");

  const createdIngredients: AnyRecord[] = [];
  const createdSuppliers: AnyRecord[] = [];
  const createdRecipes: AnyRecord[] = [];
  const createdConversions: AnyRecord[] = [];
  const skipped: AnyRecord[] = [];
  const nameKey = (value: unknown) => String(value ?? "").trim().toLowerCase();

  for (const supplier of (drafted.suppliers ?? []) as AnyRecord[]) {
    const existing = draft.list("suppliers").find((row) => nameKey(row.name) === nameKey(supplier.name));
    if (existing) {
      skipped.push({ type: "supplier", name: supplier.name, reason: "already exists" });
      continue;
    }
    const record = { id: id("sup"), name: String(supplier.name), contactName: "", phone: "", email: "", address: "", defaultCurrency: "NGN", leadTimeDays: 2, suppliedIngredientIds: [], notes: "", active: true, createdAt: nowIso, updatedAt: nowIso };
    draft.add("suppliers", record);
    createdSuppliers.push({ id: record.id, name: record.name });
  }

  for (const ingredient of (drafted.ingredients ?? []) as AnyRecord[]) {
    const existing = draft.list("ingredients").find((row) => nameKey(row.name) === nameKey(ingredient.name));
    if (existing) {
      skipped.push({ type: "ingredient", name: ingredient.name, reason: "already exists" });
      continue;
    }
    const record = {
      id: id("ing"),
      name: String(ingredient.name),
      category: ingredient.category ?? "Imported",
      baseUnit: ingredient.baseUnit ?? "g",
      purchaseUnit: ingredient.baseUnit ?? "g",
      currentStock: 0,
      reservedStock: 0,
      reorderLevel: 0,
      latestUnitCost: num(ingredient.latestUnitCost, 0),
      supplierId: null,
      allowsDecimals: null,
      minimumIncrement: null,
      expiryTrackingEnabled: false,
      defaultExpiryDays: null,
      expiryDate: null,
      allergenProfile: {},
      storageProfile: {},
      notes: "Created by import",
      active: true,
      createdAt: nowIso,
      updatedAt: nowIso
    };
    draft.add("ingredients", record);
    createdIngredients.push({ id: record.id, name: record.name });
  }

  for (const recipe of (drafted.recipes ?? []) as AnyRecord[]) {
    const duplicate = draft.list("recipes").find((row) => row.active !== false && nameKey(row.name) === nameKey(recipe.name));
    if (duplicate && !body.allowDuplicate) {
      fail(`A recipe named "${recipe.name}" already exists. Rename it or allow duplicates.`, 409);
    }
    const items = (recipe.items ?? []) as AnyRecord[];
    const resolved: AnyRecord[] = items.map((item) => {
      const match = draft.list("ingredients").find((row) => nameKey(row.name) === nameKey(item.ingredientName ?? item.name));
      if (!match) fail(`Import could not match the ingredient "${item.ingredientName ?? item.name}".`);
      return { ...item, ingredientId: match.id };
    });
    const saved = saveRecipe(
      draft,
      {
        recipe: {
          name: recipe.name,
          category: recipe.category ?? "",
          baseYieldQuantity: num(recipe.baseYieldQuantity, 1),
          yieldUnit: recipe.yieldUnit ?? "pcs",
          instructions: recipe.instructions ?? [],
          items: resolved.map((item) => ({
            ingredientId: item.ingredientId,
            quantity: num(item.quantity, 0),
            unit: item.unit ?? "g",
            wastePercentage: num(item.wastePercentage, 0),
            prepState: item.prepState ?? {}
          }))
        }
      },
      actor,
      nowIso
    ) as AnyRecord;
    createdRecipes.push({ id: saved.id, name: recipe.name });
  }

  for (const rule of (drafted.conversionRules ?? []) as AnyRecord[]) {
    const match = draft.list("ingredients").find((row) => nameKey(row.name) === nameKey(rule.ingredientName));
    if (!match) {
      skipped.push({ type: "conversion", name: rule.ingredientName, reason: "ingredient not found" });
      continue;
    }
    const saved = saveConversion(draft, { rule: { ...rule, ingredientId: match.id } }, actor, nowIso) as AnyRecord;
    createdConversions.push({ id: saved.id, ingredientId: match.id });
  }

  const importBatchId = id("imp");
  draft.add("importBatches", {
    id: importBatchId,
    sourceName: String(drafted.source?.name ?? "import"),
    sourceType: String(drafted.source?.type ?? "import"),
    parserVersion: String(drafted.parserVersion ?? "local"),
    actor: actorLabel(actor),
    status: "committed",
    summary: { createdRecipes, createdIngredients, createdSuppliers, createdConversions, skipped },
    warnings: drafted.warnings ?? [],
    createdAt: nowIso
  });
  writeAudit(draft, "import_batches", importBatchId, "commit", null, { createdRecipes, createdIngredients, createdSuppliers, createdConversions, skipped }, actor, nowIso);

  return { ok: true, importBatchId, createdRecipes, createdIngredients, createdSuppliers, createdConversions, skipped, warnings: drafted.warnings ?? [] };
}
