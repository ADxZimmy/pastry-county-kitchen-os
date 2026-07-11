import "dotenv/config";
import express from "express";
import { neon } from "@neondatabase/serverless";
import bcrypt from "bcryptjs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { handleAction, produceOrder } from "../api/_actions.js";
import { actorFromRequest, createSessionToken } from "../api/_auth.js";
import { loadAuthenticatedKitchenSnapshot } from "../api/bootstrap.js";
import { sendError, setPrivateNoStore } from "../api/_db.js";
import { rateLimit, rateLimitKey, sendRateLimit } from "../api/_rateLimit.js";

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
    setPrivateNoStore(res);
    const { email, password } = req.body;
    const loginLimit = rateLimit({
      key: rateLimitKey(req, "auth.login", email || "missing-email"),
      limit: 5,
      windowMs: 60 * 1000
    });
    if (loginLimit.limited) {
      sendRateLimit(res, loginLimit);
      return;
    }
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

app.get("/api/bootstrap", requireDatabase, async (req, res, next) => {
  try {
    setPrivateNoStore(res);
    res.json(await loadAuthenticatedKitchenSnapshot(req));
  } catch (error) {
    next(error);
  }
});

app.post("/api/actions", requireDatabase, async (req, res, next) => {
  try {
    setPrivateNoStore(res);
    const actor = actorFromRequest(req);
    const actionName = req.body?.action || "unknown";
    const actionLimit = rateLimit({
      key: rateLimitKey(req, actor ? "api.actions.authenticated" : "api.actions.unauthenticated", actor?.sub || actionName),
      limit: actor ? 120 : 20,
      windowMs: 60 * 1000
    });
    if (actionLimit.limited) {
      sendRateLimit(res, actionLimit);
      return;
    }
    res.json(await handleAction(sql, req.body ?? {}, actor));
  } catch (error) {
    next(error);
  }
});

// Retired in Phase 006a: inventory changes go through the authenticated
// inventory.adjust action on POST /api/actions.
app.post("/api/inventory-movements", (_req, res) => {
  res.status(410).json({
    error: "This endpoint has been retired. Use the authenticated inventory.adjust action via POST /api/actions."
  });
});

app.post("/api/orders/:orderId/produced", requireDatabase, async (req, res, next) => {
  try {
    setPrivateNoStore(res);
    const { orderId } = req.params;
    res.json(await produceOrder(sql, orderId, actorFromRequest(req), req.body?.qcLog ?? {}));
  } catch (error) {
    next(error);
  }
});

app.use(express.static(path.join(rootDir, "dist")));
app.get("*", (_req, res) => {
  res.sendFile(path.join(rootDir, "dist", "index.html"));
});

app.use((error, _req, res, _next) => {
  sendError(res, error);
});

app.listen(port, () => {
  console.log(`Pastry County Kitchen OS API listening on http://localhost:${port}`);
});
