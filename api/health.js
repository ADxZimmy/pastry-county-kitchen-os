import { sessionSecretConfigured } from "./_auth.js";
import { assistantConfigSummary } from "./_assistant.js";

export default function handler(_req, res) {
  const databaseReady = Boolean(process.env.DATABASE_URL);
  const sessionSecretReady = sessionSecretConfigured();
  const ok = databaseReady && sessionSecretReady;
  res.status(ok ? 200 : 503).json({
    ok,
    database: databaseReady ? "neon" : "missing",
    sessionSecret: sessionSecretReady ? "configured" : "missing",
    // Reports which model backs the assistant, or that none does. Returns the
    // provider and model name only — never the key — so configuration can be
    // confirmed from outside without exposing a credential. An unconfigured
    // assistant is a supported state, not a failure, so it does not affect `ok`.
    assistant: assistantConfigSummary()
  });
}
