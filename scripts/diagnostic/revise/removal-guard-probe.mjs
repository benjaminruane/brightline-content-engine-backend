#!/usr/bin/env node
/**
 * Probe: would a full-source yes/no backing check catch F01:S11 (WRONG deletion)
 * and what does it say on F14:S12 (ARGUABLE)?
 *
 * Part 1 only drives the commit. Part 2 proposal is emitted only if Part 1 passes.
 *
 * Usage: node scripts/diagnostic/revise/removal-guard-probe.mjs
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadLocalEnvFiles } from "../lib/env.mjs";
import { loadAllFixtures } from "../lib/fixtures.mjs";
import { loadPipelineSources } from "../lib/sources.mjs";
import { BASELINE_PATH } from "../claim-spans/baseline-cache.mjs";

loadLocalEnvFiles({ liveMeasurement: true });

const { callLLM, flushObservability, hasProviderApiKey, calculateLlmCostUsd } = await import(
  "../../../lib/observability.js"
);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_MD = path.join(__dirname, "removal-guard-probe.md");

const GUARD_MODEL = { provider: "openai", model: "gpt-4o-mini" };
const GUARD_SEED = 1;

/** Targets from 8cad514 breadth audit. */
const TARGETS = [
  {
    statementId: "F01:S11",
    caseId: "F01",
    fixtureId: 1,
    statementIndex: 11,
    adjudication: "WRONG",
    decidingLine: "We recommend this investment.",
  },
  {
    statementId: "F14:S12",
    caseId: "F14",
    fixtureId: 14,
    statementIndex: 12,
    adjudication: "ARGUABLE",
    decidingLine:
      "We would expect to return with clearer perspectives in the next thesis update.",
  },
];

const GUARD_SYSTEM = `You check whether a supplied source text backs a draft sentence.

Answer ONLY with JSON:
{
  "backs": true | false,
  "supporting_line": string | null
}

Rules:
- backs is true if ANY part of the source text supports, paraphrases, or is the same speech act as the draft sentence.
- If backs is true, supporting_line must be a short verbatim quote from the source (one sentence or less).
- If backs is false, supporting_line must be null.
- Do not use passage selection. Read the entire source.
- Do not invent text that is not in the source.`;

function normalizeForContains(s) {
  return String(s || "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function decidingLineInPassage(passage, decidingLine) {
  const p = normalizeForContains(passage);
  const d = normalizeForContains(decidingLine);
  if (!p || !d) return false;
  if (p.includes(d)) return true;
  // Allow near-identity when punctuation / quotes differ slightly.
  const pCore = p.replace(/[^\p{L}\p{N}\s]/gu, "");
  const dCore = d.replace(/[^\p{L}\p{N}\s]/gu, "");
  return pCore.includes(dCore) || dCore.includes(pCore);
}

function parseGuardJson(raw) {
  const text = String(raw || "").trim();
  const fence = text.match(/^```(?:json)?\s*([\s\S]*?)```$/i);
  const body = fence ? fence[1].trim() : text;
  try {
    const parsed = JSON.parse(body);
    const backs = parsed?.backs === true;
    const line =
      typeof parsed?.supporting_line === "string" && parsed.supporting_line.trim()
        ? parsed.supporting_line.trim()
        : null;
    return { backs, supportingLine: backs ? line : null, parseOk: true, raw: body };
  } catch {
    return { backs: false, supportingLine: null, parseOk: false, raw: body };
  }
}

async function loadCase(target) {
  const baseline = JSON.parse(await readFile(BASELINE_PATH, "utf8"));
  const cached = baseline?.cases?.[target.caseId];
  if (!cached) throw new Error(`missing baseline case ${target.caseId}`);

  const stmt = cached.statements?.[target.statementIndex];
  if (!stmt?.text) throw new Error(`missing statement ${target.statementId}`);

  const matches = (cached.matches || []).filter(
    (m) => Number(m.statementIndex) === Number(target.statementIndex)
  );

  const fixtures = await loadAllFixtures();
  const fx = fixtures.find((f) => parseInt(String(f.data.id), 10) === target.fixtureId);
  if (!fx) throw new Error(`missing fixture ${target.fixtureId}`);
  const sources = await loadPipelineSources(fx.data.sources || []);
  if (!sources.length) throw new Error(`no sources for ${target.caseId}`);

  return {
    statementText: stmt.text,
    matches,
    sources: sources.map((s, i) => ({
      index: i,
      label: s.label || s.name || `source_${i}`,
      text: s.text,
    })),
    baselineStaleNote: baseline._staleNote || null,
  };
}

async function runFullSourceGuard(statementText, source) {
  const user = `Draft sentence:
${statementText}

Full source (${source.label}):
${source.text}

Does any part of the source back the draft sentence?`.trim();

  const completion = await callLLM({
    provider: GUARD_MODEL.provider,
    model: GUARD_MODEL.model,
    temperature: 0,
    seed: GUARD_SEED,
    responseFormat: "json",
    messages: [
      { role: "system", content: GUARD_SYSTEM },
      { role: "user", content: user },
    ],
    traceName: "diag-removal-guard-probe",
    spanName: `full-source-guard-${source.label}`,
  });

  const usage = completion?.usage || { inputTokens: 0, outputTokens: 0 };
  const costUsd = calculateLlmCostUsd(GUARD_MODEL.provider, GUARD_MODEL.model, usage) || 0;
  const parsed = parseGuardJson(completion?.text ?? "");
  return {
    ...parsed,
    usage,
    costUsd,
    model: GUARD_MODEL.model,
    rawResponse: completion?.text ?? "",
  };
}

function renderReport({ rows, part1Pass, totalCost, ranAt }) {
  const L = [];
  const push = (s = "") => L.push(s);

  push("# Removal guard probe (full-source check)");
  push("");
  push("Commit target:");
  push(
    "`chore(revise): probe whether a full-source check catches the F01:S11 removal miss`"
  );
  push("");
  push("Flag `deterministicUnsupportedRemoval` stays OFF. No production wiring.");
  push(`Cost: **$${totalCost.toFixed(4)}** (${GUARD_MODEL.model}, temp 0, seed ${GUARD_SEED}).`);
  push(`Ran at: ${ranAt}`);
  push("");
  push("---");
  push("");
  push("## Part 1 result");
  push("");
  if (part1Pass) {
    push("```");
    push("PASS: full-source call finds backing for F01:S11 and would cancel that deletion.");
    push("```");
  } else {
    push("```");
    push("FAIL: full-source call did NOT find backing for F01:S11.");
    push("The proposed full-source guard design is wrong for this miss. Stop.");
    push("Do not build Part 2. Need a different lever.");
    push("```");
  }
  push("");

  for (const row of rows) {
    push(`### ${row.statementId} (${row.adjudication})`);
    push("");
    push(`Draft sentence: ${row.statementText}`);
    push("");
    push("#### 1a. What Stage 2 saw");
    push("");
    push(
      "Stage 2 `matchSingleSource` already receives the full source text and asks the model to return one `passage` plus a classification (no separate retriever)."
    );
    push("");
    for (const m of row.stage2) {
      push(`Source: \`${m.sourceLabel}\``);
      push("");
      push(`Classification: \`${m.classification}\``);
      push("");
      push("Selected passage:");
      push("");
      push("```");
      push(m.passage || "(empty)");
      push("```");
      push("");
      push("Explanation:");
      push("");
      push("```");
      push(m.explanation || "(empty)");
      push("```");
      push("");
      push(
        `Deciding source line among selected passages: **${m.decidingLineInPassage ? "YES" : "NO"}**`
      );
      push("");
      push("Deciding line (from 8cad514 hand adjudication):");
      push("");
      push("```");
      push(row.decidingLine);
      push("```");
      push("");
      if (m.b115Note) {
        push(m.b115Note);
        push("");
      }
    }

    push("#### 1b. Full-source call");
    push("");
    push(`Model: ${row.guard.model} / temp 0 / seed ${GUARD_SEED}`);
    push("");
    push(`backs: **${row.guard.backs}**`);
    push("");
    push("supporting_line:");
    push("");
    push("```");
    push(row.guard.supportingLine || "(null)");
    push("```");
    push("");
    push(
      `Guard would cancel deletion: **${row.guardWouldCancel ? "YES" : "NO"}**`
    );
    push("");
    push(
      `Cost this call: $${Number(row.guard.costUsd || 0).toFixed(4)} ` +
        `(in ${row.guard.usage?.inputTokens || 0} / out ${row.guard.usage?.outputTokens || 0})`
    );
    push("");
  }

  if (part1Pass) {
    push("---");
    push("");
    push("## Part 2 proposal only (not implemented)");
    push("");
    push("### Hook");
    push("");
    push(
      "- Gate body: `lib/pr9-deterministic-unsupported-removal.mjs` `applyDeterministicUnsupportedRemoval` (approx L309-L509)."
    );
    push(
      "- Call site: `lib/build-revision-prompt.mjs` `finalizeSuggestRevisionText` (approx L920-L930), after cut-punctuation, before marker honesty."
    );
    push(
      "- Proposed insert: after a statement is planned for removal (whole-sentence match found, empty-draft not tripped) and **before** mutating `draft` / placing CUT remnant (before the deletion loop body around L364+). Async guard does not fit the current sync finalize path; either (a) make finalize async and await guard results for planned removals, or (b) run the guard earlier in `api/suggest-revision.js` after concerns are gathered and pass a `guardCancelSet` of statement indices into finalize/opts."
    );
    push(
      "- Prefer (b) for a first ship: keep `applyDeterministicUnsupportedRemoval` sync; add `opts.guardCancelledStatementIndexes` (Set/array). If index is listed, emit `action: \"skipped\", reason: \"full_source_guard_backed\"` and leave text alone (today's flag behaviour for that sentence)."
    );
    push("");
    push("### Model and parameters");
    push("");
    push(
      `- \`${GUARD_MODEL.model}\` via OpenAI, temperature 0, seed 1, JSON response (same shape as this probe).`
    );
    push(
      "- Why mini: guard is a binary backing check with a short quote, not Stage 2 taxonomy. Cost and latency dominate because it may run once per planned deletion and must read full source text."
    );
    push(
      "- One call per (statement × source) for planned removals only, or one call per statement with all sources concatenated and labelled. Prefer per-source so a single backing source cancels."
    );
    push("");
    push("### Cost (worst realistic case)");
    push("");
    push(
      `- This probe: 2 calls, total **$${totalCost.toFixed(4)}** on the F01+F14 sources.`
    );
    push(
      "- Breadth audit upper bound: 11 planned removals. If each has 1 source ~2k-20k chars, rough order **~$0.01 to $0.05** per draft at gpt-4o-mini rates for 11 full-source checks (dominated by long memos like F01/F15)."
    );
    push(
      "- Multi-source cases (F22/F23 style): up to sourceCount calls per statement unless short-circuit on first backs=true."
    );
    push("");
    push("### Error / timeout failure mode");
    push("");
    push(
      "- CONFIRMED requirement: failure must be **do not delete**. On parse failure, provider error, timeout, or missing API key: treat as `backs: true` (cancel deletion) or skip the removal event with reason `full_source_guard_error`."
    );
    push("- Never delete when the guard did not return a clear `backs: false`.");
    push("");
    push("### UI recording");
    push("");
    push(
      "- Yes, record on the Suggest response / diagnostic payload: per cancelled statement `{ statementIndex, reason: \"full_source_guard_backed\", supportingLine, sourceLabel }` so operators can see why a flagged unsupported sentence was kept."
    );
    push(
      "- Do not invent a new user-facing marker intent for a cancelled deletion; leave today's unsupported flag path alone."
    );
    push("");
    push("### What could go wrong");
    push("");
    push(
      "- F01 shows Stage 2 already had the deciding passage and still said no_support (classification miss, not B115 passage miss). A full-source yes/no prompt can still help if it avoids Stage 2's procedural-closer framing, but the same model family could repeat the miss under a different prompt."
    );
    push(
      "- False cancel (backs=true on true unsupported): undoes the deletion benefit; safe direction but weakens the feature."
    );
    push(
      "- False delete (backs=false when source backs): same class of harm as today; failure mode must bias to cancel."
    );
    push(
      "- Long sources: context limits / cost; may need truncation policy (if truncated, fail closed: do not delete)."
    );
    push(
      "- Latency on Suggest finalize path if awaited inline; prefer parallel guards for all planned removals."
    );
    push("");
  } else {
    push("---");
    push("");
    push("## Part 2");
    push("");
    push("Skipped. Part 1 did not pass.");
    push("");
  }

  push("---");
  push("");
  push("## Pass conditions");
  push("");
  push(
    `- Part 1: full-source finds F01:S11 backing and would cancel: **${part1Pass ? "PASS" : "FAIL"}**`
  );
  push(`- Cost stated: PASS ($${totalCost.toFixed(4)})`);
  push("");

  return `${L.join("\n")}\n`;
}

async function main() {
  if (!hasProviderApiKey(GUARD_MODEL.provider)) {
    console.error(`[removal-guard-probe] missing API key for ${GUARD_MODEL.provider}`);
    process.exit(1);
  }

  const ranAt = new Date().toISOString();
  /** @type {Array<object>} */
  const rows = [];
  let totalCost = 0;

  for (const target of TARGETS) {
    const loaded = await loadCase(target);
    const stage2 = loaded.matches.map((m) => {
      const passage = typeof m.passage === "string" ? m.passage : "";
      const inPassage = decidingLineInPassage(passage, target.decidingLine);
      let b115Note = "";
      if (target.statementId === "F01:S11") {
        b115Note = inPassage
          ? "B115 question: for F01:S11 the deciding line WAS the Stage 2 selected passage. This miss is classification (explanation treats the draft as a non-factual procedural closer), not passage selection."
          : "B115 question: deciding line was NOT in the Stage 2 selected passage (passage-selection miss).";
      } else if (target.statementId === "F14:S12") {
        b115Note = inPassage
          ? "Deciding deferral line was inside the Stage 2 passage."
          : "Deciding deferral line was NOT the Stage 2 selected passage; Stage 2 quoted a different thesis-endorsement sentence.";
      }
      return {
        sourceIndex: m.sourceIndex,
        sourceLabel: m.sourceLabel,
        classification: m.classification,
        passage,
        explanation: typeof m.explanation === "string" ? m.explanation : "",
        decidingLineInPassage: inPassage,
        b115Note,
      };
    });

    // One full-source call per statement against the primary (only) source for these cases.
    const source = loaded.sources[0];
    const guard = await runFullSourceGuard(loaded.statementText, source);
    totalCost += Number(guard.costUsd) || 0;

    const guardWouldCancel = guard.backs === true;
    rows.push({
      ...target,
      statementText: loaded.statementText,
      stage2,
      guard,
      guardWouldCancel,
      sourceLabel: source.label,
      sourceChars: source.text.length,
    });

    console.log(
      `${target.statementId}: stage2PassageHasDeciding=${stage2[0]?.decidingLineInPassage} guard.backs=${guard.backs} cancel=${guardWouldCancel} cost=$${Number(guard.costUsd).toFixed(4)}`
    );
  }

  const f01 = rows.find((r) => r.statementId === "F01:S11");
  const part1Pass = f01?.guardWouldCancel === true;

  const md = renderReport({ rows, part1Pass, totalCost, ranAt });
  await writeFile(OUT_MD, md, "utf8");
  await flushObservability().catch(() => {});

  console.log(part1Pass ? "PART1 PASS" : "PART1 FAIL");
  console.log(`wrote ${OUT_MD}`);
  console.log(`totalCost=$${totalCost.toFixed(4)}`);
}

main().catch(async (err) => {
  console.error("[removal-guard-probe] fatal:", err?.message || err);
  try {
    await flushObservability();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
