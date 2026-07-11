import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { allowedRolesForAction, canRolePerformAction, handleAction } from "./_actions.js";
import { safeErrorResponse } from "./_db.js";
import { isProductionRuntime, sessionSecret, sessionSecretConfigured } from "./_auth.js";

// A sql stub that fails loudly if any query or transaction runs. Used to prove
// that unauthorized requests are rejected before touching the database.
function explodingSql() {
  const sql = () => {
    throw new Error("database was touched before authorization");
  };
  sql.transaction = () => {
    throw new Error("database was touched before authorization");
  };
  return sql;
}

describe("schema.ensure is owner-only maintenance (RS-002)", () => {
  it("no longer treats schema.ensure as an unauthenticated open action", () => {
    expect(allowedRolesForAction("schema.ensure")).toEqual(["Owner/Admin"]);
  });

  it("only allows Owner/Admin to run schema maintenance", () => {
    expect(canRolePerformAction("Owner/Admin", "schema.ensure")).toBe(true);
    expect(canRolePerformAction("Baker", "schema.ensure")).toBe(false);
    expect(canRolePerformAction("Inventory Manager", "schema.ensure")).toBe(false);
    expect(canRolePerformAction("Viewer", "schema.ensure")).toBe(false);
  });
});

describe("actions authorize before any database work (RS-002)", () => {
  it("rejects an anonymous schema.ensure before running maintenance DDL", async () => {
    await expect(handleAction(explodingSql(), { action: "schema.ensure" }, null)).rejects.toMatchObject({
      statusCode: 401
    });
    await expect(handleAction(explodingSql(), { action: "schema.ensure" }, null)).rejects.toThrow(/sign in/i);
  });

  it("rejects anonymous mutating actions before touching the database", async () => {
    await expect(handleAction(explodingSql(), { action: "ingredient.save", ingredient: {} }, null)).rejects.toMatchObject({
      statusCode: 401
    });
    await expect(handleAction(explodingSql(), { action: "inventory.adjust", ingredientId: "flour" }, null)).rejects.toMatchObject({
      statusCode: 401
    });
  });

  it("rejects a wrong-role schema.ensure before touching the database", async () => {
    const baker = { sub: "user-baker", role: "Baker", iat: 4102444800 };
    await expect(handleAction(explodingSql(), { action: "schema.ensure" }, baker)).rejects.toMatchObject({
      statusCode: 403
    });
    await expect(handleAction(explodingSql(), { action: "schema.ensure" }, baker)).rejects.toThrow(/cannot perform/i);
  });
});

describe("safe error responses (RS-003)", () => {
  it("masks unexpected errors that carry no explicit status code", () => {
    const response = safeErrorResponse(new Error("error: syntax error at or near \"select\" in relation app_users"), "corr-123");
    expect(response.status).toBe(500);
    expect(response.body.error).toBe("Something went wrong while processing that request. Please try again.");
    expect(response.body.error).not.toMatch(/select|app_users|syntax/i);
    expect(response.body.correlationId).toBe("corr-123");
  });

  it("omits the correlation id when none is supplied", () => {
    expect(safeErrorResponse(new Error("boom")).body.correlationId).toBeUndefined();
  });

  it("preserves deliberate operational messages that carry a status code", () => {
    const validation = safeErrorResponse(Object.assign(new Error("Add at least one order item."), { statusCode: 400 }));
    expect(validation.status).toBe(400);
    expect(validation.body.error).toBe("Add at least one order item.");
    expect(validation.body.correlationId).toBeUndefined();

    const configuration = safeErrorResponse(Object.assign(new Error("DATABASE_URL is not configured in Vercel environment variables."), { statusCode: 503 }));
    expect(configuration.status).toBe(503);
    expect(configuration.body.error).toMatch(/DATABASE_URL/);
  });
});

describe("production session secret (RS-004)", () => {
  const snapshot = {};
  const managedKeys = ["SESSION_SECRET", "DATABASE_URL", "VERCEL_ENV", "NODE_ENV"];

  beforeEach(() => {
    managedKeys.forEach((key) => {
      snapshot[key] = process.env[key];
      delete process.env[key];
    });
  });

  afterEach(() => {
    managedKeys.forEach((key) => {
      if (snapshot[key] === undefined) delete process.env[key];
      else process.env[key] = snapshot[key];
    });
  });

  it("treats a Vercel production runtime as production", () => {
    process.env.VERCEL_ENV = "production";
    expect(isProductionRuntime()).toBe(true);
    process.env.VERCEL_ENV = "preview";
    expect(isProductionRuntime()).toBe(false);
  });

  it("fails closed in production when SESSION_SECRET is missing", () => {
    process.env.VERCEL_ENV = "production";
    expect(sessionSecretConfigured()).toBe(false);
    expect(() => sessionSecret()).toThrow(/SESSION_SECRET/);
  });

  it("does not fall back to DATABASE_URL in production", () => {
    process.env.VERCEL_ENV = "production";
    process.env.DATABASE_URL = "postgresql://user:password@host.neon.tech/neondb";
    expect(() => sessionSecret()).toThrow(/SESSION_SECRET/);
  });

  it("rejects a too-short production secret", () => {
    process.env.VERCEL_ENV = "production";
    process.env.SESSION_SECRET = "short";
    expect(sessionSecretConfigured()).toBe(false);
    expect(() => sessionSecret()).toThrow(/SESSION_SECRET/);
  });

  it("uses a configured production secret without falling back", () => {
    process.env.VERCEL_ENV = "production";
    process.env.SESSION_SECRET = "a-sufficiently-long-production-secret";
    expect(sessionSecretConfigured()).toBe(true);
    expect(sessionSecret()).toBe("a-sufficiently-long-production-secret");
  });

  it("allows a development fallback outside production", () => {
    process.env.VERCEL_ENV = "development";
    expect(sessionSecretConfigured()).toBe(true);
    expect(sessionSecret()).toBe("pastry-county-dev-session");
  });
});
