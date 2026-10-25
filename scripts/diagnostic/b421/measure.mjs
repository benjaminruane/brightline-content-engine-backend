/**
 * B421. HICL dirty table from stored cards and the stored reading.
 * No model call.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { combinedVerdict } from "../../../lib/qc/combined-verdict.mjs";
// rank is local so the script does not depend on a frontend module
import { buildDraftMarks, draftFromStatementSpans } from "../../../lib/qc/draft-marks.mjs";
import { dropForwardLookingInExcerpt } from "../../../lib/qc/editorial-compliance-reviewer.mjs";
import { draftSideProposal, tallyDraftSide } from "../../../lib/qc/draft-side-proposal.mjs";
import { statementVerdict } from "../../../lib/qc/statement-verdict.mjs";
import * as passiveGate from "../../../lib/qc/passive-voice-gate.mjs";

const spanIsPassive = passiveGate[Object.keys(passiveGate)[0]];
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const review = JSON.parse(readFileSync(path.join(root, "tests/fixtures/real-runs-2026-10-04-hicl/doc-review.json"), "utf8"));
const reading = JSON.parse(readFileSync(path.join(root, "scripts/diagnostic/b403c/runs/reading.json"), "utf8"));
const dirty = reading.drafts.find((draft) => draft.doc === "HICL" && draft.arm === "doctored");
const byIndex = new Map((dirty?.statements || []).map((row) => [row.index, row]));

function verdictFromStored(statement, entries) {
  const notFound = Array.isArray(statement?.notFound) ? statement.notFound : [];
  const facts = notFound.map((surface) => ({ status: "not_found", surface: String(surface) }));
  if (facts.length === 0) facts.push({ status: "matched", surface: "" });
  const bucket = typeof statement?.bucket === "string" ? statement.bucket : "none";
  const refused = Boolean(statement?.withheldText) && !statement?.shownNote;
  const note = refused ? { refused: true, bucket } : { bucket, text: statement?.shownNote || "" };
  return statementVerdict({ facts, note, entries });
}

const RANK = {
  not_in_source: 0,
  conflicts: 1,
  compliance_risk: 2,
  beyond: 3,
  wording: 4,
  nothing_raised: 5,
};

const statements = review.statements || [];
const draft = draftFromStatementSpans(statements);
const markEntries = [];
const rows = [];
const passiveDrops = [];
const forwardDrops = [];
const tally = { offered: 0, a: 0, b: 0, c: 0, d: 0, e: 0 };

for (const row of statements) {
  const card = row.qcCard || {};
  const index = card.index ?? row.index;
  const text = card.statement || row.text || "";
  const stored = byIndex.get(index);
  const editorial = Array.isArray(card.editorialConcerns) ? card.editorialConcerns : [];
  const compliance = Array.isArray(card.complianceConcerns) ? card.complianceConcerns : [];
  const verdict = verdictFromStored(stored, editorial);
  const combined = combinedVerdict({
    verdict,
    editorialConcerns: editorial,
    complianceVerdict: card.complianceVerdict,
    complianceConcerns: compliance,
  });
  const localTally = tallyDraftSide([...editorial, ...compliance], text);
  tally.offered += localTally.offered;
  for (const key of ["a", "b", "c", "d", "e"]) tally[key] += localTally[key];
  const offers = [];
  for (const concern of [...editorial, ...compliance]) {
    const span = Array.isArray(concern.span) ? concern.span[0] : concern.span;
    const cited = span && Number.isInteger(span.startChar) ? text.slice(span.startChar, span.endChar) : "";
    if ((concern.concernCode || concern.rule) === "active_voice_preference" && cited && !spanIsPassive(cited)) {
      passiveDrops.push({ index, cited });
    }
    const offer = draftSideProposal({ concern, statementText: text });
    if (offer.offered) offers.push(offer.substitution.replacement);
    if (span && Number.isInteger(span.startChar)) {
      markEntries.push({
        id: `S${index}:${concern.concernCode || concern.rule}`,
        statementId: String(index),
        statement: text,
        rule: concern.concernCode || concern.rule || "",
        thing1: { quote: cited, startChar: span.startChar, endChar: span.endChar },
      });
    }
  }
  const forward = dropForwardLookingInExcerpt(compliance, {
    statementText: text,
    primaryExcerpt: card.primaryExcerpt,
    conflictExcerpt: card.conflictExcerpt,
  });
  if (forward.dropped.length) forwardDrops.push({ index, count: forward.dropped.length });
  rows.push({
    index,
    text,
    statementVerdict: verdict.state,
    combined: combined.state,
    edge: combined.tone,
    rank: RANK[combined.state],
    offers,
    complianceVerdict: card.complianceVerdict,
  });
}

const built = buildDraftMarks({
  draft,
  statements: statements.map((row, index) => ({
    index: row.qcCard?.index ?? index,
    id: String(row.qcCard?.index ?? index),
    text: row.qcCard?.statement || row.text,
    facts: [],
  })),
  entries: markEntries,
});

const marksBy = new Map();
for (const mark of built.marks) {
  const list = marksBy.get(mark.statementIndex) || [];
  list.push(`${mark.surface} [${mark.origin}/${mark.rule || mark.severity}]`);
  marksBy.set(mark.statementIndex, list);
}

rows.sort((a, b) => a.rank - b.rank || a.index - b.index);
console.log(JSON.stringify({
  order: rows.map((row) => row.index),
  rows: rows.map((row) => ({
    ...row,
    text: row.text.slice(0, 110),
    marks: marksBy.get(row.index) || [],
  })),
  tally,
  passiveDrops,
  forwardDrops,
  droppedMarks: built.droppedCount,
}, null, 2));
