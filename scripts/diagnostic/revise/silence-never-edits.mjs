#!/usr/bin/env node
/**
 * Silence never edits, and flag it at the right volume.
 *
 * Part 3a  register for every flagged statement in the four Review artefacts
 * Part 3b  the 8cad514 removal breadth 11, now that none of them is removed
 * Part 3c  one live Suggest on the production fixture with removal off
 *
 * Usage: node scripts/diagnostic/revise/silence-never-edits.mjs
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
const { tightestUnsupportedSpans } = await import("../../../lib/revise-author-statement.mjs");
const { flagRegister, LOUD_NOTE, QUIET_NOTE } = await import(
  "../../../lib/revise-flag-register.mjs"
);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = __dirname;
const cfg = STAGE_MODELS["writing-rewrite"];

const ARTEFACTS = [
  "suggest-after-r10-review1.json",
  "suggest-after-r10-review2.json",
  "condition-b-review.json",
  "coverage-gap-review.json",
];

/** Part 3a sanity checks, from the spec. */
const SANITY = [
  ["equity cheque", /equity check/i, "LOUD"],
  ["We recommend approval.", /^We recommend approval\.$/i, "QUIET"],
  ["diligence sentence", /enabled deep insight/i, "LOUD"],
];

const trunc = (s, n = 96) => {
  const t = String(s ?? "").replace(/\s+/g, " ").trim();
  return t.length <= n ? t : `${t.slice(0, n - 1)}…`;
};

const mdCell = (s) => String(s ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");

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

/** The element a register decision is made about: tightest span, else statement. */
function flaggedElementOf(concern) {
  const spans = tightestUnsupportedSpans(concern);
  return spans.length > 0 ? spans[0].text : concern.statementText;
}

// ------------------------------------------------------------------ Part 3a
async function classifyArtefacts() {
  const rows = [];
  for (const file of ARTEFACTS) {
    const json = JSON.parse(await readFile(path.join(OUT_DIR, file), "utf8"));
    const arrays = findStatementArrays(json);
    if (!arrays.length) continue;
    const statements = arrays.sort((a, b) => b.length - a.length)[0];
    for (const concern of gatherConcerns(statements, null)) {
      const element = flaggedElementOf(concern);
      const decision = flagRegister(concern, null, element);
      rows.push({
        artefact: file.replace(/\.json$/, ""),
        statementIndex: concern.statementIndex,
        statementText: concern.statementText,
        element,
        elementIsWholeStatement: element === concern.statementText,
        kind: concern.evidence?.kind ?? null,
        verdict: concern.evidence?.verdict ?? null,
        materiality: concern.materiality ?? null,
        register: decision.register,
        signal: decision.signal,
        featureSignals: decision.featureSignals,
        textSignals: decision.textSignals,
      });
    }
  }
  return rows;
}

// ------------------------------------------------------------------ Part 3b
async function classifyRemovalEleven() {
  const audit = JSON.parse(await readFile(path.join(OUT_DIR, "removal-breadth-rows.json"), "utf8"));
  return (audit.selected || []).map((row) => {
    // Every selected row was an aggregated not_supported with no span, so the
    // flagged element is the whole sentence and no source spoke.
    const concern = {
      statementIndex: row.statementIndex,
      statementText: row.sentenceText,
      evidence: { kind: "unsupported", verdict: "no_support" },
    };
    const decision = flagRegister(concern, null, row.sentenceText);
    return {
      statementId: row.statementId,
      sentenceText: row.sentenceText,
      adjudication: row.adjudication,
      register: decision.register,
      signal: decision.signal,
    };
  });
}

// ------------------------------------------------------------------ Part 3c
async function liveSuggest() {
  const draft = (
    await readFile(path.join(OUT_DIR, "fixtures", "meridian_production_original.txt"), "utf8")
  ).trim();
  const review = JSON.parse(await readFile(path.join(OUT_DIR, "coverage-gap-review.json"), "utf8"));
  const concerns = gatherConcerns(review.payload?.statements ?? [], null);

  const prompt = buildRevisionPrompt(draft, concerns, {
    outputType: "reporting_commentary",
    requiredVersion: "complete",
  });
  const completion = await callLLM({
    provider: cfg.provider,
    model: cfg.model,
    temperature: 0,
    seed: 1,
    messages: [{ role: "user", content: prompt }],
    traceName: "silence-never-edits",
    spanName: "silence-never-edits",
    metadata: { route: "silence-never-edits" },
  });

  const raw = String(completion?.text ?? "")
    .replace(/^```[a-z]*\n?/i, "")
    .replace(/\n?```$/, "")
    .trim();

  // Exactly the production options after Part 1.
  const finalized = finalizeSuggestRevisionText(raw, {
    originalDraft: draft,
    concerns,
    deterministicUnsupportedRemoval: false,
    log: () => {},
  });

  const removals = (finalized.removalEvents ?? []).filter((e) => e.action === "removed");
  const orphaned = finalized.markers.filter(
    (m) => !Number.isFinite(m.start) || !Number.isFinite(m.end) || m.end <= m.start
  );

  const sentenceSurvives = (needle) => finalized.revisedDraft.includes(needle);

  return {
    draft,
    revisedDraft: finalized.revisedDraft,
    markers: finalized.markers.map((m) => ({
      note: m.note,
      intent: m.intent,
      span: finalized.revisedDraft.slice(m.start, m.end),
    })),
    removalEventCount: (finalized.removalEvents ?? []).length,
    removals: removals.length,
    orphanedMarkers: orphaned.length,
    unreported: finalized.unreportedEvents?.length ?? 0,
    diligenceSentenceSurvives: sentenceSurvives("enabled deep insight"),
    equityFigureSurvives: sentenceSurvives("EUR 80-100 million"),
    loudNotesEmitted: finalized.markers.filter((m) => m.note === LOUD_NOTE).length,
    quietNotesEmitted: finalized.markers.filter((m) => m.note === QUIET_NOTE).length,
    usage: completion?.usage ?? null,
    cost: completion?.usage ? calculateLlmCostUsd(cfg.provider, cfg.model, completion.usage) : 0,
  };
}

async function main() {
  console.log("=== PART 3a, REGISTER FOR EVERY FLAGGED STATEMENT ===\n");
  const rows = await classifyArtefacts();
  for (const r of rows) {
    console.log(
      `  ${r.register.padEnd(8)} ${r.artefact.replace("suggest-after-", "")} S${r.statementIndex} ` +
        `[${r.kind ?? "-"}] ${trunc(r.element, 70)}`
    );
    console.log(`           ${r.signal}`);
  }
  const counts = rows.reduce((a, r) => ({ ...a, [r.register]: (a[r.register] || 0) + 1 }), {});
  console.log(`\n  ${rows.length} flagged: ${JSON.stringify(counts)}\n`);

  console.log("\n=== PART 3b, THE REMOVAL BREADTH 11, NOW FLAGGED NOT REMOVED ===\n");
  const eleven = await classifyRemovalEleven();
  for (const r of eleven) {
    console.log(
      `  ${r.register.padEnd(6)} ${r.statementId.padEnd(9)} [${r.adjudication}] ${trunc(r.sentenceText, 72)}`
    );
    console.log(`         ${r.signal}`);
  }
  const elevenCounts = eleven.reduce(
    (a, r) => ({ ...a, [r.register]: (a[r.register] || 0) + 1 }),
    {}
  );
  console.log(`\n  ${eleven.length} statements: ${JSON.stringify(elevenCounts)}\n`);

  // The three spec sanity sentences live across both sets: the equity cheque
  // and the diligence sentence in the Review artefacts, "We recommend
  // approval." in the removal breadth 11.
  console.log("  sanity checks (across 3a and 3b):");
  const searchable = [
    ...rows.map((r) => ({ register: r.register, text: `${r.element} ${r.statementText}` })),
    ...eleven.map((r) => ({ register: r.register, text: r.sentenceText })),
  ];
  const sanityResults = SANITY.map(([label, re, want]) => {
    const hit = searchable.find((r) => re.test(r.text.trim()));
    const got = hit ? hit.register : "NOT FOUND";
    console.log(`    ${got === want ? "PASS" : "FAIL"}  ${label}: want ${want}, got ${got}`);
    return { label, want, got, pass: got === want };
  });
  console.log("");

  let live = null;
  if (!hasProviderApiKey(cfg.provider)) {
    console.log("no provider API key; skipping Part 3c");
  } else {
    console.log(`=== PART 3c, ONE LIVE SUGGEST WITH REMOVAL OFF (${cfg.model}) ===\n`);
    live = await liveSuggest();
    console.log(`  removals                      ${live.removals}`);
    console.log(`  removal events at all         ${live.removalEventCount}`);
    console.log(`  orphaned markers              ${live.orphanedMarkers}`);
    console.log(`  unreported changes            ${live.unreported}`);
    console.log(`  diligence sentence survives   ${live.diligenceSentenceSurvives}`);
    console.log(`  equity figure survives        ${live.equityFigureSurvives}`);
    console.log(`  LOUD notes emitted            ${live.loudNotesEmitted}`);
    console.log(`  QUIET notes emitted           ${live.quietNotesEmitted}`);
    console.log("\n  markers:");
    for (const m of live.markers) {
      console.log(`    [${m.intent}] ${trunc(m.span, 54)}`);
      console.log(`        ${trunc(m.note, 130)}`);
    }
    console.log(`\n  cost $${live.cost.toFixed(4)}`);
  }

  const payload = {
    ranAt: new Date().toISOString(),
    model: cfg.model,
    notes: { LOUD: LOUD_NOTE, QUIET: QUIET_NOTE },
    partA: { rows, counts, sanity: sanityResults },
    partB: { rows: eleven, counts: elevenCounts },
    partC: live,
  };
  await writeFile(
    path.join(OUT_DIR, "silence-never-edits.json"),
    `${JSON.stringify(payload, null, 2)}\n`,
    "utf8"
  );

  // Markdown table for the report, so it cannot drift from the measurement.
  const table = [
    "| artefact | S | kind | flagged element | register | deciding signal |",
    "| --- | ---: | --- | --- | --- | --- |",
    ...rows.map(
      (r) =>
        `| ${r.artefact.replace("suggest-after-", "")} | ${r.statementIndex} | ${r.kind ?? "—"} | ${mdCell(trunc(r.element, 70))} | **${r.register}** | ${mdCell(r.signal)} |`
    ),
  ].join("\n");
  await writeFile(path.join(OUT_DIR, "silence-never-edits.table.md"), `${table}\n`, "utf8");

  console.log("\nwrote silence-never-edits.json and .table.md");
  await flushObservability();
}

main().catch(async (err) => {
  console.error(err);
  await flushObservability();
  process.exit(1);
});
