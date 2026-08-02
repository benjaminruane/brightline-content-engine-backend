#!/usr/bin/env node
/**
 * R7 build A — same-run A/B: primaryExcerpt with widened ON vs OFF.
 * Single-pick matchAllSources runs ONCE; both conditions reuse those matches.
 * Does not write to docs/ or modify pipeline files.
 */

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import { loadLocalEnvFiles } from "./lib/env.mjs";

loadLocalEnvFiles();

import { loadPipelineSources } from "./lib/sources.mjs";
import { FIXTURES_DIR, REPO_ROOT } from "./lib/paths.mjs";

const FIXTURES = [
  { id: "22", label: "alp_multisource" },
  { id: "23", label: "crf_multisource" },
];

function peText(excerptResultOrCard) {
  if (!excerptResultOrCard) return "";
  // assembleCard returns primaryExcerpt as {passage, sourceLabel} or primaryExcerptText
  if (typeof excerptResultOrCard.primaryExcerptText === "string") {
    return excerptResultOrCard.primaryExcerptText;
  }
  const pe = excerptResultOrCard.primaryExcerpt;
  if (pe && typeof pe === "object" && typeof pe.passage === "string") return pe.passage;
  if (typeof pe === "string") return pe;
  if (excerptResultOrCard.passage && typeof excerptResultOrCard.passage === "string") {
    return excerptResultOrCard.passage;
  }
  return "";
}

async function loadFixture(id) {
  const names = await readdir(FIXTURES_DIR);
  const hit = names.find((n) => n.startsWith(`${id}_`) && n.endsWith(".json"));
  if (!hit) throw new Error(`fixture ${id} not found`);
  return JSON.parse(await readFile(path.join(FIXTURES_DIR, hit), "utf8"));
}

async function main() {
  const {
    createTraceId,
    flushObservability,
    hasProviderApiKey,
  } = await import("../../lib/observability.js");
  const { STAGE_MODELS } = await import("../../lib/qc/model-config.mjs");
  const { extractStatements } = await import("../../lib/qc/pipeline-v4/stage1-extract-statements.mjs");
  const { matchAllSources } = await import("../../lib/qc/pipeline-v4/stage2-match-sources.mjs");
  const {
    pairNeedsWidenedPass,
    matchMultipassagePair,
    buildSupportSpans,
  } = await import("../../lib/qc/pipeline-v4/stage2-match-multipassage.mjs");
  const { aggregateVerdict } = await import("../../lib/qc/pipeline-v4/stage3-aggregate-verdict.mjs");
  const { selectExcerpts } = await import("../../lib/qc/pipeline-v4/stage4-select-excerpts.mjs");
  const { assembleCard } = await import("../../lib/qc/pipeline-v3/stage7-assemble-card.mjs");

  const stageModel = STAGE_MODELS["stage2-matching"];
  if (!hasProviderApiKey(stageModel.provider)) {
    console.error("missing OpenAI key");
    process.exit(1);
  }

  const traceId = createTraceId();
  let totalFail = 0;
  const report = [];

  try {
    for (const meta of FIXTURES) {
      const fixture = await loadFixture(meta.id);
      const pipelineSources = await loadPipelineSources(fixture.sources || []);
      const safeSources = pipelineSources.map((s, i) => ({
        label: s.label,
        text: s.text,
        index: i,
      }));

      const stage1Result = await extractStatements({
        draftText: fixture.draft || "",
        traceId,
      });
      const statements = Array.isArray(stage1Result?.statements) ? stage1Result.statements : [];

      // ONE single-pick pass — shared by both conditions.
      const { matches: stage2PairMatches } = await matchAllSources({
        statements,
        sources: safeSources,
        traceId,
      });

      const matchesByStatementIndex = new Map();
      for (const m of stage2PairMatches) {
        const key = m.statementIndex;
        if (!matchesByStatementIndex.has(key)) matchesByStatementIndex.set(key, []);
        matchesByStatementIndex.get(key).push(m);
      }

      // Widened pass ACTIVE branch: run multipassage; still do NOT feed into selectExcerpts.
      const widenedTasks = [];
      for (const m of stage2PairMatches) {
        if (!pairNeedsWidenedPass(m?.classification)) continue;
        const statementIndex = Number(m.statementIndex);
        const sourceIndex = Number(m.sourceIndex);
        let statementText = "";
        for (let ord = 0; ord < statements.length; ord++) {
          const idx = Number.isFinite(statements[ord]?.index) ? Number(statements[ord].index) : ord;
          if (idx === statementIndex) {
            statementText = typeof statements[ord]?.text === "string" ? statements[ord].text : "";
            break;
          }
        }
        const src = safeSources[sourceIndex];
        widenedTasks.push(
          matchMultipassagePair({
            statementText,
            sourceText: typeof src?.text === "string" ? src.text : "",
            statementIndex,
            sourceIndex,
            sourceLabel: m.sourceLabel || src?.label || `Source ${sourceIndex + 1}`,
            traceId,
          }).then((passages) =>
            (Array.isArray(passages) ? passages : []).map((p) => ({
              ...p,
              statementIndex,
              sourceIndex,
            }))
          )
        );
      }
      const widenedPassages = (await Promise.all(widenedTasks)).flat();

      console.log(`\n======== FIXTURE ${meta.id} ${meta.label} (${statements.length} stmts) ========`);
      console.log(
        "| # | statement (trunc) | primaryExcerpt WIDENED-OFF | primaryExcerpt WIDENED-ON | identical? |"
      );
      console.log("|---|-------------------|---------------------------|--------------------------|------------|");

      for (let ord = 0; ord < statements.length; ord++) {
        const stmtMeta = statements[ord];
        const statementIndex = Number.isFinite(stmtMeta?.index) ? Number(stmtMeta.index) : ord;
        const statementText = typeof stmtMeta?.text === "string" ? stmtMeta.text : "";
        const rowMatches = (matchesByStatementIndex.get(statementIndex) || [])
          .slice()
          .sort((a, b) => a.sourceIndex - b.sourceIndex);

        // SAME single-pick sourceMatches for both conditions.
        const sourceMatches = rowMatches.map((m) => ({
          sourceIndex: m.sourceIndex,
          sourceLabel: m.sourceLabel,
          classification: m.classification,
          passage: m.passage,
          explanation: m.explanation,
        }));

        const agg = aggregateVerdict({ statementMatches: sourceMatches });

        // DISABLED: selectExcerpts from single-pick only; no supportSpans.
        const excerptOff = selectExcerpts({
          statementMatches: sourceMatches,
          verdict: agg.verdict,
          hasConflict: agg.hasConflict,
        });
        const confirmingMatches = sourceMatches.filter((m) => m.classification === "confirmed");
        const conflictingMatches = sourceMatches.filter((m) => m.classification === "conflicting");
        const partialMatches = sourceMatches.filter(
          (m) => m.classification === "partially_confirmed"
        );
        const baseEntry = {
          statementText,
          startChar: Number.isFinite(stmtMeta?.charStart) ? stmtMeta.charStart : 0,
          endChar: Number.isFinite(stmtMeta?.charEnd) ? stmtMeta.charEnd : 0,
          sourceMatches,
          verdictResult: {
            verdict: agg.verdict,
            hasConflict: agg.hasConflict,
            contributingSourceIndices: agg.contributingSourceIndices,
            confirmingMatches,
            conflictingMatches,
            partialMatches,
          },
          excerptResult: excerptOff,
          commentaryResult: { commentary: "" },
          editorialResult: null,
        };
        const cardOff = await assembleCard(
          { ...baseEntry, supportSpans: [] },
          ord,
          { pipelineRoute: "v4", traceId }
        );

        // ACTIVE: same sourceMatches → same selectExcerpts input; supportSpans attached only.
        const excerptOn = selectExcerpts({
          statementMatches: sourceMatches,
          verdict: agg.verdict,
          hasConflict: agg.hasConflict,
        });
        const rawWidened = widenedPassages.filter(
          (p) => Number(p.statementIndex) === statementIndex
        );
        const supportSpans = buildSupportSpans(rawWidened, { statementIndex });
        const cardOn = await assembleCard(
          {
            ...baseEntry,
            excerptResult: excerptOn,
            supportSpans,
          },
          ord,
          { pipelineRoute: "v4", traceId }
        );

        const offStr = peText(cardOff);
        const onStr = peText(cardOn);
        const identical = offStr === onStr;
        if (!identical) totalFail += 1;

        const trunc = (s) => {
          const t = String(s || "").replace(/\n/g, " ").replace(/\|/g, "/");
          return t.length > 55 ? `${t.slice(0, 55)}…` : t;
        };
        console.log(
          `| ${ord} | ${trunc(statementText)} | ${trunc(offStr) || "(empty)"} | ${trunc(onStr) || "(empty)"} | ${identical ? "YES" : "NO"} |`
        );

        report.push({
          fixture: meta.label,
          index: ord,
          statement: statementText,
          identical,
          primaryExcerptOff: offStr,
          primaryExcerptOn: onStr,
          supportSpansCount: supportSpans.length,
        });

        if (!identical) {
          console.log("DIFF DETAIL statement:", statementText);
          console.log("  OFF:", JSON.stringify(offStr));
          console.log("  ON: ", JSON.stringify(onStr));
        }
      }
    }
  } finally {
    await flushObservability();
  }

  console.log("\n======== VERDICT ========");
  if (totalFail === 0) {
    console.log(
      `PASS — primaryExcerpt byte-identical widened-on vs widened-off for all ${report.length} statements (same single-pick sourceMatches).`
    );
  } else {
    console.log(`FAIL — ${totalFail} statement(s) differed. STOP — do not commit.`);
    for (const r of report.filter((x) => !x.identical)) {
      console.log(JSON.stringify(r, null, 2));
    }
    process.exit(2);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
