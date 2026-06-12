import { first, getSql, sendError } from "./_db.js";

function planBatchDeductions(batches, quantity) {
  let remaining = Number(quantity);
  return batches.flatMap((batch) => {
    if (remaining <= 0) return [];
    const take = Math.min(remaining, Number(batch.quantity_remaining ?? 0));
    remaining -= take;
    return take > 0 ? [{ batchId: batch.id, quantity: take }] : [];
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const sql = getSql();
    const { ingredientId, movementType, quantityChange, unit, note, createdBy = "system" } = req.body;
    const ingredientRows = await sql`select current_stock::float as current_stock from ingredients where id = ${ingredientId}`;
    if (!ingredientRows.length) {
      res.status(404).json({ error: "Ingredient not found" });
      return;
    }
    if (Number(ingredientRows[0].current_stock) + Number(quantityChange) < 0) {
      res.status(400).json({ error: "Adjustment would make stock negative." });
      return;
    }
    const batchRows = Number(quantityChange) < 0 ? await sql`
      select id, quantity_remaining::float as quantity_remaining
      from ingredient_batches
      where ingredient_id = ${ingredientId}
        and unit = ${unit}
        and quantity_remaining > 0
      order by expiry_date nulls last, received_date, created_at
    ` : [];
    const batchDeductions = planBatchDeductions(batchRows, Math.abs(Number(quantityChange)));
    const [movementRows] = await sql.transaction((txn) => [
      txn`
        insert into inventory_movements (id, ingredient_id, movement_type, quantity_change, unit, note, created_by)
        values (${`mov-${Date.now()}`}, ${ingredientId}, ${movementType}, ${quantityChange}, ${unit}, ${note}, ${createdBy})
        returning id
      `,
      txn`
        update ingredients
        set current_stock = current_stock + ${quantityChange}, updated_at = now()
        where id = ${ingredientId}
      `,
      ...batchDeductions.map((deduction) => txn`
        update ingredient_batches
        set quantity_remaining = greatest(0, quantity_remaining - ${deduction.quantity}), updated_at = now()
        where id = ${deduction.batchId}
      `)
    ]);
    res.status(201).json({ id: first(movementRows).id });
  } catch (error) {
    sendError(res, error);
  }
}
