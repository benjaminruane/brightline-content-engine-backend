/**
 * B378 measurement. Free. No model calls.
 * Before is the pre-B378 dateline reader (whole header line passed to the
 * date parser) and the stored card. After is the live code.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extractSourceAsOfDate } from "../../../lib/qc/source-recency.mjs";
import { applySourceDatelineToCard } from "../../../lib/qc/source-dateline.mjs";
import { applyDeterministicStyleFilters } from "../../../lib/qc/editorial-compliance-reviewer.mjs";
import { findCandidatePairs } from "../../../lib/revise-actions/conflict-engagement.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const FIXTURES = path.join(ROOT, "tests/fixtures");
const GPI = "real-runs-2026-10-06-gpi";

const MONTHS =
  "January|February|March|April|May|June|July|August|September|October|November|December";
const MONTHS_ABBR = "Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec";
const MONTH = `(?:${MONTHS}|${MONTHS_ABBR})`;
const DATE_CORE = new RegExp(
  `(?:(?:${MONTH})\\s+\\d{1,2},?\\s+(?:19|20)\\d{2}|\\d{1,2}\\s+(?:${MONTH})\\s+(?:19|20)\\d{2}|(?:19|20)\\d{2}-\\d{2}-\\d{2}|(?:${MONTH})\\s+(?:19|20)\\d{2})`,
  "i"
);

function parseDateLoose(raw) {
  const s = String(raw || "").trim().replace(/,/g, "");
  if (!s) return null;
  const iso = s.match(/^((?:19|20)\d{2})-(\d{2})-(\d{2})$/);
  if (iso) return new Date(Date.UTC(+iso[1], +iso[2] - 1, +iso[3]));
  const m1 = s.match(new RegExp(`^(${MONTH})\\s+(\\d{1,2})\\s+((?:19|20)\\d{2})$`, "i"));
  if (m1) return new Date(`${m1[1]} ${m1[2]}, ${m1[3]} UTC`);
  const m2 = s.match(new RegExp(`^(\\d{1,2})\\s+(${MONTH})\\s+((?:19|20)\\d{2})$`, "i"));
  if (m2) return new Date(`${m2[2]} ${m2[1]}, ${m2[3]} UTC`);
  const m3 = s.match(new RegExp(`^(${MONTH})\\s+((?:19|20)\\d{2})$`, "i"));
  if (m3) return new Date(`${m3[1]} 1, ${m3[2]} UTC`);
  const d = new Date(`${s} UTC`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Pre-B378 reader. The standalone rule passed the whole line to the parser. */
function extractSourceAsOfDateBefore(sourceText) {
  const lines = String(sourceText || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const header = lines.slice(0, 15).join("\n");
  const cues = [];
  const push = (cue, raw) => {
    const date = parseDateLoose(raw);
    if (date) cues.push({ cue, raw: String(raw).trim(), date });
  };
  let m = header.match(new RegExp(`\\bDate:\\s*(${DATE_CORE.source})`, "i"));
  if (m) push("Date: label", m[1]);
  m = header.match(new RegExp(`\\bDated:\\s*(${DATE_CORE.source})`, "i"));
  if (m) push("Dated: label", m[1]);
  m = header.match(new RegExp(`\\bAs of\\s+(${DATE_CORE.source})`, "i"));
  if (m) push("As of [date] (header)", m[1]);
  m = header.match(new RegExp(`\\bAs at\\s+(${DATE_CORE.source})`, "i"));
  if (m) push("As at [date] (header)", m[1]);
  m = header.match(new RegExp(`(?:^|\\n)[A-Z][^\\n]{2,80}\\s+[\\u2014\\-\\u2013]\\s+(${DATE_CORE.source})\\b`));
  if (m) push("dateline (city - date)", m[1]);
  m = header.match(new RegExp(`(?:^|\\n)[A-Z][^\\n]{2,80};\\s+(${DATE_CORE.source})\\b`));
  if (m) push("location; date header", m[1]);
  for (const ln of lines.slice(0, 6)) {
    const stripped = ln.replace(/[.;]$/, "");
    if (DATE_CORE.test(stripped) && stripped.length < 40) push("standalone header date line", stripped);
  }
  if (cues.length === 0) return null;
  const prefer = ["Date: label", "Dated: label", "As of [date] (header)", "As at [date] (header)"];
  cues.sort((a, b) => {
    const ia = prefer.indexOf(a.cue);
    const ib = prefer.indexOf(b.cue);
    return (ia === -1 ? 9 : ia) - (ib === -1 ? 9 : ib);
  });
  return cues[0];
}

function iso(hit) {
  if (!hit || !(hit.date instanceof Date) || Number.isNaN(hit.date.getTime())) return null;
  return hit.date.toISOString().slice(0, 10);
}

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(full, out);
    else if (ent.name.endsWith(".json")) out.push(full);
  }
  return out;
}

function rel(file) {
  return path.relative(FIXTURES, file);
}

function loadJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function verdictOf(card) {
  return {
    displayVerdict: card?.displayVerdict ?? null,
    supportState: card?.supportState ?? null,
    hasConflict: card?.hasConflict === true,
    evidence: card?.summaryClass?.evidence ?? null,
    cardTone: card?.summaryClass?.cardTone ?? null,
  };
}

function sameVerdict(a, b) {
  return (
    a.displayVerdict === b.displayVerdict &&
    a.supportState === b.supportState &&
    a.hasConflict === b.hasConflict &&
    a.evidence === b.evidence &&
    a.cardTone === b.cardTone
  );
}

function pairsFor(card) {
  const spans = Array.isArray(card?.supportSpans) ? card.supportSpans : [];
  return spans.map((span) => {
    const pairs = findCandidatePairs(card.statement, span?.passage || "");
    return {
      classification: span?.classification || "",
      pairCount: pairs.length,
      pairs: pairs.map((pair) => `${pair.from.raw} -> ${pair.to.raw}`),
    };
  });
}

function offerPresent(card) {
  const blob = JSON.stringify(card?.editorialConcerns || []) + String(card?.editorialSuggestedDirection || "");
  return blob.includes("60'000 million");
}

const files = walk(FIXTURES);
const asOfMoves = [];
let payloadsWithSources = 0;
const verdictMoves = [];
const commentaryOnly = [];
const separatorDrops = [];
const gpi = {};

for (const file of files) {
  const data = loadJson(file);
  if (!data || typeof data !== "object") continue;
  const sources = Array.isArray(data.sources) ? data.sources : null;
  if (sources) {
    payloadsWithSources += 1;
    sources.forEach((source, index) => {
      const text = typeof source?.text === "string" ? source.text : "";
      if (!text) return;
      const before = iso(extractSourceAsOfDateBefore(text));
      const after = iso(extractSourceAsOfDate(text));
      if (before !== after) {
        asOfMoves.push({
          file: rel(file),
          index,
          label: source.label || "",
          before,
          after,
        });
      }
    });
  }

  const statements = Array.isArray(data.statements) ? data.statements : [];
  for (const row of statements) {
    const card = row?.qcCard;
    if (!card) continue;
    const before = verdictOf(card);
    const afterCard = sources ? applySourceDatelineToCard(card, sources) : card;
    const after = verdictOf(afterCard);
    if (!sameVerdict(before, after)) {
      verdictMoves.push({
        file: rel(file),
        id: row.id,
        before,
        after,
        statement: String(card.statement || "").slice(0, 160),
      });
    } else if (String(card.evidenceSummary || "") !== String(afterCard.evidenceSummary || "")) {
      commentaryOnly.push({
        file: rel(file),
        id: row.id,
        displayVerdict: after.displayVerdict,
      });
    }
    const concerns = Array.isArray(card.editorialConcerns) ? card.editorialConcerns : [];
    const style = concerns.filter(
      (concern) => concern?.concernCode === "thousand_separator" || concern?.rule === "thousand_separator"
    );
    if (style.length) {
      const kept = applyDeterministicStyleFilters(style, card.statement, card.statement);
      for (const concern of style) {
        if (kept.includes(concern)) continue;
        const span = Array.isArray(concern.span) ? concern.span[0] : null;
        const cited =
          span && Number.isFinite(span.startChar) && Number.isFinite(span.endChar)
            ? String(card.statement || "").slice(span.startChar, span.endChar)
            : "";
        separatorDrops.push({
          file: rel(file),
          id: row.id,
          cited,
          note: String(concern.note || concern.suggestedDirection || "").slice(0, 180),
        });
      }
    }
  }

  if (rel(file).startsWith(`${GPI}/`) && rel(file).endsWith("-review.json")) {
    const name = path.basename(file);
    gpi[name] = {};
    for (const id of ["0", "1", "4"]) {
      const row = statements.find((item) => String(item.id) === id);
      if (!row?.qcCard) continue;
      const afterCard = applySourceDatelineToCard(row.qcCard, sources);
      gpi[name][id] = {
        before: verdictOf(row.qcCard),
        after: verdictOf(afterCard),
        silenceGone: !/does not specify|not addressed/i.test(String(afterCard.evidenceSummary || "")),
        datelineQuote: afterCard.conflictExcerpt?.passage || null,
        pairs: pairsFor(row.qcCard),
        offerBefore: offerPresent(row.qcCard),
        offerAfter: offerPresent({
          editorialConcerns: applyDeterministicStyleFilters(
            row.qcCard.editorialConcerns,
            row.qcCard.statement,
            row.qcCard.statement
          ),
        }),
      };
    }
  }
}

const nullToValue = asOfMoves.filter((row) => row.before == null && row.after != null);
const otherAsOf = asOfMoves.filter((row) => !(row.before == null && row.after != null));
const outsideGpi = verdictMoves.filter((row) => !row.file.startsWith(`${GPI}/`));

const report = {
  payloadsWithSources,
  jsonFiles: files.length,
  asOfNullToValue: nullToValue.length,
  asOfOtherChanges: otherAsOf.length,
  nullToValue,
  otherAsOf,
  verdictMoves,
  outsideGpi,
  commentaryOnly,
  separatorDrops,
  gpi,
};

const outDir = path.join(ROOT, "scripts/diagnostic/b378");
fs.writeFileSync(path.join(outDir, "results.json"), JSON.stringify(report, null, 2));

console.log(`payloads with sources: ${payloadsWithSources}`);
console.log(`as-of null to value: ${nullToValue.length}`);
console.log(`as-of other changes: ${otherAsOf.length}`);
console.log(`verdict movers: ${verdictMoves.length}`);
console.log(`verdict movers outside GP: ${outsideGpi.length}`);
console.log(`commentary only: ${commentaryOnly.length}`);
console.log(`separator drops: ${separatorDrops.length}`);
for (const row of verdictMoves) {
  console.log(`VERDICT ${row.file} S${row.id} ${row.before.displayVerdict} -> ${row.after.displayVerdict}`);
}
for (const row of commentaryOnly) {
  console.log(`COMMENT ${row.file} S${row.id} ${row.displayVerdict}`);
}
for (const row of separatorDrops) {
  console.log(`SEPARATOR ${row.file} S${row.id} cited=${JSON.stringify(row.cited)}`);
}
for (const [name, rows] of Object.entries(gpi)) {
  const s0 = rows["0"];
  const s1 = rows["1"];
  const s4 = rows["4"];
  if (!s0) continue;
  console.log(
    `${name} S0 ${s0.before.displayVerdict} -> ${s0.after.displayVerdict} silenceGone=${s0.silenceGone} quote=${JSON.stringify(s0.datelineQuote)}`
  );
  if (name.startsWith("doc")) {
    console.log(`  S1 pairs ${JSON.stringify(s1?.pairs)}`);
    console.log(`  S4 pairs ${JSON.stringify(s4?.pairs)} offer ${s4?.offerBefore} -> ${s4?.offerAfter}`);
  }
}
if (outsideGpi.length) {
  console.error("STOP: unexplained verdict mover outside the GP fixtures");
  process.exit(1);
}
