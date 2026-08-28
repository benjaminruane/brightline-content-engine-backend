#!/usr/bin/env node
/**
 * Write the fingerprint manifest for the corpus baseline.
 *
 * The graded corpus was measured before anything recorded which serving
 * configuration produced it. The Stage 2 cache rows carry systemFingerprint
 * per match, so the baseline can be dated retrospectively from them.
 *
 * Zero model calls. Reads artefacts already on disk.
 *
 * Usage: node scripts/diagnostic/build-fingerprint-manifest.mjs
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { BASELINE_PATH } from "./claim-spans/baseline-cache.mjs";
import { FINGERPRINT_MANIFEST_PATH } from "./lib/fingerprint-manifest.mjs";
import { DIAG_ROOT } from "./lib/paths.mjs";

/** Review artefacts that should carry fingerprints in their card JSON. */
const ARTEFACTS = [
  "eval-ablation/r3a-production-verify.json",
  "eval-ablation/r10-production-verify.json",
  "eval-ablation/r3a-corpus-blast-rows.json",
  "revise/condition-b-review.json",
];

function collectDeep(node, key, out) {
  if (!node || typeof node !== "object") return out;
  if (Array.isArray(node)) {
    for (const item of node) collectDeep(item, key, out);
    return out;
  }
  for (const [k, v] of Object.entries(node)) {
    if (k === key && typeof v === "string" && v.trim()) out.add(v.trim());
    else collectDeep(v, key, out);
  }
  return out;
}

async function readJson(file) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch {
    return null;
  }
}

async function main() {
  const baseline = await readJson(BASELINE_PATH);
  if (!baseline?.cases) {
    console.error(
      `[fingerprint-manifest] cannot read the Stage 2 baseline cache at ${BASELINE_PATH}.\n` +
        "It is gitignored, so it must exist locally to build the manifest."
    );
    process.exit(1);
  }

  const perCase = {};
  const undatable = [];
  for (const [caseId, entry] of Object.entries(baseline.cases)) {
    const set = collectDeep(entry, "systemFingerprint", new Set());
    if (set.size === 0) undatable.push({ artefact: "claim-spans/.baseline.json", id: caseId });
    else perCase[caseId] = [...set].sort();
  }

  const artefacts = {};
  for (const rel of ARTEFACTS) {
    const abs = path.join(DIAG_ROOT, rel);
    const json = await readJson(abs);
    if (!json) {
      undatable.push({ artefact: rel, reason: "not_readable" });
      continue;
    }
    const set = collectDeep(json, "systemFingerprint", new Set());
    if (set.size === 0) undatable.push({ artefact: rel, reason: "no_fingerprints_recorded" });
    else artefacts[rel] = [...set].sort();
  }

  const stage2Fingerprints = [
    ...new Set([...Object.values(perCase).flat(), ...Object.values(artefacts).flat()]),
  ].sort();

  const manifest = {
    generatedAt: new Date().toISOString(),
    note:
      "Serving configurations the corpus baseline was measured on, recovered " +
      "from systemFingerprint recorded per Stage 2 match. The corpus was not " +
      "re-run to produce this.",
    source: path.relative(DIAG_ROOT, BASELINE_PATH),
    stage2Model: "gpt-4o",
    stage2Fingerprints,
    caseCount: Object.keys(perCase).length,
    perCase,
    artefacts,
    undatable,
  };

  await writeFile(FINGERPRINT_MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  console.log(`[fingerprint-manifest] wrote ${FINGERPRINT_MANIFEST_PATH}`);
  console.log(`[fingerprint-manifest] cases dated: ${manifest.caseCount}`);
  console.log(`[fingerprint-manifest] distinct Stage 2 fingerprints: ${stage2Fingerprints.join(", ")}`);
  if (undatable.length) {
    console.log(`[fingerprint-manifest] undatable entries: ${undatable.length}`);
    for (const row of undatable) console.log(`  - ${row.artefact} ${row.reason ?? row.id ?? ""}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
