#!/usr/bin/env node
/**
 * Silence about the author's own actions is not evidence against them.
 *
 * Part 0c  blast radius across the four Review artefacts, zero model calls
 * Part 4a  stage 1, arm NEW, three runs on the cd9a666 fixtures
 * Part 4b  the 8cad514 removal breadth audit re-scored under the new rule
 *
 * Usage: node scripts/diagnostic/revise/author-statements.mjs
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
const { finalizeSuggestRevisionText, gatherConcerns } = await import(
  "../../../lib/build-revision-prompt.mjs"
);
const { runStage1 } = await import("../../../lib/revise-stage1.mjs");
const {
  authorStatementExemption,
  AUTHOR_STATEMENT_KEPT_NOTE,
  OUTCOME_AUTHOR_EXEMPT,
  tightestUnsupportedSpans,
} = await import("../../../lib/revise-author-statement.mjs");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = __dirname;
const cfg = STAGE_MODELS["writing-rewrite"];
const RUNS = 3;

/** The fixture's author is the LP writing the commentary, not the GP it is about. */
const FIXTURE_ORG = "Partners Group";

const EQUITY_FIGURE = "EUR 80-100 million";
const DATE_NEEDLE = "June 2026";
const COMMIT_NEEDLE = "Partners Group committed";
const CONTROL_NEEDLE = "control-oriented";

/** Part 0c. Each artefact with the organisation that authored its draft. */
const ARTEFACTS = [
  ["suggest-after-r10-review1.json", "Halden Group"],
  ["suggest-after-r10-review2.json", "Halden Group"],
  ["condition-b-review.json", "Halden Group"],
  ["coverage-gap-review.json", FIXTURE_ORG],
];

const trunc = (s, n = 150) => {
  const t = String(s ?? "").replace(/\s+/g, " ").trim();
  return t.length <= n ? t : `${t.slice(0, n - 1)}…`;
};

function findStatementArrays(node, out = [], depth = 0) {
  if (!node || typeof node !== "object" || depth > 6) return out;
  if (Array.isArray(node)) {
    if (node.length && node[0] && node[0].qcCard) out.push(node);
    node.forEach((n) => findStatementArrays(n, out, depth + 1));
    return out;
  }
  for (const v of Object.values(node)) findStatementArrays(v, out, depth + 1);
  return out;
}

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
  return {
    calls: usages.filter(Boolean).length,
    input,
    cached,
    output,
    cost,
    hitRate: input ? cached / input : 0,
  };
}

// ------------------------------------------------------------------ Part 0c
async function blastRadius() {
  const rows = [];
  for (const [file, org] of ARTEFACTS) {
    const json = JSON.parse(await readFile(path.join(OUT_DIR, file), "utf8"));
    const arrays = findStatementArrays(json);
    if (!arrays.length) continue;
    const statements = arrays.sort((a, b) => b.length - a.length)[0];
    for (const concern of gatherConcerns(statements, null)) {
      const decision = authorStatementExemption(concern, { authoringOrganisation: org });
      rows.push({
        artefact: file,
        organisation: org,
        statementIndex: concern.statementIndex,
        statementText: concern.statementText,
        kind: concern.evidence?.kind ?? null,
        verdict: concern.evidence?.verdict ?? null,
        flaggedElements: tightestUnsupportedSpans(concern).map((s) => s.text),
        ...decision,
      });
    }
  }
  return rows;
}

// ------------------------------------------------------------------ Part 4b
async function removalAuditRescore() {
  const audit = JSON.parse(await readFile(path.join(OUT_DIR, "removal-breadth-rows.json"), "utf8"));
  return (audit.selected || []).map((row) => {
    // Every selected row reached the gate as an aggregated not_supported with
    // gatherConcerns kind "unsupported", which is the silence path by
    // definition. No house name is configured per corpus case, so only the
    // first-person path can fire here.
    const decision = authorStatementExemption(
      {
        statementText: row.sentenceText,
        evidence: { kind: "unsupported", verdict: "no_support" },
      },
      {}
    );
    return {
      statementId: row.statementId,
      sentenceText: row.sentenceText,
      adjudication: row.adjudication,
      exempt: decision.exempt,
      reason: decision.reason,
    };
  });
}

// ------------------------------------------------------------------ Part 4a
async function stage1Runs() {
  const draft = (
    await readFile(path.join(OUT_DIR, "fixtures", "meridian_production_original.txt"), "utf8")
  ).trim();
  const review = JSON.parse(await readFile(path.join(OUT_DIR, "coverage-gap-review.json"), "utf8"));
  const concerns = gatherConcerns(review.payload?.statements ?? [], null);
  const sourceText = concerns
    .flatMap((c) => [c.evidence?.excerpt, c.evidence?.conflictingPassage])
    .filter(Boolean)
    .join("\n\n");

  const runs = [];
  for (let r = 1; r <= RUNS; r++) {
    const usages = [];
    const s1 = await runStage1(draft, concerns, {
      sourceText,
      authoringOrganisation: FIXTURE_ORG,
      callModel: async (prompt, meta) => {
        const c = await callLLM({
          provider: cfg.provider,
          model: cfg.model,
          temperature: 0,
          seed: 1,
          responseFormat: "json",
          messages: [{ role: "user", content: prompt }],
          traceName: `author-statements-${r}-${meta.index}`,
          spanName: `author-statements-${r}-${meta.index}`,
          metadata: { route: "author-statements", kind: meta.kind },
        });
        usages.push(c.usage);
        return { text: c.text, usage: c.usage };
      },
    });

    const finalized = finalizeSuggestRevisionText(s1.revisedDraft, {
      originalDraft: draft,
      concerns,
      deterministicUnsupportedRemoval: true,
      authoringOrganisation: FIXTURE_ORG,
      log: () => {},
    });

    const text = finalized.revisedDraft;
    const row = {
      run: r,
      equityFigureRemoved: !text.includes(EQUITY_FIGURE),
      keptDate: text.includes(DATE_NEEDLE),
      keptCommitment: text.includes(COMMIT_NEEDLE),
      keptControlOriented: text.includes(CONTROL_NEEDLE),
      unreported: finalized.unreportedEvents.length,
      exemptions: s1.events.filter((e) => e.outcome === OUTCOME_AUTHOR_EXEMPT),
      edited: s1.events.filter((e) => e.outcome === "edited").length,
      noChange: s1.events.filter((e) => e.outcome === "no_change").length,
      rejected: s1.events.filter((e) => e.outcome === "rejected"),
      quietNotes: finalized.markers.filter((m) => m.note === AUTHOR_STATEMENT_KEPT_NOTE).length,
      removalEvents: finalized.removalEvents ?? [],
      revisedDraft: text,
      usage: tally(usages),
    };
    runs.push(row);
    console.log(
      `run ${r}: equityRemoved=${row.equityFigureRemoved} date=${row.keptDate} ` +
        `commitment=${row.keptCommitment} control-oriented=${row.keptControlOriented} ` +
        `exempt=${row.exemptions.length} edited=${row.edited} rejected=${row.rejected.length} ` +
        `unreported=${row.unreported}`
    );
  }
  return { draft, concerns, runs };
}

async function main() {
  console.log("=== PART 0c, BLAST RADIUS (zero model calls) ===\n");
  const blast = await blastRadius();
  for (const row of blast) {
    console.log(
      `  ${(row.exempt ? "EXEMPT" : "edit").padEnd(7)} ${row.artefact.replace(/\.json$/, "")} ` +
        `S${row.statementIndex} [${row.kind ?? "-"}] ${trunc(row.statementText, 90)}`
    );
    console.log(`          ${row.reason}`);
  }
  const exemptCount = blast.filter((r) => r.exempt).length;
  const silenceCount = blast.filter((r) => r.restsOnSilence).length;
  console.log(
    `\n  flagged=${blast.length} exempt=${exemptCount} ` +
      `rests-on-silence=${silenceCount} not-exempt=${blast.length - exemptCount}\n`
  );

  console.log("=== PART 4b, REMOVAL BREADTH AUDIT RE-SCORED ===\n");
  const rescore = await removalAuditRescore();
  for (const row of rescore) {
    console.log(
      `  ${(row.exempt ? "EXEMPT" : "removed").padEnd(8)} ${row.statementId.padEnd(9)} ` +
        `[${row.adjudication}] ${trunc(row.sentenceText, 80)}`
    );
  }
  const nowExempt = rescore.filter((r) => r.exempt);
  const stillRemoved = rescore.filter((r) => !r.exempt);
  const wrongOne = rescore.find((r) => r.statementId === "F01:S11");
  console.log(
    `\n  of ${rescore.length}: exempted=${nowExempt.length} still removed=${stillRemoved.length}`
  );
  console.log(`  F01:S11 (the WRONG one) exempted: ${wrongOne ? wrongOne.exempt : "NOT FOUND"}\n`);

  let stage1 = null;
  if (!hasProviderApiKey(cfg.provider)) {
    console.log("no provider API key; skipping Part 4a");
  } else {
    console.log(`=== PART 4a, STAGE 1 ARM NEW, ${RUNS} RUNS (${cfg.model}) ===\n`);
    stage1 = await stage1Runs();

    const n = (f) => stage1.runs.filter(f).length;
    console.log("\n  equity cheque removed        " + `${n((r) => r.equityFigureRemoved)}/${RUNS}`);
    console.log("  statement 0 keeps its date   " + `${n((r) => r.keptDate)}/${RUNS}`);
    console.log("  statement 0 keeps commitment " + `${n((r) => r.keptCommitment)}/${RUNS}`);
    console.log("  'control-oriented' preserved " + `${n((r) => r.keptControlOriented)}/${RUNS}`);
    console.log("  unreported changes           " + stage1.runs.map((r) => r.unreported).join(", "));

    const cost = stage1.runs.reduce((a, r) => a + r.usage.cost, 0);
    const input = stage1.runs.reduce((a, r) => a + r.usage.input, 0);
    const cached = stage1.runs.reduce((a, r) => a + r.usage.cached, 0);
    console.log(
      `\n  cost $${cost.toFixed(4)} over ${stage1.runs.reduce((a, r) => a + r.usage.calls, 0)} calls, ` +
        `cache hit ${input ? ((100 * cached) / input).toFixed(1) : "0.0"}%`
    );
  }

  await writeFile(
    path.join(OUT_DIR, "author-statements.json"),
    `${JSON.stringify(
      {
        ranAt: new Date().toISOString(),
        model: cfg.model,
        keptNote: AUTHOR_STATEMENT_KEPT_NOTE,
        blastRadius: blast,
        removalAuditRescore: rescore,
        stage1: stage1
          ? { runs: stage1.runs, concernKinds: stage1.concerns.map((c) => c.evidence?.kind ?? null) }
          : null,
      },
      null,
      2
    )}\n`,
    "utf8"
  );
  console.log("\nwrote author-statements.json");
  await flushObservability();
}

main().catch(async (err) => {
  console.error(err);
  await flushObservability();
  process.exit(1);
});
