#!/usr/bin/env node
/**
 * R6.5 — Style-guide rule fixtures: editorial reviewer only, PASS/FAIL per Layer 2 rule id.
 * B176: a fourth review when foreignSource is present (house-compliant statement, non-house source).
 */

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { loadLocalEnvFiles } from "./lib/env.mjs";
import { FIXTURES_DIR } from "./lib/paths.mjs";

loadLocalEnvFiles();
process.env.BRIGHTLINE_EDITORIAL_REVIEW = process.env.BRIGHTLINE_EDITORIAL_REVIEW || "1";

const capturedUsages = [];
const origFetch = globalThis.fetch;
if (typeof origFetch === "function") {
  globalThis.fetch = async (...args) => {
    const res = await origFetch(...args);
    try {
      const data = await res.clone().json();
      if (data && typeof data === "object" && data.usage) capturedUsages.push(data.usage);
    } catch {
      /* non-JSON */
    }
    return res;
  };
}

const { default: editorialRules } = await import("../../lib/rulebook/editorialRules.js");
const {
  getOutputTypeLabel,
  normalizeOutputType,
  normalizeVisibility,
  VISIBILITY,
} = await import("../../lib/output-intent.js");
const { normalizeEventType } = await import("../../lib/event-type.js");
const { runEditorialStyleReview } = await import("../../lib/qc/editorial-compliance-reviewer.mjs");
const { calculateLlmCostUsd, flushObservability } = await import("../../lib/observability.js");
const { STAGE_MODELS } = await import("../../lib/qc/model-config.mjs");

const STYLE_FIXTURES_DIR = path.join(FIXTURES_DIR, "style-guide-rules");
const CHECKS = [
  "firedOnViolation",
  "silentOnCompliant",
  "silentOnTwoItem",
  "silentOnForeignSource",
  "noIdenticalDirection",
];

const CANONICAL_TO_RULEBOOK_OUTPUT = {
  REPORTING_COMMENTARY: "reporting_commentary",
  INVESTOR_LETTER: "investor_letter",
  PRESS_RELEASE: "press_release",
  LINKEDIN_POST: "linkedin_post",
};

function rulebookOutputSlug(canonicalOt) {
  return CANONICAL_TO_RULEBOOK_OUTPUT[canonicalOt] ?? "reporting_commentary";
}

function rulebookVersionSlug(visibility) {
  return visibility === VISIBILITY.PUBLIC ? "public" : "complete";
}

function filterRulesForRun(rules, outputSlug, versionSlug) {
  return rules.filter((r) => {
    if (!Array.isArray(r.appliesTo) || !r.appliesTo.includes(outputSlug)) return false;
    if (r.appliesToVersion == null) return true;
    if (Array.isArray(r.appliesToVersion) && r.appliesToVersion.includes(versionSlug)) return true;
    return false;
  });
}

function splitDraftStatements(draft) {
  return String(draft ?? "")
    .split(/\n\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function hasStyleRuleConcern(concerns, ruleId) {
  if (!Array.isArray(concerns)) return false;
  return concerns.some(
    (c) =>
      c?.category === "style_guide" &&
      (c.concernCode === ruleId || c.rule === ruleId)
  );
}

function normalizeWs(s) {
  return String(s || "").replace(/\s+/g, " ").trim();
}

function hasIdenticalQuotedReplacement(direction) {
  const text = String(direction || "");
  if (!text) return false;
  const patterns = [
    /\breplace\s+(['"])([\s\S]*?)\1\s+with\s+(['"])([\s\S]*?)\3/gi,
    /\bchange\s+(['"])([\s\S]*?)\1\s+to\s+(['"])([\s\S]*?)\3/gi,
  ];
  for (const re of patterns) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text))) {
      if (normalizeWs(m[2]) === normalizeWs(m[4])) return true;
    }
  }
  return false;
}

function noIdenticalDirectionAcross(reviewResults) {
  for (const result of reviewResults) {
    const concerns = result?.editorialConcerns ?? [];
    for (const c of concerns) {
      if (hasIdenticalQuotedReplacement(c?.suggestedDirection)) return false;
    }
  }
  return true;
}

function concernDump(c) {
  return {
    rule: typeof c?.rule === "string" ? c.rule : null,
    concernCode: typeof c?.concernCode === "string" ? c.concernCode : null,
    category: typeof c?.category === "string" ? c.category : null,
    note: typeof c?.note === "string" ? c.note : null,
    concernText: typeof c?.concernText === "string" ? c.concernText : null,
    suggestedDirection: typeof c?.suggestedDirection === "string" ? c.suggestedDirection : null,
  };
}

function meteredSpendUsd() {
  const modelCfg = STAGE_MODELS["editorial-style-review"] ?? {};
  let total = 0;
  for (const usage of capturedUsages) {
    total += Number(calculateLlmCostUsd(modelCfg.provider || "openai", modelCfg.model, usage)) || 0;
  }
  return total;
}

/**
 * @returns {Promise<Array<{ filePath: string, data: object }>>}
 */
async function loadStyleGuideFixtures() {
  const names = (await readdir(STYLE_FIXTURES_DIR)).filter((n) => n.endsWith(".json")).sort();
  const out = [];
  for (const name of names) {
    const filePath = path.join(STYLE_FIXTURES_DIR, name);
    const data = JSON.parse(await readFile(filePath, "utf8"));
    out.push({ filePath, data });
  }
  return out;
}

/**
 * @param {object} fixture
 */
async function runFixture(fixture) {
  const ruleId = fixture.data.ruleId;
  const cfg = fixture.data.config ?? {};
  const outputType = normalizeOutputType(cfg.outputType);
  const requiredVersion = normalizeVisibility(cfg.requiredVersion);
  const eventType = normalizeEventType(cfg.eventType);
  const outputSlug = rulebookOutputSlug(outputType);
  const versionSlug = rulebookVersionSlug(requiredVersion);
  const editorialFiltered = filterRulesForRun(editorialRules, outputSlug, versionSlug);
  const draft = typeof fixture.data.draft === "string" ? fixture.data.draft : "";
  const statements = splitDraftStatements(draft);
  const violationNeedle = fixture.data.cases?.violationContains ?? "";
  const compliantNeedle = fixture.data.cases?.compliantContains ?? "";
  const twoItemNeedle = fixture.data.cases?.twoItemCompliantContains ?? "";
  const foreignSource =
    typeof fixture.data.foreignSource === "string" ? fixture.data.foreignSource.trim() : "";

  const violationText = statements.find((s) => s.includes(violationNeedle));
  const compliantText = statements.find((s) => s.includes(compliantNeedle));
  const twoItemText = twoItemNeedle ? statements.find((s) => s.includes(twoItemNeedle)) : null;

  if (!violationText || !compliantText) {
    return {
      ruleId,
      pass: false,
      detail: "fixture statements could not be matched to violation/compliant needles",
      firedOnViolation: false,
      silentOnCompliant: false,
      silentOnTwoItem: false,
      silentOnForeignSource: false,
      foreignSourceSkipped: !foreignSource,
      noIdenticalDirection: false,
      failedChecks: CHECKS.slice(),
      survived: [],
    };
  }

  const reviewArgs = {
    outputType,
    outputTypeLabel: getOutputTypeLabel(outputType),
    requiredVersion,
    draftText: draft,
    eventType,
    editorialRules: editorialFiltered,
    outputSlug,
    statementIndex: 0,
  };

  async function reviewSentence(sentenceText, contextBefore, contextAfter) {
    return runEditorialStyleReview({
      ...reviewArgs,
      sentenceText,
      evidenceExcerpt: null,
      contextBefore,
      contextAfter,
      evidenceBlock: "(No excerpt text available for this statement.)",
    });
  }

  async function reviewSentenceWithSource(sentenceText, source, contextBefore, contextAfter) {
    return runEditorialStyleReview({
      ...reviewArgs,
      sentenceText,
      evidenceExcerpt: source,
      contextBefore,
      contextAfter,
      evidenceBlock: source,
    });
  }

  const violationResult = await reviewSentence(violationText, null, compliantText);
  const compliantResult = await reviewSentence(compliantText, violationText, twoItemText ?? null);
  let twoItemResult = null;
  if (twoItemText) {
    twoItemResult = await reviewSentence(twoItemText, compliantText, null);
  }
  let foreignResult = null;
  const foreignSourceSkipped = !foreignSource;
  if (foreignSource) {
    foreignResult = await reviewSentenceWithSource(
      compliantText,
      foreignSource,
      violationText,
      twoItemText ?? null
    );
  }

  const violationConcerns = violationResult?.editorialConcerns ?? [];
  const compliantConcerns = compliantResult?.editorialConcerns ?? [];
  const twoItemConcerns = twoItemResult?.editorialConcerns ?? [];
  const foreignConcerns = foreignResult?.editorialConcerns ?? [];

  const firedOnViolation = hasStyleRuleConcern(violationConcerns, ruleId);
  const silentOnCompliant = !hasStyleRuleConcern(compliantConcerns, ruleId);
  const silentOnTwoItem = twoItemText ? !hasStyleRuleConcern(twoItemConcerns, ruleId) : true;
  const silentOnForeignSource = foreignSourceSkipped
    ? true
    : !hasStyleRuleConcern(foreignConcerns, ruleId);
  const noIdenticalDirection = noIdenticalDirectionAcross([
    violationResult,
    compliantResult,
    twoItemResult,
    foreignResult,
  ]);
  const pass =
    firedOnViolation &&
    silentOnCompliant &&
    silentOnTwoItem &&
    silentOnForeignSource &&
    noIdenticalDirection;

  const flags = {
    firedOnViolation,
    silentOnCompliant,
    silentOnTwoItem,
    silentOnForeignSource,
    noIdenticalDirection,
  };
  const failedChecks = CHECKS.filter((k) => !flags[k]);

  const survived = [];
  for (const c of compliantConcerns) {
    survived.push({ on: "compliant", ...concernDump(c) });
  }
  for (const c of foreignConcerns) {
    survived.push({ on: "foreign", ...concernDump(c) });
  }

  let detail = "";
  if (!pass) detail = `failed: ${failedChecks.join(", ")}`;
  else if (foreignSourceSkipped) {
    detail = "violation flagged, compliant clean, foreign-source SKIPPED, no identical direction";
  } else {
    detail = "violation flagged, compliant clean, silent on foreign source, no identical direction";
  }

  return {
    ruleId,
    pass,
    detail,
    firedOnViolation,
    silentOnCompliant,
    silentOnTwoItem,
    silentOnForeignSource,
    foreignSourceSkipped,
    noIdenticalDirection,
    failedChecks,
    survived,
  };
}

function checkMark(result, key) {
  if (key === "silentOnForeignSource" && result.foreignSourceSkipped) return "SKIPPED";
  return result[key] ? "Y" : "N";
}

async function main() {
  const fixtures = await loadStyleGuideFixtures();
  if (fixtures.length === 0) {
    console.error("[style-guide] no fixtures in", STYLE_FIXTURES_DIR);
    process.exit(1);
  }

  console.log(`[style-guide] running ${fixtures.length} rule fixtures (editorial+style v4 path)…\n`);

  const results = [];
  let passCount = 0;
  for (const fixture of fixtures) {
    let result;
    try {
      result = await runFixture(fixture);
    } catch (err) {
      result = {
        ruleId: fixture.data.ruleId ?? fixture.data.label,
        pass: false,
        detail: err?.message ? String(err.message) : String(err),
        firedOnViolation: false,
        silentOnCompliant: false,
        silentOnTwoItem: false,
        silentOnForeignSource: false,
        foreignSourceSkipped: false,
        noIdenticalDirection: false,
        failedChecks: CHECKS.slice(),
        survived: [],
      };
    }
    results.push(result);
    const status = result.pass ? "PASS" : "FAIL";
    if (result.pass) passCount += 1;
    const marks = CHECKS.map((k) => `${k}=${checkMark(result, k)}`).join(" ");
    console.log(`${status}  ${result.ruleId}  — ${result.detail}`);
    console.log(`       ${marks}`);
    for (const s of result.survived ?? []) {
      console.log(`SURVIVED ${JSON.stringify({ ruleId: result.ruleId, ...s })}`);
    }
    await flushObservability();
  }

  const totals = {};
  for (const k of CHECKS) {
    const counted = results.filter((r) => (k === "silentOnForeignSource" ? !r.foreignSourceSkipped : true));
    const ok = counted.filter((r) => r[k]).length;
    const skipped = k === "silentOnForeignSource" ? results.filter((r) => r.foreignSourceSkipped).length : 0;
    totals[k] = { ok, n: counted.length, skipped };
  }

  console.log("");
  for (const k of CHECKS) {
    const t = totals[k];
    const skipNote = t.skipped ? `  skipped=${t.skipped}` : "";
    console.log(`[style-guide] ${k}  ${t.ok}/${t.n}${skipNote}`);
  }
  const costUsd = meteredSpendUsd();
  console.log(`[style-guide] ${passCount}/${fixtures.length} rules passed`);
  console.log(`[style-guide] costUsd=${costUsd.toFixed(4)}  llmCalls=${capturedUsages.length}`);
  console.log(
    `[style-guide] RESULT_JSON ${JSON.stringify({
      passCount,
      fixtureCount: fixtures.length,
      costUsd,
      llmCalls: capturedUsages.length,
      totals,
      results: results.map((r) => ({
        ruleId: r.ruleId,
        pass: r.pass,
        firedOnViolation: r.firedOnViolation,
        silentOnCompliant: r.silentOnCompliant,
        silentOnTwoItem: r.silentOnTwoItem,
        silentOnForeignSource: r.silentOnForeignSource,
        foreignSourceSkipped: r.foreignSourceSkipped,
        noIdenticalDirection: r.noIdenticalDirection,
        failedChecks: r.failedChecks,
        survived: r.survived,
        detail: r.detail,
      })),
    })}`
  );
  process.exit(passCount === fixtures.length ? 0 : 1);
}

main().catch((err) => {
  console.error("[style-guide] fatal:", err?.message || err);
  process.exit(1);
});
