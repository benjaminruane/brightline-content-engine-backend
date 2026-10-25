/**
 * B423. Replay the stored clean HICL review. No model call.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildDraftMarks, draftFromStatementSpans } from "../../../lib/qc/draft-marks.mjs";
import { cardEvidenceFindings, displayedEvidenceProse, findingsByStatement, proseContradictsVerdict } from "../../../lib/qc/evidence-findings.mjs";
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

function quoteInSentence(quote, statement) {
  return typeof quote === "string" && quote.trim() !== "" && typeof statement === "string" && statement.includes(quote.trim());
}

function answered(card, mark, findings) {
  const state = card.statementVerdict?.state;
  const setBy = card.statementVerdict?.setBy;
  const belonging = (Array.isArray(findings) ? findings : []).filter((row) => quoteInSentence(row?.quote, card.statement));
  if (mark.severity === "missing" && (state === "not_in_source" || state === "conflicts")) return true;
  if (mark.kind === "fact" && mark.severity === "concern" && (state === "beyond" || state === "conflicts")) return true;
  if (mark.kind === "evidence") {
    if (setBy?.source === "action" && setBy?.rule === mark.rule) return true;
    return belonging.some((row) => row.quote === mark.surface);
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

function unfilteredFindings(entries) {
  const out = [];
  for (const entry of entries) {
    const rule = String(entry?.rule || "");
    if (rule !== "overreach_unsupported_causal" && rule !== "partial") continue;
    const quote = typeof entry?.thing1?.quote === "string" ? entry.thing1.quote.trim() : "";
    const note = typeof entry?.thing2 === "string" ? entry.thing2.trim() : "";
    out.push({ ref: entry.id, rule, quote, note, statementId: entry.statementId });
  }
  return out;
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
  next.concernStamp = cardEvidenceFindings(next, concerns);
  next.evidenceFindings = cardEvidenceFindings(next, [...concerns, ...(actions.entries || [])]);
  cards.push(next);
  statementRows.push({
    index: card.index,
    id: String(card.index),
    text,
    facts: facts.filter((fact) => fact.status === "not_found"),
    note,
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
let misplaced = 0;
let oldUnanswered = 0;
let oldMisplaced = 0;
let mapMismatch = 0;
const tripped = [];
const byStatement = findingsByStatement(statementRows, actions.entries || []);
for (const card of cards) {
  const marks = built.marks.filter((mark) => mark.statementIndex === card.index);
  const shown = card.evidenceFindings;
  const foreign = shown.filter((row) => !quoteInSentence(row.quote, card.statement));
  const open = marks.filter((mark) => !answered(card, mark, shown));
  unanswered += open.length;
  misplaced += foreign.length;
  const broadcast = unfilteredFindings(actions.entries || []);
  const oldForeign = broadcast.filter((row) => !quoteInSentence(row.quote, card.statement));
  oldMisplaced += oldForeign.length;
  oldUnanswered += marks.filter((mark) => {
    if (mark.kind !== "evidence") return !answered(card, mark, []);
    return !broadcast.some((row) => row.quote === mark.surface);
  }).length;
  const stage5 = typeof card.reasoningParagraph === "string" ? card.reasoningParagraph : "";
  const prose = card.displayedEvidenceProse;
  if ((card.statementVerdict.state === "beyond" || card.statementVerdict.state === "conflicts" || card.statementVerdict.state === "not_in_source") && proseContradictsVerdict(prose || "")) {
    tripped.push({ index: card.index, text: prose });
  }
  if ((card.statementVerdict.state === "beyond" || card.statementVerdict.state === "conflicts") && proseContradictsVerdict(stage5) && prose === "") {
    tripped.push({ index: card.index, text: "(note withheld; stage 5 would have contradicted)" });
  }
  const mapped = byStatement[String(card.index)] || [];
  const shownQuotes = shown.map((row) => row.quote).sort().join("|");
  const mappedQuotes = mapped.map((row) => row.quote).sort().join("|");
  if (shownQuotes !== mappedQuotes) mapMismatch += 1;
  say(`S${card.index} ${card.statementVerdict.state} edge ${toneForStatementVerdict(card.statementVerdict)}`);
  say(`  prose: ${prose == null ? "(stage 5 kept)" : prose || "(nothing)"}`);
  say(`  concern stamp: ${card.concernStamp.length ? card.concernStamp.map((row) => row.quote).join(" | ") : "(empty)"}`);
  for (const mark of marks) {
    say(`  mark ${mark.surface} kind ${mark.kind || "(none)"} tone ${toneName(mark)} answered ${answered(card, mark, shown) ? "yes" : "NO"}`);
  }
  if (!shown.length) say("  finding: (none)");
  for (const finding of shown) {
    const onThisSentence = quoteInSentence(finding.quote, card.statement);
    say(`  finding ${finding.rule}: ${finding.quote}`);
    say(`    on this sentence: ${onThisSentence ? "yes" : "NO"}`);
  }
  if (foreign.length) say(`  misplaced: ${foreign.map((row) => row.ref).join(", ")}`);
  if (open.length) say(`  unanswered: ${open.map((mark) => mark.ref).join(", ")}`);
  if (shownQuotes !== mappedQuotes) say("  inventory map disagrees with the card list");
}
say("");
say(`Findings on a card they do not belong to: ${misplaced}`);
say(`Unanswered marks: ${unanswered}`);
say(`Old screen rule, findings on a card they do not belong to: ${oldMisplaced}`);
say(`Old screen rule, unanswered marks: ${oldUnanswered}`);
say("The B423 zero counted a mark answered when the finding was in the list attached to that card. It did not count a finding whose quote is absent from the card's sentence. The screen passed the whole inventory into every card, so each card held every finding and the unanswered count stayed zero. Replaying that rule on this payload is the old-screen pair above: unanswered stays zero while the refinancing note is on every card. The two counts above are separate. A finding whose quote is not in the sentence does not answer a mark, so adding it to every card cannot clear the unanswered count.");
say(`Contradiction guard trips: ${tripped.length}`);
for (const row of tripped) say(`  S${row.index} ${row.text}`);
say(`Concern stamp empty on ${cards.filter((card) => card.concernStamp.length === 0).length} of ${cards.length} cards.`);
say("The stamp is the concern list on the card, written before the revise-actions inventory exists. On this payload the causal concern is already on S1, so that stamp is not empty. The refinancing finding is not a concern. It is an inventory row, so it is absent from every stamp. The screen was not reading the stamp. It appended the whole inventory to every card.");
say("");
say("## Where the list is built");
say("");
say("The list is built in findingsByStatement, called from runActionList once the inventory exists, and returned as evidenceFindingsByStatement. The review-card field is left as the concern-only stamp. It is not the list the screen shows after the inventory arrives. Removing it would drop the causal finding for the moment before that response, and recheck would lose the finding for a sentence whose inventory row was discarded. A saved review with no map keeps an entry only when its statement id is that card.");
say("");
say("## Other run-wide lists");
say("");
say("Stage 6 still pastes the whole draft into the editorial prompt. That is model context, not a list copied onto each card. Not changed here. buildDraftMarks, attachActionListToStatement and attachDocumentFindings each keep an entry only for the statement it belongs to.");
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
if (unanswered !== 0 || misplaced !== 0 || mapMismatch !== 0) process.exitCode = 1;
if (oldMisplaced === 0 || oldUnanswered !== 0) process.exitCode = 1;
if (ledger.demands !== 3 || ledger.light !== 5 || ledger.quiet !== 30 || ledger.noise.length !== 0) process.exitCode = 1;
