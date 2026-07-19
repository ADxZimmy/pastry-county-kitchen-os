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

  // Actors now arrive from a resolved cookie session, so these build one
  // directly rather than round-tripping a bearer token that is no longer
  // accepted. The behaviour under test is the access rules, not the credential.
  const cookieActor = (overrides = {}) => ({
    sub: "user-1",
    email: "user@example.com",
    role: "Owner/Admin",
    iat: 1_700_000_000,
    sessionId: "ses-1",
    via: "cookie",
    ...overrides
  });

  it("allows active authenticated bootstrap reads for an owner session", () => {
    expect(bootstrapAccessError(cookieActor(), { active: true })).toBeNull();
  });

  it("allows active authenticated bootstrap reads for a viewer session", () => {
    expect(bootstrapAccessError(cookieActor({ sub: "viewer-1", role: "Viewer" }), { active: true })).toBeNull();
  });

  it("rejects disabled bootstrap sessions", () => {
    expect(bootstrapAccessError(cookieActor({ role: "Viewer" }), { active: false })).toEqual({
      message: "This user session is no longer active.",
      statusCode: 401
    });
  });

  it("rejects sessions issued before session revocation", () => {
    const actor = cookieActor({ role: "Viewer" });

    expect(bootstrapAccessError(actor, { active: true, revoked_at: Number(actor.iat) + 1 })).toEqual({
      message: "This session was revoked. Sign in again.",
      statusCode: 401
    });
  });

  it("ignores a bearer token now that the compatibility window is closed", () => {
    const token = createSessionToken({ id: "legacy", email: "legacy@example.com", role: "Owner/Admin" });

    expect(actorFromRequest({ headers: { authorization: `Bearer ${token}` } })).toBeNull();
    expect(bootstrapAccessError(actorFromRequest({ headers: { authorization: `Bearer ${token}` } }))).toEqual({
      message: "Sign in again to continue.",
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
