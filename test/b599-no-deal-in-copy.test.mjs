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

/**
 * Collect string / template literal bodies in linear time.
 * Avoids the previous nested-regex scanner, which backtracked forever on
 * large modules (exit-gate grew enough under B601 to hang the suite).
 */
function literals(src) {
  const out = [];
  const text = String(src || "");
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '"' || ch === "'") {
      const quote = ch;
      i += 1;
      let body = "";
      while (i < text.length) {
        const c = text[i];
        if (c === "\\") {
          body += text.slice(i, i + 2);
          i += 2;
          continue;
        }
        if (c === quote) {
          i += 1;
          break;
        }
        body += c;
        i += 1;
      }
      out.push(body);
      continue;
    }
    if (ch === "`") {
      i += 1;
      let body = "";
      while (i < text.length) {
        const c = text[i];
        if (c === "\\") {
          body += text.slice(i, i + 2);
          i += 2;
          continue;
        }
        if (c === "`") {
          i += 1;
          break;
        }
        // Skip ${...} expressions without treating inner quotes as literals.
        if (c === "$" && text[i + 1] === "{") {
          body += "${";
          i += 2;
          let depth = 1;
          while (i < text.length && depth > 0) {
            const inner = text[i];
            if (inner === "\\") {
              body += text.slice(i, i + 2);
              i += 2;
              continue;
            }
            if (inner === "{") depth += 1;
            else if (inner === "}") depth -= 1;
            body += inner;
            i += 1;
          }
          continue;
        }
        body += c;
        i += 1;
      }
      out.push(body);
      continue;
    }
    // Skip line/block comments so comment text is not scanned as copy.
    if (ch === "/" && text[i + 1] === "/") {
      i += 2;
      while (i < text.length && text[i] !== "\n") i += 1;
      continue;
    }
    if (ch === "/" && text[i + 1] === "*") {
      i += 2;
      while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) i += 1;
      i += 2;
      continue;
    }
    i += 1;
  }
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
