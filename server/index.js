import "dotenv/config";
import express from "express";
import { neon } from "@neondatabase/serverless";
import bcrypt from "bcryptjs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadKitchenSnapshot } from "../api/_db.js";
import { handleAction } from "../api/_actions.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const app = express();
const port = Number(process.env.PORT ?? 5174);

if (!process.env.DATABASE_URL) {
  console.warn("DATABASE_URL is not set. API routes will return a setup error.");
}

const sql = process.env.DATABASE_URL ? neon(process.env.DATABASE_URL) : null;

app.use(express.json({ limit: "1mb" }));

function requireDatabase(_req, res, next) {
  if (!sql) {
    res.status(503).json({
      error: "DATABASE_URL is not configured. Create a Neon database, apply db/schema.sql and db/seed.sql, then set DATABASE_URL."
    });
    return;
  }
  next();
}

const first = (rows) => rows[0];

app.get("/api/health", (_req, res) => {
  res.json({ ok: Boolean(sql), database: sql ? "neon" : "missing" });
});

app.post("/api/auth/login", requireDatabase, async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const user = first(await sql`
      select id, email, full_name, role, password_hash
      from app_users
      where lower(email) = lower(${email})
      limit 1
    `);
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }
    res.json({ id: user.id, email: user.email, fullName: user.full_name, role: user.role });
  } catch (error) {
    next(error);
  }
});

app.get("/api/bootstrap", requireDatabase, async (_req, res, next) => {
  try {
    res.json(await loadKitchenSnapshot());
  } catch (error) {
    next(error);
  }
});

app.post("/api/actions", requireDatabase, async (req, res, next) => {
  try {
    res.json(await handleAction(sql, req.body ?? {}));
  } catch (error) {
    next(error);
  }
});

app.post("/api/inventory-movements", requireDatabase, async (req, res, next) => {
  try {
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
    next(error);
  }
});

app.post("/api/orders/:orderId/produced", requireDatabase, async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const orderRows = await sql`select status from orders where id = ${orderId}`;
    if (!orderRows.length) {
      res.status(404).json({ error: "Order not found" });
      return;
    }
    if (orderRows[0].status === "Produced") {
      res.json({ produced: false, alreadyProduced: true });
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
    res.json({ produced: true });
  } catch (error) {
    next(error);
  }
});

app.use(express.static(path.join(rootDir, "dist")));
app.get("*", (_req, res) => {
  res.sendFile(path.join(rootDir, "dist", "index.html"));
});

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ error: error.message ?? "Unexpected server error" });
});

app.listen(port, () => {
  console.log(`Pastry County Kitchen OS API listening on http://localhost:${port}`);
});
