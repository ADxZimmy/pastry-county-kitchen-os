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
