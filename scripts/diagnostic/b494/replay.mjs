/**
 * B494. Replay the stored B490 passes through the current labels.
 * The empty-reason gate counts every light or demands card, including Needs a look.
 * No model call.
 *
 *   node scripts/diagnostic/b494/replay.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { uncheckedLook } from "../../../lib/qc/contradiction-floor.mjs";
import { NOT_CHECKED_SENTENCES } from "../../../lib/qc/not-reviewed-reason.mjs";
import { confirmingPassageVerdict } from "../../../lib/qc/pipeline-v4/confirming-passage-disagrees.mjs";
import { readerEvidenceSentence } from "../../../lib/qc/reader-reason.mjs";
import { buildFacts } from "../../../lib/qc/reading-contract.mjs";
import { shownLabel, shownState, shownTier, shownVerdict } from "../../../lib/qc/shown-verdict.mjs";
import { statementVerdict } from "../../../lib/qc/statement-verdict.mjs";
import { evidenceQuietOf, layerSpoken, tallyLeaveAlone } from "../lib/leave-alone.mjs";
import { loadAllFixtures } from "../lib/fixtures.mjs";
import { loadPipelineSources } from "../lib/sources.mjs";
import { flattenStatements, joinKey, mapGroupA, padFixtureId } from "../accuracy/lib.mjs";
import { normalizeLabelsDoc } from "../accuracy/load-labels.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PASSES = [
  ["pass 1", path.join(__dirname, "../b490/pass-1.json")],
  ["pass 2", path.join(__dirname, "../b490/pass-2.json")],
];
const PRIOR = path.join(__dirname, "../b491/RESULT.md");
const RESULT = path.join(__dirname, "RESULT.md");
const ACCURACY = path.join(__dirname, "../accuracy");
const FRONT_HEADER = path.resolve(__dirname, "../../../../brightline-content-engine-frontend/src/modules/reading/attentionHeader.js");
const FAULTY = new Set(["conflicting", "no_support"]);
const UNRECORDED = "Which part was not recorded";

export function pad(id) {
  return String(id).padStart(2, "0");
}

export function keyOf(card) {
  return `${pad(card.fixtureId)}:${card.index}`;
}

export function cardOf(cards, id, index) {
  const want = Number(index);
  return cards.find((card) => pad(card.fixtureId) === pad(id) && Number(card.index) === want);
}

export function loadCards(file) {
  const doc = JSON.parse(readFileSync(file, "utf8"));
  const cards = Array.isArray(doc.cards) ? doc.cards : [];
  if (!cards.length) throw new Error(`b494 replay: no cards in ${file}`);
  return cards;
}

export function corpusOnly(cards) {
  return cards.filter((card) => Number(pad(card.fixtureId)) <= 20);
}

function excerptsOf(card) {
  return [card.primaryExcerpt, card.conflictExcerpt].filter((text) => typeof text === "string" && text.trim());
}

export function afterOf(card) {
  const before = card.displayVerdict;
  if (before !== "conflict") return { display: before };
  const matches = Array.isArray(card.matchExplanations) ? card.matchExplanations : [];
  const flipped = matches.filter((row) => row.classification === "conflicting" && row.writtenFor === "confirmed");
  if (!flipped.length || !excerptsOf(card).length) return { display: before };
  const hits = excerptsOf(card).map((text) => confirmingPassageVerdict(card.statement, text)).filter((row) => row.demoteTo);
  if (hits.length) return { display: before };
  const next = matches.map((row) => (
    row.classification === "conflicting" && row.writtenFor === "confirmed"
      ? { ...row, classification: "confirmed" }
      : row
  ));
  if (next.some((row) => row.classification === "conflicting")) return { display: before };
  if (next.some((row) => row.classification === "partially_confirmed")) return { display: "supported_partial" };
  if (next.some((row) => row.classification === "confirmed")) return { display: "supported_full" };
  return { display: "not_supported" };
}

function noteRefused(card) {
  return (card.silences || []).some((row) => row?.id === "note_refused");
}

export function verdictOf(card, facts, displayVerdict) {
  const note = card.readingNote
    ? { bucket: card.readingNote.bucket, text: card.readingNote.text, refused: noteRefused(card) }
    : null;
  return shownVerdict(statementVerdict({ facts, note, entries: [] }), displayVerdict);
}

export function raised(card) {
  return Object.values(layerSpoken(card)).some((layer) => layer.raised);
}

export function readingSourceBody(sources) {
  const list = Array.isArray(sources) ? sources : null;
  if (!list || list.length === 0) throw new Error("b494 replay: source text is missing");
  const texts = list.map((source, index) => {
    if (typeof source === "string") return source;
    if (!source || typeof source.text !== "string") throw new Error(`b494 replay: source ${index} has no text`);
    return source.text;
  });
  if (texts.every((text) => text.trim() === "")) throw new Error("b494 replay: source text is missing");
  return texts.join("\n");
}

function quietOnCorrect(card, label) {
  if (FAULTY.has(label) || label === "partially_confirmed") return false;
  return card.displayVerdict === "supported_full"
    && (card.sentenceState === "nothing_raised" || card.sentenceState === "nothing_to_raise");
}

function countIn(line, pattern) {
  const match = String(line || "").match(pattern);
  return match ? Number(match[1]) : 0;
}

function headerMismatches(cards, attentionHeader) {
  const by = new Map();
  for (const card of cards) {
    const id = pad(card.fixtureId);
    if (!by.has(id)) by.set(id, []);
    by.get(id).push(card);
  }
  const bad = [];
  for (const [id, rows] of by) {
    const line = attentionHeader(rows) || "";
    let conflicts = 0;
    let looks = 0;
    let light = 0;
    let facts = 0;
    let across = 0;
    let absent = 0;
    for (const row of rows) {
      const label = shownLabel(row);
      if (label === "Conflicts with the source") conflicts += 1;
      if (label === "Needs a look") looks += 1;
      if (label === "Goes beyond the source" || label === "Partly in the source") light += 1;
      if (label !== "Not in the source") continue;
      const list = Array.isArray(row.facts) ? row.facts : (Array.isArray(row.readingFacts) ? row.readingFacts : []);
      const missing = list.filter((fact) => fact?.status === "not_found").length;
      if (missing > 0) {
        facts += missing;
        across += 1;
      } else absent += 1;
    }
    const problems = [];
    if (countIn(line, /(\d+) statements? conflict/) !== conflicts) problems.push("conflict");
    if (countIn(line, /(\d+) statements? needs? a look/) !== looks) problems.push("look");
    if (countIn(line, /(\d+) worth a glance/) !== light) problems.push("glance");
    if (countIn(line, /(\d+) facts? (?:is|are) not in the source/) !== facts) problems.push("facts");
    if (countIn(line, /(\d+) statements? (?:is|are) not in the source/) !== absent) problems.push("absent");
    if (line.includes("across") && countIn(line, /across (\d+) of your/) !== across) problems.push("across");
    if (line.includes("not in the source") && absent + facts === 0) problems.push("phantom");
    if (problems.length) bad.push(`${id} ${problems.join(",")}`);
  }
  return bad;
}

/** The card as B491 labelled it. Bucket none did not quiet an unrecorded partial. */
function cardAsB491(card) {
  const bucket = String(card?.readingNote?.bucket || "").toLowerCase();
  if (bucket !== "none") return card;
  return { ...card, readingNote: { ...card.readingNote, bucket: "other" } };
}

function reasonText(card) {
  return readerEvidenceSentence(card) || "";
}

/** The reason B491 showed. Needs a look had a sentence only when the check recorded one on a quiet card. */
function reasonB491(card) {
  const earlier = cardAsB491(card);
  if ((shownLabel(earlier) || "") !== (shownLabel(card) || "")) return reasonText(earlier);
  if (shownState(card) === "note_withheld" && !uncheckedLook(card)) return "";
  return reasonText(card);
}

export function shownOf(card) {
  const state = shownState(card);
  return {
    state,
    label: shownLabel(card) || "",
    tier: shownTier(state) || "",
  };
}

/** The confirmed statements the leave-alone gate scores, rebuilt the same way as the replay. */
export function leaveAloneCards(cards, labels, sourcesByFixture) {
  const corpusCards = corpusOnly(cards);
  const judged = corpusCards.map((card) => ({ card, after: afterOf(card) }));
  const afterByJoin = new Map(judged.map((row) => [joinKey(row.card.fixtureId, row.card.statement, row.card.occurrence), row]));
  const confirmedAfter = [];
  for (const row of labels) {
    if (row.kind && row.kind !== "statement") continue;
    if (row.label !== "confirmed") continue;
    const judgedRow = afterByJoin.get(joinKey(row.fixtureId, row.statementText, row.occurrence));
    if (!judgedRow) continue;
    const sources = sourcesByFixture.get(pad(judgedRow.card.fixtureId));
    if (!sources) throw new Error(`b494 replay: no sources for ${judgedRow.card.fixtureId}`);
    const facts = buildFacts({
      statement: judgedRow.card.statement,
      draft: judgedRow.card.statement,
      sourceText: readingSourceBody(sources),
    });
    const verdict = verdictOf(judgedRow.card, facts, judgedRow.after.display);
    const card = {
      ...judgedRow.card,
      displayVerdict: judgedRow.after.display,
      sentenceState: verdict.state,
      tier: verdict.tier,
      statementVerdict: verdict,
    };
    confirmedAfter.push({ key: keyOf(card), card, quiet: evidenceQuietOf(card) });
  }
  return confirmedAfter;
}

/** Light or demands, including Needs a look, with no shown reason. */
export function emptyReasonKeys(cards) {
  const empty = [];
  for (const card of cards) {
    const tier = shownTier(shownState(card));
    if (tier !== "light" && tier !== "demands") continue;
    if (!reasonText(card)) empty.push(keyOf(card));
  }
  return empty;
}

function unrecordedRaised(cards, reasonFor) {
  const keys = [];
  for (const card of cards) {
    const viewed = reasonFor === reasonB491 ? cardAsB491(card) : card;
    const tier = shownTier(shownState(viewed));
    if (tier !== "light" && tier !== "demands") continue;
    if (reasonFor(card).includes(UNRECORDED)) keys.push(keyOf(card));
  }
  return keys;
}

function missingReasonCodes(cards) {
  const rows = [];
  for (const card of cards) {
    if (shownState(card) !== "note_withheld") continue;
    const code = typeof card.evidenceNotReviewedReason === "string" ? card.evidenceNotReviewedReason.trim() : "";
    if (!Object.hasOwn(NOT_CHECKED_SENTENCES, code)) rows.push(`${keyOf(card)} ${code || "(empty)"}`);
  }
  return rows;
}

export async function loadGateContext() {
  const labelsDoc = JSON.parse(readFileSync(path.join(ACCURACY, "labels.json"), "utf8"));
  const design = JSON.parse(readFileSync(path.join(ACCURACY, "group-a-design.json"), "utf8"));
  const statements = JSON.parse(readFileSync(path.join(ACCURACY, "statements.json"), "utf8"));
  const labels = normalizeLabelsDoc({ labels: labelsDoc.labels });
  const mapped = mapGroupA(flattenStatements(statements), design);
  const labelByJoin = new Map();
  for (const row of labels) {
    if (row.kind && row.kind !== "statement") continue;
    labelByJoin.set(joinKey(row.fixtureId, row.statementText, row.occurrence), row.label);
  }
  const fixtures = await loadAllFixtures();
  const sourcesByFixture = new Map();
  for (const fixture of fixtures) {
    const id = padFixtureId(fixture.data.id);
    if (Number(id) > 20) continue;
    sourcesByFixture.set(id, await loadPipelineSources(fixture.data.sources || []));
  }
  const { attentionHeader } = await import(pathToFileURL(FRONT_HEADER).href);
  return { labels, design, mapped, labelByJoin, sourcesByFixture, attentionHeader };
}

function priorValue(text, label) {
  const line = text.split("\n").find((row) => row.startsWith(label));
  if (!line) throw new Error(`b494 replay: B491 result has no line for ${label}`);
  const match = line.match(/:\s*(\S+)/);
  if (!match) throw new Error(`b494 replay: B491 result line is unreadable: ${line}`);
  return match[1];
}

async function main() {
  const priorText = readFileSync(PRIOR, "utf8");
  const prior = {
    catch: priorValue(priorText, "catch:"),
    group: priorValue(priorText, "group A:"),
    leave: priorValue(priorText, "leave-alone:"),
    combined: priorValue(priorText, "combined quiet:"),
    quiet: priorValue(priorText, "quiet on correct:"),
    empty: priorValue(priorText, "raised cards with an empty reason:"),
    headers: priorValue(priorText, "headers not matching the shown labels:"),
  };
  const { labels, design, mapped, labelByJoin, sourcesByFixture, attentionHeader } = await loadGateContext();
  const lines = [];
  let failed = false;

  for (const [name, file] of PASSES) {
    const cards = loadCards(file);
    const corpusCards = corpusOnly(cards);
    const judged = corpusCards.map((card) => ({ card, after: afterOf(card) }));
    const afterByJoin = new Map(judged.map((row) => [joinKey(row.card.fixtureId, row.card.statement, row.card.occurrence), row]));
    let faultyN = 0;
    let faultyRaised = 0;
    for (const row of labels) {
      if (row.kind && row.kind !== "statement") continue;
      if (!FAULTY.has(row.label)) continue;
      faultyN += 1;
      const judgedRow = afterByJoin.get(joinKey(row.fixtureId, row.statementText, row.occurrence));
      const card = judgedRow ? { ...judgedRow.card, displayVerdict: judgedRow.after.display } : null;
      if (card && raised(card)) faultyRaised += 1;
    }
    let groupRaised = 0;
    for (const fault of design.faults) {
      const mappedRow = mapped.mapping.find((item) => item.id === fault.id);
      const key = mappedRow?.keys?.[0] || null;
      const judgedRow = key ? afterByJoin.get(key) : null;
      const afterCard = judgedRow ? { ...judgedRow.card, displayVerdict: judgedRow.after.display } : null;
      if (afterCard && raised(afterCard)) groupRaised += 1;
    }
    const confirmedAfter = leaveAloneCards(cards, labels, sourcesByFixture).map((row) => row.card);
    const leave = tallyLeaveAlone(confirmedAfter);
    let quietCorrect = 0;
    for (const card of corpusCards) {
      const label = labelByJoin.get(joinKey(card.fixtureId, card.statement, card.occurrence));
      if (quietOnCorrect(card, label)) quietCorrect += 1;
    }
    const empty = emptyReasonKeys(cards);
    const unrecorded = unrecordedRaised(cards, reasonText);
    const unrecordedThen = unrecordedRaised(cards, reasonB491);
    const missing = missingReasonCodes(cards);
    const headers = headerMismatches(cards, attentionHeader);
    const changes = [];
    for (const card of cards) {
      const beforeLabel = shownLabel(cardAsB491(card)) || "";
      const afterLabel = shownLabel(card) || "";
      const beforeReason = reasonB491(card);
      const afterReason = reasonText(card);
      if (beforeLabel === afterLabel && beforeReason === afterReason) continue;
      changes.push([
        keyOf(card),
        `label: ${beforeLabel} -> ${afterLabel}`,
        `reason: ${beforeReason || "(empty)"} -> ${afterReason || "(empty)"}`,
      ].join("\n"));
    }
    if (faultyRaised !== 13 || groupRaised !== 11 || empty.length || unrecorded.length || missing.length) failed = true;
    lines.push(name);
    lines.push(`catch: ${faultyRaised}/${faultyN} (B491 ${prior.catch})`);
    lines.push(`group A: ${groupRaised}/${design.faults.length} (B491 ${prior.group})`);
    lines.push(`leave-alone: ${leave.evidenceLeaveAlone}/${leave.n} (B491 ${prior.leave})`);
    lines.push(`combined quiet: ${leave.combinedQuiet}/${leave.n} (B491 ${prior.combined})`);
    lines.push(`quiet on correct: ${quietCorrect} (B491 ${prior.quiet})`);
    lines.push(`raised cards with an empty reason: ${empty.length} (B491 ${prior.empty})`);
    if (empty.length) for (const key of empty) lines.push(key);
    lines.push(`Which part was not recorded on a raised card: ${unrecorded.length} (B491 ${unrecordedThen.length})`);
    if (unrecorded.length) for (const key of unrecorded) lines.push(key);
    lines.push(`headers not matching the shown labels: ${headers.length} (B491 ${prior.headers})`);
    if (headers.length) for (const row of headers) lines.push(row);
    lines.push("reason codes with no sentence");
    if (!missing.length) lines.push("none");
    for (const row of missing) lines.push(row);
    lines.push("label or reason changes from B491");
    lines.push(String(changes.length));
    if (!changes.length) lines.push("none");
    for (const row of changes) lines.push(row);
    lines.push("");
  }

  writeFileSync(RESULT, `${lines.join("\n")}\n`);
  const printed = lines.filter((line) => (
    line.startsWith("pass ") || line.startsWith("catch") || line.startsWith("group")
    || line.startsWith("leave-alone") || line.startsWith("combined") || line.startsWith("quiet on")
    || line.startsWith("raised cards") || line.startsWith("Which part") || line.startsWith("headers")
    || line.startsWith("reason codes") || /^\d\d:\d+/.test(line)
  ));
  console.log(printed.join("\n"));
  if (failed) {
    console.error("STOP a required gate failed");
    process.exitCode = 2;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
