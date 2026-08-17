// The bridge between the pure engine and IndexedDB.
//
// Holds the workspace in memory, runs actions against it, and commits the
// engine's changed collections in ONE transaction. The engine has already
// computed everything by the time a transaction opens, so the callback issues
// only put/add and never awaits — see the note in db.ts about auto-commit.
import type { KitchenSnapshot } from "../data";
import { runLocalAction } from "./engine";
import { seedWorkspace } from "./seed";
import {
  COLLECTIONS_STORE,
  DeviceStorageError,
  META_STORE,
  PRODUCTION_RUNS_STORE,
  type DeviceMeta,
  openDeviceDb,
  readMeta,
  readWorkspace,
  requestPersistence,
  runTransaction,
  storageEstimate,
  writeMeta,
  writeWholeWorkspace
} from "./db";
import type { CollectionKey, EngineActor, LocalWorkspace } from "./types";

const BOOTSTRAP_LOT_LIMIT = 60;
const BOOTSTRAP_EVENT_LIMIT = 1000;
const BOOTSTRAP_QC_LIMIT = 200;

let db: IDBDatabase | null = null;
let workspace: LocalWorkspace | null = null;
let meta: DeviceMeta | null = null;
let channel: BroadcastChannel | null = null;
let externalListener: (() => void) | null = null;
let stale = false;

function nowIso() {
  return new Date().toISOString();
}

function requireWorkspace(): LocalWorkspace {
  if (!workspace) throw new DeviceStorageError("The device workspace is not open yet.");
  return workspace;
}

export function currentWorkspace() {
  return workspace;
}

export function deviceMeta() {
  return meta;
}

// The app renders from the same filtered shape the server's bootstrap returns:
// active rows only, non-archived orders, a narrow movement window, the soonest
// lots. The store keeps everything and projects here, so archive and restore
// still have something to work with and the dashboard can count a full ledger.
export function projectSnapshot(ws: LocalWorkspace = requireWorkspace()): KitchenSnapshot {
  const activeOrderIds = new Set(ws.orders.filter((row: any) => !row.archived).map((row: any) => row.id));
  return {
    suppliers: ws.suppliers.filter((row: any) => row.active !== false) as KitchenSnapshot["suppliers"],
    appUsers: [],
    ingredients: ws.ingredients.filter((row: any) => row.active !== false) as KitchenSnapshot["ingredients"],
    products: ws.products.filter((row: any) => row.active !== false) as KitchenSnapshot["products"],
    recipes: ws.recipes.filter((row: any) => row.active !== false) as KitchenSnapshot["recipes"],
    recipeItems: ws.recipeItems.filter((item: any) =>
      ws.recipes.some((recipe: any) => recipe.id === item.recipeId && recipe.active !== false)
    ) as KitchenSnapshot["recipeItems"],
    orders: ws.orders.filter((row: any) => !row.archived) as KitchenSnapshot["orders"],
    orderItems: ws.orderItems.filter((row: any) => activeOrderIds.has(row.orderId)) as KitchenSnapshot["orderItems"],
    orderEvents: ws.orderEvents
      .filter((row: any) => activeOrderIds.has(row.orderId))
      .slice(-BOOTSTRAP_EVENT_LIMIT) as KitchenSnapshot["orderEvents"],
    // Bootstrap deliberately carries only reservation movements for live orders:
    // the cancel modal reads them to report what a cancellation would release.
    // Everything else is read per-page from the paged reads.
    inventoryMovements: ws.inventoryMovements.filter(
      (row: any) =>
        (row.movementType === "reservation" || row.movementType === "reservation_release") && activeOrderIds.has(row.relatedOrderId)
    ) as KitchenSnapshot["inventoryMovements"],
    ingredientBatches: [...ws.ingredientBatches]
      .filter((row: any) => Number(row.quantityRemaining) > 0)
      .sort((a: any, b: any) => {
        const ax = a.expiryDate ?? "";
        const bx = b.expiryDate ?? "";
        if (ax !== bx) {
          if (!ax) return 1;
          if (!bx) return -1;
          return ax.localeCompare(bx);
        }
        return String(a.receivedDate ?? "").localeCompare(String(b.receivedDate ?? ""));
      })
      .slice(0, BOOTSTRAP_LOT_LIMIT) as KitchenSnapshot["ingredientBatches"],
    productionQcLogs: ws.productionQcLogs.slice(-BOOTSTRAP_QC_LIMIT) as KitchenSnapshot["productionQcLogs"],
    // The audit trail is served by the paged reads, exactly as the server does.
    auditLogs: [],
    conversionRules: ws.conversionRules.filter((row: any) => row.active !== false) as KitchenSnapshot["conversionRules"],
    settings: ws.settings
  };
}

function openChannel(userId: string) {
  if (typeof BroadcastChannel === "undefined") return;
  channel?.close();
  channel = new BroadcastChannel(`pcko-local-${userId}`);
  channel.onmessage = () => {
    // Another tab of this account wrote. Mark the in-memory copy stale so the
    // next action re-reads before computing, and nudge the UI to refresh.
    stale = true;
    externalListener?.();
  };
}

export function onExternalChange(listener: (() => void) | null) {
  externalListener = listener;
}

export async function openDeviceStore(user: { id: string; email?: string }) {
  if (db && meta?.userId === user.id) return;
  closeDeviceStore();
  db = await openDeviceDb(user.id);
  const existing = await readWorkspace(db);
  meta = await readMeta(db);

  if (!existing || !meta) {
    const seeded = seedWorkspace(nowIso(), user.email ?? "system");
    await writeWholeWorkspace(db, seeded);
    meta = {
      key: "info",
      formatVersion: 1,
      userId: user.id,
      email: user.email ?? "",
      createdAt: nowIso(),
      seededAt: nowIso(),
      lastWriteAt: null,
      persistGranted: await requestPersistence(),
      hasExportedBackup: false
    };
    await writeMeta(db, meta);
    workspace = seeded;
  } else {
    workspace = { ...seedWorkspace(nowIso()), ...existing, settings: existing.settings ?? seedWorkspace(nowIso()).settings } as LocalWorkspace;
    // A workspace restored from an older format may predate a collection.
    workspace.productionRuns = existing.productionRuns ?? [];
  }
  stale = false;
  openChannel(user.id);
}

export function closeDeviceStore() {
  channel?.close();
  channel = null;
  db?.close();
  db = null;
  workspace = null;
  meta = null;
  stale = false;
}

async function reloadIfStale() {
  if (!stale || !db) return;
  const fresh = await readWorkspace(db);
  if (fresh) workspace = { ...(workspace as LocalWorkspace), ...fresh } as LocalWorkspace;
  stale = false;
}

export async function hydrateDeviceSnapshot(user: { id: string; email?: string }): Promise<KitchenSnapshot> {
  await openDeviceStore(user);
  await reloadIfStale();
  return projectSnapshot();
}

export async function runDeviceAction(action: string, payload: Record<string, unknown>, actor: EngineActor | null) {
  if (!db) throw new DeviceStorageError("The device workspace is not open.");
  await reloadIfStale();
  const ws = requireWorkspace();

  // Everything is computed before the transaction opens.
  const { result, changes } = runLocalAction(ws, action, payload, actor, nowIso());
  const collections = changes.collections ?? {};
  const claim = changes.claimProductionRun;

  await runTransaction(db, [COLLECTIONS_STORE, PRODUCTION_RUNS_STORE, META_STORE], "readwrite", (tx) => {
    const store = tx.objectStore(COLLECTIONS_STORE);
    // add(), not put(): a repeat or concurrent completion raises ConstraintError
    // and aborts this whole transaction, so no stock moves. Same guarantee the
    // unique index on production_runs.order_id gives the server.
    if (claim) tx.objectStore(PRODUCTION_RUNS_STORE).add(claim);
    for (const [key, value] of Object.entries(collections)) store.put(value, key);
    if (changes.settings) store.put(changes.settings, "settings");
    if (meta) tx.objectStore(META_STORE).put({ ...meta, lastWriteAt: nowIso() });
  }).catch((error: unknown) => {
    if ((error as { name?: string })?.name === "ConstraintError") {
      // Another tab produced this order first. Nothing was written.
      stale = true;
      return;
    }
    throw error;
  });

  // Commit succeeded: fold the changes into the in-memory copy.
  const next: LocalWorkspace = { ...ws, ...(collections as Partial<LocalWorkspace>) } as LocalWorkspace;
  if (changes.settings) next.settings = changes.settings;
  if (claim) next.productionRuns = [...ws.productionRuns.filter((run) => run.orderId !== claim.orderId), claim];
  workspace = next;
  if (meta) meta = { ...meta, lastWriteAt: nowIso() };
  channel?.postMessage({ at: Date.now() });
  return result;
}

export async function replaceWorkspace(next: LocalWorkspace) {
  if (!db) throw new DeviceStorageError("The device workspace is not open.");
  await writeWholeWorkspace(db, next);
  workspace = next;
  if (meta) {
    meta = { ...meta, lastWriteAt: nowIso() };
    await writeMeta(db, meta);
  }
  channel?.postMessage({ at: Date.now() });
}

export async function markBackupExported() {
  if (!db || !meta) return;
  meta = { ...meta, hasExportedBackup: true };
  await writeMeta(db, meta);
}

export async function deviceStorageStatus() {
  const estimate = await storageEstimate();
  return {
    persistGranted: meta?.persistGranted ?? false,
    hasExportedBackup: meta?.hasExportedBackup ?? false,
    lastWriteAt: meta?.lastWriteAt ?? null,
    usage: estimate?.usage ?? 0,
    quota: estimate?.quota ?? 0
  };
}

// The names an import is matched against come from this workspace, never from the
// server, so a tester's draft is resolved against their own kitchen.
export function localImportContext() {
  const ws = workspace;
  if (!ws) return { ingredients: [], recipes: [], suppliers: [] };
  return {
    ingredients: ws.ingredients
      .filter((row: any) => row.active !== false)
      .map((row: any) => ({ id: row.id, name: row.name, category: row.category, baseUnit: row.baseUnit, latestUnitCost: row.latestUnitCost })),
    recipes: ws.recipes.filter((row: any) => row.active !== false).map((row: any) => ({ id: row.id, name: row.name, category: row.category })),
    suppliers: ws.suppliers.filter((row: any) => row.active !== false).map((row: any) => ({ id: row.id, name: row.name }))
  };
}

export type { CollectionKey, LocalWorkspace };
