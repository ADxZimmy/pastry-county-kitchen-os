import { describe, expect, it } from "vitest";
import {
  buildPage,
  canRoleRead,
  clampLimit,
  decodeCursor,
  encodeCursor,
  projectSettingsForRole,
  requireCollectionAccess,
  rolesAllowedToRead
} from "./_projection.js";
import { filterKitchenSnapshotForActor } from "./bootstrap.js";

const ROLES = ["Owner/Admin", "Baker", "Inventory Manager", "Viewer"];

describe("route-scoped read authorisation", () => {
  it("keeps the audit trail to Owner/Admin", () => {
    expect(canRoleRead("Owner/Admin", "audit")).toBe(true);
    for (const role of ROLES.filter((r) => r !== "Owner/Admin")) {
      expect(canRoleRead(role, "audit")).toBe(false);
    }
  });

  it("keeps the staff list to Owner/Admin", () => {
    expect(rolesAllowedToRead("users")).toEqual(["Owner/Admin"]);
    expect(canRoleRead("Inventory Manager", "users")).toBe(false);
  });

  it("lets every signed-in role read operational collections", () => {
    for (const role of ROLES) {
      expect(canRoleRead(role, "orders")).toBe(true);
      expect(canRoleRead(role, "movements")).toBe(true);
      expect(canRoleRead(role, "summary")).toBe(true);
    }
  });

  it("refuses an unauthenticated caller before any role check", () => {
    expect(() => requireCollectionAccess(null, "orders")).toThrowError(/sign in again/i);
    try {
      requireCollectionAccess(null, "orders");
    } catch (error) {
      expect(error.statusCode).toBe(401);
    }
  });

  it("refuses a signed-in caller whose role may not read the collection", () => {
    try {
      requireCollectionAccess({ role: "Viewer" }, "audit");
      throw new Error("should have refused");
    } catch (error) {
      expect(error.statusCode).toBe(403);
      expect(error.message).toMatch(/Viewer cannot read audit/);
    }
  });

  // The whole point of a shared layer: the new endpoints must not become a
  // second door to data /api/bootstrap has always withheld.
  it("agrees with what bootstrap withholds from lower roles", () => {
    const snapshot = {
      appUsers: [{ id: "owner", email: "owner@example.com" }],
      auditLogs: [{ id: "audit-1" }],
      settings: { businessName: "Pastry County", lowStockNotificationEmail: "ops@example.com" }
    };

    for (const role of ROLES.filter((r) => r !== "Owner/Admin")) {
      const filtered = filterKitchenSnapshotForActor(snapshot, { role });
      // Bootstrap blanks these for the role...
      expect(filtered.appUsers).toEqual([]);
      expect(filtered.auditLogs).toEqual([]);
      expect(filtered.settings.lowStockNotificationEmail).toBe("");
      // ...so the route-scoped layer must refuse them too.
      expect(canRoleRead(role, "audit")).toBe(false);
      expect(canRoleRead(role, "users")).toBe(false);
      expect(projectSettingsForRole(snapshot.settings, role).lowStockNotificationEmail).toBe("");
    }

    expect(projectSettingsForRole(snapshot.settings, "Owner/Admin").lowStockNotificationEmail).toBe("ops@example.com");
  });
});

describe("page size limits", () => {
  it("defaults when no limit is supplied", () => {
    expect(clampLimit(undefined)).toBe(50);
    expect(clampLimit("")).toBe(50);
  });

  it("refuses to let a caller pull the whole table", () => {
    expect(clampLimit(100000)).toBe(200);
    expect(clampLimit("500")).toBe(200);
  });

  it("ignores nonsense rather than failing the request", () => {
    expect(clampLimit("abc")).toBe(50);
    expect(clampLimit(-5)).toBe(50);
    expect(clampLimit(0)).toBe(50);
  });

  it("honours a reasonable explicit limit", () => {
    expect(clampLimit(25)).toBe(25);
    expect(clampLimit("10")).toBe(10);
  });
});

describe("keyset cursors", () => {
  const row = { id: "ord-2", createdAt: "2026-07-19T10:00:00.000Z" };

  it("round-trips a position", () => {
    const cursor = encodeCursor(row);
    expect(cursor).not.toContain("ord-2");
    expect(decodeCursor(cursor)).toEqual({ at: "2026-07-19T10:00:00.000Z", id: "ord-2" });
  });

  it("accepts a Date as well as a string", () => {
    expect(decodeCursor(encodeCursor({ id: "a", createdAt: new Date("2026-01-02T03:04:05Z") })))
      .toEqual({ at: "2026-01-02T03:04:05.000Z", id: "a" });
  });

  // A cursor is a position hint, not a credential; garbage restarts from the
  // beginning instead of erroring in an operator's face.
  it("treats a malformed cursor as no cursor", () => {
    expect(decodeCursor("not-base64!!")).toBeNull();
    expect(decodeCursor(Buffer.from('{"at":"nope","id":"x"}').toString("base64url"))).toBeNull();
    expect(decodeCursor(Buffer.from('{"id":"x"}').toString("base64url"))).toBeNull();
    expect(decodeCursor("")).toBeNull();
    expect(decodeCursor(undefined)).toBeNull();
  });

  it("has no cursor for an incomplete row", () => {
    expect(encodeCursor({ id: "a" })).toBeNull();
    expect(encodeCursor(null)).toBeNull();
  });
});

describe("page assembly", () => {
  const rows = (n) => Array.from({ length: n }, (_, i) => ({ id: `r${i}`, createdAt: `2026-07-1${i % 9}T00:00:00.000Z` }));

  it("reports more pages by over-fetching one row, not by counting", () => {
    const page = buildPage(rows(6), 5);
    expect(page.items).toHaveLength(5);
    expect(page.hasMore).toBe(true);
    expect(decodeCursor(page.nextCursor).id).toBe("r4");
  });

  it("ends cleanly on the last page", () => {
    const page = buildPage(rows(3), 5);
    expect(page.items).toHaveLength(3);
    expect(page.hasMore).toBe(false);
    expect(page.nextCursor).toBeNull();
  });

  it("handles an empty collection", () => {
    expect(buildPage([], 5)).toEqual({ items: [], hasMore: false, nextCursor: null });
  });
});
