/**
 * B379 Part 1. Read-only. Does a card affirm a phrase it also flags,
 * or a phrase the author did not write?
 *
 * The comment is qcCard.evidenceSummary. Nothing in lib/ is imported.
 * A similarity or overlap number here is a measurement of these stored
 * cards. It is not a product rule.
 *
 * Run: node scripts/diagnostic/b379/affirm-guards.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

const PAYLOADS = [
  ["2026-09-29/clean", "clean", "tests/fixtures/real-runs-2026-09-29/clean-review.json"],
  ["2026-09-29/doc", "doctored", "tests/fixtures/real-runs-2026-09-29/doc-review.json"],
  ["2026-10-02/doc", "doctored", "tests/fixtures/real-runs-2026-10-02/doc-review.json"],
  ["2026-10-04-hicl/clean", "clean", "tests/fixtures/real-runs-2026-10-04-hicl/clean-review.json"],
  ["2026-10-04-hicl/doc", "doctored", "tests/fixtures/real-runs-2026-10-04-hicl/doc-review.json"],
  ["2026-10-06-gpi/doc", "doctored", "tests/fixtures/real-runs-2026-10-06-gpi/doc-review.json"],
  ["2026-10-06-gpi/clean-run2", "clean", "tests/fixtures/real-runs-2026-10-06-gpi/clean-run2-review.json"],
  ["2026-10-06-gpi/clean-run3", "clean", "tests/fixtures/real-runs-2026-10-06-gpi/clean-run3-review.json"],
  ["2026-10-06-gpi/clean-run4", "clean", "tests/fixtures/real-runs-2026-10-06-gpi/clean-run4-review.json"],
  ["2026-10-06-gpi/clean-run5", "clean", "tests/fixtures/real-runs-2026-10-06-gpi/clean-run5-review.json"],
  ["2026-10-06-clearpoint/dirty1", "doctored", "tests/fixtures/real-runs-2026-10-06-clearpoint/dirty1-review.json"],
  ["2026-10-06-clearpoint/clean1", "clean", "tests/fixtures/real-runs-2026-10-06-clearpoint/clean1-review.json"],
  ["2026-10-06-clearpoint/clean2", "clean", "tests/fixtures/real-runs-2026-10-06-clearpoint/clean2-review.json"],
  ["2026-10-06-clearpoint/clean3", "clean", "tests/fixtures/real-runs-2026-10-06-clearpoint/clean3-review.json"],
];

const STOP = new Set(
  "a an the of to for in on at as from with and or by its their this that is are was were be been has have had will would can which while into over than also it not but these those per via within across about after before during between under our his her they them we you your such both more most other only just may might should shall do does did being its".split(
    " ",
  ),
);

function sentences(text) {
  let s = String(text || "").replace(/\s+/g, " ").trim();
  if (!s) return [];
  s = s.replace(/\b(St|Mr|Mrs|Ms|Dr|Inc|Ltd|No|vs|U\.S|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\./gi, "$1\u0000");
  return s
    .split(/(?<=[.!?])\s+(?=[A-Z"'])/)
    .map((part) => part.replace(/\u0000/g, ".").trim())
    .filter(Boolean);
}

function clausesOf(sentence) {
  return sentence
    .split(/\s*(?:;|(?:,\s*)?\b(?:but|however|although|whereas)\b)\s*/i)
    .map((part) => part.trim())
    .filter(Boolean);
}

function isInstruction(text) {
  return /\b(?:reviewer should|should (?:verify|consider|add|adjust|reconcile|ensure|either|find)|please verify|to fully support)\b/i.test(text);
}

function isNegated(clause) {
  return (
    /\b(?:does not|do not|did not|cannot|can not|fails to|is not|are not|was not|were not)\b/i.test(clause) ||
    /\b(?:not confirmed|not supported|unsupported|contradict|incorrectly|mismatch)\b/i.test(clause) ||
    /\bnot\s+(?:confirm|match|support|align)/i.test(clause)
  );
}

const TRIGGER_RES = [
  [/does confirm/i, "does confirm"],
  [/confirms that/i, "confirms that"],
  [/confirms the statement/i, "confirms the statement"],
  [/confirms/i, "confirms"],
  [/\bconfirm\b/i, "confirm"],
  [/is confirmed/i, "is confirmed"],
  [/are confirmed/i, "are confirmed"],
  [/are both supported/i, "are both supported"],
  [/are directly supported/i, "are directly supported"],
  [/directly supported/i, "directly supported"],
  [/are supported/i, "are supported"],
  [/is supported/i, "is supported"],
  [/supported by the source/i, "supported by the source"],
  [/directly supporting/i, "directly supporting"],
  [/supporting the (?:statement|claim)/i, "supporting the statement"],
  [/match(?:es)? the source/i, "match the source"],
  [/match(?:es)? the statement/i, "match the statement"],
  [/closely matches/i, "closely matches"],
  [/\bmatches\b/i, "matches"],
  [/\bmatch\b/i, "match"],
  [/aligns with/i, "aligns with"],
  [/align with/i, "align with"],
  [/\baligns\b/i, "aligns"],
  [/\balign\b/i, "align"],
];

function triggerOf(clause) {
  if (isInstruction(clause) || isNegated(clause)) return null;
  for (const [re, label] of TRIGGER_RES) {
    if (re.test(clause)) return label;
  }
  return null;
}

function cleanCapture(raw) {
  let t = String(raw || "").trim().replace(/[.]+$/, "").trim();
  t = t.split(/\s*,\s*which\s+/i)[0];
  t = t.split(/\s*,\s*directly supporting\b/i)[0];
  t = t.replace(/,?\s*as stated(?: in the statement)?$/i, "");
  t = t.replace(/,?\s*directly supporting the statement$/i, "");
  t = t.replace(/^the claim of\s+/i, "");
  t = t.replace(/^the statement that\s+/i, "");
  t = t.replace(/^that\s+/i, "");
  t = t.replace(/^both (?:the )?figures of\s+/i, "");
  t = t.replace(/^both financial figures,\s*/i, "");
  t = t.replace(/^(?:therefore|additionally|also),?\s+/i, "");
  t = t.replace(/[,]+$/g, "");
  return t.trim();
}

function splitShortAnd(phrase) {
  const parts = phrase.split(/\s+and\s+/i).map((part) => part.trim()).filter(Boolean);
  if (parts.length < 2) return [phrase];
  if (parts.every((part) => part.split(/\s+/).length <= 4)) return parts;
  return [phrase];
}

const META_RE =
  /^(?:the statement(?: provided)?|this|these details|the wording(?: in the source)?(?: closely)?|the language used in the source(?: closely)?|its accuracy|all elements(?: of the statement)?|all items(?: in the claim inventory)?|both elements(?: of the claim)?|the specific figures(?: and reasons(?: for the increase)?)?|reasons for the increase|the rest of the statement|the claim|the details|the figures in the statement)$/i;

function isMeta(phrase) {
  const t = phrase.trim();
  if (!t) return true;
  if (META_RE.test(t)) return true;
  if (/^(?:this|these|that|it)$/i.test(t)) return true;
  return false;
}

function splitCoordinated(phrase) {
  const parts = phrase
    .split(/\s+and\s+(?=the\s)/i)
    .flatMap((part) => part.split(/\s+as well as\s+/i))
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.length ? parts : [phrase];
}

function objectsFromClause(clause) {
  const supportClaim = clause.match(/\bsupporting the (?:statement's )?claim (?:of|that)\s+(.+)/i);
  if (supportClaim) return splitCoordinated(cleanCapture(supportClaim[1]));
  if (/\b(?:directly )?supporting the (?:statement|figures)\b/i.test(clause)) return ["__META__"];

  const quotes = [...clause.matchAll(/['"]([^'"]{1,80})['"]/g)].map((m) => m[1].trim());
  if (quotes.length && /\b(?:phrase|phrases|figure|figures|term|date)\b/i.test(clause)) {
    return quotes.filter((q) => q.length > 0);
  }

  const confirmPatterns = [
    /\bdoes confirm\s+(?:that\s+)?(.+)/i,
    /\bconfirms the statement by \w+ing that\s+(.+)/i,
    /\bconfirms the statement by \w+ing\s+(.+)/i,
    /\bconfirms the statement that\s+(.+)/i,
    /\bconfirms that\s+(.+)/i,
    /\bit confirms\s+(?:that\s+)?(.+)/i,
    /\bconfirms\s+(?:that\s+)?(.+)/i,
  ];
  for (const re of confirmPatterns) {
    const hit = clause.match(re);
    if (hit) return splitCoordinated(cleanCapture(hit[1]));
  }

  const alignOf = clause.match(/\baligns? with the (?:statement's )?claim of\s+(.+)/i);
  if (alignOf) return splitCoordinated(cleanCapture(alignOf[1]));
  const alignThat = clause.match(/\baligns? with (?:the statement's claim|the claim) that\s+(.+)/i);
  if (alignThat) return splitCoordinated(cleanCapture(alignThat[1]));
  if (/\baligns?(?:\s+directly)?\s+with the (?:statement|claim)\b/i.test(clause)) return ["__META__"];

  const subjectRes = [
    /^(.+?)\s+(?:is|are)\s+confirmed\b/i,
    /^(.+?)\s+(?:is|are)\s+(?:both\s+|directly\s+)?supported\b/i,
    /^(.+?)\s+are directly supported\b/i,
    /^(.+?)\s+match(?:es)? the (?:source|statement)\b/i,
  ];
  for (const re of subjectRes) {
    const hit = clause.match(re);
    if (hit) return splitCoordinated(cleanCapture(hit[1])).flatMap(splitShortAnd);
  }
  return [];
}

function norm(s) {
  return String(s)
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9%.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function words(s) {
  return norm(s)
    .split(" ")
    .filter((w) => w && !STOP.has(w) && w.length > 1);
}

function stem(w) {
  return w.toLowerCase();
}

function sameStem(a, b) {
  if (a === b) return true;
  const n = Math.min(a.length, b.length);
  let i = 0;
  while (i < n && a[i] === b[i]) i += 1;
  if (i < 6) return false;
  return i >= Math.min(a.length, b.length) - 4;
}

function overlapsSpan(phrase, spanText) {
  const left = words(phrase);
  const right = words(spanText);
  if (!left.length || !right.length) return false;
  let matched = 0;
  for (const w of left) {
    if (right.some((r) => sameStem(stem(w), stem(r)))) matched += 1;
  }
  if (matched === 0) return false;
  if (left.length <= 3) return true;
  return matched >= 2 && matched / left.length >= 0.45;
}

function appearsIn(phrase, statement) {
  const p = norm(phrase);
  if (!p) return false;
  return norm(statement).includes(p);
}

const rows = [];
let statementCount = 0;
const triggers = new Map();
const affirmations = [];
const guardA = [];
const guardB = [];

for (const [id, kind, rel] of PAYLOADS) {
  const data = JSON.parse(fs.readFileSync(path.join(root, rel), "utf8"));
  const statements = data.statements || [];
  statementCount += statements.length;
  rows.push({ id, kind, statements: statements.length });
  for (const row of statements) {
    const card = row.qcCard || {};
    const summary = card.evidenceSummary || "";
    const statement = card.statement || row.text || "";
    const spans = (card.unsupportedSpans || []).map((span) => span.text || "").filter(Boolean);
    for (const sentence of sentences(summary)) {
      if (isInstruction(sentence)) continue;
      for (const clause of clausesOf(sentence)) {
        const trigger = triggerOf(clause);
        if (!trigger) continue;
        triggers.set(trigger, (triggers.get(trigger) || 0) + 1);
        const objects = objectsFromClause(clause);
        const phrases = objects.length ? objects : ["__UNEXTRACTED__"];
        for (const rawPhrase of phrases) {
          const meta = rawPhrase === "__META__" || isMeta(rawPhrase);
          const phrase = meta ? statement : rawPhrase;
          const record = {
            payload: id,
            kind,
            statementId: String(row.id),
            verdict: card.displayVerdict || null,
            supportState: card.supportState || null,
            trigger,
            sentence,
            clause,
            phrase: meta ? "(the statement itself)" : phrase,
            phraseText: phrase,
            meta,
            unextracted: rawPhrase === "__UNEXTRACTED__",
          };
          affirmations.push(record);
          if (record.unextracted) continue;
          const spanHit = spans.find((span) => overlapsSpan(phrase, span));
          if (spanHit) {
            guardA.push({ ...record, span: spanHit });
          }
          if (!meta && !appearsIn(phrase, statement)) {
            guardB.push(record);
          }
        }
      }
    }
  }
}

function anchorHit(list, payload, statementId, needle) {
  return list.some(
    (item) =>
      item.payload === payload &&
      item.statementId === statementId &&
      norm(item.phraseText).includes(norm(needle)),
  );
}

const anchors = {
  guardA_clearpoint_dirty_s8: anchorHit(
    guardA,
    "2026-10-06-clearpoint/dirty1",
    "8",
    "commencement",
  ),
  guardB_gpi_doc_s4: anchorHit(guardB, "2026-10-06-gpi/doc", "4", "one million outlets"),
  guardB_gpi_doc_s2: anchorHit(guardB, "2026-10-06-gpi/doc", "2", "cost competitiveness"),
};

const out = {
  payloadCount: PAYLOADS.length,
  statementCount,
  payloads: rows,
  triggers: [...triggers.entries()].sort((a, b) => b[1] - a[1]).map(([phrase, count]) => ({ phrase, count })),
  affirmationCount: affirmations.length,
  affirmations,
  guardA: guardA.map(slim),
  guardB: guardB.map(slim),
  anchors,
};

function slim(item) {
  return {
    payload: item.payload,
    kind: item.kind,
    statementId: item.statementId,
    verdict: item.verdict,
    trigger: item.trigger,
    sentence: item.sentence,
    phrase: item.phrase,
    span: item.span || null,
    statement: item.phraseText && item.meta ? undefined : undefined,
    authorStatement: undefined,
  };
}

const outPath = path.join(root, "scripts/diagnostic/b379/affirm-guards.json");
fs.writeFileSync(outPath, JSON.stringify(out, null, 2) + "\n");

console.log("payloads", PAYLOADS.length);
console.log("statements", statementCount);
for (const row of rows) console.log(`  ${row.statements}\t${row.kind}\t${row.id}`);
console.log("\nTRIGGERS");
for (const [phrase, count] of [...triggers.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))) {
  console.log(`${count}\t${phrase}`);
}
console.log("\nAFFIRMATIONS", affirmations.length);
for (const item of affirmations) {
  console.log(`\n[${item.payload} S${item.statementId} ${item.verdict}] trigger=${item.trigger}${item.meta ? " META" : ""}`);
  console.log("  sentence: " + item.sentence);
  console.log("  phrase:   " + item.phrase);
}
console.log("\nGUARD A", guardA.length, "clean", guardA.filter((x) => x.kind === "clean").length);
for (const item of guardA) {
  console.log(`- ${item.payload} S${item.statementId} ${item.verdict} | ${item.phrase}`);
}
console.log("\nGUARD B", guardB.length, "clean", guardB.filter((x) => x.kind === "clean").length);
for (const item of guardB) {
  console.log(`- ${item.payload} S${item.statementId} ${item.verdict} | ${item.phrase}`);
}
console.log("\nANCHORS", JSON.stringify(anchors));
if (!anchors.guardA_clearpoint_dirty_s8 || !anchors.guardB_gpi_doc_s4 || !anchors.guardB_gpi_doc_s2) {
  console.error("ANCHOR MISS");
  process.exitCode = 1;
}
