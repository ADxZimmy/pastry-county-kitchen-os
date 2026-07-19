// PCO-011 client bundle budget.
//
// Measures what a browser actually downloads for the first paint: the gzipped
// size of the entry JavaScript. Runs against dist/ after a build, so CI fails on
// a regression rather than letting one reach production unnoticed.
import { gzipSync } from "node:zlib";
import { readFileSync, readdirSync } from "node:fs";
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
  console.log("\n  no lazily loaded chunks yet (route splitting lands in 012-B)");
}

const failures = [];
if (jsTotal > ENTRY_BUDGET_KB) failures.push(`entry JavaScript ${jsTotal.toFixed(1)} kB exceeds the ${ENTRY_BUDGET_KB} kB budget`);
if (cssTotal > CSS_BUDGET_KB) failures.push(`entry CSS ${cssTotal.toFixed(1)} kB exceeds the ${CSS_BUDGET_KB} kB budget`);

console.log(`\n  entry JS total   ${jsTotal.toFixed(1)} kB / ${ENTRY_BUDGET_KB} kB`);
console.log(`  entry CSS total  ${cssTotal.toFixed(1)} kB / ${CSS_BUDGET_KB} kB`);

if (failures.length) {
  console.error(`\nBundle budget NOT met:\n${failures.map((line) => `  - ${line}`).join("\n")}`);
  process.exit(1);
}
console.log("\nBundle budget met.");
