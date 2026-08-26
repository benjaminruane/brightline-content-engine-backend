#!/usr/bin/env node
/**
 * Stage 2 rewrite ladder: A x3, R1 x3, R2 x3, R3 x3 on the 23-statement graded set.
 * Base = arm C. Live stage2_v4.md untouched. Cache OFF.
 *
 * Usage:
 *   node scripts/diagnostic/eval-ablation/run-rewrite-ladder.mjs
 *
 * Expected cost: ~$3.00. Ceiling under $5.00.
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
const STAGE2_SEED = 1;

const EXPECTED = {
  A: {
    length: 12451,
    sha256: "c718c190315ec131946cfa73452d12f417a01117fc04e2b63daca8e1455d57fe",
  },
  C: {
    length: 11488,
    sha256: "4ca79b210193e9f5a58d7bf78a1be70903402ef221e4d27f06a6b59a97c0c6b4",
  },
};

const REPLACEMENT_SENTENCE =
  "Wording that adds no new checkable claim, including paraphrase, formatting, correct rounding, voice, and descriptive adjectives, does not by itself block confirmed.";

const EVALUATIVE_CLAIMS = `Evaluative claims
Descriptive wording is FRAMING when it characterises something the source already asserts. Framing does not block confirmed.
Descriptive wording is an ADDITIONAL CHECKABLE CLAIM when it asserts a comparison or ranking, a quantity or threshold, a causal relationship, or a level of risk or certainty, and the source does not state it. That makes the statement partially_confirmed even when every other fact matches.
Test: could a reader ask "compared to what?" or "according to whom?" and find no answer in the source? Then it is a checkable claim, not framing.`;

/**
 * R1: frame/period/duration priority. Refined from the spec:
 * - added "or its evaluative wording" so the sentence outranks Evaluative claims
 * - added "and even when every other clause would otherwise confirm" so figures
 *   matching cannot override a frame/duration miss
 */
const FRAME_PERIOD_PRIORITY_FIRST_RUN = `Frame and period priority
Judge the period, vintage, duration or frame of a statement before judging its figures or its evaluative wording. If the statement attaches a period, vintage, duration or frame the source does not support, the statement is partially_confirmed even when every figure matches and even when every other clause would otherwise confirm.`;

/** PARTIAL fix after first ladder run (F12_S0). Not re-billed this pass. */
const FRAME_PERIOD_PRIORITY = `Frame and period priority
Judge the period, vintage, duration or frame of a statement before judging its figures or its evaluative wording. A duration, tenure, hold length, or partnership length that the source states differently, or does not state, is enough on its own: classify partially_confirmed even when the rest of the statement matches, including when the duration sits in an otherwise matching opener. If the statement attaches a period, vintage, duration or frame the source does not support, the statement is partially_confirmed even when every figure matches and even when every other clause would otherwise confirm.`;

/** R2: G example 3c only (verbatim). */
const EXAMPLE_3C = `3c) Ranking is a checkable claim → partially_confirmed
Statement: 'The fund returned 2.4x gross MOIC, placing it in the top quartile of European peers.'
Source: 'The fund returned 2.4x gross MOIC across seventeen exits.'
Correct classification: partially_confirmed
Reasoning: The MOIC matches. 'Top quartile of European peers' is a ranking the source does not state.`;

/**
 * R3: implication and risk. Refined from the spec:
 * - named "means" and "implies" as the cue
 * - kept the concrete risk / position / result / outcome list
 */
const IMPLICATION_RISK = `A conclusion drawn from a supported fact is a separate claim. If the statement says a fact means or implies that a risk is limited, a position is strong, a result is good, or an outcome is likely, the source must state that conclusion itself. The supporting fact matching is not enough.`;

/** Contingency rewrite of Evaluative claims as a test (used only if R1 fails F19_S7). */
const EVALUATIVE_CLAIMS_AS_TEST = `Evaluative claims
Ask: does this wording assert something a reviewer could check against the source as its own claim (a comparison, ranking, quantity, threshold, cause, risk level, certainty, or judgement), and the source does not state it? If yes, it is an additional checkable claim and the statement is partially_confirmed even when every other fact matches.
Ask: does this wording only restate or colour something the source already asserts, without adding a checkable claim? If yes, it is framing and does not block confirmed.
Do not treat the absence of a wording type from any list as a reason to confirm.`;

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

const FALSE_GREEN_IDS = ["EA_E2", "CS_E3", "F01_S10", "F04_S20", "F12_S0"];
const NOISE_FLOOR_IDS = new Set(["F12_S0", "F08_S2"]);

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
  p = mustReplace(p, insertAfter, `${insertAfter}\n\n${REPLACEMENT_SENTENCE}`, "replacement");
  p = renumberExamplesAndCrossRefs(p);
  return p.trim();
}

function buildArmC(armB) {
  const marker = "\n\nWorked examples\n";
  const idx = armB.indexOf(marker);
  if (idx < 0) throw new Error("Arm C: Worked examples not found");
  return (
    armB.slice(0, idx) + "\n\n" + EVALUATIVE_CLAIMS + marker + armB.slice(idx + marker.length)
  ).trim();
}

/** R1 = C + frame/period priority immediately before Evaluative claims. */
function buildR1(armC) {
  const marker = "\n\nEvaluative claims\n";
  const idx = armC.indexOf(marker);
  if (idx < 0) throw new Error("R1: Evaluative claims not found");
  return (
    armC.slice(0, idx) + "\n\n" + FRAME_PERIOD_PRIORITY_FIRST_RUN + marker + armC.slice(idx + marker.length)
  ).trim();
}

/** Contingency: R1 with Evaluative rewritten as a test (only if F19 fails on R1). */
function buildR1Contingency(armC) {
  const r1 = buildR1(armC);
  if (!r1.includes(EVALUATIVE_CLAIMS)) throw new Error("R1 contingency: missing evaluative");
  return mustReplace(r1, EVALUATIVE_CLAIMS, EVALUATIVE_CLAIMS_AS_TEST, "eval-as-test").trim();
}

/** R2 = R1 + example 3c only, after Evaluative claims, before Worked examples. */
function buildR2(r1) {
  const marker = "\n\nWorked examples\n";
  const idx = r1.indexOf(marker);
  if (idx < 0) throw new Error("R2: Worked examples not found");
  if (!r1.includes("Evaluative claims")) throw new Error("R2: missing Evaluative");
  if (r1.includes(EXAMPLE_3C)) throw new Error("R2: 3c already present");
  const block = `Worked example (evaluative boundary)\n\n${EXAMPLE_3C}`;
  return (r1.slice(0, idx) + "\n\n" + block + marker + r1.slice(idx + marker.length)).trim();
}

/** R3 = R2 + implication/risk sentence appended to Evaluative claims block. */
function buildR3(r2) {
  if (!r2.includes(EVALUATIVE_CLAIMS) && !r2.includes(EVALUATIVE_CLAIMS_AS_TEST)) {
    throw new Error("R3: Evaluative block missing");
  }
  if (r2.includes(IMPLICATION_RISK)) throw new Error("R3: implication already present");
  // Append after the Evaluative claims block (after its last line / test line).
  const evalBlock = r2.includes(EVALUATIVE_CLAIMS_AS_TEST)
    ? EVALUATIVE_CLAIMS_AS_TEST
    : EVALUATIVE_CLAIMS;
  const next = mustReplace(
    r2,
    evalBlock,
    `${evalBlock}\n${IMPLICATION_RISK}`,
    "implication"
  );
  return next.trim();
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
    traceName: "diag-eval-ablation-rewrite-ladder",
    spanName: "stage2-rewrite-ladder",
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

function shortClass(c) {
  if (c === "confirmed") return "conf";
  if (c === "partially_confirmed") return "part";
  if (c === "conflicting") return "confl";
  if (c === "no_support") return "nosup";
  return String(c || "?");
}

function holdsLabel(rows, label, minOf = 2) {
  return rows.filter((r) => r.classification === label).length >= minOf;
}

function offConfirmed(rows, minOf = 2) {
  return rows.filter((r) => r.classification && r.classification !== "confirmed").length >= minOf;
}

async function loadSource(filename) {
  const { text, resolvedFrom } = await resolveSourceText(filename);
  return { text, resolvedFrom };
}

/**
 * Part 1 annotations verified against stage2_v4.md worked examples.
 * PLANTED = near-copy of a worked example. Flips are memorisation checks.
 */
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

  return [
    {
      id: "EA_E2",
      role: "exhibit",
      plant: "INDEPENDENT",
      plantNote: null,
      adjudication: "EXHIBIT_ADJUDICATED",
      baselineLabel: "confirmed",
      correctLabel: "partially_confirmed",
      statement:
        "The team's stability, with no senior departures across the last three fund cycles, means key-person risk is limited.",
      sourceText: meridian,
      sourceFile: "scripts/diagnostic/eval-ablation/meridian_source.txt",
    },
    {
      id: "CS_E3",
      role: "exhibit",
      plant: "INDEPENDENT",
      plantNote: null,
      adjudication: "EXHIBIT_ADJUDICATED",
      baselineLabel: "confirmed",
      correctLabel: "partially_confirmed",
      statement:
        "Fund IV is marked at 1.9x gross MOIC and Fund III at 1.7x, and that level speaks well of the manager's judgement.",
      sourceText: csE3Source,
      sourceFile: "scripts/diagnostic/claim-spans/evaluative-accident/source_ic_memo.txt",
    },
    {
      id: "F01_S10",
      role: "exhibit",
      plant: "PLANTED",
      plantNote: "near-copy of example 3 In-summary/defensible shape (Shopify variant; not verbatim)",
      adjudication: "EXHIBIT_ADJUDICATED_FALSE_GREEN",
      baselineLabel: "confirmed",
      correctLabel: "partially_confirmed",
      statement:
        "In summary, Shopify combines exceptional unit economics, a defensible competitive position, and clear growth runway.",
      sourceText: src["01_bvp_shopify_memo.txt"].text,
      sourceFile: src["01_bvp_shopify_memo.txt"].resolvedFrom,
    },
    {
      id: "F04_S20",
      role: "exhibit",
      plant: "PLANTED",
      plantNote: "near-copy of example 3 In-summary/defensible shape (Pinterest variant; not verbatim)",
      adjudication: "EXHIBIT_ADJUDICATED_FALSE_GREEN",
      baselineLabel: "confirmed",
      correctLabel: "partially_confirmed",
      statement:
        "In summary, the Company combines exceptional engagement, a defensible consumer position, and a founder team in which we have high conviction.",
      sourceText: src["04_synth_vc_pinterest_style_memo.txt"].text,
      sourceFile: src["04_synth_vc_pinterest_style_memo.txt"].resolvedFrom,
    },
    {
      id: "EA_E3",
      role: "recorded_only",
      plant: "INDEPENDENT",
      plantNote: null,
      adjudication: "RECORDED_ONLY",
      baselineLabel: "confirmed",
      correctLabel: null,
      statement: "Fund IV has returned 1.9 times gross MOIC and a 24 per cent gross IRR.",
      sourceText: meridian,
      sourceFile: "scripts/diagnostic/eval-ablation/meridian_source.txt",
    },
    {
      id: "EA_E1",
      role: "recorded_only",
      plant: "INDEPENDENT",
      plantNote: null,
      adjudication: "RECORDED_ONLY",
      baselineLabel: "partially_confirmed",
      correctLabel: null,
      statement:
        "It has realised a gross MOIC of 2.4 times across 17 exits, placing it in the top quartile of European lower-mid-market managers.",
      sourceText: meridian,
      sourceFile: "scripts/diagnostic/eval-ablation/meridian_source.txt",
    },
    {
      id: "F01_S7",
      role: "control",
      plant: "PLANTED",
      plantNote: "verbatim example 2 statement",
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
      plant: "PLANTED",
      plantNote: "verbatim example 3b statement",
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
      role: "exhibit",
      plant: "INDEPENDENT",
      plantNote: "voice/duration fixture; not a worked-example copy",
      adjudication: "EXHIBIT_ADJUDICATED_FALSE_GREEN",
      baselineLabel: "confirmed",
      correctLabel: "partially_confirmed",
      statement:
        "After more than four years of partnership, Meridian Capital has completed the sale of NorTech Industries to Brookfield this week.",
      sourceText: src["12_synth_linkedin_post.txt"].text,
      sourceFile: src["12_synth_linkedin_post.txt"].resolvedFrom,
    },
    {
      id: "F04_S1",
      role: "control",
      plant: "PLANTED",
      plantNote: "near-copy of example 11c (adds fully-diluted 20%)",
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
      plant: "PLANTED",
      plantNote: "near-copy of example 11b (longer cover sentence)",
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
      plant: "INDEPENDENT",
      plantNote: null,
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
      plant: "PLANTED",
      plantNote: "near-copy of example 5 (adds Second, + major European markets)",
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
      plant: "PLANTED",
      plantNote: "near-copy of example 7 (expanded metrics); also CONTROL_ADJUDICATED",
      adjudication: "CONTROL_ADJUDICATED",
      baselineLabel: "partially_confirmed",
      correctLabel: "partially_confirmed",
      statement:
        "Drift Logistics, our 2024 third-party logistics investment, faces a softer parcel volume environment (European parcel volumes down 3 percent year-on-year); the Company has nevertheless gained share, with revenue up 6 percent, but EBITDA margins have compressed from 14 to 12 percent.",
      sourceText: src["19_synth_annual_report.pdf"].text,
      sourceFile: src["19_synth_annual_report.pdf"].resolvedFrom,
    },
    {
      id: "F12_S1",
      role: "control",
      plant: "PLANTED",
      plantNote: "near-copy of example 4 Nordics scope (expanded sentence)",
      adjudication: "UNADJUDICATED",
      baselineLabel: "partially_confirmed",
      correctLabel: null,
      statement:
        "NorTech is a Stockholm-headquartered manufacturer of industrial heating and cooling systems, and when we invested in 2021 it was a strong but underexposed business - dominant in the Nordics and barely visible elsewhere.",
      sourceText: src["12_synth_linkedin_post.txt"].text,
      sourceFile: src["12_synth_linkedin_post.txt"].resolvedFrom,
    },
    {
      id: "F14_S11",
      role: "control",
      plant: "PLANTED",
      plantNote: "verbatim example 8 statement",
      adjudication: "UNADJUDICATED",
      baselineLabel: "partially_confirmed",
      correctLabel: null,
      statement: "We expect to bring a specific potential investment to consider over the coming months.",
      sourceText: src["14_synth_thesis_only_memo.txt"].text,
      sourceFile: src["14_synth_thesis_only_memo.txt"].resolvedFrom,
    },
    {
      id: "F18_S6",
      role: "control",
      plant: "INDEPENDENT",
      plantNote: null,
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
      plant: "PLANTED",
      plantNote: "verbatim example 11 statement",
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
      plant: "PLANTED",
      plantNote: "verbatim example 10 statement",
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
      plant: "PLANTED",
      plantNote: "near-copy of example 12 (expanded value-creation plan)",
      adjudication: "UNADJUDICATED",
      baselineLabel: "conflicting",
      correctLabel: null,
      statement:
        "Our value creation plan rests on capturing the embedded reversion as approximately 40 percent of leases roll during the hold period, executing a EUR 38 million value-add capex programme to modernise three older assets, and benefiting from continued rental growth and modest yield compression.",
      sourceText: src["17_synth_real_estate_logistics.pdf"].text,
      sourceFile: src["17_synth_real_estate_logistics.pdf"].resolvedFrom,
    },
    {
      id: "F08_S2",
      role: "control",
      plant: "PLANTED",
      plantNote: "near-copy of example 6 numbers + example 11 modality verb (have invested)",
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
      plant: "PLANTED",
      plantNote: "verbatim example 13 statement",
      adjudication: "UNADJUDICATED",
      baselineLabel: "no_support",
      correctLabel: null,
      statement: "We recommend approval.",
      sourceText: src["01_bvp_shopify_memo.txt"].text,
      sourceFile: src["01_bvp_shopify_memo.txt"].resolvedFrom,
    },
    {
      id: "F90_S0",
      role: "control",
      plant: "INDEPENDENT",
      plantNote: null,
      adjudication: "UNADJUDICATED",
      baselineLabel: "no_support",
      correctLabel: null,
      statement: "The firm invested in Helios Grid Controls in 2024.",
      sourceText: src["90_adversarial_b17_latent.txt"].text,
      sourceFile: src["90_adversarial_b17_latent.txt"].resolvedFrom,
    },
  ];
}

async function main() {
  const stageModel = STAGE_MODELS["stage2-matching"];
  if (!hasProviderApiKey(stageModel.provider)) {
    throw new Error(`Missing API key for ${stageModel.provider}`);
  }

  const baseline = (await readFile(STAGE2_PROMPT_PATH, "utf8")).trim();
  const armB = buildArmB(baseline);
  const armC = buildArmC(armB);
  let r1 = buildR1(armC);
  let usedContingency = false;
  let r2 = buildR2(r1);
  let r3 = buildR3(r2);

  const variants = { A: baseline, C: armC, R1: r1, R2: r2, R3: r3 };
  const promptMeta = {};
  for (const id of Object.keys(variants)) {
    promptMeta[id] = { length: variants[id].length, sha256: sha256(variants[id]) };
  }

  if (promptMeta.A.sha256 !== EXPECTED.A.sha256) {
    throw new Error(`A hash mismatch: ${promptMeta.A.sha256}`);
  }
  if (promptMeta.C.sha256 !== EXPECTED.C.sha256) {
    throw new Error(`C hash mismatch: ${promptMeta.C.sha256}`);
  }
  const hashes = Object.values(promptMeta).map((m) => m.sha256);
  if (new Set(hashes).size !== hashes.length) {
    throw new Error("Arm hashes collide");
  }

  console.log("Stage 2 rewrite ladder R1/R2/R3");
  console.log(`Model: ${stageModel.provider}/${stageModel.model}`);
  console.log("Cache: OFF");
  console.log("");
  console.log("ARM HASHES AND LENGTHS");
  for (const id of ["A", "C", "R1", "R2", "R3"]) {
    console.log(`${id}  len=${promptMeta[id].length}  sha256=${promptMeta[id].sha256}`);
  }
  console.log("");
  console.log("R1 refinement: added 'or its evaluative wording' and");
  console.log("  'even when every other clause would otherwise confirm'");
  console.log("R3 refinement: added 'means or implies'");
  console.log("");

  const statements = await buildStatements();
  if (statements.length !== 23) throw new Error(`Expected 23, got ${statements.length}`);

  console.log("PLANTED vs INDEPENDENT");
  for (const st of statements) {
    console.log(`  ${st.id}  ${st.plant}${st.plantNote ? `  (${st.plantNote})` : ""}`);
  }
  console.log("");

  const rows = [];
  let totalCost = 0;
  let totalIn = 0;
  let totalOut = 0;

  async function runArm(vid, runs = 3) {
    console.log(`ARM ${vid} x${runs}`);
    for (let run = 1; run <= runs; run++) {
      for (const st of statements) {
        process.stdout.write(`  ${st.id} ${vid} r${run} ... `);
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
          plant: st.plant,
          plantNote: st.plantNote,
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
        });
        console.log(
          `${shortClass(result.classification)} fp=${result.systemFingerprint || "null"} ($${result.costUsd.toFixed(4)})`
        );
      }
    }
    console.log("");
  }

  // --- A x3 ---
  await runArm("A", 3);

  // Drift: stop only if adjudicated cell where correctLabel === baselineLabel
  // (truth equals A baseline) disagrees on majority. False greens are expected
  // confirmed on A. F12_S0 is noise-floor: note, do not stop.
  const aHardStops = [];
  const aNotes = [];
  for (const st of statements) {
    const aRows = rows.filter((r) => r.variantId === "A" && r.statementId === st.id);
    const labels = aRows.map((r) => r.classification);
    const majorityBaseline = holdsLabel(aRows, st.baselineLabel, 2);
    if (st.adjudication === "UNADJUDICATED" || st.adjudication === "RECORDED_ONLY") {
      if (!majorityBaseline) {
        aNotes.push({ id: st.id, labels, expectedBaseline: st.baselineLabel, note: "UNADJUDICATED drift; continue" });
      }
      continue;
    }
    if (NOISE_FLOOR_IDS.has(st.id)) {
      aNotes.push({ id: st.id, labels, note: "noise-floor cell; note and continue" });
      continue;
    }
    // False greens: A is expected to return baseline confirmed (wrong).
    if (st.correctLabel && st.correctLabel !== st.baselineLabel) {
      if (!majorityBaseline) {
        aNotes.push({
          id: st.id,
          labels,
          note: "false-green exhibit left baseline on A; continue",
        });
      }
      continue;
    }
    // Adjudicated where correct === baseline (F19_S7): must hold on A.
    if (st.correctLabel && st.correctLabel === st.baselineLabel) {
      if (!holdsLabel(aRows, st.correctLabel, 2)) {
        aHardStops.push({ id: st.id, labels, correctLabel: st.correctLabel });
      }
    }
  }

  console.log("A DRIFT NOTES");
  for (const n of aNotes) console.log(`  ${n.id}  ${JSON.stringify(n)}`);
  if (aHardStops.length) {
    console.log("A HARD STOP (adjudicated correct==baseline failed):");
    console.log(JSON.stringify(aHardStops, null, 2));
    throw new Error("Arm A disagreed on adjudicated correct==baseline cell; stopping");
  }
  console.log("A drift gate: no hard stop. Continuing.");
  console.log("");

  // --- R1 x3 ---
  await runArm("R1", 3);

  const f19R1 = rows.filter((r) => r.variantId === "R1" && r.statementId === "F19_S7");
  const f19Held = holdsLabel(f19R1, "partially_confirmed", 2);
  console.log(`R1 F19_S7 hold partial >=2/3: ${f19Held}  got=${f19R1.map((r) => shortClass(r.classification)).join("/")}`);

  if (!f19Held) {
    console.log("CONTINGENCY: R1 failed F19_S7. Rewriting Evaluative claims as a test.");
    usedContingency = true;
    r1 = buildR1Contingency(armC);
    variants.R1 = r1;
    promptMeta.R1 = { length: r1.length, sha256: sha256(r1) };
    console.log(`R1 contingency  len=${promptMeta.R1.length}  sha256=${promptMeta.R1.sha256}`);
    await runArm("R1", 3);
    const last3 = rows
      .filter((r) => r.variantId === "R1" && r.statementId === "F19_S7")
      .slice(-3);
    console.log(
      `R1 contingency F19_S7: ${last3.map((r) => shortClass(r.classification)).join("/")}`
    );
  }

  // Rebuild R2/R3 from the final R1 text (original or contingency).
  {
    const baseR1 = variants.R1;
    if (baseR1.includes(EXAMPLE_3C) || baseR1.includes(IMPLICATION_RISK)) {
      throw new Error("R1 variant unexpectedly contains R2/R3 content");
    }
    variants.R2 = buildR2(baseR1);
    variants.R3 = buildR3(variants.R2);
    for (const id of ["R2", "R3"]) {
      promptMeta[id] = { length: variants[id].length, sha256: sha256(variants[id]) };
    }
    console.log("FINAL R2/R3 HASHES");
    for (const id of ["R2", "R3"]) {
      console.log(`${id}  len=${promptMeta[id].length}  sha256=${promptMeta[id].sha256}`);
    }
    console.log("");
  }

  await runArm("R2", 3);
  await runArm("R3", 3);

  // --- Score ---
  function armRows(vid, id) {
    const all = rows.filter((r) => r.variantId === vid && r.statementId === id);
    // If contingency re-ran R1, use the last 3 only for scoring R1.
    if (vid === "R1" && usedContingency && all.length > 3) return all.slice(-3);
    return all;
  }

  const matrix = {};
  for (const st of statements) {
    matrix[st.id] = {};
    for (const vid of ["A", "R1", "R2", "R3"]) {
      const rs = armRows(vid, st.id);
      matrix[st.id][vid] = {
        labels: rs.map((r) => r.classification),
        explanations: rs.map((r) => r.explanation),
      };
    }
  }

  // PRIMARY on R3
  const primary = {};
  let primaryPass = true;
  for (const id of FALSE_GREEN_IDS) {
    const rs = armRows("R3", id);
    const ok = offConfirmed(rs, 2);
    primary[id] = { ok, labels: rs.map((r) => r.classification) };
    if (!ok) primaryPass = false;
  }

  // CONTROL F19
  const f19R3 = armRows("R3", "F19_S7");
  const f19Pass = holdsLabel(f19R3, "partially_confirmed", 2);

  // Independent stable-on-A controls
  const independentControlBreaks = [];
  const plantedReports = [];
  for (const st of statements) {
    if (st.role === "exhibit" || st.role === "recorded_only") continue;
    const aRs = armRows("A", st.id);
    const stableOnA = new Set(aRs.map((r) => r.classification)).size === 1;
    const r3Rs = armRows("R3", st.id);
    const hold = holdsLabel(r3Rs, st.baselineLabel, 2);
    const entry = {
      id: st.id,
      plant: st.plant,
      baselineLabel: st.baselineLabel,
      aLabels: aRs.map((r) => r.classification),
      r3Labels: r3Rs.map((r) => r.classification),
      stableOnA,
      hold,
    };
    if (st.plant === "PLANTED") {
      plantedReports.push(entry);
      continue;
    }
    // INDEPENDENT control
    if (NOISE_FLOOR_IDS.has(st.id)) {
      entry.note = "noise floor; not counted as break";
      plantedReports.push(entry); // report aside
      continue;
    }
    if (stableOnA && !hold) independentControlBreaks.push(entry);
  }

  const controlIndepPass = independentControlBreaks.length === 0;

  let stoppingVerdict = "KILL";
  if (primaryPass && f19Pass && controlIndepPass) stoppingVerdict = "CONFIRM";
  else if (!offConfirmed(armRows("R3", "EA_E2"), 2)) stoppingVerdict = "KILL";
  else stoppingVerdict = "PARTIAL";

  // Ladder contribution: when each false green first left confirmed
  const ladderIntroduced = {};
  for (const id of FALSE_GREEN_IDS) {
    ladderIntroduced[id] = null;
    for (const vid of ["R1", "R2", "R3"]) {
      if (offConfirmed(armRows(vid, id), 2)) {
        ladderIntroduced[id] = vid;
        break;
      }
    }
  }

  // Count fixed/broken for scoreboard (independent only for broken)
  function scoreArm(vid) {
    let fixed = 0;
    let broken = 0;
    for (const id of FALSE_GREEN_IDS) {
      if (offConfirmed(armRows(vid, id), 2)) fixed++;
    }
    // F19 break
    if (!holdsLabel(armRows(vid, "F19_S7"), "partially_confirmed", 2)) broken++;
    for (const st of statements) {
      if (st.role !== "control") continue;
      if (st.plant !== "INDEPENDENT") continue;
      if (NOISE_FLOOR_IDS.has(st.id)) continue;
      if (st.id === "F19_S7") continue; // already counted
      const aRs = armRows("A", st.id);
      if (new Set(aRs.map((r) => r.classification)).size !== 1) continue;
      if (!holdsLabel(armRows(vid, st.id), st.baselineLabel, 2)) broken++;
    }
    return { fixed, broken, net: fixed - broken };
  }

  const scoreboard = {
    baseline: { fixed: 0, broken: 0, net: 0 },
    R1: scoreArm("R1"),
    R2: scoreArm("R2"),
    R3: scoreArm("R3"),
  };

  console.log("PRIMARY (R3)");
  for (const id of FALSE_GREEN_IDS) {
    console.log(
      `  ${id}  ${primary[id].ok ? "OFF_CONF" : "STILL_CONF"}  ${primary[id].labels.map(shortClass).join("/")}`
    );
  }
  console.log(`F19_S7 hold: ${f19Pass}  ${f19R3.map((r) => shortClass(r.classification)).join("/")}`);
  console.log(`Independent control breaks: ${independentControlBreaks.length}`);
  for (const b of independentControlBreaks) {
    console.log(`  BREAK ${b.id} base=${b.baselineLabel} r3=${b.r3Labels.map(shortClass).join("/")}`);
  }
  console.log(`STOPPING VERDICT: ${stoppingVerdict}`);
  console.log(`Measured cost: $${totalCost.toFixed(6)}`);

  await mkdir(OUT_DIR, { recursive: true });
  const outPath = path.join(OUT_DIR, "rewrite-ladder-rows.json");
  await writeFile(
    outPath,
    JSON.stringify(
      {
        meta: {
          probe: "stage2-rewrite-ladder",
          model: `${stageModel.provider}/${stageModel.model}`,
          cache: "off",
          temperature: 0,
          seed: STAGE2_SEED,
          promptPath: "lib/qc/pipeline-v4/prompts/stage2_v4.md",
          usedContingency,
          framePeriodPriority: FRAME_PERIOD_PRIORITY,
          implicationRisk: IMPLICATION_RISK,
          example3c: EXAMPLE_3C,
          totalCalls: rows.length,
          totalCostUsd: totalCost,
          totalInputTokens: totalIn,
          totalOutputTokens: totalOut,
          ranAt: new Date().toISOString(),
          promptMeta,
        },
        gradedSet: statements.map((s) => ({
          id: s.id,
          role: s.role,
          plant: s.plant,
          plantNote: s.plantNote,
          adjudication: s.adjudication,
          baselineLabel: s.baselineLabel,
          correctLabel: s.correctLabel,
          sourceFile: s.sourceFile,
        })),
        scoreboard,
        primary,
        f19Pass,
        independentControlBreaks,
        plantedReports,
        ladderIntroduced,
        stoppingVerdict,
        aNotes,
        aHardStops,
        matrix,
        winningArmText: stoppingVerdict === "CONFIRM" ? variants.R3 : null,
        arms: {
          R1: variants.R1,
          R2: variants.R2,
          R3: variants.R3,
        },
        rows,
      },
      null,
      2
    )
  );
  console.log(`Wrote ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
