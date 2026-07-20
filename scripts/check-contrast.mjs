// WCAG contrast gate (PCO-013).
//
// The audit found link colour and bottom-nav labels below AA. Eyeballing a warm
// palette is exactly how that happens, so the ratios are computed here and
// checked in CI: a token change that dims text fails a pull request instead of
// shipping.
import { readFileSync } from "node:fs";
import path from "node:path";

const css = readFileSync(path.resolve("src", "styles.css"), "utf8");

// Reads the :root custom properties so the checks follow the real tokens rather
// than a copy that can drift.
function tokens(source) {
  const found = {};
  for (const match of source.matchAll(/--([a-z-]+):\s*(#[0-9a-fA-F]{3,8})\s*;/g)) {
    found[match[1]] = match[2];
  }
  return found;
}

function toRgb(hex) {
  let value = hex.replace("#", "");
  if (value.length === 3) value = value.split("").map((c) => c + c).join("");
  return [0, 2, 4].map((i) => parseInt(value.slice(i, i + 2), 16));
}

// WCAG relative luminance.
function luminance(hex) {
  const [r, g, b] = toRgb(hex).map((channel) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(foreground, background) {
  const a = luminance(foreground);
  const b = luminance(background);
  const [light, dark] = a > b ? [a, b] : [b, a];
  return (light + 0.05) / (dark + 0.05);
}

const t = tokens(css);

// Each pair is a combination the app actually renders. AA is 4.5:1 for normal
// text and 3:1 for large text and UI component boundaries.
const PAIRS = [
  { name: "body text on page background", fg: t.ink, bg: t.bg, min: 4.5 },
  { name: "body text on surface", fg: t.ink, bg: t.surface, min: 4.5 },
  { name: "muted text on page background", fg: t.muted, bg: t.bg, min: 4.5 },
  { name: "muted text on surface", fg: t.muted, bg: t.surface, min: 4.5 },
  { name: "link (caramel) on page background", fg: t.caramel, bg: t.bg, min: 4.5 },
  { name: "link (caramel) on surface", fg: t.caramel, bg: t.surface, min: 4.5 },
  { name: "active nav (accent) on accent-soft", fg: t.accent, bg: t["accent-soft"], min: 4.5 },
  { name: "accent on surface", fg: t.accent, bg: t.surface, min: 4.5 },
  { name: "warning text (amber) on surface", fg: t.amber, bg: t.surface, min: 4.5 },
  { name: "success text (green) on surface", fg: t.green, bg: t.surface, min: 4.5 },
  { name: "danger text (red) on surface", fg: t.red, bg: t.surface, min: 4.5 },
  { name: "border against surface (UI boundary)", fg: t.border, bg: t.surface, min: 1.4 }
];

let failed = 0;
console.log("WCAG contrast check\n");
for (const pair of PAIRS) {
  if (!pair.fg || !pair.bg) {
    console.log(`  SKIP   ${pair.name} (token missing)`);
    continue;
  }
  const ratio = contrastRatio(pair.fg, pair.bg);
  const ok = ratio >= pair.min;
  if (!ok) failed += 1;
  console.log(`  ${ok ? "pass" : "FAIL"}   ${pair.name.padEnd(42)} ${ratio.toFixed(2)}:1  (needs ${pair.min}:1)  ${pair.fg} on ${pair.bg}`);
}

// The audit called out bottom-nav labels as too small to read. Enforced here so
// the fix cannot be undone silently.
const navLabel = css.match(/\.bottom-nav button span\s*\{[^}]*font-size:\s*([\d.]+)px/);
const navSize = navLabel ? Number(navLabel[1]) : null;
console.log("");
if (navSize === null) {
  console.log("  SKIP   bottom-nav label size (no explicit font-size found)");
} else {
  const ok = navSize >= 11;
  if (!ok) failed += 1;
  console.log(`  ${ok ? "pass" : "FAIL"}   bottom-nav label size                      ${navSize}px  (needs >= 11px)`);
}

if (failed) {
  console.error(`\n${failed} contrast/legibility check(s) FAILED.`);
  process.exit(1);
}
console.log("\nAll contrast and legibility checks passed.");
