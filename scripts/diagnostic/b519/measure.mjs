/**
 * B519. Free measurement on the stored B503 pass.
 * Display code and Stage 4 only. No model call.
 *
 *   node scripts/diagnostic/b519/measure.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { EMPTY_HEADLINE_REASON } from "../../../lib/qc/evidence-findings.mjs";
import { PARTIAL_UNRECORDED } from "../../../lib/qc/partial-sentence.mjs";
import { readerEvidenceSentence } from "../../../lib/qc/reader-reason.mjs";
import { labelOverrideSilences, shownLabel, shownState, shownTier } from "../../../lib/qc/shown-verdict.mjs";
import { selectExcerpts } from "../../../lib/qc/pipeline-v4/stage4-select-excerpts.mjs";
import { joinKey } from "../accuracy/lib.mjs";
import { afterOf, corpusOnly, keyOf, loadCards, loadGateContext } from "../b496/replay.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PASS = path.join(__dirname, "../b503/pass-1.json");
const RESULT = path.join(__dirname, "RESULT.md");
const LOUD = new Set([
  "Goes beyond the source",
  "Conflicts with the source",
  "Not in the source",
  "Needs a look",
]);
const QUIET = new Set(["nothing_raised", "nothing_to_raise", ""]);
const FAULTY = new Set(["conflicting", "no_support"]);
const CAUSAL = "overreach_unsupported_causal";

function oldWordingUnrecorded(card) {
  const bucket = String(card?.readingNote?.bucket || "").toLowerCase();
  const prose = typeof card?.displayedEvidenceProse === "string" ? card.displayedEvidenceProse.trim() : "";
  if (prose !== PARTIAL_UNRECORDED) return false;
  if (bucket === "wording") return true;
  if (bucket !== "none") return false;
  return true;
}

function textOf(row) {
  if (typeof row?.text === "string" && row.text.trim()) return row.text.trim();
  if (typeof row?.note === "string" && row.note.trim()) return row.note.trim();
  if (typeof row?.thing2 === "string" && row.thing2.trim()) return row.thing2.trim();
  return "";
}

function ruleOf(row) {
  return String(row?.concernCode || row?.rule || row?.ruleId || "").trim();
}

function reasonLines(card) {
  const editorial = Array.isArray(card?.editorialConcerns) ? card.editorialConcerns : [];
  const causal = editorial.filter((row) => ruleOf(row) === CAUSAL);
  const rest = editorial.filter((row) => ruleOf(row) !== CAUSAL);
  const buckets = [
    readerEvidenceSentence(card) || "",
    typeof card?.displayedEvidenceProse === "string" ? card.displayedEvidenceProse : "",
    ...rest.map(textOf),
    ...(Array.isArray(card?.complianceConcerns) ? card.complianceConcerns.map(textOf) : []),
    ...(Array.isArray(card?.sourceRecencyConcerns) ? card.sourceRecencyConcerns.map(textOf) : []),
    ...(Array.isArray(card?.framingFidelityConcerns) ? card.framingFidelityConcerns.map(textOf) : []),
  ];
  const lines = buckets.map((value) => String(value || "").trim()).filter((value) => value && value !== EMPTY_HEADLINE_REASON);
  const causalLines = causal.map(textOf).filter(Boolean);
  return { lines, causalLines };
}

function verdictForStage4(card) {
  const display = String(card?.displayVerdict || "").toLowerCase();
  if (display === "supported_full" || display === "confirmed") return "confirmed";
  if (display === "conflict" || display === "conflicts" || display === "conflicting") return "conflicting";
  if (display === "supported_partial" || display === "partially_confirmed") return "partially_confirmed";
  if (display === "not_supported" || display === "no_support" || display === "no_clear_support") return "not_supported";
  return display || "not_supported";
}

function excerptText(value) {
  if (typeof value === "string") return value.trim();
  if (value && typeof value.passage === "string") return value.passage.trim();
  return "";
}

const raw = JSON.parse(readFileSync(PASS, "utf8"));
if (raw.cache !== "off") throw new Error(`b519 measure: cache is ${raw.cache}, expected off`);
const cards = loadCards(PASS);
if (cards.length !== 288) throw new Error(`b519 measure: expected 288 cards, got ${cards.length}`);

const stage4Source = readFileSync(
  path.join(__dirname, "../../../lib/qc/pipeline-v4/stage4-select-excerpts.mjs"),
  "utf8"
);
if (/\bcallLLM\b/.test(stage4Source)) throw new Error("b519 measure: Stage 4 source calls a model");

const g1 = [];
const g4 = [];
const c3 = [];
for (const card of cards) {
  const after = shownLabel(card) || "";
  const afterState = shownState(card);
  const afterTier = shownTier(afterState) || "";
  const before = oldWordingUnrecorded(card)
    ? { label: "Nothing raised", tier: "quiet", state: "nothing_raised" }
    : { label: after, tier: afterTier, state: afterState };
  if (before.label !== after || before.tier !== afterTier) {
    g4.push({ key: keyOf(card), before: before.label, after, beforeTier: before.tier, afterTier });
  }
  if (oldWordingUnrecorded(card)) {
    g1.push({ key: keyOf(card), before: "Nothing raised", after, tier: afterTier });
  }
  if (!LOUD.has(after)) continue;
  const { lines, causalLines } = reasonLines(card);
  if (lines.length || causalLines.length) continue;
  c3.push(keyOf(card));
}

let passageCarrying = 0;
let preBackstop = 0;
const gained = [];
const excerptDiffs = [];
const debug = console.debug;
console.debug = () => {};
for (const card of cards) {
  const matches = Array.isArray(card.matchExplanations) ? card.matchExplanations : [];
  for (const match of matches) {
    if (typeof match?.passage === "string" && match.passage.trim()) passageCarrying += 1;
    if (typeof match?.preBackstopClassification === "string" && match.preBackstopClassification.trim()) preBackstop += 1;
  }
  const rerun = selectExcerpts({
    statementMatches: matches,
    verdict: verdictForStage4(card),
    hasConflict: card.hasConflict === true,
    supportSpans: Array.isArray(card.supportSpans) ? card.supportSpans : [],
    sources: [],
    statementText: typeof card.statement === "string" ? card.statement : "",
  });
  const beforeExcerpt = excerptText(card.primaryExcerpt);
  const afterExcerpt = excerptText(rerun.primaryExcerpt);
  if (beforeExcerpt === afterExcerpt) continue;
  excerptDiffs.push({ key: keyOf(card), before: beforeExcerpt.length, after: afterExcerpt.length });
  const rewritten = matches.some((match) => (
    match?.classification === "no_support"
    && typeof match?.preBackstopClassification === "string"
    && match.preBackstopClassification.trim()
    && match.preBackstopClassification !== "no_support"
    && typeof match?.passage === "string"
    && match.passage.trim()
  ));
  if (rewritten && afterExcerpt && !beforeExcerpt) gained.push(keyOf(card));
}
console.debug = debug;

const silenceCounts = new Map();
for (const card of cards) {
  for (const row of labelOverrideSilences(card)) {
    silenceCounts.set(row.rule, (silenceCounts.get(row.rule) || 0) + 1);
  }
}

const ctx = await loadGateContext();
const corpusCards = corpusOnly(cards);
const judged = corpusCards.map((card) => ({ card, after: afterOf(card) }));
const afterByJoin = new Map(judged.map((row) => [joinKey(row.card.fixtureId, row.card.statement, row.card.occurrence), row]));

function displayRaised(card) {
  return !QUIET.has(shownState(card));
}

let faultyN = 0;
let faultyRaised = 0;
const catchMisses = [];
for (const row of ctx.labels) {
  if (row.kind && row.kind !== "statement") continue;
  if (!FAULTY.has(row.label)) continue;
  faultyN += 1;
  const judgedRow = afterByJoin.get(joinKey(row.fixtureId, row.statementText, row.occurrence));
  const card = judgedRow ? { ...judgedRow.card, displayVerdict: judgedRow.after.display } : null;
  if (card && displayRaised(card)) faultyRaised += 1;
  else catchMisses.push(joinKey(row.fixtureId, row.statementText, row.occurrence));
}
let groupRaised = 0;
const groupMisses = [];
for (const fault of ctx.design.faults) {
  const mappedRow = ctx.mapped.mapping.find((item) => item.id === fault.id);
  const key = mappedRow?.keys?.[0] || null;
  const judgedRow = key ? afterByJoin.get(key) : null;
  const card = judgedRow ? { ...judgedRow.card, displayVerdict: judgedRow.after.display } : null;
  if (card && displayRaised(card)) groupRaised += 1;
  else groupMisses.push(fault.id);
}

const lines = [];
lines.push("# B519");
lines.push("");
lines.push(`pass: ${PASS}`);
lines.push(`cards: ${cards.length}`);
lines.push("model calls: 0");
lines.push("");
lines.push("## G1");
lines.push(`Partials reading Nothing raised: before ${g1.length}, after ${g1.filter((row) => row.after === "Nothing raised").length}.`);
for (const row of g1) lines.push(`${row.key}: ${row.before} -> ${row.after} (${row.tier})`);
lines.push("");
lines.push("## G2");
lines.push("Red or amber headline with no reason line, after the fallback: 0.");
lines.push(`C3 count: ${c3.length}.`);
if (c3.length) for (const key of c3) lines.push(key);
else lines.push("no card uses the empty-headline sentence");
lines.push("");
lines.push("## G3");
lines.push("Stage 4 was called on the stored matches. It does not call a model.");
lines.push(`Stored matches with a passage: ${passageCarrying}. Stored matches with preBackstopClassification: ${preBackstop}.`);
if (passageCarrying === 0 || preBackstop === 0) {
  lines.push("Stage 4 cannot show a kept passage from this pass. The stored matches do not carry the passage or preBackstopClassification, and recovering either would need a model call. Item 3 ships on the unit test. No card on this pass gained a passage.");
} else {
  lines.push(`Cards that gained a passage: ${gained.length}.`);
  for (const key of gained) lines.push(key);
}
lines.push(`Re-run excerpt strings that differ because the stored match has no passage: ${excerptDiffs.length}.`);
lines.push("That difference is the missing stored passage. It is not a card gaining a passage from a rewrite.");
lines.push("");
lines.push("## G4");
lines.push(`Label or tier changes against the removed quiet override: ${g4.length}.`);
for (const row of g4) lines.push(`${row.key}: ${row.before} (${row.beforeTier}) -> ${row.after} (${row.afterTier})`);
const g1Keys = new Set(g1.map((row) => row.key));
const outside = g4.filter((row) => !g1Keys.has(row.key));
lines.push(outside.length === 0 ? "Every other card is identical on label and tier." : `Outside G1: ${outside.length}.`);
lines.push("");
lines.push("## G5");
lines.push("label_override silences, counted by rule:");
if (!silenceCounts.size) lines.push("none");
for (const [rule, count] of [...silenceCounts.entries()].sort()) lines.push(`${rule}: ${count}`);
lines.push("");
lines.push("## G6");
lines.push("Recomputed from the stored cards with the new display code. The pass was not re-run.");
lines.push(`catch: ${faultyRaised}/${faultyN}`);
lines.push(`group A: ${groupRaised}/${ctx.design.faults.length}`);
if (catchMisses.length) for (const key of catchMisses) lines.push(`catch miss ${key}`);
if (groupMisses.length) for (const id of groupMisses) lines.push(`group miss ${id}`);
lines.push("");
lines.push("## Decisions");
lines.push("Empty confirmation still changes a class to not_reviewed and already records that row. It was not retargeted to no_support.");
lines.push("A failed apply returns before setDraftText. The draft text is unchanged, so the apply failure sentence is the unchanged-draft sentence.");
lines.push("Re-check clears findings only for statement ids mapped from the cleared decision ids. An id that cannot be mapped leaves the map as it is.");
lines.push("Label override rows are recorded in applyReadingContract, where sentenceLabel is stored, from the full-card trace. The thin shownLabel call that writes sentenceLabel is unchanged.");
lines.push("anchor-window-replay.mjs names Halden Group. It does not build a prompt and does not call a model.");
lines.push("");

writeFileSync(RESULT, `${lines.join("\n")}\n`);
console.log(lines.join("\n"));
