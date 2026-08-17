const MINIMUM_SECRET_LENGTH = 16;
const DEVELOPMENT_SESSION_SECRET = "pastry-county-dev-session";

// Postgres undefined_column. A column added by a migration does not exist between
// deploying the code that reads it and running that migration, and a read must
// degrade rather than fail. Note coalesce() does NOT cover this: it handles a
// NULL value, while a missing column still raises 42703, so the retry is the
// whole tolerance mechanism.
//
// This lives in the leaf module because both _auth.js and _sessions.js need it
// and they already import from here; putting it in either would make them
// import each other.
const UNDEFINED_COLUMN = "42703";

export function isMissingColumn(error, column) {
  return error?.code === UNDEFINED_COLUMN || new RegExp(`column .*${column}.* does not exist`, "i").test(String(error?.message ?? ""));
}

// Phase 016. 'device' accounts keep their kitchen data in the browser and are
// refused every server business read and write. Anything else, including an
// absent value on an unmigrated database, is a normal server account.
export function normalizeDataMode(value) {
  return value === "device" ? "device" : "server";
}

export function isProductionRuntime() {
  if (process.env.VERCEL_ENV) return process.env.VERCEL_ENV === "production";
  return process.env.NODE_ENV === "production";
}

export function sessionSecretConfigured() {
  if (!isProductionRuntime()) return true;
  const secret = process.env.SESSION_SECRET;
  return Boolean(secret && secret.length >= MINIMUM_SECRET_LENGTH);
}

export function sessionSecret() {
  const secret = process.env.SESSION_SECRET;
  if (isProductionRuntime()) {
    if (!secret || secret.length < MINIMUM_SECRET_LENGTH) {
      throw Object.assign(
        new Error("SESSION_SECRET is not configured for production. Set a dedicated random SESSION_SECRET (at least 16 characters)."),
        { statusCode: 503 }
      );
    }
    return secret;
  }
  return secret || DEVELOPMENT_SESSION_SECRET;
}
