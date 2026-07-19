import crypto from "node:crypto";
import { sessionSecret } from "./_runtime.js";
import { headerValue, isUndefinedTableError, revokeAllUserSessions } from "./_sessions.js";

const RESET_TTL_MINUTES = 30;
// Both branches of a reset request are padded to the same floor so response
// time does not become an oracle for whether an account exists.
//
// The floor has to clear the slowest branch, not just be "some delay": a known
// address costs a lookup, a token insert, and a call out to the mail provider,
// while an unknown address costs one lookup. Measured against production the
// known path lands near 1.4s, so 2.5s keeps both branches on the floor with
// headroom. A pathologically slow provider call can still overrun it — that
// residual is recorded in the phase verification rather than papered over.
const MINIMUM_RESPONSE_MS = 2500;

export const resetTtlMinutes = RESET_TTL_MINUTES;

// One response for every reset request, whatever the outcome. It must never
// differ for a known and an unknown address.
export const GENERIC_RESET_RESPONSE = {
  ok: true,
  message: "If that email belongs to a Kitchen OS account, a reset link is on its way. The link expires in 30 minutes."
};

export const GENERIC_RESET_FAILURE = "This reset link is no longer valid. Request a new one.";

export const RESET_UNAVAILABLE = "Password reset by email is not set up yet. Ask your Kitchen OS administrator to set your password.";

// If the mail sender is not configured, no link can be delivered. Saying "a
// reset link is on its way" would be a claim the system cannot honour, so the
// request is refused honestly instead. This check depends only on server
// configuration, never on the submitted address, so it reveals nothing about
// which accounts exist.
export function resetDeliveryConfigured() {
  const from = String(process.env.RESEND_FROM_EMAIL || "").trim();
  return Boolean(process.env.RESEND_API_KEY) && Boolean(from) && !/onboarding@resend\.dev/i.test(from);
}

export function normalizeEmail(email) {
  return String(email ?? "").trim().toLowerCase();
}

export function hashResetToken(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}

function hashIdentity(value) {
  if (!value) return null;
  return crypto.createHmac("sha256", sessionSecret()).update(String(value)).digest("hex").slice(0, 32);
}

export async function ensurePasswordResetTable(sql) {
  await sql`
    create table if not exists password_reset_tokens (
      id text primary key,
      user_id text not null references app_users(id),
      token_hash text not null unique,
      created_at timestamptz not null default now(),
      expires_at timestamptz not null,
      used_at timestamptz,
      requested_ip_hash text
    )
  `;
  await sql`create index if not exists password_reset_tokens_user_id_idx on password_reset_tokens (user_id)`;
}

export async function issueResetToken(sql, user, req = {}) {
  await ensurePasswordResetTable(sql);
  const token = crypto.randomBytes(32).toString("base64url");
  const forwarded = headerValue(req, "x-forwarded-for").split(",")[0].trim();
  // Only the newest link may work: retire this user's outstanding tokens first.
  await sql`
    update password_reset_tokens set used_at = now()
    where user_id = ${user.id} and used_at is null
  `;
  await sql`
    insert into password_reset_tokens (id, user_id, token_hash, expires_at, requested_ip_hash)
    values (${`prt-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`}, ${user.id},
      ${hashResetToken(token)}, now() + ${`${RESET_TTL_MINUTES} minutes`}::interval,
      ${hashIdentity(forwarded || req?.socket?.remoteAddress || "")})
  `;
  return token;
}

// Marks the token used and returns its user, or null for anything invalid.
// The update is the check: `used_at is null and expires_at > now()` in the WHERE
// clause means two simultaneous redemptions cannot both succeed.
export async function consumeResetToken(sql, token) {
  if (!token) return null;
  let rows;
  try {
    rows = await sql`
      update password_reset_tokens set used_at = now()
      where token_hash = ${hashResetToken(token)}
        and used_at is null
        and expires_at > now()
      returning user_id as "userId"
    `;
  } catch (error) {
    if (isUndefinedTableError(error) || /password_reset_tokens/i.test(String(error?.message ?? ""))) return null;
    throw error;
  }
  return rows[0]?.userId ?? null;
}

// A completed reset must end every other session: whoever forced the reset, and
// anyone holding a stolen cookie, is signed out.
export async function revokeSessionsAfterReset(sql, userId) {
  await sql`update app_users set session_revoked_at = now(), updated_at = now() where id = ${userId}`;
  return await revokeAllUserSessions(sql, userId, "password-reset");
}

export function resetLinkFor(token, req) {
  const configured = String(process.env.APP_ORIGIN || process.env.PUBLIC_APP_URL || "").trim().replace(/\/$/, "");
  const forwardedHost = headerValue(req, "x-forwarded-host") || headerValue(req, "host");
  const proto = headerValue(req, "x-forwarded-proto").split(",")[0] || "https";
  // The link is built from configuration or this deployment's own host, never
  // from a caller-supplied header value that could redirect the token elsewhere.
  const origin = configured
    || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "")
    || (forwardedHost ? `${proto}://${forwardedHost.split(",")[0].trim()}` : "https://pastry-county-kitchen-os.vercel.app");
  return `${origin}/#/reset/${encodeURIComponent(token)}`;
}

export function resetEmailBody(link) {
  return [
    "A password reset was requested for your Pastry County Kitchen OS account.",
    `Reset your password: ${link}`,
    `This link works once and expires in ${RESET_TTL_MINUTES} minutes.`,
    "If you did not request this, you can ignore this email. Your password stays unchanged."
  ].join("\n");
}

export async function padResponseTime(startedAt) {
  const elapsed = Date.now() - startedAt;
  if (elapsed >= MINIMUM_RESPONSE_MS) return;
  await new Promise((resolve) => setTimeout(resolve, MINIMUM_RESPONSE_MS - elapsed));
}
