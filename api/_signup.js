// Phase 016: invite-gated self-registration for device accounts.
//
// This is the only path in the app that creates an account without an
// authenticated Owner/Admin, so it is deliberately narrow: it exists to hand a
// tester their own empty workspace, and every account it creates keeps its
// kitchen data in that tester's browser.
//
// Enumeration posture, stated rather than assumed. A duplicate address is
// answered with a plain "this email already has an account" instead of the
// deliberately vague response password reset uses. That is a considered
// trade-off: the endpoint is behind an invite code, so only someone already
// holding the code can probe at all, and the owner sees every account that gets
// created on the Staff page. Telling an invited tester plainly that they already
// have an account is worth more than hiding it from an attacker who would first
// have to obtain the code.
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { issueSession, readSessionCookie, revokeSession } from "./_sessions.js";
import { validatePasswordStrength } from "../shared/policy.js";
import { isMissingColumn } from "./_runtime.js";

export const SIGNUP_UNAVAILABLE = "Signup is not open on this deployment. Ask the Kitchen OS owner for an invite.";
export const SIGNUP_NOT_READY = "Signup is not ready on this deployment yet. Ask the Kitchen OS owner to finish the update.";
export const SIGNUP_INVITE_REJECTED = "That invite code is not valid.";
export const SIGNUP_DUPLICATE = "This email already has a Kitchen OS account. Sign in instead.";

// Loose on purpose: this is a sanity check that catches a typo, not an attempt
// to adjudicate RFC 5322. Deliverability is proven by the tester signing in, not
// by a regex.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_NAME_LENGTH = 120;

export function signupConfigured() {
  return Boolean(String(process.env.SIGNUP_INVITE_CODE || "").trim());
}

// Both sides are hashed to a fixed width before comparison. Comparing the raw
// strings would leak the configured length through an early return, and would
// also make timingSafeEqual throw on a length mismatch.
export function inviteCodeMatches(candidate) {
  if (!signupConfigured()) return false;
  if (typeof candidate !== "string" || candidate === "") return false;
  const configured = String(process.env.SIGNUP_INVITE_CODE).trim();
  const left = crypto.createHash("sha256").update(candidate).digest();
  const right = crypto.createHash("sha256").update(configured).digest();
  return crypto.timingSafeEqual(left, right);
}

export function validateSignupInput({ fullName, email, password } = {}) {
  const name = String(fullName ?? "").trim().slice(0, MAX_NAME_LENGTH);
  if (!name) return { error: "Your name is required." };

  const normalizedEmail = String(email ?? "").trim().toLowerCase();
  if (!EMAIL_PATTERN.test(normalizedEmail)) return { error: "Enter a valid email address." };

  const passwordError = validatePasswordStrength(password);
  if (passwordError) return { error: passwordError };

  return { fullName: name, email: normalizedEmail };
}

function signupId() {
  return `user-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
}

export async function performSignup(sql, req, input) {
  const { fullName, email } = input;
  const password = input.password;

  const existing = await sql`select id from app_users where lower(email) = ${email} limit 1`;
  if (existing.length) throw Object.assign(new Error(SIGNUP_DUPLICATE), { statusCode: 409 });

  const userId = signupId();
  const passwordHash = bcrypt.hashSync(password, 10);
  try {
    await sql`
      insert into app_users (id, email, full_name, role, password_hash, active, session_revoked_at, data_mode)
      values (${userId}, ${email}, ${fullName}, ${"Owner/Admin"}, ${passwordHash}, true, null, ${"device"})
    `;
  } catch (error) {
    // A race between the lookup above and this insert lands on the unique index.
    if (error?.code === "23505") throw Object.assign(new Error(SIGNUP_DUPLICATE), { statusCode: 409 });
    // Migration 007 has not run. Refusing here is what makes every data_mode
    // read elsewhere safe: it guarantees no device account can exist before the
    // column does, so a missing column provably means "no device accounts",
    // never "assume this one is fine". Inserting without the column would create
    // a server-mode account with full access to the bakery's data -- the worst
    // possible outcome of a missed migration.
    if (isMissingColumn(error, "data_mode")) throw Object.assign(new Error(SIGNUP_NOT_READY), { statusCode: 503 });
    throw error;
  }

  const user = { id: userId, email, fullName, role: "Owner/Admin", dataMode: "device" };

  // The owner should be able to see who let themselves in.
  await sql`
    insert into audit_logs (id, entity_type, entity_id, action, before_data, after_data, actor)
    values (${`audit-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`}, 'app_users', ${userId}, 'signup', null,
      ${JSON.stringify({ email, full_name: fullName, role: "Owner/Admin", data_mode: "device" })}, ${email})
  `;

  // Rotate whatever session the browser arrived with, exactly as login does, so
  // a fixated cookie cannot survive account creation.
  const presented = readSessionCookie(req);
  if (presented) await revokeSession(sql, presented, "signup-rotation");

  const session = await issueSession(sql, user, req);
  return { user, session };
}
