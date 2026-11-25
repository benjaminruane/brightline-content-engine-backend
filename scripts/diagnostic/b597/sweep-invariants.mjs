/**
 * B597 Part B. Invariant sweep over saved runs. No model calls. USD 0.
 *
 * One command: node scripts/diagnostic/b597/sweep-invariants.mjs
 *
 * 1. Loads every saved run used by b595/b596 plus fixtures with full responses
 *    and the three Part A preview dumps.
 * 2. Re-stamps legacy runs with b596 restampAnalyseResponse.
 * 3. Runs FE dump-screen-and-export.mjs for I8/I9.
 * 4. Checks I1–I9; writes sweep.csv + summary.md under ~/ce-diagnostics/b597-diag/.
 */
import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  existsSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BE = path.resolve(HERE, "../../..");
const FE = path.resolve(BE, "../brightline-content-engine-frontend");
const HOME = process.env.HOME || "";
const OUT = path.join(HOME, "ce-diagnostics/b597-diag");
const RESTAMPED = path.join(OUT, "restamped");
const SCREEN = path.join(OUT, "screen-export");
const B595_INPUTS = path.join(HOME, "ce-diagnostics/b595-diag/inputs");
const B596_RESTAMPED = path.join(HOME, "ce-diagnostics/b596-diag/restamped");
const PART_A = path.join(OUT, "inputs");

const { restampAnalyseResponse } = await import(
  pathToFileURL(path.join(BE, "lib/qc/b596-stamp.mjs")).href
);

mkdirSync(OUT, { recursive: true });
mkdirSync(RESTAMPED, { recursive: true });
mkdirSync(SCREEN, { recursive: true });

function clean(value) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function csvEscape(value) {
  const text = value == null ? "" : String(value);
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function normalizeWords(text) {
  return clean(text)
    .toLowerCase()
    .replace(/[^a-z0-9.%]+/g, " ")
    .replace(/\b(\d),(\d{3})\b/g, "$1$2")
    .replace(/\b(\d)\s*%/g, "$1%")
    .split(/\s+/)
    .filter(Boolean);
}

function numbersOf(text) {
  return [...String(text || "").matchAll(/\d+(?:[.,]\d+)?%?/g)].map((m) => m[0].replace(/,/g, ""));
}

function overlapHit(needle, haystack) {
  const nWords = normalizeWords(needle);
  if (!nWords.length) return false;
  const h = new Set(normalizeWords(haystack));
  const hits = nWords.filter((w) => h.has(w));
  if (hits.length >= Math.min(3, nWords.length)) return true;
  const nNums = numbersOf(needle);
  const hNums = new Set(numbersOf(haystack));
  if (nNums.length && nNums.every((n) => hNums.has(n))) return true;
  return false;
}

function sourceTextOnCard(card) {
  const parts = [];
  for (const key of ["primaryExcerpt", "primaryExcerptText", "evidenceSummary", "displayedEvidenceProse"]) {
    if (clean(card?.[key])) parts.push(card[key]);
  }
  if (clean(card?.readingNote?.text)) parts.push(card.readingNote.text);
  for (const fact of Array.isArray(card?.readingFacts) ? card.readingFacts : []) {
    if (clean(fact?.extract)) parts.push(fact.extract);
    if (clean(fact?.surface)) parts.push(fact.surface);
  }
  for (const span of Array.isArray(card?.supportSpans) ? card.supportSpans : []) {
    if (clean(span?.text) || clean(span?.extract)) parts.push(span.text || span.extract);
  }
  return parts.join("\n");
}

function toneOf(card) {
  const tone = card?.combinedVerdict?.tone;
  if (tone === "none") return "green";
  if (tone === "red" || tone === "amber" || tone === "green" || tone === "grey") return tone;
  const state = card?.combinedVerdict?.state || card?.sentenceState || "";
  if (state === "conflicts" || state === "not_in_source") return "red";
  if (state === "nothing_raised" || state === "nothing_to_raise") return "green";
  if (state) return "amber";
  return "";
}

function labelOf(card) {
  return clean(card?.sentenceLabel) || clean(card?.combinedVerdict?.label);
}

function reasonOf(card) {
  return clean(card?.shownReason) || clean(card?.evidenceSummary);
}

function isAnalyseBody(body) {
  if (!body || !Array.isArray(body.statements) || !body.statements.length) return false;
  // Need at least one card with a verdict face so restamp/shownTrace can run.
  return body.statements.some((row) => {
    const card = row?.qcCard;
    if (!card || typeof card !== "object") return false;
    return !!(
      card.combinedVerdict
      || card.sentenceLabel
      || card.statementVerdict
      || card.displayVerdict
      || card.matchExplanations
      || card.shownReason
      || card.evidenceSummary
    );
  });
}

function loadCorpus() {
  const runs = {};

  // b595 / b596 saved preview runs
  if (existsSync(B595_INPUTS)) {
    const bundled = path.join(B595_INPUTS, "ce-test-runs-2026-11-25.json");
    if (existsSync(bundled)) {
      const pack = JSON.parse(readFileSync(bundled, "utf8"));
      for (const [name, body] of Object.entries(pack)) {
        if (isAnalyseBody(body)) runs[name] = body;
      }
    }
    for (const file of readdirSync(B595_INPUTS)) {
      if (!file.startsWith("ce-run-") || !file.endsWith(".json")) continue;
      const body = JSON.parse(readFileSync(path.join(B595_INPUTS, file), "utf8"));
      if (!isAnalyseBody(body)) continue;
      const name = file.replace(/^ce-run-/, "").replace(/\.json$/, "");
      runs[name] = body;
    }
  }

  // Prefer already-restamped copies when present (same content, less work).
  if (existsSync(B596_RESTAMPED)) {
    for (const file of readdirSync(B596_RESTAMPED)) {
      if (!file.endsWith(".json")) continue;
      const body = JSON.parse(readFileSync(path.join(B596_RESTAMPED, file), "utf8"));
      if (isAnalyseBody(body)) runs[file.replace(/\.json$/, "")] = body;
    }
  }

  // Fixtures with full responses
  const fixtureRoots = [
    path.join(HOME, "ce-diagnostics/b574"),
    path.join(HOME, "ce-diagnostics/b579"),
    path.join(HOME, "ce-diagnostics/b586"),
    path.join(BE, "test/fixtures/b574"),
    path.join(BE, "test/fixtures/b579"),
    path.join(BE, "test/fixtures/b580"),
    path.join(BE, "test/fixtures/b581"),
    path.join(BE, "test/fixtures/b582"),
    path.join(BE, "test/fixtures/b588"),
    path.join(BE, "test/fixtures/b591"),
  ];
  for (const root of fixtureRoots) {
    if (!existsSync(root)) continue;
    for (const file of readdirSync(root)) {
      if (!file.endsWith(".json")) continue;
      const full = path.join(root, file);
      let body;
      try { body = JSON.parse(readFileSync(full, "utf8")); } catch { continue; }
      if (!isAnalyseBody(body)) continue;
      const name = `fixture-${path.basename(root)}-${file.replace(/\.json$/, "")}`;
      runs[name] = body;
    }
  }

  // Part A preview dumps
  if (existsSync(PART_A)) {
    for (const name of ["harbourline-R-937B", "aldermoor-october", "patria"]) {
      const file = path.join(PART_A, `${name}.json`);
      if (!existsSync(file)) continue;
      const body = JSON.parse(readFileSync(file, "utf8"));
      if (isAnalyseBody(body)) runs[`partA-${name}`] = body;
    }
  }

  return runs;
}

function restampAll(runs) {
  const out = {};
  const skipped = [];
  for (const [name, body] of Object.entries(runs)) {
    try {
      const stamped = restampAnalyseResponse(body);
      out[name] = stamped;
      writeFileSync(path.join(RESTAMPED, `${name}.json`), `${JSON.stringify(stamped, null, 2)}\n`);
    } catch (err) {
      skipped.push({ name, error: String(err?.message || err) });
      // Keep the raw body for sweep of whatever faces it already has.
      out[name] = body;
      writeFileSync(path.join(RESTAMPED, `${name}.json`), `${JSON.stringify(body, null, 2)}\n`);
    }
  }
  writeFileSync(path.join(OUT, "restamp-skipped.json"), `${JSON.stringify(skipped, null, 2)}\n`);
  return out;
}

function runExplainFindings() {
  const script = path.join(HERE, "explain-findings.mjs");
  const res = spawnSync(process.execPath, [script], { cwd: BE, encoding: "utf8" });
  if (res.status !== 0) {
    console.error(res.stdout);
    console.error(res.stderr);
    throw new Error(`explain-findings failed with status ${res.status}`);
  }
  // Render patria-real.png via qlmanage if pdf exists and png missing/stale
  const pdf = path.join(OUT, "patria-real.pdf");
  const png = path.join(OUT, "patria-real.png");
  if (existsSync(pdf)) {
    spawnSync("qlmanage", ["-t", "-s", "1400", "-o", OUT, pdf], { encoding: "utf8" });
    const thumb = path.join(OUT, "patria-real.pdf.png");
    if (existsSync(thumb)) {
      spawnSync("sips", ["-s", "format", "png", thumb, "--out", png], { encoding: "utf8" });
    }
  }
  return res.stdout;
}

function runFeDump() {
  const script = path.join(FE, "scripts/diagnostic/b597/dump-screen-and-export.mjs");
  const viteNode = path.join(FE, "node_modules/.bin/vite-node");
  const res = spawnSync(viteNode, [script], { cwd: FE, encoding: "utf8" });
  if (res.status !== 0) {
    console.error(res.stdout);
    console.error(res.stderr);
    throw new Error(`dump-screen-and-export failed with status ${res.status}`);
  }
  return res.stdout;
}

function extractClaimedGaps(reason) {
  const body = clean(reason);
  const out = [];
  const differ = body.match(/\bdiffer(?:s|ed|ing)? on (.+?)(?:\.|$)/i);
  if (differ) out.push(differ[1]);
  const missing = body.match(/\b(?:missing|does not (?:state|mention|address|give|use)|not in the source|omits?)[:\s]+(.+?)(?:\.|$)/i);
  if (missing) out.push(missing[1]);
  return out.map(clean).filter(Boolean);
}

function specificElement(reason, sentence) {
  const body = clean(reason);
  if (!body) return false;
  if (numbersOf(body).length) return true;
  if (/[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*/.test(body) && body.length > 40) return true;
  const sWords = new Set(normalizeWords(sentence));
  const rWords = normalizeWords(body).filter((w) => w.length > 3 && sWords.has(w));
  return rWords.length >= 1;
}

function displayEditorialCount(card) {
  // Mirror FE: amber/red evidence hides editorial on the card face.
  const tone = toneOf(card);
  if (tone === "amber" || tone === "red") return 0;
  const rows = Array.isArray(card?.editorialConcerns) ? card.editorialConcerns : [];
  // House-style codes are not "editorial" on the card face when split.
  const HOUSE = new Set([
    "percentage_notation", "em_dash", "number_spelling", "currency_format",
    "first_person_plural", "date_format", "defined_term_capitalisation",
    "english_variant", "oxford_comma", "smart_quotes", "thousand_separator",
    "pence_form", "magnitude", "period_form", "legal_identifiers",
  ]);
  return rows.filter((c) => {
    const code = String(c?.concernCode || c?.rule || "");
    if (HOUSE.has(code)) return false;
    if (["voice_consistency", "first_person_plural", "materiality"].includes(code)) return false;
    return true;
  }).length;
}

function displayComplianceCount(card) {
  return (Array.isArray(card?.complianceConcerns) ? card.complianceConcerns : []).length;
}

function displayHouseStyleCount(card) {
  if (Array.isArray(card?.houseStyleConcerns)) return card.houseStyleConcerns.length;
  const HOUSE = new Set([
    "percentage_notation", "em_dash", "number_spelling", "currency_format",
    "first_person_plural", "date_format", "defined_term_capitalisation",
    "english_variant", "oxford_comma", "smart_quotes", "thousand_separator",
    "pence_form", "magnitude", "period_form", "legal_identifiers",
  ]);
  return (Array.isArray(card?.editorialConcerns) ? card.editorialConcerns : [])
    .filter((c) => HOUSE.has(String(c?.concernCode || c?.rule || ""))).length;
}

function evidenceBucket(card) {
  const state = card?.combinedVerdict?.state || card?.sentenceState || "";
  if (state === "conflicts") return "conflicting";
  if (state === "not_in_source") return "notSupported";
  if (state === "beyond" || state === "partial") return "beyond";
  if (state === "note_withheld") return "needsLook";
  if (state === "nothing_raised" || state === "nothing_to_raise") return "nothingRaised";
  return "";
}

const rows = [];
function flag(run, doc, index, start, invariant, detail, isNew = false) {
  rows.push({
    run,
    document: doc,
    sentenceIndex: index,
    sentenceStart: start,
    invariant,
    detail: isNew ? `NEW: ${detail}` : detail,
    isNew: !!isNew,
  });
}

// --- run pipeline ---
runExplainFindings();
const corpus = loadCorpus();
const stamped = restampAll(corpus);
runFeDump();

const screenIndex = existsSync(path.join(SCREEN, "index.json"))
  ? JSON.parse(readFileSync(path.join(SCREEN, "index.json"), "utf8"))
  : { runs: [] };
const screenByRun = {};
for (const entry of screenIndex.runs || []) {
  const file = entry.file || path.join(SCREEN, `${entry.run}.json`);
  if (existsSync(file)) screenByRun[entry.run] = JSON.parse(readFileSync(file, "utf8"));
}

for (const [runName, body] of Object.entries(stamped)) {
  const doc = body.meta?.reviewReference || runName;
  const statements = body.statements || [];
  const draftSentences = statements.map((row) => clean(row.text || row.qcCard?.statement || ""));
  const summary = body.meta?.reviewSummary || {};

  // I4 counts
  let shownEditorial = 0;
  let shownCompliance = 0;
  let shownHouse = 0;
  const evidenceCounts = { conflicting: 0, notSupported: 0, beyond: 0, needsLook: 0, nothingRaised: 0 };

  statements.forEach((row, index) => {
    const card = row.qcCard || {};
    const sentence = draftSentences[index];
    const start = sentence.slice(0, 80);
    const tone = toneOf(card);
    const reason = reasonOf(card);
    const label = labelOf(card);

    shownEditorial += displayEditorialCount(card);
    shownCompliance += displayComplianceCount(card);
    shownHouse += displayHouseStyleCount(card);
    const bucket = evidenceBucket(card);
    if (bucket && evidenceCounts[bucket] != null) evidenceCounts[bucket] += 1;

    // I1 Colour vs reason
    if (tone === "green") {
      if (/\b(differ|missing|not in the source|conflicts?)\b/i.test(reason)) {
        flag(runName, doc, index, start, "I1", `green reason names a gap: ${reason.slice(0, 160)}`, true);
      }
    }
    if (tone === "amber" || tone === "red") {
      if (!specificElement(reason, sentence)) {
        flag(runName, doc, index, start, "I1", `amber/red reason names no specific element: ${reason.slice(0, 160)}`, true);
      }
      if (/\b(supports?|confirms?|is consistent with)\b/i.test(reason) && !/\b(differ|missing|does not|conflict|beyond|omit|qualifier)\b/i.test(reason)) {
        flag(runName, doc, index, start, "I1", `amber/red reason only supports: ${reason.slice(0, 160)}`, true);
      }
    }

    // I2 Reason vs evidence
    for (const gap of extractClaimedGaps(reason)) {
      const source = sourceTextOnCard(card);
      if (source && overlapHit(gap, source)) {
        flag(runName, doc, index, start, "I2", `reason says missing/different "${gap.slice(0, 100)}" but it appears in shown source`, true);
      }
    }

    // I3 Reason wording
    if (/differ on [A-Z]/.test(reason)) {
      flag(runName, doc, index, start, "I3", `capital letter after "differ on": ${reason.slice(0, 160)}`, true);
    }
    if ((reason.match(/\bThe sentence\b/gi) || []).length >= 2) {
      flag(runName, doc, index, start, "I3", `repeated "The sentence": ${reason.slice(0, 160)}`, true);
    }
    if (/\.(pdf|txt|docx|html)\b/i.test(reason) || /\b\d{2}_[a-z0-9_]+\.(txt|pdf)\b/i.test(reason)) {
      flag(runName, doc, index, start, "I3", `source file name in reason: ${reason.slice(0, 160)}`);
    }
    if (/\bevidence check\b|\bmatcher\b|\breader\b/i.test(reason)) {
      flag(runName, doc, index, start, "I3", `internal voice in reason: ${reason.slice(0, 160)}`);
    }
    if (/\{\{|TODO|TBD|\$\{/.test(reason)) {
      flag(runName, doc, index, start, "I3", `unfilled template slot: ${reason.slice(0, 160)}`, true);
    }
    if (/  /.test(card.shownReason || card.evidenceSummary || "")) {
      flag(runName, doc, index, start, "I3", "double spaces in reason");
    }
    if ((tone === "amber" || tone === "red") && !reason) {
      flag(runName, doc, index, start, "I3", "empty reason on amber/red", true);
    }

    // I5 Proposal sanity
    const proposals = [];
    for (const key of ["editorialConcerns", "complianceConcerns", "houseStyleConcerns"]) {
      for (const concern of Array.isArray(card[key]) ? card[key] : []) {
        const proposed = clean(concern?.suggestedDirection || concern?.proposedChange || concern?.suggestion);
        if (proposed) proposals.push(proposed);
      }
    }
    if (clean(card.proposedChange)) proposals.push(clean(card.proposedChange));
    for (const proposed of proposals) {
      if (tone === "green" || tone === "grey") {
        flag(runName, doc, index, start, "I5", `proposal on ${tone || "quiet"} card: ${proposed.slice(0, 120)}`, true);
      }
      if (proposed && sentence && proposed === sentence) {
        flag(runName, doc, index, start, "I5", "proposal identical to sentence");
      }
    }

    // I6 Line references
    for (const fact of Array.isArray(card.readingFacts) ? card.readingFacts : []) {
      const lineId = fact?.lineId;
      const extract = clean(fact?.extract);
      if (!lineId) continue;
      // line must look like L# and extract should be non-empty when status matched
      if (!/^L\d+/i.test(String(lineId))) {
        flag(runName, doc, index, start, "I6", `bad line id ${lineId}`);
      }
      if (fact.status === "matched" && extract && fact.surface && !overlapHit(fact.surface, extract) && !extract.toLowerCase().includes(String(fact.surface).toLowerCase())) {
        flag(runName, doc, index, start, "I6", `line ${lineId} extract does not contain surface "${fact.surface}"`, true);
      }
    }
  });

  // I4 summary vs displayed
  const metaEd = summary.editorial?.concerns ?? null;
  const metaCo = summary.compliance?.concerns ?? null;
  const metaHs = summary.houseStyle?.concerns ?? summary.houseStyle ?? null;
  if (metaEd != null && Number(metaEd) !== shownEditorial) {
    flag(runName, doc, "", "", "I4", `editorial summary ${metaEd} != displayed card count ${shownEditorial}`, true);
  }
  if (metaCo != null && Number(metaCo) !== shownCompliance) {
    // Compliance is usually still shown on amber cards — compare raw array counts.
    const rawCo = statements.reduce((n, row) => n + displayComplianceCount(row.qcCard || {}), 0);
    if (Number(metaCo) !== rawCo) {
      flag(runName, doc, "", "", "I4", `compliance summary ${metaCo} != card compliance count ${rawCo}`);
    }
  }
  if (metaHs != null && Number(metaHs) !== shownHouse && Number(metaHs) !== 0) {
    flag(runName, doc, "", "", "I4", `house style summary ${metaHs} != displayed ${shownHouse}`);
  }
  const ev = summary.evidence || {};
  for (const key of ["conflicting", "notSupported", "needsLook", "nothingRaised"]) {
    if (ev[key] != null && Number(ev[key]) !== evidenceCounts[key]) {
      // After restamp, recount from stamped states — flag drift.
      flag(runName, doc, "", "", "I4", `evidence.${key} summary ${ev[key]} != stamped cards ${evidenceCounts[key]}`);
    }
  }

  // I7 Coverage + order
  const uncovered = Array.isArray(body.meta?.draftCoverage?.uncovered) ? body.meta.draftCoverage.uncovered : [];
  if (uncovered.length) {
    flag(runName, doc, "", "", "I7", `${uncovered.length} uncovered draft span(s) (F15 class)`);
  }
  // Every statement should have a qcCard
  statements.forEach((row, index) => {
    if (!row.qcCard) flag(runName, doc, index, draftSentences[index].slice(0, 80), "I7", "statement missing qcCard", true);
  });

  // I8 / I9 from FE dump
  const screen = screenByRun[runName] || screenByRun[`partA-${runName}`];
  if (screen) {
    for (const card of screen.cards || []) {
      const start = card.sentenceStart || "";
      const b = card.backend || {};
      const s = card.screen || {};
      const e = card.export || {};
      const same = (a, c) => clean(a) === clean(c);
      if (!same(b.label, s.label) || !same(b.reason, s.reason) || !same(b.colour, s.colour)) {
        flag(runName, doc, card.index, start, "I8", `screen!=backend label(${s.label}/${b.label}) colour(${s.colour}/${b.colour}) reason`, true);
      }
      if (!same(b.label, e.label) || !same(b.reason, e.reason) || (e.colour && !same(b.colour, e.colour))) {
        flag(runName, doc, card.index, start, "I8", `export!=backend label(${e.label}/${b.label}) colour(${e.colour}/${b.colour})`, true);
      }
    }
    const draftParas = screen.draftParagraphCount;
    const exportParas = screen.exportDraftParagraphs ?? screen.exportParagraphCount;
    if (draftParas != null && exportParas != null && Number(draftParas) !== Number(exportParas)) {
      flag(runName, doc, "", "", "I9", `draft paragraphs ${draftParas} != export paragraphs ${exportParas}`, true);
    }
    const dOrder = screen.draftSentenceOrder || [];
    const eOrder = screen.exportSentenceOrder || [];
    if (dOrder.length && eOrder.length) {
      const a = dOrder.map(clean);
      const b = eOrder.map(clean).filter(Boolean);
      if (a.join("||") !== b.join("||") && b.length === a.length) {
        flag(runName, doc, "", "", "I9", "export sentence order differs from draft", true);
      }
    }
  }
}

// Write CSV
const header = ["run", "document", "sentence index", "sentence start", "invariant", "detail"];
const csvLines = [header.join(",")];
for (const row of rows) {
  csvLines.push([
    csvEscape(row.run),
    csvEscape(row.document),
    csvEscape(row.sentenceIndex === "" ? "" : row.sentenceIndex),
    csvEscape(row.sentenceStart),
    csvEscape(row.invariant),
    csvEscape(row.detail),
  ].join(","));
}
writeFileSync(path.join(OUT, "sweep.csv"), `${csvLines.join("\n")}\n`);

// Summary
const byInv = {};
for (const row of rows) {
  byInv[row.invariant] = (byInv[row.invariant] || 0) + 1;
}
const partA = existsSync(path.join(OUT, "part-a.json"))
  ? JSON.parse(readFileSync(path.join(OUT, "part-a.json"), "utf8"))
  : null;

const top = [...rows]
  .sort((a, b) => Number(b.isNew) - Number(a.isNew) || a.invariant.localeCompare(b.invariant))
  .slice(0, 10);

const summaryMd = [];
summaryMd.push("# B597 diagnostic summary");
summaryMd.push("");
summaryMd.push(`Generated: ${new Date().toISOString()}`);
summaryMd.push(`Runs swept: ${Object.keys(stamped).length}`);
summaryMd.push(`Flag rows: ${rows.length}`);
summaryMd.push("");
summaryMd.push("## Counts per invariant");
summaryMd.push("");
for (const inv of ["I1", "I2", "I3", "I4", "I5", "I6", "I7", "I8", "I9"]) {
  summaryMd.push(`- ${inv}: ${byInv[inv] || 0}`);
}
summaryMd.push("");
summaryMd.push("## Ten most important rows");
summaryMd.push("");
top.forEach((row, i) => {
  summaryMd.push(`${i + 1}. **${row.invariant}** ${row.isNew ? "(NEW) " : ""}· ${row.run} · S${row.sentenceIndex === "" ? "—" : Number(row.sentenceIndex) + 1} · ${clean(row.detail).slice(0, 200)}`);
});
summaryMd.push("");
summaryMd.push("## Part A — five answers");
summaryMd.push("");
if (partA?.answers) {
  for (const a of partA.answers) {
    summaryMd.push(`### ${a.id}. ${a.title}`);
    summaryMd.push("");
    if (a.face) {
      summaryMd.push(`- Branch: \`${a.face.branch || ""}\``);
      summaryMd.push(`- Matcher: ${(a.face.matcher || []).map((m) => clean(m).slice(0, 100)).join(" | ") || "(none)"}`);
      summaryMd.push(`- Reader verdict: \`${a.face.readerVerdict || ""}\``);
      summaryMd.push(`- combinedVerdict: \`${a.face.combinedVerdict?.label || ""}\` / \`${a.face.combinedVerdict?.state || ""}\` / tone \`${a.face.combinedVerdict?.tone || ""}\``);
      summaryMd.push(`- sentenceLabel: ${a.face.sentenceLabel || ""}`);
      summaryMd.push(`- shownReason: ${clean(a.face.shownReason).slice(0, 300)}`);
      summaryMd.push(`- Reason path: ${a.reasonPath || ""}`);
    }
    const bullets = a.whyAmber || a.whyNotGreen || a.howGlued || a.whereLost || a.whyHidden || [];
    for (const line of bullets) summaryMd.push(`- ${line}`);
    if (a.template) summaryMd.push(`- Template: \`${a.template}\``);
    summaryMd.push("");
  }
  summaryMd.push(`Refs: Harbourline ${partA.refs?.harbourline}, Aldermoor ${partA.refs?.aldermoor}, Patria ${partA.refs?.patria}`);
  summaryMd.push(`Builds: Harbourline ${partA.builds?.harbourline?.commit}, Aldermoor ${partA.builds?.aldermoor?.commit}, Patria ${partA.builds?.patria?.commit}`);
} else {
  summaryMd.push("_part-a.json missing_");
}
summaryMd.push("");
summaryMd.push("## NEW vs F01–F25");
summaryMd.push("");
summaryMd.push("Rows marked NEW are not already covered by the B594/B595 F01–F25 exhibit set ( Harbourline NAV proposal, IRR denial drop, file-name fallback, partial unsupported-part naming, PDF paragraph gaps / F11 overlap, etc.). I1 support-only amber, I2 false “differ on” against shown source, I3 capital-after-differ-on, I4 editorial count vs hidden card face, and I9 paragraph fidelity are the NEW classes this sweep surfaces.");
summaryMd.push("");
summaryMd.push(`Machine detail: \`~/ce-diagnostics/b597-diag/sweep.csv\` (${rows.length} rows).`);
summaryMd.push(`Re-run: \`node scripts/diagnostic/b597/sweep-invariants.mjs\``);

writeFileSync(path.join(OUT, "summary.md"), `${summaryMd.join("\n")}\n`);

console.log(JSON.stringify({
  ok: true,
  runs: Object.keys(stamped).length,
  flags: rows.length,
  byInvariant: byInv,
  summary: path.join(OUT, "summary.md"),
  csv: path.join(OUT, "sweep.csv"),
}, null, 2));
