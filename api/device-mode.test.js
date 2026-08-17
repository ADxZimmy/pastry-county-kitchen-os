// Phase 016: the device-account trust boundary.
//
// A device account keeps its kitchen data in the tester's browser and must reach
// NO business data on the server. The fence is deliberately not the role: these
// accounts hold Owner/Admin so the app's existing permission gating works inside
// their own workspace, which means every role check passes and `data_mode` is the
// only thing standing between a tester and the bakery's records. That makes this
// suite security-critical rather than a feature test.
//
// The action list is derived from the source with the same regex the permission
// matrix uses, so a new action cannot ship without a device-mode decision -- the
// same reason that suite scrapes rather than copies. A count floor guards against
// the regex silently matching nothing and turning the sweep into a no-op.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DEVICE_ALLOWED_ACTIONS, deviceModeActionError, handleAction } from "./_actions.js";
import { deviceReadError, requireActiveSession } from "./_auth.js";

const SOURCE = readFileSync(path.resolve("api", "_actions.js"), "utf8");
const HANDLED_ACTIONS = [...new Set([...SOURCE.matchAll(/action === "([a-zA-Z.]+)"/g)].map((m) => m[1]))].sort();
const BLOCKED_ACTIONS = HANDLED_ACTIONS.filter((action) => !DEVICE_ALLOWED_ACTIONS.has(action));

const FUTURE = 4102444800; // iat far enough ahead that no revocation stamp beats it.
const deviceActor = { sub: "user-device", email: "tester@example.com", fullName: "Device Tester", role: "Owner/Admin", iat: FUTURE, dataMode: "device" };
const serverActor = { sub: "user-owner", email: "owner@pastrycounty.ng", fullName: "Owner", role: "Owner/Admin", iat: FUTURE, dataMode: "server" };

// Fails loudly if any query or transaction runs, proving the refusal happens
// before the database is touched.
function explodingSql() {
  const sql = () => {
    throw new Error("database was touched before the device-mode guard ran");
  };
  sql.transaction = () => {
    throw new Error("database was touched before the device-mode guard ran");
  };
  return sql;
}

// Answers only the app_users lookup that requirePermission/requireActiveSession
// perform, and explodes on anything else. Any business-table read or write on an
// allowed action therefore fails the test rather than passing unnoticed.
function sessionOnlySql(userRow) {
  const sql = (strings) => {
    const text = Array.isArray(strings) ? strings.join("?") : String(strings);
    if (/from app_users/i.test(text)) return Promise.resolve([userRow]);
    throw new Error(`unexpected query on a device-mode path: ${text.replace(/\s+/g, " ").trim().slice(0, 120)}`);
  };
  sql.transaction = () => {
    throw new Error("a device-mode allowed action must not open a transaction");
  };
  return sql;
}

describe("the device allow-list is small, explicit, and covers the whole action surface", () => {
  it("scrapes a real action list rather than matching nothing", () => {
    expect(HANDLED_ACTIONS.length).toBeGreaterThanOrEqual(30);
    expect(HANDLED_ACTIONS).toContain("schema.ensure");
    expect(HANDLED_ACTIONS).toContain("order.produce");
  });

  it("allows exactly the two actions that need the server", () => {
    expect([...DEVICE_ALLOWED_ACTIONS].sort()).toEqual(["import.extract", "notification.lowStockEmail"]);
  });

  it("every allowed action is a real handled action", () => {
    for (const action of DEVICE_ALLOWED_ACTIONS) {
      expect(HANDLED_ACTIONS).toContain(action);
    }
  });

  it("leaves a substantial set of actions blocked", () => {
    expect(BLOCKED_ACTIONS.length).toBeGreaterThanOrEqual(28);
  });
});

describe("deviceModeActionError decides on data mode, never on role", () => {
  it("refuses a blocked action for a device account", () => {
    const error = deviceModeActionError("device", "ingredient.save");
    expect(error?.statusCode).toBe(403);
    expect(error?.message).toMatch(/device/i);
  });

  it("permits the two server-backed actions", () => {
    expect(deviceModeActionError("device", "import.extract")).toBeNull();
    expect(deviceModeActionError("device", "notification.lowStockEmail")).toBeNull();
  });

  it("never restricts a server account", () => {
    for (const action of HANDLED_ACTIONS) {
      expect(deviceModeActionError("server", action)).toBeNull();
    }
  });

  it("treats an unknown or absent mode as a server account", () => {
    expect(deviceModeActionError(undefined, "ingredient.save")).toBeNull();
    expect(deviceModeActionError("", "ingredient.save")).toBeNull();
  });
});

describe("a device account reaches no business action, before any database work", () => {
  it.each(BLOCKED_ACTIONS)("refuses %s with 403 without touching the database", async (action) => {
    await expect(handleAction(explodingSql(), { action }, deviceActor)).rejects.toMatchObject({ statusCode: 403 });
  });

  it("refuses schema.ensure even though the account holds Owner/Admin", async () => {
    await expect(handleAction(explodingSql(), { action: "schema.ensure" }, deviceActor)).rejects.toMatchObject({
      statusCode: 403
    });
  });

  it("refuses on the stored row even when the actor claims to be a server account", async () => {
    // The bearer-compat path builds an actor from a token, which carries no
    // data_mode. The stored row is therefore the authority, not the actor.
    const staleActor = { ...deviceActor, dataMode: "server" };
    const sql = sessionOnlySql({ active: true, revoked_at: null, data_mode: "device" });
    await expect(handleAction(sql, { action: "ingredient.save", ingredient: {} }, staleActor)).rejects.toMatchObject({
      statusCode: 403
    });
  });
});

describe("the two allowed actions work, and touch no business table", () => {
  it("extracts an import draft from the caller's own context", async () => {
    const sql = sessionOnlySql({ active: true, revoked_at: null, data_mode: "device" });
    const result = await handleAction(
      sql,
      {
        action: "import.extract",
        sourceName: "recipes.txt",
        sourceType: "text",
        text: "Chocolate Cake\n200 g flour\n100 g sugar",
        localContext: {
          ingredients: [{ id: "loc-flour", name: "Flour", category: "Dry", baseUnit: "g", latestUnitCost: 2 }],
          recipes: [],
          suppliers: []
        }
      },
      deviceActor
    );
    expect(result).toBeTruthy();
    expect(result.ingredients ?? result.recipes).toBeDefined();
  });

  it("sends a low-stock alert only to the account that raised it", async () => {
    const sql = sessionOnlySql({ active: true, revoked_at: null, data_mode: "device" });
    const result = await handleAction(
      sql,
      { action: "notification.lowStockEmail", items: [{ name: "Flour", currentStock: 1, reorderLevel: 10, baseUnit: "kg" }] },
      deviceActor
    );
    expect(result.recipients).toEqual(["tester@example.com"]);
  });
});

describe("device accounts are refused the shared kitchen snapshot and every route read", () => {
  it("deviceReadError refuses a device account and passes a server one", () => {
    expect(deviceReadError("device")?.statusCode).toBe(403);
    expect(deviceReadError("server")).toBeNull();
    expect(deviceReadError(undefined)).toBeNull();
  });

  it("requireActiveSession refuses a device actor before reading the database", async () => {
    await expect(requireActiveSession(explodingSql(), deviceActor)).rejects.toMatchObject({ statusCode: 403 });
  });

  it("requireActiveSession refuses on the stored row when the actor looks like a server account", async () => {
    const staleActor = { ...deviceActor, dataMode: "server" };
    const sql = sessionOnlySql({
      id: "user-device",
      email: "tester@example.com",
      fullName: "Device Tester",
      role: "Owner/Admin",
      active: true,
      revoked_at: null,
      dataMode: "device"
    });
    await expect(requireActiveSession(sql, staleActor)).rejects.toMatchObject({ statusCode: 403 });
  });

  it("still admits a server account and reports its data mode", async () => {
    const sql = sessionOnlySql({
      id: "user-owner",
      email: "owner@pastrycounty.ng",
      fullName: "Owner",
      role: "Owner/Admin",
      active: true,
      revoked_at: null,
      dataMode: "server"
    });
    const resolved = await requireActiveSession(sql, serverActor);
    expect(resolved.role).toBe("Owner/Admin");
    expect(resolved.dataMode).toBe("server");
  });
});

describe("an unmigrated database behaves as if every account is a server account", () => {
  // The column arrives in migration 007. Between deploying the code and running
  // the migration the guards must not fail closed on real accounts -- and cannot
  // fail open on device accounts, because signup refuses to create one until the
  // column exists.
  function missingColumnSql(userRow) {
    let asked = 0;
    const sql = (strings) => {
      const text = Array.isArray(strings) ? strings.join("?") : String(strings);
      if (/from app_users/i.test(text)) {
        asked += 1;
        if (/data_mode/i.test(text)) {
          return Promise.reject(Object.assign(new Error('column "data_mode" does not exist'), { code: "42703" }));
        }
        return Promise.resolve([userRow]);
      }
      throw new Error(`unexpected query: ${text.slice(0, 80)}`);
    };
    sql.transaction = () => {
      throw new Error("no transaction expected");
    };
    Object.defineProperty(sql, "asked", { get: () => asked });
    return sql;
  }

  it("requireActiveSession falls back to server mode rather than throwing", async () => {
    const sql = missingColumnSql({
      id: "user-owner",
      email: "owner@pastrycounty.ng",
      fullName: "Owner",
      role: "Owner/Admin",
      active: true,
      revoked_at: null
    });
    const resolved = await requireActiveSession(sql, { ...serverActor, dataMode: undefined });
    expect(resolved.dataMode).toBe("server");
    expect(sql.asked).toBeGreaterThanOrEqual(2);
  });
});
