/**
 * B597 Part B. Invariant sweep over saved runs. No model calls. USD 0.
 *
 * One command: node scripts/diagnostic/b597/sweep-invariants.mjs
 *
 * 1. Loads every saved run used by b595/b596 plus fixtures with full responses
 *    and the three Part A preview dumps.
 * 2. Re-stamps legacy runs with b596 restampAnalyseResponse.
 * 3. Runs FE dump-screen-and-export.mjs for I8/I9.
 * 4. Checks I1–I10; writes sweep.csv + summary.md under ~/ce-diagnostics/b597-diag/.
 * B598: stricter I2/I5/I6, quieter I3, stamped vs legacy split, I10 table rows.
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
const OUT_B598 = path.join(HOME, "ce-diagnostics/b598-diag");
const RESTAMPED = path.join(OUT, "restamped");
const SCREEN = path.join(OUT, "screen-export");
const B595_INPUTS = path.join(HOME, "ce-diagnostics/b595-diag/inputs");
const B596_RESTAMPED = path.join(HOME, "ce-diagnostics/b596-diag/restamped");
const PART_A = path.join(OUT, "inputs");

const { restampAnalyseResponse } = await import(
  pathToFileURL(path.join(BE, "lib/qc/b596-stamp.mjs")).href
);
const {
  gapAppearsInLines,
  shownSourceLines,
  tokenizeForOverlap,
} = await import(pathToFileURL(path.join(BE, "lib/qc/reason-evidence-check.mjs")).href);
const { proposalChangesAttribution } = await import(
  pathToFileURL(path.join(BE, "lib/qc/attribution-safe-proposals.mjs")).href
);
const { cutLineEllipsis, passageWithLineRef } = await import(
  pathToFileURL(path.join(BE, "lib/export/passage-cut.mjs")).href
);
const {
  displayedEditorialConcerns,
  displayedComplianceConcerns,
  displayedHouseStyleConcerns,
} = await import(pathToFileURL(path.join(BE, "lib/qc/review-summary.mjs")).href);

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
    path.join(BE, "test/fixtures/b601"),
    path.join(BE, "test/fixtures/b602"),
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
  return out.map(clean).filter((gap) => {
    if (!gap) return false;
    if (/^(this claim|the claim about|the claim)\b/i.test(gap)) return false;
    return tokenizeForOverlap(gap).length >= 2;
  });
}

function specificElement(reason, sentence) {
  const body = clean(reason);
  if (!body) return false;
  if (/\b(recommend|decision|gross|net|qualifier|table|confirm the decision)\b/i.test(body)) return true;
  if (numbersOf(body).length) return true;
  if (/[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*/.test(body) && body.length > 40) return true;
  const sWords = new Set(normalizeWords(sentence));
  const rWords = normalizeWords(body).filter((w) => w.length > 3 && sWords.has(w));
  return rWords.length >= 1;
}

function displayEditorialCount(card) {
  return displayedEditorialConcerns(card).length;
}

function displayComplianceCount(card) {
  return displayedComplianceConcerns(card).length;
}

function displayHouseStyleCount(card) {
  return displayedHouseStyleConcerns(card).length;
}

function isStampedRun(body) {
  return body?.meta?.stampAuthority === "b596"
    || (body?.statements || []).some((row) => row?.qcCard?.stampAuthority === "b596");
}

function evidenceBucket(card) {
  // Match summariseReview: evidence face uses sentenceState (ledger), not craft/caution overlay.
  const state = card?.sentenceState || card?.statementVerdict?.state || "";
  if (state === "conflicts") return "conflicting";
  if (state === "not_in_source") return "notSupported";
  if (state === "beyond" || state === "partial") return "beyond";
  if (state === "note_withheld") return "needsLook";
  if (state === "nothing_raised" || state === "nothing_to_raise") return "nothingRaised";
  // Wording/caution overlays are still nothing_raised on the evidence ledger.
  const combined = card?.combinedVerdict?.state || "";
  if (combined === "wording" || combined === "caution" || combined === "compliance_risk") {
    return "nothingRaised";
  }
  return "";
}

const rows = [];
const runStampKind = new Map();
function flag(run, doc, index, start, invariant, detail, isNew = false) {
  rows.push({
    run,
    document: doc,
    sentenceIndex: index,
    sentenceStart: start,
    invariant,
    detail: isNew ? `NEW: ${detail}` : detail,
    isNew: !!isNew,
    stamped: runStampKind.get(run) !== "legacy",
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
  runStampKind.set(runName, isStampedRun(body) ? "stamped" : "legacy");
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
      if (/\b(supports?|confirms?|is consistent with)\b/i.test(reason)
        && !/\b(differ|missing|does not|conflict|beyond|omit|qualifier|recommend|but|however|while|instead|expected|was complete|drops?|decision was taken|confirm the decision)\b/i.test(reason)) {
        flag(runName, doc, index, start, "I1", `amber/red reason only supports: ${reason.slice(0, 160)}`, true);
      }
    }

    // I2 Reason vs evidence (B598: gapAppearsInLines, >=2 content words)
    for (const gap of extractClaimedGaps(reason)) {
      if (gapAppearsInLines(gap, shownSourceLines(card))) {
        flag(runName, doc, index, start, "I2", `reason says missing/different "${gap.slice(0, 100)}" but it appears in shown source`, true);
      }
    }

    // I3 Reason wording (B598: do not flag "The draft" as internal voice)
    if (/differ on [A-Z]/.test(reason)) {
      flag(runName, doc, index, start, "I3", `capital letter after "differ on": ${reason.slice(0, 160)}`, true);
    }
    if ((reason.match(/(?:^|[.!?]\s+)The sentence\b/g) || []).length >= 2) {
      flag(runName, doc, index, start, "I3", `repeated "The sentence": ${reason.slice(0, 160)}`, true);
    }
    if (/\.(pdf|txt|docx|html)\b/i.test(reason) || /\b\d{2}_[a-z0-9_]+\.(txt|pdf)\b/i.test(reason)) {
      flag(runName, doc, index, start, "I3", `source file name in reason: ${reason.slice(0, 160)}`);
    }
    if (/\b(?:the )?evidence check\b|\bthe matcher\b|\bmatcher\b|\bthe reader\b|\bthe second check\b|\bthe check\b|\breading note\b|\bunmatchedElements\b|\bqcCard\b/i.test(reason)) {
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

    // I5 Proposal sanity (B598: allow house-style/editorial on green/grey; flag attribution swaps)
    for (const key of ["editorialConcerns", "houseStyleConcerns"]) {
      for (const concern of Array.isArray(card[key]) ? card[key] : []) {
        if (proposalChangesAttribution(sentence, concern)) {
          flag(runName, doc, index, start, "I5", `attribution change: ${(concern.suggestedDirection || "").slice(0, 120)}`, true);
        }
      }
    }
    for (const key of ["editorialConcerns", "complianceConcerns", "houseStyleConcerns"]) {
      for (const concern of Array.isArray(card[key]) ? card[key] : []) {
        const proposed = clean(concern?.suggestedDirection || concern?.proposedChange || concern?.suggestion);
        if (proposed && sentence && proposed === sentence) {
          flag(runName, doc, index, start, "I5", "proposal identical to sentence");
        }
      }
    }

    // I6 Line references (B598: gapAppearsInLines-style normalization)
    for (const fact of Array.isArray(card.readingFacts) ? card.readingFacts : []) {
      const lineId = fact?.lineId;
      const extract = clean(fact?.extract);
      if (!lineId) continue;
      if (!/^L\d+/i.test(String(lineId))) {
        flag(runName, doc, index, start, "I6", `bad line id ${lineId}`);
      }
      if (fact.status === "matched" && extract && fact.surface) {
        if (!gapAppearsInLines(String(fact.surface), [extract]) && !extract.toLowerCase().includes(String(fact.surface).toLowerCase())) {
          flag(runName, doc, index, start, "I6", `line ${lineId} extract does not contain surface "${fact.surface}"`, true);
        }
      }
    }

    // I10 Table rows / line refs
    const excerpt = clean(card.primaryExcerptText || card.primaryExcerpt || "");
    if (excerpt) {
      const line = excerpt.split(/\n/).find((part) => /\d/.test(part)) || excerpt;
      const cut = cutLineEllipsis(line, "Next.");
      if (/ …$/.test(cut) && /\b(?:nav|key figures|net asset value|irr|moic|aum)\b/i.test(line)) {
        flag(runName, doc, index, start, "I10", `ellipsis on complete table/figure line: ${cut.slice(0, 100)}`, true);
      }
      const withRef = passageWithLineRef(line, card.primaryExcerptLineIds || []);
      if (withRef && /\S\(line/.test(withRef)) {
        flag(runName, doc, index, start, "I10", "missing space before (line N)", true);
      }
    }

    // I11 B602: screen shown lines (text + reference) equal export's for every card.
    // When a FE screen dump exists, compare; otherwise compare stamped primaryExcerptParts
    // against export-oriented shownSourceLines (self-consistency of the stamp).
    {
      const screenCard = (screenByRun[runName] || screenByRun[`partA-${runName}`] || {})?.cards?.find(
        (row) => Number(row.index) === index,
      );
      const stampedLines = shownSourceLines(card).map(clean).filter(Boolean);
      if (screenCard?.screen?.shownLines || screenCard?.export?.shownLines) {
        const sLines = (screenCard.screen?.shownLines || []).map(clean);
        const eLines = (screenCard.export?.shownLines || []).map(clean);
        if (sLines.join("||") !== eLines.join("||")) {
          flag(runName, doc, index, start, "I11", `screen shown lines != export shown lines`, true);
        }
        const sRefs = (screenCard.screen?.lineRefs || []).map(clean).join("|");
        const eRefs = (screenCard.export?.lineRefs || []).map(clean).join("|");
        if (sRefs !== eRefs) {
          flag(runName, doc, index, start, "I11", `screen line refs != export line refs`, true);
        }
      } else if (Array.isArray(card.primaryExcerptParts) && card.primaryExcerptParts.length) {
        for (const part of card.primaryExcerptParts) {
          const text = clean(typeof part === "string" ? part : part?.text);
          if (text && !stampedLines.some((line) => line.includes(text) || text.includes(line))) {
            flag(runName, doc, index, start, "I11", `excerpt part not in shown lines: ${text.slice(0, 80)}`, true);
          }
        }
      }
    }

    // I12 B602: every draft mark matches a displayed verdict or concern on its card.
    {
      const marks = Array.isArray(body.draftMarks)
        ? body.draftMarks.filter((mark) => Number(mark?.statementIndex) === index)
        : [];
      const displayed = [
        ...displayedEditorialConcerns(card),
        ...displayedComplianceConcerns(card),
        ...displayedHouseStyleConcerns(card),
      ];
      const faceRaised = ["conflicts", "not_in_source", "beyond", "partial", "note_withheld"].includes(
        String(card.sentenceState || card.statementVerdict?.state || ""),
      );
      for (const mark of marks) {
        const kind = String(mark?.kind || mark?.tone || mark?.type || mark?.signal || "").toLowerCase();
        const isWording = /wording|house|editorial|compliance|craft|caution/.test(kind);
        if (isWording && !displayed.length) {
          flag(runName, doc, index, start, "I12", `draft mark ${kind || "wording"} with no displayed concern`, true);
          continue;
        }
        // Evidence/verdict marks must sit on a raised face or a displayed concern.
        if (!isWording && !faceRaised && tone === "green" && !displayed.length && /beyond|conflict|partial|amber|red/.test(kind)) {
          flag(runName, doc, index, start, "I12", `draft mark on green card with no displayed concern`, true);
        }
      }
    }
  });

  // I4 summary vs displayed
  const metaEd = summary.editorial?.concerns ?? null;
  const metaCo = summary.compliance?.concerns ?? null;
  const metaHs = summary.houseStyle?.concerns ?? summary.houseStyle ?? null;
  if (metaEd != null && Number(metaEd) !== shownEditorial) {
    const editorialCards = statements.reduce(
      (n, row) => n + (displayEditorialCount(row.qcCard || {}) > 0 ? 1 : 0),
      0,
    );
    if (Number(metaEd) !== editorialCards) {
      flag(runName, doc, "", "", "I4", `editorial summary ${metaEd} != displayed card count ${shownEditorial}/${editorialCards}`, true);
    }
  }
  if (metaCo != null && Number(metaCo) !== shownCompliance) {
    // Summary counts cards with a compliance concern; displayed tallies items.
    // Accept either the card count or the item count (B602 multi-caution cards).
    const cardCo = statements.reduce(
      (n, row) => n + (displayComplianceCount(row.qcCard || {}) > 0 ? 1 : 0),
      0,
    );
    const rawCo = statements.reduce((n, row) => n + displayComplianceCount(row.qcCard || {}), 0);
    if (Number(metaCo) !== rawCo && Number(metaCo) !== cardCo) {
      flag(runName, doc, "", "", "I4", `compliance summary ${metaCo} != card compliance count ${rawCo}/${cardCo}`);
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

  // I8 / I9 from FE dump (compare card face = combined label/colour, not evidence-only)
  const screen = screenByRun[runName] || screenByRun[`partA-${runName}`];
  if (screen) {
    for (const card of screen.cards || []) {
      const start = card.sentenceStart || "";
      const b = card.backend || {};
      const s = card.screen || {};
      const e = card.export || {};
      const same = (a, c) => clean(a) === clean(c);
      const bColour = b.colour === "none" ? "green" : b.colour;
      const sColour = s.colour === "none" ? "green" : s.colour;
      const eColour = e.colour === "none" ? "green" : e.colour;
      if (!same(b.label, s.label) || !same(b.reason, s.reason) || !same(bColour, sColour)) {
        flag(runName, doc, card.index, start, "I8", `screen!=backend label(${s.label}/${b.label}) colour(${sColour}/${bColour}) reason`, true);
      }
      if (!same(b.label, e.label) || !same(b.reason, e.reason) || (eColour && !same(bColour, eColour))) {
        flag(runName, doc, card.index, start, "I8", `export!=backend label(${e.label}/${b.label}) colour(${eColour}/${bColour})`, true);
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
const byInvStamped = {};
const byInvLegacy = {};
for (const row of rows) {
  byInv[row.invariant] = (byInv[row.invariant] || 0) + 1;
  if (row.stamped) byInvStamped[row.invariant] = (byInvStamped[row.invariant] || 0) + 1;
  else byInvLegacy[row.invariant] = (byInvLegacy[row.invariant] || 0) + 1;
}

const top = [...rows]
  .sort((a, b) => Number(b.isNew) - Number(a.isNew) || a.invariant.localeCompare(b.invariant))
  .slice(0, 10);

const stampedFlags = rows.filter((row) => row.stamped);
const summaryMd = [];
summaryMd.push("# B597 / B598 invariant sweep");
summaryMd.push("");
summaryMd.push(`Generated: ${new Date().toISOString()}`);
summaryMd.push(`Runs swept: ${Object.keys(stamped).length}`);
summaryMd.push(`Flag rows: ${rows.length} (stamped ${stampedFlags.length}, legacy ${rows.length - stampedFlags.length})`);
summaryMd.push("");
summaryMd.push("## Counts per invariant (all / stamped / legacy)");
summaryMd.push("");
for (const inv of ["I1", "I2", "I3", "I4", "I5", "I6", "I7", "I8", "I9", "I10", "I11", "I12"]) {
  summaryMd.push(`- ${inv}: ${byInv[inv] || 0} / stamped ${byInvStamped[inv] || 0} / legacy ${byInvLegacy[inv] || 0}`);
}
summaryMd.push("");
summaryMd.push("## Remaining stamped-run flags");
summaryMd.push("");
if (!stampedFlags.length) summaryMd.push("_None._");
else {
  for (const row of stampedFlags.slice(0, 80)) {
    summaryMd.push(`- ${row.invariant} · ${row.run} · S${row.sentenceIndex === "" ? "—" : Number(row.sentenceIndex) + 1}: ${clean(row.detail).slice(0, 180)}`);
  }
}
summaryMd.push("");
summaryMd.push("## Ten most important rows");
summaryMd.push("");
top.forEach((row, i) => {
  summaryMd.push(`${i + 1}. **${row.invariant}** ${row.stamped ? "stamped" : "legacy"} · ${row.run} · S${row.sentenceIndex === "" ? "—" : Number(row.sentenceIndex) + 1} · ${clean(row.detail).slice(0, 200)}`);
});
summaryMd.push("");
summaryMd.push(`Machine detail: \`~/ce-diagnostics/b597-diag/sweep.csv\` (${rows.length} rows).`);
summaryMd.push(`Re-run: \`node scripts/diagnostic/b597/sweep-invariants.mjs\``);

writeFileSync(path.join(OUT, "summary.md"), `${summaryMd.join("\n")}\n`);
mkdirSync(OUT_B598, { recursive: true });
writeFileSync(path.join(OUT_B598, "sweep-after.json"), `${JSON.stringify({
  generatedAt: new Date().toISOString(),
  runs: Object.keys(stamped).length,
  byInvariant: byInv,
  byInvStamped,
  byInvLegacy,
  stampedFlags: stampedFlags.map((row) => ({
    invariant: row.invariant,
    run: row.run,
    sentenceIndex: row.sentenceIndex,
    detail: row.detail,
  })),
}, null, 2)}\n`);

console.log(JSON.stringify({
  ok: true,
  runs: Object.keys(stamped).length,
  flags: rows.length,
  byInvariant: byInv,
  byInvStamped,
  byInvLegacy,
  stampedFlags: stampedFlags.length,
  summary: path.join(OUT, "summary.md"),
  csv: path.join(OUT, "sweep.csv"),
}, null, 2));
