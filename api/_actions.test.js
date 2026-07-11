import { describe, expect, it } from "vitest";
import { actorLabel, allowedRolesForAction, archiveTableForEntity, canRolePerformAction, computeOrderPricing, normalizeConversionScope, normalizeIngredientAllergenProfile, normalizeIngredientStorageProfile, normalizeProductionQcLog, normalizeRecipeCostProfile, normalizeRecipeFormulaMetadata, normalizeRecipeItemPrepState, normalizeShoppingPurchaseInput, planBatchDeductions, productionCompletionPreflight, productionShortageForRequirement, safePurchasePersistenceError, sendResendEmail, sessionAccessError } from "./_actions.js";

describe("FEFO batch deduction planning", () => {
  it("deducts stock removals or production use across lots in the provided FEFO order", () => {
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

describe("production shortage guardrails", () => {
  it("flags a production shortage when usable stock is below the requirement", () => {
    expect(productionShortageForRequirement(
      { ingredient_id: "flour", unit: "g", quantity: 500 },
      { name: "Flour", current_stock: 320, reserved_stock: 0 },
      0
    )).toMatchObject({
      ingredientId: "flour",
      ingredientName: "Flour",
      unit: "g",
      requiredQuantity: 500,
      availableQuantity: 320,
      shortageQuantity: 180
    });
  });

  it("allows stock already reserved for the same order to be consumed", () => {
    expect(productionShortageForRequirement(
      { ingredient_id: "flour", unit: "g", quantity: 500 },
      { name: "Flour", current_stock: 500, reserved_stock: 500 },
      500
    )).toBeNull();
  });

  it("treats stock reserved for other orders as unavailable", () => {
    expect(productionShortageForRequirement(
      { ingredient_id: "flour", unit: "g", quantity: 500 },
      { name: "Flour", current_stock: 500, reserved_stock: 300 },
      0
    )).toMatchObject({
      availableQuantity: 200,
      shortageQuantity: 300
    });
  });

  it("short-circuits repeated production deduction once an order is already produced", () => {
    expect(productionCompletionPreflight("Produced")).toEqual({ produced: false, alreadyProduced: true });
    expect(productionCompletionPreflight("Stock Reserved")).toBeNull();
    expect(productionCompletionPreflight("In Production")).toBeNull();
    expect(() => productionCompletionPreflight("Confirmed")).toThrow("Start production before marking this order as produced.");
  });
});

describe("API role permissions", () => {
  it("keeps Owner/Admin as the fallback role for unknown actions", () => {
    expect(allowedRolesForAction("unknown.action")).toEqual(["Owner/Admin"]);
    expect(canRolePerformAction("Owner/Admin", "unknown.action")).toBe(true);
    expect(canRolePerformAction("Baker", "unknown.action")).toBe(false);
  });

  it("allows only inventory roles to post shopping purchases", () => {
    expect(canRolePerformAction("Owner/Admin", "shopping.purchaseSuggested")).toBe(true);
    expect(canRolePerformAction("Inventory Manager", "shopping.purchaseSuggested")).toBe(true);
    expect(canRolePerformAction("Baker", "shopping.purchaseSuggested")).toBe(false);
  });

  it("keeps production batch updates limited to kitchen production roles", () => {
    expect(canRolePerformAction("Owner/Admin", "production.batchStatus")).toBe(true);
    expect(canRolePerformAction("Baker", "production.batchStatus")).toBe(true);
    expect(canRolePerformAction("Inventory Manager", "production.batchStatus")).toBe(false);
  });

  it("keeps settings and staff administration owner-only", () => {
    expect(canRolePerformAction("Owner/Admin", "settings.save")).toBe(true);
    expect(canRolePerformAction("Inventory Manager", "settings.save")).toBe(false);
    expect(canRolePerformAction("Baker", "user.save")).toBe(false);
    expect(canRolePerformAction("Inventory Manager", "user.disable")).toBe(false);
    expect(canRolePerformAction("Baker", "user.revokeSessions")).toBe(false);
  });

  it("keeps low-stock notification delivery limited to inventory roles", () => {
    expect(canRolePerformAction("Owner/Admin", "notification.lowStockEmail")).toBe(true);
    expect(canRolePerformAction("Inventory Manager", "notification.lowStockEmail")).toBe(true);
    expect(canRolePerformAction("Baker", "notification.lowStockEmail")).toBe(false);
    expect(canRolePerformAction("Viewer", "notification.lowStockEmail")).toBe(false);
  });

  it("allows operational roles to extract imports but keeps viewers out", () => {
    expect(canRolePerformAction("Owner/Admin", "import.extract")).toBe(true);
    expect(canRolePerformAction("Baker", "import.extract")).toBe(true);
    expect(canRolePerformAction("Inventory Manager", "import.extract")).toBe(true);
    expect(canRolePerformAction("Viewer", "import.extract")).toBe(false);
  });
});

describe("canonical order pricing (PCO-002)", () => {
  const line = (unitSellingPrice, saleQuantity = 1) => ({ unitSellingPrice, saleQuantity });

  it("derives net total from each order's own price rather than a fixed 18,000", () => {
    expect(computeOrderPricing({ lines: [line(7500)] }).netTotal).toBe(7500);
    expect(computeOrderPricing({ lines: [line(18000)] }).netTotal).toBe(18000);
    expect(computeOrderPricing({ lines: [line(40000)] }).netTotal).toBe(40000);
  });

  it("sums multiple lines by quantity and unit price", () => {
    const pricing = computeOrderPricing({ lines: [line(2500, 4), line(1000, 2)] });
    expect(pricing.subtotal).toBe(12000);
    expect(pricing.netTotal).toBe(12000);
    expect(pricing.hasPricing).toBe(true);
  });

  it("treats a missing or zero unit price as no selling price", () => {
    const pricing = computeOrderPricing({ lines: [line(0, 3)] });
    expect(pricing.hasPricing).toBe(false);
    expect(pricing.netTotal).toBe(0);
  });

  it("applies discount before tax and caps discount at the subtotal", () => {
    expect(computeOrderPricing({ lines: [line(10000)], discountAmount: 1500 }).netTotal).toBe(8500);
    expect(computeOrderPricing({ lines: [line(10000)], discountAmount: 99999 }).netTotal).toBe(0);
  });

  it("adds tax on the net revenue and delivery on top for the gross total", () => {
    const pricing = computeOrderPricing({ lines: [line(10000)], taxRate: 7.5, deliveryFee: 1500 });
    expect(pricing.netTotal).toBe(10000);
    expect(pricing.taxAmount).toBe(750);
    expect(pricing.grossTotal).toBe(12250);
  });

  it("computes the outstanding balance from amount paid", () => {
    const pricing = computeOrderPricing({ lines: [line(20000)], amountPaid: 5000 });
    expect(pricing.grossTotal).toBe(20000);
    expect(pricing.balance).toBe(15000);
  });

  it("ignores any client-supplied derived totals (anti-tamper)", () => {
    const pricing = computeOrderPricing({ lines: [line(5000)], netTotal: 999999, grossTotal: 999999, balance: -1 });
    expect(pricing.netTotal).toBe(5000);
    expect(pricing.grossTotal).toBe(5000);
    expect(pricing.balance).toBe(5000);
  });

  it("rejects negative or non-finite monetary inputs", () => {
    expect(() => computeOrderPricing({ lines: [line(-1)] })).toThrow();
    expect(() => computeOrderPricing({ lines: [line(100)], discountAmount: -5 })).toThrow();
    expect(() => computeOrderPricing({ lines: [line(100)], taxRate: Number.POSITIVE_INFINITY })).toThrow();
  });
});

describe("actor attribution (RS-005)", () => {
  it("prefers full name, then email, then id for the recorded actor", () => {
    expect(actorLabel({ sub: "user-1", fullName: "Ada Baker", email: "ada@example.com" })).toBe("Ada Baker");
    expect(actorLabel({ sub: "user-1", email: "ada@example.com" })).toBe("ada@example.com");
    expect(actorLabel({ sub: "user-1" })).toBe("user-1");
  });

  it("falls back to system only when there is no authenticated actor", () => {
    expect(actorLabel(null)).toBe("system");
    expect(actorLabel(undefined)).toBe("system");
  });
});

describe("low-stock notification delivery guards", () => {
  it("logs missing recipients instead of attempting an external email", async () => {
    await expect(sendResendEmail({ to: null, subject: "Low stock", text: "Flour" })).resolves.toEqual({ status: "missing_recipient" });
  });

  it("logs configured recipients when Resend is not configured", async () => {
    const previousKey = process.env.RESEND_API_KEY;
    delete process.env.RESEND_API_KEY;
    try {
      await expect(sendResendEmail({ to: "ops@example.com", subject: "Low stock", text: "Flour" })).resolves.toEqual({ status: "logged_missing_resend_key" });
    } finally {
      if (previousKey === undefined) delete process.env.RESEND_API_KEY;
      else process.env.RESEND_API_KEY = previousKey;
    }
  });

  it("requires an explicit verified sender domain before attempting Resend delivery", async () => {
    const previousKey = process.env.RESEND_API_KEY;
    const previousFrom = process.env.RESEND_FROM_EMAIL;
    process.env.RESEND_API_KEY = "test-key";
    delete process.env.RESEND_FROM_EMAIL;
    try {
      await expect(sendResendEmail({ to: "ops@example.com", subject: "Low stock", text: "Flour" })).resolves.toEqual({ status: "missing_sender_domain" });
      process.env.RESEND_FROM_EMAIL = "Pastry County Kitchen OS <onboarding@resend.dev>";
      await expect(sendResendEmail({ to: "ops@example.com", subject: "Low stock", text: "Flour" })).resolves.toEqual({ status: "missing_sender_domain" });
    } finally {
      if (previousKey === undefined) delete process.env.RESEND_API_KEY;
      else process.env.RESEND_API_KEY = previousKey;
      if (previousFrom === undefined) delete process.env.RESEND_FROM_EMAIL;
      else process.env.RESEND_FROM_EMAIL = previousFrom;
    }
  });
});

describe("staff session enforcement", () => {
  it("requires a signed-in actor for mutating actions", () => {
    expect(sessionAccessError(null, { active: true })).toEqual({
      message: "Sign in again to continue.",
      statusCode: 401
    });
  });

  it("rejects disabled or missing staff sessions", () => {
    const actor = { sub: "user-1", role: "Baker", iat: 100 };
    expect(sessionAccessError(actor, null)).toEqual({
      message: "This user session is no longer active.",
      statusCode: 401
    });
    expect(sessionAccessError(actor, { active: false })).toEqual({
      message: "This user session is no longer active.",
      statusCode: 401
    });
  });

  it("rejects sessions issued before staff session revocation", () => {
    expect(sessionAccessError({ sub: "user-1", role: "Inventory Manager", iat: 100 }, { active: true, revoked_at: 120 })).toEqual({
      message: "This session was revoked. Sign in again.",
      statusCode: 401
    });
  });

  it("allows active staff sessions issued after revocation time", () => {
    expect(sessionAccessError({ sub: "user-1", role: "Inventory Manager", iat: 130 }, { active: true, revoked_at: 120 })).toBeNull();
  });
});

describe("shopping purchase validation", () => {
  const flour = { supplier_id: "supplier-1", base_unit: "g" };

  it("normalizes selected purchase quantities, cost, supplier fallback, expiry, and notes", () => {
    const purchase = normalizeShoppingPurchaseInput({
      ingredientId: "flour",
      suggestedBuyQuantity: 2500,
      unitCost: 0.64,
      unit: "g",
      expiryDate: "2026-07-01",
      note: "Restock for weekend orders"
    }, flour, 2);

    expect(purchase).toMatchObject({
      index: 2,
      ingredientId: "flour",
      supplierId: "supplier-1",
      quantity: 2500,
      unit: "g",
      purchasePrice: 1600,
      unitCost: 0.64,
      expiryDate: "2026-07-01",
      note: "Restock for weekend orders"
    });
    expect(purchase.purchaseId).toMatch(/^pur-2-/);
  });

  it("uses explicit purchase price to derive the stored unit cost", () => {
    expect(normalizeShoppingPurchaseInput({
      ingredientId: "flour",
      purchaseQuantity: 100,
      unitCost: 2,
      purchasePrice: 150
    }, flour).unitCost).toBe(1.5);
  });

  it("preserves fractional shopping costs that previously failed on live integer columns", () => {
    expect(normalizeShoppingPurchaseInput({
      ingredientId: "flour",
      purchaseQuantity: 1,
      unitCost: 0.5
    }, flour)).toMatchObject({
      purchasePrice: 0.5,
      unitCost: 0.5
    });

    expect(normalizeShoppingPurchaseInput({
      ingredientId: "flour",
      purchaseQuantity: 1,
      unitCost: 2.75
    }, flour)).toMatchObject({
      purchasePrice: 2.75,
      unitCost: 2.75
    });
  });

  it("rejects missing ingredients and non-positive purchase fields", () => {
    expect(() => normalizeShoppingPurchaseInput({ purchaseQuantity: 10, unitCost: 1 }, flour)).toThrow("Ingredient is required.");
    expect(() => normalizeShoppingPurchaseInput({ ingredientId: "flour", purchaseQuantity: 0, unitCost: 1 }, flour)).toThrow("Purchase quantity must be greater than zero.");
    expect(() => normalizeShoppingPurchaseInput({ ingredientId: "flour", purchaseQuantity: 10, unitCost: 0 }, flour)).toThrow("Unit cost must be greater than zero.");
    expect(() => normalizeShoppingPurchaseInput({ ingredientId: "flour", purchaseQuantity: 10, unitCost: 1, purchasePrice: -4 }, flour)).toThrow("Purchase price must be greater than zero.");
    expect(() => normalizeShoppingPurchaseInput({ ingredientId: "missing", purchaseQuantity: 10, unitCost: 1 }, null)).toThrow("Ingredient not found.");
  });

  it("maps low-level decimal persistence failures to user-safe messages", () => {
    const error = safePurchasePersistenceError(new Error("invalid input syntax for type integer: \"0.5\""));
    expect(error).toMatchObject({
      message: "Unable to save this purchase. Check the quantity and unit cost, then try again.",
      statusCode: 400
    });
  });
});

describe("recipe formula metadata normalization", () => {
  it("keeps pastry formula fields and removes empty or unsupported values", () => {
    expect(normalizeRecipeFormulaMetadata({
      productFamily: " Brownie ",
      formulaVersion: "v2",
      panProfile: "9x13 tray",
      panCount: "2",
      ovenTemperature: "170C fan",
      bakeTimeRange: "24-28 min",
      sensoryCheckpoints: "Glossy top, moist crumbs",
      testBakeStatus: "production_ready",
      ignored: "drop me",
      coolWindow: ""
    })).toEqual({
      productFamily: "Brownie",
      formulaVersion: "v2",
      panProfile: "9x13 tray",
      panCount: 2,
      ovenTemperature: "170C fan",
      bakeTimeRange: "24-28 min",
      sensoryCheckpoints: "Glossy top, moist crumbs",
      testBakeStatus: "production_ready"
    });
  });

  it("keeps recipe-item prep state fields for pastry-specific ingredient handling", () => {
    expect(normalizeRecipeItemPrepState({
      component: "Brownie base",
      stage: "Mix",
      sequence: "3",
      ingredientState: "Sifted",
      temperatureState: "Room temperature",
      dividedUse: "Half batter, half topping",
      preparationNotes: "Fold gently",
      handlingWarning: "Do not overmix",
      sourceLineName: "Butter",
      sourceFile: "onboarding.csv",
      sourceType: "csv",
      sourceReference: "onboarding.csv | sheet Recipes | row 2",
      sourceText: "300,g,Butter",
      sourceSheet: "CAKES",
      sourceWorkbook: "Dish Costing",
      sourceWorkbookRevision: "3942",
      sourcePackageQuantity: "200",
      sourcePackagePrice: "7000",
      sourceNeededQuantity: "113",
      sourceLineAmount: "3955",
      sourceRow: "2",
      unknown: "drop me"
    })).toEqual({
      component: "Brownie base",
      stage: "Mix",
      sequence: 3,
      ingredientState: "Sifted",
      temperatureState: "Room temperature",
      dividedUse: "Half batter, half topping",
      preparationNotes: "Fold gently",
      handlingWarning: "Do not overmix",
      sourceLineName: "Butter",
      sourceFile: "onboarding.csv",
      sourceType: "csv",
      sourceReference: "onboarding.csv | sheet Recipes | row 2",
      sourceText: "300,g,Butter",
      sourceSheet: "CAKES",
      sourceWorkbook: "Dish Costing",
      sourceWorkbookRevision: "3942",
      sourcePackageQuantity: 200,
      sourcePackagePrice: 7000,
      sourceNeededQuantity: 113,
      sourceLineAmount: 3955,
      sourceRow: 2
    });
  });
});

describe("phase 004 profile normalization", () => {
  it("keeps structured ingredient allergen and storage profiles", () => {
    expect(normalizeIngredientAllergenProfile({
      contains: "gluten, eggs, milk",
      mayContain: ["peanuts", "tree nuts", ""],
      dietaryFlags: "halal, alcohol-free",
      crossContactRisk: "High",
      labelNotes: "Shared mixer",
      ignored: "drop"
    })).toEqual({
      contains: ["gluten", "eggs", "milk"],
      mayContain: ["peanuts", "tree nuts"],
      dietaryFlags: ["halal", "alcohol-free"],
      crossContactRisk: "high",
      labelNotes: "Shared mixer"
    });

    expect(normalizeIngredientStorageProfile({
      storageTemperature: "cool_dry",
      storageLocation: "Dry shelf A",
      humiditySensitive: "Yes",
      odorSensitive: false,
      openedShelfLifeDays: "14",
      handlingNotes: "Keep sealed"
    })).toEqual({
      storageTemperature: "cool_dry",
      storageLocation: "Dry shelf A",
      humiditySensitive: true,
      odorSensitive: false,
      openedShelfLifeDays: 14,
      handlingNotes: "Keep sealed"
    });
  });

  it("keeps recipe costing, conversion scope, and production QC fields", () => {
    expect(normalizeRecipeCostProfile({
      laborMinutes: "45",
      laborRatePerHour: "3000",
      packagingCost: "500",
      overheadCost: "250",
      utilityCost: "150",
      failureAllowancePercentage: "5",
      yieldLossPercentage: "2",
      notes: "Weekend batch"
    })).toMatchObject({
      laborMinutes: 45,
      laborRatePerHour: 3000,
      packagingCost: 500,
      overheadCost: 250,
      utilityCost: 150,
      failureAllowancePercentage: 5,
      yieldLossPercentage: 2,
      notes: "Weekend batch"
    });

    expect(normalizeConversionScope({ ingredientState: " Sifted ", temperatureState: "Room temp", formulaContext: "Brownie", ignored: "drop" })).toEqual({
      ingredientState: "Sifted",
      temperatureState: "Room temp",
      formulaContext: "Brownie"
    });

    expect(normalizeProductionQcLog({
      expectedYieldQuantity: "16",
      actualYieldQuantity: "15",
      roomTemperature: "25C",
      ovenTemperature: "170C",
      bakeTimeMinutes: "26",
      passedQc: "No",
      sensoryNotes: "Moist crumbs"
    })).toMatchObject({
      expectedYieldQuantity: 16,
      actualYieldQuantity: 15,
      roomTemperature: "25C",
      ovenTemperature: "170C",
      bakeTimeMinutes: 26,
      passedQc: false,
      sensoryNotes: "Moist crumbs"
    });
  });
});

describe("archive recovery helpers", () => {
  it("maps every recoverable archive entity to its database table", () => {
    expect(archiveTableForEntity("ingredient")).toBe("ingredients");
    expect(archiveTableForEntity("recipe")).toBe("recipes");
    expect(archiveTableForEntity("order")).toBe("orders");
    expect(archiveTableForEntity("supplier")).toBe("suppliers");
    expect(archiveTableForEntity("conversion")).toBe("conversion_rules");
  });

  it("rejects unsupported archive entity types before restore", () => {
    expect(() => archiveTableForEntity("staff")).toThrow("Unsupported archive type.");
  });
});
