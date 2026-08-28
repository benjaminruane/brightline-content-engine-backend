#!/usr/bin/env node
/**
 * Part 1 replay: how often did the model change the draft without saying so?
 * Part 2 probe:  does a NARROW call fix what the wide call ignores?
 *
 * Part 1 is zero cost. Part 2 spends six small reviser calls; arm A reuses the
 * three runs already on disk in coverage-gap-measure.json rather than paying
 * for the same control twice.
 *
 * Usage: node scripts/diagnostic/revise/narrow-call-probe.mjs
 */
import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadLocalEnvFiles } from "../lib/env.mjs";

loadLocalEnvFiles({ liveMeasurement: true });

const { callLLM, flushObservability, hasProviderApiKey } = await import(
  "../../../lib/observability.js"
);
const { STAGE_MODELS } = await import("../../../lib/qc/model-config.mjs");
const { buildRevisionPrompt, finalizeSuggestRevisionText, gatherConcerns, parseSoftenedMarkers } =
  await import("../../../lib/build-revision-prompt.mjs");
const { applyUnreportedChangeMarkers } = await import(
  "../../../lib/pr9-unreported-change-markers.mjs"
);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = __dirname;
const modelConfig = STAGE_MODELS["writing-rewrite"];
const RUNS = 3;

const TARGET_NEEDLE = "equity checks of EUR 80-100 million apiece";
const FIGURE = "EUR 80-100 million";

/** Same artefact -> draft mapping the earlier replays used. */
const ARTEFACT_DRAFT_SOURCES = [
  { prefix: "condition-a-condition-b-suggest-rerun", script: "run-condition-a-removal.mjs" },
  { prefix: "condition-a-suggest", script: "run-condition-a-removal.mjs" },
  { prefix: "reviser-noise-floor-run", script: "run-reviser-noise-floor.mjs" },
  { prefix: "deterministic-removal-", script: "run-deterministic-unsupported-removal-measure.mjs" },
];

async function loadDraftFromScript(scriptName) {
  const text = await readFile(path.join(OUT_DIR, scriptName), "utf8");
  const m = text.match(/const MERIDIAN_DRAFT = `([\s\S]*?)`;/);
  if (!m) throw new Error(`MERIDIAN_DRAFT not found in ${scriptName}`);
  return m[1];
}

function rawFrom(json) {
  if (typeof json?.raw === "string") return json.raw;
  if (typeof json?.payload?.raw === "string") return json.payload.raw;
  return null;
}

// ---------------------------------------------------------------- Part 1

async function runReplay() {
  const files = (await readdir(OUT_DIR)).filter((f) => f.endsWith(".json")).sort();
  const draftCache = new Map();
  const rows = [];
  const skipped = [];

  for (const file of files) {
    const mapping = ARTEFACT_DRAFT_SOURCES.find((m) => file.startsWith(m.prefix));
    let json;
    try {
      json = JSON.parse(await readFile(path.join(OUT_DIR, file), "utf8"));
    } catch {
      continue;
    }
    const raw = rawFrom(json);
    const looksLikeSuggest =
      typeof json?.revisedDraft === "string" || typeof json?.payload?.revisedDraft === "string";
    if (!looksLikeSuggest) continue;

    if (!raw) {
      skipped.push({ file, why: "raw model output not retained in the artefact" });
      continue;
    }
    if (!mapping) {
      skipped.push({ file, why: "no original draft mapping for this artefact" });
      continue;
    }

    if (!draftCache.has(mapping.script)) {
      draftCache.set(mapping.script, await loadDraftFromScript(mapping.script));
    }
    const original = draftCache.get(mapping.script);

    const parsed = parseSoftenedMarkers(raw);
    const out = applyUnreportedChangeMarkers(original, parsed, {
      concerns: [],
      traceId: file,
      log: () => {},
    });

    rows.push({
      file,
      modelMarkers: parsed.markers.length,
      unreported: out.unreportedEvents.length,
      regions: out.unreportedEvents.map((e) => ({
        text: e.regionText,
        chars: e.regionText.length,
        words: e.regionText.split(/\s+/).filter(Boolean).length,
      })),
    });
  }

  const withAny = rows.filter((r) => r.unreported > 0);
  const allRegions = rows.flatMap((r) => r.regions);
  const words = allRegions.map((r) => r.words).sort((a, b) => a - b);
  const dist =
    words.length === 0
      ? null
      : {
          min: words[0],
          median: words[Math.floor((words.length - 1) / 2)],
          max: words[words.length - 1],
          mean: Number((words.reduce((a, b) => a + b, 0) / words.length).toFixed(1)),
        };

  console.log("");
  console.log("PART 1  unreported-change replay, zero model calls");
  console.log(`artefacts measured:            ${rows.length}`);
  console.log(`artefacts NOT measurable:      ${skipped.length}`);
  console.log(`runs with >=1 unreported change: ${withAny.length} of ${rows.length}`);
  console.log(`total unreported changes:      ${allRegions.length}`);
  if (dist) {
    console.log(`region size, words:            min ${dist.min}, median ${dist.median}, mean ${dist.mean}, max ${dist.max}`);
  }
  for (const r of rows) {
    const flag = r.unreported > 0 ? " <-" : "";
    console.log(`  ${String(r.unreported).padStart(2)} unreported  (${String(r.modelMarkers).padStart(2)} model markers)  ${r.file}${flag}`);
    for (const g of r.regions) console.log(`        "${g.text.slice(0, 90)}"`);
  }
  if (skipped.length) {
    console.log("  not measurable:");
    for (const s of skipped) console.log(`    ${s.file}: ${s.why}`);
  }

  return { rows, skipped, totalUnreported: allRegions.length, runsWithAny: withAny.length, dist };
}

// ---------------------------------------------------------------- Part 2

const RULE_C =
  'kind "partial": Keep the CONFIRMED portion unchanged. If the source STATES a specific value for the unsupported element, inject that source value into the prose (house-style) and wrap THAT element in a marker (e.g. "around USD 1.9 billion"). When the source is silent or vague on the unsupported element, apply the ONE TEST to that element only: SOFTEN if the remaining phrase still tells the reader something; CUT THE CLAUSE if the figure WAS the claim; keep-and-flag only if cutting would remove the whole sentence. Never approximate the author\'s unsupported figure. Do not vague out a supported fact because another part of the same statement is unsupported.';

function buildMinimalPrompt(concern) {
  const ev = concern.evidence || {};
  const spans = Array.isArray(ev.unsupportedSpans) ? ev.unsupportedSpans : [];
  const lines = [
    "Revise one sentence from an investment document so it is supported by the source.",
    "",
    `SENTENCE: ${concern.statementText}`,
    "",
    `FINDING [kind=partial]: ${ev.reason || "(none)"}`,
  ];
  for (const s of spans) lines.push(`UNSUPPORTED ELEMENT: "${s.text}"`);
  if (ev.excerpt) lines.push(`SOURCE EXCERPT: ${ev.excerpt}`);
  lines.push(
    "",
    "RULE:",
    RULE_C,
    "",
    "Return ONLY the revised sentence, nothing else. If no change is warranted, return the sentence unchanged."
  );
  return lines.join("\n");
}

async function callArm(prompt, label) {
  const completion = await callLLM({
    provider: modelConfig.provider,
    model: modelConfig.model,
    temperature: 0,
    seed: 1,
    messages: [{ role: "user", content: prompt }],
    traceName: label,
    spanName: label,
    metadata: { route: "narrow-call-probe" },
  });
  return String(completion?.text ?? "").replace(/^```[a-z]*\n?|\n?```$/g, "").trim();
}

async function runProbe() {
  const review = JSON.parse(await readFile(path.join(OUT_DIR, "coverage-gap-review.json"), "utf8"));
  const concerns = gatherConcerns(review.payload?.statements ?? [], null);
  const target = concerns.find((c) => c.statementText.includes(TARGET_NEEDLE));
  if (!target) throw new Error("target statement not found in the cached Review");

  const results = [];

  // Arm A: reuse the three full-draft runs already on disk.
  const cg = JSON.parse(await readFile(path.join(OUT_DIR, "coverage-gap-measure.json"), "utf8"));
  const armAPrompt = buildRevisionPrompt(
    (await readFile(path.join(OUT_DIR, "fixtures", "meridian_production_original.txt"), "utf8")).trim(),
    concerns,
    { outputType: "reporting_commentary", requiredVersion: "complete" }
  );
  for (const run of cg.runDetail ?? []) {
    const draft = run.revisedDraft ?? "";
    const marker = (run.markers ?? []).find((m) => m.concernId === "C1");
    results.push({
      arm: "A",
      run: run.run,
      reused: true,
      figureRemoved: !draft.includes(FIGURE),
      revised: (draft.match(/The fund intends[^.]*\./) || ["(not found)"])[0],
      marker: marker?.note ?? "(none)",
      promptChars: armAPrompt.length,
      promptTokens: Math.round(armAPrompt.length / 4),
    });
  }

  const armBPrompt = buildRevisionPrompt(target.statementText, [target], {
    outputType: "reporting_commentary",
    requiredVersion: "complete",
  });
  const armCPrompt = buildMinimalPrompt(target);

  for (let r = 1; r <= RUNS; r++) {
    const raw = await callArm(armBPrompt, `narrow-probe-B${r}`);
    const fin = finalizeSuggestRevisionText(raw, {
      originalDraft: target.statementText,
      concerns: [target],
      log: () => {},
    });
    results.push({
      arm: "B",
      run: r,
      reused: false,
      figureRemoved: !fin.revisedDraft.includes(FIGURE),
      revised: fin.revisedDraft.trim(),
      marker: fin.markers.map((m) => m.note).join(" | ") || "(none)",
      promptChars: armBPrompt.length,
      promptTokens: Math.round(armBPrompt.length / 4),
    });
  }

  for (let r = 1; r <= RUNS; r++) {
    const raw = await callArm(armCPrompt, `narrow-probe-C${r}`);
    results.push({
      arm: "C",
      run: r,
      reused: false,
      figureRemoved: !raw.includes(FIGURE),
      revised: raw,
      marker: "(minimal prompt asks for no marker)",
      promptChars: armCPrompt.length,
      promptTokens: Math.round(armCPrompt.length / 4),
    });
  }

  const byArm = (a) => results.filter((r) => r.arm === a);
  const fixed = (a) => byArm(a).filter((r) => r.figureRemoved).length;

  console.log("");
  console.log("PART 2  narrow call probe");
  console.log(`target: ${target.statementText}`);
  console.log("");
  for (const a of ["A", "B", "C"]) {
    const rows = byArm(a);
    console.log(`ARM ${a}  prompt ~${rows[0]?.promptTokens ?? 0} tokens  fixed ${fixed(a)}/${rows.length}${a === "A" ? "  (reused from coverage-gap runs)" : ""}`);
    for (const r of rows) {
      console.log(`  run ${r.run}: figureRemoved=${r.figureRemoved}`);
      console.log(`    revised: ${r.revised.slice(0, 160)}`);
      console.log(`    marker:  ${String(r.marker).slice(0, 160)}`);
    }
  }

  const verdict =
    fixed("B") === RUNS || fixed("C") === RUNS ? "PREMISE HOLDS" : "PREMISE FAILS";
  console.log("");
  console.log(`VERDICT: ${verdict}`);
  console.log(`arm C prompt: ${byArm("C")[0]?.promptTokens} tokens against the 1,500-token break-even from ddf6ee8`);

  return { target: target.statementText, results, verdict };
}

async function main() {
  const replay = await runReplay();

  // --replay-only re-measures Part 1 without paying for Part 2 again; the
  // probe result already on disk is carried forward unchanged.
  let probe = null;
  if (process.argv.includes("--replay-only")) {
    try {
      probe = JSON.parse(await readFile(path.join(OUT_DIR, "narrow-call-probe.json"), "utf8")).probe;
    } catch {
      probe = null;
    }
    console.log("\n[part2] --replay-only; reusing the probe result already on disk");
  } else if (!hasProviderApiKey(modelConfig.provider)) {
    console.log("\n[part2] no provider API key; skipping the live probe");
  } else {
    probe = await runProbe();
  }

  await writeFile(
    path.join(OUT_DIR, "narrow-call-probe.json"),
    `${JSON.stringify({ ranAt: new Date().toISOString(), model: modelConfig.model, replay, probe }, null, 2)}\n`,
    "utf8"
  );
  console.log("\nwrote narrow-call-probe.json");
  await flushObservability();
}

main().catch(async (err) => {
  console.error(err);
  await flushObservability();
  process.exit(1);
});
