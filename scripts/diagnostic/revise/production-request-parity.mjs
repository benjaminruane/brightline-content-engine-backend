#!/usr/bin/env node
/**
 * Parity run: ask Review the same question the app asks, using the captured
 * production request payload verbatim.
 *
 * Part 1  Six Reviews, three per arm. The captured payload is sent unchanged
 *         on the original arm; the revised arm swaps ONLY draftText.
 * Part 2  If parity is achieved, flip one field at a time back toward the
 *         shape the previous diagnostic sent, to isolate which field moves
 *         the verdict.
 *
 * Supersedes the request construction in production-false-green-rerun.mjs,
 * which built its own body and returned CANNOT REPRODUCE (2c17fbb).
 *
 * Usage:
 *   node scripts/diagnostic/revise/production-request-parity.mjs
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = path.join(__dirname, "fixtures");
const OUT_DIR = __dirname;

const PRODUCTION_URL =
  process.env.QC_REGRESSION_BASE_URL ||
  "https://brightline-content-engine-backend.vercel.app";

const RUNS_PER_ARM = 3;

const TARGET_NEEDLE = "Partners Group was attracted to this investment";
const STATEMENT_0_NEEDLE = "In June 2026, Partners Group committed to Meridian";
const PRODUCTION_UNSUPPORTED_SPAN =
  "Partners Group was attracted to this investment given Meridian Capital's";

// Exactly what production-false-green-rerun.mjs sent, for the field diff.
const PREVIOUS_DIAGNOSTIC_BODY = {
  draftText: "<original fixture>",
  outputType: "reporting_commentary",
  requiredVersion: "complete",
  authoringOrganisation: "Partners Group",
  options: {
    pipelineRoute: "v4",
    evidenceEnabled: true,
    editorialEnabled: false,
    complianceEnabled: false,
  },
  sources: [
    {
      text: "<source fixture>",
      label: "Meridian Fund V summary",
      name: "meridian_production_source.txt",
      title: "Meridian Fund V summary",
      sourceType: "uploaded",
    },
  ],
};

/* ------------------------------------------------------------------ *
 * Field diff
 * ------------------------------------------------------------------ */

function flatten(value, prefix = "", out = {}) {
  if (value === null || typeof value !== "object") {
    out[prefix] = value;
    return out;
  }
  if (Array.isArray(value)) {
    if (!value.length) out[prefix] = "[]";
    value.forEach((item, i) => flatten(item, `${prefix}[${i}]`, out));
    return out;
  }
  for (const [k, v] of Object.entries(value)) {
    flatten(v, prefix ? `${prefix}.${k}` : k, out);
  }
  return out;
}

function truncate(value, max = 60) {
  const s = typeof value === "string" ? value : JSON.stringify(value);
  if (s === undefined) return "(absent)";
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

function fieldDiff(captured, previous) {
  const a = flatten(captured);
  const b = flatten(previous);
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
  return keys.map((key) => {
    const inCaptured = Object.hasOwn(a, key);
    const inPrevious = Object.hasOwn(b, key);
    let status;
    if (inCaptured && !inPrevious) status = "ONLY IN APP REQUEST";
    else if (!inCaptured && inPrevious) status = "ONLY IN OLD DIAGNOSTIC";
    else if (JSON.stringify(a[key]) === JSON.stringify(b[key])) status = "same";
    else status = "DIFFERENT VALUE";
    return {
      key,
      status,
      captured: inCaptured ? truncate(a[key]) : "(absent)",
      previous: inPrevious ? truncate(b[key]) : "(absent)",
    };
  });
}

/* ------------------------------------------------------------------ *
 * Review calls
 * ------------------------------------------------------------------ */

async function postReview(body) {
  const url = `${PRODUCTION_URL.replace(/\/$/, "")}/api/analyse-statements`;
  const t0 = Date.now();
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let payload = null;
  try {
    payload = JSON.parse(text);
  } catch {
    payload = { parseError: true, rawText: text.slice(0, 2000) };
  }
  return { httpStatus: res.status, ms: Date.now() - t0, payload };
}

function normalizeForMatch(text) {
  return String(text || "")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function findStatement(statements, needle) {
  const list = Array.isArray(statements) ? statements : [];
  const key = normalizeForMatch(needle);
  return list.find((s) => normalizeForMatch(s?.text).includes(key)) || null;
}

function cardSummary(stmt) {
  if (!stmt) return null;
  const c = stmt.qcCard || {};
  return {
    text: stmt.text ?? "",
    supportState: c.supportState ?? null,
    displayVerdict: c.displayVerdict ?? null,
    concernLevel: c.concernLevel ?? null,
    unsupportedSpans: Array.isArray(c.unsupportedSpans) ? c.unsupportedSpans : [],
    reasoningParagraph: c.reasoningParagraph ?? c.evidenceSummary ?? null,
    stage2SourceFingerprints: c.stage2SourceFingerprints ?? null,
  };
}

async function reviewOnce(body, label) {
  const res = await postReview(body);
  const statements = Array.isArray(res.payload?.statements) ? res.payload.statements : [];
  const target = cardSummary(findStatement(statements, TARGET_NEEDLE));
  const statement0 = cardSummary(findStatement(statements, STATEMENT_0_NEEDLE));
  const hasProductionSpan = (target?.unsupportedSpans ?? []).some((s) =>
    normalizeForMatch(s?.text).includes(normalizeForMatch(PRODUCTION_UNSUPPORTED_SPAN))
  );
  console.log(
    `  ${label}: http=${res.httpStatus} stmts=${statements.length} ` +
      `target=${target?.displayVerdict ?? "?"} spans=${target?.unsupportedSpans.length ?? "?"} ` +
      `prodSpan=${hasProductionSpan} s0=${statement0?.displayVerdict ?? "?"}`
  );
  return {
    label,
    httpStatus: res.httpStatus,
    ms: res.ms,
    traceId: res.payload?.meta?.traceId ?? null,
    statementCount: statements.length,
    outputTypeEcho: res.payload?.meta?.reviewOptions ?? null,
    target,
    statement0,
    hasProductionSpan,
  };
}

/* ------------------------------------------------------------------ *
 * Part 2 field flips: captured payload, one field moved back toward the
 * old diagnostic's shape.
 * ------------------------------------------------------------------ */

function flipKeyNames(body) {
  const next = structuredClone(body);
  delete next.selectedTypes;
  delete next.versionType;
  next.outputType = "reporting_commentary";
  next.requiredVersion = "complete";
  return next;
}

function flipPublicationState(body) {
  const next = structuredClone(body);
  for (const s of next.sources) delete s.publicationState;
  return next;
}

function flipVersionId(body) {
  const next = structuredClone(body);
  delete next.versionId;
  return next;
}

function flipSourceIdentity(body) {
  const next = structuredClone(body);
  for (const s of next.sources) {
    delete s.kind;
    delete s.id;
    s.name = "meridian_production_source.txt";
    s.title = "Meridian Fund V summary";
    s.label = "Meridian Fund V summary";
    s.sourceType = "uploaded";
  }
  return next;
}

function flipEnableFlags(body) {
  const next = structuredClone(body);
  delete next.evidenceEnabled;
  delete next.editorialEnabled;
  delete next.complianceEnabled;
  next.options = {
    pipelineRoute: "v4",
    evidenceEnabled: true,
    editorialEnabled: false,
    complianceEnabled: false,
  };
  return next;
}

const FLIPS = [
  { id: "1_key_names", describe: "selectedTypes/versionType -> outputType/requiredVersion", apply: flipKeyNames },
  { id: "2_publication_state", describe: "drop source publicationState", apply: flipPublicationState },
  { id: "3_version_id", describe: "drop versionId", apply: flipVersionId },
  { id: "4_source_identity", describe: "drop source kind/id, old name/title/label/sourceType", apply: flipSourceIdentity },
  {
    id: "5_enable_flags",
    describe: "top-level enable flags -> options{} with editorial/compliance false",
    apply: flipEnableFlags,
  },
];

/* ------------------------------------------------------------------ *
 * Main
 * ------------------------------------------------------------------ */

async function main() {
  const capturedRaw = await readFile(
    path.join(FIXTURE_DIR, "meridian_production_request.json"),
    "utf8"
  );
  const captured = JSON.parse(capturedRaw);
  const revisedDraft = await readFile(
    path.join(FIXTURE_DIR, "meridian_production_revised.txt"),
    "utf8"
  );
  const originalFixture = (
    await readFile(path.join(FIXTURE_DIR, "meridian_production_original.txt"), "utf8")
  ).replace(/\s+$/, "");

  console.log("PAYLOAD CHECKS");
  console.log(`  captured draftText length ${captured.draftText.length}`);
  console.log(
    `  captured draftText === original fixture (trailing ws trimmed): ` +
      `${captured.draftText === originalFixture}`
  );
  console.log(`  revised fixture length ${revisedDraft.length}`);
  console.log(`  top-level keys: ${Object.keys(captured).join(", ")}`);
  console.log(`  source keys: ${Object.keys(captured.sources[0]).join(", ")}`);

  const diff = fieldDiff(captured, PREVIOUS_DIAGNOSTIC_BODY);
  console.log("");
  console.log("FIELD DIFF (captured app request vs previous diagnostic)");
  for (const row of diff) {
    if (row.status === "same") continue;
    console.log(`  [${row.status}] ${row.key}`);
    console.log(`      app: ${row.captured}`);
    console.log(`      old: ${row.previous}`);
  }

  // Part 1
  console.log("");
  console.log("PART 1  parity, six Reviews with the captured payload");
  const originalBody = captured;
  const revisedBody = { ...structuredClone(captured), draftText: revisedDraft };

  const runs = [];
  for (let run = 1; run <= RUNS_PER_ARM; run++) {
    runs.push({ arm: "original", run, ...(await reviewOnce(originalBody, `original/r${run}`)) });
  }
  for (let run = 1; run <= RUNS_PER_ARM; run++) {
    runs.push({ arm: "revised", run, ...(await reviewOnce(revisedBody, `revised/r${run}`)) });
  }

  const byArm = (arm) => runs.filter((r) => r.arm === arm);
  const countBy = (arm, pick) => {
    const out = {};
    for (const r of byArm(arm)) {
      const key = String(pick(r) ?? "null");
      out[key] = (out[key] || 0) + 1;
    }
    return out;
  };

  const originalTarget = countBy("original", (r) => r.target?.displayVerdict);
  const revisedTarget = countBy("revised", (r) => r.target?.displayVerdict);
  const originalProdSpan = byArm("original").filter((r) => r.hasProductionSpan).length;

  const parityAchieved =
    originalTarget.supported_partial === RUNS_PER_ARM && originalProdSpan === RUNS_PER_ARM;
  const verdict = parityAchieved ? "PARITY ACHIEVED" : "STILL CANNOT REPRODUCE";

  console.log("");
  console.log(`VERDICT ${verdict}`);
  console.log(`  original target ${JSON.stringify(originalTarget)}`);
  console.log(`  original runs carrying the production span: ${originalProdSpan} of ${RUNS_PER_ARM}`);
  console.log(`  revised  target ${JSON.stringify(revisedTarget)}`);

  const editFlips =
    parityAchieved && revisedTarget.supported_full === RUNS_PER_ARM
      ? "YES: removing 'and highly regarded' flips supported_partial -> supported_full, 3 of 3"
      : parityAchieved
        ? `NO / PARTIAL: revised arm is ${JSON.stringify(revisedTarget)}`
        : "not answerable, parity not achieved";
  console.log(`  does the edit flip it? ${editFlips}`);

  // Part 2
  let flipResults = null;
  if (parityAchieved) {
    console.log("");
    console.log("PART 2  one field at a time, back toward the old diagnostic");
    flipResults = [];
    for (const flip of FLIPS) {
      const body = flip.apply(originalBody);
      const res = await reviewOnce(body, flip.id);
      const explains = res.target?.displayVerdict !== "supported_partial" || !res.hasProductionSpan;
      flipResults.push({
        id: flip.id,
        describe: flip.describe,
        displayVerdict: res.target?.displayVerdict ?? null,
        hasProductionSpan: res.hasProductionSpan,
        statementCount: res.statementCount,
        unsupportedSpans: res.target?.unsupportedSpans ?? [],
        explainsVerdict: explains,
        run: res,
      });
      if (explains) {
        console.log(`  -> ${flip.id} EXPLAINS the verdict. Stopping.`);
        break;
      }
    }
  } else {
    console.log("");
    console.log("PART 2 skipped: parity not achieved.");
  }

  await writeFile(
    path.join(OUT_DIR, "production-request-parity.json"),
    `${JSON.stringify(
      {
        ranAt: new Date().toISOString(),
        productionUrl: PRODUCTION_URL,
        capturedPayloadKeys: Object.keys(captured),
        fieldDiff: diff,
        runsPerArm: RUNS_PER_ARM,
        originalTarget,
        revisedTarget,
        originalRunsWithProductionSpan: originalProdSpan,
        verdict,
        editFlipsVerdict: editFlips,
        flipResults,
        runs,
      },
      null,
      2
    )}\n`,
    "utf8"
  );
  console.log("");
  console.log("wrote production-request-parity.json");
}

main().catch((err) => {
  console.error("[production-request-parity] fatal:", err?.stack || err);
  process.exit(1);
});
