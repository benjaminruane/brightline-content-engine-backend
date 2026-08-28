/**
 * The corpus baseline was measured on a serving configuration nobody recorded
 * at the time. This module names it, so a later run can tell whether its
 * comparison crosses two model configurations.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";

import { DIAG_ROOT } from "./paths.mjs";

export const FINGERPRINT_MANIFEST_PATH = path.join(DIAG_ROOT, "fingerprint-manifest.json");

/**
 * @returns {Promise<?object>} manifest, or null when it has not been built
 */
export async function loadFingerprintManifest() {
  try {
    return JSON.parse(await readFile(FINGERPRINT_MANIFEST_PATH, "utf8"));
  } catch {
    return null;
  }
}

/**
 * Every distinct Stage 2 fingerprint in the manifest baseline.
 * @param {?object} manifest
 * @returns {string[]}
 */
export function baselineFingerprints(manifest) {
  const list = Array.isArray(manifest?.stage2Fingerprints) ? manifest.stage2Fingerprints : [];
  return [...new Set(list.filter((v) => typeof v === "string" && v))].sort();
}

/**
 * Every systemFingerprint anywhere inside a pipeline result or artefact.
 * Deep rather than shaped, because harnesses hold results at different depths.
 *
 * @param {unknown} node
 * @returns {string[]}
 */
export function collectFingerprintsDeep(node) {
  const out = new Set();
  const walk = (value) => {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      for (const item of value) walk(item);
      return;
    }
    for (const [k, v] of Object.entries(value)) {
      if (k === "systemFingerprint" && typeof v === "string" && v.trim()) out.add(v.trim());
      else walk(v);
    }
  };
  walk(node);
  return [...out].sort();
}

/**
 * Banner for the top of a diagnostic report when the run's fingerprints are
 * not the ones the baseline was measured on. Returns "" when they match, when
 * the run reported none, or when there is no manifest to compare against.
 *
 * @param {{ runFingerprints: string[], manifest?: ?object }} args
 * @returns {string} markdown, empty when there is nothing to warn about
 */
export function fingerprintBanner({ runFingerprints, manifest } = {}) {
  const run = [...new Set((Array.isArray(runFingerprints) ? runFingerprints : []).filter(Boolean))].sort();
  const baseline = baselineFingerprints(manifest);
  if (run.length === 0 || baseline.length === 0) return "";

  const unseen = run.filter((fp) => !baseline.includes(fp));
  if (unseen.length === 0) return "";

  return [
    "> ## ⚠️ THIS COMPARISON CROSSES TWO MODEL CONFIGURATIONS",
    ">",
    `> Baseline measured on: \`${baseline.join("`, `")}\``,
    `> This run served by:   \`${run.join("`, `")}\``,
    ">",
    "> Stage 2 verdicts can differ between serving configurations with no code",
    "> change. Any delta below may be model drift rather than the thing under",
    `> test. Baseline manifest: \`${path.relative(DIAG_ROOT, FINGERPRINT_MANIFEST_PATH)}\`.`,
    "",
  ].join("\n");
}
