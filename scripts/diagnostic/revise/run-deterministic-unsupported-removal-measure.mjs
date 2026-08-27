#!/usr/bin/env node
/**
 * Part 3 measure: deterministic unsupported removal flag OFF vs ON.
 * Reuses Condition A Review (suggest-after-r10-review1.json). Shipped prompt
 * (0559301 measured EDGE CASE OFF). seed 1.
 *
 * Usage: node scripts/diagnostic/revise/run-deterministic-unsupported-removal-measure.mjs
 * Env: RUNS_PER_ARM=1|3 (default 1; set 3 if noise floor still unstable)
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
const RUNS_PER_ARM = Math.max(1, Number(process.env.RUNS_PER_ARM || "1") || 1);

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

const CARD_DEFS = [
  { id: "lead", findRe: /lead commitment/i },
  { id: "exceptional", findRe: /attracted to Meridian|exceptional|2\.4x/i },
  { id: "ranking", findRe: /2\.4 times across 17|top quartile/i },
  { id: "risk", findRe: /team'?s stability|key-person|senior departures/i },
  { id: "mark", findRe: /Fund IV/i },
  { id: "fund_desc", findRe: /^Meridian Capital Partners V is a EUR/i },
  { id: "hold_period", findRe: /hold investments for four to six/i },
  { id: "recommend", findRe: /On balance|recommend/i },
  { id: "coinvest", findRe: /co-investment/i },
  { id: "deepen", findRe: /relationship to deepen/i },
];

const modelConfig = STAGE_MODELS["writing-rewrite"];
if (!hasProviderApiKey(modelConfig.provider)) {
  console.error(`[det-removal] Missing API key for ${modelConfig.provider}`);
  process.exit(1);
}

function stripCodeFence(text) {
  if (typeof text !== "string") return "";
  const trimmed = text.trim();
  const fence = /^```(?:\w+)?\s*\n?([\s\S]*?)\n?```\s*$/;
  const match = trimmed.match(fence);
  return match ? match[1].trim() : trimmed;
}

function paras(text) {
  return String(text || "")
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
}

function findSentence(revisedDraft, re) {
  return paras(revisedDraft).find((p) => re.test(p)) || null;
}

function normProse(s) {
  return String(s || "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function cardSnap(def, revisedDraft, markers) {
  const sentence = findSentence(revisedDraft, def.findRe);
  const overlapping = (markers || []).filter((m) => {
    const span = revisedDraft.slice(m.start, m.end);
    return sentence && span && sentence.includes(span);
  });
  return {
    id: def.id,
    present: Boolean(sentence),
    sentence,
    markerCount: overlapping.length,
    intents: overlapping.map((m) => m.intent || null),
    notes: overlapping.map((m) => m.note || ""),
    proseNorm: sentence ? normProse(sentence) : null,
  };
}

async function runArm({ label, statements, concerns, deterministicUnsupportedRemoval }) {
  const prompt = buildRevisionPrompt(MERIDIAN_DRAFT, concerns, {
    outputType: "reporting_commentary",
    requiredVersion: "complete",
  });
  if (prompt.includes("EMPTY DRAFT EXCEPTION")) {
    throw new Error("0559301 measured EDGE CASE must stay OFF");
  }

  const t0 = Date.now();
  const completion = await callLLM({
    provider: modelConfig.provider,
    model: modelConfig.model,
    temperature: 0,
    seed: 1,
    messages: [{ role: "user", content: prompt }],
    traceName: "det-unsupported-removal",
    spanName: label,
    metadata: {
      route: "det-unsupported-removal",
      label,
      deterministicUnsupportedRemoval,
      seed: 1,
    },
  });
  const ms = Date.now() - t0;
  const raw = stripCodeFence(typeof completion?.text === "string" ? completion.text : "");
  if (!raw.trim()) throw new Error(`${label}: empty raw`);

  const finalized = finalizeSuggestRevisionText(raw, {
    originalDraft: MERIDIAN_DRAFT,
    concerns,
    deterministicUnsupportedRemoval,
    traceId: label,
  });

  const cards = {};
  for (const def of CARD_DEFS) {
    cards[def.id] = cardSnap(def, finalized.revisedDraft, finalized.markers);
  }

  const deepenGone = !cards.deepen.present;
  const deepenRemoval = (finalized.removalEvents || []).find(
    (e) => e.statementText && /deepen/i.test(e.statementText)
  );
  const cutOnRemnant = (finalized.markers || []).find(
    (m) =>
      m.intent === "CUT" &&
      /no supplied source/i.test(m.note || "") &&
      !/deepen/i.test(finalized.revisedDraft.slice(m.start, m.end))
  );
  const deepenHonesty = (finalized.honestyEvents || []).filter((e) => {
    const span = e.span || "";
    const note = e.noteBefore || e.noteAfter || "";
    return /deepen/i.test(span) || /deepen/i.test(note) || e.contradiction === "cut_but_text_present";
  });

  return {
    label,
    ms,
    deterministicUnsupportedRemoval,
    raw,
    revisedDraft: finalized.revisedDraft,
    markers: finalized.markers,
    honestyEvents: finalized.honestyEvents || [],
    removalEvents: finalized.removalEvents || [],
    cards,
    score: {
      deepenGone,
      cutOnRemnant: Boolean(cutOnRemnant),
      cutNote: cutOnRemnant?.note || null,
      noteNamesNoSource: cutOnRemnant
        ? /no supplied source/i.test(cutOnRemnant.note || "")
        : false,
      noteInventedSubstitute: cutOnRemnant
        ? /author'?s point|materiality|\bstyle\b/i.test(cutOnRemnant.note || "")
        : false,
      honestyOnDeepenMarker: deepenHonesty,
      deepenRemoval,
    },
  };
}

async function main() {
  const reviewA = JSON.parse(
    await readFile(path.join(OUT_DIR, "suggest-after-r10-review1.json"), "utf8")
  );
  const statements = Array.isArray(reviewA.payload?.statements)
    ? reviewA.payload.statements
    : [];
  const publicationMap = buildPublicationMap([
    { index: 0, publicationState: "non_public", label: "Meridian Fund V summary (Halden copy)" },
  ]);
  const concerns = gatherConcerns(statements, publicationMap);
  console.log(
    `det-removal measure: runsPerArm=${RUNS_PER_ARM} concerns=${concerns.length} unsupported=${concerns.filter((c) => c.evidence?.kind === "unsupported").length}`
  );

  const arms = { off: [], on: [] };
  for (const flag of [false, true]) {
    const key = flag ? "on" : "off";
    for (let i = 1; i <= RUNS_PER_ARM; i++) {
      const label = `arm-${key}-run${i}`;
      console.log(label);
      const run = await runArm({
        label,
        statements,
        concerns,
        deterministicUnsupportedRemoval: flag,
      });
      arms[key].push(run);
      await writeFile(
        path.join(OUT_DIR, `deterministic-removal-${key}-run${i}.json`),
        `${JSON.stringify({ ranAt: new Date().toISOString(), ...run }, null, 2)}\n`,
        "utf8"
      );
      console.log(
        `  deepenGone=${run.score.deepenGone} cut=${run.score.cutOnRemnant} ms=${run.ms}`
      );
    }
  }

  const meta = {
    ranAt: new Date().toISOString(),
    reviewReuse: "suggest-after-r10-review1.json",
    seed: 1,
    temperature: 0,
    measuredEdgeCase: "OFF",
    runsPerArm: RUNS_PER_ARM,
    arms: {
      off: arms.off.map((r) => ({
        label: r.label,
        ms: r.ms,
        score: r.score,
        cards: r.cards,
        revisedDraft: r.revisedDraft,
        removalEvents: r.removalEvents,
        honestyEvents: r.honestyEvents,
      })),
      on: arms.on.map((r) => ({
        label: r.label,
        ms: r.ms,
        score: r.score,
        cards: r.cards,
        revisedDraft: r.revisedDraft,
        removalEvents: r.removalEvents,
        honestyEvents: r.honestyEvents,
      })),
    },
    costEstimateUsd: 0.08 * RUNS_PER_ARM * 2,
  };
  await writeFile(
    path.join(OUT_DIR, "deterministic-removal-measure-meta.json"),
    `${JSON.stringify(meta, null, 2)}\n`,
    "utf8"
  );
  console.log("wrote meta");
}

try {
  await main();
} catch (err) {
  console.error("[det-removal] fatal:", err?.message || err);
  process.exitCode = 1;
} finally {
  await flushObservability();
}
