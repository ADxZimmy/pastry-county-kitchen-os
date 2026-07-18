import crypto from "node:crypto";
import { isProductionRuntime, sessionSecret, sessionSecretConfigured } from "./_runtime.js";
import { csrfViolation, readSessionCookie, resolveSession } from "./_sessions.js";

const roles = new Set(["Owner/Admin", "Baker", "Inventory Manager", "Viewer"]);

// Re-exported so existing importers keep a single auth entry point.
export { isProductionRuntime, sessionSecret, sessionSecretConfigured };

// Bearer tokens are the pre-Phase-011 credential. They stay accepted only while
// the smoke harness and any signed-in operator migrate to cookies; Phase 011
// closes with this off. Removal criteria are recorded in the phase VERIFICATION.
const BEARER_COMPAT_DEFAULT = true;

export function bearerCompatEnabled() {
  const flag = String(process.env.AUTH_BEARER_COMPAT || "").trim().toLowerCase();
  if (flag === "off" || flag === "false" || flag === "0") return false;
  if (flag === "on" || flag === "true" || flag === "1") return true;
  return BEARER_COMPAT_DEFAULT;
}

function encode(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function sign(payload) {
  return crypto.createHmac("sha256", sessionSecret()).update(payload).digest("base64url");
}

export function createSessionToken(user) {
  const issuedAt = Math.floor(Date.now() / 1000);
  const payload = encode({
    sub: user.id,
    email: user.email,
    role: roles.has(user.role) ? user.role : "Viewer",
    iat: issuedAt,
    exp: issuedAt + 60 * 60 * 12
  });
  return `${payload}.${sign(payload)}`;
}

export function verifySessionToken(token) {
  if (!token || !token.includes(".")) return null;
  const [payload, signature] = token.split(".");
  const expected = sign(payload);
  try {
    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
    const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!session.exp || session.exp < Math.floor(Date.now() / 1000)) return null;
    if (!roles.has(session.role)) return null;
    return session;
  } catch {
    return null;
  }
}

export function actorFromRequest(req) {
  if (!bearerCompatEnabled()) return null;
  const header = req.headers.authorization || req.headers.Authorization || "";
  const token = String(header).replace(/^Bearer\s+/i, "");
  const actor = verifySessionToken(token);
  return actor ? { ...actor, via: "bearer" } : null;
}

// Cookies are the real mechanism; bearer is the compatibility window.
//
// While that window is open a valid bearer credential wins, because during the
// rollout a browser holds BOTH: it still sends its pre-Phase-011 bearer token and
// now also receives the new cookie. Resolving the cookie first would classify
// those requests as cookie-authenticated and demand a CSRF header the shipped
// frontend does not send yet — every write would 403. A bearer token is attached
// deliberately by a script or the app, never automatically by the browser, so
// preferring it here costs nothing in CSRF terms: a forged cross-site request
// carries only the cookie and still lands on the enforced path below.
//
// Once the compatibility flag is off this is cookie-only, and the ordering
// question disappears with it.
export async function authenticateRequest(sql, req) {
  if (bearerCompatEnabled()) {
    const bearerActor = actorFromRequest(req);
    if (bearerActor) return bearerActor;
  }
  const cookieToken = readSessionCookie(req);
  if (cookieToken) return await resolveSession(sql, cookieToken);
  return null;
}

export function enforceRequestCsrf(req, actor) {
  const violation = csrfViolation(req, actor);
  if (violation) throw Object.assign(new Error(violation.message), { statusCode: violation.statusCode });
  return actor;
}

export function sessionAccessError(actor, userRow) {
  if (!actor) return { message: "Sign in again to continue.", statusCode: 401 };
  if (!userRow || userRow.active === false) return { message: "This user session is no longer active.", statusCode: 401 };
  const revokedAt = Number(userRow.revoked_at ?? userRow.revokedAt ?? 0);
  if (revokedAt && Number(actor.iat ?? 0) <= revokedAt) return { message: "This session was revoked. Sign in again.", statusCode: 401 };
  return null;
}

export async function ensureSessionColumns(sql) {
  await sql`alter table app_users add column if not exists active boolean not null default true`;
  await sql`alter table app_users add column if not exists session_revoked_at timestamptz`;
}

export async function requireActiveSession(sql, actor) {
  const missingActorError = sessionAccessError(actor, { active: true });
  if (missingActorError) throw Object.assign(new Error(missingActorError.message), { statusCode: missingActorError.statusCode });

  await ensureSessionColumns(sql);
  const rows = await sql`
    select id, email, full_name as "fullName", role, active,
      extract(epoch from session_revoked_at)::bigint as revoked_at
    from app_users
    where id = ${actor.sub}
    limit 1
  `;
  const sessionError = sessionAccessError(actor, rows[0]);
  if (sessionError) throw Object.assign(new Error(sessionError.message), { statusCode: sessionError.statusCode });
  const user = rows[0];
  return {
    ...actor,
    email: user.email,
    fullName: user.fullName,
    role: roles.has(user.role) ? user.role : actor.role
  };
}
