import { describe, expect, it } from "vitest";
import { actorFromRequest, createSessionToken } from "./_auth.js";
import { bootstrapAccessError, filterKitchenSnapshotForActor } from "./bootstrap.js";

describe("bootstrap authentication", () => {
  it("rejects unauthenticated bootstrap reads before loading private kitchen data", () => {
    expect(bootstrapAccessError(actorFromRequest({ headers: {} }))).toEqual({
      message: "Sign in again to continue.",
      statusCode: 401
    });
  });

  it("allows active authenticated bootstrap reads with a signed owner session", () => {
    const token = createSessionToken({
      id: "owner-1",
      email: "owner@example.com",
      role: "Owner/Admin"
    });

    expect(bootstrapAccessError(actorFromRequest({
      headers: { authorization: `Bearer ${token}` }
    }), { active: true })).toBeNull();
  });

  it("allows active authenticated bootstrap reads with a signed viewer session", () => {
    const token = createSessionToken({
      id: "viewer-1",
      email: "viewer@example.com",
      role: "Viewer"
    });

    expect(bootstrapAccessError(actorFromRequest({
      headers: { authorization: `Bearer ${token}` }
    }), { active: true })).toBeNull();
  });

  it("rejects disabled bootstrap sessions", () => {
    const token = createSessionToken({
      id: "viewer-disabled",
      email: "viewer-disabled@example.com",
      role: "Viewer"
    });

    expect(bootstrapAccessError(actorFromRequest({
      headers: { authorization: `Bearer ${token}` }
    }), { active: false })).toEqual({
      message: "This user session is no longer active.",
      statusCode: 401
    });
  });

  it("rejects tokens issued before session revocation", () => {
    const token = createSessionToken({
      id: "viewer-revoked",
      email: "viewer-revoked@example.com",
      role: "Viewer"
    });
    const actor = actorFromRequest({ headers: { authorization: `Bearer ${token}` } });

    expect(bootstrapAccessError(actor, { active: true, revoked_at: Number(actor?.iat ?? 0) + 1 })).toEqual({
      message: "This session was revoked. Sign in again.",
      statusCode: 401
    });
  });

  it("filters sensitive administration data from viewer bootstrap snapshots", () => {
    const snapshot = {
      suppliers: [{ id: "supplier-1", name: "Supplier" }],
      appUsers: [{ id: "owner", email: "owner@example.com", sessionRevokedAt: "2026-06-22" }],
      ingredients: [],
      products: [],
      recipes: [],
      recipeItems: [],
      orders: [],
      orderItems: [],
      inventoryMovements: [],
      ingredientBatches: [],
      auditLogs: [{ id: "audit-1", entityType: "app_users" }],
      conversionRules: [],
      settings: { businessName: "Pastry County", lowStockNotificationEmail: "owner@example.com" }
    };

    expect(filterKitchenSnapshotForActor(snapshot, { role: "Viewer" })).toMatchObject({
      appUsers: [],
      auditLogs: [],
      settings: { businessName: "Pastry County", lowStockNotificationEmail: "" }
    });
    expect(filterKitchenSnapshotForActor(snapshot, { role: "Owner/Admin" })).toBe(snapshot);
  });
});
