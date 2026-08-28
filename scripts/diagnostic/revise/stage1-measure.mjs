#!/usr/bin/env node
/**
 * Arm OLD, the existing whole-draft path. Arm NEW, per-statement stage 1.
 * Three runs each, same committed Review, no Review re-run.
 *
 * Usage: node scripts/diagnostic/revise/stage1-measure.mjs
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadLocalEnvFiles } from "../lib/env.mjs";

loadLocalEnvFiles({ liveMeasurement: true });

const { callLLM, calculateLlmCostUsd, flushObservability, hasProviderApiKey } = await import(
  "../../../lib/observability.js"
);
const { STAGE_MODELS } = await import("../../../lib/qc/model-config.mjs");
const { buildRevisionPrompt, finalizeSuggestRevisionText, gatherConcerns } = await import(
  "../../../lib/build-revision-prompt.mjs"
);
const { runStage1 } = await import("../../../lib/revise-stage1.mjs");
const { concernKind } = await import("../../../lib/pr9-note-what-from-diff.mjs");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = __dirname;
const cfg = STAGE_MODELS["writing-rewrite"];
const RUNS = 3;

const FIGURE = "EUR 80-100 million";
const EQUITY_NEEDLE = "equity checks";

/** c1fb2c1 measured the whole-draft path refusing to act on 86.8% of findings. */
const REFUSAL_BASELINE = 0.868;

const stripFence = (s) =>
  String(s ?? "")
    .replace(/^```[a-z]*\n?/i, "")
    .replace(/\n?```$/, "")
    .trim();

function tally(usages) {
  let input = 0;
  let cached = 0;
  let output = 0;
  let cost = 0;
  for (const u of usages) {
    if (!u) continue;
    input += u.inputTokens ?? 0;
    cached += u.cachedInputTokens ?? 0;
    output += u.outputTokens ?? 0;
    cost += calculateLlmCostUsd(cfg.provider, cfg.model, u);
  }
  return { calls: usages.filter(Boolean).length, input, cached, output, cost, hitRate: input ? cached / input : 0 };
}

async function main() {
  if (!hasProviderApiKey(cfg.provider)) {
    console.log("no provider API key; cannot measure");
    return;
  }

  const draft = (
    await readFile(path.join(OUT_DIR, "fixtures", "meridian_production_original.txt"), "utf8")
  ).trim();
  const review = JSON.parse(await readFile(path.join(OUT_DIR, "coverage-gap-review.json"), "utf8"));
  const statements = review.payload?.statements ?? [];
  const concerns = gatherConcerns(statements, null);

  // Source text for the invented-fact check: every excerpt the Review carried.
  const sourceText = concerns
    .flatMap((c) => [c.evidence?.excerpt, c.evidence?.conflictingPassage])
    .filter(Boolean)
    .join("\n\n");

  console.log(`model ${cfg.model} | ${concerns.length} flagged statements | ${RUNS} runs per arm\n`);

  const results = { OLD: [], NEW: [] };

  // ---------------------------------------------------------------- arm OLD
  const wholePrompt = buildRevisionPrompt(draft, concerns, {
    outputType: "reporting_commentary",
    requiredVersion: "complete",
  });
  for (let r = 1; r <= RUNS; r++) {
    const c = await callLLM({
      provider: cfg.provider,
      model: cfg.model,
      temperature: 0,
      seed: 1,
      messages: [{ role: "user", content: wholePrompt }],
      traceName: `stage1-measure-old-${r}`,
      spanName: `stage1-measure-old-${r}`,
      metadata: { route: "stage1-measure", arm: "OLD" },
    });
    const finalized = finalizeSuggestRevisionText(stripFence(c.text), {
      originalDraft: draft,
      concerns,
      deterministicUnsupportedRemoval: true,
      log: () => {},
    });
    results.OLD.push({
      run: r,
      revisedDraft: finalized.revisedDraft,
      markers: finalized.markers.map((m) => ({ note: m.note, intent: m.intent, generated: !!m.generated })),
      unreported: finalized.unreportedEvents.length,
      figureRemoved: !finalized.revisedDraft.includes(FIGURE),
      usage: tally([c.usage]),
      events: [],
      rejections: [],
    });
    console.log(`OLD run ${r}: figureRemoved=${!finalized.revisedDraft.includes(FIGURE)} markers=${finalized.markers.length} unreported=${finalized.unreportedEvents.length}`);
  }

  // ---------------------------------------------------------------- arm NEW
  for (let r = 1; r <= RUNS; r++) {
    const usages = [];
    const s1 = await runStage1(draft, concerns, {
      sourceText,
      callModel: async (prompt, meta) => {
        const c = await callLLM({
          provider: cfg.provider,
          model: cfg.model,
          temperature: 0,
          seed: 1,
          responseFormat: "json",
          messages: [{ role: "user", content: prompt }],
          traceName: `stage1-measure-new-${r}-${meta.index}`,
          spanName: `stage1-measure-new-${r}-${meta.index}`,
          metadata: { route: "stage1-measure", arm: "NEW", kind: meta.kind },
        });
        usages.push(c.usage);
        return { text: c.text, usage: c.usage };
      },
    });

    const finalized = finalizeSuggestRevisionText(s1.revisedDraft, {
      originalDraft: draft,
      concerns,
      deterministicUnsupportedRemoval: true,
      log: () => {},
    });

    results.NEW.push({
      run: r,
      revisedDraft: finalized.revisedDraft,
      markers: finalized.markers.map((m) => ({ note: m.note, intent: m.intent, generated: !!m.generated })),
      unreported: finalized.unreportedEvents.length,
      figureRemoved: !finalized.revisedDraft.includes(FIGURE),
      usage: tally(usages),
      events: s1.events,
      rejections: s1.events.filter((e) => e.outcome === "rejected"),
    });
    console.log(
      `NEW run ${r}: figureRemoved=${!finalized.revisedDraft.includes(FIGURE)} ` +
        `edited=${s1.events.filter((e) => e.outcome === "edited").length} ` +
        `no_change=${s1.events.filter((e) => e.outcome === "no_change").length} ` +
        `rejected=${s1.events.filter((e) => e.outcome === "rejected").length} ` +
        `unreported=${finalized.unreportedEvents.length}`
    );
  }

  // ---------------------------------------------------------------- report
  const kinds = concerns.map((c) => concernKind(c) || "unknown");
  const actedNew = results.NEW.flatMap((r) => r.events.filter((e) => e.outcome === "edited"));
  const totalOpportunities = concerns.length * RUNS;
  const refusalNew = 1 - actedNew.length / totalOpportunities;

  const byKind = {};
  for (const r of results.NEW) {
    for (const e of r.events) {
      const k = e.kind || "unknown";
      byKind[k] = byKind[k] || { edited: 0, no_change: 0, rejected: 0 };
      byKind[k][e.outcome] = (byKind[k][e.outcome] || 0) + 1;
    }
  }

  const sum = (arm, f) => results[arm].reduce((a, r) => a + f(r), 0);
  const armCost = (arm) => sum(arm, (r) => r.usage.cost);
  const armHit = (arm) => {
    const i = sum(arm, (r) => r.usage.input);
    return i ? sum(arm, (r) => r.usage.cached) / i : 0;
  };

  console.log("\n=== EQUITY CHEQUE ===");
  for (const arm of ["OLD", "NEW"]) {
    console.log(`  ${arm}: figure removed ${results[arm].filter((r) => r.figureRemoved).length}/${RUNS}`);
  }

  console.log("\n=== OUTCOMES, arm NEW ===");
  for (const [k, v] of Object.entries(byKind)) {
    console.log(`  ${k.padEnd(14)} edited=${v.edited || 0} no_change=${v.no_change || 0} rejected=${v.rejected || 0}`);
  }
  console.log(`  refusal rate NEW: ${(refusalNew * 100).toFixed(1)}%  (baseline ${(REFUSAL_BASELINE * 100).toFixed(1)}%)`);

  console.log("\n=== VALIDATOR REJECTIONS ===");
  const allRej = results.NEW.flatMap((r) => r.rejections);
  if (allRej.length === 0) console.log("  none");
  for (const x of allRej) console.log(`  ${x.reason}: ${x.detail || ""} | ${x.statementText.slice(0, 60)}`);

  console.log("\n=== UNREPORTED CHANGES ===");
  for (const arm of ["OLD", "NEW"])
    console.log(`  ${arm}: ${results[arm].map((r) => r.unreported).join(", ")}`);

  console.log("\n=== COST ===");
  for (const arm of ["OLD", "NEW"]) {
    console.log(
      `  ${arm}: $${armCost(arm).toFixed(4)} over ${sum(arm, (r) => r.usage.calls)} calls, ` +
        `cache hit ${(armHit(arm) * 100).toFixed(1)}%`
    );
  }
  console.log(`  NEW/OLD = ${(armCost("NEW") / armCost("OLD")).toFixed(2)}x`);

  await writeFile(
    path.join(OUT_DIR, "stage1-measure.json"),
    `${JSON.stringify(
      {
        ranAt: new Date().toISOString(),
        model: cfg.model,
        concernKinds: kinds,
        results,
        refusalNew,
        byKind,
        cost: { OLD: armCost("OLD"), NEW: armCost("NEW"), hitOld: armHit("OLD"), hitNew: armHit("NEW") },
      },
      null,
      2
    )}\n`,
    "utf8"
  );
  console.log("\nwrote stage1-measure.json");
  await flushObservability();
}

main().catch(async (err) => {
  console.error(err);
  await flushObservability();
  process.exit(1);
});
