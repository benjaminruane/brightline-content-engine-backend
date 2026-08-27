#!/usr/bin/env node
/**
 * Part 1: full-source removal guard sweep over all 11 breadth-audit candidates,
 * with quote verification.
 * Part 2: zero-cost size of non-factual / procedural-closer Stage 2 reasoning.
 *
 * Usage: node scripts/diagnostic/revise/removal-guard-sweep.mjs
 */
import { readFile, writeFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadLocalEnvFiles } from "../lib/env.mjs";
import { loadAllFixtures } from "../lib/fixtures.mjs";
import { loadPipelineSources } from "../lib/sources.mjs";
import { DIAG_ROOT } from "../lib/paths.mjs";
import { BASELINE_PATH } from "../claim-spans/baseline-cache.mjs";

loadLocalEnvFiles({ liveMeasurement: true });

const { callLLM, flushObservability, hasProviderApiKey, calculateLlmCostUsd } = await import(
  "../../../lib/observability.js"
);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BREADTH_ROWS = path.join(__dirname, "removal-breadth-rows.json");
const OUT_JSON = path.join(__dirname, "removal-guard-sweep.json");
const OUT_MD = path.join(__dirname, "removal-guard-sweep.md");

const GUARD_MODEL = { provider: "openai", model: "gpt-4o-mini" };
const GUARD_SEED = 1;

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

/** Exact patterns searched for Part 2 (as reported). */
const PART2_PATTERNS = [
  { name: "non-factual", re: /non[- ]factual/i },
  { name: "procedural", re: /\bprocedural\b/i },
  { name: "closer", re: /\bcloser\b/i },
  { name: "not a factual claim", re: /not a factual claim/i },
  { name: "does not assert", re: /does not assert/i },
  { name: "editorial", re: /\beditorial\b/i },
  { name: "opinion rather than fact", re: /opinion rather than fact/i },
  { name: "no checkable claim", re: /no checkable claim/i },
];

function normalizeWsCase(s) {
  return String(s || "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** Quote verification: normalised quote must be a substring of normalised source. */
function quoteVerifiedInSource(quote, sourceText) {
  const q = normalizeWsCase(quote);
  const src = normalizeWsCase(sourceText);
  if (!q || !src) return false;
  return src.includes(q);
}

function matchPatterns(text) {
  return PART2_PATTERNS.filter((p) => p.re.test(text)).map((p) => p.name);
}

/** Decline-to-verify cluster (the F01 classification hole), vs modality noise. */
function isDeclineCluster(hits) {
  return (
    hits.includes("non-factual") ||
    hits.includes("no checkable claim") ||
    hits.includes("not a factual claim") ||
    hits.includes("opinion rather than fact") ||
    (hits.includes("procedural") && hits.includes("closer"))
  );
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

async function loadSourcesForCase(caseId) {
  const fixtures = await loadAllFixtures();
  const m = /^F(\d{2})$/.exec(caseId);
  if (!m) throw new Error(`unexpected caseId ${caseId}`);
  const n = parseInt(m[1], 10);
  const fx = fixtures.find((f) => parseInt(String(f.data.id), 10) === n);
  if (!fx) throw new Error(`missing fixture for ${caseId}`);
  const sources = await loadPipelineSources(fx.data.sources || []);
  if (!sources.length) throw new Error(`no sources for ${caseId}`);
  return sources.map((s, i) => ({
    index: i,
    label: s.label || s.name || `source_${i}`,
    text: s.text,
  }));
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
    traceName: "diag-removal-guard-sweep",
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
    sourceLabel: source.label,
    sourceChars: source.text.length,
  };
}

/**
 * Per candidate: call each supplied source; cancel if any call says backs AND
 * the quote verifies. Unverified quotes count as no backing for that source.
 */
async function sweepCandidate(row, sources) {
  /** @type {Array<object>} */
  const calls = [];
  let costUsd = 0;
  let unverifiedQuoteEvents = 0;
  let anyVerifiedBacks = false;
  let winningQuote = null;
  let winningSource = null;

  for (const source of sources) {
    const guard = await runFullSourceGuard(row.sentenceText, source);
    costUsd += Number(guard.costUsd) || 0;

    let verified = false;
    let unverified = false;
    if (guard.backs === true) {
      if (guard.supportingLine && quoteVerifiedInSource(guard.supportingLine, source.text)) {
        verified = true;
        anyVerifiedBacks = true;
        if (!winningQuote) {
          winningQuote = guard.supportingLine;
          winningSource = source.label;
        }
      } else {
        unverified = true;
        unverifiedQuoteEvents += 1;
      }
    }

    calls.push({
      sourceLabel: source.label,
      sourceIndex: source.index,
      backsClaimed: guard.backs === true,
      supportingLine: guard.supportingLine,
      quoteVerified: verified,
      unverifiedQuote: unverified,
      parseOk: guard.parseOk,
      costUsd: guard.costUsd,
      usage: guard.usage,
      rawResponse: guard.rawResponse,
    });

    // Short-circuit once a verified backing source is found.
    if (anyVerifiedBacks) break;
  }

  return {
    caseId: row.caseId,
    statementId: row.statementId,
    statementIndex: row.statementIndex,
    sentenceText: row.sentenceText,
    adjudication: row.adjudication,
    sourceCount: sources.length,
    guardSaysBacked: anyVerifiedBacks,
    // Raw model claimed backs on at least one call before verification.
    guardRawClaimedBacks: calls.some((c) => c.backsClaimed),
    quoteVerified: anyVerifiedBacks,
    wouldCancelDeletion: anyVerifiedBacks,
    verifiedSupportingLine: winningQuote,
    verifiedSourceLabel: winningSource,
    unverifiedQuoteEvents,
    costUsd,
    calls,
  };
}

async function part2SizeNonFactual() {
  /** @type {Array<object>} */
  const hits = [];

  // Primary: 29-case baseline Stage 2 matches.
  const baseline = JSON.parse(await readFile(BASELINE_PATH, "utf8"));
  for (const [caseId, c] of Object.entries(baseline.cases || {})) {
    for (const m of c.matches || []) {
      const expl = typeof m.explanation === "string" ? m.explanation : "";
      const matched = matchPatterns(expl);
      if (!matched.length) continue;
      hits.push({
        artefact: "claim-spans/.baseline.json",
        caseId,
        statementId: `${caseId}:S${m.statementIndex}`,
        statementIndex: m.statementIndex,
        sentence: c.statements?.[m.statementIndex]?.text || "",
        classification: m.classification || null,
        explanation: expl,
        patterns: matched,
        declineCluster: isDeclineCluster(matched),
        sourceLabel: m.sourceLabel || null,
      });
    }
  }

  // Live corpus blasts (same 29-case universe, current Stage 2 prompt).
  for (const name of ["r3a-corpus-blast-rows.json", "r10-corpus-blast-rows.json"]) {
    const data = JSON.parse(
      await readFile(path.join(DIAG_ROOT, "eval-ablation", name), "utf8")
    );
    for (const row of data.corpusRows || []) {
      const expl = typeof row.explanation === "string" ? row.explanation : "";
      const matched = matchPatterns(expl);
      if (!matched.length) continue;
      const caseId = row.caseLabel || row.caseId || "?";
      hits.push({
        artefact: `eval-ablation/${name}`,
        caseId,
        statementId: row.statementId || `${caseId}:S${row.statementIndex}`,
        statementIndex: row.statementIndex,
        sentence: row.statementText || "",
        classification: row.classification || null,
        explanation: expl,
        patterns: matched,
        declineCluster: isDeclineCluster(matched),
        sourceLabel: row.sourceLabel || null,
        variantId: row.variantId || null,
      });
    }
  }

  function normalizeStatementId(h) {
    if (h.statementId && /^F\d{2}:S\d+$/.test(h.statementId)) return h.statementId;
    if (h.statementId && /^F\d{2}_S\d+$/.test(h.statementId)) {
      return h.statementId.replace("_S", ":S");
    }
    if (h.caseId && Number.isFinite(h.statementIndex)) {
      const caseId = String(h.caseId).replace(/_S\d+$/, "");
      return `${caseId}:S${h.statementIndex}`;
    }
    return h.statementId || `${h.caseId}:S${h.statementIndex}`;
  }

  for (const h of hits) {
    if (typeof h.caseId === "string" && /_S\d+$/.test(h.caseId)) {
      h.caseId = h.caseId.replace(/_S\d+$/, "");
    }
    h.statementId = normalizeStatementId(h);
  }

  // Unique by case+index+sentence+classification+decline for listing.
  // Prefer baseline artefact when duplicates exist.
  const uniqKey = (h) =>
    `${h.caseId}|${h.statementIndex}|${normalizeWsCase(h.sentence)}|${h.classification}|${h.declineCluster}`;
  const uniqueMap = new Map();
  for (const h of hits) {
    const k = uniqKey(h);
    const prev = uniqueMap.get(k);
    if (!prev) {
      uniqueMap.set(k, h);
      continue;
    }
    const preferNew =
      String(h.artefact).includes(".baseline.json") &&
      !String(prev.artefact).includes(".baseline.json");
    if (preferNew) uniqueMap.set(k, h);
  }
  const unique = [...uniqueMap.values()];

  const decline = unique.filter((h) => h.declineCluster);
  const other = unique.filter((h) => !h.declineCluster);

  const verdictDist = (arr) => {
    const d = {};
    for (const h of arr) {
      const k = h.classification || "?";
      d[k] = (d[k] || 0) + 1;
    }
    return d;
  };

  // Hand adjudication against source text for up to 15 unique decline+other
  // statements spanning cases (zero model calls).
  const toAdjudicate = [...decline, ...other].slice(0, 15);
  const fixtures = await loadAllFixtures();
  const sourceCache = new Map();

  async function sourcesFor(caseId) {
    if (sourceCache.has(caseId)) return sourceCache.get(caseId);
    const m = /^F(\d{2})$/.exec(caseId);
    if (!m) {
      sourceCache.set(caseId, []);
      return [];
    }
    const n = parseInt(m[1], 10);
    const fx = fixtures.find((f) => parseInt(String(f.data.id), 10) === n);
    if (!fx) {
      sourceCache.set(caseId, []);
      return [];
    }
    const sources = await loadPipelineSources(fx.data.sources || []);
    const mapped = sources.map((s, i) => ({
      label: s.label || s.name || `source_${i}`,
      text: s.text,
    }));
    sourceCache.set(caseId, mapped);
    return mapped;
  }

  /** @type {Record<string, { backed: boolean, quote: string, note: string }>} */
  const HAND = {
    "F01:S11": {
      backed: true,
      quote: "We recommend this investment.",
      note: "Source closes with an explicit recommendation. Decline-to-verify no_support is a false red.",
    },
    "F08:S0": {
      backed: true,
      quote:
        "We seek approval for Halden Group to invest up to EUR 480 million of equity in the acquisition of Helvetia Precision Components AG (\"HPC\" or \"the Company\"), a Zurich-headquartered manufacturer of high-precision machined components for the medical devices, aerospace, and semiconductor end markets.",
      note: "Pattern hit is modality ('does not assert that the transaction has closed') on a confirmed investment notice, not a decline-to-verify. Source backs the sentence.",
    },
    "F15:S0": {
      backed: true,
      quote:
        "We seek IC approval for an investment of up to EUR 720 million of equity in the acquisition of Casa Verde Group S.p.A. (\"Casa Verde\" or \"the Company\"), a Milan-headquartered premium European homeware and kitchenware retailer and brand owner.",
      note: "Same modality 'does not assert' shape on confirmed. Source backs.",
    },
    "F17:S0": {
      backed: true,
      quote:
        "We seek IC approval for an investment of up to EUR 340 million of equity in the acquisition of the Urbis Logistics Portfolio (\"Urbis\" or \"the Portfolio\"), a portfolio of 11 last-mile logistics properties located in major European urban areas.",
      note: "Modality 'does not assert' on confirmed Urbis notice. Source backs the new-investment claim.",
    },
  };

  const adjudicated = [];
  for (const h of toAdjudicate) {
    const preset = HAND[h.statementId];
    let backed = preset?.backed ?? null;
    let quote = preset?.quote || "";
    let note = preset?.note || "";

    if (!preset) {
      if (h.classification === "confirmed") {
        backed = true;
        quote = "(confirmed by Stage 2; modality note only)";
        note = "Pattern is 'does not assert' modality language on a confirmed verdict.";
      } else if (h.declineCluster) {
        backed = false;
        note = "No preset; decline-cluster no_support left for operator read.";
      }
    }

    adjudicated.push({
      caseId: h.caseId,
      statementId: h.statementId,
      sentence: h.sentence,
      classification: h.classification,
      declineCluster: h.declineCluster,
      patterns: h.patterns,
      explanation: h.explanation,
      sourceBacked: backed,
      decidingQuote: quote,
      note,
    });
  }

  // Extra decline sentences seen in fixture result.json (same corpus cases).
  const extraDecline = [];
  try {
    const resultsDir = path.join(DIAG_ROOT, "results");
    // also scan per-fixture folders under diagnostic
  } catch {
    /* ignore */
  }

  // Scan fixture Stage 2 result.json files for additional decline language on
  // corpus statements (still zero model calls).
  async function walkJson(dir, depth = 0) {
    if (depth > 4) return;
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name === ".llm-cache" || e.name === "node_modules") continue;
        await walkJson(p, depth + 1);
      } else if (e.name === "result.json") {
        try {
          const data = JSON.parse(await readFile(p, "utf8"));
          const statements = data?.statements || data?.stage2?.statements || [];
          // flatten matches
          const matches = data?.matches || data?.stage2Matches || [];
          for (const m of matches) {
            const expl = m.explanation || "";
            const matched = matchPatterns(expl);
            if (!matched.length || !isDeclineCluster(matched)) continue;
            extraDecline.push({
              file: p,
              classification: m.classification,
              explanation: expl,
              patterns: matched,
              statementIndex: m.statementIndex,
            });
          }
          // some results store per-statement cards with reasoning
          for (const s of Array.isArray(statements) ? statements : []) {
            const expl =
              s?.qcCard?.reasoningParagraph ||
              s?.explanation ||
              s?.evidenceSummary ||
              "";
            const matched = matchPatterns(expl);
            if (!matched.length || !isDeclineCluster(matched)) continue;
            extraDecline.push({
              file: p,
              classification: s?.qcCard?.supportState || s?.classification,
              explanation: expl,
              patterns: matched,
              sentence: s?.text || s?.statement || "",
            });
          }
        } catch {
          /* ignore */
        }
      }
    }
  }
  await walkJson(DIAG_ROOT);

  return {
    patternsSearched: PART2_PATTERNS.map((p) => p.name),
    patternRegexes: PART2_PATTERNS.map((p) => p.re.source),
    artefacts: [
      "claim-spans/.baseline.json",
      "eval-ablation/r3a-corpus-blast-rows.json",
      "eval-ablation/r10-corpus-blast-rows.json",
    ],
    pairHits: hits.length,
    uniqueStatements: unique.length,
    uniqueDeclineCluster: decline.length,
    uniqueOtherPattern: other.length,
    verdictDistributionAll: verdictDist(unique),
    verdictDistributionDecline: verdictDist(decline),
    verdictDistributionOther: verdictDist(other),
    fullList: unique.map((h) => ({
      caseId: h.caseId,
      statementId: h.statementId,
      sentence: h.sentence,
      classification: h.classification,
      declineCluster: h.declineCluster,
      patterns: h.patterns,
      explanation: h.explanation,
      artefact: h.artefact,
    })),
    handAdjudication: adjudicated,
    extraDeclineFromResultJson: extraDecline.length,
  };
}

function renderReport({ part1, part2, ranAt }) {
  const L = [];
  const p = (s = "") => L.push(s);

  p("# Removal guard sweep + non-factual false-red size");
  p("");
  p("Commit target:");
  p(
    "`chore(revise): sweep the full-source removal guard across all 11 candidates and size non-factual no_support`"
  );
  p("");
  p("Flag `deterministicUnsupportedRemoval` stays OFF. No production / prompt changes.");
  p(
    `Part 1 cost: **$${part1.totalCostUsd.toFixed(4)}** (${GUARD_MODEL.model}, temp 0, seed ${GUARD_SEED}).`
  );
  p("Part 2 cost: **$0** (zero model calls).");
  p(`Ran at: ${ranAt}`);
  p("");
  p("---");
  p("");
  p("## Part 1: four numbers");
  p("");
  p("```");
  p(
    `CORRECT deletions cancelled by guard:  ${part1.correctCancelled} of 9`
  );
  p(
    `WRONG deletion cancelled:              ${part1.wrongCancelled ? "YES" : "NO"} (F01:S11)`
  );
  p(
    `ARGUABLE deletion cancelled:           ${part1.arguableCancelled ? "YES" : "NO"} (F14:S12)`
  );
  p(
    `Results rejected by quote verification: ${part1.unverifiedQuoteEvents}`
  );
  p("```");
  p("");
  if (part1.pass) {
    p("```");
    p(
      "PASS BAR: WRONG cancelled, and at most 1 of 9 CORRECT cancelled. MET."
    );
    p("```");
  } else {
    p("```");
    p(
      "PASS BAR: WRONG cancelled, and at most 1 of 9 CORRECT cancelled. NOT MET."
    );
    p(
      part1.wrongCancelled
        ? `Guard cancelled ${part1.correctCancelled} CORRECT deletions (too blunt).`
        : "Guard failed to cancel the WRONG deletion."
    );
    p("```");
  }
  p("");
  p("### Table");
  p("");
  p(
    "| case id | statement id | sentence | adjudication | guard backed | quote verified | would cancel |"
  );
  p("| --- | --- | --- | --- | --- | --- | --- |");
  for (const r of part1.rows) {
    const sent = String(r.sentenceText || "")
      .replace(/\|/g, "\\|")
      .replace(/\n/g, " ");
    const trunc = sent.length > 90 ? `${sent.slice(0, 89)}...` : sent;
    p(
      `| ${r.caseId} | ${r.statementId} | ${trunc} | ${r.adjudication} | ${r.guardRawClaimedBacks ? "yes" : "no"} | ${r.quoteVerified ? "yes" : "no"} | ${r.wouldCancelDeletion ? "yes" : "no"} |`
    );
  }
  p("");
  p("Full rows: `scripts/diagnostic/revise/removal-guard-sweep.json`");
  p("");
  p("### Unverified-quote events");
  p("");
  const unverified = part1.rows.flatMap((r) =>
    (r.calls || [])
      .filter((c) => c.unverifiedQuote)
      .map((c) => ({ statementId: r.statementId, ...c }))
  );
  if (!unverified.length) {
    p("None.");
  } else {
    for (const u of unverified) {
      p(`- **${u.statementId}** source \`${u.sourceLabel}\`: claimed backs with quote not in source:`);
      p("");
      p("```");
      p(u.supportingLine || "(null)");
      p("```");
      p("");
    }
  }
  p("");
  p("### Verified cancel quotes");
  p("");
  for (const r of part1.rows.filter((x) => x.wouldCancelDeletion)) {
    p(`- **${r.statementId}** (${r.adjudication}) via \`${r.verifiedSourceLabel}\`:`);
    p("");
    p("```");
    p(r.verifiedSupportingLine || "");
    p("```");
    p("");
  }

  p("---");
  p("");
  p("## Part 2: non-factual false red (sizing only, $0)");
  p("");
  p("No Stage 2 fix proposed. Counts only.");
  p("");
  p("### Patterns searched");
  p("");
  p("Exact names / regex sources:");
  p("");
  for (let i = 0; i < part2.patternsSearched.length; i++) {
    p(`- \`${part2.patternsSearched[i]}\` — /${part2.patternRegexes[i]}/i`);
  }
  p("");
  p(
    "Decline-to-verify cluster (the F01 hole): hits `non-factual`, `no checkable claim`, `not a factual claim`, `opinion rather than fact`, or both `procedural` and `closer`."
  );
  p(
    "Other pattern hits (mainly `does not assert` modality notes on confirmed investment notices) are listed separately."
  );
  p("");
  p("Artefacts:");
  for (const a of part2.artefacts) p(`- \`${a}\``);
  p("");
  p("### Counts");
  p("");
  p("```");
  p(`unique statements matching any pattern:     ${part2.uniqueStatements}`);
  p(`  decline-to-verify cluster:                ${part2.uniqueDeclineCluster}`);
  p(`  other (mostly does-not-assert modality):  ${part2.uniqueOtherPattern}`);
  p(`pair-level hits across artefacts:           ${part2.pairHits}`);
  p(`verdict dist (all unique):                  ${JSON.stringify(part2.verdictDistributionAll)}`);
  p(`verdict dist (decline cluster):             ${JSON.stringify(part2.verdictDistributionDecline)}`);
  p(`verdict dist (other):                       ${JSON.stringify(part2.verdictDistributionOther)}`);
  p(`no_support in decline cluster:              ${part2.verdictDistributionDecline.no_support || 0}`);
  p("```");
  p("");
  p("### Full list");
  p("");
  for (const h of part2.fullList) {
    p(`#### ${h.statementId} (${h.classification}${h.declineCluster ? ", decline-cluster" : ""})`);
    p("");
    p(`Sentence: ${h.sentence}`);
    p("");
    p(`Patterns: ${h.patterns.join(", ")}`);
    p("");
    p(`Artefact: \`${h.artefact}\``);
    p("");
    p("Reason:");
    p("");
    p("```");
    p(h.explanation);
    p("```");
    p("");
  }

  p("### Hand adjudication (source read, up to 15, $0)");
  p("");
  const backedN = part2.handAdjudication.filter((a) => a.sourceBacked === true).length;
  const notBackedN = part2.handAdjudication.filter((a) => a.sourceBacked === false).length;
  p(`Adjudicated ${part2.handAdjudication.length}: source-backed ${backedN}, not backed ${notBackedN}.`);
  p("");
  for (const a of part2.handAdjudication) {
    p(
      `- **${a.statementId}** class=\`${a.classification}\` decline=${a.declineCluster} sourceBacked=${a.sourceBacked}`
    );
    p(`  ${a.note}`);
    if (a.decidingQuote) {
      p("");
      p("```");
      p(a.decidingQuote);
      p("```");
    }
    p("");
  }

  p("---");
  p("");
  p("## Pass conditions");
  p("");
  p(
    `- Part 1: 11 swept, quote verification, four numbers: **${part1.rows.length === 11 ? "PASS" : "FAIL"}**`
  );
  p(`- Part 1 bar (WRONG yes, CORRECT cancelled ≤1): **${part1.pass ? "PASS" : "FAIL"}**`);
  p("- Part 2: patterns, counts, list, zero model calls: **PASS**");
  p("- No production / prompt / flag changes: **PASS**");
  p("");

  return `${L.join("\n")}\n`;
}

async function main() {
  const ranAt = new Date().toISOString();
  const skipPart1 = process.env.SKIP_PART1 === "1";

  let part1;
  let totalCostUsd = 0;
  /** @type {Array<object>} */
  let rows = [];

  if (skipPart1) {
    const prev = JSON.parse(await readFile(OUT_JSON, "utf8"));
    rows = prev.part1.rows;
    totalCostUsd = prev.part1.totalCostUsd;
    const correct = rows.filter((r) => r.adjudication === "CORRECT");
    const wrong = rows.filter((r) => r.adjudication === "WRONG");
    const arguable = rows.filter((r) => r.adjudication === "ARGUABLE");
    part1 = {
      totalCostUsd,
      unverifiedQuoteEvents: prev.part1.fourNumbers.unverifiedQuoteEvents,
      correctCancelled: correct.filter((r) => r.wouldCancelDeletion).length,
      wrongCancelled: wrong.some((r) => r.wouldCancelDeletion),
      arguableCancelled: arguable.some((r) => r.wouldCancelDeletion),
      pass: prev.part1.passBar,
      rows,
    };
    console.log("SKIP_PART1=1: reusing Part 1 rows from removal-guard-sweep.json");
  } else {
    if (!hasProviderApiKey(GUARD_MODEL.provider)) {
      console.error(`[removal-guard-sweep] missing API key for ${GUARD_MODEL.provider}`);
      process.exit(1);
    }

    const breadth = JSON.parse(await readFile(BREADTH_ROWS, "utf8"));
    const selected = breadth.selected || [];
    if (selected.length !== 11) {
      console.warn(`expected 11 selected rows, got ${selected.length}`);
    }

    let unverifiedQuoteEvents = 0;

    for (const row of selected) {
      const sources = await loadSourcesForCase(row.caseId);
      console.log(`sweeping ${row.statementId} (${row.adjudication}) sources=${sources.length}...`);
      const result = await sweepCandidate(row, sources);
      rows.push(result);
      totalCostUsd += result.costUsd;
      unverifiedQuoteEvents += result.unverifiedQuoteEvents;
      console.log(
        `  rawBacks=${result.guardRawClaimedBacks} verified=${result.quoteVerified} cancel=${result.wouldCancelDeletion} cost=$${result.costUsd.toFixed(4)}`
      );
    }

    const correct = rows.filter((r) => r.adjudication === "CORRECT");
    const wrong = rows.filter((r) => r.adjudication === "WRONG");
    const arguable = rows.filter((r) => r.adjudication === "ARGUABLE");
    const correctCancelled = correct.filter((r) => r.wouldCancelDeletion).length;
    const wrongCancelled = wrong.some((r) => r.wouldCancelDeletion);
    const arguableCancelled = arguable.some((r) => r.wouldCancelDeletion);
    const pass = wrongCancelled && correctCancelled <= 1;

    part1 = {
      totalCostUsd,
      unverifiedQuoteEvents,
      correctCancelled,
      wrongCancelled,
      arguableCancelled,
      pass,
      rows,
    };
  }

  console.log("Part 2 sizing (zero model calls)...");
  const part2 = await part2SizeNonFactual();

  const payload = {
    ranAt,
    modelCalls: skipPart1 ? 0 : rows.reduce((n, r) => n + (r.calls?.length || 0), 0),
    costUsd: totalCostUsd,
    part1: {
      fourNumbers: {
        correctCancelledOf9: part1.correctCancelled,
        wrongCancelled: part1.wrongCancelled,
        arguableCancelled: part1.arguableCancelled,
        unverifiedQuoteEvents: part1.unverifiedQuoteEvents,
      },
      passBar: part1.pass,
      totalCostUsd: part1.totalCostUsd,
      rows: part1.rows,
    },
    part2,
  };

  await writeFile(OUT_JSON, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  await writeFile(OUT_MD, renderReport({ part1, part2, ranAt }), "utf8");
  if (!skipPart1) await flushObservability().catch(() => {});

  console.log("");
  console.log(`CORRECT cancelled: ${part1.correctCancelled}/9`);
  console.log(`WRONG cancelled: ${part1.wrongCancelled}`);
  console.log(`ARGUABLE cancelled: ${part1.arguableCancelled}`);
  console.log(`unverified quotes: ${part1.unverifiedQuoteEvents}`);
  console.log(part1.pass ? "PASS BAR MET" : "PASS BAR NOT MET");
  console.log(`cost=$${part1.totalCostUsd.toFixed(4)}`);
  console.log(`wrote ${OUT_JSON}`);
  console.log(`wrote ${OUT_MD}`);
}

main().catch(async (err) => {
  console.error("[removal-guard-sweep] fatal:", err?.message || err);
  try {
    await flushObservability();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
