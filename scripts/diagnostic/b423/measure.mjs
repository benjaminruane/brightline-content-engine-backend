/**
 * B423. Replay the stored clean HICL review. No model call.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildDraftMarks, draftFromStatementSpans } from "../../../lib/qc/draft-marks.mjs";
import { cardEvidenceFindings, displayedEvidenceProse, proseContradictsVerdict } from "../../../lib/qc/evidence-findings.mjs";
import { summariseReview } from "../../../lib/qc/review-summary.mjs";
import { statementVerdict, toneForStatementVerdict, editorialVerdictWithoutCausal } from "../../../lib/qc/statement-verdict.mjs";
import { summaryBulletsFromReview } from "../../../lib/qc/summary-bullets.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const review = JSON.parse(readFileSync(path.join(root, "tests/fixtures/real-runs-2026-10-04-hicl/clean-review.json"), "utf8"));
const actions = JSON.parse(readFileSync(path.join(root, "tests/fixtures/real-runs-2026-10-04-hicl/clean-actions.json"), "utf8"));
const reading = JSON.parse(readFileSync(path.join(root, "scripts/diagnostic/b403c/runs/reading.json"), "utf8"));
const clean = reading.drafts.find((draft) => draft.doc === "HICL" && draft.arm === "clean");
const byText = new Map((clean?.statements || []).map((row) => [row.text, row]));
const options = review.meta.reviewOptions;

function factsFor(stored, text) {
  const rows = [];
  for (const raw of stored?.notFound || []) {
    const label = String(raw);
    const surface = label.includes(":") ? label.slice(label.indexOf(":") + 1) : label;
    const at = text.indexOf(surface);
    if (at < 0) continue;
    rows.push({ status: "not_found", surface, start: at, end: at + surface.length, kind: label.split(":")[0] || "fact" });
  }
  if (rows.length === 0) rows.push({ status: "matched", surface: "" });
  return rows;
}

function noteFor(stored) {
  if (!stored) return null;
  return {
    bucket: stored.bucket || "none",
    text: stored.shownNote || "",
    refused: Boolean(stored.withheldText) && !stored.shownNote,
  };
}

function toneName(mark) {
  if (mark.severity === "missing") return "conflict";
  if (!mark.kind) return "fallback";
  if (mark.kind === "fact" && mark.severity === "concern") return "beyond";
  if (mark.kind === "evidence") return "beyond";
  if (mark.kind === "editorial" || mark.kind === "style" || mark.kind === "compliance") return "wording";
  return "none";
}

function answered(card, mark, findings) {
  const state = card.statementVerdict?.state;
  const setBy = card.statementVerdict?.setBy;
  if (mark.severity === "missing" && (state === "not_in_source" || state === "conflicts")) return true;
  if (mark.kind === "fact" && mark.severity === "concern" && (state === "beyond" || state === "conflicts")) return true;
  if (mark.kind === "evidence") {
    if (setBy?.source === "action" && setBy?.rule === mark.rule) return true;
    return findings.some((row) => row.ref === mark.ref || (row.rule === mark.rule && row.quote === mark.surface));
  }
  if (mark.kind === "editorial" || mark.kind === "style" || mark.kind === "compliance") {
    const concerns = [
      ...(Array.isArray(card.editorialConcerns) ? card.editorialConcerns : []),
      ...(Array.isArray(card.complianceConcerns) ? card.complianceConcerns : []),
    ];
    return concerns.some((concern) => String(concern?.concernCode || concern?.rule || "") === mark.rule);
  }
  return false;
}

const beforeCards = review.statements.map((row) => row.qcCard);
const before = summariseReview(beforeCards, options);
const cards = [];
const statementRows = [];
for (const row of review.statements) {
  const card = row.qcCard;
  const text = card.statement || row.text || "";
  const stored = byText.get(text);
  const facts = factsFor(stored, text);
  const note = noteFor(stored);
  const concerns = Array.isArray(card.editorialConcerns) ? card.editorialConcerns : [];
  const verdict = statementVerdict({ facts, note, entries: concerns });
  const next = {
    ...card,
    statement: text,
    statementVerdict: verdict,
    readingNote: note,
    editorialVerdict: editorialVerdictWithoutCausal(concerns, card.editorialVerdict),
  };
  const prose = displayedEvidenceProse(verdict.state, note?.text);
  if (prose !== null) next.displayedEvidenceProse = prose;
  const entryRows = (actions.entries || []).filter((entry) => entry.statementId === String(card.index ?? row.id) || entry.statement === text);
  next.evidenceFindings = cardEvidenceFindings(next, [...concerns, ...entryRows]);
  cards.push(next);
  statementRows.push({
    index: card.index,
    id: String(card.index),
    text,
    facts: facts.filter((fact) => fact.status === "not_found"),
    qcCard: next,
  });
}
const after = summariseReview(cards, options);
const afterBullets = summaryBulletsFromReview(after);
const draft = draftFromStatementSpans(review.statements);
const built = buildDraftMarks({ draft, statements: statementRows, entries: actions.entries || [] });

const lines = [];
const say = (line = "") => lines.push(line);
say("# B423. One axis");
say("");
say("Stored clean HICL review and reading. No model call. USD 0.");
say("");
say("## Summary");
say("");
say(`Before, from displayVerdict: confirmed ${before.evidence.confirmed}, partial ${before.evidence.partial}, conflicting ${before.evidence.conflicting}, not supported ${before.evidence.notSupported}. Readiness ${before.readiness}. The stored stamp is the same label.`);
say(`After, from statementVerdict: confirmed ${after.evidence.confirmed}, partial ${after.evidence.partial}, conflicting ${after.evidence.conflicting}, not supported ${after.evidence.notSupported}. Readiness ${after.readiness}.`);
say(`Bullets: ${afterBullets.length ? afterBullets.join(" | ") : "(none)"}`);
say(`All-claims-backed bullet: ${afterBullets.some((line) => line.includes("All claims are backed by sources")) ? "yes" : "no"}`);
say("");
say("## Statements");
say("");

let unanswered = 0;
const tripped = [];
for (const card of cards) {
  const marks = built.marks.filter((mark) => mark.statementIndex === card.index);
  const open = marks.filter((mark) => !answered(card, mark, card.evidenceFindings));
  unanswered += open.length;
  const stage5 = typeof card.reasoningParagraph === "string" ? card.reasoningParagraph : "";
  const shown = card.displayedEvidenceProse;
  if ((card.statementVerdict.state === "beyond" || card.statementVerdict.state === "conflicts") && proseContradictsVerdict(shown || "")) {
    tripped.push({ index: card.index, text: shown });
  }
  if ((card.statementVerdict.state === "beyond" || card.statementVerdict.state === "conflicts") && proseContradictsVerdict(stage5) && shown === "") {
    tripped.push({ index: card.index, text: "(note withheld; stage 5 would have contradicted)" });
  }
  say(`S${card.index} ${card.statementVerdict.state} edge ${toneForStatementVerdict(card.statementVerdict)}`);
  say(`  prose: ${shown == null ? "(stage 5 kept)" : shown || "(nothing)"}`);
  for (const mark of marks) {
    say(`  mark ${mark.surface} kind ${mark.kind || "(none)"} tone ${toneName(mark)} answered ${answered(card, mark, card.evidenceFindings) ? "yes" : "NO"}`);
  }
  for (const finding of card.evidenceFindings) {
    say(`  finding ${finding.rule}: ${finding.quote}`);
  }
  if (open.length) say(`  unanswered: ${open.map((mark) => mark.ref).join(", ")}`);
}
say("");
say(`Unanswered marks: ${unanswered}`);
say(`Contradiction guard trips: ${tripped.length}`);
for (const row of tripped) say(`  S${row.index} ${row.text}`);
say("");

const ledger = { demands: 0, light: 0, quiet: 0, noise: [] };
for (const draftRow of reading.drafts || []) {
  if (draftRow.arm !== "clean") continue;
  for (const statement of draftRow.statements || []) {
    const facts = (statement.notFound || []).map((surface) => ({ status: "not_found", surface: String(surface) }));
    if (facts.length === 0) facts.push({ status: "matched", surface: "" });
    const verdict = statementVerdict({
      facts,
      note: { bucket: statement.bucket || "none", text: statement.shownNote || "", refused: Boolean(statement.withheldText) && !statement.shownNote },
      entries: [],
    });
    ledger[verdict.tier] += 1;
    if (verdict.tier === "demands" && statement.ledger !== "firm") {
      ledger.noise.push(`${draftRow.doc} S${statement.index}`);
    }
  }
}
say("## Clean ledger");
say("");
say(`demands ${ledger.demands}, light ${ledger.light}, quiet ${ledger.quiet}, noise in demands ${ledger.noise.length}.`);
if (ledger.noise.length) say(ledger.noise.join(", "));
say("Bar unchanged: demands 3, light 5, quiet 30, noise in demands 0.");
say("");

const report = lines.join("\n");
writeFileSync(path.join(root, "scripts/diagnostic/b423/report.md"), report);
console.log(report);
if (unanswered !== 0) process.exitCode = 1;
if (ledger.demands !== 3 || ledger.light !== 5 || ledger.quiet !== 30 || ledger.noise.length !== 0) process.exitCode = 1;
