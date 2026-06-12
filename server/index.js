import "dotenv/config";
import express from "express";
import { neon } from "@neondatabase/serverless";
import bcrypt from "bcryptjs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadKitchenSnapshot } from "../api/_db.js";
import { handleAction, produceOrder } from "../api/_actions.js";
import { actorFromRequest, createSessionToken } from "../api/_auth.js";

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

function planBatchDeductions(batches, quantity) {
  let remaining = Number(quantity);
  return batches.flatMap((batch) => {
    if (remaining <= 0) return [];
    const take = Math.min(remaining, Number(batch.quantity_remaining ?? 0));
    remaining -= take;
    return take > 0 ? [{ batchId: batch.id, quantity: take }] : [];
  });
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: Boolean(sql), database: sql ? "neon" : "missing" });
});

app.post("/api/auth/login", requireDatabase, async (req, res, next) => {
  try {
    const { email, password } = req.body;
    await sql`alter table app_users add column if not exists active boolean not null default true`;
    await sql`alter table app_users add column if not exists session_revoked_at timestamptz`;
    const user = first(await sql`
      select id, email, full_name, role, password_hash
      from app_users
      where lower(email) = lower(${email}) and coalesce(active, true) = true
      limit 1
    `);
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }
    res.json({ id: user.id, email: user.email, fullName: user.full_name, role: user.role, token: createSessionToken(user) });
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
    res.json(await handleAction(sql, req.body ?? {}, actorFromRequest(req)));
  } catch (error) {
    next(error);
  }
});

app.post("/api/inventory-movements", requireDatabase, async (req, res, next) => {
  try {
    const actor = actorFromRequest(req);
    if (!actor || !["Owner/Admin", "Inventory Manager"].includes(actor.role)) {
      res.status(actor ? 403 : 401).json({ error: actor ? `${actor.role} cannot adjust inventory.` : "Sign in again to continue." });
      return;
    }
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
    next(error);
  }
});

app.post("/api/orders/:orderId/produced", requireDatabase, async (req, res, next) => {
  try {
    const { orderId } = req.params;
    res.json(await produceOrder(sql, orderId, actorFromRequest(req)));
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
  res.status(error.statusCode ?? 500).json({ error: error.message ?? "Unexpected server error" });
});

app.listen(port, () => {
  console.log(`Pastry County Kitchen OS API listening on http://localhost:${port}`);
});
