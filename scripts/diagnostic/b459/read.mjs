/**
 * B459. Read the conflict cards on the stored passes. No model call.
 * Changes no product code.
 *
 *   node scripts/diagnostic/b459/read.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { joinKey } from "../accuracy/lib.mjs";
import { normalizeLabelsDoc } from "../accuracy/load-labels.mjs";
import { loadAllFixtures } from "../lib/fixtures.mjs";
import { loadPipelineSources } from "../lib/sources.mjs";
import { confirmingPassageVerdict } from "../../../lib/qc/pipeline-v4/confirming-passage-disagrees.mjs";
import { hasEgregiousMagnitudeGap } from "../../../lib/qc/pipeline-v4/stage2-match-sources.mjs";
import { findSecondValue } from "../../../lib/qc/pipeline-v4/second-value.mjs";
import { annotateTokens, findFigureAgreements, kindNameSame } from "../../../lib/revise-actions/conflict-engagement.mjs";
import { assertsAgreement } from "../../../lib/qc/source-account.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, "CONFLICTS.md");

const READING = {
  "01:9": "The passage states 24 employees in Ottawa and talent at 60-70% of Silicon Valley or New York cost. The code paired the 60 in that range with the 24, because both sit near the word Ottawa. The two sentences can both be true. The line the card shows is about design and engineering versus development and design.",
  "04:3": "The passage states 14 minutes, 7 on Facebook, and 2 to 3 on bookmarking products. The code paired the 3 in the draft's 2-3 with the 2 in the source's 2 to 3. The 3 is also in the passage. The two sentences can both be true.",
  "05:0": "The draft names Halden as the buyer and Westhaven as the seller. The passage names Westhaven as the buyer and Bridgepoint as the seller. Those cannot both be the deal.",
  "05:5": "The draft places the investment during Westhaven's ownership. The passage places it during the Bridgepoint ownership period. Those cannot both be the period.",
  "06:5": "The passage states revenue of EUR 218 million, modestly above EUR 196 million, and an EBITDA margin of 14.2 percent. The code paired the EUR 196 million with the EUR 31 million of EBITDA, because both sit near the word margin. The two sentences can both be true.",
  "08:2": "The passage says Halden would acquire the stake, and the funding is described as what the transaction will use. The draft says we have invested. A proposed deal and a completed deal cannot both be the status. The stored pair is only partial. The explanation already names that status. The line the card shows is about who retains the balance, which is a different point.",
  "08:6": "The passage states EUR 312 million in 2020, EUR 587 million in 2024, and a compound annual growth rate of 17.1%. The code paired 17% with 17.1%. That is the rounding the magnitude check already calls within rounding. The two sentences can both be true.",
  "09:1": "The passage states EUR 318 million, 4% above plan, EBITDA of EUR 58 million, 7% above plan, and a margin of 18.3%. The code paired the 7 percent and the 18.3 percent with the 4%. The two sentences can both be true.",
  "11:7": "The passage states four bolt-on acquisitions and HeatTech at SEK 1.1 billion. The stored pair is confirmed, and the explanation says the source matches. No figure pair fires on that passage, and the card records no difference. The sentence and the passage can both be true.",
  "12:0": "The passage quoted on the card is eighteen months of work alongside the team. The same source says NorTech was acquired in 2021 and, four and a half years later, is an international business. More than four years and four and a half years can both be true. Eighteen months is a different duration in the same note. The stored pair is confirmed and talks about the sale.",
  "13:4": "One passage states an EBITDA margin of about 13%. Another states 11.1% on EUR 76 million. The draft states 11.1%. The source's two margins cannot both be the margin. The second value is stored.",
  "13:7": "One passage states 320 people in the named offices. Another states a team of 285. Those cannot both be the headcount. The stored explanation is the 320 passage and says they match. The card quotes the 285 passage.",
  "14:11": "The passage says the team is not yet in dialogue with any specific company. The draft expects to bring a candidate over the coming months. Those can both be true. The source also says it will return with either a specific memo or a refreshed thesis, and that it is not recommending an investment now. The draft drops the second branch. The sentence label is already Goes beyond the source. The label on the statement is conflicting. On the two passages, the conflict verdict is the wrong class.",
  "15:2": "The passage says the firm seeks investment-committee approval for an investment of up to EUR 720 million. The draft says we have invested. A request for approval and a completed investment cannot both be the status.",
  "15:10": "The passage says Atelier 73 operates 18 small-format stores aimed at younger urban customers, with a design-led assortment. The code paired the 73 in the name with the 18 stores. The two sentences can both be true.",
  "15:11": "The source says Fifth, then that Atelier 73 has the potential to become a meaningful third growth pillar, and that 18 stores operate today. The draft says a fifth value driver and 18 stores. The source uses both ordinals for two different roles. The sentence and the source can both be true.",
  "15:24": "The passage states 167 of 184 stores leased and a remaining term of 7.2 years. The code paired 7.2 years with the 184. The two sentences can both be true.",
  "16:4": "The passage states gross margin of 71.4% and EBITDA margin of 32.8%. The code paired 71.4 with 32.8, because both sit near the word margin. The two sentences can both be true.",
  "17:2": "The passage states 337,000 square metres and the same city figures the draft states, including the asset counts. The code paired a city's area with that city's asset count. The two sentences can both be true. The card records no difference.",
  "18:0": "Both sources still recommend the transaction. The draft says the firm is writing to confirm completion. A recommendation and a completed deal cannot both be the status.",
  "18:2": "The initial source says we recommend an investment of EUR 158 million for a 60% stake. The update still says the firm continues to recommend completion. The draft says we have invested. Those status words cannot both be the current state. The figures are the same. The label calls the statement confirmed, so the adjudication does not treat the tense as a conflict. This is not the figure-pairing fault.",
  "18:3": "The initial source states over 380 property management companies. The update states 412, and says 380 was the earlier figure. The draft states 380 as current. The current figures cannot both be true.",
  "18:4": "The initial source states ARR of EUR 38 million. The update states EUR 35 million and says 38 was the earlier figure. The draft states 38 as of March 2025. Those cannot both be the current ARR.",
  "18:5": "The initial source states 142 people. The update states 167 as of 28 May and says 142 was the earlier figure. The draft states 142 as current. Those cannot both be the headcount.",
  "18:7": "The update states ARR of EUR 35 million, not the EUR 38 million the draft uses as the start of the base case. The magnitude check raised a partial reading to conflicting. The start figure cannot be both.",
  "18:8": "The initial source states a 2.8x MOIC and 23% IRR. The update states an updated base case of 2.6x and 21%, and mentions the old 2.8x and 23% as the initial recommendation. The draft states 2.8x and 23% as the base case. The current base case cannot be both.",
  "19:1": "The passage states net IRR 19.7%, net MOIC 2.13x, and net DPI 0.94x. The code paired 0.94x with 2.13x, because both sit near the word net. The two sentences can both be true.",
  "19:2": "The passage states gross proceeds of SEK 12.8 billion. The draft states SEK 18.4 billion. The other figures in the sentence match. The proceeds cannot be both. The magnitude check raised the class. The explanation names both figures.",
  "19:7": "The draft's 2024 is the year of the investment. The passage is the 2025 year and states parcel volumes down about 3%, revenue up 6%, and EBITDA margin from 14% to 12%. Those can both be true. The stored pair is partial and calls it a period mismatch. The raise from partial to conflicting is not stored.",
  "19:13": "The passage says both companies are progressing toward exit-readiness and names two realisations in 2026. It does not give a first quarter and a third quarter. A later line says no formal process has been launched. A future launch and no process yet can both be true. The sentence adds timing. The sentence label is already Goes beyond the source.",
};

function ascii(value) {
  return String(value || "")
    .replace(/\u2014|\u2013/g, " - ")
    .replace(/\u2018|\u2019/g, "'")
    .replace(/\u201c|\u201d/g, '"')
    .replace(/\u00a0/g, " ")
    .replace(/\uFFFD/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function pad(id) {
  return String(id).padStart(2, "0");
}

function keyOf(card) {
  return `${pad(card.fixtureId)}:${card.index}`;
}

function pairsOf(statement, passage) {
  const agreed = new Set(findFigureAgreements(statement, passage).map((row) => row.draft.start));
  const draft = annotateTokens(statement).filter((token) => token.kind !== "date");
  const source = annotateTokens(passage).filter((token) => token.kind !== "date");
  const pairs = [];
  for (const left of draft) {
    if (agreed.has(left.start)) continue;
    for (const right of source) {
      if (!kindNameSame(left, right) || left.value === right.value) continue;
      const equalPresent = source.some((token) => token.kind === left.kind && token.value === left.value);
      pairs.push({ left: left.raw, right: right.raw, equalPresent });
    }
  }
  return pairs;
}

function loadPass(name) {
  return JSON.parse(readFileSync(path.join(__dirname, `../${name}/pass-1.json`), "utf8"));
}

const labels = normalizeLabelsDoc(JSON.parse(readFileSync(path.join(__dirname, "../accuracy/labels.json"), "utf8")));
const byLabel = new Map();
for (const row of labels) byLabel.set(joinKey(row.fixtureId, row.statementText, row.occurrence), row.label);

const fixtures = await loadAllFixtures();
const sourcesByFixture = new Map();
for (const row of fixtures) {
  const id = pad(row.data?.id);
  sourcesByFixture.set(id, await loadPipelineSources(row.data?.sources));
}

const b446 = new Map();
const b455 = new Map();
for (const card of loadPass("b446").cards) b446.set(joinKey(card.fixtureId, card.statement, card.occurrence), card);
for (const card of loadPass("b455").cards) b455.set(joinKey(card.fixtureId, card.statement, card.occurrence), card);

const cards = loadPass("b456").cards.filter((card) => card.displayVerdict === "conflict");
if (cards.length !== 30) throw new Error(`expected 30 conflict cards, found ${cards.length}`);

const rows = cards.map((card) => {
  const key = keyOf(card);
  const reading = READING[key];
  if (!reading) throw new Error(`no reading for ${key}`);
  const join = joinKey(card.fixtureId, card.statement, card.occurrence);
  const passage = typeof card.primaryExcerpt === "string" ? card.primaryExcerpt : "";
  const demote = confirmingPassageVerdict(card.statement, passage);
  const gap = hasEgregiousMagnitudeGap(card.statement, passage);
  const pairs = pairsOf(card.statement, passage);
  const sources = sourcesByFixture.get(pad(card.fixtureId)) || [];
  const second = [];
  for (const source of sources) {
    const hit = findSecondValue(card.statement, source.text);
    if (hit) second.push(`${hit.statementRaw} vs ${hit.sourceRaw}`);
  }
  const matches = Array.isArray(card.matchExplanations) ? card.matchExplanations : [];
  const prior = (map) => {
    const found = map.get(join);
    return found ? found.displayVerdict : "missing";
  };
  return {
    key,
    card,
    label: byLabel.get(join) || "unlabelled",
    reading,
    passage,
    demote,
    gap,
    pairs,
    second,
    matches,
    at446: prior(b446),
    at455: prior(b455),
  };
});

function canBoth(row) {
  return /can both be true|Those can both be true/.test(row.reading);
}

const bothTrue = rows.filter(canBoth);
const bothFalse = rows.filter((row) => !canBoth(row));
if (bothTrue.length + bothFalse.length !== 30) throw new Error("a reading did not land on one side");

const labelledConflict = rows.filter((row) => row.label === "conflicting");
const labelledConfirmed = rows.filter((row) => row.label === "confirmed");
const unlabelled = rows.filter((row) => row.label === "unlabelled");
if (labelledConflict.length !== 11 || labelledConfirmed.length !== 4 || unlabelled.length !== 15) {
  throw new Error(`label split ${labelledConflict.length}/${labelledConfirmed.length}/${unlabelled.length}`);
}

function readerAgrees(row) {
  return row.card.readingNote?.bucket === "conflicts";
}

const genuineMissed = labelledConflict.filter((row) => !readerAgrees(row));
const falseCaught = labelledConfirmed.filter((row) => !readerAgrees(row));

const lines = [];
const say = (text) => lines.push(text);

say("# B459. Why a correct sentence is called a conflict.");
say("");
say("Read of `scripts/diagnostic/b456/pass-1.json`, compared with `scripts/diagnostic/b446/pass-1.json` and `scripts/diagnostic/b455/pass-1.json`. No model call. USD 0. No product code, prompt, rule, or test was changed.");
say("");
say("A source dash is written here as a hyphen. A replacement character in a stored excerpt is written as an apostrophe.");
say("");
say("## What decides the class");
say("");
say("All 30 cards have `displayVerdict` conflict and `supportState` conflicting. `displayVerdictReason` is empty on every one, so none of them was flipped by the scale check, the actor check, or the role check.");
say("");
say("Stage 3 marks the statement conflicting when any source pair is conflicting. The pair class is the model's class, then the rounding and period backstops, then `demoteConfirmedClassifications` in `lib/qc/pipeline-v4/confirming-passage-disagrees.mjs`. A confirmed passage is demoted when two figures share a name and differ in value. The name is the words sitting beside the figure. Two different measures that share a word, such as margin or net or a city, count as the same figure. A later support span can outvote the pair. The compact card keeps the pair's explanation and, when a backstop changed the class, `writtenFor`. It does not keep the span.");
say("");
say("The line the card shows, `The sentence says ... The passage says ...`, was written afterwards from the quoted passage. On the false cards it is often a different difference from the pair that flipped the class.");
say("");
say("## The four known-wrong cards do not share one cause");
say("");
say("Three do. `01:9`, `09:1`, and `16:4` were confirmed by the model. The explanation was written for that class and says the figures match. `writtenFor` is confirmed. The demote then paired two figures that are not the same measure, and Stage 3 took the pair to conflicting. `01:9` pairs 60 with 24. `09:1` pairs 7 percent and 18.3 percent with 4 percent. `16:4` pairs gross margin 71.4 with EBITDA margin 32.8. On each, the passage states every figure the sentence states.");
say("");
say("`01:9` is conflict, then fully supported, then conflict again across B446, B455, and B456. The demote runs on the passage the model returned. A different passage does not pair 60 with 24, so the class can sit still as confirmed. `09:1` and `16:4` are conflict on all three passes, because the passage that quotes both margins is the passage the model keeps returning.");
say("");
say("`18:2` is the other cause. The model classified the initial source as conflicting and wrote the explanation for that class. The explanation says the draft has invested and the source recommends the investment. No figure pair fires. The same class is on all three passes. The figures match. The label calls the statement confirmed. Suppressing this shape of status conflict would also suppress `08:2`, `15:2`, and `18:0`, which are the same shape and are real. That trade is not available.");
say("");
say("## Count");
say("");
say(`${bothTrue.length} of the 30 can both be true. ${bothFalse.length} of the 30 cannot.`);
say("");
say(`Can both be true: ${bothTrue.map((row) => row.key).join(", ")}.`);
say("");
say(`Cannot both be true: ${bothFalse.map((row) => row.key).join(", ")}.`);
say("");
say("Of the 15 with no label, " + unlabelled.filter(canBoth).length + " can both be true and " + unlabelled.filter((row) => !canBoth(row)).length + " cannot. `14:11` carries a conflicting label, and the two passages can still both be true. `18:2` carries a confirmed label, and the status words cannot both be current. Those two are the places this reading and the worksheet disagree.");
say("");
say("## The reader as a veto");
say("");
say("Agreeing means the note bucket is conflicts. Wording, none, and beyond do not agree.");
say("");
say(`Of the 11 statements the labels call conflicting, the reader agrees on ${labelledConflict.filter(readerAgrees).length} and does not agree on ${genuineMissed.length}: ${genuineMissed.map((row) => `${row.key} (${row.card.readingNote?.bucket || "none"})`).join(", ")}.`);
say("");
say(`Of the 4 statements the labels call confirmed, the reader agrees on none. A rule that showed a conflict only when the reader agreed would catch ${falseCaught.length} of those 4 and would suppress ${genuineMissed.length} of the 11. The 11 include real conflicts the reader missed, among them the 142 against 167 headcount and the 2.8x base case against the updated 2.6x. The veto is not a fix.`);
say("");
say("## What a conflict card stores");
say("");
say("The pair stores a class, a passage, and an explanation. When the demote or another backstop changes the class, `writtenFor` names the class the explanation was written for. It does not name the backstop or the two figures. The explanation on the three demoted label-confirmed cards says the source matches, so the stored sentence and the class contradict each other. The element is recoverable only by replaying the demote on the stored passage, which is what this read did.");
say("");
say("When a span outvotes the pair, the span's passage and explanation are not on the card. `11:7` and `17:2` also have the silence `source_difference_missing`. The class is conflicting and the card has no difference. What would need storing, on the pair, is the backstop name and the two figure strings. On a span that changes the class, the span's passage, class, and explanation.");
say("");
say("## Recommendation");
say("");
say("Deterministic. Do not change what the model is asked. Do not require the reader to agree.");
say("");
say("In `confirmingPassageVerdict`, do not treat a figure as clashing when that same value is already in the passage, and do not treat a pair as clashing when the rounding backstop already calls it within rounding. The first clause is what pairs 71.4 with 32.8, 60 with 24, and 7.2 years with 184 stores, even though the passage also states the draft's own number. The second is what pairs 17% with 17.1%. The guard stops the demote from creating a conflict. It does not clear a conflict the model already wrote, including a passage that repeats the draft figure in order to deny it.");
say("");
say("On this pass the stored pair was flipped from confirmed, `writtenFor` confirmed, on `01:9`, `04:3`, `06:5`, `08:6`, `09:1`, `15:10`, `15:24`, `16:4`, and `17:2`. `19:1` is the same pair on the quoted passage, 0.94x against 2.13x, while the stored pair is still confirmed, so the flip sat on a span. The guard does not touch a labelled conflict. Those classes were set by the model, by the magnitude gap, or by a second value in the same source. `13:4` and `13:7` stay conflicts because the source states a second figure. `19:2` stays a conflict because the magnitude gap raises it. `08:2`, `15:2`, `18:0`, and `18:2` stay as they are, because they are status classes the model wrote, and clearing them clears real ones with them.");
say("");
say("`11:7`, `12:0`, `15:11`, `14:11`, `19:7`, and `19:13` are not this demote. `12:0` quotes eighteen months while the same source states four and a half years. Clearing that wants the whole source, not a tighter pair, and it is a separate change. Storing the winning span comes first, so the next read is not guessing.");
say("");
say("## The thirty");
say("");

for (const row of rows) {
  const note = row.card.readingNote;
  say(`### ${row.key}`);
  say("");
  say(`Label: ${row.label}. B446: ${row.at446}. B455: ${row.at455}. B456: conflict.`);
  say("");
  say(`Sentence: ${ascii(row.card.statement)}`);
  say("");
  say(`Passage: ${ascii(row.passage) || "(none stored)"}`);
  if (row.card.conflictExcerpt) say("");
  if (row.card.conflictExcerpt) say(`Second passage on the card: ${ascii(row.card.conflictExcerpt)}`);
  say("");
  const pairText = row.pairs.length
    ? row.pairs.map((pair) => `${pair.left} against ${pair.right}${pair.equalPresent ? ", and the draft value is also in the passage" : ""}`).join("; ")
    : "no figure pair on the stored passage";
  say(`Figure check on the stored passage: ${row.demote.demoteTo || "no demote"}${row.demote.rule ? ` (rule ${row.demote.rule})` : ""}. Magnitude gap: ${row.gap ? "yes" : "no"}. Pairs: ${pairText}.`);
  if (row.second.length) say(`Second value in the source: ${row.second.join("; ")}.`);
  say("");
  if (!row.matches.length) say("Stored explanation: none.");
  for (const match of row.matches) {
    const written = match.writtenFor ? ` Written for ${match.writtenFor}.` : "";
    say(`Stored match (${match.classification}, ${match.sourceLabel || "unlabelled source"}).${written} ${ascii(match.explanation)}`);
  }
  say("");
  say(`Line on the card: ${ascii(row.card.evidenceSummary) || "(none)"}`);
  say("");
  say(`Reader: ${note?.bucket || "none"}. ${ascii(note?.text) || "No note."}`);
  say("");
  say(canBoth(row) ? "The sentence and the source can both be true." : "The sentence and the source cannot both be true.");
  say("");
  say(row.reading);
  say("");
}

say("## Files");
say("");
say("- `scripts/diagnostic/b459/read.mjs`. Replays the demote, the magnitude gap, and the second-value check on the stored cards. No model call.");
say("- `scripts/diagnostic/b459/CONFLICTS.md`. This report.");
say("");

writeFileSync(OUT, lines.join("\n"));
console.log(`both true ${bothTrue.length}`);
console.log(`both false ${bothFalse.length}`);
console.log(`reader misses ${genuineMissed.length} of ${labelledConflict.length}`);
console.log(`false caught ${falseCaught.length} of ${labelledConfirmed.length}`);
console.log(`unlabelled both true ${unlabelled.filter(canBoth).map((row) => row.key).join(" ")}`);
