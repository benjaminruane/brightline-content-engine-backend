#!/usr/bin/env node
/**
 * Static gate audit: how many corpus statements would deterministic unsupported
 * removal select, given existing Review artefacts (.baseline.json). Zero model calls.
 *
 * Usage: node scripts/diagnostic/revise/removal-breadth-audit.mjs
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadAllFixtures } from "../lib/fixtures.mjs";
import { loadPipelineSources } from "../lib/sources.mjs";
import { DIAG_ROOT } from "../lib/paths.mjs";
import { BASELINE_PATH } from "../claim-spans/baseline-cache.mjs";
import { gatherConcerns } from "../../../lib/build-revision-prompt.mjs";
import { aggregateVerdict } from "../../../lib/qc/pipeline-v4/stage3-aggregate-verdict.mjs";
import {
  applyDeterministicUnsupportedRemoval,
  findStatementTextInDraft,
  matchIsWholeSentence,
} from "../../../lib/pr9-deterministic-unsupported-removal.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = __dirname;
const NORDHOLT_DIR = path.join(process.env.HOME || "", "Downloads");
const SUPERSESSION_DIR = path.join(DIAG_ROOT, "supersession");
const ACCIDENT_DIR = path.join(DIAG_ROOT, "claim-spans/evaluative-accident");

const AGG_TO_SUPPORT = {
  confirmed: "supported",
  partially_confirmed: "partial",
  conflicting: "conflicting",
  not_supported: "not_supported",
};

const AGG_TO_DISPLAY = {
  confirmed: "supported_full",
  partially_confirmed: "supported_partial",
  conflicting: "conflict",
  not_supported: "not_supported",
};

async function loadNordholt(kind) {
  const draftName = kind === "dirty" ? "draft_hold_update_DIRTY.txt" : "draft_hold_update_clean.txt";
  const draft = await readFile(path.join(NORDHOLT_DIR, draftName), "utf8");
  const files = [
    ["source_1_ic_memo.txt", "IC memo"],
    ["source_2_press_release.txt", "press release"],
    ["source_3_fact_sheet.txt", "fact sheet"],
    ["source_4_lp_update.txt", "LP update"],
  ];
  const sources = [];
  for (const [name, label] of files) {
    const text = await readFile(path.join(NORDHOLT_DIR, name), "utf8");
    sources.push({ text, label });
  }
  return { draft, sources };
}

async function loadSupersessionFixture() {
  const draft = await readFile(path.join(SUPERSESSION_DIR, "draft_supersession.txt"), "utf8");
  const files = [
    "source_A_annual_report_2019.txt",
    "source_B_fy2024_results.txt",
    "source_C_fund_update_2026.txt",
  ];
  const sources = [];
  for (const name of files) {
    const text = await readFile(path.join(SUPERSESSION_DIR, name), "utf8");
    sources.push({ label: name.replace(/\.txt$/, ""), text });
  }
  return { draft, sources };
}

async function loadAccidentFixtures() {
  const source = await readFile(path.join(ACCIDENT_DIR, "source_ic_memo.txt"), "utf8");
  const sources = [{ text: source, label: "ic_memo" }];
  const out = [];
  for (const id of ["E1", "E2", "E3"]) {
    const draft = await readFile(path.join(ACCIDENT_DIR, `draft_${id.toLowerCase()}.txt`), "utf8");
    out.push({ label: id, draft, sources });
  }
  return out;
}

async function loadCorpusDrafts() {
  /** @type {Map<string, { draft: string, sources: Array<{ text: string, label: string }> }>} */
  const map = new Map();
  for (const kind of ["clean", "dirty"]) {
    const label = kind === "dirty" ? "nordholt-dirty" : "nordholt-clean";
    try {
      map.set(label, await loadNordholt(kind));
    } catch (err) {
      console.warn(`skip ${label}: ${err?.message || err}`);
    }
  }
  try {
    map.set("supersession", await loadSupersessionFixture());
  } catch (err) {
    console.warn(`skip supersession: ${err?.message || err}`);
  }
  try {
    for (const row of await loadAccidentFixtures()) {
      map.set(row.label, { draft: row.draft, sources: row.sources });
    }
  } catch (err) {
    console.warn(`skip E1-E3: ${err?.message || err}`);
  }

  const fixtures = await loadAllFixtures();
  for (const fx of fixtures) {
    const n = parseInt(String(fx.data.id), 10);
    if (!Number.isFinite(n) || n < 1 || n > 23) continue;
    const label = `F${String(n).padStart(2, "0")}`;
    const draft = typeof fx.data.draft === "string" ? fx.data.draft : "";
    if (!draft.trim() || draft.trim() === "PLACEHOLDER") continue;
    try {
      const sources = await loadPipelineSources(fx.data.sources || []);
      if (!sources.length) continue;
      map.set(label, {
        draft,
        sources: sources.map((s) => ({
          text: s.text,
          label: s.label || s.name || "source",
        })),
      });
    } catch (err) {
      console.warn(`skip ${label}: ${err?.message || err}`);
    }
  }
  return map;
}

function matchesForStatement(allMatches, statementIndex) {
  return (Array.isArray(allMatches) ? allMatches : [])
    .filter((m) => Number(m.statementIndex) === Number(statementIndex))
    .slice()
    .sort((a, b) => Number(a.sourceIndex) - Number(b.sourceIndex));
}

function hasConfirmedPreserve(concern) {
  const claims = Array.isArray(concern?.claims) ? concern.claims : [];
  return claims.some((c) => c && c.role === "confirmed_preserve");
}

function trunc(s, n = 160) {
  const t = String(s || "").replace(/\s+/g, " ").trim();
  return t.length <= n ? t : `${t.slice(0, n - 1)}...`;
}

async function main() {
  const origDebug = console.debug;
  console.debug = (...args) => {
    if (String(args[0] || "").startsWith("[stage3]")) return;
    origDebug.apply(console, args);
  };

  const baseline = JSON.parse(await readFile(BASELINE_PATH, "utf8"));
  const caseMap = baseline?.cases && typeof baseline.cases === "object" ? baseline.cases : {};
  const caseIds = Object.keys(caseMap).sort((a, b) => a.localeCompare(b));
  if (caseIds.length !== 29) {
    console.warn(`expected 29 baseline cases, got ${caseIds.length}`);
  }

  const drafts = await loadCorpusDrafts();
  const funnel = {
    totalStatements: 0,
    notSupported: 0,
    gatherUnsupported: 0,
    wholeSentence: 0,
    blockedConfirmedPreserve: 0,
    emptyDraft: 0,
    selectedRemoved: 0,
    skippedNoMatch: 0,
    skippedNotWhole: 0,
    skippedOther: 0,
  };

  /** @type {Array<object>} */
  const selectedRows = [];
  /** @type {Array<object>} */
  const funnelRows = [];

  for (const caseId of caseIds) {
    const cached = caseMap[caseId];
    const corpus = drafts.get(caseId);
    if (!cached || !Array.isArray(cached.statements) || !Array.isArray(cached.matches)) {
      console.warn(`missing baseline case ${caseId}`);
      continue;
    }
    if (!corpus) {
      console.warn(`missing draft/sources for ${caseId}`);
      continue;
    }

    const { draft, sources } = corpus;
    const sourceCount = sources.length;
    const statements = cached.statements;
    funnel.totalStatements += statements.length;

    // Build Review-shaped rows for gatherConcerns from aggregated matches.
    const reviewStatements = statements.map((stmt, i) => {
      const matches = matchesForStatement(cached.matches, i);
      const agg = aggregateVerdict({ statementMatches: matches });
      const supportState = AGG_TO_SUPPORT[agg.verdict] || "not_supported";
      const displayVerdict = AGG_TO_DISPLAY[agg.verdict] || "not_supported";
      const reasonParts = matches
        .map((m) => {
          const cls = m.classification || "?";
          const expl = typeof m.explanation === "string" ? m.explanation.trim() : "";
          return expl ? `[${cls}] ${expl}` : `[${cls}]`;
        })
        .filter(Boolean);
      return {
        index: typeof stmt.index === "number" ? stmt.index : i,
        text: stmt.text || "",
        qcCard: {
          index: typeof stmt.index === "number" ? stmt.index : i,
          statement: stmt.text || "",
          supportState,
          displayVerdict,
          concernLevel: supportState === "supported" ? "none" : "high",
          evidenceSummary: reasonParts.join(" "),
          reasoningParagraph: reasonParts.join(" "),
          editorialVerdict: "clean",
          complianceVerdict: "clean",
        },
        _matches: matches,
        _agg: agg,
      };
    });

    const concerns = gatherConcerns(reviewStatements);
    const concernByIndex = new Map(
      concerns.map((c) => [Number(c.statementIndex), c])
    );

    for (let i = 0; i < reviewStatements.length; i++) {
      const row = reviewStatements[i];
      const stmtId = `${caseId}:S${i}`;
      const matches = row._matches;
      const agg = row._agg;
      const perSource = matches.map((m) => ({
        sourceIndex: m.sourceIndex,
        sourceLabel: m.sourceLabel || sources[m.sourceIndex]?.label || `source_${m.sourceIndex}`,
        classification: m.classification || null,
        passage: typeof m.passage === "string" ? m.passage : "",
        explanation: typeof m.explanation === "string" ? m.explanation : "",
      }));

      if (agg.verdict !== "not_supported") continue;
      funnel.notSupported += 1;

      const concern = concernByIndex.get(i) || concernByIndex.get(Number(row.index));
      const kind = concern?.evidence?.kind || null;
      if (kind !== "unsupported") continue;
      funnel.gatherUnsupported += 1;

      if (hasConfirmedPreserve(concern)) {
        funnel.blockedConfirmedPreserve += 1;
        funnelRows.push({
          caseId,
          statementId: stmtId,
          stage: "blocked_confirmed_preserve",
          text: row.text,
        });
        continue;
      }

      const match = findStatementTextInDraft(draft, concern.statementText || row.text);
      if (!match) {
        funnel.skippedNoMatch += 1;
        continue;
      }
      if (!matchIsWholeSentence(draft, match)) {
        funnel.skippedNotWhole += 1;
        continue;
      }
      funnel.wholeSentence += 1;

      // Per-statement gate on the ORIGINAL draft (upper bound). Batching all
      // concerns in one call undercounts when sequential deletions collide on
      // remnant placement; isolation matches the selection predicate per row.
      const gate = applyDeterministicUnsupportedRemoval(
        { revisedDraft: draft, markers: [] },
        [concern],
        { enabled: true }
      );
      const ev = (gate.removalEvents || [])[0];
      if (!ev) {
        funnel.skippedOther += 1;
        continue;
      }
      if (ev.action === "empty_draft_kept") {
        funnel.emptyDraft += 1;
        funnelRows.push({
          caseId,
          statementId: stmtId,
          stage: "empty_draft_guard",
          text: row.text,
        });
        continue;
      }
      // Selection = the SPEC funnel (unsupported + whole-sentence + not
      // confirmed_preserve + not empty-draft). Remnant placement can still
      // report skipped after the sentence was deleted (remnant_lost); that
      // still counts as selected for breadth. Skip only when the gate refused
      // deletion before mutating the draft.
      const selected =
        ev.action === "removed" ||
        (ev.action === "skipped" && ev.reason === "remnant_lost_after_delete");
      if (!selected) {
        funnel.skippedOther += 1;
        funnelRows.push({
          caseId,
          statementId: stmtId,
          stage: `skipped_${ev.reason || ev.action}`,
          text: row.text,
        });
        continue;
      }

      funnel.selectedRemoved += 1;
      const gateNote =
        ev.action === "removed"
          ? "applyDeterministicUnsupportedRemoval action=removed"
          : `applyDeterministicUnsupportedRemoval action=skipped reason=${ev.reason} (sentence still deleted; remnant annotation failed)`;
      selectedRows.push({
        caseId,
        statementId: stmtId,
        statementIndex: i,
        sentenceText: row.text,
        sourceCount,
        perSourceClassifications: perSource.map((p) => ({
          sourceIndex: p.sourceIndex,
          sourceLabel: p.sourceLabel,
          classification: p.classification,
        })),
        perSourceDetail: perSource,
        gateAction: ev.action,
        gateReason: ev.reason || null,
        selectionReason: `aggregated not_supported -> gatherConcerns kind unsupported; whole-sentence on original draft; not blocked by confirmed_preserve; not empty-draft; ${gateNote} (evaluated alone against original draft)`,
        sources: sources.map((s, idx) => ({
          index: idx,
          label: s.label,
          text: s.text,
        })),
      });
    }
  }

  const casesWithSelection = new Set(selectedRows.map((r) => r.caseId));
  const headline = `${selectedRows.length} statements across ${casesWithSelection.size} cases would be selected for removal, out of ${funnel.totalStatements} statements in the corpus`;

  // Part 2: hand adjudication against source text (not Stage 2 reason).
  // Keys must cover every selected statementId from Part 1.
  /** @type {Record<string, { verdict: "CORRECT"|"WRONG"|"ARGUABLE", sourceLabel: string, quote: string, note: string }>} */
  const ADJUDICATION = {
    "F01:S11": {
      verdict: "WRONG",
      sourceLabel: "01_bvp_shopify_memo",
      quote: "We recommend this investment.",
      note: "Source closes with an explicit recommendation. Draft 'We recommend approval.' is the same speech act; Stage 2 no_support is a miss. Deletion would destroy correct text.",
    },
    "F08:S17": {
      verdict: "CORRECT",
      sourceLabel: "08_synth_industrial_buyout_memo",
      quote: "We recommend approval.",
      note: "Source ends on a plain recommend-approval line. It does not state confidence in the team, look-forward language, or hold-progress updates. Boilerplate closing is unsupported.",
    },
    "F12:S5": {
      verdict: "CORRECT",
      sourceLabel: "12_synth_linkedin_post",
      quote:
        "When we acquired NorTech in 2021 it was an excellent company with a clear ceiling — strong in Sweden, under-exposed everywhere else, and held back by a fragmented shareholder structure.",
      note: "LinkedIn post has no 'numbers tell one story / transformation tells the bigger one' rhetoric. Pure draft flourish.",
    },
    "F13:S15": {
      verdict: "CORRECT",
      sourceLabel: "13_synth_internal_inconsistency_memo",
      quote: "We are attracted to CloudPivot for the following reasons.",
      note: "Memo has an investment thesis section but never claims portfolio-strategy fit. Sentence is unsupported.",
    },
    "F14:S12": {
      verdict: "ARGUABLE",
      sourceLabel: "14_synth_thesis_only_memo",
      quote:
        "We would expect to return with clearer perspectives in the next thesis update.",
      note: "Source defers detail to a later update after sourcing work. Draft says further detail when work is sufficiently advanced. Same deferral intent, different wording; reasonable people differ on whether that backs deletion.",
    },
    "F15:S32": {
      verdict: "CORRECT",
      sourceLabel: "15_synth_very_long_memo",
      quote:
        "We recommend approval of an investment of up to EUR 720 million of equity from Halden Group, with the right to syndicate up to EUR 110 million of co-investment, in the acquisition of Casa Verde Group S.p.A.",
      note: "Source recommends approval with ticket size. It does not say high conviction in management / value creation plan, nor look-forward hold updates. Stock LP closing is unsupported.",
    },
    "F20:S8": {
      verdict: "CORRECT",
      sourceLabel: "20_synth_fund_close_announcement",
      quote:
        "We anticipate making 10 to 12 platform investments over the four-year deployment period, with typical equity tickets in the EUR 300 to 700 million range.",
      note: "Announcement covers final close and deployment shape. No pipeline-prep claim and no first capital call in Q2 2026.",
    },
    "F21:S3": {
      verdict: "CORRECT",
      sourceLabel: "21_r6_6_2_residual_legs",
      quote:
        "James Ortiz, former Chief Executive Officer of GridCo Industries, advised Meridian Capital on the transaction structure.",
      note: "Ortiz appears only as an adviser. No Project Atlas quote and no 'double in value within two years.'",
    },
    "F21:S4": {
      verdict: "CORRECT",
      sourceLabel: "21_r6_6_2_residual_legs",
      quote:
        "Frankfurt, Germany — 1 March 2026 — Meridian Capital (\"Meridian\") today announced the acquisition of NordVolt Storage GmbH (\"NordVolt\"), a Nordic battery storage platform.",
      note: "Press release announces the deal as of 1 March 2026. No expected close in Q2 2026.",
    },
    "F22:S3": {
      verdict: "CORRECT",
      sourceLabel: "ALP_IC_memo",
      quote:
        "The transaction was advised by Elena Foscari, former operations director at Veneto Freight, who supported the commercial diligence workstream.",
      note: "Veneto Freight is prior employer of an adviser, not a fund portfolio company. Update memo never mentions Veneto Freight.",
    },
    "F23:S4": {
      verdict: "CORRECT",
      sourceLabel: "CRF_IC_memo",
      quote:
        "The opportunity was sourced through the fund's relationship with Aldous Renewables, a long-standing co-investment partner.",
      note: "Aldous is a co-investment partner, not the fund's largest limited partner. Diligence update never names Aldous.",
    },
  };

  for (const row of selectedRows) {
    const adj = ADJUDICATION[row.statementId];
    if (!adj) {
      throw new Error(`missing hand adjudication for ${row.statementId}`);
    }
    row.adjudication = adj.verdict;
    row.adjudicationSourceLabel = adj.sourceLabel;
    row.adjudicationQuote = adj.quote;
    row.adjudicationNote = adj.note;
  }

  const counts = { CORRECT: 0, WRONG: 0, ARGUABLE: 0 };
  for (const row of selectedRows) counts[row.adjudication] += 1;

  const payload = {
    ranAt: new Date().toISOString(),
    modelCalls: 0,
    costUsd: 0,
    reviewArtefact: BASELINE_PATH,
    reviewNote:
      baseline._staleNote ||
      "claim-spans/.baseline.json Stage 2 matches (aggregated via stage3).",
    currentStage2Reference: baseline._currentStage2Reference || null,
    caseCount: caseIds.length,
    funnel,
    headline,
    upperBoundNote:
      "UPPER BOUND: at run time the gate also requires statementText to still match the model's revised draft.",
    adjudicationCounts: counts,
    selected: selectedRows.map((r) => ({
      caseId: r.caseId,
      statementId: r.statementId,
      statementIndex: r.statementIndex,
      sentenceText: r.sentenceText,
      sourceCount: r.sourceCount,
      perSourceClassifications: r.perSourceClassifications,
      gateAction: r.gateAction,
      gateReason: r.gateReason,
      selectionReason: r.selectionReason,
      adjudication: r.adjudication,
      adjudicationSourceLabel: r.adjudicationSourceLabel,
      adjudicationQuote: r.adjudicationQuote,
      adjudicationNote: r.adjudicationNote,
    })),
    funnelSideRows: funnelRows,
  };

  await writeFile(
    path.join(OUT_DIR, "removal-breadth-rows.json"),
    `${JSON.stringify(payload, null, 2)}\n`,
    "utf8"
  );

  const md = renderReport({
    headline,
    funnel,
    counts,
    selected: payload.selected,
    reviewNote: payload.reviewNote,
    currentStage2Reference: payload.currentStage2Reference,
    upperBoundNote: payload.upperBoundNote,
    caseCount: caseIds.length,
  });
  await writeFile(path.join(OUT_DIR, "removal-breadth-audit.md"), md, "utf8");

  console.log(headline);
  console.log(
    `adjudication CORRECT=${counts.CORRECT} WRONG=${counts.WRONG} ARGUABLE=${counts.ARGUABLE}`
  );
  console.log("funnel", JSON.stringify(funnel, null, 2));
  console.log(`wrote ${selectedRows.length} selected rows + report`);
}

/**
 * @param {object} args
 * @returns {string}
 */
function renderReport(args) {
  const {
    headline,
    funnel,
    counts,
    selected,
    reviewNote,
    currentStage2Reference,
    upperBoundNote,
    caseCount,
  } = args;

  const wrong = selected.filter((r) => r.adjudication === "WRONG");
  const arguable = selected.filter((r) => r.adjudication === "ARGUABLE");
  const correct = selected.filter((r) => r.adjudication === "CORRECT");

  const clsCell = (r) =>
    (r.perSourceClassifications || [])
      .map((p) => `${p.sourceLabel}:${p.classification}`)
      .join("; ");

  const tableLines = [
    "| case id | statement id | sentence text | sources | Stage 2 classifications | selection reason | adjudication |",
    "| --- | --- | --- | ---: | --- | --- | --- |",
  ];
  for (const r of selected) {
    const sent = String(r.sentenceText || "")
      .replace(/\|/g, "\\|")
      .replace(/\n/g, " ");
    const reason = String(r.selectionReason || "")
      .replace(/\|/g, "\\|")
      .slice(0, 120);
    tableLines.push(
      `| ${r.caseId} | ${r.statementId} | ${sent} | ${r.sourceCount} | ${clsCell(r)} | ${reason}... | ${r.adjudication} |`
    );
  }

  function fullRowBlock(r) {
    return [
      `### ${r.statementId} (${r.adjudication})`,
      "",
      `Sentence: ${r.sentenceText}`,
      "",
      `Sources supplied: ${r.sourceCount}`,
      "",
      `Stage 2: ${clsCell(r)}`,
      "",
      `Deciding source (${r.adjudicationSourceLabel}):`,
      "",
      "```",
      r.adjudicationQuote,
      "```",
      "",
      r.adjudicationNote,
      "",
    ].join("\n");
  }

  return `# Removal breadth audit (static gate)

Commit target:
\`chore(revise): static gate audit for deterministic unsupported removal across the corpus\`

Flag \`deterministicUnsupportedRemoval\` stays OFF in production. 0559301 stays OFF.
No Suggest / Reviser calls. Cost: **$0**.

---

## Adjudication counts (Part 2)

\`\`\`
CORRECT   ${counts.CORRECT}
WRONG     ${counts.WRONG}
ARGUABLE  ${counts.ARGUABLE}
\`\`\`

WRONG means a supplied source backs the sentence; enabling the flag would delete
correct text. ARGUABLE means partial / implied backing; reasonable people differ.

---

## Headline (Part 1)

\`\`\`
${headline}
\`\`\`

${upperBoundNote}

This is an UPPER BOUND also because each selected statement was evaluated alone
against the ORIGINAL draft via \`applyDeterministicUnsupportedRemoval\` from
\`lib/pr9-deterministic-unsupported-removal.mjs\`. Runtime still requires the
model's revised draft to retain matching \`statementText\`.

---

## Method

- Corpus: 29 graded cases (${caseCount} loaded) from
  \`scripts/diagnostic/claim-spans/.baseline.json\` (296 statements).
- Review artefact note: ${reviewNote}
- Live Stage 2 reference (not used for this gate pass): \`${currentStage2Reference || "n/a"}\`
- Aggregate per statement with \`aggregateVerdict\` (stage3).
- Map cards through \`gatherConcerns\` (real unsupported kind).
- Whole-sentence / empty-draft / confirmed_preserve / removal via the real
  gate module (imported; not reimplemented).
- \`remnant_lost_after_delete\` still counts as selected: the gate deletes the
  sentence before remnant annotation fails (common on last-sentence closers
  when \`previousSentenceBounds\` swallows the target). Breadth measures deletion,
  not whether the CUT remnant marker was placed.
- Zero model calls. Cost $0.

### Funnel

\`\`\`
total statements in corpus:           ${funnel.totalStatements}
aggregated not_supported:             ${funnel.notSupported}
gatherConcerns kind=unsupported:      ${funnel.gatherUnsupported}
whole-sentence on original draft:     ${funnel.wholeSentence}
blocked confirmed_preserve:           ${funnel.blockedConfirmedPreserve}
empty-draft guard:                    ${funnel.emptyDraft}
selected for removal:                 ${funnel.selectedRemoved}
skipped not whole-sentence:           ${funnel.skippedNotWhole}
skipped no draft match:               ${funnel.skippedNoMatch}
skipped other (pre-delete):           ${funnel.skippedOther}
\`\`\`

---

## Selected statements (Part 1 table)

${tableLines.join("\n")}

Full rows: \`scripts/diagnostic/revise/removal-breadth-rows.json\`

---

## WRONG and ARGUABLE (full)

${[...wrong, ...arguable].map(fullRowBlock).join("\n") || "_None._\n"}

## CORRECT (quote per row)

${correct.map(fullRowBlock).join("\n")}

---

## Read on shipping the flag

Of ${selected.length} upper-bound deletions, ${counts.WRONG} would destroy
source-backed text on this corpus artefact (${((100 * counts.WRONG) / Math.max(1, selected.length)).toFixed(1)}% of
selected; ${((100 * counts.WRONG) / Math.max(1, funnel.totalStatements)).toFixed(2)}% of all corpus statements).
${counts.ARGUABLE} more is arguable.

B115 attention-failure band (1.5% to 4.5%) is about wrong no_support rate on
attention probes. Here the static gate would delete ${selected.length} of
${funnel.totalStatements} statements (${((100 * selected.length) / Math.max(1, funnel.totalStatements)).toFixed(1)}%)
under stale baseline Stage 2. Re-run after B114 baseline regeneration before any
enable decision.

---

## Pass conditions

- Part 1: table, rows JSON, headline count; zero model calls. PASS
- Part 2: every selected row adjudicated against source text with a quote. PASS
- Report leads with CORRECT / WRONG / ARGUABLE counts. PASS
- Cost $0. PASS
`;
}

main().catch((err) => {
  console.error("[removal-breadth-audit] fatal:", err?.message || err);
  process.exit(1);
});
