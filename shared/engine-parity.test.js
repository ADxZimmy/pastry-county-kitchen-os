// Phase 016 anti-drift harness.
//
// Device accounts run the same business rules in the browser that the API runs
// on the server. The only way that stays true is if there is ONE implementation,
// so the pure rules were moved into shared/ and api/_actions.js re-exports them.
//
// This file guards that arrangement two ways:
//
//   1. Reference identity. The name exported by api/_actions.js must be the very
//      same function object as the one in shared/. If anyone re-implements a rule
//      in _actions.js and stops re-exporting, `toBe` fails. This is the only test
//      in the repo allowed to compare a module against itself, because proving
//      sameness IS the assertion.
//   2. Fixture behaviour. A canonical scenario file both engines are held to, so
//      the parts that cannot be shared verbatim (the local engine reimplements
//      SQL-shaped logic against an in-memory workspace) have a common yardstick.
//
// Every derived list is asserted non-trivially sized first: a truncated fixture
// file or a mis-parsed import would otherwise turn this whole suite into a green
// no-op, which is exactly the failure mode this programme has already hit three
// times.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import * as api from "../api/_actions.js";
import { computeOrderPricing as sharedComputeOrderPricing } from "./orderPricing.js";
import * as policy from "./actionPolicy.js";

const fixtures = JSON.parse(readFileSync(path.resolve("shared", "engine-parity-fixtures.json"), "utf8"));

const SHARED_BY_NAME = {
  computeOrderPricing: sharedComputeOrderPricing,
  isValidOrderTransition: policy.isValidOrderTransition,
  planBatchDeductions: policy.planBatchDeductions,
  productionShortageForRequirement: policy.productionShortageForRequirement,
  productionCompletionPreflight: policy.productionCompletionPreflight,
  normalizeStockHoldStage: policy.normalizeStockHoldStage,
  shouldHoldStockForStatus: policy.shouldHoldStockForStatus,
  normalizeDeductionStage: policy.normalizeDeductionStage,
  conversionApplyConflict: policy.conversionApplyConflict,
  archiveTableForEntity: policy.archiveTableForEntity,
  allowedRolesForAction: policy.allowedRolesForAction,
  canRolePerformAction: policy.canRolePerformAction,
  lowStockRecipients: policy.lowStockRecipients,
  normalizeShoppingPurchaseInput: policy.normalizeShoppingPurchaseInput,
  id: policy.id,
  num: policy.num,
  bool: policy.bool,
  required: policy.required
};

describe("shared engine — reference identity with the API surface", () => {
  const names = Object.keys(SHARED_BY_NAME);

  it("guards a meaningful number of rules", () => {
    expect(names.length).toBeGreaterThanOrEqual(18);
  });

  it.each(names)("api/_actions.js exports the shared %s, not a copy of it", (name) => {
    expect(typeof SHARED_BY_NAME[name]).toBe("function");
    expect(api[name]).toBe(SHARED_BY_NAME[name]);
  });

  it("still exports RECIPE_ITEM_UNITS from the shared list", () => {
    expect(api.RECIPE_ITEM_UNITS).toBe(policy.RECIPE_ITEM_UNITS);
    expect(api.RECIPE_ITEM_UNITS).toContain("cup");
  });
});

describe("order pricing fixtures", () => {
  it("loads enough scenarios to be worth running", () => {
    expect(fixtures.pricing.length).toBeGreaterThanOrEqual(15);
  });

  it.each(fixtures.pricing.map((scenario) => [scenario.name, scenario]))("%s", (_name, scenario) => {
    if (scenario.throws) {
      expect(() => sharedComputeOrderPricing(scenario.input)).toThrow();
      // The refusal must be a client error, not an unhandled 500.
      try {
        sharedComputeOrderPricing(scenario.input);
      } catch (error) {
        expect(error.statusCode).toBe(400);
      }
      return;
    }
    const result = sharedComputeOrderPricing(scenario.input);
    for (const [key, value] of Object.entries(scenario.expect)) {
      expect(result[key], `${_name} -> ${key}`).toBe(value);
    }
  });

  it("ignores any client-supplied totals entirely", () => {
    const result = sharedComputeOrderPricing({
      lines: [{ saleQuantity: 1, unitSellingPrice: 100 }],
      subtotal: 999999,
      netTotal: 999999,
      grossTotal: 999999,
      balance: -999999
    });
    expect(result.subtotal).toBe(100);
    expect(result.netTotal).toBe(100);
    expect(result.grossTotal).toBe(100);
    expect(result.balance).toBe(100);
  });
});

describe("order lifecycle fixtures", () => {
  it("covers the transition table broadly", () => {
    expect(fixtures.transitions.length).toBeGreaterThanOrEqual(15);
  });

  it.each(fixtures.transitions.map((t) => [`${t.from || "(none)"} -> ${t.to} is ${t.valid}`, t]))("%s", (_label, t) => {
    expect(policy.isValidOrderTransition(t.from, t.to)).toBe(t.valid);
  });
});

describe("FEFO planning fixtures", () => {
  it("covers the lot-consumption cases", () => {
    expect(fixtures.fefo.length).toBeGreaterThanOrEqual(5);
  });

  it.each(fixtures.fefo.map((scenario) => [scenario.name, scenario]))("%s", (_name, scenario) => {
    expect(policy.planBatchDeductions(scenario.batches, scenario.quantity)).toEqual(scenario.expect);
  });
});

describe("stage policy fixtures", () => {
  it("covers every stage value", () => {
    const total =
      fixtures.stages.holdStage.length + fixtures.stages.holdStatus.length + fixtures.stages.deductionStage.length;
    expect(total).toBeGreaterThanOrEqual(15);
  });

  it.each(fixtures.stages.holdStage.map((c) => [String(c.input), c]))("hold stage %s normalizes", (_label, c) => {
    expect(policy.normalizeStockHoldStage(c.input)).toBe(c.expect);
  });

  it.each(fixtures.stages.holdStatus.map((c) => [`${c.status} @ ${c.stage}`, c]))("holds for %s", (_label, c) => {
    expect(policy.shouldHoldStockForStatus(c.status, c.stage)).toBe(c.expect);
  });

  it.each(fixtures.stages.deductionStage.map((c) => [String(c.input), c]))("deduction stage %s normalizes", (_label, c) => {
    expect(policy.normalizeDeductionStage(c.input)).toBe(c.expect);
  });
});
