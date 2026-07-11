// Type declarations for the runtime-neutral shared policy module (policy.js).
export const COUNT_UNITS: string[];
export function isFiniteNumber(value: unknown): boolean;
export function validatePositiveNumber(value: unknown, label: string): string | null;
export function validateNonNegativeNumber(value: unknown, label: string): string | null;
export function isCountUnit(unit: string): boolean;
export function roundGrams(value: number, gramRounding: number): number;
export function practicalQuantity(value: number, unit: string, gramRounding: number): number;
