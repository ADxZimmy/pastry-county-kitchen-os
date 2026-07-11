// Runtime-neutral policy and validation contract. Pure, dependency-free
// functions imported by BOTH the Vite/TypeScript frontend (src) and the Node
// API (api). It exists so recipe/order/stock validation and quantity rounding
// have one source of truth instead of the duplicated per-module logic that let
// the audit's settings and validation drift apart. The server stays
// authoritative for persistence and transactions.

export const COUNT_UNITS = ["pcs", "pack", "box", "roll", "egg", "yolk", "white"];

export function isFiniteNumber(value) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed);
}

// Return a field-level error string, or null when the value is a valid number > 0.
export function validatePositiveNumber(value, label) {
  const parsed = Number(value);
  if (value === "" || value === null || value === undefined || !Number.isFinite(parsed)) {
    return `${label} must be a number.`;
  }
  if (parsed <= 0) return `${label} must be greater than zero.`;
  return null;
}

// Return a field-level error string, or null when the value is a valid number >= 0.
export function validateNonNegativeNumber(value, label) {
  const parsed = Number(value);
  if (value === "" || value === null || value === undefined || !Number.isFinite(parsed)) {
    return `${label} must be a number.`;
  }
  if (parsed < 0) return `${label} cannot be negative.`;
  return null;
}

export function isCountUnit(unit) {
  return COUNT_UNITS.includes(unit);
}

// Round a gram quantity to the configured step (nearest 1/5/10g). Falls back to
// nearest-1g for an invalid step.
export function roundGrams(value, gramRounding) {
  const step = Number(gramRounding) > 0 ? Number(gramRounding) : 1;
  return Math.round(Number(value) / step) * step;
}

// The operator-facing practical quantity for a scaled ingredient. Divisible
// count units round up to whole units; grams round to the configured gram step;
// other measured units keep one decimal. The caller keeps the precise
// mathematical value separately for costing and stock deduction.
export function practicalQuantity(value, unit, gramRounding) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  if (["pcs", "pack", "box", "roll"].includes(unit)) return Math.ceil(numeric);
  if (unit === "g") return roundGrams(numeric, gramRounding);
  return Number(numeric.toFixed(1));
}
