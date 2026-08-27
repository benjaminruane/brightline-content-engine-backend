#!/usr/bin/env node
/**
 * Condition A (and B re-run) under measured unsupported whole-sentence removal.
 * Does NOT call production Suggest (live EDGE CASE). Local writing-rewrite with
 * opts.measuredUnsupportedWholeSentenceRemoval: true.
 *
 * Reuses existing Reviews (Review is unchanged by this pass):
 *   A: suggest-after-r10-review1.json (meridian_source.txt only)
 *   B: condition-b-review.json (GP + Halden note)
 *
 * Usage: node scripts/diagnostic/revise/run-condition-a-removal.mjs
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadLocalEnvFiles } from "../lib/env.mjs";

loadLocalEnvFiles({ liveMeasurement: true });

const { callLLM, flushObservability, hasProviderApiKey } = await import(
  "../../../lib/observability.js"
);
const { STAGE_MODELS } = await import("../../../lib/qc/model-config.mjs");
const {
  gatherConcerns,
  buildPublicationMap,
  buildRevisionPrompt,
  finalizeSuggestRevisionText,
} = await import("../../../lib/build-revision-prompt.mjs");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = __dirname;

const MERIDIAN_DRAFT = `In June 2025, Halden Group made a lead commitment to Meridian Capital Partners V, a EUR 1.2 billion fund targeting lower-mid-market buyouts in European industrial technology and business services.

We were attracted to Meridian on the strength of a track record that is, in our view, genuinely exceptional.

It has realised a gross MOIC of 2.4 times across 17 exits, placing it in the top quartile of European lower-mid-market managers.

The team's stability, with no senior departures across the last three fund cycles, means key-person risk is limited.

Fund IV has returned 1.9 times gross MOIC and a 24 per cent gross IRR.

Meridian Capital Partners V is a EUR 1.2 billion fund targeting lower-mid-market buyouts in European industrial technology and business services.

The fund will hold investments for four to six years and will not deploy more than 30 per cent of commitments outside the EU.

On balance, we believe the fund should deliver returns broadly in line with its predecessor and we recommend the commitment.

The GP provided access to co-investments that would not otherwise have been available to us.

Halden Group expects the relationship to deepen over the life of the fund.`;

const DEEPEN_NEEDLE =
  "Halden Group expects the relationship to deepen over the life of the fund.";

const modelConfig = STAGE_MODELS["writing-rewrite"];
if (!hasProviderApiKey(modelConfig.provider)) {
  console.error(`[condition-a] Missing API key for provider ${modelConfig.provider}`);
  process.exit(1);
}

function stripCodeFence(text) {
  if (typeof text !== "string") return "";
  const trimmed = text.trim();
  const fence = /^```(?:\w+)?\s*\n?([\s\S]*?)\n?```\s*$/;
  const match = trimmed.match(fence);
  return match ? match[1].trim() : trimmed;
}

function stripMarkers(text) {
  return String(text || "").replace(/\{\{([\s\S]*?)\|\|[\s\S]*?\}\}/g, "$1");
}

function deepenPresent(revisedDraft) {
  const clean = stripMarkers(revisedDraft || "");
  return /expects the relationship to deepen/i.test(clean);
}

function findSentenceAbout(revisedDraft, re) {
  const paras = String(revisedDraft || "")
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
  return paras.find((p) => re.test(p)) || null;
}

async function localSuggest({ label, draftText, statements, sources }) {
  const publicationMap = buildPublicationMap(sources);
  const concerns = gatherConcerns(statements, publicationMap);
  const prompt = buildRevisionPrompt(draftText, concerns, {
    outputType: "reporting_commentary",
    requiredVersion: "complete",
    measuredUnsupportedWholeSentenceRemoval: true,
  });

  const hasMeasuredEdge = prompt.includes("EMPTY DRAFT EXCEPTION");
  const hasLiveKeep = prompt.includes("falls to keep-and-flag");
  if (!hasMeasuredEdge || hasLiveKeep) {
    throw new Error(
      `[${label}] prompt flag wiring failed: measured=${hasMeasuredEdge} liveKeep=${hasLiveKeep}`
    );
  }

  const t0 = Date.now();
  const completion = await callLLM({
    provider: modelConfig.provider,
    model: modelConfig.model,
    temperature: 0,
    messages: [{ role: "user", content: prompt }],
    traceName: "condition-a-removal",
    spanName: label,
    metadata: {
      route: "condition-a-removal",
      label,
      concernCount: concerns.length,
      measuredUnsupportedWholeSentenceRemoval: true,
    },
  });
  const ms = Date.now() - t0;
  const raw = stripCodeFence(typeof completion?.text === "string" ? completion.text : "");
  if (!raw.trim()) {
    throw new Error(`[${label}] empty raw completion`);
  }

  const finalized = finalizeSuggestRevisionText(raw, {
    originalDraft: draftText,
    traceId: label,
  });

  return {
    label,
    ms,
    model: `${modelConfig.provider}/${modelConfig.model}`,
    concernCount: concerns.length,
    promptCharCount: prompt.length,
    raw,
    revisedDraft: finalized.revisedDraft,
    markers: finalized.markers,
    honestyEvents: finalized.honestyEvents || [],
    deepenPresent: deepenPresent(finalized.revisedDraft),
    deepenSentence: findSentenceAbout(
      finalized.revisedDraft,
      /deepen|relationship to deepen/i
    ),
    markSentence: findSentenceAbout(
      finalized.revisedDraft,
      /Fund IV/i
    ),
    rankingSentence: findSentenceAbout(
      finalized.revisedDraft,
      /top quartile|2\.4 times across 17/i
    ),
    riskSentence: findSentenceAbout(
      finalized.revisedDraft,
      /key-person|senior departures|team'?s stability/i
    ),
    leadSentence: findSentenceAbout(
      finalized.revisedDraft,
      /lead commitment/i
    ),
    exceptionalSentence: findSentenceAbout(
      finalized.revisedDraft,
      /attracted to Meridian|exceptional|2\.4x realised/i
    ),
    recommendSentence: findSentenceAbout(
      finalized.revisedDraft,
      /recommend|On balance/i
    ),
    coinvestSentence: findSentenceAbout(
      finalized.revisedDraft,
      /co-investment/i
    ),
  };
}

async function main() {
  const costLog = [];
  const estimate = (label, usd) => {
    costLog.push({ label, usdEstimate: usd });
    return usd;
  };

  console.log("condition-a-removal: local Suggest with measured EDGE CASE");

  const reviewA = JSON.parse(
    await readFile(path.join(OUT_DIR, "suggest-after-r10-review1.json"), "utf8")
  );
  const statementsA = Array.isArray(reviewA.payload?.statements)
    ? reviewA.payload.statements
    : [];
  if (statementsA.length < 10) {
    throw new Error(`reuse Review A missing statements: ${statementsA.length}`);
  }
  const deepenA = statementsA.find((s) =>
    String(s?.text || "").includes("relationship to deepen")
  );
  console.log(
    `Reuse Review A (suggest-after-r10-review1.json): deepen=${deepenA?.qcCard?.displayVerdict}/${deepenA?.qcCard?.concernLevel}`
  );

  console.log("Part 1: Condition A Suggest (measured)...");
  const suggestA = await localSuggest({
    label: "condition-a-suggest",
    draftText: MERIDIAN_DRAFT,
    statements: statementsA,
    sources: [
      {
        index: 0,
        publicationState: "non_public",
        label: "Meridian Fund V summary (Halden copy)",
      },
    ],
  });
  estimate("condition_a_suggest_measured", 0.55);
  await writeFile(
    path.join(OUT_DIR, "condition-a-suggest.json"),
    `${JSON.stringify({ ranAt: new Date().toISOString(), ...suggestA }, null, 2)}\n`,
    "utf8"
  );
  console.log(
    `A: deepenPresent=${suggestA.deepenPresent} honestyEvents=${suggestA.honestyEvents.length} ms=${suggestA.ms}`
  );

  const reviewB = JSON.parse(
    await readFile(path.join(OUT_DIR, "condition-b-review.json"), "utf8")
  );
  const statementsB = Array.isArray(reviewB.payload?.statements)
    ? reviewB.payload.statements
    : [];
  if (statementsB.length < 10) {
    throw new Error(`reuse Review B missing statements: ${statementsB.length}`);
  }
  const deepenB = statementsB.find((s) =>
    String(s?.text || "").includes("relationship to deepen")
  );
  console.log(
    `Reuse Review B (condition-b-review.json): deepen=${deepenB?.qcCard?.displayVerdict}/${deepenB?.qcCard?.concernLevel}`
  );

  console.log("Part 2: Condition B Suggest re-run (measured)...");
  const suggestB = await localSuggest({
    label: "condition-b-suggest-measured",
    draftText: MERIDIAN_DRAFT,
    statements: statementsB,
    sources: [
      {
        index: 0,
        publicationState: "non_public",
        label: "Meridian Fund V summary (Halden copy)",
      },
      {
        index: 1,
        publicationState: "non_public",
        label: "Halden IC note (Meridian Fund V)",
      },
    ],
  });
  estimate("condition_b_suggest_measured", 0.8);
  await writeFile(
    path.join(OUT_DIR, "condition-a-condition-b-suggest-rerun.json"),
    `${JSON.stringify({ ranAt: new Date().toISOString(), ...suggestB }, null, 2)}\n`,
    "utf8"
  );
  console.log(
    `B: deepenPresent=${suggestB.deepenPresent} honestyEvents=${suggestB.honestyEvents.length} ms=${suggestB.ms}`
  );

  const totalUsd = costLog.reduce((a, c) => a + c.usdEstimate, 0);
  const meta = {
    ranAt: new Date().toISOString(),
    measuredFlag: "measuredUnsupportedWholeSentenceRemoval",
    reviewReuse: {
      conditionA: "suggest-after-r10-review1.json",
      conditionB: "condition-b-review.json",
    },
    deepenNeedle: DEEPEN_NEEDLE,
    costLog,
    totalUsdEstimate: totalUsd,
    conditionA: {
      deepenPresent: suggestA.deepenPresent,
      deepenSentence: suggestA.deepenSentence,
      markSentence: suggestA.markSentence,
      rankingSentence: suggestA.rankingSentence,
      riskSentence: suggestA.riskSentence,
      leadSentence: suggestA.leadSentence,
      exceptionalSentence: suggestA.exceptionalSentence,
      recommendSentence: suggestA.recommendSentence,
      coinvestSentence: suggestA.coinvestSentence,
      honestyEventCount: suggestA.honestyEvents.length,
      honestyEvents: suggestA.honestyEvents,
      markers: suggestA.markers,
      revisedDraft: suggestA.revisedDraft,
      ms: suggestA.ms,
    },
    conditionB: {
      deepenPresent: suggestB.deepenPresent,
      deepenSentence: suggestB.deepenSentence,
      markSentence: suggestB.markSentence,
      rankingSentence: suggestB.rankingSentence,
      riskSentence: suggestB.riskSentence,
      leadSentence: suggestB.leadSentence,
      exceptionalSentence: suggestB.exceptionalSentence,
      recommendSentence: suggestB.recommendSentence,
      coinvestSentence: suggestB.coinvestSentence,
      honestyEventCount: suggestB.honestyEvents.length,
      honestyEvents: suggestB.honestyEvents,
      markers: suggestB.markers,
      revisedDraft: suggestB.revisedDraft,
      ms: suggestB.ms,
    },
  };
  await writeFile(
    path.join(OUT_DIR, "condition-a-removal-run-meta.json"),
    `${JSON.stringify(meta, null, 2)}\n`,
    "utf8"
  );
  console.log(`Wrote meta. Estimated cost ~$${totalUsd.toFixed(2)}`);
}

try {
  await main();
} catch (err) {
  console.error("[condition-a-removal] fatal:", err?.message || err);
  process.exitCode = 1;
} finally {
  await flushObservability();
}
