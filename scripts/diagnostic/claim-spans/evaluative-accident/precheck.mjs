#!/usr/bin/env node
/**
 * Read-only check that accident residuals carry no traditional anchors
 * and that the evaluative wording is not on the phrase list.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  isCompoundCandidate,
  residualHasUnclaimedAnchor,
  validateClaimSpans,
} from "../../../../lib/qc/claim-spans.mjs";

const DIR = path.dirname(fileURLToPath(import.meta.url));

const CASES = [
  {
    id: "E1",
    file: "draft_e1.txt",
    claims: [
      "The team has grown to 14 investment professionals in London",
      "8 in Munich",
    ],
  },
  {
    id: "E2",
    file: "draft_e2.txt",
    claims: [
      "Around 60 percent of Fund IV investments were sourced bilaterally",
      "12 were sourced through auction",
    ],
  },
  {
    id: "E3",
    file: "draft_e3.txt",
    claims: [
      "Fund IV is marked at 1.9x gross MOIC",
      "Fund III at 1.7x",
    ],
  },
];

let failed = false;
for (const row of CASES) {
  const parent = (await readFile(path.join(DIR, row.file), "utf8")).trim();
  const compound = isCompoundCandidate(parent);
  const validated = validateClaimSpans(parent, row.claims);
  const claims = validated.ok ? validated.claims : [];
  const off = residualHasUnclaimedAnchor(parent, claims);
  const trad = off.anchors || [];
  const ok = compound && validated.ok && trad.length === 0 && off.blocked !== true;
  if (!ok) failed = true;
  console.log(
    `${row.id} compound=${compound} validated=${validated.ok} tradAnchors=${trad.length} offBlocked=${off.blocked} residual=${JSON.stringify(off.residual)}`
  );
  if (!ok) {
    console.log(`  FAIL reason=${validated.reason || "traditional-or-listed-anchor"}`);
  }
}

if (failed) {
  console.error("PRECHECK FAIL: a fixture is not testing an uncovered evaluative residual.");
  process.exit(1);
}
console.log("PRECHECK PASS: residuals have no traditional anchor.");
