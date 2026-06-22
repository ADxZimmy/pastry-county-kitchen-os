import { describe, expect, it } from "vitest";
import { actorFromRequest, createSessionToken } from "./_auth.js";
import { bootstrapAccessError } from "./bootstrap.js";

describe("bootstrap authentication", () => {
  it("rejects unauthenticated bootstrap reads before loading private kitchen data", () => {
    expect(bootstrapAccessError(actorFromRequest({ headers: {} }))).toEqual({
      message: "Sign in again to continue.",
      statusCode: 401
    });
  });

  it("allows authenticated bootstrap reads with a signed owner session", () => {
    const token = createSessionToken({
      id: "owner-1",
      email: "owner@example.com",
      role: "Owner/Admin"
    });

    expect(bootstrapAccessError(actorFromRequest({
      headers: { authorization: `Bearer ${token}` }
    }))).toBeNull();
  });

  it("allows authenticated bootstrap reads with a signed viewer session", () => {
    const token = createSessionToken({
      id: "viewer-1",
      email: "viewer@example.com",
      role: "Viewer"
    });

    expect(bootstrapAccessError(actorFromRequest({
      headers: { authorization: `Bearer ${token}` }
    }))).toBeNull();
  });
});
