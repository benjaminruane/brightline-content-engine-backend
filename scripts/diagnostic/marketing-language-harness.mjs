#!/usr/bin/env node
/**
 * Marketing-language harness.
 *
 * Calls runEditorialStyleReview (v4 combined editorial+style path) on
 * hyperbole sentences, three live runs each. Cache is forced off: the model's
 * suggestion is the thing being measured.
 *
 * Expected cost (stated before any billed call):
 *   4 sentences x 3 runs = 12 gpt-4o combined editorial+style calls.
 *   Estimate ~$0.32 at ~8k input / 400 output tokens per call
 *   (gpt-4o $2.50 / $10.00 per 1M). Ceiling with one schema retry each: ~$0.64.
 *   Hard stop if that ceiling would exceed $2.00.
 */

import { loadLocalEnvFiles } from "./lib/env.mjs";

loadLocalEnvFiles({ liveMeasurement: true });
process.env.BRIGHTLINE_EDITORIAL_REVIEW = process.env.BRIGHTLINE_EDITORIAL_REVIEW || "1";

const { default: editorialRules } = await import("../../lib/rulebook/editorialRules.js");
const {
  getOutputTypeLabel,
  normalizeOutputType,
  normalizeVisibility,
  VISIBILITY,
} = await import("../../lib/output-intent.js");
const { runEditorialStyleReview } = await import("../../lib/qc/editorial-compliance-reviewer.mjs");
const { flushObservability, hasProviderApiKey } = await import("../../lib/observability.js");

const RUNS_PER_CASE = 3;
const CALLS = 4 * RUNS_PER_CASE;
const EXPECTED_COST_USD = 0.32;
const COST_CEILING_USD = 0.64;
const HARD_STOP_USD = 2.0;

const HYPE_RULE_IDS = new Set(["marketing_language_excess", "hyperbole_vs_qualitative"]);

const MILDER_RE =
  /\b(strong|solid|robust|compelling|notable|significant|impressive|attractive|good|high-quality|well-positioned|neutral|measured)\b/i;

const CASES = [
  {
    id: "a",
    label: "evidence follows in the sentence: expect deletion",
    statement:
      "Meridian has a track record that is genuinely exceptional: across Funds I to IV the manager realised 2.4x gross MOIC and 21% gross IRR on seventeen exits.",
    expectDeleteQuotes: ["genuinely exceptional", "exceptional"],
    expectKeepQuotes: null,
    expectKeepSubstantive: null,
  },
  {
    id: "b",
    label: "evaluation is the clause: expect keep-and-flag",
    statement:
      "It has seen no senior departures across three fund cycles, which in this market is a genuine differentiator.",
    expectDeleteQuotes: null,
    expectKeepQuotes: ["genuine differentiator"],
    expectKeepSubstantive: null,
  },
  {
    id: "c",
    label: "intensifier plus substantive word: delete intensifier, keep proprietary",
    statement: "The manager's origination is genuinely proprietary.",
    expectDeleteQuotes: ["genuinely"],
    expectKeepQuotes: null,
    expectKeepSubstantive: "proprietary",
  },
  {
    id: "d",
    label: "evaluation is the whole sentence, no evidence: expect keep-and-flag",
    statement: "The franchise is exceptionally strong.",
    expectDeleteQuotes: null,
    expectKeepQuotes: ["exceptionally strong", "exceptionally"],
    expectKeepSubstantive: null,
  },
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

function hypeConcerns(concerns) {
  return (Array.isArray(concerns) ? concerns : []).filter((c) => {
    const code = String(c?.concernCode || c?.rule || "").trim();
    return HYPE_RULE_IDS.has(code);
  });
}

function quote(value) {
  if (value == null || String(value).trim() === "") return "(none)";
  return String(value);
}

function suggestionTexts(concern) {
  const out = [];
  if (typeof concern?.suggestedDirection === "string" && concern.suggestedDirection.trim()) {
    out.push(concern.suggestedDirection.trim());
  }
  if (typeof concern?.suggestedRewrite === "string" && concern.suggestedRewrite.trim()) {
    out.push(concern.suggestedRewrite.trim());
  }
  return out;
}

function quotedPhraseRe(phrase) {
  const escaped = String(phrase).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`['"]${escaped}['"]`, "i");
}

function substitutesMilder(text) {
  const t = String(text || "");
  if (/the franchise is strong\b/i.test(t) && !/exceptionally strong/i.test(t)) return true;
  if (!/\breplace\b/i.test(t)) return false;
  if (!/\bwith\b/i.test(t)) return false;
  if (/with\s+'[^']*'/i.test(t) && MILDER_RE.test(t.match(/with\s+'([^']*)'/i)?.[1] || "")) return true;
  if (/with\s+"[^"]*"/i.test(t) && MILDER_RE.test(t.match(/with\s+"([^"]*)"/i)?.[1] || "")) return true;
  if (/with\s+a more (neutral|measured|moderate|muted|restrained|qualitative)/i.test(t)) return true;
  return false;
}

function beginsWith(text, verb) {
  return new RegExp(`^\\s*${verb}\\b`, "i").test(String(text || ""));
}

function scoreRun(testCase, result) {
  const concerns = result?.editorialConcerns ?? [];
  const hype = hypeConcerns(concerns);
  const flags = [];
  const texts = hype.flatMap(suggestionTexts);

  if (hype.length === 0) flags.push("no marketing_language_excess or hyperbole_vs_qualitative concern");

  if (texts.some((t) => substitutesMilder(t))) {
    flags.push("substituted a milder evaluative word");
  }

  if (testCase.expectDeleteQuotes) {
    const deleted = texts.some(
      (t) =>
        beginsWith(t, "Delete") &&
        testCase.expectDeleteQuotes.some((q) => quotedPhraseRe(q).test(t))
    );
    if (!deleted) flags.push(`did not Delete '${testCase.expectDeleteQuotes.join("' / '")}'`);
  }

  if (testCase.expectKeepQuotes) {
    const kept = texts.some(
      (t) =>
        beginsWith(t, "Keep") &&
        testCase.expectKeepQuotes.some((q) => quotedPhraseRe(q).test(t))
    );
    if (!kept) flags.push(`did not Keep '${testCase.expectKeepQuotes.join("' / '")}'`);
    if (
      texts.some(
        (t) =>
          beginsWith(t, "Delete") &&
          testCase.expectKeepQuotes.some((q) => quotedPhraseRe(q).test(t))
      )
    ) {
      flags.push("deleted the evaluation that should be kept and flagged");
    }
  }

  if (testCase.expectKeepSubstantive) {
    const dropped = texts.some(
      (t) =>
        beginsWith(t, "Delete") &&
        quotedPhraseRe(testCase.expectKeepSubstantive).test(t) &&
        !quotedPhraseRe(`genuinely ${testCase.expectKeepSubstantive}`).test(t)
    );
    const deletedBoth = texts.some((t) =>
      quotedPhraseRe(`genuinely ${testCase.expectKeepSubstantive}`).test(t) && beginsWith(t, "Delete")
    );
    if (dropped || deletedBoth) flags.push(`deleted substantive word '${testCase.expectKeepSubstantive}'`);
  }

  return {
    fired: hype.length > 0,
    codes: hype.map((c) => c.concernCode || c.rule),
    flags,
  };
}

async function reviewStatement(statement) {
  const outputType = normalizeOutputType("reporting_commentary");
  const requiredVersion = normalizeVisibility("complete");
  const outputSlug = rulebookOutputSlug(outputType);
  const versionSlug = rulebookVersionSlug(requiredVersion);
  const editorialFiltered = filterRulesForRun(editorialRules, outputSlug, versionSlug);
  return runEditorialStyleReview({
    sentenceText: statement,
    outputType,
    outputTypeLabel: getOutputTypeLabel(outputType),
    requiredVersion,
    draftText: statement,
    eventType: null,
    evidenceExcerpt: null,
    contextBefore: null,
    contextAfter: null,
    evidenceBlock: "(No excerpt text available for this statement.)",
    editorialRules: editorialFiltered,
    outputSlug,
    statementIndex: 0,
  });
}

async function main() {
  console.log("MARKETING-LANGUAGE HARNESS");
  console.log("Live measurement: LLM cache forced off.");
  console.log(
    `Expected cost: ${CALLS} gpt-4o combined editorial+style calls, ~$${EXPECTED_COST_USD.toFixed(2)} ` +
      `(ceiling ~$${COST_CEILING_USD.toFixed(2)} with retries).`
  );
  if (COST_CEILING_USD > HARD_STOP_USD) {
    console.error(
      `HARD STOP: ceiling $${COST_CEILING_USD} exceeds $${HARD_STOP_USD}. Refusing to bill.`
    );
    process.exit(1);
  }
  if (!hasProviderApiKey("openai")) {
    console.error("OPENAI_API_KEY is not set. Refusing to run.");
    process.exit(1);
  }

  const rows = [];

  for (const testCase of CASES) {
    console.log(`\n========== CASE ${testCase.id}: ${testCase.label} ==========`);
    console.log(`Statement: ${testCase.statement}`);

    for (let run = 1; run <= RUNS_PER_CASE; run += 1) {
      console.log(`\n--- case ${testCase.id} run ${run} ---`);
      const result = await reviewStatement(testCase.statement);
      const concerns = result?.editorialConcerns ?? [];
      const hype = hypeConcerns(concerns);
      console.log(`verdict: ${result?.editorialVerdict ?? "(none)"}`);
      console.log(`all concern codes: ${concerns.map((c) => c.concernCode || c.rule).join(", ") || "(none)"}`);
      if (hype.length === 0) {
        console.log("hype suggestedDirection: (none)");
        console.log("hype suggestedRewrite: (none)");
      }
      for (const concern of hype) {
        console.log(`rule: ${concern.concernCode || concern.rule} (${concern.category || "?"})`);
        console.log(`suggestedDirection: ${quote(concern.suggestedDirection)}`);
        console.log(`suggestedRewrite: ${quote(concern.suggestedRewrite)}`);
        console.log(`note: ${quote(concern.note)}`);
      }
      const other = concerns.filter((c) => !HYPE_RULE_IDS.has(String(c?.concernCode || c?.rule || "").trim()));
      for (const concern of other) {
        console.log(
          `other ${concern.concernCode || concern.rule} suggestedDirection: ${quote(concern.suggestedDirection)}`
        );
      }
      const scored = scoreRun(testCase, result);
      rows.push({ caseId: testCase.id, run, ...scored });
      console.log(`score: ${scored.flags.length === 0 ? "PASS" : `FLAGS: ${scored.flags.join("; ")}`}`);
      await flushObservability();
    }
  }

  console.log("\n========== SUMMARY ==========");
  let anyMilder = false;
  for (const testCase of CASES) {
    const caseRows = rows.filter((r) => r.caseId === testCase.id);
    const milderRuns = caseRows
      .filter((r) => r.flags.some((f) => /milder/i.test(f)))
      .map((r) => r.run);
    if (milderRuns.length) anyMilder = true;
    console.log(
      `case ${testCase.id}: fired=${caseRows.map((r) => (r.fired ? "Y" : "N")).join("/")} ` +
        `codes=${caseRows.map((r) => r.codes.join("|") || "-").join(" ; ")} ` +
        `milder_runs=[${milderRuns.join(",") || "none"}]`
    );
  }
  console.log(`any milder substitution: ${anyMilder ? "YES" : "NO"}`);

  const failed = rows.filter((r) => r.flags.length > 0);
  if (failed.length > 0) {
    console.log(`\n${failed.length}/${rows.length} runs had flags.`);
    process.exit(1);
  }
  console.log(`\nAll ${rows.length} runs passed scoring.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("[marketing-language-harness] fatal:", err?.message || err);
  process.exit(1);
});
