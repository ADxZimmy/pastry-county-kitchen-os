// Phase 012 performance baseline / evidence.
//
// Measures what production actually serves — cache headers, payload sizes, and
// API timings — so the phase can show a before and after instead of asserting
// an improvement. Read-only: it fetches and measures, and changes nothing.
import { config } from "dotenv";
import { authHeaders, loginForSmoke } from "./_smoke-session.mjs";

config({ path: ".env.local" });
config();

const baseURL = process.env.PERF_BASELINE_BASE_URL ?? process.env.LIVE_BASE_URL ?? "https://pastry-county-kitchen-os.vercel.app";
const email = process.env.LIVE_TEST_EMAIL;
const password = process.env.LIVE_TEST_PASSWORD;

const kb = (bytes) => `${(bytes / 1024).toFixed(1)} kB`;

async function timed(label, run) {
  const started = Date.now();
  const value = await run();
  return { label, ms: Date.now() - started, value };
}

async function headOf(path, options = {}) {
  const response = await fetch(new URL(path, baseURL), options);
  const body = await response.arrayBuffer();
  return {
    status: response.status,
    bytes: body.byteLength,
    cacheControl: response.headers.get("cache-control"),
    contentEncoding: response.headers.get("content-encoding"),
    vary: response.headers.get("vary"),
    age: response.headers.get("age"),
    cacheStatus: response.headers.get("x-vercel-cache")
  };
}

console.log(`Performance baseline for ${baseURL}`);
console.log(`captured: ${new Date().toISOString()}\n`);

// --- static shell ---------------------------------------------------------
const html = await fetch(new URL("/", baseURL));
const htmlText = await html.text();
console.log("index.html");
console.log(`  status         ${html.status}`);
console.log(`  cache-control  ${html.headers.get("cache-control")}`);
console.log(`  bytes          ${kb(new TextEncoder().encode(htmlText).length)}`);

const assets = [...htmlText.matchAll(/\/assets\/[^"']+\.(?:js|css)/g)].map((m) => m[0]);
console.log(`\nhashed assets referenced: ${assets.length}`);
for (const asset of assets) {
  const info = await headOf(asset);
  console.log(`  ${asset}`);
  console.log(`    status ${info.status}  transferred ${kb(info.bytes)}  encoding ${info.contentEncoding ?? "none"}`);
  console.log(`    cache-control ${info.cacheControl}`);
  console.log(`    x-vercel-cache ${info.cacheStatus ?? "-"}  age ${info.age ?? "-"}`);
  const immutable = /immutable/.test(info.cacheControl ?? "") && /max-age=\d{7,}/.test(info.cacheControl ?? "");
  console.log(`    IMMUTABLE FOR A YEAR: ${immutable ? "yes" : "NO"}`);
}

// --- authenticated payloads ----------------------------------------------
if (!email || !password) {
  console.log("\n(skipping authenticated measurements: LIVE_TEST_EMAIL/PASSWORD not set)");
} else {
  const session = await loginForSmoke(baseURL, email, password, { label: "perf baseline" });
  const headers = authHeaders(baseURL, session);

  const boot = await timed("bootstrap", async () => await headOf("/api/bootstrap", { headers }));
  const bootBody = await (await fetch(new URL("/api/bootstrap", baseURL), { headers })).json();
  console.log("\n/api/bootstrap (Owner/Admin)");
  console.log(`  status         ${boot.value.status}`);
  console.log(`  time           ${boot.ms} ms`);
  console.log(`  transferred    ${kb(boot.value.bytes)}`);
  console.log(`  cache-control  ${boot.value.cacheControl}`);
  console.log(`  vary           ${boot.value.vary ?? "-"}`);
  console.log("  collection sizes (rows returned in one payload):");
  const sizes = Object.entries(bootBody)
    .filter(([, value]) => Array.isArray(value))
    .map(([key, value]) => [key, value.length, new TextEncoder().encode(JSON.stringify(value)).length])
    .sort((a, b) => b[2] - a[2]);
  for (const [key, count, bytes] of sizes) {
    console.log(`    ${key.padEnd(20)} ${String(count).padStart(5)} rows  ${kb(bytes).padStart(10)}`);
  }
  const capped = sizes.filter(([key]) => ["auditLogs", "inventoryMovements", "orderEvents", "productionQcLogs", "ingredientBatches"].includes(key));
  console.log("  growth-capped collections (these are the scaling cliff):");
  for (const [key, count] of capped) console.log(`    ${key} at ${count} rows (server-side LIMIT, silently truncated)`);

  const sessionTiming = await timed("session", async () => await headOf("/api/auth/session", { headers }));
  console.log(`\n/api/auth/session  ${sessionTiming.ms} ms  ${kb(sessionTiming.value.bytes)}  cache-control ${sessionTiming.value.cacheControl}`);
}
