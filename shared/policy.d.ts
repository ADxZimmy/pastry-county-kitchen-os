// Type declarations for the runtime-neutral shared policy module (policy.js).
export const COUNT_UNITS: string[];
export function isFiniteNumber(value: unknown): boolean;
export function validatePositiveNumber(value: unknown, label: string): string | null;
export function validateNonNegativeNumber(value: unknown, label: string): string | null;
export function isCountUnit(unit: string): boolean;
export interface DivisibilityOptions { allowsDecimals?: boolean | null; minimumIncrement?: number | null }
export function defaultAllowsDecimals(unit: string): boolean;
export function unitIncrement(unit: string, options?: DivisibilityOptions): number;
export function validateQuantityIncrement(value: unknown, unit: string, label: string, options?: DivisibilityOptions): string | null;
export function roundGrams(value: number, gramRounding: number): number;
export function practicalQuantity(value: number, unit: string, gramRounding: number): number;
export const MINIMUM_PASSWORD_LENGTH: number;
export function validatePasswordStrength(password: unknown): string | null;
export function passwordsMatch(password: unknown, confirmation: unknown): boolean;
