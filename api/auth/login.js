import bcrypt from "bcryptjs";
import { createSessionToken } from "../_auth.js";
import { first, getSql, sendError } from "../_db.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const sql = getSql();
    const { email, password } = req.body;
    const user = first(await sql`
      select id, email, full_name, role, password_hash
      from app_users
      where lower(email) = lower(${email})
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
