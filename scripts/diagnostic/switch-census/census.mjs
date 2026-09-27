#!/usr/bin/env node
/**
 * B339 throwaway. Read-only census of env reads, vacant card fields,
 * and the 27 September statement prefilter. No product imports that
 * call a model. Prints JSON to stdout.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { isCompoundCandidate } from "../../../lib/qc/claim-spans.mjs";
import { isClaimSpansEnabled } from "../../../lib/qc/claim-spans.mjs";
import { isStage2SpanEnabled } from "../../../lib/qc/pipeline-v4/stage2-match-sources.mjs";
import { isLlmCacheEnabled } from "../../../lib/qc/llm-cache.mjs";
import { isMultisourceCoverageEnabled } from "../../../lib/qc/coverage-union.mjs";
import { resolvePdfEngine } from "../../../lib/extract-text-from-source.mjs";
import { STAGE2_CONCURRENCY } from "../../../lib/qc/pipeline-v4/stage2-match-sources.mjs";
import { MAX_CLAIMS_PER_SENTENCE, MAX_DECOMPOSED_SENTENCES } from "../../../lib/qc/claim-spans.mjs";
import { FUNCTION_MAX_DURATION_MS } from "../../../lib/qc/request-budget.mjs";
import { EXTRACTION_TIMEOUT_MS, MAX_PDF_MB } from "../../../lib/extract-text-from-source.mjs";
import { ACTION_LIST_CONCURRENCY } from "../../../lib/revise-actions/run.mjs";
import { tpmDefaultForModel } from "../../../lib/qc/token-estimate.mjs";
import { RATE_LIMIT_MAX_ATTEMPTS, NOTHING_REVIEWED_RETRY_BOUND_MS } from "../../../lib/observability.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../../..");

const SKIP_DIR = new Set(["node_modules", ".git", "dist", "build", ".vercel", "coverage"]);

function walk(dir, out = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (SKIP_DIR.has(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (/\.(js|mjs|cjs)$/.test(e.name)) out.push(full);
  }
  return out;
}

const ENV_RE =
  /process\.env(?:\?\.|\.)([A-Z][A-Z0-9_]*)|process\.env\[(?:AUTHORING_ORGANISATION_ENV|"([A-Z][A-Z0-9_]*)"|'([A-Z][A-Z0-9_]*)')\]|env\?\.([A-Z][A-Z0-9_]*)|env\.([A-Z][A-Z0-9_]*)/g;

function collectEnvReads() {
  const files = [...walk(path.join(ROOT, "lib")), ...walk(path.join(ROOT, "api"))];
  const byName = new Map();
  for (const file of files) {
    const src = fs.readFileSync(file, "utf8");
    const rel = path.relative(ROOT, file);
    if (src.includes("AUTHORING_ORGANISATION_ENV") || src.includes('"AUTHORING_ORGANISATION"')) {
      const row = byName.get("AUTHORING_ORGANISATION") || { name: "AUTHORING_ORGANISATION", files: [] };
      if (!row.files.includes(rel)) row.files.push(rel);
      byName.set("AUTHORING_ORGANISATION", row);
    }
    ENV_RE.lastIndex = 0;
    let m;
    while ((m = ENV_RE.exec(src))) {
      const name = m[1] || m[2] || m[3] || m[4] || m[5];
      if (!name) continue;
      if (name === "AUTHORING_ORGANISATION_ENV") continue;
      const row = byName.get(name) || { name, files: [] };
      if (!row.files.includes(rel)) row.files.push(rel);
      byName.set(name, row);
    }
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

const SEP27 = [
  {
    id: "S1",
    text: "Like-for-like sales growth reached 12% for the period",
  },
  {
    id: "S4",
    text: "Following the refinancing, 3i recycled a portion of its proceeds to acquire an additional holding in the company in April 2024, increasing its stake to 56.7%.",
  },
  {
    id: "S119",
    text: "Action added 119 new stores",
  },
  {
    id: "S330",
    text: "remains on track to meet its target of 330 new stores for by end-2025.",
  },
];

function grepCount(root, pattern) {
  const files = walk(root);
  let hits = 0;
  const re = new RegExp(pattern);
  for (const file of files) {
    const src = fs.readFileSync(file, "utf8");
    if (re.test(src)) hits += 1;
  }
  return hits;
}

const envReads = collectEnvReads();

const deadModuleHits = {
  "lib/qc/llm-claim-extraction.mjs": grepCount(path.join(ROOT, "lib"), "llm-claim-extraction") +
    grepCount(path.join(ROOT, "api"), "llm-claim-extraction"),
  "lib/revise-actions/prompt.mjs buildFindingPrompt product callers":
    grepCount(path.join(ROOT, "lib"), "buildFindingPrompt") +
    grepCount(path.join(ROOT, "api"), "buildFindingPrompt"),
};

const out = {
  generatedAt: new Date().toISOString(),
  claimSpansDefaultOn: isClaimSpansEnabled(),
  stage2SpanDefaultOff: isStage2SpanEnabled() === false,
  llmCacheDefaultOn: isLlmCacheEnabled(),
  coverageUnionDefaultOff: isMultisourceCoverageEnabled() === false,
  pdfEngineDefault: resolvePdfEngine(),
  constants: {
    MAX_CLAIMS_PER_SENTENCE,
    MAX_DECOMPOSED_SENTENCES,
    STAGE2_CONCURRENCY,
    ACTION_LIST_CONCURRENCY,
    FUNCTION_MAX_DURATION_MS,
    EXTRACTION_TIMEOUT_MS,
    MAX_PDF_MB,
    RATE_LIMIT_MAX_ATTEMPTS,
    NOTHING_REVIEWED_RETRY_BOUND_MS,
    tpmGpt4o: tpmDefaultForModel("gpt-4o-2024-08-06"),
    tpmGpt51: tpmDefaultForModel("gpt-5.1-2025-11-13"),
    namesMatchJaccard: 0.6,
    duplicateTextJaccard: 0.85,
    duplicateOverlap: 0.8,
    excerptCapChars: 300,
  },
  sep27Prefilter: SEP27.map((row) => ({
    id: row.id,
    compoundCandidate: isCompoundCandidate(row.text),
    text: row.text,
  })),
  envReads,
  deadModuleHits,
};

process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
