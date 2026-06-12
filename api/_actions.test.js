import { describe, expect, it } from "vitest";
import { planBatchDeductions } from "./_actions.js";

describe("FEFO batch deduction planning", () => {
  it("deducts stock removals across lots in the provided FEFO order", () => {
    expect(planBatchDeductions([
      { id: "lot-old", quantity_remaining: 100 },
      { id: "lot-new", quantity_remaining: 150 }
    ], 180)).toEqual([
      { batchId: "lot-old", quantity: 100 },
      { batchId: "lot-new", quantity: 80 }
    ]);
  });

  it("caps deductions at available lot quantity", () => {
    expect(planBatchDeductions([
      { id: "lot-a", quantity_remaining: 40 },
      { id: "lot-b", quantity_remaining: 30 }
    ], 100)).toEqual([
      { batchId: "lot-a", quantity: 40 },
      { batchId: "lot-b", quantity: 30 }
    ]);
  });
});
