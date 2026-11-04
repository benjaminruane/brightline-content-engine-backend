/**
 * B474. Which layers are given the source, and which rules need source they never see.
 * Read of the code and of the stored B464 pass. No model call. No product change.
 *
 *   node scripts/diagnostic/b474/audit-source-provision.mjs
 */
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import editorialRules from "../../../lib/rulebook/editorialRules.js";
import complianceRules from "../../../lib/rulebook/complianceRules.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "../../..");
const PASS = path.join(__dirname, "../b464/pass-1.json");
const RESULT = path.join(__dirname, "RESULT.md");

const MENTION = /\b(source|sources|passage|quotation|quote|quotes)\b/i;

const MARKERS = [
  {
    layer: "Stage 1, statement split",
    receives: "Nothing. The call takes the draft.",
    file: "lib/qc/pipeline-v4/stage1-extract-statements.mjs",
    marker: "export async function extractStatements({ draftText, traceId })",
  },
  {
    layer: "Stage 2 matcher, one pair",
    receives: "The whole text of one source. The user prompt is Statement, then Source, then that text.",
    file: "lib/qc/pipeline-v4/stage2-match-sources.mjs",
    marker: "async function matchSingleSource(statement, sourceText, options = {})",
  },
  {
    layer: "Stage 2 matcher, the loop",
    receives: "One pair per statement and per source. Each pair carries that source's text only.",
    file: "lib/qc/pipeline-v4/stage2-match-sources.mjs",
    marker: "sourceText: src.text,",
  },
  {
    layer: "Stage 2 claim matcher",
    receives: "The same one-source call. A claim is matched to one source text.",
    file: "lib/qc/pipeline-v4/stage2-match-sources.mjs",
    marker: "export async function matchClaimSourcePairs(",
  },
  {
    layer: "Widened passage pass",
    receives: "The whole text of one source, in a prompt headed Source.",
    file: "lib/qc/pipeline-v4/stage2-match-multipassage.mjs",
    marker: "export async function matchMultipassagePair({",
  },
  {
    layer: "As-of date",
    receives: "The whole text of one source, once per source, before any comparison.",
    file: "lib/qc/pipeline-v4/index.mjs",
    marker: "asOfBySourceIndex[i] = extractSourceAsOfDate(text);",
  },
  {
    layer: "Supersession",
    receives: "Match records for the statement, and the as-of date already taken from each source. Not the document text. It returns immediately when fewer than two match records are present.",
    file: "lib/qc/supersession.mjs",
    marker: "if (matches.length < 2) return { ...EMPTY };",
  },
  {
    layer: "Intra-source reducer",
    receives: "The source array. It reads a source's text field. The call is in process, not a model prompt.",
    file: "lib/qc/pipeline-v4/intra-source-reducer.mjs",
    marker: 'return typeof src?.text === "string" ? src.text : "";',
  },
  {
    layer: "Second-value spans",
    receives: "The source array. It slices one source's text around a figure. The call is in process, not a model prompt.",
    file: "lib/qc/pipeline-v4/second-value.mjs",
    marker: 'const text = typeof srcs[sourceIndex]?.text === "string" ? srcs[sourceIndex].text : "";',
  },
  {
    layer: "Excerpt selection",
    receives: "The source array. It slices one span with source.slice(start, end) and keeps that passage. The call is in process, not a model prompt.",
    file: "lib/qc/pipeline-v4/stage4-select-excerpts.mjs",
    marker: "return src.slice(start, end);",
  },
  {
    layer: "Editorial field, v4 main path",
    receives: "A selected passage: the primary excerpt, prefixed with its label. Null when that passage is missing.",
    file: "lib/qc/pipeline-v4/index.mjs",
    marker: "const editorialSourceExcerpt =",
  },
  {
    layer: "Editorial field, v4 skipped-evidence path",
    receives: "Null. This path assigns the field to null.",
    file: "lib/qc/pipeline-v4/index.mjs",
    marker: "editorialSourceExcerpt: null,",
  },
  {
    layer: "Editorial field, v3",
    receives: "A selected passage, the primary excerpt, or null when that passage is missing. Same shape as the v4 main path.",
    file: "lib/qc/pipeline-v3/qc-pipeline-v3.mjs",
    marker: "const editorialSourceExcerpt =",
  },
  {
    layer: "Editorial prompt",
    receives: "Nothing of the source. The payload builder discards the excerpt and the evidence block.",
    file: "lib/qc/editorial-compliance-reviewer.mjs",
    marker: "void sourceExcerpt;",
  },
  {
    layer: "Editorial style prompt",
    receives: "Nothing of the source. The style payload builder discards the excerpt and the evidence block.",
    file: "lib/qc/editorial-compliance-reviewer.mjs",
    marker: "void evidenceExcerpt;",
  },
  {
    layer: "Compliance prompt",
    receives: "A name and a publication state for each source that has one. Not the source text.",
    file: "lib/source-publication-state.mjs",
    marker: "return `\\n\\nSOURCE PUBLICATION STATE\\n${lines.join(\"\\n\")}`;",
  },
  {
    layer: "Editorial source awareness",
    receives: "Selected passages already on the card: primary excerpt, conflict excerpt, support spans, and match passages. Not the whole document.",
    file: "lib/qc/pipeline-v3/stage7-assemble-card.mjs",
    marker: "passages: matchedPassagesFromCard({",
  },
  {
    layer: "Reading note",
    receives: "The whole text of every source, joined with a newline. The joiner adds no document label.",
    file: "lib/qc/reading-review.mjs",
    marker: 'return texts.join("\\n");',
  },
  {
    layer: "Route selector",
    receives: "v4 when QC_PIPELINE_V4 is exactly 1, or the request sets pipelineRoute to v4. Otherwise v3.",
    file: "api/analyse-statements.js",
    marker: 'process.env.QC_PIPELINE_V4 === "1" || (body?.options && body.options.pipelineRoute === "v4")',
  },
  {
    layer: "Supersession notes, v4",
    receives: "The notes resolveSupersession returned. An empty array when it returned none.",
    file: "lib/qc/pipeline-v4/index.mjs",
    marker: "supersededSourceNotes: Array.isArray(resolved.supersededNotes) ? resolved.supersededNotes : [],",
  },
];

function lineOf(file, marker) {
  const abs = path.join(ROOT, file);
  const text = readFileSync(abs, "utf8");
  const lines = text.split("\n");
  const at = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(marker)) at.push(i + 1);
  }
  return at;
}

function ruleText(rule) {
  const notes = rule.reviewerNoteByOutput ? Object.values(rule.reviewerNoteByOutput) : [];
  return [rule.description, rule.reviewerNote, rule.fixDirection, ...notes].filter((part) => typeof part === "string").join("\n");
}

function mentionWords(text) {
  const found = new Set();
  for (const match of text.matchAll(/\b(source|sources|passage|quotation|quote|quotes)\b/gi)) {
    found.add(match[1].toLowerCase());
  }
  return [...found];
}

function classify(rule, text) {
  const words = mentionWords(text);
  if (words.length === 0) return null;
  if (/cannot see the source|is not assessed here|Never compare the statement against source/i.test(text)) {
    return {
      requires: false,
      why: "The wording names the source in order to forbid reading it.",
      words,
    };
  }
  if (rule.id === "comparative_claim_without_basis") {
    return {
      requires: false,
      why: "Source here is a citation in the same sentence, not the uploaded document.",
      words,
    };
  }
  if (rule.id === "voice_consistency") {
    return {
      requires: false,
      why: "Quotation here is speech already in the draft, not a source passage.",
      words,
    };
  }
  if (words.every((word) => word === "quote" || word === "quotes")) {
    return {
      requires: false,
      why: "Quote here means repeat the draft's own words in the fix. It does not ask what a source states.",
      words,
    };
  }
  if (/the source reports|whether the source carries|what the source/i.test(text)) {
    return { requires: true, why: "The wording asks what the source reports.", words };
  }
  return {
    requires: true,
    why: "The wording names the source and does not forbid reading it.",
    words,
  };
}

function codesFrom(list) {
  const out = [];
  for (const row of Array.isArray(list) ? list : []) {
    const code = typeof row?.concernCode === "string" ? row.concernCode : typeof row?.code === "string" ? row.code : "";
    if (code) out.push(code);
  }
  return out;
}

function gitFact(rev, ancestorOf) {
  try {
    execSync(`git merge-base --is-ancestor ${rev} ${ancestorOf}`, { cwd: ROOT, stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function excerptEmpty(card) {
  const pe = card?.primaryExcerpt;
  if (typeof pe === "string") return pe.trim() === "";
  if (pe && typeof pe.passage === "string") return pe.passage.trim() === "";
  return true;
}

const pass = JSON.parse(readFileSync(PASS, "utf8"));
const cards = Array.isArray(pass.cards) ? pass.cards : [];
const editorialCounts = new Map();
const complianceCounts = new Map();
const versions = new Map();
let notesWritten = 0;
let excerptMissing = 0;
let multiSource = 0;
for (const card of cards) {
  const version = typeof card?.pipelineVersion === "string" ? card.pipelineVersion : "(none)";
  versions.set(version, (versions.get(version) || 0) + 1);
  for (const code of codesFrom(card.editorialConcerns)) {
    editorialCounts.set(code, (editorialCounts.get(code) || 0) + 1);
  }
  for (const code of codesFrom(card.complianceConcerns)) {
    complianceCounts.set(code, (complianceCounts.get(code) || 0) + 1);
  }
  if (Array.isArray(card.supersededSourceNotes) && card.supersededSourceNotes.length > 0) notesWritten += 1;
  if (excerptEmpty(card)) excerptMissing += 1;
  const prints = Array.isArray(card.stage2SourceFingerprints) ? card.stage2SourceFingerprints.length : 0;
  if (prints > 1) multiSource += 1;
}

const books = [
  { book: "editorial", rules: editorialRules, counts: editorialCounts, given: "Nothing. The prompt discards the excerpt." },
  { book: "compliance", rules: complianceRules, counts: complianceCounts, given: "A publication state and a name. Not the text." },
];

const mentioned = [];
for (const book of books) {
  for (const rule of book.rules) {
    const text = ruleText(rule);
    const decision = classify(rule, text);
    if (!decision) continue;
    mentioned.push({
      book: book.book,
      id: rule.id,
      requires: decision.requires,
      why: decision.why,
      words: decision.words.join(", "),
      given: book.given,
      fired: book.counts.get(rule.id) || 0,
    });
  }
}

const markerRows = MARKERS.map((row) => {
  const at = lineOf(row.file, row.marker);
  return { ...row, lines: at };
});
const missingMarkers = markerRows.filter((row) => row.lines.length === 0);

const voidBeforePass = gitFact("b3719298", "273b678b");
const nullAssignBeforePass = gitFact("e63c7252", "273b678b");

const lines = [];
lines.push("# B474. Which layers are given the source");
lines.push("");
lines.push("Read of the code and of `scripts/diagnostic/b464/pass-1.json`. No model call. USD 0. No product code, prompt, rule, or test was changed.");
lines.push("");
lines.push(`Stored pass: ${cards.length} cards. gitSha on the file: ${pass.gitSha}.`);
lines.push("");
lines.push("## What each layer receives");
lines.push("");
lines.push("| Layer | What it receives | Call site |");
lines.push("| --- | --- | --- |");
for (const row of markerRows) {
  const where = row.lines.length ? row.lines.map((n) => `${row.file}:${n}`).join(", ") : `${row.file} (marker not found)`;
  lines.push(`| ${row.layer} | ${row.receives} | ${where} |`);
}
lines.push("");
lines.push("The editorial and style prompts are the layers that decide the rulebook. Both discard the excerpt before the model sees the message. `buildEditorialUserPayload` voids `sourceExcerpt` and `evidenceBlock`. `buildEditorialStyleUserPayload` voids `evidenceExcerpt` and `evidenceBlock`. v4 sets `pipelineRoute` to `v4`, so it takes the style payload. v3 takes the editorial payload. The discard is in both.");
lines.push("");
lines.push("Mechanics scan does not take a document. The word source in `lib/qc/mechanics-scan.mjs` is a regular expression's `.source` property. It was not given a row because it is not handed source material.");
lines.push("");
lines.push("## Two sources at once");
lines.push("");
lines.push("A model prompt is given two source texts in one call in one place. `readingSourceText` joins every source's text with a newline and the reading note is asked to compare one statement with that string. The joiner does not add a label saying which document a sentence came from. The prompt says to compare the statement with the source. It does not ask whether one source revises another. Whether the model would notice a revision inside that string was not run.");
lines.push("");
lines.push("The matcher is not that place. `matchAllSources` builds one call per statement per source, and `matchSingleSource` puts one `sourceText` under Source. The widened pass does the same in `matchMultipassagePair`. A card can still carry more than one source fingerprint, because the pairs are stored together after the calls return.");
lines.push("");
lines.push(`Cards on this pass with more than one stage-2 source fingerprint: ${multiSource} of ${cards.length}. That count is stored pair records, not one prompt that held two documents.`);
lines.push("");
lines.push("In process, these functions are handed the source array: excerpt selection, the intra-source reducer, second-value spans, and the compliance publication block. Supersession is handed the match records from every source for that statement, not the documents.");
lines.push("");
lines.push("## A later source revising an earlier one");
lines.push("");
lines.push("`resolveSupersession` is the stage whose job is a later source and an earlier one. It runs after the verdict, in `lib/qc/pipeline-v4/index.mjs`, and again for claim matches. It compares figures and periods on the match records, using the as-of date taken from each source on its own. It does not read the two documents. A recommendation in one source and a completion in a later source is not a figure, so this stage does not see it.");
lines.push("");
lines.push("To notice that kind of revision it would have to be given the text of both sources, or the passage from each that states the transaction, and which source is later.");
lines.push("");
lines.push("The field that stores the result is `supersededSourceNotes`. v4 assigns whatever `resolveSupersession` returned, at `lib/qc/pipeline-v4/index.mjs`. The fallback card `safeCard` in `lib/qc/pipeline-v3/stage7-assemble-card.mjs` starts that field as an empty array. The assembled card copies `entry.supersededSourceNotes` when the entry has an array. `buildSkippedEvidenceQcCard` does not set the field.");
lines.push("");
lines.push(`Cards on this pass with a non-empty supersededSourceNotes array: ${notesWritten} of ${cards.length}. The writer exists. On this pass it recorded nothing.`);
lines.push("");
lines.push("## The null excerpt, and which pipeline runs");
lines.push("");
lines.push("Two pipelines are in the repo. v4 is `runPipelineV4` in `lib/qc/pipeline-v4/index.mjs`. v3 is `runPipelineV3` in `lib/qc/pipeline-v3/qc-pipeline-v3.mjs`. `api/analyse-statements.js` runs v4 when `QC_PIPELINE_V4` is exactly `1`, or when the request sets `options.pipelineRoute` to `v4`. Otherwise it runs v3. An unset flag is v3.");
lines.push("");
lines.push("This read did not call the live health endpoint, so the deployed value of the flag was not re-measured. The operating manual says production sets the flag to 1. The switch census says the same, from an earlier health read. Those are documents, not a measurement taken for this spec.");
lines.push("");
const versionBits = [...versions.entries()].map(([name, count]) => `${name} ${count}`).join(", ");
lines.push(`The stored pass records pipelineVersion on the card: ${versionBits}. That pass was produced by v4.`);
lines.push("");
lines.push("The excerpt field is not null on every v4 path. The main path sets it to the primary excerpt passage, or to null when that passage is missing (`lib/qc/pipeline-v4/index.mjs`, the `const editorialSourceExcerpt` assignment). The skipped-evidence path assigns `editorialSourceExcerpt: null`. v3 sets the same passage-or-null value as the v4 main path. The prompt then discards the field on both pipelines, so the model is given nothing either way.");
lines.push("");
lines.push(`The commit that discards the excerpt is b3719298 (B178). It is an ancestor of the pass sha 273b678b: ${voidBeforePass ? "yes" : "no"}. The commit that assigns null on the skipped-evidence path is e63c7252. It is an ancestor of that sha: ${nullAssignBeforePass ? "yes" : "no"}. The firing counts below are from a pass whose prompt builder already discarded the excerpt.`);
lines.push("");
lines.push(`Cards whose assembled primaryExcerpt is empty: ${excerptMissing} of ${cards.length}. The card does not store the editorialSourceExcerpt field, so this is the assembled excerpt, not a log of the prompt. An empty assembled excerpt is the case where the main path would have set the field to null before the prompt discarded it.`);
lines.push("");
lines.push("## Rules whose wording names the source");
lines.push("");
lines.push("A rule is listed when its description, reviewer note, or fix direction contains source, passage, quotation, or quote. Editorial rules: " + editorialRules.length + ". Compliance rules: " + complianceRules.length + ". Listed: " + mentioned.length + ".");
lines.push("");
lines.push("| Rule | Book | Words | Requires a reading of the source | What the layer is given | Fired on this pass | Why |");
lines.push("| --- | --- | --- | --- | --- | --- | --- |");
for (const row of mentioned) {
  lines.push(`| ${row.id} | ${row.book} | ${row.words} | ${row.requires ? "yes" : "no"} | ${row.given} | ${row.fired} | ${row.why} |`);
}
lines.push("");
lines.push("Rules that do not contain those words were not listed. `material_omission` and `selective_presentation_of_data` talk about a missing counter-fact. They do not name the source, the passage, or a quotation, so they are outside this test.");
lines.push("");
lines.push("## Rules that cannot do their job as wired");
lines.push("");
const blocked = mentioned.filter((row) => row.requires);
if (blocked.length === 0) {
  lines.push("None. No listed rule both requires the source and runs in a layer given none, or given only a passage.");
} else {
  for (const row of blocked) {
    lines.push(`- ${row.id} (${row.book}) requires the source text. Its layer is given none: the prompt discards the excerpt. It fired ${row.fired} time${row.fired === 1 ? "" : "s"} on this pass, across ${cards.length} cards.`);
  }
}
lines.push("");
lines.push("The editorial source-awareness step can drop a concern after the model has fired, by looking at passages already matched to the card. That step is not the rule. It does not give the rule the source.");
lines.push("");
lines.push("## What this read could not settle");
lines.push("");
lines.push("The deployed value of `QC_PIPELINE_V4` was not re-measured. No request was sent.");
lines.push("");
lines.push("Whether the reading note would notice one source revising another, if both texts are in the joined string, was not run.");
lines.push("");
lines.push("The stored card does not record the editorial prompt, so the empty-excerpt count above is the assembled passage, not the bytes sent to the model. The discard itself is in the source, and that commit is an ancestor of the pass.");
lines.push("");
if (missingMarkers.length) {
  lines.push("## Markers not found");
  lines.push("");
  for (const row of missingMarkers) {
    lines.push(`- ${row.layer}: \`${row.marker}\` was not found in ${row.file}.`);
  }
  lines.push("");
}
lines.push("No product code, prompt, rule, or test was changed.");
lines.push("");

writeFileSync(RESULT, lines.join("\n"));
console.log(`cards ${cards.length}`);
console.log(`versions ${versionBits}`);
console.log(`notes ${notesWritten} excerptEmpty ${excerptMissing} multi ${multiSource}`);
console.log(`mentioned ${mentioned.map((row) => `${row.id}:${row.fired}:${row.requires}`).join(" ")}`);
console.log(`markers missing ${missingMarkers.length}`);
console.log(`void ${voidBeforePass} nullAssign ${nullAssignBeforePass}`);
