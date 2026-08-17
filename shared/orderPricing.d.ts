// Type declarations for the runtime-neutral order pricing module (orderPricing.js).
export interface OrderPricingLineInput {
  saleQuantity?: number | null;
  unitSellingPrice?: number | null;
}

export interface OrderPricingInput {
  lines?: OrderPricingLineInput[];
  deliveryFee?: number | null;
  discountAmount?: number | null;
  taxRate?: number | null;
  amountPaid?: number | null;
}

export interface OrderPricingLine {
  saleQuantity: number;
  unitSellingPrice: number;
  lineTotal: number;
}

export interface OrderPricing {
  lines: OrderPricingLine[];
  subtotal: number;
  discountAmount: number;
  deliveryFee: number;
  taxRate: number;
  taxAmount: number;
  netTotal: number;
  grossTotal: number;
  amountPaid: number;
  balance: number;
  hasPricing: boolean;
}

// Throws with statusCode 400 on any non-finite or negative money input. This is
// the persistence gate, unlike the clamping preview in src/lib/kitchen.ts.
export function computeOrderPricing(input?: OrderPricingInput): OrderPricing;
export function round2(value: unknown): number;
export function nonNegativeMoney(value: unknown, label: string): number;
