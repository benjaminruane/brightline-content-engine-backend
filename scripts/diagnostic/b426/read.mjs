/**
 * B426 census reader. No model calls. Reads committed JSON and corpus
 * drafts already in the tree and prints counts the report cites.
 *
 *   node scripts/diagnostic/b426/read.mjs
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const OUT = path.join(ROOT, "scripts/diagnostic/b426/readings.json");
const MAX_BYTES = 12 * 1024 * 1024;

const TERM_NOUNS = [
  "Company",
  "Fund",
  "Group",
  "Partnership",
  "Manager",
  "Adviser",
  "Advisor",
  "Issuer",
  "Borrower",
  "Sponsor",
  "Investment",
  "Platform",
];

const CLEAN_LEDGER_REVIEWS = [
  { doc: "3i", arm: "clean", file: "tests/fixtures/real-runs-2026-09-29/clean-review.json" },
  { doc: "HICL", arm: "clean", file: "tests/fixtures/real-runs-2026-10-04-hicl/clean-review.json" },
  { doc: "GPI", arm: "clean", file: "tests/fixtures/real-runs-2026-10-06-gpi/clean-run2-review.json" },
  { doc: "ClearPoint", arm: "clean", file: "tests/fixtures/real-runs-2026-10-06-clearpoint/clean1-review.json" },
];

function norm(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function walkFiles(dir, acc) {
  let entries = [];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === ".git") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkFiles(full, acc);
    else if (entry.name.endsWith(".json")) acc.push(full);
  }
  return acc;
}

function textOf(obj) {
  if (typeof obj?.statement === "string" && obj.statement.trim()) return obj.statement.trim();
  if (typeof obj?.text === "string" && obj.text.trim()) return obj.text.trim();
  if (typeof obj?.claim === "string" && obj.claim.trim()) return obj.claim.trim();
  if (typeof obj?.originalClaimText === "string" && obj.originalClaimText.trim()) return obj.originalClaimText.trim();
  return "";
}

function summaryOf(obj) {
  const parts = [
    obj?.evidenceSummary,
    obj?.reasoningParagraph,
    obj?.explanation,
    obj?.shownNote,
    obj?.note,
  ];
  for (const part of parts) {
    if (typeof part === "string" && part.trim()) return part.trim();
  }
  return "";
}

function isSpan(obj) {
  return obj?.passage != null && (obj?.sourceRefId != null || obj?.start != null) && obj?.supportState == null && obj?.displayVerdict == null;
}

function isPartial(obj) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj) || isSpan(obj)) return false;
  const ss = String(obj.supportState || "").toLowerCase();
  const dv = String(obj.displayVerdict || "").toLowerCase();
  if (ss === "partial" || ss === "partially_confirmed" || dv === "supported_partial") return true;
  const cls = String(obj.classification || "").toLowerCase();
  if (cls !== "partially_confirmed") return false;
  if (obj.passage && !textOf(obj)) return false;
  return Boolean(textOf(obj));
}

function unsupportedText(obj) {
  const spans = Array.isArray(obj?.unsupportedSpans) ? obj.unsupportedSpans : [];
  return spans
    .map((span) => (typeof span?.text === "string" ? span.text.trim() : ""))
    .filter(Boolean)
    .join(" | ");
}

function excerptOf(obj) {
  if (typeof obj?.primaryExcerpt === "string") return obj.primaryExcerpt;
  if (obj?.primaryExcerpt && typeof obj.primaryExcerpt.passage === "string") return obj.primaryExcerpt.passage;
  if (typeof obj?.primaryExcerptText === "string") return obj.primaryExcerptText;
  if (typeof obj?.passage === "string") return obj.passage;
  return "";
}

const TIMING_GAP = /\b(timing detail|period mismatch|prior year|first quarter|full-year|full year|announcement (date|was made)|in november|does not specify that the announcement|year ending|quarter only)\b/i;
const SCOPE_GAP = /\b(not the entire|entire company|a part of the company|part of the company|subsidiary|subsidiaries|subset of|applies to all|only provides data|only covers|portfolio company|fortysouth|not the whole|rather than the entire|refers specifically|which entity|which company)\b/i;
const EVALUATIVE_BROAD = /\b(term|word|phrase).{0,60}\bbroader\b|\bbroader and typically\b|\bdoes not fully equate\b/i;
const THIN_GAP = /\b(does not (explicitly )?(mention|state|address|confirm|support|specify)|not explicitly|leaving this|additional aspect|additional detail|adjust the statement|verify the|verify these)\b/i;
const NO_PROSE = /specific commentary is unavailable|commentary is unavailable/i;
const CONTRADICTION = /\b(not the fda|issued by health canada|regulatory body|different benchmark|creates a gap)\b/i;

function classify(row) {
  const summary = row.summary || "";
  const unsupported = row.unsupported || "";
  const excerpt = row.excerpt || "";
  if (!summary.trim() || NO_PROSE.test(summary)) return { primary: "no_prose", tags: ["no_prose"] };
  const timingGap = TIMING_GAP.test(`${summary}\n${unsupported}`);
  const achievedVsFuture = /\b(will lead|will now)\b/i.test(unsupported) && /\b(completed|enabled|achieved|step-down)\b/i.test(`${excerpt}\n${summary}`);
  const timing = timingGap || achievedVsFuture;
  const scope = SCOPE_GAP.test(summary) && !EVALUATIVE_BROAD.test(summary) && !timingGap;
  const thin = THIN_GAP.test(summary);
  const contradiction = CONTRADICTION.test(summary);
  const tags = [];
  if (timing) tags.push("timing");
  if (scope) tags.push("scope");
  if (thin) tags.push("thin");
  if (contradiction) tags.push("contradiction");
  let primary = "something_else";
  if (timingGap) primary = "timing";
  else if (scope && achievedVsFuture) primary = "scope";
  else if (scope) primary = "scope";
  else if (achievedVsFuture) primary = "timing";
  else if (thin) primary = "thin";
  else if (contradiction) primary = "something_else";
  return { primary, tags };
}

function collectPartials(files) {
  const hits = [];
  const skipped = [];
  const parsed = [];
  for (const file of files) {
    let size = 0;
    try {
      size = statSync(file).size;
    } catch {
      continue;
    }
    if (size > MAX_BYTES) {
      skipped.push({ file: path.relative(ROOT, file), bytes: size });
      continue;
    }
    let data;
    try {
      data = JSON.parse(readFileSync(file, "utf8"));
    } catch {
      skipped.push({ file: path.relative(ROOT, file), bytes: size, reason: "parse" });
      continue;
    }
    parsed.push(path.relative(ROOT, file));
    const stack = [data];
    while (stack.length) {
      const node = stack.pop();
      if (!node || typeof node !== "object") continue;
      if (Array.isArray(node)) {
        for (const item of node) stack.push(item);
        continue;
      }
      if (isPartial(node)) {
        const statement = textOf(node);
        if (statement) {
          hits.push({
            file: path.relative(ROOT, file),
            statement,
            summary: summaryOf(node),
            unsupported: unsupportedText(node),
            excerpt: excerptOf(node).slice(0, 500),
            supportState: node.supportState || null,
            displayVerdict: node.displayVerdict || null,
            classification: node.classification || null,
            displayVerdictReason: node.displayVerdictReason || null,
          });
        }
      }
      for (const value of Object.values(node)) {
        if (value && typeof value === "object") stack.push(value);
      }
    }
  }
  return { hits, skipped, parsedCount: parsed.length };
}

function dedupe(hits) {
  const byKey = new Map();
  for (const hit of hits) {
    const key = norm(hit.statement).toLowerCase();
    const prev = byKey.get(key);
    if (!prev || hit.summary.length > prev.summary.length) byKey.set(key, { ...hit, occurrences: (prev?.occurrences || 0) + 1, files: new Set([hit.file, ...(prev ? [...prev.files] : [])]) });
    else {
      prev.occurrences += 1;
      prev.files.add(hit.file);
    }
  }
  return [...byKey.values()].map((row) => {
    const judged = classify(row);
    return {
      ...row,
      files: [...row.files].sort(),
      primary: judged.primary,
      tags: judged.tags,
    };
  });
}

function loadLedger() {
  const file = path.join(ROOT, "scripts/diagnostic/b403c/runs/reading.json");
  const data = JSON.parse(readFileSync(file, "utf8"));
  const map = new Map();
  for (const draft of data.drafts || []) {
    for (const row of draft.statements || []) {
      map.set(`${draft.doc}|${draft.arm}|${norm(row.text).toLowerCase()}`, {
        doc: draft.doc,
        arm: draft.arm,
        index: row.index,
        sentenceState: row.sentenceState,
        tier: row.tier,
        ledger: row.ledger || null,
        bucket: row.bucket,
        shownNote: row.shownNote || "",
      });
    }
  }
  return map;
}

function cleanPartialJoin(unique, ledger) {
  const out = [];
  for (const spec of CLEAN_LEDGER_REVIEWS) {
    const review = JSON.parse(readFileSync(path.join(ROOT, spec.file), "utf8"));
    const statements = Array.isArray(review.statements) ? review.statements : [];
    statements.forEach((row, index) => {
      const card = row?.qcCard && typeof row.qcCard === "object" ? row.qcCard : row;
      if (!isPartial(card) && !isPartial(row)) return;
      const statement = textOf(card) || textOf(row);
      const led = ledger.get(`${spec.doc}|${spec.arm}|${norm(statement).toLowerCase()}`) || null;
      const match = unique.find((item) => norm(item.statement).toLowerCase() === norm(statement).toLowerCase());
      out.push({
        doc: spec.doc,
        arm: spec.arm,
        index: row?.id ?? card?.index ?? index,
        statement,
        summary: summaryOf(card),
        unsupported: unsupportedText(card),
        excerpt: excerptOf(card).slice(0, 400),
        sentenceState: led?.sentenceState || null,
        tier: led?.tier || null,
        ledger: led?.ledger || null,
        bucket: led?.bucket || null,
        primary: match?.primary || null,
        tags: match?.tags || [],
      });
    });
  }
  return out;
}

function definedTerms(source) {
  const found = new Set();
  const patterns = [
    /\(\s*(?:["“']\s*)?(?:the\s+)?["“']?([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+)?)["”']?\s*\)/g,
    /["“]the\s+([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+)?)["”]/g,
  ];
  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    let match = pattern.exec(source);
    while (match) {
      const words = match[1].split(/\s+/);
      const last = words[words.length - 1];
      if (TERM_NOUNS.includes(last) || TERM_NOUNS.includes(match[1])) found.add(last);
      match = pattern.exec(source);
    }
  }
  return [...found];
}

function countForms(draft, term) {
  let ambiguous = 0;
  let correct = 0;
  let sentenceInitial = 0;
  const samples = [];
  const re = new RegExp(`\\b([Tt]he)\\s+(${term.toLowerCase()})\\b`, "gi");
  let match = re.exec(draft);
  while (match) {
    const noun = match[2];
    if (noun === term) {
      correct += 1;
    } else {
      ambiguous += 1;
      const at = match.index;
      const before = draft.slice(Math.max(0, at - 1), at);
      if (before === "" || before === "\n" || /[.!?]\s*$/.test(draft.slice(Math.max(0, at - 3), at))) sentenceInitial += 1;
      if (samples.length < 6) samples.push(draft.slice(Math.max(0, at - 40), at + match[0].length + 50).replace(/\s+/g, " "));
    }
    match = re.exec(draft);
  }
  return { ambiguous, correct, sentenceInitial, samples };
}

function bluntGenerics(draft) {
  const re = /\bthe\s+(company|fund|group|firm|partnership|manager|adviser|advisor|issuer|borrower|sponsor)\b/gi;
  const hits = [];
  let match = re.exec(draft);
  while (match) {
    hits.push(match[0]);
    match = re.exec(draft);
  }
  return hits.length;
}

function loadPairs() {
  const pairs = [];
  const fixtureDir = path.join(ROOT, "scripts/diagnostic/fixtures");
  for (const name of readdirSync(fixtureDir)) {
    if (!name.endsWith(".json")) continue;
    const fixture = JSON.parse(readFileSync(path.join(fixtureDir, name), "utf8"));
    const draft = typeof fixture.draft === "string" ? fixture.draft : "";
    const sources = Array.isArray(fixture.sources) ? fixture.sources : [];
    const sourceText = sources
      .map((source) => {
        const rel = typeof source === "string" ? source : source?.file;
        if (!rel) return "";
        const full = path.join(ROOT, "scripts/diagnostic/sources", path.basename(rel));
        try {
          return readFileSync(full, "utf8");
        } catch {
          return "";
        }
      })
      .join("\n");
    pairs.push({ id: `fixture:${name}`, population: "corpus", draft, source: sourceText });
  }
  const reviewFiles = walkFiles(path.join(ROOT, "tests/fixtures"), []);
  for (const file of reviewFiles) {
    if (!file.endsWith(".json")) continue;
    let data;
    try {
      data = JSON.parse(readFileSync(file, "utf8"));
    } catch {
      continue;
    }
    const statements = Array.isArray(data.statements) ? data.statements : null;
    if (!statements) continue;
    const draft = statements.map((row) => textOf(row?.qcCard || row) || textOf(row)).filter(Boolean).join("\n");
    let source = "";
    if (Array.isArray(data.sources)) {
      source = data.sources
        .map((item) => (typeof item === "string" ? item : item?.text || item?.extractedText || item?.content || ""))
        .filter((item) => typeof item === "string")
        .join("\n");
    }
    const dir = path.dirname(file);
    if (source.length < 200) {
      const siblings = readdirSync(dir).filter((name) => /source.*extracted\.txt$/.test(name) || name.startsWith("source-"));
      source = siblings.map((name) => readFileSync(path.join(dir, name), "utf8")).join("\n");
    }
    if (!draft.trim()) continue;
    pairs.push({ id: path.relative(ROOT, file), population: "payload", draft, source });
  }
  return pairs;
}

function referentCounts(pairs) {
  const seenDraft = new Set();
  const rows = [];
  for (const pair of pairs) {
    const key = norm(pair.draft).toLowerCase();
    if (!key || seenDraft.has(`${pair.population}|${key}`)) continue;
    seenDraft.add(`${pair.population}|${key}`);
    const terms = definedTerms(pair.source);
    let careful = 0;
    let correct = 0;
    const fired = [];
    for (const term of terms) {
      const counts = countForms(pair.draft, term);
      careful += counts.ambiguous;
      correct += counts.correct;
      if (counts.ambiguous) {
        fired.push({
          term,
          ambiguous: counts.ambiguous,
          sentenceInitial: counts.sentenceInitial,
          correct: counts.correct,
          samples: counts.samples,
        });
      }
    }
    rows.push({
      id: pair.id,
      population: pair.population,
      defines: terms,
      careful,
      correct,
      blunt: bluntGenerics(pair.draft),
      fired,
      draftChars: pair.draft.length,
      sourceChars: pair.source.length,
    });
  }
  return rows;
}

const FUTURE = /\b(will|going to|expects to|is expected to|expected to|set to|poised to|will lead|will enable|will deliver|will reduce|will result|over the coming)\b/i;
const ACHIEVED = /\b(completed|has completed|achieved|enabled|delivered|appointed|step-down|earlier than)\b/i;

function timingCandidates(files) {
  const hits = [];
  for (const file of files) {
    let size = 0;
    try {
      size = statSync(file).size;
    } catch {
      continue;
    }
    if (size > MAX_BYTES) continue;
    if (!file.includes("fixtures") && !file.includes("real-runs") && !file.includes("diagnostic/b3") && !file.includes("diagnostic/b4")) continue;
    let data;
    try {
      data = JSON.parse(readFileSync(file, "utf8"));
    } catch {
      continue;
    }
    const stack = [data];
    while (stack.length) {
      const node = stack.pop();
      if (!node || typeof node !== "object") continue;
      if (Array.isArray(node)) {
        for (const item of node) stack.push(item);
        continue;
      }
      const statement = textOf(node);
      const excerpt = excerptOf(node);
      if (statement && excerpt && FUTURE.test(statement) && ACHIEVED.test(excerpt) && node.supportState) {
        hits.push({
          file: path.relative(ROOT, file),
          supportState: node.supportState,
          statement: statement.slice(0, 280),
          excerpt: excerpt.slice(0, 280),
        });
      }
      for (const value of Object.values(node)) {
        if (value && typeof value === "object") stack.push(value);
      }
    }
  }
  const byKey = new Map();
  for (const hit of hits) {
    const key = norm(hit.statement).toLowerCase();
    if (!byKey.has(key)) byKey.set(key, hit);
  }
  return { raw: hits.length, unique: [...byKey.values()] };
}

function refusalScan() {
  const files = walkFiles(path.join(ROOT, "scripts/diagnostic"), []).filter((file) => file.endsWith("reading.json") || file.endsWith("notes.json"));
  let refusedAttempts = 0;
  let shownEmptyAfterRefusal = 0;
  const examples = [];
  for (const file of files) {
    let data;
    try {
      data = JSON.parse(readFileSync(file, "utf8"));
    } catch {
      continue;
    }
    const drafts = Array.isArray(data.drafts) ? data.drafts : [];
    for (const draft of drafts) {
      for (const row of draft.statements || []) {
        const attempts = Array.isArray(row.attempts) ? row.attempts : [];
        const refused = attempts.filter((attempt) => attempt?.refusedReason);
        if (row.withheldText) {
          refusedAttempts += 1;
        }
        refusedAttempts += refused.length;
        const emptyShown = !String(row.shownNote || row.note || "").trim();
        if ((refused.length || row.withheldText) && emptyShown) {
          shownEmptyAfterRefusal += 1;
          if (examples.length < 8) {
            examples.push({
              file: path.relative(ROOT, file),
              doc: draft.doc,
              arm: draft.arm,
              index: row.index,
              state: row.sentenceState || null,
              withheldText: String(row.withheldText || "").slice(0, 180),
              reasons: refused.map((attempt) => attempt.refusedReason),
            });
          }
        }
      }
    }
  }
  return { files: files.map((file) => path.relative(ROOT, file)), refusedAttempts, shownEmptyAfterRefusal, examples };
}

const files = walkFiles(ROOT, []);
const collected = collectPartials(files);
const unique = dedupe(collected.hits);
const ledger = loadLedger();
const clean = cleanPartialJoin(unique, ledger);
const pairs = loadPairs();
const referents = referentCounts(pairs);
const timing = timingCandidates(files);
const refusals = refusalScan();

function tally(rows, key) {
  const out = {};
  for (const row of rows) {
    const value = row[key] || "missing";
    out[value] = (out[value] || 0) + 1;
  }
  return out;
}

const referentSummary = {
  uniqueDrafts: referents.length,
  byPopulation: {
    corpus: referents.filter((row) => row.population === "corpus").length,
    payload: referents.filter((row) => row.population === "payload").length,
  },
  draftsWhoseSourceDefines: referents.filter((row) => row.defines.length > 0).length,
  carefulFirings: referents.reduce((sum, row) => sum + row.careful, 0),
  sentenceInitialFirings: referents.reduce((sum, row) => sum + row.fired.reduce((inner, item) => inner + (item.sentenceInitial || 0), 0), 0),
  draftsWithACarefulFiring: referents.filter((row) => row.careful > 0).length,
  correctCapitalisedUses: referents.reduce((sum, row) => sum + row.correct, 0),
  bluntGenericUses: referents.reduce((sum, row) => sum + row.blunt, 0),
  definingDraftsWithNoAmbiguousUse: referents.filter((row) => row.defines.length > 0 && row.careful === 0).length,
};

const payload = {
  jsonFilesSeen: files.length,
  jsonFilesParsed: collected.parsedCount,
  skipped: collected.skipped,
  partialOccurrences: collected.hits.length,
  partialUniqueStatements: unique.length,
  primary: tally(unique, "primary"),
  cleanLedgerPartials: clean.length,
  cleanByPrimary: tally(clean, "primary"),
  cleanByTier: tally(clean, "tier"),
  cleanByState: tally(clean, "sentenceState"),
  referentSummary,
  timingUnique: timing.unique.length,
  timingRaw: timing.raw,
  refusals: {
    refusedAttempts: refusals.refusedAttempts,
    shownEmptyAfterRefusal: refusals.shownEmptyAfterRefusal,
  },
};

writeFileSync(OUT, JSON.stringify({
  payload,
  clean,
  unique: unique.map((row) => ({
    primary: row.primary,
    tags: row.tags,
    occurrences: row.occurrences,
    files: row.files.slice(0, 6),
    statement: row.statement.slice(0, 320),
    summary: row.summary.slice(0, 500),
    unsupported: row.unsupported.slice(0, 240),
    displayVerdictReason: row.displayVerdictReason,
  })),
  referents: referents.filter((row) => row.careful > 0 || row.defines.length > 0).map((row) => ({
    id: row.id,
    population: row.population,
    defines: row.defines,
    careful: row.careful,
    correct: row.correct,
    blunt: row.blunt,
    fired: row.fired,
  })),
  timing: timing.unique,
  refusalExamples: refusals.examples,
}, null, 2));

console.log(JSON.stringify(payload, null, 2));
console.log("wrote", path.relative(ROOT, OUT));
