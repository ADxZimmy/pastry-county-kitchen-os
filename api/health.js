import { sessionSecretConfigured } from "./_auth.js";

export default function handler(_req, res) {
  const databaseReady = Boolean(process.env.DATABASE_URL);
  const sessionSecretReady = sessionSecretConfigured();
  const ok = databaseReady && sessionSecretReady;
  res.status(ok ? 200 : 503).json({
    ok,
    database: databaseReady ? "neon" : "missing",
    sessionSecret: sessionSecretReady ? "configured" : "missing"
  });
}
