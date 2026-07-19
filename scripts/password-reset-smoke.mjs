// Phase 011-B2: password reset verification (PCO-015).
//
// Read-only with respect to credentials: it never completes a reset, so no
// account password changes. It requests links (which only ever land in the
// owner's mailbox) and probes the redemption endpoint with tokens that cannot
// be valid.
import { config } from "dotenv";

config({ path: ".env.local" });
config();

const baseURL = process.env.PASSWORD_RESET_SMOKE_BASE_URL ?? process.env.LIVE_BASE_URL ?? "https://pastry-county-kitchen-os.vercel.app";
const knownEmail = process.env.LIVE_TEST_EMAIL;

if (!knownEmail) {
  console.error("password-reset smoke requires LIVE_TEST_EMAIL.");
  process.exit(1);
}

const origin = new URL(baseURL).origin;
const unknownEmail = `no-such-account-${Date.now()}@pastrycounty.invalid`;
const results = [];

function check(name, ok, detail) {
  results.push({ name, ok: Boolean(ok), detail: detail ?? "" });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` -> ${detail}` : ""}`);
}

async function post(path, body) {
  const startedAt = Date.now();
  const response = await fetch(new URL(path, baseURL), {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: origin },
    body: JSON.stringify(body)
  });
  const text = await response.text();
  let parsed = {};
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { raw: text.slice(0, 200) };
    }
  }
  return {
    status: response.status,
    body: parsed,
    raw: text,
    elapsed: Date.now() - startedAt,
    setCookie: response.headers.getSetCookie?.() ?? []
  };
}

async function main() {
  console.log(`Password reset smoke against ${baseURL}\n`);

  const unknown = await post("/api/auth/reset-request", { email: unknownEmail });
  const known = await post("/api/auth/reset-request", { email: knownEmail });

  // The single most important property: a caller cannot tell the two apart.
  check("unknown and known addresses get the same status", unknown.status === known.status, `${unknown.status} vs ${known.status}`);
  check("unknown and known addresses get the same body", unknown.raw === known.raw, unknown.raw.slice(0, 90));
  check("no response names the account or its absence", !/not found|no account|does not exist|unregistered/i.test(`${unknown.raw}${known.raw}`));

  const deliveryConfigured = known.status !== 503;

  if (!deliveryConfigured) {
    // Email is not set up. The endpoint must say so instead of pretending.
    check("reset is refused honestly when email delivery is unconfigured", known.status === 503, `${known.status}`);
    check("it does not claim a link was sent", !/on its way|check your (inbox|spam)|sent/i.test(known.raw), known.body.error ?? "");
    check("it points the user at an administrator", /administrator/i.test(known.body.error ?? ""));
  } else {
    check("reset request accepted", known.status === 200, `${known.status}`);
    check("response is the generic one", /if that email belongs/i.test(known.raw));
    // Timing must not answer the question either.
    check("both responses clear the timing floor", unknown.elapsed >= 550 && known.elapsed >= 550, `${unknown.elapsed}ms vs ${known.elapsed}ms`);
    check("timing gap between known and unknown is small", Math.abs(unknown.elapsed - known.elapsed) < 1500, `${Math.abs(unknown.elapsed - known.elapsed)}ms`);
  }

  // Redemption: these tokens cannot be valid, so nothing is ever consumed.
  const strong = "kitchen smoke passphrase 2026";
  const bogus = await post("/api/auth/reset-confirm", { token: `not-a-real-token-${Date.now()}`, password: strong });
  check("an invalid reset token is refused", bogus.status === 400, `${bogus.status}`);
  check("the refusal does not say why", /no longer valid/i.test(bogus.body.error ?? "") && !/expired|already used|unknown token/i.test(bogus.body.error ?? ""), bogus.body.error ?? "");
  check("a refused reset issues no session", !bogus.setCookie.some((cookie) => /pcko_session=[^;]+/.test(cookie) && !/Max-Age=0/.test(cookie)));

  const weak = await post("/api/auth/reset-confirm", { token: `not-a-real-token-${Date.now()}`, password: "short" });
  check("a weak password is rejected", weak.status === 400, `${weak.status}`);
  // Strength is checked first, so a weak choice never burns a valid single-use link.
  check("password strength is checked before the token is spent", /characters/i.test(weak.body.error ?? ""), weak.body.error ?? "");

  const empty = await post("/api/auth/reset-confirm", { token: "", password: strong });
  check("an empty token is refused", empty.status === 400, `${empty.status}`);

  // The shipped UI must offer the real flow, not the old placeholder toast.
  const html = await (await fetch(new URL("/", baseURL))).text();
  const bundlePath = html.match(/assets\/index-[^"]+\.js/)?.[0];
  const bundle = bundlePath ? await (await fetch(new URL(`/${bundlePath}`, baseURL))).text() : "";
  check("shipped bundle has a real reset screen", /Send reset link/.test(bundle) && /Choose a new password/.test(bundle), bundlePath);
  check("the placeholder toast is gone", !/Password reset will be connected/.test(bundle));
  check("the reset screen warns that other devices sign out", /signs out every other device/i.test(bundle));
}

main()
  .catch((error) => {
    check("smoke completed without throwing", false, error?.message ?? String(error));
  })
  .finally(() => {
    const passed = results.filter((entry) => entry.ok).length;
    console.log(`\n${passed}/${results.length} checks passed`);
    const failed = results.filter((entry) => !entry.ok);
    if (failed.length) {
      console.log("\nFailed:");
      for (const entry of failed) console.log(`  - ${entry.name}${entry.detail ? ` (${entry.detail})` : ""}`);
      console.log(`\nPassword reset check: NOT PASSED against ${baseURL}.`);
      process.exitCode = 1;
      return;
    }
    console.log(`\nPassword reset check: PASSED against ${baseURL}.`);
    console.log("Note: redeeming a real emailed token is not covered here — it needs mailbox access or a preview database.");
  });
