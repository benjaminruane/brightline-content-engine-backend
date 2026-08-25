#!/usr/bin/env node
/**
 * Short-prompt re-run on production Meridian source, plus mark rule (GM).
 * Source: meridian_source_production.txt (byte-preserved). Not meridian_source.txt.
 * Variants A2, G, GM. Six statements x three repeats = 54 calls. Cache OFF.
 *
 * Expected cost ~$0.45. Under $2.
 *
 * Usage:
 *   node scripts/diagnostic/eval-ablation/run-production-source.mjs
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadLocalEnvFiles } from "../lib/env.mjs";
import { DIAG_ROOT, REPO_ROOT } from "../lib/paths.mjs";
import { fingerprintFromCompletion } from "./fingerprint.mjs";

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
const MERIDIAN_PATH = path.join(__dirname, "meridian_source_production.txt");
const STAGE2_SEED = 1;
const REPEATS = 3;
const EXPECTED_G_SHA = "08e793df1977f120acdd3a3cf5aefc921fbac34ecfd0fe6aba707393f127a15f";
const EXPECTED_G_LEN = 4195;

const EVALUATIVE_CLAIMS = `Evaluative claims
Descriptive wording is FRAMING when it characterises something the source already asserts. Framing does not block confirmed.
Descriptive wording is an ADDITIONAL CHECKABLE CLAIM when it asserts a comparison or ranking, a quantity or threshold, a causal relationship, or a level of risk or certainty, and the source does not state it. That makes the statement partially_confirmed even when every other fact matches.
Test: could a reader ask "compared to what?" or "according to whom?" and find no answer in the source? Then it is a checkable claim, not framing.`;

const MARK_RULE = `Realised versus unrealised
A source reporting a figure as a current mark, valuation or unrealised position does not support a statement presenting the same figure as realised. Source wording such as "is currently marked at", "valued at" or "unrealised", against statement wording such as "has returned", "delivered", "achieved" or "generated", makes the statement partially_confirmed even when the numbers match. It is not conflicting: a mark is not mutually exclusive with an eventual return.`;

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

function buildGM(gPrompt) {
  const marker = `\n\n${EVALUATIVE_CLAIMS}\n\nWorked examples\n`;
  const idx = gPrompt.indexOf(marker);
  if (idx < 0) throw new Error("GM: Evaluative claims / Worked examples join not found in G");
  return (
    gPrompt.slice(0, idx) +
    `\n\n${EVALUATIVE_CLAIMS}\n\n${MARK_RULE}\n\nWorked examples\n` +
    gPrompt.slice(idx + marker.length)
  );
}

function sha256(s) {
  return createHash("sha256").update(s, "utf8").digest("hex");
}

function sha256Buf(buf) {
  return createHash("sha256").update(buf).digest("hex");
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
    traceName: "diag-eval-ablation-prod-source",
    spanName: "stage2-production-source",
    metadata: { variantId, statementId, runIndex },
  });

  const raw = completion?.text ?? "";
  const parsed = safeJsonParse(raw);
  const costUsd = calculateLlmCostUsd(stageModel.provider, stageModel.model, completion?.usage);
  return {
    classification: typeof parsed?.classification === "string" ? parsed.classification.trim() : null,
    explanation: typeof parsed?.explanation === "string" ? parsed.explanation : null,
    passage: typeof parsed?.passage === "string" ? parsed.passage : null,
    systemFingerprint: fingerprintFromCompletion(completion),
    usage: {
      inputTokens: Number(completion?.usage?.inputTokens) || 0,
      outputTokens: Number(completion?.usage?.outputTokens) || 0,
    },
    costUsd: Number(costUsd) || 0,
  };
}

async function main() {
  const stageModel = STAGE_MODELS["stage2-matching"];
  if (!hasProviderApiKey(stageModel.provider)) {
    throw new Error(`Missing API key for ${stageModel.provider}`);
  }

  // Binary-safe read: no normalisation of dashes or trailing quote.
  const meridianBuf = await readFile(MERIDIAN_PATH);
  const meridian = meridianBuf.toString("utf8");
  // Match production getStage2SystemPrompt(): file contents are .trim()'d.
  const baseline = (await readFile(STAGE2_PROMPT_PATH, "utf8")).trim();
  const gPrompt = buildG().trim();
  const gmPrompt = buildGM(gPrompt).trim();

  if (gPrompt.length !== EXPECTED_G_LEN || sha256(gPrompt) !== EXPECTED_G_SHA) {
    throw new Error(
      `G mismatch: len=${gPrompt.length} sha=${sha256(gPrompt)} expected ${EXPECTED_G_LEN} ${EXPECTED_G_SHA}`
    );
  }
  if (!gmPrompt.includes(MARK_RULE)) throw new Error("GM missing mark rule");
  if (gmPrompt.indexOf(MARK_RULE) < gmPrompt.indexOf(EVALUATIVE_CLAIMS)) {
    throw new Error("GM: mark rule must follow Evaluative claims");
  }
  if (gmPrompt.indexOf(MARK_RULE) > gmPrompt.indexOf("Worked examples")) {
    throw new Error("GM: mark rule must precede Worked examples");
  }

  const variants = { A2: baseline, G: gPrompt, GM: gmPrompt };
  const promptMeta = {};
  for (const id of ["A2", "G", "GM"]) {
    promptMeta[id] = { length: variants[id].length, sha256: sha256(variants[id]) };
  }
  const sourceMeta = {
    path: "scripts/diagnostic/eval-ablation/meridian_source_production.txt",
    bytes: meridianBuf.length,
    chars: [...meridian].length,
    sha256: sha256Buf(meridianBuf),
    endsWithDoubleQuote: meridian.endsWith('"'),
    hasDisciplinesTypo: meridian.includes("Disciplines approach"),
  };

  console.log(`source chars=${sourceMeta.chars} sha=${sourceMeta.sha256}`);
  console.log(`GM length ${promptMeta.GM.length}`);
  for (const id of ["A2", "G", "GM"]) {
    console.log(`${id}  ${promptMeta[id].length}  ${promptMeta[id].sha256}`);
  }

  const statements = [
    {
      id: "E1",
      kind: "exhibit",
      statement:
        "It has realised a gross MOIC of 2.4 times across 17 exits, placing it in the top quartile of European lower-mid-market managers.",
      source: meridian,
    },
    {
      id: "E2",
      kind: "exhibit",
      statement:
        "The team's stability, with no senior departures across the last three fund cycles, means key-person risk is limited.",
      source: meridian,
    },
    {
      id: "E3",
      kind: "exhibit",
      statement: "Fund IV has returned 1.9 times gross MOIC and a 24 per cent gross IRR.",
      source: meridian,
    },
    {
      id: "C1",
      kind: "control",
      statement:
        "Meridian Capital Partners V is a EUR 1.2 billion fund targeting lower-mid-market buyouts in European industrial technology and business services.",
      source: meridian,
    },
    {
      id: "C2",
      kind: "control",
      statement:
        "In summary, the Company combines a defensible competitive position in a specialised vertical with high switching costs.",
      source:
        "NSH occupies a strong position in a deeply specialised vertical with high switching costs.",
    },
    {
      id: "C3",
      kind: "control",
      statement:
        "The fund will hold investments for four to six years and will not deploy more than 30 per cent of commitments outside the EU.",
      source: meridian,
    },
  ];

  const variantIds = ["A2", "G", "GM"];
  const rows = [];
  let totalCost = 0;
  let totalIn = 0;
  let totalOut = 0;
  const totalCalls = statements.length * variantIds.length * REPEATS;

  console.log(`Expected cost ~$0.45 for ${totalCalls} calls. Under $2.`);
  console.log("Cache OFF. Source: meridian_source_production.txt");

  for (const st of statements) {
    for (const vid of variantIds) {
      for (let run = 1; run <= REPEATS; run++) {
        process.stdout.write(`${st.id}/${vid}/r${run} `);
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
          variantId: vid,
          run,
          classification: result.classification,
          explanation: result.explanation,
          passage: result.passage,
          systemFingerprint: result.systemFingerprint ?? null,
          usage: result.usage,
          costUsd: result.costUsd,
          statement: st.statement,
          sourceNote: st.id === "C2" ? "prompt_worked_example_3" : "meridian_source_production",
        });
        console.log(
          `${result.classification ?? "PARSE_FAIL"} fp=${result.systemFingerprint || "null"}`
        );
      }
    }
  }

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

  const gmVsGDiffs = [];
  for (const st of statements) {
    for (let run = 1; run <= REPEATS; run++) {
      const g = matrix[st.id].G[run - 1];
      const gm = matrix[st.id].GM[run - 1];
      if (g !== gm) {
        gmVsGDiffs.push({ statementId: st.id, run, G: g, GM: gm });
      }
    }
  }

  const exhibitExplanations = {};
  for (const id of ["E1", "E2", "E3"]) {
    exhibitExplanations[id] = {};
    for (const vid of variantIds) {
      exhibitExplanations[id][vid] = [1, 2, 3].map((run) => {
        const row = rows.find(
          (r) => r.statementId === id && r.variantId === vid && r.run === run
        );
        return row?.explanation ?? null;
      });
    }
  }

  const controlsHold = (vid) =>
    ["C1", "C2", "C3"].every((id) => matrix[id][vid].every((c) => c === "confirmed"));
  const e2OffConfirmed = (vid) =>
    matrix.E2[vid].some((c) => c && c !== "confirmed");
  const e3OffConfirmed = (vid) =>
    matrix.E3[vid].some((c) => c && c !== "confirmed");

  const report = {
    meta: {
      probe: "stage2-production-source-short-prompt",
      model: `${stageModel.provider}/${stageModel.model}`,
      cache: "off",
      repeats: REPEATS,
      temperature: 0,
      seed: STAGE2_SEED,
      sourceMeta,
      promptMeta,
      totalCalls: rows.length,
      totalCostUsd: totalCost,
      totalInputTokens: totalIn,
      totalOutputTokens: totalOut,
      ranAt: new Date().toISOString(),
    },
    matrix,
    e1A2: matrix.E1.A2,
    gMovesE2OffConfirmed: e2OffConfirmed("G"),
    gControlsHold: controlsHold("G"),
    gmMovesE3OffConfirmed: e3OffConfirmed("GM"),
    gmControlsHold: controlsHold("GM"),
    gmVsGDiffs,
    exhibitExplanations,
    rows,
  };

  await mkdir(OUT_DIR, { recursive: true });
  const outPath = path.join(OUT_DIR, "production-source-rows.json");
  await writeFile(outPath, JSON.stringify(report, null, 2) + "\n");

  // Compact report (avoid wide tables that trip loop detectors)
  console.log("");
  console.log("MATRIX");
  for (const st of statements) {
    for (const vid of variantIds) {
      console.log(`${st.id} ${vid} ${matrix[st.id][vid].join(" ")}`);
    }
  }
  console.log(`cost $${totalCost.toFixed(6)}`);
  console.log(`E1 A2: ${matrix.E1.A2.join(" ")}`);
  console.log(`G moves E2: ${e2OffConfirmed("G")}; G controls: ${controlsHold("G")}`);
  console.log(`GM moves E3: ${e3OffConfirmed("GM")}; GM controls: ${controlsHold("GM")}`);
  console.log(`GM vs G diffs: ${gmVsGDiffs.length}`);
  for (const d of gmVsGDiffs) {
    console.log(`  ${d.statementId} r${d.run}: G=${d.G} GM=${d.GM}`);
  }
  console.log(`wrote ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
