/**
 * B492. Read the stored B490 passes through the current code.
 * No model call. Imports the B491 replay. Does not copy it.
 *
 *   node scripts/diagnostic/b492/diag.mjs
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { floorState, uncheckedLook } from "../../../lib/qc/contradiction-floor.mjs";
import { splitSentences } from "../../../lib/qc/card-honesty.mjs";
import { PARTIAL_UNRECORDED } from "../../../lib/qc/partial-sentence.mjs";
import { readerEvidenceSentence } from "../../../lib/qc/reader-reason.mjs";
import { bothReadingsSupport, completionEffect, readingState, shownState } from "../../../lib/qc/shown-verdict.mjs";
import { transactionDemand } from "../../../lib/qc/transaction-state.mjs";
import { layerSpoken } from "../lib/leave-alone.mjs";
import {
  REASON_GATE_STATES,
  cardOf,
  emptyReasonKeys,
  keyOf,
  leaveAloneCards,
  loadCards,
  loadGateContext,
  shownOf,
} from "../b491/replay.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const B486 = path.join(__dirname, "../b486/pass-1.json");
const PASS1 = path.join(__dirname, "../b490/pass-1.json");
const PASS2 = path.join(__dirname, "../b490/pass-2.json");
const OUT = path.join(__dirname, "DIAG.md");
const FILE_NAME = /\b\d{2}[a-z]?_[A-Za-z0-9_.-]+\b/;
const LOUD = new Set(["conflicts", "not_in_source", "note_withheld"]);
const QUIET = new Set(["nothing_raised", "nothing_to_raise"]);

function oneLine(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function wordingUnrecordedQuiet(card) {
  const bucket = String(card?.readingNote?.bucket || "").toLowerCase();
  if (bucket !== "wording") return false;
  const prose = typeof card?.displayedEvidenceProse === "string" ? card.displayedEvidenceProse.trim() : "";
  return prose === PARTIAL_UNRECORDED;
}

function revisionRaises(card) {
  const notes = card?.supersededSourceNotes;
  const note = Array.isArray(notes) ? String(notes[0] || "").trim() : "";
  return note.startsWith("The later source ");
}

/** The first branch shownStateBase takes, then completionEffect when it replaces that state. */
function shownBranch(card) {
  let branch = "";
  let base = "";
  if (bothReadingsSupport(card)) {
    branch = "bothReadingsSupport";
    base = "nothing_raised";
  } else if (wordingUnrecordedQuiet(card)) {
    branch = "wordingUnrecordedQuiet";
    base = "nothing_raised";
  } else {
    const floored = floorState(card);
    if (floored) {
      branch = "floorState";
      base = floored;
    } else if (uncheckedLook(card)) {
      branch = "uncheckedLook";
      base = "note_withheld";
    } else if (transactionDemand(card)) {
      branch = "transactionDemand";
      base = "conflicts";
    } else {
      const state = readingState(card);
      if (!QUIET.has(state)) {
        branch = "readingState";
        base = state;
      } else if (revisionRaises(card)) {
        branch = "revisionRaises";
        base = "conflicts";
      } else {
        const display = String(card?.displayVerdict ?? "").toLowerCase().trim();
        if (display === "conflict" || display === "conflicts" || display === "conflicting") {
          branch = "displayVerdict";
          base = "conflicts";
        } else if (display === "not_supported" || display === "no_clear_support") {
          branch = "displayVerdict";
          base = "not_in_source";
        } else if (display === "supported_partial" || display === "partially_confirmed") {
          branch = "displayVerdict";
          base = "partial";
        } else {
          branch = "readingState";
          base = state;
        }
      }
    }
  }
  const live = shownState(card);
  const status = completionEffect(card);
  let state = base;
  let name = `${branch} -> ${base}`;
  if (status && !LOUD.has(base)) {
    state = status;
    name = `${branch} -> ${base}, then completionEffect ${status}`;
  } else if (status) {
    name = `${branch} -> ${base} (completionEffect ${status} does not lower it)`;
  }
  if (state !== live) {
    throw new Error(`b492: branch ${name} gives ${state} and shownState gives ${live} on ${keyOf(card)}`);
  }
  return name;
}

function layersRaised(card) {
  return Object.entries(layerSpoken(card))
    .filter(([, layer]) => layer.raised)
    .map(([name]) => name);
}

function byKey(rows) {
  const map = new Map();
  for (const row of rows) {
    if (map.has(row.key)) throw new Error(`b492: two leave-alone cards share ${row.key}`);
    map.set(row.key, row);
  }
  return map;
}

function prose(card) {
  return typeof card?.displayedEvidenceProse === "string" ? card.displayedEvidenceProse.trim() : "";
}

function unrecordedWhy(card) {
  const bucket = String(card?.readingNote?.bucket || "").toLowerCase() || "none";
  const matchesProse = prose(card) === PARTIAL_UNRECORDED;
  if (bucket === "wording" && matchesProse) {
    return "the rule did apply. The bucket is wording and the prose is the unrecorded sentence, so the shown state is nothing_raised. The prose on the card is still that sentence.";
  }
  if (!matchesProse) {
    return `the prose is not the unrecorded sentence. The bucket is ${bucket}.`;
  }
  return `the bucket is ${bucket}, not wording, so wordingUnrecordedQuiet does not return nothing_raised.`;
}

function gapSentences(summary) {
  return splitSentences(String(summary || ""))
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence && /\bhowever\b/i.test(sentence) && /\bnot\b/i.test(sentence));
}

function companyChange(card) {
  const rewrites = Array.isArray(card?.classificationRewrites) ? card.classificationRewrites : [];
  const hit = rewrites.find((row) => row?.rule === "generic_company");
  const silence = (Array.isArray(card?.silences) ? card.silences : []).find((row) => row?.id === "gap_sentences_stripped");
  if (!hit && !silence) return null;
  const priorSummary = silence && Array.isArray(silence.content) ? String(silence.content[0] || "") : "";
  const removed = gapSentences(priorSummary);
  const priorVerdict = typeof hit?.from === "string" && hit.from ? hit.from : card.displayVerdict;
  const without = { ...card, displayVerdict: priorVerdict };
  if (priorSummary) without.evidenceSummary = priorSummary;
  const before = shownOf(without).label;
  const after = shownOf(card).label;
  if (before === after && !removed.length) return null;
  return { before, after, removed };
}

function reasonText(card) {
  const sentence = readerEvidenceSentence(card);
  return typeof sentence === "string" ? sentence : "";
}

const ctx = await loadGateContext();
const stored486 = loadCards(B486);
const stored1 = loadCards(PASS1);
const stored2 = loadCards(PASS2);
const rows486 = byKey(leaveAloneCards(stored486, ctx.labels, ctx.sourcesByFixture));
const rows1 = byKey(leaveAloneCards(stored1, ctx.labels, ctx.sourcesByFixture));
const rows2 = byKey(leaveAloneCards(stored2, ctx.labels, ctx.sourcesByFixture));

function storedCard(cards, key) {
  const [id, index] = key.split(":");
  const card = cardOf(cards, id, index);
  if (!card) throw new Error(`b492: stored card ${key} is missing`);
  return card;
}

function side(rows, key, stored) {
  const row = rows.get(key);
  if (!row) return { label: "missing", quiet: null, card: null };
  return { label: shownOf(storedCard(stored, key)).label, quiet: row.quiet, card: storedCard(stored, key) };
}

const becameRaised = [];
const becameQuiet = [];
for (const [key, earlier] of rows486) {
  const now = rows1.get(key);
  if (!now) throw new Error(`b492: pass 1 has no leave-alone card ${key}`);
  if (earlier.quiet && !now.quiet) becameRaised.push(key);
  if (!earlier.quiet && now.quiet) becameQuiet.push(key);
}

const pass2Raised = [];
const pass2Quiet = [];
for (const [key, earlier] of rows486) {
  const now = rows2.get(key);
  if (!now) throw new Error(`b492: pass 2 has no leave-alone card ${key}`);
  if (earlier.quiet && !now.quiet) pass2Raised.push(key);
  if (!earlier.quiet && now.quiet) pass2Quiet.push(key);
}

const quiet486 = [...rows486.values()].filter((row) => row.quiet).length;
const quiet1 = [...rows1.values()].filter((row) => row.quiet).length;
const quiet2 = [...rows2.values()].filter((row) => row.quiet).length;
if (quiet486 !== 53) throw new Error(`b492: B486 leave-alone quiet is ${quiet486}, the B488 replay recorded 53`);
if (quiet1 !== 48) throw new Error(`b492: pass 1 leave-alone quiet is ${quiet1}, the B491 replay recorded 48`);

function block(key) {
  const oldCard = storedCard(stored486, key);
  const one = side(rows1, key, stored1);
  const two = side(rows2, key, stored2);
  const same = one.label === two.label && one.quiet === two.quiet;
  const spoken = layersRaised(one.card);
  return [
    key,
    `statement: ${oneLine(one.card.statement)}`,
    `B488 label: ${shownOf(oldCard).label}`,
    `pass 1 label: ${one.label}`,
    `pass 2 label: ${two.label}`,
    `readingNote bucket: ${one.card.readingNote?.bucket || "none"}`,
    `readingNote completion: ${one.card.readingNote?.completion || "none"}`,
    `displayVerdict: ${one.card.displayVerdict || ""}`,
    `branch: ${shownBranch(one.card)}`,
    `leave-alone layers raised on pass 1: ${spoken.length ? spoken.join(", ") : "none"}`,
    same ? "SAME BOTH PASSES" : "DIFFERS BETWEEN PASSES",
  ].join("\n");
}

const lines = [];
lines.push("B492. The saved B490 runs read through the current code.");
lines.push("No model call. USD 0. Build includes B491.");
lines.push("");
lines.push("A. Leave-alone drop");
lines.push(`B488 replay of B486: ${quiet486} quiet of ${rows486.size}. B490 pass 1 with B491 applied: ${quiet1} quiet of ${rows1.size}. Pass 2: ${quiet2} quiet of ${rows2.size}.`);
lines.push("");
lines.push("Quiet in the B488 replay, raised on pass 1");
if (!becameRaised.length) lines.push("none");
for (const key of becameRaised) {
  lines.push(block(key));
  lines.push("");
}
lines.push("Raised in the B488 replay, quiet on pass 1");
if (!becameQuiet.length) lines.push("none");
for (const key of becameQuiet) {
  lines.push(block(key));
  lines.push("");
}
lines.push("Pass 2 against the same B488 set");
lines.push(`quiet then raised: ${pass2Raised.join(", ") || "none"}`);
lines.push(`raised then quiet: ${pass2Quiet.join(", ") || "none"}`);
lines.push("");

function unrecorded(cards) {
  const hits = [];
  for (const card of cards) {
    const reason = reasonText(card);
    const body = prose(card);
    if (reason !== PARTIAL_UNRECORDED && body !== PARTIAL_UNRECORDED) continue;
    hits.push(card);
  }
  return hits;
}

lines.push("B. Which part was not recorded");
const unrecorded1 = unrecorded(stored1);
const unrecorded2 = unrecorded(stored2);
function writeUnrecorded(title, cards) {
  lines.push(title);
  if (!cards.length) lines.push("none");
  for (const card of cards) {
    const view = shownOf(card);
    lines.push([
      keyOf(card),
      `bucket: ${card.readingNote?.bucket || "none"}`,
      `displayVerdict: ${card.displayVerdict || ""}`,
      `shown label: ${view.label}`,
      `why: ${unrecordedWhy(card)}`,
    ].join("\n"));
    lines.push("");
  }
}
writeUnrecorded("pass 1", unrecorded1);
writeUnrecorded("pass 2", unrecorded2);

function emptyByTier(cards) {
  const hits = [];
  for (const card of cards) {
    const view = shownOf(card);
    if (view.tier !== "light" && view.tier !== "demands") continue;
    if (reasonText(card)) continue;
    hits.push(card);
  }
  return hits;
}

lines.push("C. Raised with no reason");
lines.push("Shown tier light or demands, and readerEvidenceSentence empty.");
lines.push(`The B490 gate counts a card only when shownState is one of ${[...REASON_GATE_STATES].join(", ")}. Needs a look is note_withheld. Its tier is demands, and it is not in that set, so the gate counted 0 while these cards are still empty.`);
const gate1 = emptyReasonKeys(stored1);
const gate2 = emptyReasonKeys(stored2);
lines.push(`The same gate on these files: pass 1 ${gate1.length}, pass 2 ${gate2.length}.`);
function writeEmpty(title, cards) {
  lines.push(title);
  if (!cards.length) lines.push("none");
  for (const card of cards) {
    const view = shownOf(card);
    lines.push(`${keyOf(card)}\t${view.label}\t${view.tier}\t${view.state}\t${oneLine(card.statement)}`);
  }
  lines.push("");
}
const empty1 = emptyByTier(stored1);
const empty2 = emptyByTier(stored2);
writeEmpty("pass 1", empty1);
writeEmpty("pass 2", empty2);
for (const key of ["11:11", "12:0"]) {
  const card = cardOf(stored2, ...key.split(":"));
  if (!card) throw new Error(`b492: pass 2 ${key} is missing`);
  const listed = empty2.some((row) => keyOf(row) === key);
  if (!listed) throw new Error(`b492: pass 2 ${key} was not an empty raised reason`);
}

lines.push("D. The company step");
lines.push("applyGenericCompanySuppress lifts a partial to fully backed and stripGapSentences deletes a sentence that says however and not. The stored rewrite generic_company and the silence gap_sentences_stripped are the record. A card is counted when the shown label changes once that prior verdict is put back, or a gap sentence was stored.");
function writeCompany(title, cards) {
  const hits = [];
  for (const card of cards) {
    const change = companyChange(card);
    if (!change) continue;
    hits.push({ card, change });
  }
  lines.push(title);
  lines.push(String(hits.length));
  if (!hits.length) lines.push("none");
  for (const { card, change } of hits) {
    lines.push(keyOf(card));
    lines.push(`statement: ${oneLine(card.statement)}`);
    lines.push(`label without the step: ${change.before}`);
    lines.push(`label with it: ${change.after}`);
    lines.push(`gap sentence: ${change.removed.length ? change.removed.map(oneLine).join(" ") : "none"}`);
    lines.push("");
  }
  return hits.length;
}
const company1 = writeCompany("pass 1", stored1);
const company2 = writeCompany("pass 2", stored2);

lines.push("E. Reasons led by a file name");
lines.push("A shown reason that contains a token of the form 04_synth_... or 18a_...");
function writeNames(title, cards) {
  const hits = [];
  for (const card of cards) {
    const reason = reasonText(card);
    if (!reason || !FILE_NAME.test(reason)) continue;
    hits.push({ card, reason });
  }
  lines.push(title);
  lines.push(String(hits.length));
  if (!hits.length) lines.push("none");
  for (const { card, reason } of hits) {
    lines.push(`${keyOf(card)}\t${oneLine(reason)}`);
  }
  lines.push("");
  return hits.length;
}
const names1 = writeNames("pass 1", stored1);
const names2 = writeNames("pass 2", stored2);

lines.push("Summary");
lines.push(`A. pass 1: ${becameRaised.length} quiet then raised, ${becameQuiet.length} raised then quiet. pass 2: ${pass2Raised.length} quiet then raised, ${pass2Quiet.length} raised then quiet.`);
lines.push(`B. pass 1: ${unrecorded1.length}. pass 2: ${unrecorded2.length}.`);
lines.push(`C. pass 1: ${empty1.length}. pass 2: ${empty2.length}.`);
lines.push(`D. pass 1: ${company1}. pass 2: ${company2}.`);
lines.push(`E. pass 1: ${names1}. pass 2: ${names2}.`);

writeFileSync(OUT, `${lines.join("\n")}\n`);
console.log(lines.slice(-5).join("\n"));
