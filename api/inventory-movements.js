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
    const ingredientRows = await sql`select current_stock::float as current_stock from ingredients where id = ${ingredientId}`;
    if (!ingredientRows.length) {
      res.status(404).json({ error: "Ingredient not found" });
      return;
    }
    if (Number(ingredientRows[0].current_stock) + Number(quantityChange) < 0) {
      res.status(400).json({ error: "Adjustment would make stock negative." });
      return;
    }
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
