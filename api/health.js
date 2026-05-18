export default function handler(_req, res) {
  res.status(200).json({ ok: Boolean(process.env.DATABASE_URL), database: process.env.DATABASE_URL ? "neon" : "missing" });
}
