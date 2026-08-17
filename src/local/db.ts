// The IndexedDB layer for a device workspace.
//
// Hand-rolled rather than pulling in a wrapper library: the surface used here is
// small, and this module is inside a lazily loaded chunk whose size is the reason
// server accounts do not pay for the local engine. A dependency would also have
// to clear `npm audit --audit-level=moderate` on every CI run forever.
//
// The one rule that matters: a transaction callback must be SYNCHRONOUS. An
// IndexedDB transaction auto-commits as soon as the event loop has no pending
// requests against it, so awaiting anything that is not an IDB request inside one
// silently closes it. The engine therefore computes every change before a
// transaction opens and the callback only issues put/add/delete -- the same
// precompute-before-transaction shape the server uses, for a different reason.
import { COLLECTION_KEYS, type LocalWorkspace, type ProductionRun } from "./types";

const DB_VERSION = 1;
export const COLLECTIONS_STORE = "collections";
export const PRODUCTION_RUNS_STORE = "productionRuns";
export const META_STORE = "meta";

// Kept as a literal that survives minification, because the bundle guard in
// scripts/check-bundle-budget.mjs looks for it to prove this module landed in a
// lazy chunk rather than the entry bundle.
const DB_PREFIX = "pcko-local-";

export function deviceDbName(userId: string) {
  return `${DB_PREFIX}${userId}`;
}

export interface DeviceMeta {
  key: "info";
  formatVersion: number;
  userId: string;
  email: string;
  createdAt: string;
  seededAt: string | null;
  lastWriteAt: string | null;
  persistGranted: boolean;
  hasExportedBackup: boolean;
}

export class DeviceStorageError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = "DeviceStorageError";
    if (options?.cause) (this as { cause?: unknown }).cause = options.cause;
  }
}

export function indexedDbAvailable() {
  return typeof indexedDB !== "undefined" && indexedDB !== null;
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB request failed"));
  });
}

export function openDeviceDb(userId: string): Promise<IDBDatabase> {
  if (!userId) return Promise.reject(new DeviceStorageError("A device workspace needs a signed-in account."));
  if (!indexedDbAvailable()) {
    return Promise.reject(
      new DeviceStorageError(
        "This browser will not let the app store your kitchen data on this device. Private browsing usually causes this — open the app in a normal window."
      )
    );
  }
  return new Promise((resolve, reject) => {
    let open: IDBOpenDBRequest;
    try {
      open = indexedDB.open(deviceDbName(userId), DB_VERSION);
    } catch (error) {
      reject(new DeviceStorageError("This browser refused to open local storage for your workspace.", { cause: error }));
      return;
    }
    open.onupgradeneeded = () => {
      const db = open.result;
      if (!db.objectStoreNames.contains(COLLECTIONS_STORE)) db.createObjectStore(COLLECTIONS_STORE);
      if (!db.objectStoreNames.contains(PRODUCTION_RUNS_STORE)) {
        // keyPath, not an index: add() on an existing orderId raises
        // ConstraintError, which is how a second completion is refused.
        db.createObjectStore(PRODUCTION_RUNS_STORE, { keyPath: "orderId" });
      }
      if (!db.objectStoreNames.contains(META_STORE)) db.createObjectStore(META_STORE, { keyPath: "key" });
    };
    open.onsuccess = () => resolve(open.result);
    open.onerror = () =>
      reject(new DeviceStorageError("This browser refused to open local storage for your workspace.", { cause: open.error }));
    open.onblocked = () =>
      reject(new DeviceStorageError("Another tab is upgrading this workspace. Close the other tabs and reload."));
  });
}

// Runs `body` inside one readwrite transaction over every store. The callback
// must not await: see the note at the top of this file.
export function runTransaction(
  db: IDBDatabase,
  stores: string[],
  mode: IDBTransactionMode,
  body: (tx: IDBTransaction) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    let tx: IDBTransaction;
    try {
      tx = db.transaction(stores, mode);
    } catch (error) {
      reject(new DeviceStorageError("Could not start a local write.", { cause: error }));
      return;
    }

    // The failing REQUEST carries the useful error; by the time the transaction
    // aborts, tx.error may be null. Callers depend on this: the store recognises
    // a lost production race by name === "ConstraintError", so wrapping it in a
    // generic error would turn "this order was already produced" into an
    // unexplained failure.
    let failure: unknown = null;
    tx.onerror = (event) => {
      failure = failure ?? (event.target as IDBRequest | null)?.error ?? tx.error;
    };
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(failure ?? tx.error ?? new DeviceStorageError("The local write was rolled back."));

    try {
      body(tx);
    } catch (error) {
      try {
        tx.abort();
      } catch {
        /* already aborting */
      }
      reject(error);
    }
  });
}

export async function readWorkspace(db: IDBDatabase): Promise<Partial<LocalWorkspace> | null> {
  const tx = db.transaction([COLLECTIONS_STORE, PRODUCTION_RUNS_STORE], "readonly");
  const collections = tx.objectStore(COLLECTIONS_STORE);
  const runs = tx.objectStore(PRODUCTION_RUNS_STORE);
  const entries = await Promise.all(
    COLLECTION_KEYS.map(async (key) => [key, await request(collections.get(key))] as const)
  );
  const settings = await request(collections.get("settings"));
  const productionRuns = (await request(runs.getAll())) as ProductionRun[];

  const anyData = entries.some(([, value]) => Array.isArray(value)) || settings;
  if (!anyData) return null;

  const workspace: Partial<LocalWorkspace> = { productionRuns };
  for (const [key, value] of entries) {
    (workspace as Record<string, unknown>)[key] = Array.isArray(value) ? value : [];
  }
  if (settings) workspace.settings = settings as LocalWorkspace["settings"];
  return workspace;
}

export async function readMeta(db: IDBDatabase): Promise<DeviceMeta | null> {
  const tx = db.transaction([META_STORE], "readonly");
  const value = await request(tx.objectStore(META_STORE).get("info"));
  return (value as DeviceMeta) ?? null;
}

export function writeMeta(db: IDBDatabase, meta: DeviceMeta) {
  return runTransaction(db, [META_STORE], "readwrite", (tx) => {
    tx.objectStore(META_STORE).put(meta);
  });
}

// Writes the whole workspace. Used for seeding and for restoring a backup, where
// replacing everything at once is the point.
export function writeWholeWorkspace(db: IDBDatabase, workspace: LocalWorkspace) {
  return runTransaction(db, [COLLECTIONS_STORE, PRODUCTION_RUNS_STORE], "readwrite", (tx) => {
    const collections = tx.objectStore(COLLECTIONS_STORE);
    const runs = tx.objectStore(PRODUCTION_RUNS_STORE);
    collections.clear();
    runs.clear();
    for (const key of COLLECTION_KEYS) collections.put(workspace[key] ?? [], key);
    collections.put(workspace.settings, "settings");
    for (const run of workspace.productionRuns ?? []) runs.put(run);
  });
}

// Asking for persistent storage tells the browser this data is not a cache it
// may evict under pressure. It can be refused, and the answer is recorded rather
// than assumed so the Settings page can tell the truth about it.
export async function requestPersistence(): Promise<boolean> {
  try {
    if (typeof navigator === "undefined" || !navigator.storage?.persist) return false;
    if (await navigator.storage.persisted?.()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

export async function storageEstimate(): Promise<{ usage: number; quota: number } | null> {
  try {
    if (typeof navigator === "undefined" || !navigator.storage?.estimate) return null;
    const estimate = await navigator.storage.estimate();
    return { usage: Number(estimate.usage ?? 0), quota: Number(estimate.quota ?? 0) };
  } catch {
    return null;
  }
}
