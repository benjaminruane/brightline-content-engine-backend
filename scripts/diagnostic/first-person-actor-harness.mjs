#!/usr/bin/env node
/**
 * First-person actor substitution harness.
 *
 * Calls runEditorialStyleReview (v4 combined editorial+style path) on a small
 * set of first-person sentences, three live runs each. Cache is forced off:
 * the model's suggestion is the thing being measured.
 *
 * Expected cost (stated before any billed call):
 *   5 sentences x 3 runs = 15 gpt-4o combined editorial+style calls.
 *   Estimate ~$0.40 at ~8k input / 400 output tokens per call
 *   (gpt-4o $2.50 / $10.00 per 1M). Ceiling with one schema retry each: ~$0.80.
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
const {
  droppedModalityHedges,
  identifyAuthoringOrganisation,
  isAgentlessFirstPersonRecast,
  isFirstPersonActorRule,
  isLeaveFirstPersonInPlaceDirection,
} = await import("../../lib/qc/first-person-actor.mjs");

const RUNS_PER_CASE = 3;
const CALLS = 5 * RUNS_PER_CASE;
const EXPECTED_COST_USD = 0.4;
const COST_CEILING_USD = 0.8;
const HARD_STOP_USD = 2.0;

const NAMED_PREFIX =
  "In June 2025, Partners Group made a commitment to Meridian Capital Partners V.";

const CASES = [
  {
    id: "a",
    label: "subject judgement (attracted / in our view)",
    statement:
      "We were attracted to Meridian on the strength of a track record that is, in our view, genuinely exceptional.",
    namedOrg: true,
    expectObjectCase: false,
    expectUnnamedLeaveInPlace: false,
  },
  {
    id: "b",
    label: "subject judgement (believe / recommend)",
    statement:
      "On balance, we believe the fund should deliver returns broadly in line with its predecessor and we recommend the commitment.",
    namedOrg: true,
    expectObjectCase: false,
    expectUnnamedLeaveInPlace: false,
  },
  {
    id: "c",
    label: "object case (available to us)",
    statement:
      "The GP provided access to co-investments that would not otherwise have been available to us.",
    namedOrg: true,
    expectObjectCase: true,
    expectUnnamedLeaveInPlace: false,
  },
  {
    id: "d",
    label: "subject (we would note)",
    statement: "We would note that the pipeline is thin.",
    namedOrg: true,
    expectObjectCase: false,
    expectUnnamedLeaveInPlace: false,
  },
  {
    id: "e",
    label: "first person with no organisation named in the draft",
    statement:
      "We were attracted to the opportunity on the strength of a track record that is, in our view, genuinely exceptional.",
    namedOrg: false,
    expectObjectCase: false,
    expectUnnamedLeaveInPlace: true,
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

function draftForCase(testCase) {
  if (!testCase.namedOrg) return testCase.statement;
  return `${NAMED_PREFIX}\n\n${testCase.statement}`;
}

function firstPersonConcerns(concerns) {
  return (Array.isArray(concerns) ? concerns : []).filter((c) =>
    isFirstPersonActorRule(c?.concernCode, c?.rule)
  );
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

function stillHasFirstPerson(text) {
  return /\b(?:we|our|ours|us|we're|we've|we'll|we'd|ourselves)\b/i.test(String(text || ""));
}

function namesPartnersGroup(text) {
  return /\bPartners Group\b/i.test(String(text || ""));
}

function genericActor(text) {
  return /\bthe (?:firm|company|group|fund)\b/i.test(String(text || ""));
}

function scoreRun(testCase, result) {
  const concerns = result?.editorialConcerns ?? [];
  const fp = firstPersonConcerns(concerns);
  const flags = [];
  const texts = fp.flatMap(suggestionTexts);

  if (fp.length === 0) flags.push("no first_person_plural or voice_consistency concern");

  const agentless = texts.some((t) => isAgentlessFirstPersonRecast(t));
  if (agentless) flags.push("agentless recast");

  const modalityDrops = texts.flatMap((t) => droppedModalityHedges(testCase.statement, t));
  if (modalityDrops.length > 0) {
    flags.push(`modality changed (dropped: ${[...new Set(modalityDrops)].join(", ")})`);
  }

  if (testCase.expectObjectCase) {
    const resolved = texts.some((t) => /available to Partners Group/i.test(t));
    if (!resolved) flags.push("object case did not resolve to Partners Group");
  }

  if (testCase.namedOrg && !testCase.expectUnnamedLeaveInPlace && fp.length > 0) {
    const named = texts.some((t) => namesPartnersGroup(t));
    if (!named) flags.push("suggestion did not name Partners Group");
  }

  if (testCase.expectUnnamedLeaveInPlace) {
    const recastAway = texts.some((t) => {
      if (isLeaveFirstPersonInPlaceDirection(t)) return false;
      if (stillHasFirstPerson(t)) return false;
      return t.length > 0;
    });
    const invented = texts.some(
      (t) =>
        !isLeaveFirstPersonInPlaceDirection(t) &&
        (namesPartnersGroup(t) || genericActor(t))
    );
    if (recastAway) flags.push("recast instead of leaving first person in place");
    if (invented) flags.push("invented or generic actor on unnamed draft");
  }

  return {
    fired: fp.length > 0,
    codes: fp.map((c) => c.concernCode || c.rule),
    agentless,
    modalityDrops: [...new Set(modalityDrops)],
    flags,
  };
}

async function reviewStatement(statement, draft) {
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
    draftText: draft,
    eventType: null,
    evidenceExcerpt: null,
    contextBefore: draft === statement ? null : NAMED_PREFIX,
    contextAfter: null,
    evidenceBlock: "(No excerpt text available for this statement.)",
    editorialRules: editorialFiltered,
    outputSlug,
    statementIndex: 0,
  });
}

async function main() {
  console.log("FIRST-PERSON ACTOR HARNESS");
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

  const outputType = normalizeOutputType("reporting_commentary");
  const rows = [];

  for (const testCase of CASES) {
    const draft = draftForCase(testCase);
    const identified = identifyAuthoringOrganisation(draft);
    console.log(`\n========== CASE ${testCase.id}: ${testCase.label} ==========`);
    console.log(`Statement: ${testCase.statement}`);
    console.log(`Draft names actor: ${identified || "(none)"}`);

    for (let run = 1; run <= RUNS_PER_CASE; run += 1) {
      console.log(`\n--- case ${testCase.id} run ${run} ---`);
      const result = await reviewStatement(testCase.statement, draft);
      const concerns = result?.editorialConcerns ?? [];
      const fp = firstPersonConcerns(concerns);
      console.log(`verdict: ${result?.editorialVerdict ?? "(none)"}`);
      console.log(`all concern codes: ${concerns.map((c) => c.concernCode || c.rule).join(", ") || "(none)"}`);
      if (fp.length === 0) {
        console.log("first-person suggestedDirection: (none)");
        console.log("first-person suggestedRewrite: (none)");
      }
      for (const concern of fp) {
        console.log(`rule: ${concern.concernCode || concern.rule} (${concern.category || "?"})`);
        console.log(`suggestedDirection: ${quote(concern.suggestedDirection)}`);
        console.log(`suggestedRewrite: ${quote(concern.suggestedRewrite)}`);
        console.log(`note: ${quote(concern.note)}`);
      }
      const other = concerns.filter((c) => !isFirstPersonActorRule(c?.concernCode, c?.rule));
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
  let anyAgentless = false;
  let anyModality = false;
  for (const testCase of CASES) {
    const caseRows = rows.filter((r) => r.caseId === testCase.id);
    const agentlessRuns = caseRows.filter((r) => r.agentless).map((r) => r.run);
    const modalityRuns = caseRows.filter((r) => r.modalityDrops.length > 0).map((r) => r.run);
    if (agentlessRuns.length) anyAgentless = true;
    if (modalityRuns.length) anyModality = true;
    console.log(
      `case ${testCase.id}: fired=${caseRows.map((r) => (r.fired ? "Y" : "N")).join("/")} ` +
        `codes=${caseRows.map((r) => r.codes.join("|") || "-").join(" ; ")} ` +
        `agentless_runs=[${agentlessRuns.join(",") || "none"}] ` +
        `modality_runs=[${modalityRuns.join(",") || "none"}]`
    );
  }
  console.log(`any agentless recast: ${anyAgentless ? "YES" : "NO"}`);
  console.log(`any modality change: ${anyModality ? "YES" : "NO"}`);

  const failed = rows.filter((r) => r.flags.length > 0);
  if (failed.length > 0) {
    console.log(`\n${failed.length}/${rows.length} runs had flags.`);
    process.exit(1);
  }
  console.log(`\nAll ${rows.length} runs passed scoring.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("[first-person-actor-harness] fatal:", err?.message || err);
  process.exit(1);
});
