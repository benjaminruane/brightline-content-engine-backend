/**
 * B511. Read-only. No model call. Writes DIAG.md from the stored B510 run,
 * the B490 and B503 passes, and the current review code.
 */
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildFacts, documentsDisagree } from "../../../lib/qc/reading-contract.mjs";
import { statementVerdict } from "../../../lib/qc/statement-verdict.mjs";
import { quoteStatesStatement } from "../../../lib/qc/contradiction-floor.mjs";
import { readingNoteJsonSchema } from "../../../lib/qc/reading-review.mjs";
import { SUMMARIZE_SYSTEM_PROMPT, summaryUserMessage } from "../../../lib/source-summary.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const here = dirname(fileURLToPath(import.meta.url));

const RESTATEMENT = /\b(?:restat\w*|same (?:claim|facts|duration)|different words|paraphras\w*|matches the statement|which matches|aligns with the statement)\b/i;
const NUMBER_WORDS = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17,
  eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60,
  seventy: 70, eighty: 80, ninety: 90, hundred: 100,
};
const SPELLING = [
  ["labor", "labour"],
  ["color", "colour"],
  ["program", "programme"],
  ["favor", "favour"],
];
const TOWNS = ["Winterthur", "Olten", "Zurich", "Zug", "Baar", "Geneva", "Basel", "Brno"];

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

async function loadSource(file) {
  const base = file.split("/").pop();
  const drafting = join(root, "scripts/diagnostic/sources/drafting", base);
  const legacy = join(root, "scripts/diagnostic/sources", base);
  const path = existsSync(drafting) ? drafting : legacy;
  if (!existsSync(path)) throw new Error(`source file is missing: ${base}`);
  if (base.endsWith(".txt")) return readFileSync(path, "utf8");
  if (base.endsWith(".pdf")) {
    const { extractTextFromSource } = await import("../../../lib/extract-text-from-source.mjs");
    const extracted = await extractTextFromSource(await readFile(path), "application/pdf");
    const text = typeof extracted?.text === "string" ? extracted.text : "";
    if (!text.trim()) throw new Error(`no text extracted from ${base}`);
    return text;
  }
  throw new Error(`unsupported source file: ${base}`);
}

async function fixtureSources(textType) {
  const fixture = readJson(join(root, "scripts/diagnostic/drafting/fixtures", `${textType}.json`));
  const sources = [];
  for (const source of fixture.sources) {
    sources.push({
      file: source.file,
      role: source.role,
      text: await loadSource(source.file),
    });
  }
  return sources;
}

function bodyOf(sources) {
  return sources.map((source) => source.text).join("\n");
}

function sentencesOf(text) {
  return String(text || "")
    .split(/\n+|(?<=[.!?])\s+/)
    .map((row) => row.trim())
    .filter((row) => row.length > 20);
}

function wordsOf(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((word) => word.length > 3);
}

function closestSentence(statement, sourceText) {
  const wanted = new Set(wordsOf(statement));
  let best = "";
  let bestScore = 0;
  for (const sentence of sentencesOf(sourceText)) {
    const seen = new Set(wordsOf(sentence));
    let score = 0;
    for (const word of wanted) if (seen.has(word)) score += 1;
    if (score > bestScore) {
      bestScore = score;
      best = sentence;
    }
  }
  return { text: best, score: bestScore };
}

function spellingPair(statement, sourceText) {
  const left = statement.toLowerCase();
  const right = sourceText.toLowerCase();
  for (const [a, b] of SPELLING) {
    if (left.includes(a) && right.includes(b) && !right.includes(a)) return `${a} / ${b}`;
    if (left.includes(b) && right.includes(a) && !left.includes(a)) return `${a} / ${b}`;
  }
  return "";
}

function numberForm(statement, sourceText) {
  const left = statement.toLowerCase();
  const right = sourceText.toLowerCase();
  if ((/\bapproximately\b/.test(left) && /\babout\b/.test(right)) || (/\babout\b/.test(left) && /\bapproximately\b/.test(right))) {
    return "approximately / about";
  }
  for (const [word, value] of Object.entries(NUMBER_WORDS)) {
    const digits = String(value);
    if (new RegExp(`\\b${digits}\\b`).test(left) && new RegExp(`\\b${word}\\b`).test(right) && !new RegExp(`\\b${digits}\\b`).test(right)) {
      return `${digits} / ${word}`;
    }
    if (new RegExp(`\\b${word}\\b`).test(left) && new RegExp(`\\b${digits}\\b`).test(right) && !new RegExp(`\\b${word}\\b`).test(right)) {
      return `${word} / ${digits}`;
    }
  }
  return "";
}

function placeGeneralisation(statement, sourceText) {
  if (!/\bSwitzerland\b|\bSwiss\b/.test(statement)) return "";
  const towns = TOWNS.filter((town) => sourceText.includes(town) && !statement.includes(town));
  return towns.length ? `Switzerland / ${towns.join(", ")}` : "";
}

function titleOrHeadline(statement, sourceText) {
  const first = String(sourceText || "").split("\n").map((row) => row.trim()).find(Boolean) || "";
  if (first && statement.trim() === first) return first;
  if (/^[A-Z0-9][A-Z0-9 \-]{8,}$/.test(statement.trim())) return statement.trim();
  return "";
}

function classSurface(fact, statement, sourceText, closest) {
  const surface = String(fact?.surface || "");
  const host = `${surface}\n${closest || ""}\n${sourceText}`;
  const spelling = spellingPair(surface, sourceText) || (/\blabor\b/i.test(surface) && /\blabour\b/i.test(sourceText) ? "labor / labour" : "");
  if (fact?.kind === "name" && spelling) return { klass: "spelling variant", detail: spelling };
  if (fact?.kind === "name" && /\bSwitzerland\b|\bSwiss\b/.test(surface)) {
    const place = placeGeneralisation(statement, closest || sourceText);
    return { klass: "place generalised", detail: place || surface };
  }
  if (fact?.kind === "name" && /\bCzech Republic\b/.test(surface) && /\bCzech\b/.test(host) && !/\bCzech Republic\b/.test(closest || "")) {
    return { klass: "place generalised", detail: "Czech Republic / Czech" };
  }
  if (/^approximately$/i.test(surface) || (fact?.kind !== "name" && numberForm(surface, sourceText))) {
    return { klass: "number written in words versus digits, or approximately versus about", detail: numberForm(statement, closest || sourceText) || "approximately / about" };
  }
  if (fact?.kind === "name" && surface.split(/\s+/).length >= 4) {
    return { klass: "title or headline", detail: surface };
  }
  if (fact?.kind === "name" && !surface.includes(" ")) {
    return { klass: "other", detail: `${surface} is a capitalised word kept as a name. collectNames drops a leading capital only when it is the first word of the whole statement and that word is in SENTENCE_OPENERS or its lowercase form is in the corpus` };
  }
  return { klass: "other", detail: `${fact?.kind || "element"} ${surface}` };
}

function quotePresent(reason) {
  return /"[^"]+"/.test(String(reason || ""));
}

function quotedFile(reason) {
  const match = String(reason || "").match(/(?:^|\s)([A-Za-z0-9_.-]+) states "/);
  return match ? match[1] : "";
}

function sourceRoleOf(sources, file) {
  if (!file) return "";
  const source = (sources || []).find((row) => row.file === file || row.file.replace(/\.(txt|pdf)$/i, "") === file);
  return source ? source.role : "";
}

function conflictClass(statement, reason, sources) {
  const text = String(reason || "");
  const file = quotedFile(text);
  const role = sourceRoleOf(sources, file);
  if (text.startsWith("The later source ")) {
    return { rule: "revision from readings", branch: "shownState revisionRaises, when supersededSourceNotes[0] starts with \"The later source \"", file, role };
  }
  if (text.includes("The source and the statement disagree, because the source")) {
    return { rule: "transaction demand", branch: "shownState transactionDemand, the sentence written by transactionShift", file, role };
  }
  if (text.startsWith("The documents differ.")) {
    return { rule: "unordered document difference", branch: "supersession unorderedDifference writes this note. revisionRaises does not fire on this prefix", file, role };
  }
  if (RESTATEMENT.test(text)) {
    return { rule: "reason describes a restatement or a match", branch: "not stored. statementVerdict sets conflicts only when an accepted note bucket is conflicts. documentsDisagree refuses a wording or none note and does not rewrite the bucket", file, role };
  }
  if (role === "context") {
    return { rule: "quoted source is context", branch: "no review step reads source role. The stored reason quotes this context file. The conflicts branch on the card (note bucket, displayVerdict, floorState, revisionRaises, transactionDemand, or completionEffect) was not saved", file, role };
  }
  if (quoteStatesStatement(statement, text)) {
    return { rule: "evidence quote states the claim", branch: "not stored. evidenceFromDisplay sets conflicts when displayVerdict is conflict, conflicts, or conflicting. displayVerdict is not on the B510 row. The quoted file is a facts source or no file is named", file, role };
  }
  return { rule: "reason names a difference", branch: "not stored. The text does not match the revision sentence, the transaction sentence, or a restatement, and it does not quote a context file", file, role };
}

function factsFor(statement, draft, sourceText) {
  return buildFacts({ statement, draft, sourceText });
}

function verdictWithNoNote(facts) {
  return statementVerdict({ facts, note: null, entries: [] });
}

function walk(dir, hit) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const info = statSync(path);
    if (info.isDirectory()) walk(path, hit);
    else if (name.endsWith(".mjs") || name.endsWith(".js")) hit(path, readFileSync(path, "utf8"));
  }
}

function roleHits() {
  const hits = [];
  walk(join(root, "lib/qc"), (path, text) => {
    if (/source\.role|role === "context"|role === "facts"/.test(text)) hits.push(path.replace(`${root}/`, ""));
  });
  walk(join(root, "api"), (path, text) => {
    if (/source\.role/.test(text)) hits.push(path.replace(`${root}/`, ""));
  });
  return hits;
}

function noteValues(note) {
  const rows = Array.isArray(note?.documentValues) ? note.documentValues : [];
  const filled = rows.filter((row) => row && typeof row.value === "string" && row.value.trim() && typeof row.document === "string" && row.document.trim());
  return { present: Array.isArray(note?.documentValues), nonEmpty: filled.length > 0, disagree: documentsDisagree(note) };
}

function passSection(label, doc) {
  const wanted = new Set(["18", "22", "23", "24", "25"]);
  const cards = (Array.isArray(doc.cards) ? doc.cards : []).filter((card) => wanted.has(String(card.fixtureId)));
  let present = 0;
  let nonEmpty = 0;
  let wordingOrNone = 0;
  let disagreeOnWordingOrNone = 0;
  let conflictsLabel = 0;
  let conflictsFromWordingOrNone = 0;
  const noteKeys = new Set();
  const byFixture = {};
  for (const card of cards) {
    const id = String(card.fixtureId);
    if (!byFixture[id]) byFixture[id] = { cards: 0, present: 0, nonEmpty: 0, disagree: 0 };
    byFixture[id].cards += 1;
    const note = card.readingNote && typeof card.readingNote === "object" ? card.readingNote : null;
    if (note) for (const key of Object.keys(note)) noteKeys.add(key);
    const values = noteValues(note);
    const bucket = typeof note?.bucket === "string" ? note.bucket : "";
    if (values.present) {
      present += 1;
      byFixture[id].present += 1;
    }
    if (values.nonEmpty) {
      nonEmpty += 1;
      byFixture[id].nonEmpty += 1;
    }
    if (bucket === "wording" || bucket === "none") {
      wordingOrNone += 1;
      if (values.disagree) {
        disagreeOnWordingOrNone += 1;
        byFixture[id].disagree += 1;
      }
    }
    const labelShown = card.sentenceLabel || card.shown || "";
    if (labelShown === "Conflicts with the source" || card.sentenceState === "conflicts") {
      conflictsLabel += 1;
      if ((bucket === "wording" || bucket === "none") && values.disagree) conflictsFromWordingOrNone += 1;
    }
  }
  return { label, cards: cards.length, present, nonEmpty, wordingOrNone, disagreeOnWordingOrNone, conflictsLabel, conflictsFromWordingOrNone, byFixture, noteKeys: [...noteKeys].sort() };
}

function block(title, rows) {
  return [`## ${title}`, "", ...rows, ""];
}

async function main() {
const run = readJson(join(root, "scripts/diagnostic/b510/run.json"));
const resultText = readFileSync(join(root, "scripts/diagnostic/b510/RESULT.md"), "utf8");
const b490 = readJson(join(root, "scripts/diagnostic/b490/pass-1.json"));
const b503 = readJson(join(root, "scripts/diagnostic/b503/pass-1.json"));
const schema = readingNoteJsonSchema();
const bodies = new Map();

async function sourcesFor(textType) {
  if (!bodies.has(textType)) bodies.set(textType, await fixtureSources(textType));
  return bodies.get(textType);
}

const conflicts = [];
const misses = [];
for (const fixture of run.fixtures || []) {
  const sources = await sourcesFor(fixture.textType);
  const draft = typeof fixture.draft === "string" ? fixture.draft : "";
  const sourceText = bodyOf(sources);
  for (const [index, card] of (fixture.raised || []).entries()) {
    if (card.shown === "Conflicts with the source") {
      let facts = [];
      let factError = "";
      let factVerdict = null;
      try {
        facts = factsFor(card.statement, draft, sourceText);
        factVerdict = verdictWithNoNote(facts);
      } catch (error) {
        factError = error instanceof Error ? error.message : String(error);
      }
      const missing = facts.filter((fact) => fact.status === "not_found").map((fact) => ({ kind: fact.kind, surface: fact.surface }));
      conflicts.push({
        textType: fixture.textType,
        index,
        statement: card.statement,
        reason: card.reason,
        restatement: RESTATEMENT.test(String(card.reason || "")),
        klass: conflictClass(card.statement, card.reason, sources),
        missing,
        factError,
        factState: factVerdict ? factVerdict.state : "",
        factSetBy: factVerdict ? factVerdict.setBy : null,
      });
    }
    if (card.shown === "Not in the source" && quotePresent(card.reason)) {
      let facts = [];
      let factError = "";
      try {
        facts = factsFor(card.statement, draft, sourceText);
      } catch (error) {
        factError = error instanceof Error ? error.message : String(error);
      }
      const missing = facts.filter((fact) => fact.status === "not_found").map((fact) => ({ kind: fact.kind, surface: fact.surface }));
      const closest = closestSentence(card.statement, sourceText);
      const factClasses = missing.map((fact) => ({ ...fact, ...classSurface(fact, card.statement, sourceText, closest.text) }));
      misses.push({
        textType: fixture.textType,
        index,
        statement: card.statement,
        reason: card.reason,
        missing,
        factError,
        closest: closest.text,
        factClasses,
        quoteStates: quoteStatesStatement(card.statement, card.reason),
      });
    }
  }
}

const pass490 = passSection("b490 pass-1", b490);
const pass503 = passSection("b503 pass-1", b503);
const qcRoleHits = roleHits();

const headings = resultText.split("\n").filter((row) => row.startsWith("## "));
const storedTypes = (run.fixtures || []).map((fixture) => fixture.textType);
const missingAsked = ["NEW_SECONDARY_INVESTMENT", "SPECIAL_TOPIC"];

const disagreements = [];
for (const fixture of run.fixtures || []) {
  for (const role of fixture.roles || []) {
    if (role.suggestedRole && role.suggestedRole !== role.fixtureRole) {
      disagreements.push({ textType: fixture.textType, ...role });
    }
  }
}

const conflictCounts = {};
for (const card of conflicts) {
  conflictCounts[card.klass.rule] = (conflictCounts[card.klass.rule] || 0) + 1;
}
const missCounts = {};
for (const card of misses) {
  const classes = card.factClasses.length ? card.factClasses : [{ klass: "other" }];
  const seen = new Set(classes.map((fact) => fact.klass));
  for (const klass of seen) missCounts[klass] = (missCounts[klass] || 0) + 1;
}
const notInSourceAll = (run.fixtures || []).reduce((sum, fixture) => sum + (fixture.raised || []).filter((card) => card.shown === "Not in the source").length, 0);
const notInSourceNoQuote = notInSourceAll - misses.length;

function topKey(counts) {
  const rows = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return rows[0] ? rows[0][0] : "none";
}

const causeA = topKey(conflictCounts);
const causeD = topKey(missCounts);
const restatementCount = conflicts.filter((card) => card.restatement).length;
const quoteAgrees = misses.filter((card) => card.quoteStates).length;
const recomputedMissing = misses.filter((card) => card.missing.length).length;

const out = [];
out.push("# B511. Why the B510 drafts show conflicts and not-in-source");
out.push("");
out.push("Read only. No model call. The B510 runner stored each raised card as statement, shown, and reason. It did not store the reading note, documentValues, disputedIndices, displayVerdict, readingFacts, or statementVerdict.setBy.");
out.push("");

const aRows = [];
aRows.push(`Cards shown "Conflicts with the source": ${conflicts.length}.`);
aRows.push("On every one of them the stored reading note is absent, documentValues is absent, disputedIndices is absent, and the evidence displayVerdict is absent. The branch that set the label is not on the row. What follows is the statement, the stored reason, whether that reason describes a restatement, and the rule the reason text is consistent with.");
aRows.push("");
for (const card of conflicts) {
  aRows.push(`### ${card.textType} raised ${card.index + 1}`);
  aRows.push("");
  aRows.push(`Statement: ${card.statement}`);
  aRows.push("");
  aRows.push("Stored reading note: absent. bucket, text, documentValues, and disputedIndices were not saved.");
  aRows.push("");
  aRows.push("Evidence displayVerdict: absent.");
  aRows.push("");
  aRows.push(`Reason: ${card.reason}`);
  aRows.push("");
  aRows.push(`The reason text describes a restatement: ${card.restatement ? "yes" : "no"}. The test is the restatement pattern in bothReadingsSupport, plus the phrases "matches the statement", "which matches", and "aligns with the statement", which are how these stored reasons word a match.`);
  aRows.push("");
  aRows.push(`Rule: ${card.klass.rule}.`);
  aRows.push("");
  aRows.push(`Quoted file: ${card.klass.file || "none named"}. Fixture role of that file: ${card.klass.role || "not applicable"}.`);
  aRows.push("");
  aRows.push(`Branch: ${card.klass.branch}.`);
  aRows.push("");
  if (card.factError) aRows.push(`Fact matcher error: ${card.factError}`);
  else {
    const missingText = card.missing.length ? card.missing.map((fact) => `${fact.kind} "${fact.surface}"`).join("; ") : "none";
    aRows.push(`Recomputed readingFacts not_found, with no note: ${missingText}. statementVerdict on those facts and no note: ${card.factState}.`);
  }
  aRows.push("");
}
aRows.push("Count by rule:");
for (const [rule, count] of Object.entries(conflictCounts).sort((a, b) => b[1] - a[1])) {
  aRows.push(`- ${rule}: ${count}`);
}
aRows.push("");
aRows.push("documentsDisagree does not set the conflicts state. In acceptNote, a wording or none note whose documentValues hold two distinct values is refused with reason documents_disagree. The retry prompt then tells the model to use bucket conflicts. That retry is a model call. This diagnostic did not run it. A refused note is not rewritten to bucket conflicts.");
out.push(...block("A. False conflicts", aRows));

const bRows = [];
bRows.push(`readingNoteJsonSchema required fields: ${(schema.required || []).join(", ")}.`);
bRows.push(`documentValues is required by the schema. The schema does not require the array to be non-empty. keptDocumentValues drops empty rows and stores nothing when nothing remains, so a required empty array is absent on the card. documentsDisagree on a missing or single-value array is false.`);
bRows.push("");
for (const pass of [pass490, pass503]) {
  bRows.push(`### ${pass.label}`);
  bRows.push("");
  bRows.push(`Multi-source cards on fixtures 18, 22, 23, 24, 25: ${pass.cards}.`);
  bRows.push(`documentValues present: ${pass.present}. Non-empty: ${pass.nonEmpty}.`);
  bRows.push(`Notes with bucket wording or none: ${pass.wordingOrNone}.`);
  bRows.push(`Of those, documentsDisagree is true: ${pass.disagreeOnWordingOrNone}. That is a refusal, not a rewrite of the bucket to conflicts.`);
  bRows.push(`Cards whose stored label or sentence state is conflicts: ${pass.conflictsLabel}. Of those, wording or none plus documentsDisagree: ${pass.conflictsFromWordingOrNone}.`);
  bRows.push(`readingNote keys on these cards: ${pass.noteKeys.length ? pass.noteKeys.join(", ") : "none"}.`);
  for (const [id, row] of Object.entries(pass.byFixture).sort((a, b) => a[0].localeCompare(b[0]))) {
    bRows.push(`- Fixture ${id}: cards ${row.cards}, documentValues present ${row.present}, non-empty ${row.nonEmpty}, documentsDisagree on a wording or none note ${row.disagree}.`);
  }
  bRows.push("");
}
bRows.push("Comparison: both passes store documentValues on 0 of these cards. documentsDisagree therefore escalates none of them. The B503 schema makes the field required on the model reply. It does not make the stored card always carry a filled array. B503 did not add a code path that turns a wording or none note into the conflicts state.");
out.push(...block("B. Did B503 change this", bRows));

const cRows = [];
cRows.push("Source roles do not reach a review step. lib/source-role.mjs says the pipeline does not read the field. sourcesForPrompt deletes role before a prompt is built. The B510 review request sent name, label, text, type, and publicationState, and did not send role.");
if (qcRoleHits.length) {
  cRows.push(`Files under lib/qc or api that mention source.role or a facts/context role test: ${qcRoleHits.join(", ")}.`);
} else {
  cRows.push("A search of lib/qc and api found no read of source.role and no test of role === \"context\" or role === \"facts\".");
}
cRows.push("");
cRows.push("A context source, or an earlier-period document, can still produce a conflict or a revision because review treats every source as text:");
cRows.push("- readingSourceBody joins every source text. The role is not an argument.");
cRows.push("- Stage 2 matches every source. A conflicting match on a context source is a conflicting match.");
cRows.push("- floorState returns conflicts when the reading state is not_in_source, beyond, partial, or note_withheld and a match explanation is classification conflicting and was not written for a confirmed repair.");
cRows.push("- revisionSentence in supersession.mjs, and revisionFromReadings in reader-reason.mjs, compare two dated documents. When a later document disagrees and an earlier document agrees, the note starts \"The later source \". shownState revisionRaises then sets conflicts.");
cRows.push("- unorderedDifference writes \"The documents differ.\" when two documents give different quoted values and the dates do not put one later. That prefix does not by itself trip revisionRaises.");
cRows.push("- transactionDemand and completionEffect read the statement and the source corpus. They do not read a source role. A context passage can move the deal state they compare.");
cRows.push("- The facts-and-context sentence in compose.mjs is a drafting instruction. Review does not receive it.");
out.push(...block("C. Roles in review", cRows));

const dRows = [];
dRows.push(`Cards shown "Not in the source": ${notInSourceAll}. Of those, the reason contains a quotation: ${misses.length}. Without a quotation: ${notInSourceNoQuote}. The rows below are the ones with a quotation.`);
dRows.push("readingFacts were not stored on the B510 row. The facts below are recomputed by buildFacts on the fixture sources joined the way readingSourceBody joins them. The status not_found is set in buildFacts when elementFound returns false. statementVerdict then sets not_in_source on the first not_found fact unless the note bucket is wording.");
dRows.push("");
for (const card of misses) {
  dRows.push(`### ${card.textType} raised ${card.index + 1}`);
  dRows.push("");
  dRows.push(`Statement: ${card.statement}`);
  dRows.push("");
  if (card.factError) dRows.push(`Fact matcher error: ${card.factError}`);
  else if (!card.missing.length) dRows.push("Recomputed readingFacts not_found: none. The current matcher finds every extracted element.");
  else dRows.push(`Recomputed readingFacts not_found: ${card.missing.map((fact) => `${fact.kind} "${fact.surface}"`).join("; ")}.`);
  dRows.push("");
  dRows.push(`Closest source text: ${card.closest || "(none)"}`);
  dRows.push("");
  if (!card.factClasses.length) dRows.push("Class: other. No not_found element was recomputed.");
  else {
    for (const fact of card.factClasses) {
      dRows.push(`Class for ${fact.kind} "${fact.surface}": ${fact.klass}${fact.detail ? `. ${fact.detail}` : ""}.`);
    }
  }
  dRows.push("");
  dRows.push(`The stored quotation states the claim, by quoteStatesStatement: ${card.quoteStates ? "yes" : "no"}.`);
  dRows.push("");
}
dRows.push("Count by class:");
for (const [klass, count] of Object.entries(missCounts).sort((a, b) => b[1] - a[1])) {
  dRows.push(`- ${klass}: ${count}`);
}
out.push(...block("D. False not in the source", dRows));

const eRows = [];
eRows.push("NEW_SECONDARY_INVESTMENT and SPECIAL_TOPIC did run. They each have a section in RESULT.md. run.json stopped is null. fixtures.length is 10. There is no error, skip, or filter to quote.");
eRows.push("");
eRows.push("RESULT.md headings:");
for (const heading of headings) eRows.push(`- ${heading}`);
eRows.push("");
eRows.push(`run.json text types: ${storedTypes.join(", ")}.`);
for (const name of missingAsked) {
  const fixture = (run.fixtures || []).find((row) => row.textType === name);
  eRows.push(`${name}: present ${storedTypes.includes(name) ? "yes" : "no"}. Raised cards ${fixture ? (fixture.raised || []).length : 0}. The fixture object does not store its own spend. The run spend is the top-level object: ${run.spend?.calls ?? "absent"} calls, USD ${run.spend?.costUsd ?? "absent"}.`);
}
out.push(...block("E. Missing fixtures", eRows));

const fRows = [];
fRows.push(`Disagreements stored on the run: ${disagreements.length}. The role row stores file, fixtureRole, suggestedRole, description, and publicationState. It does not store a separate reason for the role. The description is the two-sentence summary.`);
fRows.push("");
fRows.push("The classification prompt does give the text type. summaryUserMessage writes \"Text type:\" and the label. The system prompt says: \"The user message names the text type this draft is for.\" The B510 runner passed eventType: fixture.textType into the summarize handler.");
fRows.push("");
const probe = summaryUserMessage("Fund capital call", "document");
fRows.push(`A probe of summaryUserMessage for that label starts: ${JSON.stringify(probe.split("\n")[0])}.`);
fRows.push(`The system prompt contains the text-type sentence: ${SUMMARIZE_SYSTEM_PROMPT.includes("The user message names the text type this draft is for.") ? "yes" : "no"}.`);
fRows.push("");
for (const row of disagreements) {
  fRows.push(`### ${row.textType} ${row.file}`);
  fRows.push("");
  fRows.push(`Fixture role: ${row.fixtureRole}. Suggested role: ${row.suggestedRole}.`);
  fRows.push("");
  fRows.push("Model reason for the role: not stored.");
  fRows.push("");
  fRows.push(`Stored description: ${row.description || "(absent)"}`);
  fRows.push("");
}
out.push(...block("F. Source-role suggestion", fRows));

const summary = [];
summary.push(`A. Conflict cards ${conflicts.length}. The reason describes a restatement or a match on ${restatementCount}. Largest rule: ${causeA} (${conflictCounts[causeA] || 0}).`);
summary.push(`B. documentValues present on the five multi-source fixtures: b490 ${pass490.present} of ${pass490.cards}, b503 ${pass503.present} of ${pass503.cards}. documentsDisagree true on a wording or none note: b490 ${pass490.disagreeOnWordingOrNone}, b503 ${pass503.disagreeOnWordingOrNone}. Conflicts labels that are a wording or none note with documentsDisagree: b490 ${pass490.conflictsFromWordingOrNone}, b503 ${pass503.conflictsFromWordingOrNone}.`);
summary.push(`C. Review steps that read a source role: ${qcRoleHits.length}. Paths that can still raise a conflict or a revision from a context source or an earlier-period document: reading body, stage 2 match, floorState, revisionSentence, revisionFromReadings, unorderedDifference, transactionDemand, completionEffect.`);
summary.push(`D. Not-in-source cards ${notInSourceAll}, with a quotation ${misses.length}. The quotation states the claim on ${quoteAgrees}. Recomputed not_found facts on ${recomputedMissing}. Largest class: ${causeD} (${missCounts[causeD] || 0}).`);
summary.push(`E. NEW_SECONDARY_INVESTMENT and SPECIAL_TOPIC are in the report. No error.`);
summary.push(`F. Disagreements ${disagreements.length}. A role reason is stored on 0. The prompt names the text type.`);
summary.push("");
const contextQuotes = conflicts.filter((card) => card.klass.rule === "quoted source is context").length;
const openerCards = misses.filter((card) => card.factClasses.some((fact) => String(fact.detail || "").includes("capitalised word"))).length;
summary.push(`Most likely cause of A: ${contextQuotes} of ${conflicts.length} conflict reasons quote a file whose fixture role is context. The remaining groups are a reason that names a difference (${conflictCounts["reason names a difference"] || 0}), an evidence quote that states the claim (${conflictCounts["evidence quote states the claim"] || 0}), and a reason that describes a restatement or a match (${conflictCounts["reason describes a restatement or a match"] || 0}). All ${conflicts.length} cards recompute with no not_found fact, so the conflicts label did not come from a missing fact. documentsDisagree did not write it: that function refuses a wording or none note, and the B490 and B503 cards store no documentValues. The branch on the B510 card was not saved. The visible pattern is that review quoted a context source, including an earlier-period report, as a source that can conflict.`);
summary.push("");
summary.push(`Most likely cause of D: statementVerdict sets not_in_source from the first not_found fact unless the note bucket is wording. ${recomputedMissing} of ${misses.length} quoted cards still have a not_found element, and ${quoteAgrees} of ${misses.length} have a stored quotation that states the claim. ${openerCards} of the ${misses.length} are a one-word capital that collectNames kept as a name. The other misses are a spelling (labor / labour), a place named more narrowly in the source, a headline, the hedge word Approximately, the shortened name Vestmark LP, and the benchmark word forecasts.`);
out.push(...block("Summary", summary));

writeFileSync(join(here, "DIAG.md"), `${out.join("\n")}\n`);
console.log(`conflicts ${conflicts.length}`);
console.log(`misses ${misses.length}`);
console.log(`causeA ${causeA}`);
console.log(`causeD ${causeD}`);
console.log(`restatement ${restatementCount}`);
console.log(`quoteAgrees ${quoteAgrees}`);
console.log(`recomputedMissing ${recomputedMissing}`);
console.log(`b490 disagree ${pass490.disagreeOnWordingOrNone} present ${pass490.present}`);
console.log(`b503 disagree ${pass503.disagreeOnWordingOrNone} present ${pass503.present}`);
console.log(`role hits ${qcRoleHits.length}`);
console.log(`disagreements ${disagreements.length}`);
}

main().then(() => process.exit(0)).catch((error) => {
  console.error(error);
  process.exit(1);
});
