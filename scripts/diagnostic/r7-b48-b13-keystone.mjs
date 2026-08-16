#!/usr/bin/env node
/**
 * B48 / B13 keystone diagnostic — read-only post-processor.
 *
 * Consumes a timestamped scripts/diagnostic/runs/<ts>/ from run-batch.mjs.
 * Does NOT call the pipeline, does NOT feed verdicts.
 *
 * Usage:
 *   node scripts/diagnostic/r7-b48-b13-keystone.mjs --from-run <timestamp-or-path>
 */

import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { RUNS_DIR } from "./lib/paths.mjs";

const STYLE_FORMAT_CODES = new Set([
  "date_format",
  "percentage_notation",
  "number_spelling",
  "currency_format",
  "thousand_separator",
  "oxford_comma",
  "em_dash",
  "smart_quotes",
  "english_variant",
  "first_person_plural",
  "defined_term_capitalisation",
  "sentence_length",
  "structural_integrity",
  "sentence_structure_clarity",
  "active_voice_preference",
  "passive_voice_overuse",
]);

const APPROPRIATENESS_CODES = new Set([
  "marketing_language_excess",
  "hyperbole_vs_qualitative",
  "register_mismatch",
  "register_consistency",
  "voice_consistency",
  "audience_calibration_jargon",
  "jargon_outside_audience_competence",
  "materiality",
  "narrative_coherence",
  "overreach_unsupported_causal",
  "underreach_hedging",
]);

const HIGH_SIGNAL_FEATURES = [
  "monetary_figure",
  "percentage_metric",
  "date_period_claim",
  "named_person_entity_attribution",
  "comparative_superlative",
  "forward_looking",
  "regulated_sensitive",
];

function parseArgs(argv) {
  const opts = { fromRun: null };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--from-run" && argv[i + 1]) {
      opts.fromRun = argv[++i];
      continue;
    }
    throw new Error(`Unknown argument: ${argv[i]}`);
  }
  if (!opts.fromRun) throw new Error("Required: --from-run <timestamp-or-path>");
  return opts;
}

function trunc(s, n = 90) {
  const t = String(s ?? "").replace(/\s+/g, " ").trim();
  if (t.length <= n) return t;
  return `${t.slice(0, n - 1)}…`;
}

function escCell(s) {
  return String(s ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
}

export function extractStatementFeatures(statement) {
  const t = typeof statement === "string" ? statement : "";
  const fired = [];

  if (
    /(?:USD|EUR|GBP|AUD|CAD|\$|€|£)\s*[\d,.]+/i.test(t) ||
    /\b[\d,.]+\s*(?:million|billion|thousand|mm|bn|k)\b/i.test(t)
  ) {
    fired.push("monetary_figure");
  }
  if (/\d+(?:\.\d+)?\s*%/.test(t) || /\bpercent(?:age)?\b/i.test(t)) {
    fired.push("percentage_metric");
  }
  if (
    /\b(?:Q[1-4]\s*20\d{2}|FY\s*20\d{2}|H[12]\s*20\d{2}|20\d{2}|January|February|March|April|May|June|July|August|September|October|November|December|year[- ]on[- ]year|YoY|TTM|as at|as of)\b/i.test(
      t
    )
  ) {
    fired.push("date_period_claim");
  }
  if (
    /\b(?:according to|said|says|stated|quoted|CEO|CFO|CIO|partner|attributed)\b/i.test(t) ||
    /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3}\b/.test(t)
  ) {
    fired.push("named_person_entity_attribution");
  }
  if (
    /\b(?:more than|less than|greater than|highest|lowest|largest|best|worst|leading|versus|\bvs\.?\b|compared with|compared to|outperform|underperform|superlative)\b/i.test(
      t
    )
  ) {
    fired.push("comparative_superlative");
  }
  if (
    /\b(?:expect|expects|expected|will|forecast|target|outlook|intend|intends|plan to|plans to|pipeline|forthcoming|ahead|next year|guidance)\b/i.test(
      t
    )
  ) {
    fired.push("forward_looking");
  }
  if (
    /\b(?:IRR|MOIC|DPI|TVPI|gross(?:\/| )?net|guaranteed|confidential|insider|patient|GDPR|personal data|material non[- ]public|MNPI|regulated|SEC|FCA)\b/i.test(
      t
    )
  ) {
    fired.push("regulated_sensitive");
  }

  return fired;
}

function hasHighSignal(features) {
  return features.some((f) => HIGH_SIGNAL_FEATURES.includes(f));
}

function isQuantitativeGap(statement, note) {
  const blob = `${statement || ""} ${note || ""}`;
  return (
    /(?:USD|EUR|GBP|\$|€|£)\s*[\d,.]+/i.test(blob) ||
    /\d+(?:\.\d+)?\s*%/.test(blob) ||
    /\b[\d,.]+\s*(?:million|billion|mm|bn)\b/i.test(blob)
  );
}

function classifyConcernCode(code, category) {
  const id = String(code || "").trim();
  const cat = String(category || "").trim().toLowerCase();
  if (STYLE_FORMAT_CODES.has(id) || cat === "style_guide" || cat === "style") return "style_format";
  if (APPROPRIATENESS_CODES.has(id) || cat === "editorial") return "editorial_appropriateness";
  return "editorial_appropriateness";
}

/**
 * Accepted B13 materiality prototype. Pure / deterministic / not wired to pipeline.
 * @returns {{ level: "material"|"minor"|"mechanical", features: string[], findingType: string, reasons: string[] }}
 */
export function prototypeMateriality({
  statement,
  findingKind,
  concernCode,
  concernCategory,
  gapNote,
}) {
  const features = extractStatementFeatures(statement);
  const high = hasHighSignal(features);
  const reasons = [];

  let findingType = findingKind;
  if (findingKind === "editorial" || findingKind === "style") {
    findingType = classifyConcernCode(concernCode, concernCategory);
  }

  if (findingType === "compliance") {
    reasons.push("compliance_concern");
    return { level: "material", features, findingType, reasons };
  }
  if (findingType === "evidence_conflict" || findingType === "evidence_no_support") {
    reasons.push("evidence_conflict_or_no_support");
    return { level: "material", features, findingType, reasons };
  }
  if (findingType === "style_format") {
    reasons.push("pure_style_format");
    return { level: "mechanical", features, findingType, reasons };
  }
  if (findingType === "evidence_partial" || findingType === "editorial_appropriateness") {
    if (high) {
      reasons.push("partial_or_appropriateness_plus_high_signal");
      return { level: "material", features, findingType, reasons };
    }
    if (findingType === "evidence_partial" && !isQuantitativeGap(statement, gapNote)) {
      reasons.push("partial_no_high_signal_non_quantitative_gap");
      return { level: "minor", features, findingType, reasons };
    }
    reasons.push("ambiguous_default_material");
    return { level: "material", features, findingType, reasons };
  }

  reasons.push("ambiguous_default_material");
  return { level: "material", features, findingType, reasons };
}

/**
 * First-pass B48 bucket from pair explanation + passage (overridden in report after read).
 */
export function heuristicConflictCategory({ statement, passage, explanation }) {
  const expl = String(explanation || "").toLowerCase();
  const stmt = String(statement || "");
  const pass = String(passage || "");

  const nonMentionCue =
    /\b(does not (mention|address|state|refer|name|cover)|not mentioned|not addressed|does not discuss|silent on|no mention)\b/.test(
      expl
    );
  const contradictCue =
    /\b(contradict|conflicts? with|directly contradicts|instead (of|states)|differs from|not the same|replacement)\b/.test(
      expl
    );

  const stmtNums = stmt.match(/[\d,.]+%?|\$[\d,.]+/g) || [];
  const passNums = pass.match(/[\d,.]+%?|\$[\d,.]+/g) || [];
  const numericClash =
    stmtNums.length > 0 &&
    passNums.length > 0 &&
    stmtNums.some((n) => passNums.every((p) => p.replace(/,/g, "") !== n.replace(/,/g, "")));

  if (nonMentionCue && !contradictCue && !numericClash) return "NON_MENTION";
  if (contradictCue || numericClash) return "TRUE_CONFLICT";
  if (/\b(partial|some but not|confirmed .+ but|gap|absent|omission|does not confirm)\b/.test(expl)) {
    return "PARTIAL_GAP";
  }
  if (nonMentionCue) return "NON_MENTION";
  return "TRUE_CONFLICT";
}

async function loadRunResults(runRoot) {
  const names = await readdir(runRoot, { withFileTypes: true });
  const dirs = names.filter((d) => d.isDirectory()).map((d) => d.name).sort();
  const results = [];
  for (const dir of dirs) {
    const resultPath = path.join(runRoot, dir, "result.json");
    try {
      const raw = await readFile(resultPath, "utf8");
      const data = JSON.parse(raw);
      results.push({ dir, data });
    } catch {
      // skip incomplete fixture dirs
    }
  }
  return results;
}

function collectConflicts(results) {
  const rows = [];
  for (const { data } of results) {
    const fixtureId = data.fixtureId;
    const label = data.label;
    const stage2 = Array.isArray(data.pipelineResult?.stage2) ? data.pipelineResult.stage2 : [];
    for (const entry of stage2) {
      const verdict = entry?.verdictResult?.verdict;
      if (verdict !== "conflicting") continue;
      const statement = entry.statementText || "";
      const matches = Array.isArray(entry.sourceMatches) ? entry.sourceMatches : [];
      const pairSummary = matches
        .map((m) => `src${m.sourceIndex}:${m.classification}`)
        .join("; ");
      const conflictingPairs = matches.filter((m) => m.classification === "conflicting");
      const pairsToShow = conflictingPairs.length > 0 ? conflictingPairs : matches;
      for (const m of pairsToShow) {
        const judged = heuristicConflictCategory({
          statement,
          passage: m.passage,
          explanation: m.explanation,
        });
        rows.push({
          fixture: `${fixtureId}_${label}`,
          statementIndex: entry.statementIndex,
          statement,
          passage: m.passage || "",
          explanation: m.explanation || "",
          currentClassification: "conflicting",
          pairClassification: m.classification,
          pairSummary,
          stage3: `verdict=conflicting hasConflict=${entry.verdictResult?.hasConflict} contrib=[${(entry.verdictResult?.contributingSourceIndices || []).join(",")}]`,
          judged,
        });
      }
    }
  }
  return rows;
}

function collectFindings(results) {
  const findings = [];
  for (const { data } of results) {
    const fixtureId = data.fixtureId;
    const label = data.label;
    const stage2 = Array.isArray(data.pipelineResult?.stage2) ? data.pipelineResult.stage2 : [];
    const cards = Array.isArray(data.pipelineResult?.qcCards) ? data.pipelineResult.qcCards : [];
    for (let i = 0; i < stage2.length; i++) {
      const entry = stage2[i];
      const card = cards[i] || {};
      const statement = entry.statementText || card.statement || "";
      const verdict = entry?.verdictResult?.verdict;
      const gapNote = entry?.commentaryResult?.commentary || "";

      if (verdict === "conflicting") {
        findings.push({
          fixture: `${fixtureId}_${label}`,
          statementIndex: entry.statementIndex,
          statement,
          findingKind: "evidence_conflict",
          concernCode: "",
          concernCategory: "",
          gapNote,
          ...prototypeMateriality({
            statement,
            findingKind: "evidence_conflict",
            gapNote,
          }),
        });
      } else if (verdict === "not_supported") {
        findings.push({
          fixture: `${fixtureId}_${label}`,
          statementIndex: entry.statementIndex,
          statement,
          findingKind: "evidence_no_support",
          concernCode: "",
          concernCategory: "",
          gapNote,
          ...prototypeMateriality({
            statement,
            findingKind: "evidence_no_support",
            gapNote,
          }),
        });
      } else if (verdict === "partially_confirmed") {
        findings.push({
          fixture: `${fixtureId}_${label}`,
          statementIndex: entry.statementIndex,
          statement,
          findingKind: "evidence_partial",
          concernCode: "",
          concernCategory: "",
          gapNote,
          ...prototypeMateriality({
            statement,
            findingKind: "evidence_partial",
            gapNote,
          }),
        });
      }

      const editorialConcerns = Array.isArray(card.editorialConcerns) ? card.editorialConcerns : [];
      for (const c of editorialConcerns) {
        findings.push({
          fixture: `${fixtureId}_${label}`,
          statementIndex: entry.statementIndex,
          statement,
          findingKind: "editorial",
          concernCode: c.concernCode || "",
          concernCategory: c.category || "",
          gapNote: c.note || "",
          ...prototypeMateriality({
            statement,
            findingKind: "editorial",
            concernCode: c.concernCode,
            concernCategory: c.category,
            gapNote: c.note,
          }),
        });
      }

      const complianceConcerns = Array.isArray(card.complianceConcerns)
        ? card.complianceConcerns
        : [];
      for (const c of complianceConcerns) {
        findings.push({
          fixture: `${fixtureId}_${label}`,
          statementIndex: entry.statementIndex,
          statement,
          findingKind: "compliance",
          concernCode: c.concernCode || "",
          concernCategory: c.category || "",
          gapNote: c.note || "",
          ...prototypeMateriality({
            statement,
            findingKind: "compliance",
            concernCode: c.concernCode,
            concernCategory: c.category,
            gapNote: c.note,
          }),
        });
      }
    }
  }
  return findings;
}

function pickSpotCheck(findings) {
  const out = [];
  const seen = new Set();
  const take = (f) => {
    const key = `${f.fixture}:${f.statementIndex}:${f.findingType}:${f.concernCode}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(f);
  };

  for (const f of findings) {
    if (f.findingType === "evidence_partial") take(f);
  }
  for (const f of findings) {
    if (f.features.includes("forward_looking")) take(f);
  }
  for (const level of ["material", "minor", "mechanical"]) {
    let n = 0;
    for (const f of findings) {
      if (f.level === level) {
        take(f);
        n += 1;
        if (n >= 8) break;
      }
    }
  }
  return out.slice(0, 40);
}

function renderReport({ runRoot, results, conflicts, findings }) {
  const mix = { TRUE_CONFLICT: 0, NON_MENTION: 0, PARTIAL_GAP: 0 };
  for (const r of conflicts) mix[r.judged] = (mix[r.judged] || 0) + 1;
  const nonMentionRate =
    conflicts.length === 0 ? "n/a" : `${((mix.NON_MENTION / conflicts.length) * 100).toFixed(1)}% (${mix.NON_MENTION}/${conflicts.length})`;

  const dist = { material: 0, minor: 0, mechanical: 0 };
  for (const f of findings) dist[f.level] = (dist[f.level] || 0) + 1;

  const lines = [];
  lines.push(`# B48 / B13 keystone diagnostic`);
  lines.push("");
  lines.push(`Run: \`${runRoot}\``);
  lines.push(`Fixtures with result.json: ${results.length}`);
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push("");
  lines.push(`Heuristic judged categories are a first pass from pair explanation/passage; the session report may override after close read.`);
  lines.push("");
  lines.push(`## A — B48 conflict-vs-partial`);
  lines.push("");
  lines.push(`Stage-3 conflicting statements (rows = contributing conflicting pairs): **${conflicts.length}**`);
  lines.push("");
  lines.push(`| Fixture | Stmt | Statement (trunc) | Source passage (trunc) | Current | Judged | Stage 2 pairs | Stage 3 |`);
  lines.push(`|---|---|---|---|---|---|---|---|`);
  for (const r of conflicts) {
    lines.push(
      `| ${escCell(r.fixture)} | ${r.statementIndex} | ${escCell(trunc(r.statement, 80))} | ${escCell(trunc(r.passage, 80))} | ${r.currentClassification} | ${r.judged} | ${escCell(r.pairSummary)} | ${escCell(trunc(r.stage3, 80))} |`
    );
  }
  if (conflicts.length === 0) lines.push(`| — | — | none | — | — | — | — | — |`);
  lines.push("");
  lines.push(`Heuristic mix: TRUE_CONFLICT=${mix.TRUE_CONFLICT} NON_MENTION=${mix.NON_MENTION} PARTIAL_GAP=${mix.PARTIAL_GAP}`);
  lines.push(`NON_MENTION mislabel rate (heuristic): ${nonMentionRate}`);
  lines.push("");
  lines.push(`## B — B13 materiality prototype`);
  lines.push("");
  lines.push(`Findings scored: **${findings.length}**`);
  lines.push(`Distribution: material=${dist.material} minor=${dist.minor} mechanical=${dist.mechanical}`);
  lines.push("");
  lines.push(`### Spot-check`);
  lines.push("");
  lines.push(`| Fixture | Stmt | Statement (trunc) | Finding type | Level | Features |`);
  lines.push(`|---|---|---|---|---|---|`);
  for (const f of pickSpotCheck(findings)) {
    const ftype = f.concernCode ? `${f.findingType}:${f.concernCode}` : f.findingType;
    lines.push(
      `| ${escCell(f.fixture)} | ${f.statementIndex} | ${escCell(trunc(f.statement, 70))} | ${escCell(ftype)} | ${f.level} | ${escCell((f.features || []).join(", ") || "—")} |`
    );
  }
  lines.push("");
  return lines.join("\n");
}

async function main() {
  const opts = parseArgs(process.argv);
  const runRoot = path.isAbsolute(opts.fromRun)
    ? opts.fromRun
    : path.join(RUNS_DIR, opts.fromRun);

  const results = await loadRunResults(runRoot);
  if (results.length === 0) {
    console.error(`[keystone] no result.json files under ${runRoot}`);
    process.exit(1);
  }

  const conflicts = collectConflicts(results);
  const findings = collectFindings(results);
  const report = renderReport({ runRoot, results, conflicts, findings });

  const outMd = path.join(runRoot, "B48_B13_KEYSTONE.md");
  const outJson = path.join(runRoot, "B48_B13_KEYSTONE.json");
  await writeFile(outMd, `${report}\n`, "utf8");
  await writeFile(
    outJson,
    `${JSON.stringify({ conflicts, findings, fixtureCount: results.length }, null, 2)}\n`,
    "utf8"
  );

  console.log(report);
  console.log(`\nWrote ${outMd}`);
  console.log(`Wrote ${outJson}`);
}

const isDirect = process.argv[1] && path.resolve(process.argv[1]).endsWith("r7-b48-b13-keystone.mjs");
if (isDirect) {
  main().catch((err) => {
    console.error("[keystone] fatal:", err?.message || err);
    process.exit(1);
  });
}
