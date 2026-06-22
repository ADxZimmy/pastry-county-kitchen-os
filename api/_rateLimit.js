const buckets = new Map();

function nowMs() {
  return Date.now();
}

export function clientIp(req) {
  const forwarded = req.headers?.["x-forwarded-for"] || req.headers?.["X-Forwarded-For"];
  const firstForwarded = Array.isArray(forwarded) ? forwarded[0] : String(forwarded || "").split(",")[0];
  return firstForwarded.trim()
    || req.headers?.["x-real-ip"]
    || req.socket?.remoteAddress
    || "unknown";
}

export function rateLimit({ key, limit, windowMs, now = nowMs() }) {
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    const next = { count: 1, resetAt: now + windowMs };
    buckets.set(key, next);
    return { limited: false, limit, remaining: Math.max(0, limit - 1), retryAfterSeconds: Math.ceil(windowMs / 1000) };
  }
  bucket.count += 1;
  const retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
  return {
    limited: bucket.count > limit,
    limit,
    remaining: Math.max(0, limit - bucket.count),
    retryAfterSeconds
  };
}

export function rateLimitKey(req, scope, identity = "") {
  return [scope, clientIp(req), String(identity || "").toLowerCase()].join(":");
}

export function sendRateLimit(res, result) {
  res.setHeader("Retry-After", String(result.retryAfterSeconds));
  res.setHeader("X-RateLimit-Limit", String(result.limit));
  res.setHeader("X-RateLimit-Remaining", String(result.remaining));
  res.status(429).json({ error: "Too many attempts. Wait briefly and try again." });
}

export function clearRateLimitBuckets() {
  buckets.clear();
}
