import { config } from "dotenv";
import { neon } from "@neondatabase/serverless";

config({ path: ".env.local" });
config({ path: ".env.production.local" });
config();

const apply = process.env.FEFO_RECONCILE_APPLY === "1";

function id(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function planDeductions(batches, quantity) {
  let remaining = Number(quantity);
  return batches.flatMap((batch) => {
    if (remaining <= 0) return [];
    const take = Math.min(remaining, Number(batch.quantity_remaining ?? 0));
    remaining -= take;
    return take > 0 ? [{ batchId: batch.id, quantity: take }] : [];
  });
}

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required. Load an ignored env file such as .env.production.local before running this script.");
}

const sql = neon(process.env.DATABASE_URL);

const mismatches = await sql`
  select ingredients.id, ingredients.name, ingredients.base_unit,
    ingredients.current_stock::float as current_stock,
    coalesce(sum(ingredient_batches.quantity_remaining) filter (where ingredient_batches.unit = ingredients.base_unit), 0)::float as lot_remaining
  from ingredients
  left join ingredient_batches on ingredient_batches.ingredient_id = ingredients.id and ingredient_batches.quantity_remaining > 0
  where ingredients.active = true
  group by ingredients.id, ingredients.name, ingredients.base_unit, ingredients.current_stock
  having coalesce(sum(ingredient_batches.quantity_remaining) filter (where ingredient_batches.unit = ingredients.base_unit), 0) > ingredients.current_stock + 0.001
  order by ingredients.name
`;

if (!mismatches.length) {
  console.log("No FEFO lot overstatements found.");
  process.exit(0);
}

for (const mismatch of mismatches) {
  const excess = Number(mismatch.lot_remaining) - Number(mismatch.current_stock);
  const batches = await sql`
    select id, quantity_remaining::float as quantity_remaining
    from ingredient_batches
    where ingredient_id = ${mismatch.id}
      and unit = ${mismatch.base_unit}
      and quantity_remaining > 0
    order by expiry_date nulls last, received_date, created_at
  `;
  const deductions = planDeductions(batches, excess);
  console.log(`${apply ? "Repairing" : "Would repair"} ${mismatch.name}: lots exceed current stock by ${excess}${mismatch.base_unit}.`);
  console.log(JSON.stringify({ ingredientId: mismatch.id, currentStock: mismatch.current_stock, lotRemaining: mismatch.lot_remaining, deductions }, null, 2));

  if (!apply) continue;

  const beforeData = {
    current_stock: mismatch.current_stock,
    base_unit: mismatch.base_unit,
    lot_remaining_before: mismatch.lot_remaining
  };
  const afterData = {
    current_stock: mismatch.current_stock,
    base_unit: mismatch.base_unit,
    lot_remaining_after: mismatch.current_stock,
    reconciled_excess: excess,
    deductions
  };

  await sql.transaction((txn) => [
    ...deductions.map((deduction) => txn`
      update ingredient_batches
      set quantity_remaining = greatest(0, quantity_remaining - ${deduction.quantity}), updated_at = now()
      where id = ${deduction.batchId}
    `),
    txn`
      insert into inventory_movements (id, ingredient_id, movement_type, quantity_change, unit, note, created_by)
      values (${id("mov-fefo-reconcile")}, ${mismatch.id}, 'correction', 0, ${mismatch.base_unit}, 'Reconciled FEFO lot remaining quantity to current stock after audit repair', 'system')
    `,
    txn`
      insert into audit_logs (id, entity_type, entity_id, action, before_data, after_data, actor)
      values (${id("audit-fefo-reconcile")}, 'ingredients', ${mismatch.id}, 'fefo_reconcile', ${JSON.stringify(beforeData)}, ${JSON.stringify(afterData)}, 'system')
    `
  ]);
}

if (!apply) {
  console.log("Dry run only. Re-run with FEFO_RECONCILE_APPLY=1 to apply these repairs.");
}
