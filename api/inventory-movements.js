import { first, getSql, sendError } from "./_db.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const sql = getSql();
    const { ingredientId, movementType, quantityChange, unit, note, createdBy = "system" } = req.body;
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
      `
    ]);
    res.status(201).json({ id: first(movementRows).id });
  } catch (error) {
    sendError(res, error);
  }
}
