#!/usr/bin/env node
/**
 * Stage 2 short-prompt probe. Same six statements and Meridian source as
 * eval-ablation. Variants A2 (baseline x3), G (short principled), H (rule
 * moved). Three repeats each. Cache OFF. 54 live calls.
 *
 * Usage:
 *   node scripts/diagnostic/eval-ablation/run-short-prompt.mjs
 *
 * Expected cost: ~$0.50 (prior ablation ~$0.009/call x 54). Ceiling under $2.
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadLocalEnvFiles } from "../lib/env.mjs";
import { DIAG_ROOT, REPO_ROOT } from "../lib/paths.mjs";

loadLocalEnvFiles({ liveMeasurement: true });

const { callLLM, calculateLlmCostUsd, hasProviderApiKey } = await import(
  "../../../lib/observability.js"
);
const { STAGE_MODELS } = await import("../../../lib/qc/model-config.mjs");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(DIAG_ROOT, "eval-ablation");
const STAGE2_PROMPT_PATH = path.join(
  REPO_ROOT,
  "lib/qc/pipeline-v4/prompts/stage2_v4.md"
);
const MERIDIAN_PATH = path.join(__dirname, "meridian_source.txt");
const STAGE2_SEED = 1;
const REPEATS = 3;

const EVALUATIVE_CLAIMS = `Evaluative claims
Descriptive wording is FRAMING when it characterises something the source already asserts. Framing does not block confirmed.
Descriptive wording is an ADDITIONAL CHECKABLE CLAIM when it asserts a comparison or ranking, a quantity or threshold, a causal relationship, or a level of risk or certainty, and the source does not state it. That makes the statement partially_confirmed even when every other fact matches.
Test: could a reader ask "compared to what?" or "according to whom?" and find no answer in the source? Then it is a checkable claim, not framing.`;

/** Ranking boundary example (3c). No prior committed 3c text found; built to mark ranking-as-claim vs framing. */
const EXAMPLE_3C = `3c) Ranking is a checkable claim → partially_confirmed
Statement: 'The fund returned 2.4x gross MOIC, placing it in the top quartile of European peers.'
Source: 'The fund returned 2.4x gross MOIC across seventeen exits.'
Correct classification: partially_confirmed
Reasoning: The MOIC matches. 'Top quartile of European peers' is a ranking the source does not state.`;

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

const CLASSIFICATION_DEFS = `Classification values

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

function buildG() {
  return [
    JSON_SHAPE_G,
    "",
    CLASSIFICATION_DEFS,
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
  ].join("\n");
}

function buildH(baseline) {
  const marker = "\n\nWorked examples\n";
  const idx = baseline.indexOf(marker);
  if (idx < 0) throw new Error("Variant H: Worked examples marker not found");
  // Insert Evaluative claims immediately after the four definitions and before Worked examples.
  return (
    baseline.slice(0, idx) +
    "\n\n" +
    EVALUATIVE_CLAIMS +
    marker +
    baseline.slice(idx + marker.length)
  );
}

function sha256(s) {
  return createHash("sha256").update(s, "utf8").digest("hex");
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

function classificationOf(parsed) {
  const c = parsed?.classification;
  return typeof c === "string" ? c.trim() : null;
}

function explanationOf(parsed) {
  const e = parsed?.explanation;
  return typeof e === "string" ? e : null;
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
    traceName: "diag-eval-ablation-short",
    spanName: "stage2-short-prompt",
    metadata: { variantId, statementId, runIndex },
  });

  const raw = completion?.text ?? "";
  const parsed = safeJsonParse(raw);
  const costUsd = calculateLlmCostUsd(stageModel.provider, stageModel.model, completion?.usage);
  return {
    classification: classificationOf(parsed),
    explanation: explanationOf(parsed),
    passage: typeof parsed?.passage === "string" ? parsed.passage : null,
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

async function main() {
  const stageModel = STAGE_MODELS["stage2-matching"];
  if (!hasProviderApiKey(stageModel.provider)) {
    throw new Error(`Missing API key for ${stageModel.provider}`);
  }

  const baseline = await readFile(STAGE2_PROMPT_PATH, "utf8");
  const meridian = await readFile(MERIDIAN_PATH, "utf8");

  const variants = {
    A2: baseline,
    G: buildG(),
    H: buildH(baseline),
  };

  if (variants.A2 !== baseline) throw new Error("A2 must be unmodified baseline");
  if (!variants.H.includes(EVALUATIVE_CLAIMS)) throw new Error("H missing Evaluative claims");
  if (variants.H.indexOf(EVALUATIVE_CLAIMS) > variants.H.indexOf("Worked examples")) {
    throw new Error("H: Evaluative claims must appear before Worked examples");
  }
  if (variants.H === baseline) throw new Error("H did not change prompt");
  if (!variants.G.includes(EVALUATIVE_CLAIMS)) throw new Error("G missing Evaluative claims");
  if (variants.G.includes("Numeric rules")) throw new Error("G must omit Numeric rules");
  if (variants.G.includes("Mixed statements")) throw new Error("G must omit Mixed statements");
  if (variants.G.includes("Entity roles")) throw new Error("G must omit Entity roles");

  const promptMeta = {};
  for (const id of ["A2", "G", "H"]) {
    promptMeta[id] = { length: variants[id].length, sha256: sha256(variants[id]) };
  }
  console.log(`G length ${promptMeta.G.length} (baseline A2 ${promptMeta.A2.length})`);
  for (const id of ["A2", "G", "H"]) {
    console.log(`${id}  ${promptMeta[id].length}  ${promptMeta[id].sha256}`);
  }

  const statements = [
    {
      id: "E1",
      kind: "exhibit",
      expected: "partially_confirmed",
      statement:
        "It has realised a gross MOIC of 2.4 times across 17 exits, placing it in the top quartile of European lower-mid-market managers.",
      source: meridian,
    },
    {
      id: "E2",
      kind: "exhibit",
      expected: "partially_confirmed",
      statement:
        "The team's stability, with no senior departures across the last three fund cycles, means key-person risk is limited.",
      source: meridian,
    },
    {
      id: "E3",
      kind: "exhibit",
      expected: "partially_confirmed",
      statement: "Fund IV has returned 1.9 times gross MOIC and a 24 per cent gross IRR.",
      source: meridian,
    },
    {
      id: "C1",
      kind: "control",
      expected: "confirmed",
      statement:
        "Meridian Capital Partners V is a EUR 1.2 billion fund targeting lower-mid-market buyouts in European industrial technology and business services.",
      source: meridian,
    },
    {
      id: "C2",
      kind: "control",
      expected: "confirmed",
      note: "prompt worked example 3",
      statement:
        "In summary, the Company combines a defensible competitive position in a specialised vertical with high switching costs.",
      source:
        "NSH occupies a strong position in a deeply specialised vertical with high switching costs.",
    },
    {
      id: "C3",
      kind: "control",
      expected: "confirmed",
      statement:
        "The fund will hold investments for four to six years and will not deploy more than 30 per cent of commitments outside the EU.",
      source: meridian,
    },
  ];

  const variantIds = ["A2", "G", "H"];
  const rows = [];
  let totalCost = 0;
  let totalIn = 0;
  let totalOut = 0;
  const totalCalls = statements.length * variantIds.length * REPEATS;

  console.log("");
  console.log("Stage 2 short-prompt probe");
  console.log(`Model: ${stageModel.provider}/${stageModel.model}`);
  console.log("Cache: OFF (live measurement)");
  console.log(`Expected cost ~$0.50 for ${totalCalls} calls (prior ~$0.009/call). Under $2.`);
  console.log("Note: temperature 0 and seed 1 match prior harness; variance may still be low.");
  console.log("");

  for (const st of statements) {
    for (const vid of variantIds) {
      for (let run = 1; run <= REPEATS; run++) {
        process.stdout.write(`  ${st.id} x ${vid} r${run} ... `);
        const result = await matchOnce({
          systemPrompt: variants[vid],
          statement: st.statement,
          sourceText: st.source,
          variantId: vid,
          statementId: st.id,
          runIndex: run,
        });
        totalCost += result.costUsd;
        totalIn += result.usage.inputTokens;
        totalOut += result.usage.outputTokens;
        rows.push({
          statementId: st.id,
          kind: st.kind,
          expected: st.expected,
          variantId: vid,
          run: run,
          classification: result.classification,
          explanation: result.explanation,
          passage: result.passage,
          usage: result.usage,
          costUsd: result.costUsd,
          statement: st.statement,
          sourceNote: st.id === "C2" ? "prompt_worked_example_3" : "meridian_source_v2",
        });
        console.log(`${result.classification ?? "PARSE_FAIL"} ($${result.costUsd.toFixed(4)})`);
      }
    }
  }

  // matrix[statementId][variantId] = [run1, run2, run3]
  const matrix = {};
  for (const st of statements) {
    matrix[st.id] = {};
    for (const vid of variantIds) {
      matrix[st.id][vid] = [1, 2, 3].map((run) => {
        const row = rows.find(
          (r) => r.statementId === st.id && r.variantId === vid && r.run === run
        );
        return row?.classification ?? null;
      });
    }
  }

  const baselineConfirmedCounts = {};
  for (const id of ["E1", "E2", "E3"]) {
    baselineConfirmedCounts[id] = matrix[id].A2.filter((c) => c === "confirmed").length;
  }

  function controlsConfirmed(vid) {
    return ["C1", "C2", "C3"].every((id) =>
      matrix[id][vid].every((c) => c === "confirmed")
    );
  }

  function exhibitMovedOffConfirmed(vid, exhibitId) {
    return matrix[exhibitId][vid].some((c) => c !== "confirmed" && c != null);
  }

  const gMovesE2orE3 =
    controlsConfirmed("G") &&
    (exhibitMovedOffConfirmed("G", "E2") || exhibitMovedOffConfirmed("G", "E3"));
  const hMovesE2orE3 =
    controlsConfirmed("H") &&
    (exhibitMovedOffConfirmed("H", "E2") || exhibitMovedOffConfirmed("H", "E3"));

  const e2e3Explanations = {};
  for (const id of ["E2", "E3"]) {
    e2e3Explanations[id] = {};
    for (const vid of variantIds) {
      e2e3Explanations[id][vid] = [1, 2, 3].map((run) => {
        const row = rows.find(
          (r) => r.statementId === id && r.variantId === vid && r.run === run
        );
        return row?.explanation ?? null;
      });
    }
  }

  const report = {
    meta: {
      probe: "stage2-short-prompt",
      model: `${stageModel.provider}/${stageModel.model}`,
      cache: "off",
      repeats: REPEATS,
      temperature: 0,
      seed: STAGE2_SEED,
      note3c:
        "No committed 3c text found in prior specs; constructed ranking-boundary example for G.",
      promptPath: "lib/qc/pipeline-v4/prompts/stage2_v4.md",
      meridianSource: "scripts/diagnostic/eval-ablation/meridian_source.txt",
      totalCalls: rows.length,
      totalCostUsd: totalCost,
      totalInputTokens: totalIn,
      totalOutputTokens: totalOut,
      ranAt: new Date().toISOString(),
      promptMeta,
    },
    matrix,
    baselineConfirmedCounts,
    gMovesE2orE3KeepingControls: gMovesE2orE3,
    hMovesE2orE3KeepingControls: hMovesE2orE3,
    e2e3Explanations,
    rows,
  };

  await mkdir(OUT_DIR, { recursive: true });
  const outPath = path.join(OUT_DIR, "short-prompt-rows.json");
  await writeFile(outPath, JSON.stringify(report, null, 2) + "\n");

  console.log("");
  console.log("MATRIX (stmt x variant x run1/run2/run3)");
  console.log(
    pad("stmt", 6) +
      variantIds.map((v) => pad(v + "(r1 r2 r3)", 56)).join("")
  );
  for (const st of statements) {
    console.log(
      pad(st.id, 6) +
        variantIds
          .map((v) => pad(matrix[st.id][v].join(" / "), 56))
          .join("")
    );
  }
  console.log("");
  console.log(`Measured cost: $${totalCost.toFixed(6)} (in=${totalIn} out=${totalOut})`);
  console.log(
    `Baseline confirmed counts E1/E2/E3: ${baselineConfirmedCounts.E1}/${baselineConfirmedCounts.E2}/${baselineConfirmedCounts.E3} of 3`
  );
  console.log(`G moves E2/E3 off confirmed with controls held: ${gMovesE2orE3}`);
  console.log(`H moves E2/E3 off confirmed with controls held: ${hMovesE2orE3}`);
  console.log(`Wrote ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
