import "dotenv/config";
import express from "express";
import { neon } from "@neondatabase/serverless";
import bcrypt from "bcryptjs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { handleAction, produceOrder, sendResendEmail } from "../api/_actions.js";
import {
  GENERIC_RESET_FAILURE,
  GENERIC_RESET_RESPONSE,
  RESET_UNAVAILABLE,
  consumeResetToken,
  issueResetToken,
  normalizeEmail,
  padResponseTime,
  resetEmailBody,
  resetDeliveryConfigured,
  resetLinkFor,
  revokeSessionsAfterReset
} from "../api/_passwordReset.js";
import { validatePasswordStrength } from "../shared/policy.js";
import { authenticateRequest, bearerCompatEnabled, createSessionToken, enforceRequestCsrf } from "../api/_auth.js";
import {
  clearSessionCookie,
  issueSession,
  originAllowed,
  readSessionCookie,
  revokeSession,
  setSessionCookie
} from "../api/_sessions.js";
import { loadAuthenticatedKitchenSnapshot } from "../api/bootstrap.js";
import { sendError, setPrivateNoStore } from "../api/_db.js";
import { enforceAuthRateLimit, rateLimit, rateLimitKey, sendRateLimit } from "../api/_rateLimit.js";
import { isMissingColumn, normalizeDataMode } from "../api/_runtime.js";
import {
  SIGNUP_INVITE_REJECTED,
  SIGNUP_UNAVAILABLE,
  inviteCodeMatches,
  performSignup,
  signupConfigured,
  validateSignupInput
} from "../api/_signup.js";

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
    const loginLimit = await enforceAuthRateLimit(sql, req, {
      scope: "auth.login",
      identity: email || "missing-email",
      limit: 5,
      windowMs: 60 * 1000
    });
    if (loginLimit.limited) {
      sendRateLimit(res, loginLimit);
      return;
    }
    let user;
    try {
      user = first(await sql`
        select id, email, full_name, role, password_hash, data_mode
        from app_users
        where lower(email) = lower(${email}) and coalesce(active, true) = true
        limit 1
      `);
    } catch (error) {
      if (!isMissingColumn(error, "data_mode")) throw error;
      user = first(await sql`
        select id, email, full_name, role, password_hash
        from app_users
        where lower(email) = lower(${email}) and coalesce(active, true) = true
        limit 1
      `);
    }
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }
    const presented = readSessionCookie(req);
    if (presented) await revokeSession(sql, presented, "login-rotation");
    const session = await issueSession(sql, user, req);
    setSessionCookie(res, session.token, { maxAgeSeconds: session.ttlSeconds });
    res.json({
      id: user.id,
      email: user.email,
      fullName: user.full_name,
      role: user.role,
      dataMode: normalizeDataMode(user.data_mode),
      csrfToken: session.csrfToken,
      ...(bearerCompatEnabled() ? { token: createSessionToken(user) } : {})
    });
  } catch (error) {
    next(error);
  }
});

// Phase 016 signup, mirrored from api/auth/signup.js. The guards themselves live
// in the shared modules this file already imports, so only the route wiring is
// duplicated here.
app.post("/api/auth/signup", requireDatabase, async (req, res, next) => {
  try {
    setPrivateNoStore(res);
    if (!signupConfigured()) {
      res.status(503).json({ error: SIGNUP_UNAVAILABLE });
      return;
    }
    const limit = await enforceAuthRateLimit(sql, req, {
      scope: "auth.signup",
      identity: "",
      limit: 5,
      windowMs: 15 * 60 * 1000
    });
    if (limit.limited) {
      sendRateLimit(res, limit);
      return;
    }
    if (!inviteCodeMatches(req.body?.inviteCode)) {
      res.status(403).json({ error: SIGNUP_INVITE_REJECTED });
      return;
    }
    const input = validateSignupInput(req.body ?? {});
    if (input.error) {
      res.status(400).json({ error: input.error });
      return;
    }
    const { user, session } = await performSignup(sql, req, { ...input, password: req.body.password });
    setSessionCookie(res, session.token, { maxAgeSeconds: session.ttlSeconds });
    res.json({
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      dataMode: user.dataMode,
      csrfToken: session.csrfToken
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/auth/session", requireDatabase, async (req, res, next) => {
  try {
    setPrivateNoStore(res);
    res.setHeader("Vary", "Cookie");
    const actor = await authenticateRequest(sql, req);
    if (!actor) {
      if (readSessionCookie(req)) clearSessionCookie(res);
      res.status(401).json({ error: "Sign in again to continue.", authenticated: false });
      return;
    }
    res.json({
      authenticated: true,
      user: { id: actor.sub, email: actor.email, fullName: actor.fullName, role: actor.role, dataMode: normalizeDataMode(actor.dataMode) },
      csrfToken: actor.csrfToken ?? null,
      via: actor.via ?? "cookie"
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/auth/logout", requireDatabase, async (req, res, next) => {
  try {
    setPrivateNoStore(res);
    const presented = readSessionCookie(req);
    if (presented && !originAllowed(req)) {
      res.status(403).json({ error: "This request did not come from the Kitchen OS app." });
      return;
    }
    if (presented) await revokeSession(sql, presented, "logout");
    clearSessionCookie(res);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.post("/api/auth/reset-request", requireDatabase, async (req, res, next) => {
  const startedAt = Date.now();
  try {
    setPrivateNoStore(res);
    if (!resetDeliveryConfigured()) {
      res.status(503).json({ error: RESET_UNAVAILABLE });
      return;
    }
    const email = normalizeEmail(req.body?.email);
    const limit = await enforceAuthRateLimit(sql, req, {
      scope: "auth.resetRequest",
      identity: email || "missing-email",
      limit: 3,
      windowMs: 15 * 60 * 1000
    });
    if (limit.limited) {
      sendRateLimit(res, limit);
      return;
    }
    if (email) {
      const user = first(await sql`
        select id, email, full_name
        from app_users
        where lower(email) = ${email} and coalesce(active, true) = true
        limit 1
      `);
      if (user) {
        const token = await issueResetToken(sql, user, req);
        const delivery = await sendResendEmail({
          to: user.email,
          subject: "Reset your Pastry County Kitchen OS password",
          text: resetEmailBody(resetLinkFor(token, req))
        });
        if (delivery.status !== "sent") {
          console.warn(`[password-reset] delivery not completed: ${delivery.status}`);
          console.log(`[password-reset] development link: ${resetLinkFor(token, req)}`);
        }
      }
    }
    await padResponseTime(startedAt);
    res.json(GENERIC_RESET_RESPONSE);
  } catch (error) {
    next(error);
  }
});

app.post("/api/auth/reset-confirm", requireDatabase, async (req, res, next) => {
  try {
    setPrivateNoStore(res);
    const token = String(req.body?.token ?? "");
    const password = String(req.body?.password ?? "");
    const limit = await enforceAuthRateLimit(sql, req, {
      scope: "auth.resetConfirm",
      identity: token.slice(0, 12) || "missing-token",
      limit: 5,
      windowMs: 15 * 60 * 1000
    });
    if (limit.limited) {
      sendRateLimit(res, limit);
      return;
    }
    const strengthError = validatePasswordStrength(password);
    if (strengthError) {
      res.status(400).json({ error: strengthError });
      return;
    }
    const userId = await consumeResetToken(sql, token);
    if (!userId) {
      res.status(400).json({ error: GENERIC_RESET_FAILURE });
      return;
    }
    await sql`
      update app_users set password_hash = ${bcrypt.hashSync(password, 10)}, updated_at = now()
      where id = ${userId}
    `;
    await revokeSessionsAfterReset(sql, userId);
    clearSessionCookie(res);
    res.json({ ok: true, message: "Password updated. Sign in with your new password." });
  } catch (error) {
    next(error);
  }
});

app.get("/api/bootstrap", requireDatabase, async (req, res, next) => {
  try {
    setPrivateNoStore(res);
    res.setHeader("Vary", "Cookie");
    res.json(await loadAuthenticatedKitchenSnapshot(req));
  } catch (error) {
    next(error);
  }
});

app.post("/api/actions", requireDatabase, async (req, res, next) => {
  try {
    setPrivateNoStore(res);
    res.setHeader("Vary", "Cookie");
    const actor = await authenticateRequest(sql, req);
    enforceRequestCsrf(req, actor);
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
    const actor = await authenticateRequest(sql, req);
    enforceRequestCsrf(req, actor);
    res.json(await produceOrder(sql, orderId, actor, req.body?.qcLog ?? {}));
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
