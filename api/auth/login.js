import bcrypt from "bcryptjs";
import { createSessionToken } from "../_auth.js";
import { first, getSql, sendError, setPrivateNoStore } from "../_db.js";
import { rateLimit, rateLimitKey, sendRateLimit } from "../_rateLimit.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    setPrivateNoStore(res);
    const sql = getSql();
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
    res.status(200).json({ id: user.id, email: user.email, fullName: user.full_name, role: user.role, token: createSessionToken(user) });
  } catch (error) {
    sendError(res, error);
  }
}
