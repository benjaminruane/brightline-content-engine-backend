#!/usr/bin/env node
/**
 * Stage 2 arm E (D + G boundary examples) and arm G (reference) on graded set.
 * Part 1 backstop read is in the report. Cache OFF. Live prompt untouched.
 *
 * Usage:
 *   node scripts/diagnostic/eval-ablation/run-arm-e-boundary-examples.mjs
 *
 * Expected cost: ~$1.30. Ceiling under $2.50.
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadLocalEnvFiles } from "../lib/env.mjs";
import { DIAG_ROOT, REPO_ROOT } from "../lib/paths.mjs";
import { resolveSourceText } from "../lib/sources.mjs";
import { fingerprintFromCompletion } from "./fingerprint.mjs";

loadLocalEnvFiles({ liveMeasurement: true });

const { callLLM, calculateLlmCostUsd, hasProviderApiKey } = await import(
  "../../../lib/observability.js"
);
const { STAGE_MODELS } = await import("../../../lib/qc/model-config.mjs");
const {
  applyRoundingToleranceBackstop,
  applyPeriodGateBackstop,
} = await import("../../../lib/qc/pipeline-v4/stage2-match-sources.mjs");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(DIAG_ROOT, "eval-ablation");
const STAGE2_PROMPT_PATH = path.join(REPO_ROOT, "lib/qc/pipeline-v4/prompts/stage2_v4.md");
const MERIDIAN_PATH = path.join(__dirname, "meridian_source.txt");
const CS_E3_SOURCE_PATH = path.join(
  DIAG_ROOT,
  "claim-spans/evaluative-accident/source_ic_memo.txt"
);
const PRIOR_ARM_D_PATH = path.join(OUT_DIR, "arm-d-examples-removed-rows.json");
const STAGE2_SEED = 1;

const EXPECTED = {
  A: {
    length: 12451,
    sha256: "c718c190315ec131946cfa73452d12f417a01117fc04e2b63daca8e1455d57fe",
  },
  D: {
    length: 6052,
    sha256: "bd1b4b2fea1716b75992b3bd80eb9a0b03db06d92289856ebd663065f3321367",
  },
  G: {
    length: 4195,
    sha256: "08e793df1977f120acdd3a3cf5aefc921fbac34ecfd0fe6aba707393f127a15f",
  },
};

const REPLACEMENT_SENTENCE =
  "Wording that adds no new checkable claim, including paraphrase, formatting, correct rounding, voice, and descriptive adjectives, does not by itself block confirmed.";

const EVALUATIVE_CLAIMS = `Evaluative claims
Descriptive wording is FRAMING when it characterises something the source already asserts. Framing does not block confirmed.
Descriptive wording is an ADDITIONAL CHECKABLE CLAIM when it asserts a comparison or ranking, a quantity or threshold, a causal relationship, or a level of risk or certainty, and the source does not state it. That makes the statement partially_confirmed even when every other fact matches.
Test: could a reader ask "compared to what?" or "according to whom?" and find no answer in the source? Then it is a checkable claim, not framing.`;

/** G boundary examples (verbatim from run-short-prompt.mjs). */
const EXAMPLE_1 = `1) Rounding → confirmed
Statement: 'Revenue grew to GBP 312 million, a compound annual growth rate of approximately 19 percent.'
Source: 'Revenue has grown to GBP 312 million … representing a compound annual growth rate of 18.6 percent.'
Correct classification: confirmed
Reasoning: 18.6 percent correctly rounds to approximately 19 percent on the same CAGR.`;

const EXAMPLE_3 = `3) Extra framing, same claim → confirmed
Statement: 'In summary, the Company combines a defensible competitive position in a specialised vertical with high switching costs.'
Source: 'NSH occupies a strong position in a deeply specialised vertical with high switching costs.'
Correct classification: confirmed
Reasoning: Substance matches. 'In summary' and 'defensible' do not add a separate checkable claim.`;

const EXAMPLE_3C = `3c) Ranking is a checkable claim → partially_confirmed
Statement: 'The fund returned 2.4x gross MOIC, placing it in the top quartile of European peers.'
Source: 'The fund returned 2.4x gross MOIC across seventeen exits.'
Correct classification: partially_confirmed
Reasoning: The MOIC matches. 'Top quartile of European peers' is a ranking the source does not state.`;

const G_BOUNDARY_EXAMPLES = [EXAMPLE_1, EXAMPLE_3, EXAMPLE_3C];

const CLASSIFICATION_DEFS_G = `Classification values

• "confirmed" — on a like-for-like basis (same metric, same frame, same entity-role), the source states the same substance as the statement, including paraphrase, formatting, correct rounding, and extra descriptive or framing words that are not additional checkable claims.

• "partially_confirmed" — the source supports part of the statement AND the draft asserts an additional checkable claim the source does not cover, OR the draft is genuinely broader in scope, OR there is a frame/period-role mismatch (vintage vs operating year; revenue vs GMV), OR the source confirms some facts and is silent on others. Mere adjectives, voice, or richer wording around a supported claim stay confirmed.

• "conflicting" — the source states something mutually exclusive with the draft on a like-for-like basis. This includes: a different named entity or ownership/context in the same role; a number that differs from the source's same-metric figure by more than rounding; a status/modality contradiction only when the draft asserts a definite completed action using invested, acquired, completed, sold, or exited, specific enough to be checkable, that the source directly shows as proposed, recommended, sought, or not yet done. Do not fire modality-conflict on "committed", "a new investment", "the fund holds", or other cover / deal-terms wording that names amount and vehicle without asserting that the transaction has already closed. Those follow ordinary support (confirmed or partial).

• "no_support" — the source does not address the claim at all. A related, narrower, or broader treatment of the same claim is partially_confirmed, not no_support. A non-factual procedural closer with no checkable claim (for example 'We recommend approval.') is no_support.`;

const JSON_SHAPE_G = `You classify whether a source supports a statement.
Return ONLY a JSON object:
{
  "periodAssessment": {
    "statementPeriod": "<normalised period the statement places the figure in, e.g. Q3 2010, FY2019, or null>",
    "sourcePeriod": "<normalised period the source attributes the figure to, resolving relative references like today or over the same period to a calendar period, or null>",
    "statementPeriodRole": "<figure_period | entity_vintage | null>",
    "sourcePeriodRole": "<figure_period | entity_vintage | null>"
  },
  "explanation": "<one to two sentences>",
  "classification": "<one of the four values below>",
  "passage": "<verbatim excerpt from the source>"
}`;

const L23_OLD =
  '• "confirmed" — on a like-for-like basis (same metric, same frame, same entity-role), the source states the same substance as the statement, including paraphrase, formatting, correct rounding, and extra descriptive or framing words that are not additional checkable claims.';
const L23_NEW =
  '• "confirmed" — on a like-for-like basis (same metric, same frame, same entity-role), the source states the same substance as the statement, including paraphrase, formatting, correct rounding.';
const L25_OLD =
  '• "partially_confirmed" — the source supports part of the statement AND the draft asserts an additional checkable claim the source does not cover, OR the draft is genuinely broader in scope, OR there is a frame/period-role mismatch (vintage vs operating year; revenue vs GMV), OR the source confirms some facts and is silent on others. Mere adjectives, voice, or richer wording around a supported claim stay confirmed.';
const L25_NEW =
  '• "partially_confirmed" — the source supports part of the statement AND the draft asserts an additional checkable claim the source does not cover, OR the draft is genuinely broader in scope, OR there is a frame/period-role mismatch (vintage vs operating year; revenue vs GMV), OR the source confirms some facts and is silent on others.';
const EXAMPLE_2_DEL = `2) Extra framing, same claim → confirmed
Statement: 'We see significant headroom to accelerate growth through marketing investment, international expansion, and continued development of the App Store ecosystem.'
Source: 'There is significant headroom to accelerate growth through marketing, international expansion, and the App Store.'
Correct classification: confirmed
Reasoning: The source supports the same growth-headroom claim. Extra wording is framing, not a new checkable fact.`;
const EXAMPLE_3_DEL = `3) Extra framing, same claim → confirmed
Statement: 'In summary, the Company combines a defensible competitive position in a specialised vertical with high switching costs.'
Source: 'NSH occupies a strong position in a deeply specialised vertical with high switching costs.'
Correct classification: confirmed
Reasoning: Substance matches. 'In summary' and 'defensible' do not add a separate checkable claim.`;
const EXAMPLE_3B_DEL = `3b) Checkable fact matches → confirmed
Statement: 'The Company currently has 8 employees, including the founders, and 1.5 million monthly active users.'
Source: 'The team is six full-time employees plus two founders (eight people in total) and 1.5 million monthly active users.'
Correct classification: confirmed
Reasoning: The checkable counts match. Do not classify partially_confirmed while the explanation is that the fact matches.`;
const L143_OLD =
  "A difference in voice or grammatical person with the same underlying fact is confirmed.";
const L143_NEW = "A difference in voice or grammatical person is not a conflict.";
const L154_BOTH = `If the checkable facts match the source, classify confirmed even if the explanation mentions extra wording. Do not classify partially_confirmed while stating that the fact matches.
`;

/** Adjudication status per statement (Part 2). */
const ADJUDICATION = {
  EA_E2: "EXHIBIT_ADJUDICATED",
  CS_E3: "EXHIBIT_ADJUDICATED",
  F01_S10: "EXHIBIT_ADJUDICATED_FALSE_GREEN",
  F04_S20: "EXHIBIT_ADJUDICATED_FALSE_GREEN",
  F19_S7: "CONTROL_ADJUDICATED",
  EA_E3: "RECORDED_ONLY",
  EA_E1: "RECORDED_ONLY",
};

const EXHIBIT_IDS = ["EA_E2", "CS_E3", "F01_S10", "F04_S20"];

function sha256(s) {
  return createHash("sha256").update(s, "utf8").digest("hex");
}

function mustReplace(haystack, oldStr, newStr, label) {
  if (!haystack.includes(oldStr)) throw new Error(`Variant build: ${label} not found`);
  const next = haystack.replace(oldStr, newStr);
  if (next === haystack) throw new Error(`Variant build: ${label} no-op`);
  return next;
}

function mustDeleteBlock(haystack, block, label) {
  const wrapped = `\n\n${block}\n\n`;
  if (haystack.includes(wrapped)) return mustReplace(haystack, wrapped, "\n\n", label);
  if (haystack.includes(`\n\n${block}\n`)) {
    return mustReplace(haystack, `\n\n${block}\n`, "\n", label);
  }
  throw new Error(`Variant build: ${label} block not found`);
}

function renumberExamplesAndCrossRefs(prompt) {
  let p = prompt;
  const renumbers = [
    ["13) Procedural closer", "11) Procedural closer"],
    ["12) Magnitude beyond rounding", "10) Magnitude beyond rounding"],
    ["11c) Deal terms without a closed-transaction verb", "9c) Deal terms without a closed-transaction verb"],
    ["11b) Cover / opener sentence", "9b) Cover / opener sentence"],
    ["11) Status / modality", "9) Status / modality"],
    ["10) Ownership / context swap", "8) Ownership / context swap"],
    ["9) Entity swap in the same role", "7) Entity swap in the same role"],
    ["8) Future intent vs not-yet-in-dialogue", "6) Future intent vs not-yet-in-dialogue"],
    ["7) Vintage year vs operating year", "5) Vintage year vs operating year"],
    ["6) Added named party / extra checkable detail", "4) Added named party / extra checkable detail"],
    ["5) Related but narrower product", "3) Related but narrower product"],
    ["4) Scope-broadening", "2) Scope-broadening"],
  ];
  for (const [from, to] of renumbers) {
    if (!p.includes(from)) throw new Error(`Renumber missing ${from}`);
    p = p.replace(from, to);
  }
  p = mustReplace(
    p,
    "A same-metric number that differs by more than rounding is conflicting (example 12)",
    "A same-metric number that differs by more than rounding is conflicting (example 10)",
    "ex12"
  );
  p = mustReplace(
    p,
    "is conflicting (example 11), not voice.",
    "is conflicting (example 9), not voice.",
    "ex11"
  );
  p = mustReplace(
    p,
    "not a modality conflict (example 11b).",
    "not a modality conflict (example 9b).",
    "ex11b"
  );
  p = mustReplace(
    p,
    "is conflicting (examples 9 and 10).",
    "is conflicting (examples 7 and 8).",
    "ex9-10"
  );
  return p;
}

function buildArmB(baseline) {
  let p = baseline;
  p = mustReplace(p, L23_OLD, L23_NEW, "L23");
  p = mustReplace(p, L25_OLD, L25_NEW, "L25");
  p = mustDeleteBlock(p, EXAMPLE_2_DEL, "ex2");
  p = mustDeleteBlock(p, EXAMPLE_3_DEL, "ex3");
  p = mustDeleteBlock(p, EXAMPLE_3B_DEL, "ex3b");
  p = mustReplace(p, L143_OLD, L143_NEW, "L143");
  p = mustReplace(p, L154_BOTH, "", "L154");
  const insertAfter =
    '• "no_support" — the source does not address the claim at all. A related, narrower, or broader treatment of the same claim is partially_confirmed, not no_support. A non-factual procedural closer with no checkable claim (for example \'We recommend approval.\') is no_support.';
  p = p.replace(insertAfter, `${insertAfter}\n\n${REPLACEMENT_SENTENCE}`);
  return renumberExamplesAndCrossRefs(p).trim();
}

function buildArmC(armB) {
  const marker = "\n\nWorked examples\n";
  const idx = armB.indexOf(marker);
  if (idx < 0) throw new Error("Arm C: Worked examples marker missing");
  return (
    armB.slice(0, idx) + "\n\n" + EVALUATIVE_CLAIMS + marker + armB.slice(idx + marker.length)
  ).trim();
}

function buildArmD(armC) {
  const start = armC.indexOf("\n\nWorked examples\n");
  const end = armC.indexOf("\n\nNumeric rules\n");
  if (start < 0 || end <= start) throw new Error("Arm D: cannot locate examples block");
  let p = armC.slice(0, start) + armC.slice(end);
  const pointerReplacements = [
    ["classify confirmed (example 1).", "classify confirmed."],
    ["is conflicting (example 10), including", "is conflicting, including"],
    ["is conflicting (example 9), not voice.", "is conflicting, not voice."],
    ["not a modality conflict (example 9b).", "not a modality conflict."],
    ["is conflicting (examples 7 and 8).", "is conflicting."],
  ];
  for (const [from, to] of pointerReplacements) {
    if (!p.includes(from)) throw new Error(`Arm D pointer missing: ${from}`);
    p = p.replace(from, to);
  }
  if (p.includes("Worked examples")) throw new Error("Arm D still has Worked examples");
  return p.trim();
}

/** Arm E = arm D plus G's three boundary examples at G's position (after Evaluative claims). */
function buildArmE(armD) {
  const marker = "\n\nEvaluative claims\n";
  const idx = armD.indexOf(marker);
  if (idx < 0) throw new Error("Arm E: Evaluative claims block not found in D");
  // Find end of Evaluative claims block (next blank-line-separated heading).
  const afterEval = idx + marker.length;
  // Insert Worked examples + three G examples immediately after the Evaluative claims block.
  // G places them after EVALUATIVE_CLAIMS and before any Numeric rules. D has Numeric after Evaluative.
  const numericIdx = armD.indexOf("\n\nNumeric rules\n", afterEval);
  if (numericIdx < 0) throw new Error("Arm E: Numeric rules after Evaluative not found");
  const examplesBlock = [
    "Worked examples",
    "",
    EXAMPLE_1,
    "",
    EXAMPLE_3,
    "",
    EXAMPLE_3C,
  ].join("\n");
  const out = (
    armD.slice(0, numericIdx) +
    "\n\n" +
    examplesBlock +
    armD.slice(numericIdx)
  ).trim();
  if (!out.includes(EXAMPLE_3C)) throw new Error("Arm E missing ranking example 3c");
  if (!out.includes(EVALUATIVE_CLAIMS.split("\n")[0])) {
    throw new Error("Arm E lost Evaluative claims");
  }
  // G position: examples after Evaluative, before Numeric.
  if (out.indexOf("Evaluative claims") > out.indexOf("Worked examples")) {
    throw new Error("Arm E: Evaluative must precede Worked examples");
  }
  if (out.indexOf("Worked examples") > out.indexOf("Numeric rules")) {
    throw new Error("Arm E: Worked examples must precede Numeric rules");
  }
  return out;
}

function buildArmG() {
  return [
    JSON_SHAPE_G,
    "",
    CLASSIFICATION_DEFS_G,
    "",
    EVALUATIVE_CLAIMS,
    "",
    "Worked examples",
    "",
    EXAMPLE_1,
    "",
    EXAMPLE_3,
    "",
    EXAMPLE_3C,
  ].join("\n").trim();
}

function safeJsonParse(text) {
  const raw = String(text || "").trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(raw.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

function applyBackstops(parsed, statementText) {
  const classification =
    typeof parsed?.classification === "string" ? parsed.classification.trim() : null;
  const passage = typeof parsed?.passage === "string" ? parsed.passage : null;
  const explanation = typeof parsed?.explanation === "string" ? parsed.explanation : null;
  const periodAssessment = parsed?.periodAssessment ?? null;
  if (!classification) {
    return {
      classification: null,
      preBackstopClassification: null,
      passage,
      explanation,
      periodAssessment,
      backstopChanged: false,
    };
  }
  const preBackstopClassification = classification;
  const rounded = applyRoundingToleranceBackstop(
    { classification, passage, explanation, periodAssessment },
    { statementText, periodAssessment }
  );
  const gated = applyPeriodGateBackstop(
    {
      classification: rounded.classification,
      passage: rounded.passage,
      explanation: rounded.explanation,
      periodAssessment,
    },
    { statementText }
  );
  return {
    classification: gated.classification,
    preBackstopClassification,
    passage: gated.passage,
    explanation: gated.explanation,
    periodAssessment,
    backstopChanged: gated.classification !== preBackstopClassification,
  };
}

async function matchOnce({ systemPrompt, statement, sourceText, variantId, statementId, runIndex }) {
  const stageModel = STAGE_MODELS["stage2-matching"];
  const userPrompt = `Statement:
${statement}

Source:
${sourceText}`.trim();
  const completion = await callLLM({
    provider: stageModel.provider,
    model: stageModel.model,
    temperature: 0,
    seed: STAGE2_SEED,
    responseFormat: "json",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    traceName: "diag-eval-ablation-arm-e",
    spanName: "stage2-arm-e-boundary",
    metadata: { variantId, statementId, runIndex },
  });
  const parsed = safeJsonParse(completion?.text ?? "");
  const gated = applyBackstops(parsed, statement);
  const costUsd = calculateLlmCostUsd(stageModel.provider, stageModel.model, completion?.usage);
  return {
    classification: gated.classification,
    preBackstopClassification: gated.preBackstopClassification,
    backstopChanged: gated.backstopChanged,
    explanation: gated.explanation,
    passage: gated.passage,
    periodAssessment: gated.periodAssessment,
    systemFingerprint: fingerprintFromCompletion(completion),
    usage: {
      inputTokens: Number(completion?.usage?.inputTokens) || 0,
      outputTokens: Number(completion?.usage?.outputTokens) || 0,
    },
    costUsd: Number(costUsd) || 0,
  };
}

function pad(s, n) {
  const t = String(s ?? "");
  return t.length >= n ? t.slice(0, n) : t + " ".repeat(n - t.length);
}

function shortClass(c) {
  if (c === "confirmed") return "conf";
  if (c === "partially_confirmed") return "part";
  if (c === "conflicting") return "confl";
  if (c === "no_support") return "nosup";
  return String(c || "?");
}

async function loadSource(filename) {
  const { text, resolvedFrom } = await resolveSourceText(filename);
  return { text, resolvedFrom };
}

async function buildStatements() {
  const meridian = await readFile(MERIDIAN_PATH, "utf8");
  const csE3Source = await readFile(CS_E3_SOURCE_PATH, "utf8");
  const src = {};
  for (const f of [
    "01_bvp_shopify_memo.txt",
    "04_synth_vc_pinterest_style_memo.txt",
    "05_synth_competitor_press_release.pdf",
    "08_synth_industrial_buyout_memo.txt",
    "12_synth_linkedin_post.txt",
    "14_synth_thesis_only_memo.txt",
    "15_synth_very_long_memo.txt",
    "17_synth_real_estate_logistics.pdf",
    "18b_synth_cross_source_pair_update.txt",
    "19_synth_annual_report.pdf",
    "90_adversarial_b17_latent.txt",
    "91_adversarial_shopify_2010_trimmed.txt",
  ]) {
    src[f] = await loadSource(f);
  }

  /** baselineLabel = 2026-08-26 arm A / disk-cache label. correctLabel where adjudicated. */
  const statements = [
    {
      id: "EA_E2",
      role: "exhibit",
      adjudication: ADJUDICATION.EA_E2,
      baselineLabel: "confirmed",
      correctLabel: "partially_confirmed",
      statement:
        "The team's stability, with no senior departures across the last three fund cycles, means key-person risk is limited.",
      sourceText: meridian,
      sourceFile: "scripts/diagnostic/eval-ablation/meridian_source.txt",
      note: "eval-ablation E2 (NOT claim-spans E2)",
    },
    {
      id: "CS_E3",
      role: "exhibit",
      adjudication: ADJUDICATION.CS_E3,
      baselineLabel: "confirmed",
      correctLabel: "partially_confirmed",
      statement:
        "Fund IV is marked at 1.9x gross MOIC and Fund III at 1.7x, and that level speaks well of the manager's judgement.",
      sourceText: csE3Source,
      sourceFile: "scripts/diagnostic/claim-spans/evaluative-accident/source_ic_memo.txt",
      note: "claim-spans E3 (NOT eval-ablation E3)",
    },
    {
      id: "F01_S10",
      role: "exhibit",
      adjudication: ADJUDICATION.F01_S10,
      baselineLabel: "confirmed",
      correctLabel: "partially_confirmed",
      statement:
        "In summary, Shopify combines exceptional unit economics, a defensible competitive position, and clear growth runway.",
      sourceText: src["01_bvp_shopify_memo.txt"].text,
      sourceFile: src["01_bvp_shopify_memo.txt"].resolvedFrom,
      note: "promoted: baseline false green",
    },
    {
      id: "F04_S20",
      role: "exhibit",
      adjudication: ADJUDICATION.F04_S20,
      baselineLabel: "confirmed",
      correctLabel: "partially_confirmed",
      statement:
        "In summary, the Company combines exceptional engagement, a defensible consumer position, and a founder team in which we have high conviction.",
      sourceText: src["04_synth_vc_pinterest_style_memo.txt"].text,
      sourceFile: src["04_synth_vc_pinterest_style_memo.txt"].resolvedFrom,
      note: "promoted: baseline false green",
    },
    {
      id: "EA_E3",
      role: "recorded_only",
      adjudication: ADJUDICATION.EA_E3,
      baselineLabel: "confirmed",
      correctLabel: null,
      statement: "Fund IV has returned 1.9 times gross MOIC and a 24 per cent gross IRR.",
      sourceText: meridian,
      sourceFile: "scripts/diagnostic/eval-ablation/meridian_source.txt",
      note: "eval-ablation E3; no mark rule in any arm",
    },
    {
      id: "EA_E1",
      role: "recorded_only",
      adjudication: ADJUDICATION.EA_E1,
      baselineLabel: "partially_confirmed",
      correctLabel: null,
      statement:
        "It has realised a gross MOIC of 2.4 times across 17 exits, placing it in the top quartile of European lower-mid-market managers.",
      sourceText: meridian,
      sourceFile: "scripts/diagnostic/eval-ablation/meridian_source.txt",
      note: "eval-ablation E1; already partial at baseline",
    },
    {
      id: "F01_S7",
      role: "control",
      adjudication: "UNADJUDICATED",
      baselineLabel: "confirmed",
      correctLabel: null,
      statement:
        "We see significant headroom to accelerate growth through marketing investment, international expansion, and continued development of the App Store ecosystem.",
      sourceText: src["01_bvp_shopify_memo.txt"].text,
      sourceFile: src["01_bvp_shopify_memo.txt"].resolvedFrom,
    },
    {
      id: "F04_S13",
      role: "control",
      adjudication: "UNADJUDICATED",
      baselineLabel: "confirmed",
      correctLabel: null,
      statement:
        "The Company currently has 8 employees, including the founders, and 1.5 million monthly active users.",
      sourceText: src["04_synth_vc_pinterest_style_memo.txt"].text,
      sourceFile: src["04_synth_vc_pinterest_style_memo.txt"].resolvedFrom,
    },
    {
      id: "F12_S0",
      role: "control",
      adjudication: "UNADJUDICATED",
      baselineLabel: "confirmed",
      correctLabel: null,
      statement:
        "After more than four years of partnership, Meridian Capital has completed the sale of NorTech Industries to Brookfield this week.",
      sourceText: src["12_synth_linkedin_post.txt"].text,
      sourceFile: src["12_synth_linkedin_post.txt"].resolvedFrom,
    },
    {
      id: "F04_S1",
      role: "control",
      adjudication: "UNADJUDICATED",
      baselineLabel: "confirmed",
      correctLabel: null,
      statement:
        "We have committed USD 10 million in the Company's Series A at a pre-money valuation of USD 40 million, for approximately 20% on a fully-diluted basis.",
      sourceText: src["04_synth_vc_pinterest_style_memo.txt"].text,
      sourceFile: src["04_synth_vc_pinterest_style_memo.txt"].resolvedFrom,
    },
    {
      id: "F08_S0",
      role: "control",
      adjudication: "UNADJUDICATED",
      baselineLabel: "confirmed",
      correctLabel: null,
      statement:
        'We are writing to inform you of a new investment in Helvetia Precision Components (the "Company"), a Zurich-headquartered manufacturer of high-precision machined components for the medical devices, aerospace, and semiconductor end markets.',
      sourceText: src["08_synth_industrial_buyout_memo.txt"].text,
      sourceFile: src["08_synth_industrial_buyout_memo.txt"].resolvedFrom,
    },
    {
      id: "F92_S0",
      role: "control",
      adjudication: "UNADJUDICATED",
      baselineLabel: "confirmed",
      correctLabel: null,
      statement: "Shopify is a small startup serving approximately 10,000 customers.",
      sourceText: src["91_adversarial_shopify_2010_trimmed.txt"].text,
      sourceFile: src["91_adversarial_shopify_2010_trimmed.txt"].resolvedFrom,
    },
    {
      id: "F14_S4",
      role: "control",
      adjudication: "UNADJUDICATED",
      baselineLabel: "partially_confirmed",
      correctLabel: null,
      statement:
        "Second, payer willingness to reimburse digital health products has improved markedly across the major European markets.",
      sourceText: src["14_synth_thesis_only_memo.txt"].text,
      sourceFile: src["14_synth_thesis_only_memo.txt"].resolvedFrom,
    },
    {
      id: "F19_S7",
      role: "control",
      adjudication: ADJUDICATION.F19_S7,
      baselineLabel: "partially_confirmed",
      correctLabel: "partially_confirmed",
      statement:
        "Drift Logistics, our 2024 third-party logistics investment, faces a softer parcel volume environment (European parcel volumes down 3 percent year-on-year); the Company has nevertheless gained share, with revenue up 6 percent, but EBITDA margins have compressed from 14 to 12 percent.",
      sourceText: src["19_synth_annual_report.pdf"].text,
      sourceFile: src["19_synth_annual_report.pdf"].resolvedFrom,
      note: "adjudicated: baseline partial correct",
    },
    {
      id: "F12_S1",
      role: "control",
      adjudication: "UNADJUDICATED",
      baselineLabel: "partially_confirmed",
      correctLabel: null,
      statement:
        "NorTech is a Stockholm-headquartered manufacturer of industrial heating and cooling systems, and when we invested in 2021 it was a strong but underexposed business — dominant in the Nordics and barely visible elsewhere.",
      sourceText: src["12_synth_linkedin_post.txt"].text,
      sourceFile: src["12_synth_linkedin_post.txt"].resolvedFrom,
    },
    {
      id: "F14_S11",
      role: "control",
      adjudication: "UNADJUDICATED",
      baselineLabel: "partially_confirmed",
      correctLabel: null,
      statement:
        "We expect to bring a specific potential investment to consider over the coming months.",
      sourceText: src["14_synth_thesis_only_memo.txt"].text,
      sourceFile: src["14_synth_thesis_only_memo.txt"].resolvedFrom,
    },
    {
      id: "F18_S6",
      role: "control",
      adjudication: "UNADJUDICATED",
      baselineLabel: "partially_confirmed",
      correctLabel: null,
      statement:
        "The investment thesis is anchored on three pillars: a genuinely market-leading product (independent customer research rates the Company significantly higher than the principal Nordic competitor Yardi Nordic on usability and feature completeness), a structurally underpenetrated market (approximately 40% of Nordic property management companies still use legacy systems or spreadsheets), and an exceptional founder team led by CEO Mr. Erik Lindqvist and CTO Mr. Pekka Virtanen.",
      sourceText: src["18b_synth_cross_source_pair_update.txt"].text,
      sourceFile: src["18b_synth_cross_source_pair_update.txt"].resolvedFrom,
    },
    {
      id: "F15_S2",
      role: "control",
      adjudication: "UNADJUDICATED",
      baselineLabel: "conflicting",
      correctLabel: null,
      statement: "We have invested EUR 720 million of equity for an 84% stake.",
      sourceText: src["15_synth_very_long_memo.txt"].text,
      sourceFile: src["15_synth_very_long_memo.txt"].resolvedFrom,
    },
    {
      id: "F05_S5",
      role: "control",
      adjudication: "UNADJUDICATED",
      baselineLabel: "conflicting",
      correctLabel: null,
      statement:
        "During Westhaven's ownership, Norwell has invested significantly in advanced composite manufacturing capability.",
      sourceText: src["05_synth_competitor_press_release.pdf"].text,
      sourceFile: src["05_synth_competitor_press_release.pdf"].resolvedFrom,
    },
    {
      id: "F17_S9",
      role: "control",
      adjudication: "UNADJUDICATED",
      baselineLabel: "conflicting",
      correctLabel: null,
      statement:
        "Our value creation plan rests on capturing the embedded reversion as approximately 40 percent of leases roll during the hold period, executing a EUR 38 million value-add capex programme to modernise three older assets, and benefiting from continued rental growth and modest yield compression.",
      sourceText: src["17_synth_real_estate_logistics.pdf"].text,
      sourceFile: src["17_synth_real_estate_logistics.pdf"].resolvedFrom,
      note: "magnitude backstop is NOT a guarantee (see Part 1)",
    },
    {
      id: "F08_S2",
      role: "control",
      adjudication: "UNADJUDICATED",
      baselineLabel: "conflicting",
      correctLabel: null,
      statement:
        "We have invested EUR 480 million of equity for a 78% controlling stake, with the founding Schiller family and management retaining the balance.",
      sourceText: src["08_synth_industrial_buyout_memo.txt"].text,
      sourceFile: src["08_synth_industrial_buyout_memo.txt"].resolvedFrom,
    },
    {
      id: "F01_S11",
      role: "control",
      adjudication: "UNADJUDICATED",
      baselineLabel: "no_support",
      correctLabel: null,
      statement: "We recommend approval.",
      sourceText: src["01_bvp_shopify_memo.txt"].text,
      sourceFile: src["01_bvp_shopify_memo.txt"].resolvedFrom,
      note: "procedural closer backstop is statement-deterministic",
    },
    {
      id: "F90_S0",
      role: "control",
      adjudication: "UNADJUDICATED",
      baselineLabel: "no_support",
      correctLabel: null,
      statement: "The firm invested in Helios Grid Controls in 2024.",
      sourceText: src["90_adversarial_b17_latent.txt"].text,
      sourceFile: src["90_adversarial_b17_latent.txt"].resolvedFrom,
      note: "period gate is prompt-dependent on periodAssessment + class",
    },
  ];
  if (statements.length !== 23) throw new Error(`Expected 23, got ${statements.length}`);
  const controls = statements.filter((s) => s.role === "control");
  if (controls.length !== 17) throw new Error(`Expected 17 controls, got ${controls.length}`);
  return statements;
}

function movesOffConfirmed(rows, minOf = 2) {
  return rows.filter((r) => r.classification != null && r.classification !== "confirmed").length >= minOf;
}

function holdsBaseline(rows, baselineLabel, minOf = 2) {
  return rows.filter((r) => r.classification === baselineLabel).length >= minOf;
}

function sectionCharCounts(prompt) {
  const sections = [
    "JSON/opener",
    "Classification values",
    "Evaluative claims",
    "Worked examples",
    "Numeric rules",
    "Frame and period",
    "Voice",
    "Entity roles",
    "Mixed statements",
    "Parent / passage cap",
  ];
  // Simple length accounting for E vs G report
  const out = {};
  out.total = prompt.length;
  out.hasEvaluative = prompt.includes("Evaluative claims");
  out.hasWorkedExamples = prompt.includes("Worked examples");
  out.hasNumeric = prompt.includes("Numeric rules");
  out.hasFrame = prompt.includes("Frame and period");
  out.hasVoice = prompt.includes("\nVoice\n") || prompt.includes("Voice\n");
  out.hasEntity = prompt.includes("Entity roles");
  out.hasMixed = prompt.includes("Mixed statements");
  out.hasParent = prompt.includes("PARENT SENTENCE");
  out.hasReplacement = prompt.includes(REPLACEMENT_SENTENCE);
  out.hasFramingInConfirmedDef = prompt.includes(
    "extra descriptive or framing words that are not additional checkable claims"
  );
  out.exampleCount = [...prompt.matchAll(/^\d+[a-z]?\) /gm)].length;
  out.rankingExample = prompt.includes("Ranking is a checkable claim");
  void sections;
  return out;
}

async function main() {
  const stageModel = STAGE_MODELS["stage2-matching"];
  if (!hasProviderApiKey(stageModel.provider)) {
    throw new Error(`Missing API key for ${stageModel.provider}`);
  }

  const priorD = JSON.parse(await readFile(PRIOR_ARM_D_PATH, "utf8"));
  const driftExpected = {};
  for (const r of priorD.rows.filter((x) => x.variantId === "A")) {
    driftExpected[r.statementId] = r.classification;
  }

  const baseline = (await readFile(STAGE2_PROMPT_PATH, "utf8")).trim();
  const armB = buildArmB(baseline);
  const armC = buildArmC(armB);
  const armD = buildArmD(armC);
  const armE = buildArmE(armD);
  const armG = buildArmG();

  const variants = { A: baseline, D: armD, E: armE, G: armG };
  const promptMeta = {};
  for (const id of ["A", "D", "E", "G"]) {
    promptMeta[id] = { length: variants[id].length, sha256: sha256(variants[id]) };
  }

  for (const id of ["A", "D", "G"]) {
    if (
      promptMeta[id].sha256 !== EXPECTED[id].sha256 ||
      promptMeta[id].length !== EXPECTED[id].length
    ) {
      throw new Error(
        `Arm ${id} hash drift: got ${promptMeta[id].length} ${promptMeta[id].sha256}`
      );
    }
  }
  if (promptMeta.E.sha256 === promptMeta.D.sha256) {
    throw new Error("Arm E identical to D; examples not inserted");
  }
  if (promptMeta.E.sha256 === promptMeta.G.sha256) {
    throw new Error("Arm E identical to G; nesting broken");
  }

  console.log("Stage 2 arm E boundary examples + arm G graded-set probe");
  console.log(`Model: ${stageModel.provider}/${stageModel.model}`);
  console.log("Cache: OFF");
  console.log("Arm G is a REFERENCE arm (not nested from D).");
  console.log("");
  console.log("ARM HASHES AND LENGTHS");
  for (const id of ["A", "D", "E", "G"]) {
    console.log(`${id}  len=${promptMeta[id].length}  sha256=${promptMeta[id].sha256}`);
  }
  console.log("");
  console.log("G BOUNDARY EXAMPLES (verbatim, count=" + G_BOUNDARY_EXAMPLES.length + ")");
  for (const ex of G_BOUNDARY_EXAMPLES) {
    console.log("---");
    console.log(ex);
  }
  console.log("---");
  console.log("");

  const statements = await buildStatements();
  const rows = [];
  let totalCost = 0;
  let totalIn = 0;
  let totalOut = 0;

  console.log("DRIFT CHECK: arm A x1 vs 2026-08-26 labels");
  for (const st of statements) {
    process.stdout.write(`  ${st.id} x A r1 ... `);
    const result = await matchOnce({
      systemPrompt: variants.A,
      statement: st.statement,
      sourceText: st.sourceText,
      variantId: "A",
      statementId: st.id,
      runIndex: 1,
    });
    totalCost += result.costUsd;
    totalIn += result.usage.inputTokens;
    totalOut += result.usage.outputTokens;
    const expect = driftExpected[st.id];
    rows.push({
      statementId: st.id,
      role: st.role,
      adjudication: st.adjudication,
      baselineLabel: st.baselineLabel,
      correctLabel: st.correctLabel,
      variantId: "A",
      run: 1,
      classification: result.classification,
      preBackstopClassification: result.preBackstopClassification,
      backstopChanged: result.backstopChanged,
      explanation: result.explanation,
      passage: result.passage,
      systemFingerprint: result.systemFingerprint ?? null,
      usage: result.usage,
      costUsd: result.costUsd,
      statement: st.statement,
      sourceFile: st.sourceFile,
      note: st.note || null,
    });
    const ok = result.classification === expect;
    console.log(
      `${shortClass(result.classification)} expect=${shortClass(expect)} ${ok ? "OK" : "FAIL"} fp=${result.systemFingerprint || "null"} ($${result.costUsd.toFixed(4)})`
    );
  }

  const driftFails = rows
    .filter((r) => r.variantId === "A")
    .filter((r) => r.classification !== driftExpected[r.statementId])
    .map((r) => ({
      id: r.statementId,
      got: r.classification,
      expected: driftExpected[r.statementId],
    }));
  const driftPass = driftFails.length === 0;
  console.log("");
  console.log(driftPass ? "DRIFT CHECK PASS." : `DRIFT CHECK FAIL: ${driftFails.length}. STOP.`);
  if (!driftPass) console.log(JSON.stringify(driftFails, null, 2));

  let stoppingVerdict = null;
  let assessment = null;
  const matrix = {};
  const controlColumns = { E: [], G: [] };

  if (driftPass) {
    for (const vid of ["E", "G"]) {
      console.log("");
      console.log(`ARM ${vid} x3`);
      for (const st of statements) {
        for (let run = 1; run <= 3; run++) {
          process.stdout.write(`  ${st.id} x ${vid} r${run} ... `);
          const result = await matchOnce({
            systemPrompt: variants[vid],
            statement: st.statement,
            sourceText: st.sourceText,
            variantId: vid,
            statementId: st.id,
            runIndex: run,
          });
          totalCost += result.costUsd;
          totalIn += result.usage.inputTokens;
          totalOut += result.usage.outputTokens;
          rows.push({
            statementId: st.id,
            role: st.role,
            adjudication: st.adjudication,
            baselineLabel: st.baselineLabel,
            correctLabel: st.correctLabel,
            variantId: vid,
            run,
            classification: result.classification,
            preBackstopClassification: result.preBackstopClassification,
            backstopChanged: result.backstopChanged,
            explanation: result.explanation,
            passage: result.passage,
            systemFingerprint: result.systemFingerprint ?? null,
            usage: result.usage,
            costUsd: result.costUsd,
            statement: st.statement,
            sourceFile: st.sourceFile,
            note: st.note || null,
          });
          console.log(
            `${shortClass(result.classification)}${result.backstopChanged ? `(pre=${shortClass(result.preBackstopClassification)})` : ""} fp=${result.systemFingerprint || "null"} ($${result.costUsd.toFixed(4)})`
          );
        }
      }
    }

    for (const st of statements) {
      matrix[st.id] = { A: [], E: [], G: [] };
      matrix[st.id].A = [
        rows.find((r) => r.statementId === st.id && r.variantId === "A")?.classification ?? null,
      ];
      for (const vid of ["E", "G"]) {
        matrix[st.id][vid] = [1, 2, 3].map(
          (run) =>
            rows.find((r) => r.statementId === st.id && r.variantId === vid && r.run === run)
              ?.classification ?? null
        );
      }
    }

    for (const vid of ["E", "G"]) {
      for (const st of statements.filter((s) => s.role === "control")) {
        const armRows = rows.filter((r) => r.statementId === st.id && r.variantId === vid);
        const hold = holdsBaseline(armRows, st.baselineLabel, 2);
        controlColumns[vid].push({
          id: st.id,
          adjudication: st.adjudication,
          baselineLabel: st.baselineLabel,
          got: armRows.map((r) => r.classification),
          status: hold ? "HOLD" : "MOVED",
          backstopHeld: armRows.some((r) => r.backstopChanged),
        });
      }
    }

    function exhibitPrimary(vid) {
      return EXHIBIT_IDS.every((id) => {
        const armRows = rows.filter((r) => r.statementId === id && r.variantId === vid);
        return movesOffConfirmed(armRows, 2);
      });
    }
    function eaE2Moves(vid) {
      return movesOffConfirmed(
        rows.filter((r) => r.statementId === "EA_E2" && r.variantId === vid),
        2
      );
    }

    const ePrimary = exhibitPrimary("E");
    const gPrimary = exhibitPrimary("G");
    const eE2 = eaE2Moves("E");
    const gE2 = eaE2Moves("G");

    if (eE2) stoppingVerdict = "CONFIRM";
    else if (!eE2 && gE2) stoppingVerdict = "SPLIT";
    else stoppingVerdict = "STOP";

    const eSec = sectionCharCounts(variants.E);
    const gSec = sectionCharCounts(variants.G);

    assessment = {
      ePrimary,
      gPrimary,
      eE2,
      gE2,
      stoppingVerdict,
      sectionCompare: { E: eSec, G: gSec, deltaChars: promptMeta.E.length - promptMeta.G.length },
    };

    console.log("");
    console.log("MATRIX E");
    console.log(pad("stmt", 10) + pad("A", 6) + "E1 E2 E3");
    for (const st of statements) {
      console.log(
        pad(st.id, 10) +
          pad(shortClass(matrix[st.id].A[0]), 6) +
          matrix[st.id].E.map(shortClass).join(" ")
      );
    }
    console.log("");
    console.log("MATRIX G");
    console.log(pad("stmt", 10) + pad("A", 6) + "G1 G2 G3");
    for (const st of statements) {
      console.log(
        pad(st.id, 10) +
          pad(shortClass(matrix[st.id].A[0]), 6) +
          matrix[st.id].G.map(shortClass).join(" ")
      );
    }
    console.log("");
    for (const vid of ["E", "G"]) {
      console.log(`CONTROLS ${vid}`);
      for (const c of controlColumns[vid]) {
        console.log(
          `  ${c.id}  ${c.status}  base=${c.baselineLabel}  got=${c.got.map(shortClass).join("/")}  adj=${c.adjudication}${c.backstopHeld ? " [backstop]" : ""}`
        );
      }
    }
    console.log("");
    console.log(`STOPPING VERDICT: ${stoppingVerdict}`);
    console.log(`E primary(4 exhibits off conf): ${ePrimary}; EA_E2: ${eE2}`);
    console.log(`G primary(4 exhibits off conf): ${gPrimary}; EA_E2: ${gE2}`);
  }

  const explanationFocus = {};
  for (const id of EXHIBIT_IDS) {
    explanationFocus[id] = {};
    for (const vid of ["A", "E", "G"]) {
      explanationFocus[id][vid] = rows
        .filter((r) => r.statementId === id && r.variantId === vid)
        .map((r) => ({
          run: r.run,
          classification: r.classification,
          explanation: r.explanation,
          systemFingerprint: r.systemFingerprint,
          backstopChanged: r.backstopChanged,
          preBackstopClassification: r.preBackstopClassification,
        }));
    }
  }

  const report = {
    meta: {
      probe: "stage2-arm-e-boundary-examples",
      model: `${stageModel.provider}/${stageModel.model}`,
      cache: "off",
      temperature: 0,
      seed: STAGE2_SEED,
      promptPath: "lib/qc/pipeline-v4/prompts/stage2_v4.md",
      meridianSource: "scripts/diagnostic/eval-ablation/meridian_source.txt",
      priorArmD: "arm-d-examples-removed-rows.json",
      gIsReferenceArm: true,
      totalCalls: rows.length,
      totalCostUsd: totalCost,
      totalInputTokens: totalIn,
      totalOutputTokens: totalOut,
      ranAt: new Date().toISOString(),
      promptMeta,
      gBoundaryExamples: G_BOUNDARY_EXAMPLES,
      gBoundaryExampleCount: G_BOUNDARY_EXAMPLES.length,
    },
    gradedSet: statements.map((s) => ({
      id: s.id,
      role: s.role,
      adjudication: s.adjudication,
      baselineLabel: s.baselineLabel,
      correctLabel: s.correctLabel,
      note: s.note || null,
    })),
    drift: { pass: driftPass, disagreements: driftFails },
    matrix,
    controlColumns,
    assessment,
    stoppingVerdict,
    explanationFocus,
    backstopHeld: rows
      .filter((r) => r.backstopChanged)
      .map((r) => ({
        statementId: r.statementId,
        variantId: r.variantId,
        run: r.run,
        pre: r.preBackstopClassification,
        post: r.classification,
      })),
    rows,
  };

  await mkdir(OUT_DIR, { recursive: true });
  const outPath = path.join(OUT_DIR, "arm-e-boundary-examples-rows.json");
  await writeFile(outPath, JSON.stringify(report, null, 2) + "\n");
  console.log("");
  console.log(`Measured cost: $${totalCost.toFixed(6)}`);
  console.log(`Wrote ${outPath}`);
  if (!driftPass) process.exitCode = 2;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
