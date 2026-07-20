import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { allowedRolesForAction, canRolePerformAction } from "./_actions.js";

// Phase 015-B step 8: every mutating action, across every role.
//
// The action list is derived from the source rather than copied here. A hand
// written list would silently stop covering new actions, which is precisely the
// gap this suite exists to close: adding an action must force a role decision.
const SOURCE = readFileSync(path.resolve("api", "_actions.js"), "utf8");
const HANDLED_ACTIONS = [...new Set([...SOURCE.matchAll(/action === "([a-zA-Z.]+)"/g)].map((m) => m[1]))].sort();

const ROLES = ["Owner/Admin", "Baker", "Inventory Manager", "Viewer"];

// Actions that change data or state. A Viewer must reach none of them.
const READ_ONLY_ACTIONS = new Set(["archive.list", "import.extract"]);
const MUTATING_ACTIONS = HANDLED_ACTIONS.filter((action) => !READ_ONLY_ACTIONS.has(action));

describe("every handled action has an explicit role decision", () => {
  it("finds the action list from the source, not from a copy that can go stale", () => {
    expect(HANDLED_ACTIONS.length).toBeGreaterThan(25);
    expect(HANDLED_ACTIONS).toContain("order.produce");
    expect(HANDLED_ACTIONS).toContain("inventory.adjust");
    expect(HANDLED_ACTIONS).toContain("schema.ensure");
  });

  it("gives every action a non-empty allow-list", () => {
    for (const action of HANDLED_ACTIONS) {
      const roles = allowedRolesForAction(action);
      expect(Array.isArray(roles), `${action} has no role list`).toBe(true);
      expect(roles.length, `${action} allows nobody`).toBeGreaterThan(0);
      // Anything unlisted must fall back to the most restrictive role, never to
      // "everyone".
      expect(roles.every((role) => ROLES.includes(role)), `${action} names an unknown role`).toBe(true);
    }
  });

  it("defaults an unrecognised action to Owner/Admin only", () => {
    expect(allowedRolesForAction("something.invented")).toEqual(["Owner/Admin"]);
    expect(canRolePerformAction("Viewer", "something.invented")).toBe(false);
    expect(canRolePerformAction("Baker", "something.invented")).toBe(false);
  });
});

describe("a Viewer can change nothing", () => {
  // The single most important row of the matrix.
  it.each(MUTATING_ACTIONS)("refuses %s for a Viewer", (action) => {
    expect(canRolePerformAction("Viewer", action)).toBe(false);
  });
});

describe("role boundaries hold for sensitive actions", () => {
  const ownerOnly = [
    "schema.ensure",
    "settings.save",
    "user.save",
    "user.disable",
    "user.revokeSessions",
    "conversion.delete",
    "archive.restore"
  ];

  it.each(ownerOnly)("keeps %s to Owner/Admin", (action) => {
    expect(canRolePerformAction("Owner/Admin", action)).toBe(true);
    for (const role of ROLES.filter((r) => r !== "Owner/Admin")) {
      expect(canRolePerformAction(role, action), `${role} should not perform ${action}`).toBe(false);
    }
  });

  it("keeps staff administration away from every non-owner role", () => {
    for (const action of ["user.save", "user.disable", "user.revokeSessions"]) {
      expect(allowedRolesForAction(action)).toEqual(["Owner/Admin"]);
    }
  });

  it("lets a Baker run production but not touch money or staff", () => {
    expect(canRolePerformAction("Baker", "order.produce")).toBe(true);
    expect(canRolePerformAction("Baker", "settings.save")).toBe(false);
    expect(canRolePerformAction("Baker", "user.save")).toBe(false);
  });

  it("lets an Inventory Manager move stock but not run production", () => {
    expect(canRolePerformAction("Inventory Manager", "inventory.adjust")).toBe(true);
    expect(canRolePerformAction("Inventory Manager", "order.produce")).toBe(false);
    expect(canRolePerformAction("Inventory Manager", "user.save")).toBe(false);
  });
});

describe("no role check can be satisfied by an absent or malformed actor", () => {
  it("refuses an empty, unknown or spoofed role for every mutating action", () => {
    for (const action of MUTATING_ACTIONS) {
      for (const role of [undefined, null, "", "admin", "Admin", "OWNER/ADMIN", "root", "Owner/Admin "]) {
        expect(canRolePerformAction(role, action), `${String(role)} must not perform ${action}`).toBe(false);
      }
    }
  });
});
