// PCO-011 client bundle budget.
//
// Measures what a browser actually downloads for the first paint: the gzipped
// size of the entry JavaScript. Runs against dist/ after a build, so CI fails on
// a regression rather than letting one reach production unnoticed.
import { gzipSync } from "node:zlib";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const distDir = path.resolve("dist", "assets");
const indexHtml = path.resolve("dist", "index.html");

// The budget is on the entry chunk, not the whole directory: lazily loaded route
// chunks are the point of the split and should not count against first paint.
const ENTRY_BUDGET_KB = Number(process.env.BUNDLE_BUDGET_KB || 150);
const CSS_BUDGET_KB = Number(process.env.CSS_BUDGET_KB || 30);

let html;
try {
  html = readFileSync(indexHtml, "utf8");
} catch {
  console.error("dist/index.html is missing. Run `npm run build` first.");
  process.exit(1);
}

const referenced = [...html.matchAll(/\/assets\/([^"']+\.(?:js|css))/g)].map((m) => m[1]);
const entryJs = referenced.filter((name) => name.endsWith(".js"));
const entryCss = referenced.filter((name) => name.endsWith(".css"));

const gzipKb = (file) => gzipSync(readFileSync(path.join(distDir, file))).length / 1024;

const jsTotal = entryJs.reduce((sum, file) => sum + gzipKb(file), 0);
const cssTotal = entryCss.reduce((sum, file) => sum + gzipKb(file), 0);

const allChunks = readdirSync(distDir).filter((name) => name.endsWith(".js"));
const lazyChunks = allChunks.filter((name) => !entryJs.includes(name));

console.log("Client bundle budget (gzipped)\n");
for (const file of entryJs) console.log(`  entry js   ${file.padEnd(34)} ${gzipKb(file).toFixed(1)} kB`);
for (const file of entryCss) console.log(`  entry css  ${file.padEnd(34)} ${gzipKb(file).toFixed(1)} kB`);
if (lazyChunks.length) {
  console.log(`\n  ${lazyChunks.length} lazily loaded chunk(s), not counted against first paint:`);
  for (const file of lazyChunks) console.log(`    ${file.padEnd(34)} ${gzipKb(file).toFixed(1)} kB`);
} else {
  // Phase 012 measured the entry chunk at 96 kB gzipped, already inside budget,
  // so route splitting was dropped as not worth refactoring App.tsx for. The
  // budget above is what keeps that decision honest.
  console.log("\n  single entry chunk (route splitting deliberately not pursued; see phase 012 verification)");
}

// The document parsers are heavy and server-only: they are dynamically imported
// inside api/_imports.js and must never reach a browser. That isolation already
// held when Phase 012 measured it; this guard is what keeps it holding, because
// one stray static import would quietly add megabytes to first paint.
const SERVER_ONLY_PACKAGES = ["mammoth", "pdf-parse", "read-excel-file", "@napi-rs/canvas"];
const clientJs = allChunks.map((file) => readFileSync(path.join(distDir, file), "utf8")).join("\n");
const leaked = SERVER_ONLY_PACKAGES.filter((pkg) => clientJs.includes(pkg));

console.log("\n  server-only packages absent from the client bundle:");
for (const pkg of SERVER_ONLY_PACKAGES) console.log(`    ${leaked.includes(pkg) ? "LEAKED" : "ok    "} ${pkg}`);

// Vercel turns every non-underscore, non-test file under api/ into a serverless
// function, and the deployment has a hard function limit. Phase 012-C hit it:
// adding one route took the count to 13, the build failed, and because a failed
// build leaves the PREVIOUS deployment serving, every existing route kept
// working -- so it read as a routing bug rather than a failed deploy. Phase 016
// added the signup route and put the count at exactly the ceiling.
//
// Failing here means the next function fails a pull request instead of a
// production build that looks like something else entirely. When this trips, the
// fix is to consolidate rather than to raise the number: the six api/auth/*.js
// routes would collapse to one api/auth/[op].js dispatcher.
const FUNCTION_LIMIT = Number(process.env.VERCEL_FUNCTION_LIMIT || 12);

function serverlessFunctions(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) return serverlessFunctions(full);
    if (!entry.endsWith(".js")) return [];
    if (entry.startsWith("_") || entry.endsWith(".test.js")) return [];
    return [path.relative(path.resolve("api"), full).replace(/\\/g, "/")];
  });
}

const functions = serverlessFunctions(path.resolve("api")).sort();
console.log(`\n  serverless functions ${functions.length} / ${FUNCTION_LIMIT}`);
for (const fn of functions) console.log(`    api/${fn}`);

const failures = [];
if (jsTotal > ENTRY_BUDGET_KB) failures.push(`entry JavaScript ${jsTotal.toFixed(1)} kB exceeds the ${ENTRY_BUDGET_KB} kB budget`);
if (cssTotal > CSS_BUDGET_KB) failures.push(`entry CSS ${cssTotal.toFixed(1)} kB exceeds the ${CSS_BUDGET_KB} kB budget`);
if (leaked.length) failures.push(`server-only package(s) reached the client bundle: ${leaked.join(", ")}`);
if (functions.length > FUNCTION_LIMIT) {
  failures.push(`${functions.length} serverless functions exceeds the ${FUNCTION_LIMIT} the deployment allows -- consolidate api/auth/* into one dispatcher rather than raising the limit`);
}

console.log(`\n  entry JS total   ${jsTotal.toFixed(1)} kB / ${ENTRY_BUDGET_KB} kB`);
console.log(`  entry CSS total  ${cssTotal.toFixed(1)} kB / ${CSS_BUDGET_KB} kB`);

if (failures.length) {
  console.error(`\nBundle budget NOT met:\n${failures.map((line) => `  - ${line}`).join("\n")}`);
  process.exit(1);
}
console.log("\nBundle budget met.");
