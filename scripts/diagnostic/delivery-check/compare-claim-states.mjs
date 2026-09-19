#!/usr/bin/env node
/**
 * Phase 2 comparisons. No model calls. Reads tests/fixtures/b247.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { classifyCard, reviewSummaryFromResult, summariseReview } from "../../../lib/qc/review-summary.mjs";
import { summaryBulletsFromReview } from "../../../lib/qc/summary-bullets.mjs";
import { evidenceDisplayVerdictLabel } from "../../../lib/qc/evidence-display-verdict.mjs";
import { renderCanonicalExportText } from "../../../lib/qc/export-review-data.mjs";
import { collectMarginNotes, CLEAN_DRAFT_FEEDBACK_TEXT, isCardFullyClean } from "../../../lib/qc/constructive-feedback.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const FIXTURE_DIR = path.join(ROOT, "tests/fixtures/b247");
const FRONTEND_ROOT = path.resolve(ROOT, "../brightline-content-engine-frontend");
const DISCLAIMER =
  "Compliance flags are based on commonly-observed principles and are not jurisdiction-specific or a substitute for legal counsel. Editorial and Evidence flags are guidance for the reviewer's judgment. All flags require human confirmation before publication.";

function loadJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function draftFrom(payload) {
  const statements = Array.isArray(payload?.statements) ? payload.statements : [];
  return statements.map((row) => row?.text || row?.qcCard?.statement || "").filter(Boolean).join(" ");
}

function countWords(text) {
  const trimmed = String(text ?? "").trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).filter(Boolean).length;
}

function cards(payload) {
  return (Array.isArray(payload?.statements) ? payload.statements : [])
    .map((row) => row?.qcCard)
    .filter((card) => card && typeof card === "object");
}

function rows(payload) {
  return Array.isArray(payload?.statements) ? payload.statements : [];
}

async function loadFrontend() {
  const claimsPath = path.join(FRONTEND_ROOT, "src/utils/resultsScreenClaims.js");
  const synthPath = path.join(FRONTEND_ROOT, "src/utils/reviewerSynthesisPayload.js");
  const claimsMod = await import(pathToFileURL(claimsPath).href);
  const synthMod = await import(pathToFileURL(synthPath).href);
  return {
    collectResultsScreenClaims: claimsMod.collectResultsScreenClaims,
    buildReviewerSynthesisPayload: synthMod.buildReviewerSynthesisPayload,
  };
}

function qrsFrom(payload, maxWords = 150, originalDraft = "") {
  const summary = reviewSummaryFromResult(payload, payload?.meta?.reviewOptions);
  const bullets = [...summaryBulletsFromReview(summary)];
  const draft = originalDraft || draftFrom(payload);
  const over = Math.max(0, countWords(draft) - maxWords);
  if (over > 0) bullets.push(`The draft is ${over} words over the ${maxWords} word limit.`);
  return { summary, bullets, readiness: summary?.readiness ?? null, draft, wordCount: countWords(draft), statementJoin: draftFrom(payload) };
}

function exportTextFrom(payload, qrs) {
  return renderCanonicalExportText({
    qcResult: payload,
    qualityReviewSummary: { readiness: qrs.readiness, bullets: qrs.bullets },
    sources: (payload.sources || []).map((row) => ({
      name: row.label || row.name,
      fileType: "txt",
    })),
    draft: qrs.draft,
    meta: { reviewDisclaimerText: DISCLAIMER },
    reviewOptions: payload?.meta?.reviewOptions,
  });
}

function countBadges(screen, label) {
  return (screen.cards || []).filter((card) => card.evidenceBadge === label).length;
}

function disagreement(table, state, left, right, leftSays, rightSays, claimIds = []) {
  table.push({
    state,
    left,
    right,
    leftSays: leftSays == null ? "(none)" : String(leftSays),
    rightSays: rightSays == null ? "(none)" : String(rightSays),
    claimIds,
  });
}

function sameCount(a, b) {
  return Number(a) === Number(b);
}

async function compareState(id, payload, fe, tables, extras = {}) {
  const opts = payload?.meta?.reviewOptions || {};
  const qrs = qrsFrom(payload, 150, extras.originalDraft);
  const screen = fe.collectResultsScreenClaims({
    analysisResult: payload,
    draftText: qrs.draft,
    maxWords: 150,
  });
  const assessment = fe.buildReviewerSynthesisPayload(qrs.draft, payload, rows(payload), opts, "assess");
  const notes = collectMarginNotes(rows(payload), opts, qrs.draft);
  const exportText = exportTextFrom(payload, qrs);
  const exportLines = exportText.split("\n").filter(Boolean);
  const classified = cards(payload).map((card) => classifyCard(card, opts));
  const confirmedCards = classified.filter((cls) => cls.evidence === "confirmed").length;
  const partialCards = classified.filter((cls) => cls.evidence === "partial").length;
  const conflictCards = classified.filter((cls) => cls.evidence === "conflicting").length;
  const noSupportCards = classified.filter((cls) => cls.evidence === "notSupported").length;
  const editorialConcernCards = classified.filter(
    (cls) => cls.editorial === "concern" || cls.editorial === "hardConcern"
  ).length;
  const notCheckedCards = classified.filter(
    (cls) => cls.editorial === "notChecked" || cls.compliance === "notChecked" || cls.evidence === "notChecked"
  ).length;
  const unclean = rows(payload).filter((row) => !isCardFullyClean(row?.qcCard, opts)).length;

  const A = tables.A;
  const B = tables.B;
  const C = tables.C;

  if (!sameCount(screen.filterCounts?.all, cards(payload).length)) {
    disagreement(A, id, "filter All", "card count", screen.filterCounts?.all, cards(payload).length, ["C3"]);
  }
  if (!sameCount(countBadges(screen, "Confirmed"), qrs.summary?.evidence?.confirmed ?? 0)) {
    disagreement(
      A,
      id,
      "Confirmed badges",
      "QRS evidence.confirmed",
      countBadges(screen, "Confirmed"),
      qrs.summary?.evidence?.confirmed ?? 0,
      ["C13", "C4"]
    );
  }
  if (!sameCount(countBadges(screen, "Partially confirmed"), qrs.summary?.evidence?.partial ?? 0)) {
    disagreement(
      A,
      id,
      "Partially confirmed badges",
      "QRS evidence.partial",
      countBadges(screen, "Partially confirmed"),
      qrs.summary?.evidence?.partial ?? 0,
      ["C13", "C4"]
    );
  }
  if (!sameCount(countBadges(screen, "Conflicting"), qrs.summary?.evidence?.conflicting ?? 0)) {
    disagreement(
      A,
      id,
      "Conflicting badges",
      "QRS evidence.conflicting",
      countBadges(screen, "Conflicting"),
      qrs.summary?.evidence?.conflicting ?? 0,
      ["C13", "C4"]
    );
  }
  if (!sameCount(countBadges(screen, "No support"), qrs.summary?.evidence?.notSupported ?? 0)) {
    disagreement(
      A,
      id,
      "No support badges",
      "QRS evidence.notSupported",
      countBadges(screen, "No support"),
      qrs.summary?.evidence?.notSupported ?? 0,
      ["C13", "C4"]
    );
  }
  if (screen.readiness !== qrs.readiness) {
    disagreement(A, id, "screen readiness", "recomputed QRS readiness", screen.readiness, qrs.readiness, ["C14"]);
  }

  const originalDraft = extras.originalDraft || "";
  if (originalDraft) {
    const originalWords = countWords(originalDraft);
    const statementWords = countWords(qrs.statementJoin);
    if (originalWords !== statementWords) {
      disagreement(
        A,
        id,
        "live draft word count",
        "statement texts joined",
        originalWords,
        statementWords,
        ["C1", "C30", "C36"]
      );
    }
  }

  const conflictBadges = countBadges(screen, "Conflicting");
  if (!sameCount(screen.filterCounts?.conflicts, conflictBadges)) {
    disagreement(
      A,
      id,
      "filter Conflicts",
      "Conflicting badges",
      screen.filterCounts?.conflicts,
      conflictBadges,
      ["C3", "C13"]
    );
  }

  for (const row of rows(payload)) {
    const card = row?.qcCard ?? {};
    const face = (screen.cards || []).find((item) => item.id === String(row.id));
    if (face && face.statement !== (card.statement || row.text)) {
      disagreement(A, id, `card ${row.id} face statement`, "qcCard.statement", face.statement, card.statement, [
        "C30",
      ]);
    }
    if (
      face &&
      opts.editorialEnabled === false &&
      face.editorialLabel === "Not reviewed" &&
      card.editorialVerdict === "clean"
    ) {
      disagreement(
        A,
        id,
        `card ${row.id} editorial label`,
        "qcCard.editorialVerdict",
        face.editorialLabel,
        card.editorialVerdict,
        ["C21", "C63"]
      );
    }
    if (
      face &&
      opts.complianceEnabled === false &&
      face.complianceLabel === "Not reviewed" &&
      card.complianceVerdict === "clean"
    ) {
      disagreement(
        A,
        id,
        `card ${row.id} compliance label`,
        "qcCard.complianceVerdict",
        face.complianceLabel,
        card.complianceVerdict,
        ["C21", "C63"]
      );
    }
    const expectedBadge =
      card.supportState === "skipped" || String(card.displayVerdict ?? "").toLowerCase() === "not reviewed"
        ? "Not reviewed"
        : evidenceDisplayVerdictLabel(card.displayVerdict);
    if (face && face.evidenceBadge !== expectedBadge) {
      disagreement(
        A,
        id,
        `card ${row.id} badge`,
        "displayVerdict label",
        face.evidenceBadge,
        expectedBadge,
        ["C13"]
      );
    }
    if (face?.excerpt?.passage && card.primaryExcerptText && face.excerpt.passage !== card.primaryExcerptText) {
      disagreement(
        A,
        id,
        `card ${row.id} excerpt`,
        "primaryExcerptText",
        face.excerpt.passage,
        card.primaryExcerptText,
        ["C31"]
      );
    }
    const spans = Array.isArray(card.supportSpans) ? card.supportSpans : [];
    for (const span of spans) {
      const hit = (screen.drawer || [])
        .flatMap((src) => src.highlights || [])
        .find((h) => h.passage === span.passage && String(h.statementId) === String(span.statementId ?? row.id));
      if (span.passage && !hit) {
        disagreement(
          A,
          id,
          `drawer highlight for card ${row.id}`,
          "supportSpans passage",
          "(missing on drawer)",
          span.passage,
          ["C32"]
        );
      }
    }
  }

  const qrsNoSupportLine = (qrs.bullets || []).find((line) => line.includes("no source behind"));
  if (qrsNoSupportLine) {
    const n = Number((qrsNoSupportLine.match(/^(\d+)/) || [])[1] || 0);
    if (n !== (qrs.summary?.evidence?.notSupported ?? 0)) {
      disagreement(
        A,
        id,
        "QRS no-source bullet",
        "evidence.notSupported",
        qrsNoSupportLine,
        qrs.summary?.evidence?.notSupported,
        ["C4"]
      );
    }
  }

  const stamped = payload?.meta?.reviewSummary?.readiness ?? null;
  if (stamped && stamped !== qrs.readiness) {
    disagreement(A, id, "stamped meta.reviewSummary.readiness", "recomputed readiness", stamped, qrs.readiness, [
      "C14",
    ]);
  }

  if (screen.readiness !== qrs.readiness) {
    disagreement(B, id, "screen readiness", "QRS readiness", screen.readiness, qrs.readiness, ["C14"]);
  }
  const exportReadiness = exportLines[0] || null;
  if (exportReadiness !== screen.readiness) {
    disagreement(B, id, "export first line", "screen readiness", exportReadiness, screen.readiness, ["C14"]);
  }
  const screenBulletSet = new Set(screen.bullets || []);
  const qrsBulletSet = new Set(qrs.bullets || []);
  for (const line of screen.bullets || []) {
    if (!qrsBulletSet.has(line) && !line.includes("words over the")) {
      disagreement(B, id, "screen QRS bullet", "backend QRS bullets", line, "(absent)", ["C4"]);
    }
  }
  for (const line of qrs.bullets || []) {
    if (!screenBulletSet.has(line)) {
      disagreement(B, id, "backend QRS bullet", "screen QRS bullets", line, "(absent)", ["C4"]);
    }
  }
  if (assessment?.qcSummary?.readiness && assessment.qcSummary.readiness !== screen.readiness) {
    disagreement(
      B,
      id,
      "assessment qcSummary.readiness",
      "screen readiness",
      assessment.qcSummary.readiness,
      screen.readiness,
      ["C37", "C14"]
    );
  }
  if (assessment && !sameCount(assessment.qcSummary.notSupported, qrs.summary?.evidence?.notSupported ?? 0)) {
    disagreement(
      B,
      id,
      "assessment notSupported",
      "QRS evidence.notSupported",
      assessment.qcSummary.notSupported,
      qrs.summary?.evidence?.notSupported ?? 0,
      ["C37", "C4"]
    );
  }
  if (assessment && !sameCount(assessment.qcSummary.conflicting, qrs.summary?.evidence?.conflicting ?? 0)) {
    disagreement(
      B,
      id,
      "assessment conflicting",
      "QRS evidence.conflicting",
      assessment.qcSummary.conflicting,
      qrs.summary?.evidence?.conflicting ?? 0,
      ["C37", "C4"]
    );
  }
  if (assessment && !sameCount(assessment.qcSummary.editorialFlagCount, qrs.summary?.editorial?.concerns ?? 0)) {
    disagreement(
      B,
      id,
      "assessment editorialFlagCount",
      "QRS editorial.concerns",
      assessment.qcSummary.editorialFlagCount,
      qrs.summary?.editorial?.concerns ?? 0,
      ["C37"]
    );
  }
  const feedbackSaysClean = notes.length === 0;
  const readinessReady = screen.readiness === "Ready";
  if (feedbackSaysClean !== readinessReady && notes.length === 0 && screen.readiness !== "Ready") {
    disagreement(
      B,
      id,
      "constructive feedback notes",
      "readiness",
      notes.length === 0 ? CLEAN_DRAFT_FEEDBACK_TEXT : `${notes.length} notes`,
      screen.readiness,
      ["C40", "C14"]
    );
  }
  if (notes.filter((n) => n.kind !== "coherence").length !== unclean) {
    disagreement(
      B,
      id,
      "constructive feedback notes (non-coherence)",
      "unclean cards",
      notes.filter((n) => n.kind !== "coherence").length,
      unclean,
      ["C40"]
    );
  }

  const filterNotChecked = screen.filterCounts?.not_checked ?? 0;
  const evidenceNotReviewed = (screen.cards || []).filter((card) => card.evidenceBadge === "Not reviewed").length;
  if (evidenceNotReviewed > 0 && filterNotChecked === 0) {
    disagreement(
      B,
      id,
      "filter Not checked",
      "evidence Not reviewed badges",
      filterNotChecked,
      evidenceNotReviewed,
      ["C67", "C62"]
    );
  }
  const summaryNotChecked = qrs.summary?.notChecked ?? 0;
  if (filterNotChecked !== summaryNotChecked && evidenceNotReviewed > 0) {
    disagreement(
      B,
      id,
      "filter Not checked",
      "QRS notChecked",
      filterNotChecked,
      summaryNotChecked,
      ["C67", "C65"]
    );
  }

  const editorialOff = opts.editorialEnabled === false;
  const complianceOff = opts.complianceEnabled === false;
  const evidenceOff = opts.evidenceEnabled === false;
  const qrsJoined = (qrs.bullets || []).join(" | ");
  if (editorialOff && /editorial notes/.test(qrsJoined)) {
    disagreement(C, id, "QRS", "editorialEnabled false", qrsJoined, "editorial check was off", ["C4", "C68"]);
  }
  if (complianceOff && /compliance notes/.test(qrsJoined)) {
    disagreement(C, id, "QRS", "complianceEnabled false", qrsJoined, "compliance check was off", ["C4", "C68"]);
  }
  if (evidenceOff) {
    for (const card of screen.cards || []) {
      if (card.evidenceBadge !== "Not reviewed") {
        disagreement(
          C,
          id,
          `card ${card.id} evidence badge`,
          "evidenceEnabled false",
          card.evidenceBadge,
          "Not reviewed",
          ["C62"]
        );
      }
    }
    if (/All claims are backed by sources/.test(qrsJoined)) {
      disagreement(
        C,
        id,
        "QRS",
        "evidenceEnabled false",
        qrsJoined,
        "Evidence review was not run for this output.",
        ["C66"]
      );
    }
  }
  if (editorialOff) {
    for (const card of screen.cards || []) {
      if (card.editorialLabel !== "Not reviewed") {
        disagreement(
          C,
          id,
          `card ${card.id} editorial`,
          "editorialEnabled false",
          card.editorialLabel,
          "Not reviewed",
          ["C63"]
        );
      }
    }
    if (editorialOff && !exportText.includes("Editorial note:") && (screen.cards || []).some((card) => card.editorialLabel === "Not reviewed")) {
      disagreement(
        B,
        id,
        "screen editorial labels",
        "export editorial lines",
        "Not reviewed",
        "(omitted)",
        ["C63", "C64"]
      );
    }
  }
  if (complianceOff) {
    for (const card of screen.cards || []) {
      if (card.complianceLabel !== "Not reviewed") {
        disagreement(
          C,
          id,
          `card ${card.id} compliance`,
          "complianceEnabled false",
          card.complianceLabel,
          "Not reviewed",
          ["C63"]
        );
      }
    }
  }

  const needsAttentionFilter = screen.filterCounts?.needs_attention ?? 0;
  const summaryNeeds = qrs.summary?.needsAttention ?? 0;
  if (needsAttentionFilter !== summaryNeeds) {
    disagreement(
      B,
      id,
      "filter Needs attention",
      "QRS needsAttention",
      needsAttentionFilter,
      summaryNeeds,
      ["C3"]
    );
  }

  return {
    id,
    readiness: screen.readiness,
    bullets: screen.bullets,
    filterCounts: screen.filterCounts,
    badges: (screen.cards || []).map((card) => card.evidenceBadge),
    editorial: (screen.cards || []).map((card) => card.editorialLabel),
    compliance: (screen.cards || []).map((card) => card.complianceLabel),
    assessmentReadiness: assessment?.qcSummary?.readiness ?? null,
    assessmentCounts: assessment?.qcSummary ?? null,
    feedbackNotes: notes.length,
    uncleanCards: unclean,
    exportHead: exportLines.slice(0, 8),
    reviewOptions: opts,
    statementCount: cards(payload).length,
    confirmedCards,
    partialCards,
    conflictCards,
    noSupportCards,
    editorialConcernCards,
    notCheckedCards,
    excludedSources: payload?.excludedSources ?? [],
    sourceCount: Array.isArray(payload?.sources) ? payload.sources.length : 0,
    wordCount: qrs.wordCount,
  };
}

async function main() {
  const fe = await loadFrontend();
  const tables = { A: [], B: [], C: [] };
  const states = [
    "r1-ready",
    "r2-conflict-first",
    "r2-conflict-second",
    "r3-evidence-only",
    "r4-editorial-only",
    "r5-excluded-source",
    "r6-near-limit",
    "r6-unsupported",
  ];
  const log = existsSync(path.join(FIXTURE_DIR, "recording-log.json"))
    ? loadJson(path.join(FIXTURE_DIR, "recording-log.json"))
    : [];
  const drafts = Object.fromEntries(
    log
      .filter((row) => row?.id && row?.used)
      .map((row) => [row.id, row.originalDraft || null])
  );
  const ORIGINAL = {
    "r1-ready":
      "Oakfield Partners closed Fund III at EUR 400 million in March 2025. The fund invests in European manufacturing companies.",
    "r2-conflict-first": "Oakfield Partners closed Fund III at EUR 400 million in March 2025.",
    "r2-conflict-second": "Oakfield Partners closed Fund III at EUR 400 million in March 2025.",
    "r3-evidence-only":
      "Oakfield Partners closed Fund III at EUR 400 million in March 2025. The fund invests in European manufacturing companies.",
    "r4-editorial-only":
      "We closed Fund III at EUR 400 million in March 2025. The fund invests in European manufacturing companies.",
    "r5-excluded-source":
      "Oakfield Partners closed Fund III at EUR 400 million in March 2025. The fund invests in European manufacturing companies.",
    "r6-near-limit": [
      "Oakfield Partners closed Fund III at EUR 400 million in March 2025.",
      "The fund invests in European manufacturing companies across Germany, France, and the Nordics.",
      "The investment committee approved the close after a six month fundraising period that began in September 2024.",
      "Existing limited partners accounted for most of the commitments recorded at close.",
      "The remaining capital came from two new European pension funds that completed diligence in February 2025.",
      "Fund III will pursue control investments in lower mid market manufacturing businesses with export revenue.",
      "Hold periods are expected to run between four and six years depending on the exit route available.",
      "Oakfield will not invest more than twenty five percent of commitments in a single country.",
      "Reporting to limited partners will follow the quarterly cycle already used for Fund II.",
      "The close completed in March 2025 after the last remaining commitment was signed in Zurich.",
      "This note covers the March 2025 close.",
    ].join(" "),
    "r6-unsupported":
      "Northaven Logistics sold its Scandinavian depot network for EUR 90 million in January 2026. The buyer was a listed industrial group based in Milan.",
  };
  const sketches = [];
  for (const id of states) {
    const filePath = path.join(FIXTURE_DIR, `${id}.json`);
    if (!existsSync(filePath)) {
      sketches.push({ id, reached: false, reason: `missing ${filePath}` });
      continue;
    }
    const payload = loadJson(filePath);
    if (!payload || payload.ok !== true) {
      sketches.push({ id, reached: false, reason: `payload not ok` });
      continue;
    }
    sketches.push(await compareState(id, payload, fe, tables, { originalDraft: ORIGINAL[id] || drafts[id] }));
  }

  if (process.argv.includes("--inject-fail")) {
    const src = loadJson(path.join(FIXTURE_DIR, "r2-conflict-first.json"));
    const copy = JSON.parse(JSON.stringify(src));
    const card = copy.statements?.[0]?.qcCard;
    if (card?.summaryClass) {
      card.summaryClass.evidence = "confirmed";
      card.summaryClass.needsAttention = false;
    }
    const injected = { A: [], B: [], C: [] };
    await compareState("injected-stale-summaryClass", copy, fe, injected, {
      originalDraft: ORIGINAL["r2-conflict-first"],
    });
    const caught = injected.A.concat(injected.B, injected.C);
    console.log("PART3_CAUGHT", JSON.stringify(caught, null, 2));
    if (caught.length === 0) {
      console.error("PART3 failed to catch the injected summaryClass disagreement");
      process.exit(1);
    }
  }

  const out = { sketches, tables };
  writeFileSync(path.join(FIXTURE_DIR, "comparison.json"), `${JSON.stringify(out, null, 2)}\n`);
  console.log(JSON.stringify(out, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
