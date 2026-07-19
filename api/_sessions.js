import crypto from "node:crypto";
import { isProductionRuntime, sessionSecret } from "./_runtime.js";

// Production uses the __Host- prefix, which browsers only accept when the cookie
// is Secure, Path=/, and carries no Domain. Local development is plain http, so
// it gets a separate name rather than weakening the production cookie.
const PRODUCTION_COOKIE = "__Host-pcko_session";
const DEVELOPMENT_COOKIE = "pcko_session_dev";
const CSRF_HEADER = "x-csrf-token";
const SESSION_TTL_SECONDS = 60 * 60 * 12;
const TOUCH_INTERVAL = "15 minutes";
const UNDEFINED_TABLE = "42P01";

export function sessionCookieName(production = isProductionRuntime()) {
  return production ? PRODUCTION_COOKIE : DEVELOPMENT_COOKIE;
}

export function sessionTtlSeconds() {
  return SESSION_TTL_SECONDS;
}

export function parseCookies(header) {
  const jar = {};
  if (!header) return jar;
  for (const part of String(header).split(";")) {
    const index = part.indexOf("=");
    if (index < 1) continue;
    const name = part.slice(0, index).trim();
    if (!name || Object.prototype.hasOwnProperty.call(jar, name)) continue;
    try {
      jar[name] = decodeURIComponent(part.slice(index + 1).trim());
    } catch {
      jar[name] = part.slice(index + 1).trim();
    }
  }
  return jar;
}

export function headerValue(req, name) {
  const headers = req?.headers ?? {};
  const value = headers[name] ?? headers[name.toLowerCase()] ?? headers[name.toUpperCase()];
  return Array.isArray(value) ? value[0] : value ? String(value) : "";
}

export function readSessionCookie(req, production = isProductionRuntime()) {
  const jar = parseCookies(headerValue(req, "cookie"));
  return jar[sessionCookieName(production)] || "";
}

export function serializeSessionCookie(token, { production = isProductionRuntime(), maxAgeSeconds = SESSION_TTL_SECONDS } = {}) {
  const parts = [`${sessionCookieName(production)}=${token}`, "Path=/", "HttpOnly", "SameSite=Lax", `Max-Age=${maxAgeSeconds}`];
  if (production) parts.push("Secure");
  return parts.join("; ");
}

export function clearedSessionCookie({ production = isProductionRuntime() } = {}) {
  return serializeSessionCookie("", { production, maxAgeSeconds: 0 });
}

export function setSessionCookie(res, token, options = {}) {
  res.setHeader("Set-Cookie", serializeSessionCookie(token, options));
}

export function clearSessionCookie(res, options = {}) {
  res.setHeader("Set-Cookie", clearedSessionCookie(options));
}

function randomToken() {
  return crypto.randomBytes(32).toString("base64url");
}

export function hashSessionToken(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}

// Client addresses are kept only as a keyed hash so a database dump cannot be
// turned back into a list of who signed in from where.
function hashIdentity(value) {
  if (!value) return null;
  return crypto.createHmac("sha256", sessionSecret()).update(String(value)).digest("hex").slice(0, 32);
}

// The session table is created on first login, so any session operation can run
// before it exists on a freshly deployed database. That must degrade to "no
// session", never to a 500.
export function isUndefinedTableError(error) {
  return error?.code === UNDEFINED_TABLE || /relation .*app_sessions.* does not exist/i.test(String(error?.message ?? ""));
}

export function timingSafeEquals(a, b) {
  const left = Buffer.from(String(a ?? ""), "utf8");
  const right = Buffer.from(String(b ?? ""), "utf8");
  if (left.length !== right.length || left.length === 0) return false;
  return crypto.timingSafeEqual(left, right);
}

export async function ensureSessionTables(sql) {
  await sql`
    create table if not exists app_sessions (
      id text primary key,
      user_id text not null references app_users(id),
      token_hash text not null unique,
      csrf_token text not null,
      created_at timestamptz not null default now(),
      last_seen_at timestamptz not null default now(),
      expires_at timestamptz not null,
      revoked_at timestamptz,
      revoked_reason text,
      user_agent text,
      ip_hash text
    )
  `;
  await sql`create index if not exists app_sessions_user_id_idx on app_sessions (user_id)`;
  await sql`create index if not exists app_sessions_expires_at_idx on app_sessions (expires_at)`;
}

export async function issueSession(sql, user, req = {}, { ttlSeconds = SESSION_TTL_SECONDS } = {}) {
  const token = randomToken();
  const csrfToken = randomToken();
  const id = `ses-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
  const userAgent = headerValue(req, "user-agent").slice(0, 256) || null;
  const forwarded = headerValue(req, "x-forwarded-for").split(",")[0].trim();
  const ipHash = hashIdentity(forwarded || req?.socket?.remoteAddress || "");
  await sql`
    insert into app_sessions (id, user_id, token_hash, csrf_token, expires_at, user_agent, ip_hash)
    values (${id}, ${user.id}, ${hashSessionToken(token)}, ${csrfToken},
      now() + ${`${ttlSeconds} seconds`}::interval, ${userAgent}, ${ipHash})
  `;
  return { id, token, csrfToken, ttlSeconds };
}

// Returns an actor in the same shape the bearer path produces so every
// downstream permission, audit, and attribution path stays unchanged.
export async function resolveSession(sql, token) {
  if (!token) return null;
  let rows;
  try {
    rows = await sql`
      with touched as (
        update app_sessions set last_seen_at = now()
        where token_hash = ${hashSessionToken(token)}
          and revoked_at is null
          and last_seen_at < now() - ${TOUCH_INTERVAL}::interval
        returning id
      )
      select app_sessions.id as "sessionId", app_sessions.user_id as "userId", app_sessions.csrf_token as "csrfToken",
        app_sessions.revoked_at as "revokedAt",
        app_sessions.expires_at < now() as expired,
        extract(epoch from app_sessions.created_at)::bigint as "issuedAt",
        app_users.email, app_users.full_name as "fullName", app_users.role, app_users.active,
        extract(epoch from app_users.session_revoked_at)::bigint as "userRevokedAt"
      from app_sessions
      join app_users on app_users.id = app_sessions.user_id
      where app_sessions.token_hash = ${hashSessionToken(token)}
      limit 1
    `;
  } catch (error) {
    // Before the first login on a fresh deployment the table may not exist yet.
    // Treat that as "no session" rather than failing the whole request.
    if (isUndefinedTableError(error)) return null;
    throw error;
  }
  const row = rows[0];
  if (!row) return null;
  if (row.revokedAt || row.expired) return null;
  if (row.active === false) return null;
  // A staff "revoke sessions" or disable action stamps app_users.session_revoked_at;
  // any session issued at or before that moment is dead, cookie or bearer alike.
  if (Number(row.userRevokedAt ?? 0) && Number(row.issuedAt ?? 0) <= Number(row.userRevokedAt)) return null;
  return {
    sub: row.userId,
    email: row.email,
    fullName: row.fullName,
    role: row.role,
    iat: Number(row.issuedAt ?? 0),
    sessionId: row.sessionId,
    csrfToken: row.csrfToken,
    via: "cookie"
  };
}

export async function revokeSession(sql, token, reason = "logout") {
  if (!token) return false;
  try {
    const rows = await sql`
      update app_sessions set revoked_at = now(), revoked_reason = ${reason}
      where token_hash = ${hashSessionToken(token)} and revoked_at is null
      returning id
    `;
    return rows.length > 0;
  } catch (error) {
    if (isUndefinedTableError(error)) return false;
    throw error;
  }
}

export async function revokeAllUserSessions(sql, userId, reason = "revoked") {
  if (!userId) return 0;
  try {
    const rows = await sql`
      update app_sessions set revoked_at = now(), revoked_reason = ${reason}
      where user_id = ${userId} and revoked_at is null
      returning id
    `;
    return rows.length;
  } catch (error) {
    if (isUndefinedTableError(error)) return 0;
    throw error;
  }
}

export async function deleteExpiredSessions(sql, { retainDays = 7 } = {}) {
  try {
    const rows = await sql`
      delete from app_sessions
      where expires_at < now() - ${`${retainDays} days`}::interval
      returning id
    `;
    return rows.length;
  } catch (error) {
    if (isUndefinedTableError(error)) return 0;
    throw error;
  }
}

export function isSafeMethod(method) {
  return ["GET", "HEAD", "OPTIONS"].includes(String(method || "GET").toUpperCase());
}

export function requestHostOrigins(req) {
  const proto = (headerValue(req, "x-forwarded-proto").split(",")[0] || (isProductionRuntime() ? "https" : "http")).trim();
  const hosts = [headerValue(req, "x-forwarded-host"), headerValue(req, "host")].filter(Boolean);
  const origins = hosts.map((host) => `${proto}://${host.split(",")[0].trim()}`);
  const configured = String(process.env.APP_ORIGIN || "").trim();
  if (configured) origins.push(configured.replace(/\/$/, ""));
  return origins;
}

export function requestOrigin(req) {
  const origin = headerValue(req, "origin");
  if (origin && origin !== "null") return origin.replace(/\/$/, "");
  const referer = headerValue(req, "referer");
  if (!referer) return "";
  try {
    return new URL(referer).origin;
  } catch {
    return "";
  }
}

export function originAllowed(req) {
  const origin = requestOrigin(req);
  // A browser always sends Origin or Referer on a cross-site mutating request,
  // so a missing value here means the request is not the kind CSRF exploits use.
  if (!origin) return false;
  return requestHostOrigins(req).includes(origin);
}

export function csrfTokenFromRequest(req) {
  return headerValue(req, CSRF_HEADER);
}

// Cookies ride along automatically, so a cookie-authenticated mutation must also
// prove same-origin intent. Bearer credentials are attached deliberately by a
// script and are not subject to CSRF.
export function csrfViolation(req, actor) {
  if (!actor || actor.via !== "cookie") return null;
  if (isSafeMethod(req?.method)) return null;
  if (!originAllowed(req)) {
    return { message: "This request did not come from the Kitchen OS app. Refresh the page and try again.", statusCode: 403 };
  }
  if (!timingSafeEquals(csrfTokenFromRequest(req), actor.csrfToken)) {
    return { message: "Your security token is missing or stale. Refresh the page and try again.", statusCode: 403 };
  }
  return null;
}

export const csrfHeaderName = CSRF_HEADER;
