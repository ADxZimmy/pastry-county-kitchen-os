// Stage 015-B: the full authenticated UAT gate.
//
// This does not re-implement the evidence — it runs the gates that already prove
// each area and reports one verdict. Re-implementing would create a second set
// of assertions to drift from the first, which is the failure mode this
// programme has hit twice (a smoke asserting a stale contract, and a check that
// could never match what it tested).
//
// Every gate below is production-safe: each creates only records it owns under a
// unique run id and cleans up in a finally block.
//
//   npm run smoke:uat-full
import { spawn } from "node:child_process";
import { config } from "dotenv";

config({ path: ".env.local" });
config();

const baseURL = process.env.LIVE_BASE_URL ?? "https://pastry-county-kitchen-os.vercel.app";

const GATES = [
  { script: "test", label: "Unit, policy and permission suites", area: "calculation, role matrix, contracts", local: true },
  { script: "a11y:contrast", label: "WCAG AA contrast and legibility", area: "PCO-013", local: true },
  { script: "perf:budget", label: "Client bundle budget and server-only parsers", area: "PCO-011", local: true },
  { script: "smoke:uat-core", label: "Demo Trust UAT (Prompt 10 scenario)", area: "PCO-001..009, 014, 016" },
  { script: "smoke:auth-cookie", label: "Cookie sessions, CSRF, shared throttling", area: "PCO-012, RS-006" },
  { script: "smoke:password-reset", label: "Password recovery", area: "PCO-015" },
  { script: "smoke:route-data", label: "Route-scoped reads and role isolation", area: "PCO-010" },
  { script: "smoke:a11y", label: "Rendered accessibility sweep", area: "PCO-013" },
  { script: "smoke:live-audit", label: "Full browser regression family", area: "end-to-end" }
];

function run(script) {
  return new Promise((resolve) => {
    const started = Date.now();
    const command = process.platform === "win32" ? "cmd.exe" : "npm";
    const args = process.platform === "win32" ? ["/d", "/s", "/c", `npm run ${script}`] : ["run", script];
    const child = spawn(command, args, { cwd: process.cwd(), env: process.env, stdio: "inherit" });
    child.on("error", () => resolve({ ok: false, ms: Date.now() - started }));
    child.on("exit", (code) => resolve({ ok: code === 0, ms: Date.now() - started }));
  });
}

console.log(`Full authenticated UAT gate (015-B) against ${baseURL}\n`);

const results = [];
for (const gate of GATES) {
  console.log(`\n=== ${gate.label} (${gate.script}) ===`);
  const outcome = await run(gate.script);
  results.push({ ...gate, ...outcome });
  if (!outcome.ok) {
    // Stop on the first failure. Continuing would pile production side effects
    // on top of a known-broken state, and the plan is explicit that a regression
    // returns to its owning phase rather than being worked around.
    console.log(`\nSTOPPING: ${gate.script} failed. Later gates were not run.`);
    break;
  }
}

console.log("\n\n================ 015-B GATE SUMMARY ================\n");
for (const gate of GATES) {
  const result = results.find((r) => r.script === gate.script);
  const status = !result ? "not run" : result.ok ? "PASS" : "FAIL";
  const timing = result ? `${(result.ms / 1000).toFixed(0)}s` : "";
  console.log(`  ${status.padEnd(8)} ${gate.script.padEnd(22)} ${timing.padStart(5)}  ${gate.area}`);
}

const failed = results.filter((r) => !r.ok);
const notRun = GATES.length - results.length;

console.log("");
if (failed.length || notRun) {
  console.log(`FULL UAT GATE: NOT PASSED. ${failed.length} failed, ${notRun} not run.`);
  console.log("Return the defect to its owning phase. Do not weaken an assertion to obtain a pass.");
  process.exitCode = 1;
} else {
  console.log(`FULL UAT GATE: PASSED against ${baseURL}.`);
  console.log("");
  console.log("This covers the remediation programme's own evidence. It does NOT cover:");
  console.log("  - manual keyboard-only and screen-reader verification (owner work, Phase 013)");
  console.log("  - end-to-end redemption of an emailed reset link (needs mailbox or preview DB)");
  console.log("  - a model-backed assistant (no provider configured; deterministic helper is the shipped behaviour)");
  console.log("  - backup/restore and rollback drills, and external email DNS sign-off");
  console.log("  - any replacement audit score, which only a fresh independent audit can set");
}
