#!/usr/bin/env node
/**
 * Stage 2 seven-site confirm-when-facts-match deletion probe.
 * Arms A (baseline x1), B (cluster deleted + one replacement sentence x3),
 * C (B + Evaluative claims x3). Cache OFF. Live prompt file untouched.
 *
 * Usage:
 *   node scripts/diagnostic/eval-ablation/run-seven-site-deletion.mjs
 *
 * Expected cost: ~$1.20. Ceiling under $2.50.
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

const REPLACEMENT_SENTENCE =
  "Wording that adds no new checkable claim, including paraphrase, formatting, correct rounding, voice, and descriptive adjectives, does not by itself block confirmed.";

const EVALUATIVE_CLAIMS = `Evaluative claims
Descriptive wording is FRAMING when it characterises something the source already asserts. Framing does not block confirmed.
Descriptive wording is an ADDITIONAL CHECKABLE CLAIM when it asserts a comparison or ranking, a quantity or threshold, a causal relationship, or a level of risk or certainty, and the source does not state it. That makes the statement partially_confirmed even when every other fact matches.
Test: could a reader ask "compared to what?" or "according to whom?" and find no answer in the source? Then it is a checkable claim, not framing.`;

const L23_OLD =
  '• "confirmed" — on a like-for-like basis (same metric, same frame, same entity-role), the source states the same substance as the statement, including paraphrase, formatting, correct rounding, and extra descriptive or framing words that are not additional checkable claims.';
const L23_NEW =
  '• "confirmed" — on a like-for-like basis (same metric, same frame, same entity-role), the source states the same substance as the statement, including paraphrase, formatting, correct rounding.';

const L25_OLD =
  '• "partially_confirmed" — the source supports part of the statement AND the draft asserts an additional checkable claim the source does not cover, OR the draft is genuinely broader in scope, OR there is a frame/period-role mismatch (vintage vs operating year; revenue vs GMV), OR the source confirms some facts and is silent on others. Mere adjectives, voice, or richer wording around a supported claim stay confirmed.';
const L25_NEW =
  '• "partially_confirmed" — the source supports part of the statement AND the draft asserts an additional checkable claim the source does not cover, OR the draft is genuinely broader in scope, OR there is a frame/period-role mismatch (vintage vs operating year; revenue vs GMV), OR the source confirms some facts and is silent on others.';

const EXAMPLE_2 = `2) Extra framing, same claim → confirmed
Statement: 'We see significant headroom to accelerate growth through marketing investment, international expansion, and continued development of the App Store ecosystem.'
Source: 'There is significant headroom to accelerate growth through marketing, international expansion, and the App Store.'
Correct classification: confirmed
Reasoning: The source supports the same growth-headroom claim. Extra wording is framing, not a new checkable fact.`;

const EXAMPLE_3 = `3) Extra framing, same claim → confirmed
Statement: 'In summary, the Company combines a defensible competitive position in a specialised vertical with high switching costs.'
Source: 'NSH occupies a strong position in a deeply specialised vertical with high switching costs.'
Correct classification: confirmed
Reasoning: Substance matches. 'In summary' and 'defensible' do not add a separate checkable claim.`;

const EXAMPLE_3B = `3b) Checkable fact matches → confirmed
Statement: 'The Company currently has 8 employees, including the founders, and 1.5 million monthly active users.'
Source: 'The team is six full-time employees plus two founders (eight people in total) and 1.5 million monthly active users.'
Correct classification: confirmed
Reasoning: The checkable counts match. Do not classify partially_confirmed while the explanation is that the fact matches.`;

const L143_OLD =
  "A difference in voice or grammatical person with the same underlying fact is confirmed.";
const L143_NEW =
  "A difference in voice or grammatical person is not a conflict.";

const L154_BOTH = `If the checkable facts match the source, classify confirmed even if the explanation mentions extra wording. Do not classify partially_confirmed while stating that the fact matches.
`;

function sha256(s) {
  return createHash("sha256").update(s, "utf8").digest("hex");
}

function mustReplace(haystack, oldStr, newStr, label) {
  if (!haystack.includes(oldStr)) {
    throw new Error(`Variant build: ${label} not found exactly`);
  }
  const next = haystack.replace(oldStr, newStr);
  if (next === haystack) throw new Error(`Variant build: ${label} replace was a no-op`);
  if (next.split(oldStr).length > 1 && oldStr.length > 0) {
    // allow if oldStr intentionally removed entirely (newStr empty / deleted block)
  }
  return next;
}

function mustDeleteBlock(haystack, block, label) {
  const wrapped = `\n\n${block}\n\n`;
  if (haystack.includes(wrapped)) {
    return mustReplace(haystack, wrapped, "\n\n", `${label} (double-blank wrapped)`);
  }
  if (haystack.includes(`\n\n${block}\n`)) {
    return mustReplace(haystack, `\n\n${block}\n`, "\n", `${label} (trailing single)`);
  }
  throw new Error(`Variant build: ${label} block not found`);
}

/**
 * After deleting examples 2, 3, 3b the remaining examples renumber:
 * old 4->2, 5->3, 6->4, 7->5, 8->6, 9->7, 10->8, 11->9, 11b->9b, 11c->9c, 12->10, 13->11.
 * Cross-refs in Numeric rules / Voice / Entity roles must follow.
 */
function renumberExamplesAndCrossRefs(prompt) {
  const repairs = [];
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
    if (!p.includes(from)) throw new Error(`Renumber: missing "${from}"`);
    p = p.replace(from, to);
    repairs.push(`example title: "${from}" -> "${to}"`);
  }

  const crossRefs = [
    [
      "A same-metric number that differs by more than rounding is conflicting (example 12)",
      "A same-metric number that differs by more than rounding is conflicting (example 10)",
      "Numeric rules: example 12 -> 10",
    ],
    [
      "is conflicting (example 11), not voice.",
      "is conflicting (example 9), not voice.",
      "Voice: example 11 -> 9",
    ],
    [
      "not a modality conflict (example 11b).",
      "not a modality conflict (example 9b).",
      "Voice: example 11b -> 9b",
    ],
    [
      "is conflicting (examples 9 and 10).",
      "is conflicting (examples 7 and 8).",
      "Entity roles: examples 9 and 10 -> 7 and 8",
    ],
  ];
  for (const [from, to, note] of crossRefs) {
    if (!p.includes(from)) throw new Error(`Cross-ref repair missing: ${note}`);
    p = p.replace(from, to);
    repairs.push(note);
  }

  // Sanity: no dangling old pointers.
  const dangling = [
    "(example 12)",
    "(example 11)",
    "(example 11b)",
    "(examples 9 and 10)",
    "2) Extra framing",
    "3) Extra framing",
    "3b) Checkable fact matches",
  ];
  for (const d of dangling) {
    if (p.includes(d)) throw new Error(`Dangling pointer remains: ${d}`);
  }
  // example 1 must still exist
  if (!p.includes("1) Rounding")) throw new Error("Example 1 missing after renumber");
  if (!p.includes("(example 1)")) throw new Error("Cross-ref to example 1 missing");

  return { prompt: p, repairs };
}

function buildArmB(baseline) {
  let p = baseline;
  p = mustReplace(p, L23_OLD, L23_NEW, "L23 confirmed framing clause");
  p = mustReplace(p, L25_OLD, L25_NEW, "L25 mere-adjectives sentence");
  p = mustDeleteBlock(p, EXAMPLE_2, "example 2");
  p = mustDeleteBlock(p, EXAMPLE_3, "example 3");
  p = mustDeleteBlock(p, EXAMPLE_3B, "example 3b");
  p = mustReplace(p, L143_OLD, L143_NEW, "L143 voice confirmed push");
  p = mustReplace(p, L154_BOTH, "", "L154 both sentences");

  const insertAfter =
    '• "no_support" — the source does not address the claim at all. A related, narrower, or broader treatment of the same claim is partially_confirmed, not no_support. A non-factual procedural closer with no checkable claim (for example \'We recommend approval.\') is no_support.';
  if (!p.includes(insertAfter)) {
    throw new Error("Arm B: no_support definition not found for insert anchor");
  }
  p = p.replace(insertAfter, `${insertAfter}\n\n${REPLACEMENT_SENTENCE}`);

  if (!p.includes(REPLACEMENT_SENTENCE)) {
    throw new Error("Arm B: replacement sentence not inserted");
  }
  if ((p.split(REPLACEMENT_SENTENCE).length - 1) !== 1) {
    throw new Error("Arm B: replacement sentence must appear exactly once");
  }

  const { prompt: renumbered, repairs } = renumberExamplesAndCrossRefs(p);
  p = renumbered;

  // Must not retain deleted cluster text.
  for (const banned of [
    "extra descriptive or framing words that are not additional checkable claims",
    "Mere adjectives, voice, or richer wording around a supported claim stay confirmed.",
    "Extra framing, same claim",
    "Checkable fact matches",
    "same underlying fact is confirmed",
    "If the checkable facts match the source, classify confirmed even if the explanation mentions extra wording",
  ]) {
    if (p.includes(banned)) throw new Error(`Arm B still contains banned cluster text: ${banned}`);
  }

  return { prompt: p.trim(), repairs };
}

function buildArmC(armBPrompt) {
  const marker = "\n\nWorked examples\n";
  const idx = armBPrompt.indexOf(marker);
  if (idx < 0) throw new Error("Arm C: Worked examples marker not found");
  // G position: after defs (and our replacement sentence), before Worked examples.
  const out =
    armBPrompt.slice(0, idx) + "\n\n" + EVALUATIVE_CLAIMS + marker + armBPrompt.slice(idx + marker.length);
  if (!out.includes(EVALUATIVE_CLAIMS)) throw new Error("Arm C missing Evaluative claims");
  if (out.indexOf(EVALUATIVE_CLAIMS) > out.indexOf("Worked examples")) {
    throw new Error("Arm C: Evaluative claims must appear before Worked examples");
  }
  if (!out.includes(REPLACEMENT_SENTENCE)) {
    throw new Error("Arm C must retain arm B replacement sentence");
  }
  return out.trim();
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
    traceName: "diag-eval-ablation-seven-site",
    spanName: "stage2-seven-site-deletion",
    metadata: { variantId, statementId, runIndex },
  });

  const raw = completion?.text ?? "";
  const parsed = safeJsonParse(raw);
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
    raw,
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

async function loadSource(filename) {
  const { text, resolvedFrom } = await resolveSourceText(filename);
  return { text, resolvedFrom, label: filename.replace(/\.(txt|pdf)$/i, "") };
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

  /** @type {Array<object>} */
  const statements = [
    {
      id: "EA_E2",
      role: "exhibit_gated",
      expected: "confirmed",
      statement:
        "The team's stability, with no senior departures across the last three fund cycles, means key-person risk is limited.",
      sourceText: meridian,
      sourceFile: "scripts/diagnostic/eval-ablation/meridian_source.txt",
      note: "eval-ablation E2 (NOT claim-spans E2)",
    },
    {
      id: "CS_E3",
      role: "exhibit_gated",
      expected: "confirmed",
      statement:
        "Fund IV is marked at 1.9x gross MOIC and Fund III at 1.7x, and that level speaks well of the manager's judgement.",
      sourceText: csE3Source,
      sourceFile: "scripts/diagnostic/claim-spans/evaluative-accident/source_ic_memo.txt",
      note: "claim-spans E3 (NOT eval-ablation E3)",
    },
    {
      id: "EA_E3",
      role: "exhibit_recorded",
      expected: "confirmed",
      statement: "Fund IV has returned 1.9 times gross MOIC and a 24 per cent gross IRR.",
      sourceText: meridian,
      sourceFile: "scripts/diagnostic/eval-ablation/meridian_source.txt",
      note: "eval-ablation E3 Fund IV mark; no arm carries a mark rule; recorded only",
    },
    {
      id: "EA_E1",
      role: "exhibit_recorded",
      expected: "partially_confirmed",
      statement:
        "It has realised a gross MOIC of 2.4 times across 17 exits, placing it in the top quartile of European lower-mid-market managers.",
      sourceText: meridian,
      sourceFile: "scripts/diagnostic/eval-ablation/meridian_source.txt",
      note: "eval-ablation E1 ranking; already partial at baseline; recorded only",
    },
    {
      id: "F01_S7",
      role: "control_confirmed",
      expected: "confirmed",
      statement:
        "We see significant headroom to accelerate growth through marketing investment, international expansion, and continued development of the App Store ecosystem.",
      sourceText: src["01_bvp_shopify_memo.txt"].text,
      sourceFile: src["01_bvp_shopify_memo.txt"].resolvedFrom,
    },
    {
      id: "F01_S10",
      role: "control_confirmed",
      expected: "confirmed",
      statement:
        "In summary, Shopify combines exceptional unit economics, a defensible competitive position, and clear growth runway.",
      sourceText: src["01_bvp_shopify_memo.txt"].text,
      sourceFile: src["01_bvp_shopify_memo.txt"].resolvedFrom,
    },
    {
      id: "F04_S20",
      role: "control_confirmed",
      expected: "confirmed",
      statement:
        "In summary, the Company combines exceptional engagement, a defensible consumer position, and a founder team in which we have high conviction.",
      sourceText: src["04_synth_vc_pinterest_style_memo.txt"].text,
      sourceFile: src["04_synth_vc_pinterest_style_memo.txt"].resolvedFrom,
    },
    {
      id: "F04_S13",
      role: "control_confirmed",
      expected: "confirmed",
      statement:
        "The Company currently has 8 employees, including the founders, and 1.5 million monthly active users.",
      sourceText: src["04_synth_vc_pinterest_style_memo.txt"].text,
      sourceFile: src["04_synth_vc_pinterest_style_memo.txt"].resolvedFrom,
    },
    {
      id: "F12_S0",
      role: "control_confirmed",
      expected: "confirmed",
      statement:
        "After more than four years of partnership, Meridian Capital has completed the sale of NorTech Industries to Brookfield this week.",
      sourceText: src["12_synth_linkedin_post.txt"].text,
      sourceFile: src["12_synth_linkedin_post.txt"].resolvedFrom,
    },
    {
      id: "F04_S1",
      role: "control_confirmed",
      expected: "confirmed",
      statement:
        "We have committed USD 10 million in the Company's Series A at a pre-money valuation of USD 40 million, for approximately 20% on a fully-diluted basis.",
      sourceText: src["04_synth_vc_pinterest_style_memo.txt"].text,
      sourceFile: src["04_synth_vc_pinterest_style_memo.txt"].resolvedFrom,
    },
    {
      id: "F08_S0",
      role: "control_confirmed",
      expected: "confirmed",
      statement:
        'We are writing to inform you of a new investment in Helvetia Precision Components (the "Company"), a Zurich-headquartered manufacturer of high-precision machined components for the medical devices, aerospace, and semiconductor end markets.',
      sourceText: src["08_synth_industrial_buyout_memo.txt"].text,
      sourceFile: src["08_synth_industrial_buyout_memo.txt"].resolvedFrom,
    },
    {
      id: "F92_S0",
      role: "control_confirmed",
      expected: "confirmed",
      statement: "Shopify is a small startup serving approximately 10,000 customers.",
      sourceText: src["91_adversarial_shopify_2010_trimmed.txt"].text,
      sourceFile: src["91_adversarial_shopify_2010_trimmed.txt"].resolvedFrom,
    },
    {
      id: "F14_S4",
      role: "control_partial",
      expected: "partially_confirmed",
      statement:
        "Second, payer willingness to reimburse digital health products has improved markedly across the major European markets.",
      sourceText: src["14_synth_thesis_only_memo.txt"].text,
      sourceFile: src["14_synth_thesis_only_memo.txt"].resolvedFrom,
    },
    {
      id: "F19_S7",
      role: "control_partial",
      expected: "partially_confirmed",
      statement:
        "Drift Logistics, our 2024 third-party logistics investment, faces a softer parcel volume environment (European parcel volumes down 3 percent year-on-year); the Company has nevertheless gained share, with revenue up 6 percent, but EBITDA margins have compressed from 14 to 12 percent.",
      sourceText: src["19_synth_annual_report.pdf"].text,
      sourceFile: src["19_synth_annual_report.pdf"].resolvedFrom,
    },
    {
      id: "F12_S1",
      role: "control_partial",
      expected: "partially_confirmed",
      statement:
        "NorTech is a Stockholm-headquartered manufacturer of industrial heating and cooling systems, and when we invested in 2021 it was a strong but underexposed business — dominant in the Nordics and barely visible elsewhere.",
      sourceText: src["12_synth_linkedin_post.txt"].text,
      sourceFile: src["12_synth_linkedin_post.txt"].resolvedFrom,
    },
    {
      id: "F14_S11",
      role: "control_partial",
      expected: "partially_confirmed",
      statement:
        "We expect to bring a specific potential investment to consider over the coming months.",
      sourceText: src["14_synth_thesis_only_memo.txt"].text,
      sourceFile: src["14_synth_thesis_only_memo.txt"].resolvedFrom,
    },
    {
      id: "F18_S6",
      role: "control_partial",
      expected: "partially_confirmed",
      statement:
        "The investment thesis is anchored on three pillars: a genuinely market-leading product (independent customer research rates the Company significantly higher than the principal Nordic competitor Yardi Nordic on usability and feature completeness), a structurally underpenetrated market (approximately 40% of Nordic property management companies still use legacy systems or spreadsheets), and an exceptional founder team led by CEO Mr. Erik Lindqvist and CTO Mr. Pekka Virtanen.",
      sourceText: src["18b_synth_cross_source_pair_update.txt"].text,
      sourceFile: src["18b_synth_cross_source_pair_update.txt"].resolvedFrom,
      note: "uses 18b (partial); 18a is confirmed on this statement",
    },
    {
      id: "F15_S2",
      role: "control_conflicting",
      expected: "conflicting",
      statement: "We have invested EUR 720 million of equity for an 84% stake.",
      sourceText: src["15_synth_very_long_memo.txt"].text,
      sourceFile: src["15_synth_very_long_memo.txt"].resolvedFrom,
    },
    {
      id: "F05_S5",
      role: "control_conflicting",
      expected: "conflicting",
      statement:
        "During Westhaven's ownership, Norwell has invested significantly in advanced composite manufacturing capability.",
      sourceText: src["05_synth_competitor_press_release.pdf"].text,
      sourceFile: src["05_synth_competitor_press_release.pdf"].resolvedFrom,
    },
    {
      id: "F17_S9",
      role: "control_conflicting",
      expected: "conflicting",
      statement:
        "Our value creation plan rests on capturing the embedded reversion as approximately 40 percent of leases roll during the hold period, executing a EUR 38 million value-add capex programme to modernise three older assets, and benefiting from continued rental growth and modest yield compression.",
      sourceText: src["17_synth_real_estate_logistics.pdf"].text,
      sourceFile: src["17_synth_real_estate_logistics.pdf"].resolvedFrom,
      note: "B48 magnitude backstop can force conflicting independent of prompt",
    },
    {
      id: "F08_S2",
      role: "control_conflicting",
      expected: "conflicting",
      statement:
        "We have invested EUR 480 million of equity for a 78% controlling stake, with the founding Schiller family and management retaining the balance.",
      sourceText: src["08_synth_industrial_buyout_memo.txt"].text,
      sourceFile: src["08_synth_industrial_buyout_memo.txt"].resolvedFrom,
    },
    {
      id: "F01_S11",
      role: "control_no_support",
      expected: "no_support",
      statement: "We recommend approval.",
      sourceText: src["01_bvp_shopify_memo.txt"].text,
      sourceFile: src["01_bvp_shopify_memo.txt"].resolvedFrom,
      note: "procedural closer; rounding backstop also forces no_support",
    },
    {
      id: "F90_S0",
      role: "control_no_support",
      expected: "no_support",
      statement: "The firm invested in Helios Grid Controls in 2024.",
      sourceText: src["90_adversarial_b17_latent.txt"].text,
      sourceFile: src["90_adversarial_b17_latent.txt"].resolvedFrom,
      note: "disk cache: model preBackstop conflicting; period gate -> no_support",
    },
  ];

  if (statements.length !== 23) {
    throw new Error(`Expected 23 statements, got ${statements.length}`);
  }
  return statements;
}

function holdsExpected(rowsForArm, expected, minOf = 2) {
  const ok = rowsForArm.filter((r) => r.classification === expected).length;
  return ok >= minOf;
}

function movesOffConfirmed(rowsForArm, minOf = 2) {
  const moved = rowsForArm.filter((r) => r.classification != null && r.classification !== "confirmed")
    .length;
  return moved >= minOf;
}

async function main() {
  const stageModel = STAGE_MODELS["stage2-matching"];
  if (!hasProviderApiKey(stageModel.provider)) {
    throw new Error(`Missing API key for ${stageModel.provider}`);
  }

  const baseline = (await readFile(STAGE2_PROMPT_PATH, "utf8")).trim();
  const builtB = buildArmB(baseline);
  const variants = {
    A: baseline,
    B: builtB.prompt,
    C: buildArmC(builtB.prompt),
  };

  if (variants.A !== baseline) throw new Error("A must be unmodified baseline");
  if (variants.B === baseline) throw new Error("B did not change prompt");
  if (variants.C === variants.B) throw new Error("C must differ from B");
  if (variants.C === baseline) throw new Error("C must differ from A");
  if (!variants.C.includes(EVALUATIVE_CLAIMS)) throw new Error("C missing Evaluative claims");

  const promptMeta = {};
  for (const id of ["A", "B", "C"]) {
    promptMeta[id] = { length: variants[id].length, sha256: sha256(variants[id]) };
  }
  if (promptMeta.A.sha256 === promptMeta.B.sha256 || promptMeta.B.sha256 === promptMeta.C.sha256) {
    throw new Error("Arm hashes collide; variation was never applied");
  }

  console.log("Stage 2 seven-site deletion probe");
  console.log(`Model: ${stageModel.provider}/${stageModel.model}`);
  console.log("Cache: OFF (live measurement)");
  console.log("Meridian: scripts/diagnostic/eval-ablation/meridian_source.txt (Halden copy)");
  console.log("");
  console.log("ARM HASHES AND LENGTHS");
  for (const id of ["A", "B", "C"]) {
    console.log(`${id}  len=${promptMeta[id].length}  sha256=${promptMeta[id].sha256}`);
  }
  console.log("");
  console.log("CROSS-REFERENCE REPAIRS (arms B and C)");
  for (const r of builtB.repairs) console.log(`  - ${r}`);
  console.log("");

  const statements = await buildStatements();
  const rows = [];
  let totalCost = 0;
  let totalIn = 0;
  let totalOut = 0;

  // --- Arm A pre-condition (1 repeat) ---
  console.log("PRE-CONDITION: arm A x1 against disk-cache expected labels");
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
    rows.push({
      statementId: st.id,
      role: st.role,
      expected: st.expected,
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
    const ok = result.classification === st.expected;
    console.log(
      `${result.classification ?? "PARSE_FAIL"}${result.backstopChanged ? ` (pre=${result.preBackstopClassification})` : ""} expect=${st.expected} ${ok ? "OK" : "FAIL"} fp=${result.systemFingerprint || "null"} ($${result.costUsd.toFixed(4)})`
    );
  }

  const aDisagreements = rows
    .filter((r) => r.variantId === "A")
    .filter((r) => r.classification !== r.expected)
    .map((r) => ({
      id: r.statementId,
      got: r.classification,
      pre: r.preBackstopClassification,
      expected: r.expected,
      backstopChanged: r.backstopChanged,
      explanation: r.explanation,
    }));

  const preconditionPass = aDisagreements.length === 0;
  console.log("");
  console.log(
    preconditionPass
      ? "PRE-CONDITION PASS: all 23 arm A labels match expected disk-cache labels."
      : `PRE-CONDITION FAIL: ${aDisagreements.length} disagreement(s). Stopping. No B or C billed.`
  );
  if (!preconditionPass) {
    console.log(JSON.stringify(aDisagreements, null, 2));
  }

  let stoppingVerdict = null;
  let matrix = {};
  let assessment = null;

  if (preconditionPass) {
    // --- Arms B and C, 3 repeats ---
    for (const vid of ["B", "C"]) {
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
            expected: st.expected,
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
            `${result.classification ?? "PARSE_FAIL"}${result.backstopChanged ? ` (pre=${result.preBackstopClassification})` : ""} fp=${result.systemFingerprint || "null"} ($${result.costUsd.toFixed(4)})`
          );
        }
      }
    }

    for (const st of statements) {
      matrix[st.id] = { A: [], B: [], C: [] };
      for (const vid of ["A", "B", "C"]) {
        const maxRun = vid === "A" ? 1 : 3;
        matrix[st.id][vid] = [];
        for (let run = 1; run <= maxRun; run++) {
          const row = rows.find(
            (r) => r.statementId === st.id && r.variantId === vid && r.run === run
          );
          matrix[st.id][vid].push(row?.classification ?? null);
        }
      }
    }

    const controls = statements.filter((s) => String(s.role).startsWith("control_"));
    function armControlHold(vid) {
      return controls.every((st) => {
        const armRows = rows.filter((r) => r.statementId === st.id && r.variantId === vid);
        return holdsExpected(armRows, st.expected, 2);
      });
    }
    function bothGatedExhibitsMove(vid) {
      const e2 = rows.filter((r) => r.statementId === "EA_E2" && r.variantId === vid);
      const e3 = rows.filter((r) => r.statementId === "CS_E3" && r.variantId === vid);
      return movesOffConfirmed(e2, 2) && movesOffConfirmed(e3, 2);
    }
    function anyGatedExhibitMoves(vid) {
      const e2 = rows.filter((r) => r.statementId === "EA_E2" && r.variantId === vid);
      const e3 = rows.filter((r) => r.statementId === "CS_E3" && r.variantId === vid);
      return movesOffConfirmed(e2, 2) || movesOffConfirmed(e3, 2);
    }
    function brokenControls(vid) {
      return controls
        .filter((st) => {
          const armRows = rows.filter((r) => r.statementId === st.id && r.variantId === vid);
          return !holdsExpected(armRows, st.expected, 2);
        })
        .map((st) => {
          const armRows = rows.filter((r) => r.statementId === st.id && r.variantId === vid);
          return {
            id: st.id,
            expected: st.expected,
            got: armRows.map((r) => r.classification),
          };
        });
    }

    const bMoveBoth = bothGatedExhibitsMove("B");
    const cMoveBoth = bothGatedExhibitsMove("C");
    const bMoveAny = anyGatedExhibitMoves("B");
    const cMoveAny = anyGatedExhibitMoves("C");
    const bHold = armControlHold("B");
    const cHold = armControlHold("C");
    const bBroken = brokenControls("B");
    const cBroken = brokenControls("C");

    // PASS: arm B moves BOTH gated exhibits AND all controls hold on B.
    // PARTIAL: any gated exhibit moves on B or C, or controls break (cluster is load-bearing).
    // KILL: neither arm moves either gated exhibit AND controls hold (deletion inert).
    if (bMoveBoth && bHold) {
      stoppingVerdict = "PASS";
    } else if (!bMoveAny && !cMoveAny && bHold && cHold) {
      stoppingVerdict = "KILL";
    } else {
      stoppingVerdict = "PARTIAL";
    }

    assessment = {
      bExhibitsMoveBoth: bMoveBoth,
      cExhibitsMoveBoth: cMoveBoth,
      bExhibitsMoveAny: bMoveAny,
      cExhibitsMoveAny: cMoveAny,
      bControlsHold: bHold,
      cControlsHold: cHold,
      bBrokenControls: bBroken,
      cBrokenControls: cBroken,
      stoppingVerdict,
    };

    console.log("");
    console.log("MATRIX (A=1 run; B/C = r1/r2/r3)");
    console.log(
      pad("stmt", 10) +
        pad("expect", 22) +
        pad("A", 22) +
        pad("B(r1 r2 r3)", 56) +
        pad("C(r1 r2 r3)", 56)
    );
    for (const st of statements) {
      console.log(
        pad(st.id, 10) +
          pad(st.expected, 22) +
          pad(matrix[st.id].A.join(" "), 22) +
          pad(matrix[st.id].B.join(" / "), 56) +
          pad(matrix[st.id].C.join(" / "), 56)
      );
    }
    console.log("");
    console.log(`STOPPING VERDICT: ${stoppingVerdict}`);
    console.log(
      `B both-gated-exhibits move: ${bMoveBoth}; B any: ${bMoveAny}; B controls hold: ${bHold}`
    );
    console.log(
      `C both-gated-exhibits move: ${cMoveBoth}; C any: ${cMoveAny}; C controls hold: ${cHold}`
    );
    if (bBroken.length) console.log("B broken controls:", JSON.stringify(bBroken));
    if (cBroken.length) console.log("C broken controls:", JSON.stringify(cBroken));
  }

  // Explanations for EA_E2 and CS_E3 every arm; plus every cell that moved vs expected
  const explanationFocus = {};
  for (const id of ["EA_E2", "CS_E3"]) {
    explanationFocus[id] = {};
    for (const vid of ["A", "B", "C"]) {
      explanationFocus[id][vid] = rows
        .filter((r) => r.statementId === id && r.variantId === vid)
        .map((r) => ({
          run: r.run,
          classification: r.classification,
          preBackstopClassification: r.preBackstopClassification,
          backstopChanged: r.backstopChanged,
          explanation: r.explanation,
          systemFingerprint: r.systemFingerprint,
        }));
    }
  }

  const movedCells = rows.filter((r) => {
    if (r.variantId === "A") return false;
    return r.classification != null && r.classification !== r.expected;
  });

  const backstopHeld = rows.filter((r) => r.backstopChanged);

  const report = {
    meta: {
      probe: "stage2-seven-site-deletion",
      model: `${stageModel.provider}/${stageModel.model}`,
      cache: "off",
      temperature: 0,
      seed: STAGE2_SEED,
      promptPath: "lib/qc/pipeline-v4/prompts/stage2_v4.md",
      meridianSource: "scripts/diagnostic/eval-ablation/meridian_source.txt",
      claimSpansE3Source:
        "scripts/diagnostic/claim-spans/evaluative-accident/source_ic_memo.txt",
      backstopsApplied:
        "applyRoundingToleranceBackstop then applyPeriodGateBackstop (same order as matchOnePair)",
      totalCalls: rows.length,
      totalCostUsd: totalCost,
      totalInputTokens: totalIn,
      totalOutputTokens: totalOut,
      ranAt: new Date().toISOString(),
      promptMeta,
      crossReferenceRepairs: builtB.repairs,
      replacementSentence: REPLACEMENT_SENTENCE,
    },
    precondition: {
      pass: preconditionPass,
      disagreements: aDisagreements,
    },
    matrix,
    assessment,
    stoppingVerdict,
    explanationFocus,
    movedCells: movedCells.map((r) => ({
      statementId: r.statementId,
      variantId: r.variantId,
      run: r.run,
      expected: r.expected,
      classification: r.classification,
      preBackstopClassification: r.preBackstopClassification,
      backstopChanged: r.backstopChanged,
      explanation: r.explanation,
      systemFingerprint: r.systemFingerprint,
      sourceFile: r.sourceFile,
    })),
    backstopHeld: backstopHeld.map((r) => ({
      statementId: r.statementId,
      variantId: r.variantId,
      run: r.run,
      pre: r.preBackstopClassification,
      post: r.classification,
    })),
    rows,
  };

  await mkdir(OUT_DIR, { recursive: true });
  const outPath = path.join(OUT_DIR, "seven-site-deletion-rows.json");
  await writeFile(outPath, JSON.stringify(report, null, 2) + "\n");
  console.log("");
  console.log(`Measured cost: $${totalCost.toFixed(6)} (in=${totalIn} out=${totalOut})`);
  console.log(`Wrote ${outPath}`);

  if (!preconditionPass) {
    process.exitCode = 2;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
