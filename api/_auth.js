import crypto from "node:crypto";

const roles = new Set(["Owner/Admin", "Baker", "Inventory Manager", "Viewer"]);

function sessionSecret() {
  return process.env.SESSION_SECRET || process.env.DATABASE_URL || "pastry-county-dev-session";
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
  const header = req.headers.authorization || req.headers.Authorization || "";
  const token = String(header).replace(/^Bearer\s+/i, "");
  return verifySessionToken(token);
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
