#!/usr/bin/env node
/**
 * R6.5 — Style-guide rule fixtures: editorial reviewer only, PASS/FAIL per Layer 2 rule id.
 */

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { loadLocalEnvFiles } from "./lib/env.mjs";
import { FIXTURES_DIR } from "./lib/paths.mjs";

loadLocalEnvFiles();
process.env.BRIGHTLINE_EDITORIAL_REVIEW = process.env.BRIGHTLINE_EDITORIAL_REVIEW || "1";

const { default: editorialRules } = await import("../../lib/rulebook/editorialRules.js");
const {
  getOutputTypeLabel,
  normalizeOutputType,
  normalizeVisibility,
  VISIBILITY,
} = await import("../../lib/output-intent.js");
const { normalizeEventType } = await import("../../lib/event-type.js");
const { runEditorialStyleReview } = await import("../../lib/qc/editorial-compliance-reviewer.mjs");
const { flushObservability } = await import("../../lib/observability.js");

const STYLE_FIXTURES_DIR = path.join(FIXTURES_DIR, "style-guide-rules");

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

  const violationText = statements.find((s) => s.includes(violationNeedle));
  const compliantText = statements.find((s) => s.includes(compliantNeedle));
  const twoItemText = twoItemNeedle ? statements.find((s) => s.includes(twoItemNeedle)) : null;

  if (!violationText || !compliantText) {
    return {
      ruleId,
      pass: false,
      detail: "fixture statements could not be matched to violation/compliant needles",
    };
  }

  async function reviewSentence(sentenceText, contextBefore, contextAfter) {
    return runEditorialStyleReview({
      sentenceText,
      outputType,
      outputTypeLabel: getOutputTypeLabel(outputType),
      requiredVersion,
      draftText: draft,
      eventType,
      evidenceExcerpt: null,
      contextBefore,
      contextAfter,
      evidenceBlock: "(No excerpt text available for this statement.)",
      editorialRules: editorialFiltered,
      outputSlug,
      statementIndex: 0,
    });
  }

  const violationResult = await reviewSentence(violationText, null, compliantText);
  const compliantResult = await reviewSentence(compliantText, violationText, twoItemText ?? null);
  let twoItemResult = null;
  if (twoItemText) {
    twoItemResult = await reviewSentence(twoItemText, compliantText, null);
  }

  const violationConcerns = violationResult?.editorialConcerns ?? [];
  const compliantConcerns = compliantResult?.editorialConcerns ?? [];
  const twoItemConcerns = twoItemResult?.editorialConcerns ?? [];

  const firedOnViolation = hasStyleRuleConcern(violationConcerns, ruleId);
  const silentOnCompliant = !hasStyleRuleConcern(compliantConcerns, ruleId);
  const silentOnTwoItem = twoItemText ? !hasStyleRuleConcern(twoItemConcerns, ruleId) : true;
  const pass = firedOnViolation && silentOnCompliant && silentOnTwoItem;

  let detail = "";
  if (!firedOnViolation) detail = "expected concern on violation statement";
  else if (!silentOnCompliant) detail = "unexpected concern on compliant statement";
  else if (!silentOnTwoItem) detail = "unexpected concern on two-item list statement";
  else detail = "violation flagged, compliant clean";

  return { ruleId, pass, detail, firedOnViolation, silentOnCompliant };
}

async function main() {
  const fixtures = await loadStyleGuideFixtures();
  if (fixtures.length === 0) {
    console.error("[style-guide] no fixtures in", STYLE_FIXTURES_DIR);
    process.exit(1);
  }

  console.log(`[style-guide] running ${fixtures.length} rule fixtures (editorial+style v4 path)…\n`);

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
      };
    }
    const status = result.pass ? "PASS" : "FAIL";
    if (result.pass) passCount += 1;
    console.log(`${status}  ${result.ruleId}  — ${result.detail}`);
    await flushObservability();
  }

  console.log(`\n[style-guide] ${passCount}/${fixtures.length} rules passed`);
  process.exit(passCount === fixtures.length ? 0 : 1);
}

main().catch((err) => {
  console.error("[style-guide] fatal:", err?.message || err);
  process.exit(1);
});
