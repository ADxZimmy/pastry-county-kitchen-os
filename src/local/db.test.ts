// Phase 016: the IndexedDB layer.
//
// The engine tests prove the arithmetic; these prove the storage keeps its two
// promises — that a multi-collection write is all-or-nothing, and that an order
// cannot be produced twice.
//
// A per-test IDBFactory rather than fake-indexeddb/auto, deliberately: installing
// a global would also hand IndexedDB to src/App.test.ts, and that suite failing
// if App.tsx ever imports the local engine at the top level is a guard worth
// keeping. jsdom has no IndexedDB, so the app must load without it.
import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it } from "vitest";
import {
  COLLECTIONS_STORE,
  META_STORE,
  PRODUCTION_RUNS_STORE,
  deviceDbName,
  openDeviceDb,
  readWorkspace,
  runTransaction,
  writeWholeWorkspace
} from "./db";
import { seedWorkspace } from "./seed";
import type { ProductionRun } from "./types";

const NOW = "2026-08-17T09:00:00.000Z";

beforeEach(() => {
  // A fresh in-memory IndexedDB per test, so no test can see another's data.
  (globalThis as { indexedDB?: IDBFactory }).indexedDB = new IDBFactory();
});

function run(orderId: string): ProductionRun {
  return { orderId, id: `prun-${orderId}`, batchKey: null, actor: "Device Tester", plannedYield: null, actualYield: null, wasteQuantity: null, qcLogId: null, createdAt: NOW };
}

describe("a device workspace is per account", () => {
  it("names the database after the user so two testers on one browser cannot see each other", async () => {
    expect(deviceDbName("user-a")).toBe("pcko-local-user-a");
    expect(deviceDbName("user-b")).not.toBe(deviceDbName("user-a"));
  });

  it("keeps two accounts' data apart", async () => {
    const a = await openDeviceDb("user-a");
    const b = await openDeviceDb("user-b");
    const seeded = seedWorkspace(NOW);
    await writeWholeWorkspace(a, { ...seeded, suppliers: [{ id: "sup-a", name: "Only in A" }] as never });

    expect((await readWorkspace(a))?.suppliers).toHaveLength(1);
    expect((await readWorkspace(b))).toBeNull();
    a.close();
    b.close();
  });

  it("returns null for a workspace that has never been written", async () => {
    const db = await openDeviceDb("user-fresh");
    expect(await readWorkspace(db)).toBeNull();
    db.close();
  });
});

describe("a multi-collection write is all-or-nothing", () => {
  it("commits every collection together", async () => {
    const db = await openDeviceDb("user-atomic");
    await writeWholeWorkspace(db, seedWorkspace(NOW));

    await runTransaction(db, [COLLECTIONS_STORE, PRODUCTION_RUNS_STORE, META_STORE], "readwrite", (tx) => {
      const store = tx.objectStore(COLLECTIONS_STORE);
      store.put([{ id: "ing-1", name: "Flour" }], "ingredients");
      store.put([{ id: "ord-1", customerName: "Ada" }], "orders");
      store.put([{ id: "oi-1", orderId: "ord-1" }], "orderItems");
      store.put([{ id: "mov-1", ingredientId: "ing-1" }], "inventoryMovements");
      store.put([{ id: "oev-1", orderId: "ord-1" }], "orderEvents");
    });

    const after = await readWorkspace(db);
    expect(after?.ingredients).toHaveLength(1);
    expect(after?.orders).toHaveLength(1);
    expect(after?.orderItems).toHaveLength(1);
    expect(after?.inventoryMovements).toHaveLength(1);
    expect(after?.orderEvents).toHaveLength(1);
    db.close();
  });

  it("leaves every collection untouched when one write in the transaction fails", async () => {
    const db = await openDeviceDb("user-rollback");
    await writeWholeWorkspace(db, seedWorkspace(NOW));
    const before = await readWorkspace(db);

    await expect(
      runTransaction(db, [COLLECTIONS_STORE, PRODUCTION_RUNS_STORE], "readwrite", (tx) => {
        const store = tx.objectStore(COLLECTIONS_STORE);
        store.put([{ id: "ing-1", name: "Flour" }], "ingredients");
        store.put([{ id: "ord-1", customerName: "Ada" }], "orders");
        // Something the store cannot serialise aborts the whole transaction.
        store.put({ boom: () => "functions are not structured-cloneable" }, "orderItems");
      })
    ).rejects.toBeTruthy();

    const after = await readWorkspace(db);
    expect(after?.ingredients).toEqual(before?.ingredients);
    expect(after?.orders).toEqual(before?.orders);
    expect(after?.orderItems).toEqual(before?.orderItems);
    db.close();
  });
});

describe("an order cannot be produced twice", () => {
  it("refuses a second claim on the same order with ConstraintError", async () => {
    const db = await openDeviceDb("user-produce");
    await writeWholeWorkspace(db, seedWorkspace(NOW));

    await runTransaction(db, [PRODUCTION_RUNS_STORE], "readwrite", (tx) => {
      tx.objectStore(PRODUCTION_RUNS_STORE).add(run("ord-1"));
    });

    const second = runTransaction(db, [PRODUCTION_RUNS_STORE], "readwrite", (tx) => {
      tx.objectStore(PRODUCTION_RUNS_STORE).add(run("ord-1"));
    });
    await expect(second).rejects.toMatchObject({ name: "ConstraintError" });
    db.close();
  });

  it("aborts the stock writes that shared the transaction with a losing claim", async () => {
    // This is the guarantee that matters: losing the race must not deduct stock.
    // On the server the unique index on production_runs.order_id rolls the whole
    // transaction back; here the ConstraintError does.
    const db = await openDeviceDb("user-race");
    await writeWholeWorkspace(db, { ...seedWorkspace(NOW), ingredients: [{ id: "flour", currentStock: 1000 }] as never });

    await runTransaction(db, [COLLECTIONS_STORE, PRODUCTION_RUNS_STORE], "readwrite", (tx) => {
      tx.objectStore(PRODUCTION_RUNS_STORE).add(run("ord-1"));
      tx.objectStore(COLLECTIONS_STORE).put([{ id: "flour", currentStock: 500 }], "ingredients");
    });
    expect(((await readWorkspace(db))?.ingredients?.[0] as { currentStock: number }).currentStock).toBe(500);

    await expect(
      runTransaction(db, [COLLECTIONS_STORE, PRODUCTION_RUNS_STORE], "readwrite", (tx) => {
        tx.objectStore(PRODUCTION_RUNS_STORE).add(run("ord-1"));
        tx.objectStore(COLLECTIONS_STORE).put([{ id: "flour", currentStock: 0 }], "ingredients");
      })
    ).rejects.toMatchObject({ name: "ConstraintError" });

    // Stock is unchanged: the second deduction never happened.
    expect(((await readWorkspace(db))?.ingredients?.[0] as { currentStock: number }).currentStock).toBe(500);
    db.close();
  });

  it("allows different orders to claim independently", async () => {
    const db = await openDeviceDb("user-many");
    await writeWholeWorkspace(db, seedWorkspace(NOW));
    await runTransaction(db, [PRODUCTION_RUNS_STORE], "readwrite", (tx) => {
      tx.objectStore(PRODUCTION_RUNS_STORE).add(run("ord-1"));
      tx.objectStore(PRODUCTION_RUNS_STORE).add(run("ord-2"));
    });
    expect((await readWorkspace(db))?.productionRuns).toHaveLength(2);
    db.close();
  });
});

describe("seeding", () => {
  it("writes settings and the generic conversion rules, and nothing else", async () => {
    const db = await openDeviceDb("user-seed");
    await writeWholeWorkspace(db, seedWorkspace(NOW));
    const stored = await readWorkspace(db);

    expect(stored?.conversionRules).toHaveLength(7);
    expect(stored?.settings?.stockHoldStage).toBe("order_confirmation");
    expect(stored?.settings?.defaultDeductionStage).toBe("production_completion");
    for (const key of ["ingredients", "recipes", "orders", "suppliers", "products"] as const) {
      expect(stored?.[key], key).toHaveLength(0);
    }
    db.close();
  });

  it("round-trips a whole workspace, which is what a backup restore relies on", async () => {
    const db = await openDeviceDb("user-roundtrip");
    const seeded = seedWorkspace(NOW);
    const populated = {
      ...seeded,
      ingredients: [{ id: "flour", name: "Flour", currentStock: 1000 }] as never,
      orders: [{ id: "ord-1", customerName: "Ada" }] as never,
      productionRuns: [run("ord-1")]
    };
    await writeWholeWorkspace(db, populated);
    const stored = await readWorkspace(db);

    expect(stored?.ingredients).toEqual(populated.ingredients);
    expect(stored?.orders).toEqual(populated.orders);
    expect(stored?.productionRuns).toEqual(populated.productionRuns);
    expect(stored?.conversionRules).toHaveLength(7);
    db.close();
  });

  it("replaces rather than merges, so a restore cannot leave old rows behind", async () => {
    const db = await openDeviceDb("user-replace");
    await writeWholeWorkspace(db, { ...seedWorkspace(NOW), ingredients: [{ id: "old" }, { id: "older" }] as never });
    await writeWholeWorkspace(db, { ...seedWorkspace(NOW), ingredients: [{ id: "new" }] as never });
    const stored = await readWorkspace(db);
    expect(stored?.ingredients).toHaveLength(1);
    expect((stored?.ingredients?.[0] as { id: string }).id).toBe("new");
    db.close();
  });
});
