/**
 * B444 dry scan. No model call.
 *   node scripts/diagnostic/b444/scan.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadAllFixtures } from "../lib/fixtures.mjs";
import {
  firstPersonHits,
  longDashHits,
  quotationRanges,
  scanMechanics,
  spelledPercentHits,
} from "../../../lib/qc/mechanics-scan.mjs";
import { houseVoiceIsThirdPerson, houseVoiceSlug } from "../../../lib/prompt-library/house-voice.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PASS = path.join(__dirname, "../b441/pass-1.json");
const OUT = path.join(__dirname, "SCAN.md");

function inside(start, end, ranges) {
  return ranges.some(([from, to]) => start >= from && end <= to);
}

function show(text) {
  return String(text || "").replaceAll("\u2014", "[em dash]").replaceAll("\u2013", "[en dash]");
}

function clip(text) {
  const flat = show(text).replace(/\s+/g, " ").trim();
  return flat.length <= 110 ? flat : `${flat.slice(0, 107)}...`;
}

function modelCodes(card) {
  const rows = Array.isArray(card.editorialConcerns) ? card.editorialConcerns : [];
  return rows.map((row) => (typeof row?.concernCode === "string" ? row.concernCode : "")).filter(Boolean);
}

const REASONING = `## Reasoning

The craft note was being refused by NOTE_BANNED_PHRASES, which is the guard on a per-sentence evidence note. That list is unchanged, and acceptNote still uses it. The craft note now uses lib/qc/craft-note-ban.mjs. The list is only a claim that the evidence check passed: the source confirms, the figures are verified, supported by the source, aligns with the source, and the same kind of sentence. A bare confirmed, verified, correct, or supported is ordinary editorial English and is shown. The words that talk about the draft as a whole stay off the craft list, because the note exists to talk about the draft. The writer prompt is unchanged. A refusal still stores both attempts, the refused text, and the phrase, in the shape B443 gave them.

First person inside quoted speech in a press release is exempt. The press-release reviewer note already said first person inside quotation marks with a named speaker is correct, and the style prompt already says to leave text inside quotation marks as the writer set it. The detector treats a paired double quote, straight or curly, as that quotation. An unmatched quote is not a span, so it is not exempted. The same exemption covers a long dash inside those quotation marks, and a spelled percentage inside them, because that is the same instruction: quoted text is left as the writer set it. The detector does not open the source to decide whether the quotation is source text. The quotation marks are the signal the prompt already uses.

voice_consistency and first_person_plural stay as two codes. They are the same fault, and on this pass they do not co-fire, because a statement has one output type. first_person_plural is the style rule, and its applies_to list is reporting commentary only. A press release is third person in HOUSE_VOICE_TABLE and is not on that list, so the pronoun is filed as voice_consistency. Investor letters and LinkedIn posts are first person plural in the same table, so the scan raises nothing. The scan reads the table. It does not restate which type uses which person. One code would have put a style rule on a press release, where that rule does not apply.

The review prompt no longer lists percentage_notation, em_dash, or first_person_plural, and it no longer includes the first-person removal block or the press-release line that told the model to flag first person in the body. voice_consistency stays, as a switch in voice, because that rule is wider than the pronoun. A model answer for the three scanned rules is dropped. The scan adds the concern. The revision prompt still carries the house rules, so a rewrite is not told to put the fault back. That prompt is not the review.

The shared pronoun pattern is case-insensitive, so it also matches the country abbreviation US. Those three statements in this file say US and contain no pronoun. The scan skips a match whose text is US. us and Us still count.

Six percentage instances in this file use a spelling that also sits in the matched passage. Source awareness leaves percentage_notation, em_dash, and first_person_plural on the card. The house rule is how the draft writes the figure or the dash, not whether the source used the same spelling.

The concern on the card is the existing shape: concernCode, the prose in note and concernText, and quote set to the exact characters in the statement. The span is those same characters, so a later mark can point at them.
`;

function line(label, foundStatements, foundInstances, modelStatements, missed, modelOnly, exempted) {
  return [
    `### ${label}`,
    "",
    `Instances raised: ${foundInstances}. Statements raised: ${foundStatements}.`,
    `Model raised this on ${modelStatements} statements in the stored pass.`,
    `Statements the scan raises and the model did not: ${missed}.`,
    `Statements the model raised and the scan does not: ${modelOnly}.`,
    `Matches left inside quotation marks, not raised: ${exempted}.`,
    "",
  ].join("\n");
}

const pass = JSON.parse(readFileSync(PASS, "utf8"));
const cards = Array.isArray(pass.cards) ? pass.cards : null;
if (!cards) throw new Error("scan: pass-1.json has no cards");
if (cards.length !== 261) throw new Error(`scan: expected 261 cards, found ${cards.length}`);

const fixtures = await loadAllFixtures();
const typeById = new Map();
for (const fixture of fixtures) {
  const id = String(fixture.data?.id ?? "").padStart(2, "0");
  const outputType = fixture.data?.config?.outputType;
  if (!id || id === "00") continue;
  if (!outputType) throw new Error(`scan: fixture ${id} has no output type`);
  typeById.set(id, outputType);
}

const buckets = {
  percentage_notation: { raisedStatements: new Set(), instances: 0, model: new Set(), exempted: 0, missed: [], modelOnly: [] },
  em_dash: { raisedStatements: new Set(), instances: 0, model: new Set(), exempted: 0, missed: [], modelOnly: [], em: 0, en: 0 },
  first_person: { raisedStatements: new Set(), instances: 0, model: new Set(), exempted: 0, missed: [], modelOnly: [], rawThird: 0, wrongHouse: [] },
};

const wrong = [];

for (const card of cards) {
  const fixtureId = String(card.fixtureId || "").padStart(2, "0");
  const outputType = typeById.get(fixtureId);
  if (!outputType) throw new Error(`scan: card fixture ${fixtureId} has no output type`);
  const statement = card.statement;
  if (typeof statement !== "string" || !statement.trim()) {
    throw new Error(`scan: fixture ${fixtureId} index ${card.index} has no statement`);
  }
  const key = `${fixtureId}:${card.index}`;
  const quoted = quotationRanges(statement);
  const raised = scanMechanics({ statement, outputType });
  const codes = new Set(modelCodes(card));

  const percentHits = spelledPercentHits(statement);
  const percentRaised = raised.filter((row) => row.concernCode === "percentage_notation");
  for (const hit of percentHits) {
    if (inside(hit.start, hit.end, quoted)) buckets.percentage_notation.exempted += 1;
  }
  if (percentRaised.length) {
    buckets.percentage_notation.raisedStatements.add(key);
    buckets.percentage_notation.instances += percentRaised.length;
  }
  if (codes.has("percentage_notation")) buckets.percentage_notation.model.add(key);

  const dashHits = longDashHits(statement);
  const dashRaised = raised.filter((row) => row.concernCode === "em_dash");
  for (const hit of dashHits) {
    if (hit.quote === "\u2014") buckets.em_dash.em += 1;
    else buckets.em_dash.en += 1;
    if (inside(hit.start, hit.end, quoted)) buckets.em_dash.exempted += 1;
  }
  if (dashRaised.length) {
    buckets.em_dash.raisedStatements.add(key);
    buckets.em_dash.instances += dashRaised.length;
  }
  if (codes.has("em_dash")) buckets.em_dash.model.add(key);

  const slug = houseVoiceSlug(outputType);
  const pronounHits = firstPersonHits(statement);
  if (houseVoiceIsThirdPerson(slug) && pronounHits.length) buckets.first_person.rawThird += 1;
  if (!houseVoiceIsThirdPerson(slug) && pronounHits.length && (codes.has("first_person_plural") || codes.has("voice_consistency"))) {
    buckets.first_person.wrongHouse.push({ key, outputType, text: clip(statement) });
  }
  for (const hit of pronounHits) {
    if (houseVoiceIsThirdPerson(slug) && inside(hit.start, hit.end, quoted)) buckets.first_person.exempted += 1;
  }
  const personRaised = raised.filter((row) => row.concernCode === "first_person_plural" || row.concernCode === "voice_consistency");
  if (personRaised.length) {
    buckets.first_person.raisedStatements.add(key);
    buckets.first_person.instances += personRaised.length;
  }
  const modelPerson = codes.has("first_person_plural") || (codes.has("voice_consistency") && pronounHits.length > 0);
  if (modelPerson && houseVoiceIsThirdPerson(slug)) buckets.first_person.model.add(key);

  if (!houseVoiceIsThirdPerson(slug)) {
    for (const row of personRaised) {
      wrong.push({ rule: row.concernCode, key, quote: row.quote, why: "house voice permits first person" });
    }
  }
}

function missedAndOnly(bucket) {
  for (const key of bucket.raisedStatements) {
    if (!bucket.model.has(key)) bucket.missed.push(key);
  }
  for (const key of bucket.model) {
    if (!bucket.raisedStatements.has(key)) bucket.modelOnly.push(key);
  }
}
missedAndOnly(buckets.percentage_notation);
missedAndOnly(buckets.em_dash);
missedAndOnly(buckets.first_person);

const detail = [];
for (const card of cards) {
  const fixtureId = String(card.fixtureId || "").padStart(2, "0");
  const outputType = typeById.get(fixtureId);
  const key = `${fixtureId}:${card.index}`;
  const raised = scanMechanics({ statement: card.statement, outputType });
  const model = new Set(modelCodes(card));
  for (const row of raised) {
    const modelHas = row.concernCode === "first_person_plural" || row.concernCode === "voice_consistency"
      ? model.has("first_person_plural") || model.has("voice_consistency")
      : model.has(row.concernCode);
    if (modelHas) continue;
    detail.push(`- ${row.concernCode} ${key} quote=${JSON.stringify(show(row.quote))} ${clip(card.statement)}`);
  }
}

const percent = buckets.percentage_notation;
const dash = buckets.em_dash;
const person = buckets.first_person;

const body = [
  "# B444 scan",
  "",
  "Dry scan of the 261 stored statements in `scripts/diagnostic/b441/pass-1.json`. No model call. The counts below are what the new detectors raise. They are the predicted contribution of the next paid pass, before a later source-awareness drop.",
  "",
  REASONING.trim(),
  "",
  "## Counts",
  "",
  line(
    "percentage_notation",
    percent.raisedStatements.size,
    percent.instances,
    percent.model.size,
    percent.missed.length,
    percent.modelOnly.length,
    percent.exempted
  ),
  `Spelled percentages before the quotation exemption: ${percent.instances + percent.exempted} instances.`,
  "",
  line(
    "em_dash",
    dash.raisedStatements.size,
    dash.instances,
    dash.model.size,
    dash.missed.length,
    dash.modelOnly.length,
    dash.exempted
  ),
  `The existing class matches ${dash.em} em dashes and ${dash.en} en dashes, before the quotation exemption.`,
  "",
  line(
    "first person (first_person_plural and voice_consistency)",
    person.raisedStatements.size,
    person.instances,
    person.model.size,
    person.missed.length,
    person.modelOnly.length,
    person.exempted
  ),
  `Statements in a third-person output type that contain a first-person plural pronoun, before the quotation exemption: ${person.rawThird}.`,
  `Stored model concerns on investor_letter or linkedin_post where the statement contains a pronoun: ${person.wrongHouse.length}. The scan raises none of these.`,
  "",
  "## Judged wrong",
  "",
  wrong.length
    ? wrong.map((row) => `- ${row.rule} ${row.key} ${row.why}`).join("\n")
    : "None. Every concern the scan raises is a spelled percentage, a long dash outside quotation marks, or a first-person plural pronoun in a third-person output type, outside quotation marks.",
  "",
  "## Raised where the model was silent",
  "",
  detail.length ? detail.join("\n") : "None.",
  "",
  "## Model concerns the scan does not raise",
  "",
  `percentage_notation: ${percent.modelOnly.join(", ") || "none"}.`,
  `em_dash: ${dash.modelOnly.join(", ") || "none"}.`,
  `first person: ${person.modelOnly.join(", ") || "none"}.`,
  "",
].join("\n");

writeFileSync(OUT, body);
process.stdout.write(`Wrote ${OUT}\n`);
process.stdout.write(`percentage statements ${percent.raisedStatements.size} instances ${percent.instances} model ${percent.model.size} missed ${percent.missed.length} exempt ${percent.exempted}\n`);
process.stdout.write(`dash statements ${dash.raisedStatements.size} instances ${dash.instances} model ${dash.model.size} missed ${dash.missed.length} em ${dash.em} en ${dash.en} exempt ${dash.exempted}\n`);
process.stdout.write(`person statements ${person.raisedStatements.size} instances ${person.instances} model ${person.model.size} missed ${person.missed.length} rawThird ${person.rawThird} wrongHouse ${person.wrongHouse.length} exempt ${person.exempted}\n`);
