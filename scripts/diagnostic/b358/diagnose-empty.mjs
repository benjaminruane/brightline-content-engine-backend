/**
 * B358 Part 4. Read-only. Why S7 and S10 stored no usable quote.
 * No model calls.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { extractVerifiableAnchors, isCompoundCandidate } from "../../../lib/qc/claim-spans.mjs";
import { gateExcerpt } from "../../../lib/qc/excerpt-locate.mjs";
import { applyEmptyConfirmationRefusal } from "../../../lib/qc/pipeline-v4/stage2-match-sources.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const FIXTURE_DIR = path.join(ROOT, "tests/fixtures/real-runs-2026-09-29");
const CLEAN = JSON.parse(readFileSync(path.join(FIXTURE_DIR, "clean-review.json"), "utf8"));

function excerptText(card) {
  const p = card.primaryExcerpt;
  if (p == null) return null;
  if (typeof p === "string") return p;
  if (typeof p.passage === "string") return p.passage;
  return null;
}

function dumpStatement(payload, index, label) {
  const stmt = payload.statements[index];
  const card = stmt.qcCard;
  const source = payload.sources[0]?.text || "";
  const spans = Array.isArray(card.supportSpans) ? card.supportSpans : [];
  const fps = Array.isArray(card.stage2SourceFingerprints) ? card.stage2SourceFingerprints : [];
  const quote = excerptText(card);
  const anchors = extractVerifiableAnchors(card.statement);
  const compound = isCompoundCandidate(card.statement);
  console.log(`\n===== ${label} S${index} =====`);
  console.log("statement:", card.statement);
  console.log("displayVerdict:", card.displayVerdict);
  console.log("supportState:", card.supportState);
  console.log("hasConflict:", card.hasConflict);
  console.log("evidenceNotReviewedReason:", card.evidenceNotReviewedReason);
  console.log("hasRealExcerpt:", card.hasRealExcerpt);
  console.log("excerptNotLocatable:", card.excerptNotLocatable);
  console.log("primaryExcerpt:", quote == null ? "null" : JSON.stringify(quote).slice(0, 180));
  console.log("quoteChars:", quote?.length ?? 0);
  console.log("fingerprints:", JSON.stringify(fps, null, 2));
  console.log(
    "spans:",
    spans.map((s) => ({
      classification: s.classification,
      start: s.start,
      end: s.end,
      len: typeof s.passage === "string" ? s.passage.length : 0,
      passageHead: typeof s.passage === "string" ? s.passage.slice(0, 120) : "",
    }))
  );
  console.log("compound:", compound);
  console.log(
    "anchors:",
    anchors.map((a) => a.text)
  );
  const sourceHits = [
    "The second financing transaction repriced",
    "Our Private Equity team completed the realisation of MPM",
    "The sales achieved sterling money multiples of 3.2x and 2.8x respectively",
    "€3.1 billion",
    "EUR 3.1",
  ];
  for (const needle of sourceHits) {
    const idx = source.indexOf(needle);
    console.log(`source.indexOf(${JSON.stringify(needle)})=`, idx);
  }
  for (const span of spans) {
    const passage = typeof span.passage === "string" ? span.passage : "";
    if (!passage) {
      console.log("span locate: empty passage");
      continue;
    }
    const gated = gateExcerpt({
      passage,
      sourceLabel: payload.sources[0]?.label || payload.sources[0]?.name,
      sources: payload.sources,
      supportSpans: spans,
    });
    console.log("gateExcerpt span:", {
      found: Boolean(gated?.passage),
      start: gated?.start,
      end: gated?.end,
      len: gated?.passage?.length ?? 0,
    });
    const refused = applyEmptyConfirmationRefusal({
      classification: span.classification || "confirmed",
      passage: gated?.passage || "",
      sourceLabel: payload.sources[0]?.label,
    });
    console.log("emptyConfirmationRefusal:", refused);
  }
  if (fps.length === 0) console.log("NEVER CALLED? fingerprints empty");
  else if (fps.every((f) => !f.classification || f.classification === "not_reviewed")) {
    console.log("CALLED but classification empty/not_reviewed");
  } else {
    console.log("CALLED with classification", fps.map((f) => f.classification).join(","));
  }
}

dumpStatement(CLEAN, 6, "CLEAN");
dumpStatement(CLEAN, 7, "CLEAN");
dumpStatement(CLEAN, 9, "CLEAN");
dumpStatement(CLEAN, 10, "CLEAN");

const S7 = CLEAN.statements[7].qcCard.statement;
const S10 = CLEAN.statements[10].qcCard.statement;
console.log("\n===== shared vs other =====");
for (let i = 0; i < CLEAN.statements.length; i++) {
  const s = CLEAN.statements[i].qcCard.statement;
  const compound = isCompoundCandidate(s);
  const anchors = extractVerifiableAnchors(s).map((a) => a.text);
  const spans = CLEAN.statements[i].qcCard.supportSpans || [];
  const emptySpan = spans.every((sp) => !sp.passage);
  const quote = excerptText(CLEAN.statements[i].qcCard);
  console.log(
    `S${i} compound=${compound} anchors=${JSON.stringify(anchors)} spans=${spans.length} emptySpan=${emptySpan} quote=${quote ? quote.length : 0} verdict=${CLEAN.statements[i].qcCard.displayVerdict}`
  );
}
console.log("S7 length", S7.length, "S10 length", S10.length);
