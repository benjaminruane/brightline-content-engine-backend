/**
 * B486. The new reason and label, over the stored B485 pass. No model call.
 * Outcomes 4, 5, 6, 7 and 8 have to hold here before a paid pass starts.
 *
 *   node scripts/diagnostic/b486/replay.mjs
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { readerEvidenceSentence } from "../../../lib/qc/reader-reason.mjs";
import { plainReaderText } from "../../../lib/qc/reader-plain.mjs";
import { shownLabel, shownState, shownTier } from "../../../lib/qc/shown-verdict.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PASS = path.join(__dirname, "../b485/pass-1.json");
const FRONT = path.resolve(__dirname, "../../../../brightline-content-engine-frontend/src/modules/drafting/readerReason.js");
const DASH = /[\u2014\u2013]/;
const INTERNAL = /\brungs?\b|\bmodality\b/i;

function pad(id) {
  return String(id).padStart(2, "0");
}

function cardOf(cards, id, index) {
  return cards.find((card) => pad(card.fixtureId) === id && card.index === index);
}

const doc = JSON.parse(readFileSync(PASS, "utf8"));
const cards = doc.cards || [];
const screen = await import(pathToFileURL(FRONT).href);
const misses = [];

function check(name, ok, detail) {
  if (!ok) misses.push(`${name}: ${detail}`);
}

const eighteenEight = cardOf(cards, "18", 8);
const twentyFiveEight = cardOf(cards, "25", 8);
for (const [name, card] of [["F18 #8", eighteenEight], ["F25 #8", twentyFiveEight]]) {
  const reason = readerEvidenceSentence(card) || "";
  check("4", shownLabel(card) === "Conflicts with the source", `${name} label ${shownLabel(card)}`);
  check("4", /2\.6x MOIC and 21% IRR/.test(reason) && /2\.8x MOIC and 23% IRR/.test(reason), `${name} reason does not name both figures`);
}

const eighteenTwo = cardOf(cards, "18", 2);
const note = plainReaderText(eighteenTwo?.readingNote?.text || "");
const reasonTwo = readerEvidenceSentence(eighteenTwo) || "";
const matcher = (eighteenTwo?.matchExplanations || []).find((row) => row.classification === "conflicting")?.explanation || "";
check("5", reasonTwo === note, `F18 #2 reason is not the note\nreason: ${reasonTwo}\nnote: ${note}`);
check("5", !/modality/i.test(reasonTwo) && reasonTwo !== matcher, "F18 #2 still shows the matcher");
check("2", shownTier(shownState(eighteenTwo)) === "demands", `F18 #2 tier ${shownTier(shownState(eighteenTwo))}`);

const fifteenTwo = cardOf(cards, "15", 2);
check("2", shownTier(shownState(fifteenTwo)) === "demands", `F15 #2 tier ${shownTier(shownState(fifteenTwo))}`);

const eleven = cardOf(cards, "11", 7);
check("6", shownLabel(eleven) === "Nothing raised" && shownTier(shownState(eleven)) === "quiet", `F11 #7 ${shownLabel(eleven)} ${shownTier(shownState(eleven))}`);

let dashes = 0;
let internal = 0;
let parity = 0;
const parityRows = [];
for (const card of cards) {
  const reason = readerEvidenceSentence(card) || "";
  const label = shownLabel(card) || "";
  const tier = shownTier(shownState(card)) || "";
  const shownNote = card.readingNote && (card.readingNote.bucket === "beyond" || card.readingNote.bucket === "conflicts")
    ? plainReaderText(card.readingNote.text || "")
    : "";
  for (const text of [label, tier, reason, shownNote]) {
    if (DASH.test(text)) dashes += 1;
    if (INTERNAL.test(text)) internal += 1;
  }
  const right = screen.readerEvidenceSentence(card) || "";
  if (reason !== right) {
    parity += 1;
    if (parityRows.length < 5) parityRows.push(`${pad(card.fixtureId)}:${card.index}`);
  }
}
check("7", dashes === 0, `${dashes} reader strings still contain a long dash`);
check("8", parity === 0, `${parity} differences ${parityRows.join(", ")}`);

const lines = [
  "B485 difference: fixture 18 index 0. The backend showed the matcher sentence about completion. The screen returned an empty sentence, because a withheld note was not given the contradiction floor.",
  `F18 #0 now: ${(readerEvidenceSentence(cardOf(cards, "18", 0)) || "").slice(0, 220)}`,
  `internal words in reader strings: ${internal}`,
  `dashes: ${dashes}`,
  `parity: ${parity}`,
  `F18 #2 tier: ${shownTier(shownState(eighteenTwo))} label: ${shownLabel(eighteenTwo)}`,
  `F18 #8 label: ${shownLabel(eighteenEight)}`,
  `F11 #7 label: ${shownLabel(eleven)}`,
];
if (misses.length) {
  console.log(lines.join("\n"));
  console.log("REPLAY FAILED");
  for (const row of misses) console.log(row);
  process.exit(1);
}
console.log(lines.join("\n"));
console.log("REPLAY HELD");
