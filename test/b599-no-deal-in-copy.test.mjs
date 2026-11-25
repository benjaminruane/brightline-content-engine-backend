/**
 * B599. No user-facing "deal"/"deals" outside identifiers, source quotes, fixtures.
 * Scans known user-facing surfaces only (not the whole lib tree).
 */
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "vitest";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BE = path.resolve(HERE, "..");

const SURFACES = [
  "lib/deal-status.mjs",
  "lib/qc/transaction-status.mjs",
  "lib/qc/decision-as-made.mjs",
  "lib/qc/exit-gate.mjs",
  "lib/qc/b595-card-rules.mjs",
  "lib/qc/reader-reason.mjs",
  "lib/qc/summary-bullets.mjs",
  "lib/export/export-blocks.mjs",
  "lib/style-guide/reader-copy.mjs",
  "lib/style-guide/guide.mjs",
];

const ALLOW = /\bdealStatus\b|\bDealStatus\b|\bDEAL_STATUS\b|\bdealInfo\b|\bdeal_status\b|\bdeal-status\b|deal word:|Do not write deal|not deal\.|Say transaction or investment, not deal/i;

function literals(src) {
  const out = [];
  const re = /(["'`])((?:\\.|(?!\1)[\s\S])*?)\1/g;
  let match;
  while ((match = re.exec(src))) out.push(match[2]);
  return out;
}

test("backend user-facing strings have no deal/deals", () => {
  const hits = [];
  for (const rel of SURFACES) {
    const file = path.join(BE, rel);
    if (!existsSync(file)) continue;
    const src = readFileSync(file, "utf8");
    for (const lit of literals(src)) {
      if (!/\bdeals?\b/i.test(lit)) continue;
      if (ALLOW.test(lit)) continue;
      // Style-guide incorrect examples that show the forbidden word.
      if (/The deal closed/i.test(lit)) continue;
      hits.push(`${rel}: ${lit.slice(0, 120)}`);
    }
  }
  assert.deepEqual(hits, [], hits.join("\n"));
});
