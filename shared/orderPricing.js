// The single authoritative order-pricing contract, shared by the API and by the
// device-mode local engine.
//
// This lives in shared/ rather than in api/_actions.js because there are now two
// places an order can be persisted: the server, and a tester's browser. Two
// implementations of a money rule is how a rounding difference becomes a
// reconciliation problem nobody can explain later, so there is exactly one.
//
// Note the deliberate difference from src/lib/kitchen.ts's computeOrderPricing:
// that one CLAMPS bad input to zero because it renders a half-typed form on every
// keystroke. This one THROWS, because it is the gate an order must pass to be
// stored. Preview may be forgiving; persistence may not.
//
// Runtime-neutral ESM with no dependencies, so it imports cleanly into a Vercel
// function, the Express dev server, and a Vite browser bundle.

function round2(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function nonNegativeMoney(value, label) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw Object.assign(new Error(`${label} must be a number of zero or greater.`), { statusCode: 400 });
  }
  return parsed;
}

// Every derived total is recomputed from validated raw inputs and any
// client-supplied total is ignored, so no fabricated or tampered figure can reach
// a margin calculation. netTotal is the ex-tax, ex-delivery revenue used as the
// margin base.
export function computeOrderPricing({ lines = [], deliveryFee = 0, discountAmount = 0, taxRate = 0, amountPaid = 0 } = {}) {
  const normalizedLines = (Array.isArray(lines) ? lines : []).map((line, index) => {
    const saleQuantity = nonNegativeMoney(line?.saleQuantity ?? 0, `Line ${index + 1} sale quantity`);
    const unitSellingPrice = nonNegativeMoney(line?.unitSellingPrice ?? 0, `Line ${index + 1} unit price`);
    return { saleQuantity, unitSellingPrice, lineTotal: round2(saleQuantity * unitSellingPrice) };
  });
  const subtotal = round2(normalizedLines.reduce((sum, line) => sum + line.lineTotal, 0));
  const discount = Math.min(round2(nonNegativeMoney(discountAmount, "Discount")), subtotal);
  const netTotal = round2(subtotal - discount);
  const rate = nonNegativeMoney(taxRate, "Tax rate");
  const taxAmount = round2((netTotal * rate) / 100);
  const delivery = round2(nonNegativeMoney(deliveryFee, "Delivery fee"));
  const grossTotal = round2(netTotal + taxAmount + delivery);
  const paid = round2(nonNegativeMoney(amountPaid, "Amount paid"));
  return {
    lines: normalizedLines,
    subtotal,
    discountAmount: discount,
    deliveryFee: delivery,
    taxRate: rate,
    taxAmount,
    netTotal,
    grossTotal,
    amountPaid: paid,
    balance: round2(grossTotal - paid),
    hasPricing: normalizedLines.some((line) => line.unitSellingPrice > 0)
  };
}

export { round2, nonNegativeMoney };
