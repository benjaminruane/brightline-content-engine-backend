/**
 * B420 recount from stored drafts. No model call.
 * Reading states: scripts/diagnostic/b403c/runs/reading.json
 * Card verdicts: scripts/diagnostic/b402/runs/reading.json
 * Owner's clean HICL: tests/fixtures/real-runs-2026-10-04-hicl/
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { noteEndorsement } from "../../../lib/qc/reading-contract.mjs";
import { CAUSAL_EVIDENCE_RULE, statementVerdict, toneForStatementVerdict } from "../../../lib/qc/statement-verdict.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const b403 = JSON.parse(readFileSync(path.join(root, "scripts/diagnostic/b403c/runs/reading.json"), "utf8"));
const b402 = JSON.parse(readFileSync(path.join(root, "scripts/diagnostic/b402/runs/reading.json"), "utf8"));
const hicReview = JSON.parse(readFileSync(path.join(root, "tests/fixtures/real-runs-2026-10-04-hicl/clean-review.json"), "utf8"));
const hicActions = JSON.parse(readFileSync(path.join(root, "tests/fixtures/real-runs-2026-10-04-hicl/clean-actions.json"), "utf8"));

function cardOf(statement) {
  return statement?.qcCard && typeof statement.qcCard === "object" ? statement.qcCard : statement;
}

function quietState(state) {
  return state === "nothing_to_raise" || state === "nothing_raised" || state == null;
}

function verdictFromStored(statement, entries) {
  const notFound = Array.isArray(statement.notFound) ? statement.notFound : [];
  const facts = notFound.map((surface) => ({ status: "not_found", surface: String(surface) }));
  if (facts.length === 0) facts.push({ status: "matched", surface: "" });
  const bucket = typeof statement.bucket === "string" ? statement.bucket : "none";
  const refused = Boolean(statement.withheldText) && !statement.shownNote;
  const note = refused ? { refused: true, bucket } : { bucket, text: statement.shownNote || "" };
  return statementVerdict({ facts, note, entries });
}

function entriesFor(text, actionEntries, concerns) {
  const fromActions = (actionEntries || []).filter((entry) => entry?.statement === text);
  const fromConcerns = (concerns || []).filter((concern) => concern);
  return [...fromConcerns, ...fromActions];
}

const b402ByKey = new Map();
for (const draft of b402.drafts || []) {
  for (const statement of draft.statements || []) {
    b402ByKey.set(`${draft.doc}|${draft.arm}|${statement.index}`, statement);
  }
}

const disagreements = [];
const stronger = [];
const ledger = { demands: 0, light: 0, quiet: 0, noise: [] };
const movers = [];
const noteChanges = [];

for (const draft of b403.drafts || []) {
  for (const statement of draft.statements || []) {
    const prior = b402ByKey.get(`${draft.doc}|${draft.arm}|${statement.index}`);
    const cardVerdict = prior?.displayVerdict || null;
    const reading = statement.sentenceState;
    const verdict = verdictFromStored(statement, []);
    const cardQuiet = cardVerdict === "supported_full" || cardVerdict === "supported";
    const readingQuiet = quietState(reading);
    const verdictQuiet = verdict.state === "nothing_raised";
    if (cardQuiet !== readingQuiet || (cardVerdict && !readingQuiet && cardQuiet)) {
      disagreements.push({
        where: `${draft.doc} ${draft.arm} S${statement.index}`,
        text: statement.text,
        card: cardVerdict,
        reading,
        now: verdict.state,
        setBy: verdict.setBy,
      });
    } else if (!cardQuiet && readingQuiet) {
      disagreements.push({
        where: `${draft.doc} ${draft.arm} S${statement.index}`,
        text: statement.text,
        card: cardVerdict,
        reading,
        now: verdict.state,
        setBy: verdict.setBy,
      });
    } else if (cardVerdict && cardQuiet !== verdictQuiet && readingQuiet !== verdictQuiet) {
      disagreements.push({
        where: `${draft.doc} ${draft.arm} S${statement.index}`,
        text: statement.text,
        card: cardVerdict,
        reading,
        now: verdict.state,
        setBy: verdict.setBy,
      });
    }
    const oldRank = reading === "not_in_source" || reading === "conflicts" ? 3 : reading === "beyond" ? 2 : 1;
    const newRank = verdict.state === "not_in_source" || verdict.state === "conflicts" ? 3 : verdict.state === "beyond" ? 2 : 1;
    if (newRank > oldRank) {
      stronger.push({
        where: `${draft.doc} ${draft.arm} S${statement.index}`,
        text: statement.text,
        from: reading,
        to: verdict.state,
        setBy: verdict.setBy,
      });
    }
    if (draft.arm === "clean") {
      ledger[verdict.tier] += 1;
      const firm = statement.ledger === "firm";
      if (verdict.tier === "demands" && !firm) {
        ledger.noise.push(`${draft.doc} S${statement.index} ledger=${statement.ledger} state=${verdict.state}`);
      }
      const oldTier = statement.tier;
      if (oldTier && oldTier !== verdict.tier) {
        movers.push({
          where: `${draft.doc} clean S${statement.index}`,
          ledger: statement.ledger,
          from: `${reading}/${oldTier}`,
          to: `${verdict.state}/${verdict.tier}`,
          text: statement.text,
        });
      }
    }
    const texts = [statement.shownNote, statement.withheldText].filter(Boolean);
    for (const text of texts) {
      const phrase = noteEndorsement(text);
      if (phrase) {
        noteChanges.push({
          where: `${draft.doc} ${draft.arm} S${statement.index}`,
          phrase,
          stored: Boolean(statement.shownNote),
          text,
        });
      }
    }
  }
}

const ownerStatements = hicReview.statements || hicReview.payload?.statements || [];
const owner = [];
for (const row of ownerStatements) {
  const card = cardOf(row);
  const text = card.statement || row.text || "";
  const concerns = Array.isArray(card.editorialConcerns) ? card.editorialConcerns : [];
  const actions = (hicActions.entries || []).filter((entry) => entry.statement === text);
  const readingRow = (b403.drafts || [])
    .find((draft) => draft.doc === "HICL" && draft.arm === "clean")
    ?.statements?.find((statement) => statement.text === text);
  const facts = [];
  if (readingRow) {
    for (const surface of readingRow.notFound || []) facts.push({ status: "not_found", surface: String(surface) });
  }
  if (facts.length === 0) facts.push({ status: "matched", surface: "" });
  const note = readingRow
    ? { bucket: readingRow.bucket || "none", text: readingRow.shownNote || "", refused: Boolean(readingRow.withheldText) && !readingRow.shownNote }
    : null;
  const entries = [...concerns, ...actions];
  const verdict = statementVerdict({ facts, note, entries });
  const edge = toneForStatementVerdict(verdict);
  const tint = verdict.state === "nothing_raised" ? null : verdict.state === "beyond" ? "amber" : "red";
  owner.push({
    index: card.index ?? row.id,
    text,
    displayVerdict: card.displayVerdict,
    cardTone: card.summaryClass?.cardTone || null,
    reading: readingRow?.sentenceState || null,
    concerns: concerns.map((concern) => concern.concernCode || concern.rule),
    actions: actions.map((entry) => `${entry.kind}:${entry.rule}`),
    verdict: verdict.state,
    tier: verdict.tier,
    setBy: verdict.setBy,
    edge,
    tint,
    line: verdict.state,
  });
}

const writerNotes = [];
for (const draft of b402.drafts || []) {
  writerNotes.push({
    doc: draft.doc,
    arm: draft.arm,
    present: typeof draft.writerFeedback === "string" && draft.writerFeedback.length > 0,
    phrase: draft.writerFeedback ? noteEndorsement(draft.writerFeedback) : null,
  });
}

console.log(JSON.stringify({
  disagreements,
  stronger,
  ledger,
  movers,
  noteChanges,
  owner,
  writerNotes,
}, null, 2));
