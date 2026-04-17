#!/usr/bin/env node
/**
 * QC regression runner — validates the displayed QC contract (V2):
 * qcCard.displayVerdict, qcCard.concernLevel, pattern-based reasoningParagraph,
 * meta.qcEvidenceAuthorities[0] alignment, optional downgrade / sentence aggregation.
 *
 * Loads tests/qc_regression_suite.json, POSTs each run to /api/analyse-statements,
 * saves full JSON to tests/output/<runName>.json, exits non-zero if any run fails.
 *
 * Base URL: QC_REGRESSION_BASE_URL or http://localhost:3000 (v3 default)
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveQcTestSourceFiles } from "../lib/resolve-qc-test-sources.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SUITE_PATH = path.join(ROOT, "tests", "qc_regression_suite.json");
const OUTPUT_DIR = path.join(ROOT, "tests", "output");
const QC_PIPELINE = process.env.QC_PIPELINE || "v3";
const USE_V3_ENDPOINT = QC_PIPELINE === "v3";
const BASE_URL = process.env.QC_REGRESSION_BASE_URL || "http://localhost:3000";
const RUN_QC_URL = `${BASE_URL.replace(/\/$/, "")}/api/analyse-statements`;

/** @param {unknown} v */
function parseExpectList(v) {
  if (v == null) return null;
  if (Array.isArray(v)) return v;
  if (typeof v === "string") return [v];
  return null;
}

function primaryStatement(payload) {
  const statements = payload?.statements;
  if (!Array.isArray(statements) || statements.length === 0) return null;
  return statements[0];
}

function extractCards(payload) {
  if (Array.isArray(payload?.qcCards)) return payload.qcCards;
  const statements = Array.isArray(payload?.statements) ? payload.statements : [];
  return statements
    .map((s) => s?.qcCard)
    .filter((card) => card && typeof card === "object");
}

function checkListPass(actual, expectedList, label) {
  if (expectedList == null || expectedList.length === 0) return { pass: true, note: "no expectation" };
  if (actual == null) return { pass: false, note: `${label}: missing` };
  const pass = expectedList.includes(actual);
  return {
    pass,
    note: pass ? "match" : `${label}: expected one of [${expectedList.join(", ")}], got ${actual}`,
  };
}

function assertSupportRefIdsUnique(qcCard, expect) {
  if (expect?.supportRefIdsUnique !== true) return null;
  const ids = qcCard?.supportRefIds;
  if (!Array.isArray(ids)) return { pass: false, note: "supportRefIdsUnique: no supportRefIds" };
  const seen = new Set();
  for (const id of ids) {
    if (seen.has(id)) return { pass: false, note: "supportRefIdsUnique: duplicate refId" };
    seen.add(id);
  }
  return { pass: true, note: "supportRefIdsUnique" };
}

function assertReasoningParagraphIncludes(qcCard, expect) {
  const arr = expect?.reasoningParagraphIncludes;
  if (!Array.isArray(arr) || arr.length === 0) return null;
  const p = qcCard?.reasoningParagraph;
  const str = typeof p === "string" ? p : "";
  for (const sub of arr) {
    if (typeof sub !== "string" || !str.includes(sub)) {
      return { pass: false, note: `reasoningParagraphIncludes: missing "${sub.slice(0, 40)}"` };
    }
  }
  return { pass: true, note: "reasoningParagraphIncludes" };
}

function assertReasoningParagraphIncludesAny(qcCard, expect) {
  const arr = expect?.reasoningParagraphIncludesAny;
  if (!Array.isArray(arr) || arr.length === 0) return null;
  const p = qcCard?.reasoningParagraph;
  const str = typeof p === "string" ? p : "";
  if (!str.trim()) return { pass: true, note: "reasoningParagraphIncludesAny (no paragraph)" };
  const pass = arr.some((sub) => typeof sub === "string" && str.includes(sub));
  return {
    pass,
    note: pass
      ? "reasoningParagraphIncludesAny"
      : `reasoningParagraphIncludesAny: none of [${arr.join(", ")}] in paragraph`,
  };
}

function assertReasoningParagraphExcludes(qcCard, expect) {
  const arr = expect?.reasoningParagraphExcludes;
  if (!Array.isArray(arr) || arr.length === 0) return null;
  const p = qcCard?.reasoningParagraph;
  const str = typeof p === "string" ? p : "";
  for (const sub of arr) {
    if (typeof sub === "string" && str.includes(sub)) {
      return { pass: false, note: `reasoningParagraphExcludes: found "${sub.slice(0, 40)}"` };
    }
  }
  return { pass: true, note: "reasoningParagraphExcludes" };
}

function assertPrimaryRefTitleIncludes(qcCard, expect) {
  const arr = expect?.primaryRefTitleIncludes;
  if (!Array.isArray(arr) || arr.length === 0) return null;
  const title = qcCard?.primaryRefTitle;
  const str = typeof title === "string" ? title : "";
  const pass = arr.some((sub) => typeof sub === "string" && str.includes(sub));
  return {
    pass,
    note: pass
      ? "primaryRefTitleIncludes"
      : `primaryRefTitleIncludes: none of [${arr.map((s) => s.slice(0, 20)).join(", ")}] in title`,
  };
}

function assertSupportRefTitlesInclude(qcCard, expect) {
  const arr = expect?.supportRefTitlesInclude;
  if (!Array.isArray(arr) || arr.length === 0) return null;
  const titles = Array.isArray(qcCard?.supportRefTitles) ? qcCard.supportRefTitles : [];
  for (const want of arr) {
    if (typeof want !== "string") continue;
    if (!titles.includes(want)) return { pass: false, note: `supportRefTitlesInclude: missing "${want.slice(0, 24)}"` };
  }
  return { pass: true, note: "supportRefTitlesInclude" };
}

function assertDraftSpanPresent(qcCard, expect) {
  if (expect?.draftSpanPresent !== true) return null;
  const ds = qcCard?.draftSpan;
  if (ds == null || typeof ds !== "object") return { pass: false, note: "draftSpan: missing" };
  const start = ds.startChar;
  const end = ds.endChar;
  if (typeof start !== "number" || typeof end !== "number" || start >= end) {
    return { pass: false, note: "draftSpan: invalid startChar/endChar" };
  }
  return { pass: true, note: "draftSpan" };
}

function assertHasConflict(qcCard, expect) {
  if (typeof expect?.hasConflict !== "boolean") return null;
  const actual = qcCard?.hasConflict === true;
  if (actual !== expect.hasConflict) {
    return { pass: false, note: `hasConflict: expected ${expect.hasConflict}, got ${actual}` };
  }
  return { pass: true, note: "hasConflict" };
}

function assertPrimaryExcerpt(qcCard, expect) {
  if (expect?.primaryExcerptPresent !== true && expect?.primaryExcerpt !== null) return null;
  const primaryExcerpt = qcCard?.primaryExcerpt ?? null;
  if (expect?.primaryExcerptPresent === true) {
    if (primaryExcerpt == null) return { pass: false, note: "primaryExcerpt: expected non-null" };
    return { pass: true, note: "primaryExcerpt non-null" };
  }
  if (expect?.primaryExcerpt === null) {
    if (primaryExcerpt !== null) return { pass: false, note: "primaryExcerpt: expected null" };
    return { pass: true, note: "primaryExcerpt null" };
  }
  return null;
}

/** Optional exact lengths for qcCard.supportRefIds / qcCard.citationHovers */
function assertRefAndHoverLengths(qcCard, expect) {
  if (expect?.supportRefIdsLength == null && expect?.citationHoversLength == null) return null;
  const refs = Array.isArray(qcCard?.supportRefIds) ? qcCard.supportRefIds.length : 0;
  const hovers = Array.isArray(qcCard?.citationHovers) ? qcCard.citationHovers.length : 0;
  if (expect?.supportRefIdsLength != null && refs !== expect.supportRefIdsLength) {
    return { pass: false, note: `supportRefIds.length: expected ${expect.supportRefIdsLength}, got ${refs}` };
  }
  if (expect?.citationHoversLength != null && hovers !== expect.citationHoversLength) {
    return { pass: false, note: `citationHovers.length: expected ${expect.citationHoversLength}, got ${hovers}` };
  }
  return { pass: true, note: "ref/hover lengths" };
}

/**
 * meta.qcEvidenceAuthorities[0] must align with qcCard and optional hasUsableExcerpt.
 */
function assertPrimaryAuthority(statement, qcCard, expect) {
  if (expect?.assertAuthority === false) return null;
  const auth = statement?.meta?.qcEvidenceAuthorities?.[0];
  if (!auth && (expect?.displayVerdict != null || expect?.hasUsableExcerpt != null)) {
    return { pass: false, note: "authority: missing meta.qcEvidenceAuthorities[0]" };
  }
  if (!auth) return null;

  const expDv = parseExpectList(expect?.displayVerdict);
  if (expDv != null && expDv.length > 0) {
    if (!expDv.includes(auth.displayVerdict)) {
      return {
        pass: false,
        note: `authority.displayVerdict: expected one of [${expDv.join(", ")}], got ${auth.displayVerdict}`,
      };
    }
    if (qcCard?.displayVerdict != null && auth.displayVerdict !== qcCard.displayVerdict) {
      return {
        pass: false,
        note: `authority.displayVerdict (${auth.displayVerdict}) !== qcCard.displayVerdict (${qcCard.displayVerdict})`,
      };
    }
  }

  if (expect?.hasUsableExcerpt != null && auth.hasUsableExcerpt !== expect.hasUsableExcerpt) {
    return {
      pass: false,
      note: `authority.hasUsableExcerpt: expected ${expect.hasUsableExcerpt}, got ${auth.hasUsableExcerpt}`,
    };
  }

  return { pass: true, note: "authority" };
}

/** Downgrade: no usable excerpt → empty refs/hovers and hasUsableExcerpt false */
function assertDowngrade(statement, qcCard, expect) {
  if (expect?.downgrade !== true) return null;
  const refs = Array.isArray(qcCard?.supportRefIds) ? qcCard.supportRefIds.length : 0;
  const hovers = Array.isArray(qcCard?.citationHovers) ? qcCard.citationHovers.length : 0;
  if (refs !== 0) return { pass: false, note: `downgrade: supportRefIds.length expected 0, got ${refs}` };
  if (hovers !== 0) return { pass: false, note: `downgrade: citationHovers.length expected 0, got ${hovers}` };
  const auth = statement?.meta?.qcEvidenceAuthorities?.[0];
  if (auth != null && auth.hasUsableExcerpt !== false) {
    return { pass: false, note: `downgrade: hasUsableExcerpt expected false, got ${auth.hasUsableExcerpt}` };
  }
  return { pass: true, note: "downgrade" };
}

function assertSentenceVerdict(statement, expect) {
  const want = expect?.sentenceVerdict;
  if (want == null) return null;
  const actual = statement?.sentence_verdict ?? null;
  if (actual !== want) {
    return { pass: false, note: `sentence_verdict: expected "${want}", got ${actual ?? "(none)"}` };
  }
  return { pass: true, note: "sentence_verdict" };
}

/**
 * Cross-statement QC checks (e.g. shopify_series_a_v1): min supported_full count, no conflict, concern none for selected verdicts.
 * @param {unknown} payload
 * @param {Record<string, unknown> | undefined} expect
 */
function assertAggregateStatementQc(payload, expect) {
  const agg = expect?.aggregateStatementQc;
  if (agg == null || typeof agg !== "object") return null;

  const statements = Array.isArray(payload?.statements)
    ? payload.statements
    : Array.isArray(payload?.qcCards)
      ? payload.qcCards.map((qcCard) => ({ qcCard }))
      : [];
  if (statements.length === 0) {
    return { pass: false, note: "aggregateStatementQc: no statements in payload" };
  }

  const minSupportedFull = agg.minSupportedFullCount;
  const noConflict = agg.noConflictVerdicts === true;
  const concernNoneFor = Array.isArray(agg.requireConcernNoneForVerdicts)
    ? agg.requireConcernNoneForVerdicts.filter((v) => typeof v === "string")
    : [];

  let supportedFullCount = 0;
  let conflictCount = 0;

  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i];
    const qc = stmt?.qcCard;
    const dv = qc?.displayVerdict ?? null;
    const cl = qc?.concernLevel ?? null;

    if (dv === "supported_full") supportedFullCount++;
    if (dv === "conflict") conflictCount++;

    if (concernNoneFor.length > 0 && dv != null && concernNoneFor.includes(dv)) {
      if (cl !== "none") {
        return {
          pass: false,
          note: `aggregateStatementQc: statement[${i}] displayVerdict=${dv} expected concernLevel none, got ${cl ?? "(none)"}`,
        };
      }
    }
  }

  if (typeof minSupportedFull === "number" && minSupportedFull > 0 && supportedFullCount < minSupportedFull) {
    return {
      pass: false,
      note: `aggregateStatementQc: minSupportedFullCount ${minSupportedFull}, got ${supportedFullCount}`,
    };
  }

  if (noConflict && conflictCount > 0) {
    return {
      pass: false,
      note: `aggregateStatementQc: noConflictVerdicts expected 0 conflict, got ${conflictCount}`,
    };
  }

  return { pass: true, note: "aggregateStatementQc" };
}

function runStructuralAssertions(statement, qcCard, expect) {
  const results = [];
  const checks = [
    () => assertSupportRefIdsUnique(qcCard, expect),
    () => assertReasoningParagraphIncludes(qcCard, expect),
    () => assertReasoningParagraphIncludesAny(qcCard, expect),
    () => assertReasoningParagraphExcludes(qcCard, expect),
    () => assertPrimaryRefTitleIncludes(qcCard, expect),
    () => assertSupportRefTitlesInclude(qcCard, expect),
    () => assertDraftSpanPresent(qcCard, expect),
    () => assertHasConflict(qcCard, expect),
    () => assertPrimaryExcerpt(qcCard, expect),
    () => assertRefAndHoverLengths(qcCard, expect),
    () => assertPrimaryAuthority(statement, qcCard, expect),
    () => assertDowngrade(statement, qcCard, expect),
    () => assertSentenceVerdict(statement, expect),
  ];
  for (const fn of checks) {
    const r = fn();
    if (r != null) results.push(r);
  }
  return results;
}

/** Explanation / structural pattern checks: OK if all assertions pass */
function explanationPatternSummary(structuralResults) {
  if (structuralResults.length === 0) return "—";
  return structuralResults.every((r) => r.pass) ? "OK" : "FAIL";
}

async function runOne(spec) {
  const requestBody = {
    draftText: spec.draft,
    options: { webEnabled: false },
  };
  if (Array.isArray(spec.sources) && spec.sources.length > 0) {
    requestBody.sources = spec.sources;
  } else if (Array.isArray(spec.sourceFiles) && spec.sourceFiles.length > 0) {
    const resolved = await resolveQcTestSourceFiles(spec.sourceFiles);
    if (resolved?.error) {
      throw new Error(`source resolution failed: ${resolved.error.message}`);
    }
    requestBody.sources = (resolved.sources || []).map((src, index) => ({
      text: src?.text ?? "",
      label: src?.title || src?.name || `Source ${index + 1}`,
      name: src?.name || src?.title || `Source ${index + 1}`,
      title: src?.title || src?.name || `Source ${index + 1}`,
      sourceType: src?.sourceType || "uploaded",
    }));
  }

  const res = await fetch(RUN_QC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestBody),
  });
  const payload = await res.json();
  const first = primaryStatement(payload);
  const cards = extractCards(payload);
  const qcCard = cards[0] ?? null;

  const expDv = parseExpectList(spec.expect?.displayVerdict);
  const expCl = parseExpectList(spec.expect?.concernLevel);

  const dvResult = checkListPass(qcCard?.displayVerdict ?? null, expDv, "displayVerdict");
  const clResult = checkListPass(qcCard?.concernLevel ?? null, expCl, "concernLevel");

  const structuralResults = qcCard ? runStructuralAssertions(first, qcCard, spec.expect) : [];
  const aggregateResult = assertAggregateStatementQc(payload, spec.expect);
  const patternSummary = explanationPatternSummary(structuralResults);
  const allStructuralPass = structuralResults.every((r) => r.pass);
  const firstStructuralFail = structuralResults.find((r) => !r.pass);
  const aggregatePass = aggregateResult == null || aggregateResult.pass;

  const corePass = dvResult.pass && clResult.pass;
  const pass = corePass && allStructuralPass && aggregatePass;
  const note = pass
    ? [dvResult.note, clResult.note, ...structuralResults.map((r) => r.note), aggregateResult?.note].filter((n) => n && n !== "match" && n !== "no expectation").join("; ") || "ok"
    : !dvResult.pass
      ? dvResult.note
      : !clResult.pass
        ? clResult.note
        : !aggregatePass
          ? aggregateResult?.note ?? "aggregate assertion failed"
          : firstStructuralFail?.note ?? "assertion failed";

  return {
    name: spec.name,
    expectedDisplayVerdict: expDv ? (expDv.length === 1 ? expDv[0] : expDv.join("|")) : "-",
    actualDisplayVerdict: qcCard?.displayVerdict ?? "(none)",
    expectedConcernLevel: expCl ? (expCl.length === 1 ? expCl[0] : expCl.join("|")) : "-",
    actualConcernLevel: qcCard?.concernLevel ?? "(none)",
    explanationPatterns: patternSummary,
    pass,
    note,
    payload,
    status: res.status,
  };
}

async function main() {
  console.log("regression: running against v3 endpoint");

  let suite;
  try {
    const raw = await readFile(SUITE_PATH, "utf8");
    suite = JSON.parse(raw);
  } catch (e) {
    console.error("Failed to load suite:", SUITE_PATH, e?.message);
    process.exit(1);
  }

  const runs = Array.isArray(suite?.runs) ? suite.runs : [];
  if (runs.length === 0) {
    console.error("No runs in suite.");
    process.exit(1);
  }

  await mkdir(OUTPUT_DIR, { recursive: true });

  const results = [];
  for (const run of runs) {
    try {
      const result = await runOne(run);
      results.push(result);
      const outPath = path.join(OUTPUT_DIR, `${run.name}.json`);
      await writeFile(outPath, JSON.stringify(result.payload, null, 2), "utf8");
    } catch (e) {
      const exp = run.expect ?? {};
      const expDv = parseExpectList(exp.displayVerdict);
      const expCl = parseExpectList(exp.concernLevel);
      results.push({
        name: run.name,
        expectedDisplayVerdict: expDv ? (expDv.length === 1 ? expDv[0] : expDv.join("|")) : "-",
        actualDisplayVerdict: "(error)",
        expectedConcernLevel: expCl ? (expCl.length === 1 ? expCl[0] : expCl.join("|")) : "-",
        actualConcernLevel: "(error)",
        explanationPatterns: "—",
        pass: false,
        note: e?.message || String(e),
        payload: null,
        status: null,
      });
    }
  }

  const passCount = results.filter((r) => r.pass).length;
  const failCount = results.length - passCount;

  console.log("\nQC regression (display QC contract)\n");
  console.log(
    "run".padEnd(28)
      + "exp DV".padEnd(18)
      + "act DV".padEnd(18)
      + "exp CL".padEnd(14)
      + "act CL".padEnd(14)
      + "patterns".padEnd(10)
      + "pass",
  );
  console.log("-".repeat(104));
  for (const r of results) {
    const line =
      (r.name ?? "").toString().padEnd(28)
      + (r.expectedDisplayVerdict ?? "-").toString().padEnd(18)
      + (r.actualDisplayVerdict ?? "-").toString().padEnd(18)
      + (r.expectedConcernLevel ?? "-").toString().padEnd(14)
      + (r.actualConcernLevel ?? "-").toString().padEnd(14)
      + (r.explanationPatterns ?? "—").toString().padEnd(10)
      + (r.pass ? "PASS" : "FAIL");
    console.log(line);
    if (!r.pass && r.note) console.log(`  └ ${(r.note ?? "").slice(0, 200)}`);
  }
  console.log("-".repeat(104));
  console.log(`Total: ${passCount} passed, ${failCount} failed. Outputs saved to ${OUTPUT_DIR}\n`);

  if (failCount > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
