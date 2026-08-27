#!/usr/bin/env node
/**
 * Reviser noise floor: Suggest x3 against ONE unchanged Review, shipped prompt
 * Prompt: CURRENT SHIPPED (live keep-and-flag EDGE CASE; code owns removal).
 * Reuses Condition A Review
 * from suggest-after-r10-review1.json (52b469f artefacts).
 *
 * Usage: node scripts/diagnostic/revise/run-reviser-noise-floor.mjs
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

const CARD_DEFS = [
  {
    id: "lead",
    originalNeedle:
      "In June 2025, Halden Group made a lead commitment to Meridian Capital Partners V",
    findRe: /lead commitment/i,
  },
  {
    id: "exceptional",
    originalNeedle: "We were attracted to Meridian on the strength of a track record",
    findRe: /attracted to Meridian|exceptional|2\.4x/i,
  },
  {
    id: "ranking",
    originalNeedle: "It has realised a gross MOIC of 2.4 times across 17 exits",
    findRe: /2\.4 times across 17|top quartile/i,
  },
  {
    id: "risk",
    originalNeedle: "The team's stability, with no senior departures",
    findRe: /team'?s stability|key-person|senior departures/i,
  },
  {
    id: "mark",
    originalNeedle: "Fund IV has returned 1.9 times gross MOIC",
    findRe: /Fund IV/i,
  },
  {
    id: "fund_desc",
    originalNeedle: "Meridian Capital Partners V is a EUR 1.2 billion fund targeting",
    findRe: /^Meridian Capital Partners V is a EUR/i,
  },
  {
    id: "hold_period",
    originalNeedle: "The fund will hold investments for four to six years",
    findRe: /hold investments for four to six/i,
  },
  {
    id: "recommend",
    originalNeedle: "On balance, we believe the fund should deliver returns",
    findRe: /On balance|recommend/i,
  },
  {
    id: "coinvest",
    originalNeedle: "The GP provided access to co-investments",
    findRe: /co-investment/i,
  },
  {
    id: "deepen",
    originalNeedle: "Halden Group expects the relationship to deepen",
    findRe: /relationship to deepen/i,
  },
];

const modelConfig = STAGE_MODELS["writing-rewrite"];
if (!hasProviderApiKey(modelConfig.provider)) {
  console.error(`[noise-floor] Missing API key for ${modelConfig.provider}`);
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

function markersOverlappingSentence(markers, revisedDraft, sentence) {
  if (!sentence) return [];
  const idx = revisedDraft.indexOf(sentence);
  if (idx < 0) {
    // sentence may include marker-stripped text already
    const clean = stripMarkers(revisedDraft);
    const cidx = clean.indexOf(stripMarkers(sentence));
    if (cidx < 0) return [];
  }
  const start = revisedDraft.indexOf(sentence);
  const end = start >= 0 ? start + sentence.length : -1;
  if (start < 0) {
    // Fall back: any marker whose span text appears in the sentence
    return (markers || []).filter((m) => {
      const span = revisedDraft.slice(m.start, m.end);
      return span && sentence.includes(span);
    });
  }
  return (markers || []).filter((m) => m.start < end && m.end > start);
}

function cardSnapshot(def, revisedDraft, markers, originalDraft) {
  const sentence = findSentence(revisedDraft, def.findRe);
  const present = Boolean(sentence);
  const overlapping = markersOverlappingSentence(markers, revisedDraft, sentence || "");
  const intents = overlapping.map((m) => m.intent || null);
  const notes = overlapping.map((m) => m.note || "");
  const spans = overlapping.map((m) => revisedDraft.slice(m.start, m.end));
  const originalSentence =
    paras(originalDraft).find((p) => p.includes(def.originalNeedle.slice(0, 40))) || null;
  const proseChanged =
    present && originalSentence
      ? normProse(stripMarkers(sentence)) !== normProse(originalSentence)
      : present
        ? true
        : originalSentence
          ? true
          : false;
  // present false while original existed = removed
  const removed = Boolean(originalSentence) && !present;

  return {
    id: def.id,
    present,
    removed,
    sentence,
    markerCount: overlapping.length,
    intents,
    notes,
    spans,
    proseChanged: removed || proseChanged,
    signature: JSON.stringify({
      present,
      removed,
      prose: present ? normProse(stripMarkers(sentence)) : null,
      markerCount: overlapping.length,
      intents,
      notesNorm: notes.map((n) => normProse(n)),
      spansNorm: spans.map((s) => normProse(s)),
    }),
    intentSignature: JSON.stringify(intents),
    noteSignature: JSON.stringify(notes.map((n) => normProse(n))),
    proseSignature: JSON.stringify({
      present,
      prose: present ? normProse(stripMarkers(sentence)) : null,
    }),
  };
}

async function runSuggestOnce(label, statements) {
  const publicationMap = buildPublicationMap([
    {
      index: 0,
      publicationState: "non_public",
      label: "Meridian Fund V summary (Halden copy)",
    },
  ]);
  const concerns = gatherConcerns(statements, publicationMap);
  const prompt = buildRevisionPrompt(MERIDIAN_DRAFT, concerns, {
    outputType: "reporting_commentary",
    requiredVersion: "complete",
    // shipped prompt: flag OFF
  });
  if (prompt.includes("EMPTY DRAFT EXCEPTION")) {
    throw new Error("measured flag leaked into shipped prompt");
  }
  if (!prompt.includes("falls to keep-and-flag")) {
    throw new Error("live EDGE CASE missing from shipped prompt");
  }

  const t0 = Date.now();
  const completion = await callLLM({
    provider: modelConfig.provider,
    model: modelConfig.model,
    temperature: 0,
    seed: 1,
    messages: [{ role: "user", content: prompt }],
    traceName: "reviser-noise-floor",
    spanName: label,
    metadata: { route: "reviser-noise-floor", label, concernCount: concerns.length, seed: 1 },
  });
  const ms = Date.now() - t0;
  const raw = stripCodeFence(typeof completion?.text === "string" ? completion.text : "");
  if (!raw.trim()) throw new Error(`${label}: empty raw`);

  const finalized = finalizeSuggestRevisionText(raw, {
    originalDraft: MERIDIAN_DRAFT,
    traceId: label,
  });

  const cards = {};
  for (const def of CARD_DEFS) {
    cards[def.id] = cardSnapshot(
      def,
      finalized.revisedDraft,
      finalized.markers || [],
      MERIDIAN_DRAFT
    );
  }

  return {
    label,
    ms,
    raw,
    revisedDraft: finalized.revisedDraft,
    markers: finalized.markers,
    honestyEvents: finalized.honestyEvents || [],
    cards,
  };
}

function classifyStability(runs) {
  const ids = CARD_DEFS.map((d) => d.id);
  const identical = [];
  const intentVaried = [];
  const noteOnlyVaried = [];
  const proseVaried = [];

  for (const id of ids) {
    const snaps = runs.map((r) => r.cards[id]);
    const sigs = snaps.map((s) => s.signature);
    const allSame = sigs.every((s) => s === sigs[0]);
    if (allSame) {
      identical.push(id);
      continue;
    }
    const intentSame = snaps.every((s) => s.intentSignature === snaps[0].intentSignature);
    const proseSame = snaps.every((s) => s.proseSignature === snaps[0].proseSignature);
    const noteSame = snaps.every((s) => s.noteSignature === snaps[0].noteSignature);
    if (!proseSame) {
      proseVaried.push(id);
    } else if (!intentSame) {
      intentVaried.push(id);
    } else if (!noteSame) {
      noteOnlyVaried.push(id);
    } else {
      // marker count or span text differed without intent/note/prose buckets
      proseVaried.push(id);
    }
  }

  return {
    identical,
    intentVaried,
    noteOnlyVaried,
    proseVaried,
    unstable: [...intentVaried, ...noteOnlyVaried, ...proseVaried],
    total: ids.length,
  };
}

async function main() {
  const reviewA = JSON.parse(
    await readFile(path.join(OUT_DIR, "suggest-after-r10-review1.json"), "utf8")
  );
  const statements = Array.isArray(reviewA.payload?.statements)
    ? reviewA.payload.statements
    : [];
  if (statements.length < 10) {
    throw new Error(`Review reuse failed: ${statements.length} statements`);
  }

  console.log("reviser noise floor: Suggest x3, shipped prompt, reused Review");
  const runs = [];
  for (let i = 1; i <= 3; i++) {
    console.log(`run ${i}...`);
    const run = await runSuggestOnce(`noise-floor-run${i}`, statements);
    runs.push(run);
    await writeFile(
      path.join(OUT_DIR, `reviser-noise-floor-run${i}.json`),
      `${JSON.stringify({ ranAt: new Date().toISOString(), ...run }, null, 2)}\n`,
      "utf8"
    );
    console.log(`  ms=${run.ms} markers=${run.markers.length} honesty=${run.honestyEvents.length}`);
  }

  const stability = classifyStability(runs);
  const meta = {
    ranAt: new Date().toISOString(),
    reviewReuse: "suggest-after-r10-review1.json",
    prompt: "shipped (live keep-and-flag; code-owned removal)",
    model: `${modelConfig.provider}/${modelConfig.model}`,
    temperature: 0,
    runs: runs.map((r) => ({
      label: r.label,
      ms: r.ms,
      markerCount: r.markers.length,
      honestyEventCount: r.honestyEvents.length,
      cards: r.cards,
      revisedDraft: r.revisedDraft,
    })),
    stability,
    noiseFloorStatement: `${stability.unstable.length} of ${stability.total} unstable across three runs, prompt unchanged`,
    costEstimateUsd: 0.15,
  };

  await writeFile(
    path.join(OUT_DIR, "reviser-noise-floor-meta.json"),
    `${JSON.stringify(meta, null, 2)}\n`,
    "utf8"
  );
  console.log(meta.noiseFloorStatement);
  console.log(
    `identical=${stability.identical.length} intent=${stability.intentVaried.length} noteOnly=${stability.noteOnlyVaried.length} prose=${stability.proseVaried.length}`
  );
}

try {
  await main();
} catch (err) {
  console.error("[reviser-noise-floor] fatal:", err?.message || err);
  process.exitCode = 1;
} finally {
  await flushObservability();
}
