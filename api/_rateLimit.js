import crypto from "node:crypto";
import { isProductionRuntime, sessionSecret } from "./_runtime.js";

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

// ------------------------------------------------------- shared rate limits --
// The Map above is per-instance. Serverless spreads requests across instances,
// so it throttles a persistent attacker barely at all: it is a cheap first
// layer, not the security boundary. Auth endpoints use the shared counter below,
// which every instance increments in the same place.

const UNDEFINED_TABLE = "42P01";
const CLEANUP_PROBABILITY = 0.02;

// The bucket key holds an address and an email. Neither is stored in the clear:
// the row is keyed by a keyed hash, which is all the counter needs.
export function hashBucketKey(key) {
  return crypto.createHmac("sha256", sessionSecret()).update(String(key)).digest("base64url").slice(0, 43);
}

export async function ensureRateLimitTable(sql) {
  await sql`
    create table if not exists auth_rate_limits (
      bucket_key text primary key,
      window_started_at timestamptz not null default now(),
      attempt_count integer not null default 0,
      expires_at timestamptz not null
    )
  `;
  await sql`create index if not exists auth_rate_limits_expires_at_idx on auth_rate_limits (expires_at)`;
}

export async function deleteExpiredRateLimits(sql, { retainHours = 24 } = {}) {
  try {
    const rows = await sql`
      delete from auth_rate_limits where expires_at < now() - ${`${retainHours} hours`}::interval returning bucket_key
    `;
    return rows.length;
  } catch (error) {
    if (error?.code === UNDEFINED_TABLE) return 0;
    throw error;
  }
}

// One statement does the whole thing: create the window, or increment it, or
// start a fresh one if the old window has expired. Because it is a single
// upsert, two instances racing on the same key cannot both read "1 attempt".
export async function sharedRateLimit(sql, { key, limit, windowMs }) {
  const windowSeconds = Math.max(1, Math.ceil(windowMs / 1000));
  const bucketKey = hashBucketKey(key);
  const run = async () => await sql`
    insert into auth_rate_limits (bucket_key, window_started_at, attempt_count, expires_at)
    values (${bucketKey}, now(), 1, now() + ${`${windowSeconds} seconds`}::interval)
    on conflict (bucket_key) do update set
      attempt_count = case when auth_rate_limits.expires_at <= now() then 1 else auth_rate_limits.attempt_count + 1 end,
      window_started_at = case when auth_rate_limits.expires_at <= now() then now() else auth_rate_limits.window_started_at end,
      expires_at = case when auth_rate_limits.expires_at <= now() then now() + ${`${windowSeconds} seconds`}::interval else auth_rate_limits.expires_at end
    returning attempt_count as "attemptCount",
      greatest(1, ceil(extract(epoch from (expires_at - now()))))::int as "retryAfterSeconds"
  `;

  let rows;
  try {
    rows = await run();
  } catch (error) {
    if (error?.code !== UNDEFINED_TABLE) throw error;
    await ensureRateLimitTable(sql);
    rows = await run();
  }

  const row = rows[0] ?? { attemptCount: 1, retryAfterSeconds: windowSeconds };
  if (Math.random() < CLEANUP_PROBABILITY) {
    await deleteExpiredRateLimits(sql).catch(() => {});
  }
  return {
    limited: Number(row.attemptCount) > limit,
    limit,
    remaining: Math.max(0, limit - Number(row.attemptCount)),
    retryAfterSeconds: Number(row.retryAfterSeconds) || windowSeconds,
    shared: true
  };
}

// Checks the cheap per-instance layer first, then the shared counter that is the
// actual boundary. If the shared store is unreachable the request is NOT let
// through unthrottled: the in-memory verdict stands and the fault is logged, so
// a database blip degrades throttling rather than removing it or locking
// everyone out.
export async function enforceAuthRateLimit(sql, req, { scope, identity, limit, windowMs }) {
  const key = rateLimitKey(req, scope, identity);
  const local = rateLimit({ key, limit, windowMs });
  if (local.limited) return local;
  try {
    return await sharedRateLimit(sql, { key, limit, windowMs });
  } catch (error) {
    console.error("[rate-limit] shared counter unavailable, falling back to per-instance", error);
    if (isProductionRuntime()) return local;
    throw error;
  }
}
