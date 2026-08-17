// What a brand-new device workspace contains.
//
// Almost nothing, deliberately: the point of a tester account is to start empty
// and fill it with their own recipes. The two exceptions both carry no business
// meaning.
//
// Settings, because every screen reads them and an absent settings object would
// mean special-casing "no settings yet" everywhere. The defaults match what the
// server writes for a fresh install.
//
// The seven generic conversion rules, because "1 cup of flour is 120 g" is common
// kitchen knowledge rather than anyone's data. The server seeds the same seven
// into its own database. Without them a new workspace cannot convert anything and
// the Kitchen Helper's suggestions refer to rules that do not exist.
import { auditConversionRuleSpecs, id } from "../../shared/actionPolicy.js";
import type { AuditLog, ConversionRule, Settings } from "../types";
import type { LocalWorkspace } from "./types";

export const DEVICE_SETTINGS_DEFAULTS: Settings = {
  businessName: "",
  currency: "NGN",
  defaultDeductionStage: "production_completion",
  stockHoldStage: "order_confirmation",
  allowNegativeInventory: false,
  requireAiConversionConfirmation: true,
  gramRoundingPreference: 5,
  eggRoundingPreference: "nearest_whole_egg",
  safetyMarginPercentage: 10,
  defaultTaxPercentage: 0,
  lowStockNotificationEmail: ""
};

export function seedConversionRules(nowIso: string): ConversionRule[] {
  return auditConversionRuleSpecs.map((spec) => ({
    id: spec.id,
    ingredientId: spec.ingredientId,
    fromUnit: spec.fromUnit,
    toUnit: spec.toUnit,
    conversionFactor: spec.conversionFactor,
    conversionType: "ingredient_specific",
    confidenceLevel: spec.confidenceLevel,
    source: "seed rule",
    verified: true,
    active: true,
    createdAt: nowIso,
    updatedAt: nowIso
  })) as ConversionRule[];
}

function seedAuditRows(rules: ConversionRule[], nowIso: string, actor: string): AuditLog[] {
  return rules.map((rule) => ({
    id: id("audit"),
    entityType: "conversion_rules",
    entityId: rule.id,
    action: "create",
    beforeData: null,
    afterData: rule as unknown as Record<string, unknown>,
    actor,
    createdAt: nowIso
  })) as unknown as AuditLog[];
}

export function seedWorkspace(nowIso: string, actor = "system"): LocalWorkspace {
  const conversionRules = seedConversionRules(nowIso);
  return {
    suppliers: [],
    ingredients: [],
    products: [],
    recipes: [],
    recipeItems: [],
    orders: [],
    orderItems: [],
    orderEvents: [],
    inventoryMovements: [],
    ingredientBatches: [],
    productionQcLogs: [],
    auditLogs: seedAuditRows(conversionRules, nowIso, actor),
    conversionRules,
    purchaseLogs: [],
    importBatches: [],
    productionRuns: [],
    settings: { ...DEVICE_SETTINGS_DEFAULTS }
  };
}

export function emptyWorkspace(nowIso: string): LocalWorkspace {
  return { ...seedWorkspace(nowIso), auditLogs: [], conversionRules: [] };
}
