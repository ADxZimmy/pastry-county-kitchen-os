import { getSql, sendError } from "../../_db.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const sql = getSql();
    const { orderId } = req.query;
    const orderRows = await sql`select status from orders where id = ${orderId}`;
    if (!orderRows.length) {
      res.status(404).json({ error: "Order not found" });
      return;
    }
    if (orderRows[0].status === "Produced") {
      res.status(200).json({ produced: false, alreadyProduced: true });
      return;
    }
    const requirements = await sql`
      select ri.ingredient_id, ri.unit, sum(ri.quantity * oi.requested_yield_quantity / r.base_yield_quantity * oi.quantity_multiplier) as quantity
      from order_items oi
      join recipes r on r.id = oi.recipe_id
      join recipe_items ri on ri.recipe_id = r.id
      where oi.order_id = ${orderId}
      group by ri.ingredient_id, ri.unit
    `;
    await sql.transaction((txn) => [
      ...requirements.flatMap((requirement, index) => [
        txn`
          insert into inventory_movements (id, ingredient_id, movement_type, quantity_change, unit, related_order_id, note, created_by)
          values (${`mov-${Date.now()}-${index}`}, ${requirement.ingredient_id}, 'production_use', ${-Number(requirement.quantity)}, ${requirement.unit}, ${orderId}, 'Deducted when order was marked produced', 'system')
        `,
        txn`
          update ingredients
          set current_stock = current_stock - ${Number(requirement.quantity)},
            reserved_stock = greatest(0, reserved_stock - ${Number(requirement.quantity)}),
            updated_at = now()
          where id = ${requirement.ingredient_id}
        `
      ]),
      txn`update orders set status = 'Produced', production_status = 'Completed', updated_at = now() where id = ${orderId}`
    ]);
    res.status(200).json({ produced: true });
  } catch (error) {
    sendError(res, error);
  }
}
