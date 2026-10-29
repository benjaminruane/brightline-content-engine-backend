/**
 * B448. Read the six craft rules against the stored notes. No model calls.
 * Concerns come from scripts/diagnostic/b446/pass-1.json.
 * Notes come from scripts/diagnostic/b448/notes.json.
 *
 *   node scripts/diagnostic/b448/read.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import editorialRules from "../../../lib/rulebook/editorialRules.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const NOTES = path.join(__dirname, "notes.json");
const PASS = path.join(__dirname, "../b446/pass-1.json");
const OUT = path.join(__dirname, "CRAFT.md");

const CRAFT = [
  "marketing_language_excess",
  "materiality",
  "underreach_hedging",
  "sentence_length",
  "cliche_and_filler",
  "structural_integrity",
];

const JUDGMENTS = {
  "marketing_language_excess:01:8": ["related", "The note says summary adjectives are asserted rather than evidenced, and it names \"exceptional unit economics\" and \"defensible competitive position\". It does not name \"strong product and management instincts\"."],
  "marketing_language_excess:01:10": ["better", "The note quotes \"exceptional unit economics\" and says to replace the adjective with the underlying numbers. That is this point, and the instruction is more useful than a flag that only names the phrase."],
  "marketing_language_excess:02:5": ["related", "The note says the AI story and the competitive edge are asserted rather than developed. It does not name \"exceptionally well positioned\"."],
  "marketing_language_excess:04:10": ["related", "The note says the letter leans on assertions the reader is asked to take on trust, and that the language should be softened to match what is known. It does not name \"strong and underserved advertising audience\"."],
  "marketing_language_excess:05:0": ["silent", "The note is about missing deal terms and an unsubstantiated space-applications line. It does not mention \"a leading manufacturer\"."],
  "marketing_language_excess:06:0": ["related", "The note names other conclusions the figures do not carry (\"well positioned\", \"fundamentally sound\"). It does not name \"perform strongly\"."],
  "marketing_language_excess:08:8": ["related", "The note says the returns math should show how the four pillars become 2.4x and 19 percent, and that the tone is confident where the support is thin. It does not name \"attractive returns\"."],
  "marketing_language_excess:12:2": ["silent", "The note praises the metrics and then discusses the people section. It does not mention \"substantial\" or the transformation sentence."],
  "marketing_language_excess:12:8": ["related", "The note says the people section leans on soft adjectives and names grace, decisiveness, patience, and integrity. It does not name \"genuinely exceptional\"."],
  "marketing_language_excess:13:8": ["related", "The note says the memo under-develops competitive response from legacy incumbents. It does not name \"clear competitive lead\"."],
  "marketing_language_excess:14:3": ["related", "The note treats the regulatory-clearance moat as a strength. It does not say \"real barriers to entry\" is unsubstantiated."],
  "marketing_language_excess:15:31": ["related", "The note says strong assertions sit on a single unsized mitigant, and that the upside language should be softened or the risks quantified. It does not name \"exceptional category positioning\"."],
  "marketing_language_excess:18:6": ["better", "The note names \"exceptional\" among the unsourced superlatives in that thesis sentence, with the Yardi comparison and the 40 percent figure, and it asks for attribution and a downside. That is this point, and it is more useful than deleting the word."],
  "marketing_language_excess:19:4": ["related", "The note says the strong companies are told through favourable metrics with little risk, which gives the letter a promotional tilt. It does not name \"performed exceptionally\"."],
  "materiality:01:5": ["silent", "The note discusses structure, one-sided risk, and summary adjectives. It does not mention the product-simplicity sentence."],
  "materiality:04:2": ["silent", "The note treats the engagement data as the letter's strength. It does not say \"What attracted us was the user engagement profile\" repeats that data."],
  "materiality:04:15": ["related", "The note says the risk section gestures at \"stress-tested for total loss\" without the reasoning. It does not say \"The risks are clear\" adds nothing."],
  "materiality:11:8": ["better", "The note names the Polish facility, with footprint optimisation, as asserted and not connected to the EBITDA step-up. That is this sentence, and the instruction to attribute it is more useful."],
  "materiality:14:5": ["better", "The note asks the question the generative-AI sentence leaves out: if the technology pressures incumbents, why are the cleared incumbents the platforms rather than the vulnerable party. That advances the argument the sentence does not."],
  "materiality:14:8": ["silent", "The note discusses the MDR moat, buy-and-build, reimbursement, and AI gaps. It does not mention the Europe-versus-US sentence."],
  "materiality:15:6": ["silent", "The note discusses pillars, mitigants, and upside against downside. It does not mention category leadership or the EUR 38 billion market."],
  "materiality:15:9": ["related", "The note names \"margin expansion to 70% own-brand\" as quantified upside beside a qualitative downside. It does not say the 70 percent clause repeats the move from 38 percent to 54 percent."],
  "materiality:15:27": ["related", "The note quotes \"underlying relationships stable\" as an assertion that is not sized or shown. The concern is that the sentence repeats the concentration point. Those are different points about the same line."],
  "materiality:17:7": ["related", "The note praises the urban last-mile tailwind as a clean link to the value-creation levers. It does not say the sentence lacks evidence."],
  "materiality:19:8": ["silent", "The note lists ESG as one stop in the letter's order. It does not discuss \"Portfolio ESG performance has continued to mature\"."],
  "sentence_length:15:4": ["silent", "The note is about structure and about claims that rest on one mitigant. It does not mention the store-count sentence or its length."],
  "sentence_length:15:18": ["silent", "The note does not mention the UK-mitigation sentence or ask for any sentence to be broken up."],
  "structural_integrity:12:6": ["related", "The note treats the Magnus line as a credit that should name something he did, and it quotes the soft adjectives grace and decisiveness. It does not call the line a fragment."],
  "structural_integrity:15:19": ["silent", "The note does not mention discretionary positioning, demand sensitivity, or a sentence that is grammatically incomplete."],
};

function show(text) {
  return String(text ?? "").replaceAll("\u2014", "[em dash]").replaceAll("\u2013", "[en dash]");
}

function keyOf(rule, fixtureId, index) {
  return `${rule}:${fixtureId}:${index}`;
}

const notesDoc = JSON.parse(readFileSync(NOTES, "utf8"));
const pass = JSON.parse(readFileSync(PASS, "utf8"));
const drafts = Array.isArray(notesDoc.drafts) ? notesDoc.drafts : null;
if (!drafts || drafts.length !== 20) throw new Error(`b448 read: expected 20 notes, found ${drafts?.length}`);
const byId = new Map();
for (const draft of drafts) {
  if (byId.has(draft.id)) throw new Error(`b448 read: duplicate note ${draft.id}`);
  if (draft.status !== "shown") throw new Error(`b448 read: fixture ${draft.id} is ${draft.status}`);
  if (typeof draft.note !== "string" || !draft.note.trim()) throw new Error(`b448 read: fixture ${draft.id} has no note text`);
  if (!Array.isArray(draft.calls) || draft.calls.length < 1) throw new Error(`b448 read: fixture ${draft.id} has no call`);
  for (const call of draft.calls) {
    if (call.stopReason !== "tool_use") {
      throw new Error(`b448 read: fixture ${draft.id} stopped on ${call.stopReason}`);
    }
    if (!call.toolInput || typeof call.toolInput !== "object") {
      throw new Error(`b448 read: fixture ${draft.id} has no tool input`);
    }
  }
  const kept = draft.calls[draft.calls.length - 1];
  if (kept.toolInput.note !== draft.note) {
    throw new Error(`b448 read: fixture ${draft.id} note does not match the tool input`);
  }
  byId.set(draft.id, draft);
}

const cards = Array.isArray(pass.cards) ? pass.cards : null;
if (!cards) throw new Error("b448 read: the B446 pass has no cards");
const concerns = [];
for (const card of cards) {
  const rows = Array.isArray(card.editorialConcerns) ? card.editorialConcerns : [];
  for (const concern of rows) {
    if (!CRAFT.includes(concern.concernCode)) continue;
    const fixtureId = String(card.fixtureId).padStart(2, "0");
    concerns.push({
      rule: concern.concernCode,
      fixtureId,
      index: card.index,
      statement: typeof card.statement === "string" ? card.statement : "",
      text: typeof concern.text === "string" ? concern.text : "",
    });
  }
}

const seen = new Set();
for (const concern of concerns) {
  const key = keyOf(concern.rule, concern.fixtureId, concern.index);
  if (seen.has(key)) throw new Error(`b448 read: duplicate concern ${key}`);
  seen.add(key);
  if (!JUDGMENTS[key]) throw new Error(`b448 read: no judgment for ${key}`);
  const note = byId.get(concern.fixtureId);
  if (!note) throw new Error(`b448 read: concern ${key} has no stored note`);
}
for (const key of Object.keys(JUDGMENTS)) {
  if (!seen.has(key)) throw new Error(`b448 read: judgment ${key} matches no B446 concern`);
  const verdict = JUDGMENTS[key][0];
  if (!["same", "better", "related", "silent"].includes(verdict)) {
    throw new Error(`b448 read: ${key} has verdict ${verdict}`);
  }
}

const rule = editorialRules.find((row) => row.id === "structural_integrity");
const linkedinNote = rule?.reviewerNoteByOutput?.linkedin_post;
if (typeof linkedinNote !== "string" || !linkedinNote.includes("name-plus-relative-clause")) {
  throw new Error("b448 read: the LinkedIn reviewer note is not where this read cites it");
}
const fixture12 = (pass.fixtures || []).find((row) => String(row.fixtureId).padStart(2, "0") === "12");
const fixture15 = (pass.fixtures || []).find((row) => String(row.fixtureId).padStart(2, "0") === "15");
if (fixture12?.outputType !== "linkedin_post") throw new Error("b448 read: fixture 12 is not a LinkedIn post on the B446 pass");
if (fixture15?.outputType !== "investor_letter") throw new Error("b448 read: fixture 15 is not an investor letter on the B446 pass");

function tally(ruleId) {
  const rows = concerns.filter((row) => row.rule === ruleId);
  const counts = { same: 0, better: 0, related: 0, silent: 0 };
  for (const row of rows) counts[JUDGMENTS[keyOf(ruleId, row.fixtureId, row.index)][0]] += 1;
  return { rows, counts };
}

function countLine(counts) {
  return `Same ${counts.same}. Better ${counts.better}. Related ${counts.related}. Silent ${counts.silent}.`;
}

const spend = notesDoc.spend || {};
const lines = [];
lines.push("# B448 craft read");
lines.push("");
lines.push("The six craft rules, read against the draft-level note stored in `scripts/diagnostic/b448/notes.json`. The concerns are the ones on `scripts/diagnostic/b446/pass-1.json`. No rule was cut. No pipeline was run.");
lines.push("");
lines.push("A concern is `same` when the note already made this point, `better` when it made the point and made it more useful, `related` when it touched the subject and did not make this point, and `silent` when it did not touch the subject. Those are the B446 words. All twenty notes are shown, so `silent` here means the note discussed something else.");
lines.push("");
lines.push(`The writer step on the fix from f89c0c4 stored 20 notes. Each call stopped on tool_use and the tool input's note is the stored text. Calls ${spend.calls}. Discounted USD ${Number(spend.costUsd).toFixed(6)}. Input ${spend.inputTokens}. Output ${spend.outputTokens}. Cached input ${spend.cachedInputTokens}. Unpriced ${spend.unpricedCalls}. Opus has no cached rate, so discounted USD is the list figure. Ceiling USD ${notesDoc.ceilingUsd}. Not crossed.`);
lines.push("");

const sections = {
  marketing_language_excess: [
    "The rule earns its place. On twelve of the fourteen concerns the note does not name the flagged phrase. Twice it makes the point and is more useful, which shows the draft note can do this work and does not show that it replaces the sentence flag.",
  ],
  materiality: [
    "The rule earns its place. Five of the eleven sentences are untouched. Four are touched as a different point. Two are made more usefully, which is overlap, not a replacement. B446 kept this rule because the note was empty. The notes exist now, and the sentence flag is still the only voice on the silent five.",
  ],
  underreach_hedging: [
    "There is no comparison. The rule's job is stacked hedging, and the B446 pass did not raise one. Some notes ask the writer to soften a claim or to show the downside. That is a different instruction, and it is not a miss of a rule that did not speak. The rule should not be cut from a pass where it raised nothing.",
  ],
  sentence_length: [
    "The rule earns its place on these two sentences. Both sit on fixture 15, whose note is about claims and mitigants and never about length. Nothing else on this read asked for either sentence to be broken up.",
  ],
  cliche_and_filler: [
    "There is no comparison. The rule's examples are stock fillers such as \"at the end of the day\" and \"moving forward\". The fixture 12 draft contains \"the numbers tell one story; the team's transformation tells the bigger one.\" The stored note does not quote that line, and the line is not one of the rule's examples. The rule should not be cut from a pass where it did not speak.",
  ],
  structural_integrity: [
    "This rule does not earn the LinkedIn concern. Fixture 12 is a linkedin_post on the B446 pass. The rule's reviewer note for that output says a name plus a relative clause is acceptable and should not be flagged as a fragment. The stored note discusses the Magnus line as a credit to be made concrete. It does not call the line a fragment, so it agrees with the reviewer note and not with the flag.",
    "The investor-letter concern had a note, and the note did not touch the sentence. That flag is the only voice on it. Keep the rule. Do not treat the LinkedIn fragment as a point in its favour.",
  ],
};

for (const ruleId of CRAFT) {
  const { rows, counts } = tally(ruleId);
  lines.push(`## ${ruleId}`);
  lines.push("");
  lines.push(`${rows.length} concerns. ${countLine(counts)}`);
  lines.push("");
  if (!rows.length) {
    lines.push("No concern to judge.");
    lines.push("");
  }
  for (const row of rows) {
    const [verdict, why] = JUDGMENTS[keyOf(ruleId, row.fixtureId, row.index)];
    lines.push(`- Fixture ${row.fixtureId} index ${row.index}. ${verdict[0].toUpperCase()}${verdict.slice(1)}. ${why}`);
    lines.push(`  Concern: ${show(row.text)}`);
  }
  if (rows.length) lines.push("");
  for (const paragraph of sections[ruleId]) lines.push(paragraph);
  lines.push("");
}

lines.push("## The LinkedIn line");
lines.push("");
lines.push("CONFIRMED `lib/rulebook/editorialRules.js`, `structural_integrity`, `reviewerNoteByOutput.linkedin_post`:");
lines.push("");
lines.push(`> ${show(linkedinNote)}`);
lines.push("");
lines.push("CONFIRMED `scripts/diagnostic/b446/pass-1.json`: fixture 12 `outputType` is `linkedin_post`. Fixture 15 `outputType` is `investor_letter`.");
lines.push("");
lines.push("The stored note for fixture 12 says the praise for Magnus leans on soft adjectives, grace and decisiveness, and that each credit should name a specific thing the person did. It agrees that the line is a credit, not a fragment.");
lines.push("");
lines.push("## What this file can decide");
lines.push("");
lines.push("Keep `marketing_language_excess`. The note names a phrase twice and leaves the other twelve to the sentence flag.");
lines.push("");
lines.push("Keep `materiality`. The comparison is no longer an empty note. The rule is still the only voice on five of the eleven sentences.");
lines.push("");
lines.push("Keep `sentence_length`. Both concerns are silent in a note that exists.");
lines.push("");
lines.push("Leave `underreach_hedging` and `cliche_and_filler` where they are. Neither spoke.");
lines.push("");
lines.push("Keep `structural_integrity`. The LinkedIn concern does not count in its favour. The investor-letter concern does, because the note never reached that sentence.");
lines.push("");

writeFileSync(OUT, `${lines.join("\n")}\n`);
process.stdout.write(`Wrote ${OUT}\n`);
process.stdout.write(`concerns ${concerns.length}\n`);
for (const ruleId of CRAFT) {
  const { counts } = tally(ruleId);
  process.stdout.write(`${ruleId} ${countLine(counts)}\n`);
}
