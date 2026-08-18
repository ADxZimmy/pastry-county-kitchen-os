// Type declarations for the runtime-neutral business rules shared by the API and
// the device-mode local engine (actionPolicy.js).

export interface ActorLike {
  sub?: string;
  email?: string;
  fullName?: string;
  role?: string;
}

// Primitives
export function id(prefix: string): string;
export function num(value: unknown, fallback?: number): number;
export function bool(value: unknown): boolean;
export function required(value: unknown, label: string): string;
export function nonNegative(value: number, label: string): number;
export function positive(value: number, label: string): number;
export function actorLabel(actor?: ActorLike | null): string;

// Units
export function normalizeUnit(unit: unknown, fallback?: string): string;
export function directUnitFactor(fromUnit: string, toUnit: string): number | undefined;
export function convertPurchaseQuantity(quantity: number, purchaseUnit: string, baseUnit: string): number;
export function conversionFactor(fromUnit: string, toUnit: string, ruleFactor?: unknown): number;
export const movementTypes: Set<string>;
export const RECIPE_ITEM_UNITS: string[];

export interface ConversionRuleSpec {
  id: string;
  ingredientId: string;
  fromUnit: string;
  toUnit: string;
  conversionFactor: number;
  confidenceLevel: string;
}
export const auditConversionRuleSpecs: ConversionRuleSpec[];

// Roles
export const actionRoles: Record<string, string[]>;
export function allowedRolesForAction(action: string): string[];
export function canRolePerformAction(role: string, action: string): boolean;
export function lowStockRecipients(input?: { actor?: ActorLike | null; staff?: { email?: string }[]; additional?: string }): string[];

// Order lifecycle
export const orderStatusTransitions: Record<string, string[]>;
export function isValidOrderTransition(from: string, to: string): boolean;
export function productionCompletionPreflight(status: string): { produced: boolean; alreadyProduced: boolean } | null;
export function conversionApplyConflict(
  current: { quantity?: unknown; unit?: unknown } | null | undefined,
  expected: { quantity?: unknown; unit?: unknown }
): string | null;
export function archiveTableForEntity(entityType: string): string;

// Stock
export function shortageSummary(shortages: Record<string, unknown>[]): string;
export function productionShortageForRequirement(
  requirement: Record<string, unknown>,
  ingredient: Record<string, unknown> | null | undefined,
  reservedForOrder?: number
): Record<string, unknown> | null;
export interface LotLike {
  id: string;
  quantity_remaining?: number;
  quantityRemaining?: number;
}
export function planBatchDeductions(batches: LotLike[], quantity: number): { batchId: string; quantity: number }[];

export const DEDUCTION_STAGES: string[];
export const STOCK_HOLD_STAGES: string[];
export const HOLDING_STATUSES: string[];
export function normalizeStockHoldStage(value: unknown): "order_confirmation" | "production_start" | "none";
export function shouldHoldStockForStatus(status: unknown, holdStage: unknown): boolean;
export function normalizeDeductionStage(value: unknown): "confirmation" | "production_start" | "production_completion";
export function wasteFromQc(qcLog: Record<string, unknown> | null | undefined, qcInput?: Record<string, unknown>): number;

// Purchasing
export function normalizeShoppingPurchaseInput(
  item: Record<string, unknown>,
  ingredientRow: Record<string, unknown> | null | undefined,
  index?: number
): Record<string, unknown>;

// Cost visibility
export const COST_VISIBILITY_ROLES: string[];
export const COST_FIELDS: Record<string, string[] | null>;
export function canRoleSeeCosts(role: unknown): boolean;
export function stripCostFieldsFromRows<T>(collection: string, rows: T[]): T[];
export function stripCostsForRole<T extends Record<string, unknown>>(snapshot: T, role: unknown): T;
