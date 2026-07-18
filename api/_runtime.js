const MINIMUM_SECRET_LENGTH = 16;
const DEVELOPMENT_SESSION_SECRET = "pastry-county-dev-session";

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
