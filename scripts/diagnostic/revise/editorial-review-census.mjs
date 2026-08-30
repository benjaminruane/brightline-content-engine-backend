#!/usr/bin/env node
/**
 * Editorial review census. Free. Zero model calls. Read-only.
 *
 * Maps live rulebooks + post-model referees, then counts firing rates
 * and heuristic false-raise candidates on stored Review artefacts.
 *
 * Usage: node scripts/diagnostic/revise/editorial-review-census.mjs
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import editorialRules from "../../../lib/rulebook/editorialRules.js";
import styleGuideLegacy from "../../../lib/rulebook/styleGuide.js";
import complianceRules from "../../../lib/rulebook/complianceRules.js";
import {
  STYLE_GUIDE_LAYER_1,
  STYLE_GUIDE_LAYER_2_CLIENT,
  resolveStyleGuide,
} from "../../../lib/qc/style-guide.mjs";
import { applyDeterministicStyleFilters } from "../../../lib/qc/editorial-compliance-reviewer.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REVISE_DIR = __dirname;
const ABLATION_DIR = path.join(__dirname, "..", "eval-ablation");

const DROP_FILTER_KEYS = [
  "oxford_comma",
  "english_variant",
  "date_format",
  "number_spelling",
  "percentage_notation",
  "thousand_separator",
  "currency_format",
  "first_person_plural",
  "defined_term_capitalisation",
];

const RESHAPE_ONLY = {
  voice_consistency: "applyViewMarkerSubjectBounds — rewrites direction; does not drop the raise",
  marketing_language_excess: "applyEvaluativeDeletionBounds — bounds delete/restatement; does not drop the raise",
  hyperbole_vs_qualitative: "applyEvaluativeDeletionBounds — bounds delete/restatement; does not drop the raise",
};

const FIRST_PERSON_RE = /\b(?:we|our|ours|us|we're|we've|we'll|we'd|ourselves)\b/i;
const LEADING_ADVERBIAL_RE =
  /^(?:(?:in|on|as of|during|since|by|at|following|after|before|throughout)\b[^,]{2,40},\s*|(?:on balance|however|furthermore|in addition|overall|accordingly|therefore|separately|more broadly),\s*)/i;
const CAUSAL_RE =
  /\b(?:driven by|as a result of|because of|thanks to|owing to|due to|caused|causes|causing|enabled|enables|enabling|led to|leads to|resulted in|results in|resulting in|meant that|means that|underpinned)\b/i;
const HYPE_RE =
  /\b(?:exceptional(?:ly)?|unparalleled|extraordinary|unmatched|world-class|industry-leading|market-leading|best-in-class|revolutionary|game-changing|transformative|genuinely\s+\w+|genuine differentiator)\b/i;
const CLICHE_RE =
  /\b(?:at the end of the day|needless to say|it goes without saying|in today's environment|moving forward|when all is said and done|the bottom line is)\b/i;
const EM_EN_DASH_RE = /[\u2014\u2013]/;
const SMART_QUOTE_RE = /[\u201C\u201D\u2018\u2019]/;
const BRITISH_SAMPLE_RE =
  /\b(?:organis|colour|behaviour|centre|realis|recognis|defence|licence|whilst|amongst|towards)\w*\b/i;

const HOUSE_BY_FILE = {
  "suggest-after-r10-review1.json": "Halden Group",
  "suggest-after-r10-review2.json": "Halden Group",
  "condition-b-review.json": "Halden Group",
  "coverage-gap-review.json": "Partners Group",
};

const REVIEW_FILES = [
  "suggest-after-r10-review1.json",
  "suggest-after-r10-review2.json",
  "condition-b-review.json",
  "coverage-gap-review.json",
];

function ids(rules) {
  return rules.map((r) => r.id);
}

function houseIsLeadingSubject(statement, house) {
  if (!house) return false;
  const stripped = String(statement || "").trim().replace(LEADING_ADVERBIAL_RE, "");
  const escaped = house.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^${escaped}\\b`, "i").test(stripped);
}

function wordCount(text) {
  return String(text || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

function codeOf(c) {
  return String(c?.concernCode || c?.rule || "").trim();
}

function findStatementArrays(node, out = [], depth = 0) {
  if (!node || typeof node !== "object" || depth > 10) return out;
  if (Array.isArray(node)) {
    if (node.length && node[0] && (node[0].qcCard || node[0].editorialConcerns)) out.push(node);
    node.forEach((n) => findStatementArrays(n, out, depth + 1));
    return out;
  }
  for (const v of Object.values(node)) findStatementArrays(v, out, depth + 1);
  return out;
}

function citedFromFirstSpan(statement, concern) {
  const spans = Array.isArray(concern?.span) ? concern.span : [];
  const first = spans[0];
  if (!first || typeof first.startChar !== "number" || typeof first.endChar !== "number") {
    return { cited: "", hasSpan: false };
  }
  return {
    cited: String(statement || "").slice(first.startChar, first.endChar),
    hasSpan: true,
    startChar: first.startChar,
    endChar: first.endChar,
  };
}

function collectStatements(json, file) {
  const arrays = findStatementArrays(json);
  const seen = new Set();
  const rows = [];
  for (const arr of arrays) {
    for (const stmt of arr) {
      const card = stmt?.qcCard || stmt;
      const text = String(card?.statement || stmt?.text || "");
      const idx = stmt?.id ?? card?.index;
      const key = `${file}::${idx}::${text}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({
        file,
        id: idx,
        text,
        house: HOUSE_BY_FILE[file] || null,
        supportState: card?.supportState ?? null,
        displayVerdict: card?.displayVerdict ?? null,
        editorialVerdict: card?.editorialVerdict ?? null,
        editorialConcerns: Array.isArray(card?.editorialConcerns) ? card.editorialConcerns : [],
        complianceConcerns: Array.isArray(card?.complianceConcerns) ? card.complianceConcerns : [],
      });
    }
  }
  return rows;
}

function heuristicFlags(row, concern) {
  const code = codeOf(concern);
  const text = row.text;
  const flags = [];
  const { cited, hasSpan } = citedFromFirstSpan(text, concern);
  const probe = cited || text;
  const hasPronoun = FIRST_PERSON_RE.test(text);
  const spanPronoun = FIRST_PERSON_RE.test(cited);
  const houseSubject = houseIsLeadingSubject(text, row.house);

  if (code === "voice_consistency" || code === "first_person_plural") {
    if (!hasPronoun) flags.push("voice_no_pronoun_in_statement");
    if (hasSpan && !spanPronoun) flags.push("voice_no_pronoun_in_span");
    if (houseSubject && !hasPronoun) flags.push("voice_house_already_subject");
    if (houseSubject && hasPronoun === false) flags.push("voice_third_person_house");
  }
  if (code === "overreach_unsupported_causal" && !CAUSAL_RE.test(text)) {
    flags.push("causal_no_causal_lexicon");
  }
  if (
    (code === "marketing_language_excess" || code === "hyperbole_vs_qualitative") &&
    !HYPE_RE.test(text)
  ) {
    flags.push("hype_no_listed_token");
  }
  if (code === "sentence_length" && wordCount(text) <= 40) {
    flags.push("sentence_length_under_40_words");
  }
  if (code === "cliche_and_filler" && !CLICHE_RE.test(text)) {
    flags.push("cliche_no_listed_phrase");
  }
  if ((code === "em_dash" || code === "no_em_or_en_dashes") && !EM_EN_DASH_RE.test(text)) {
    flags.push("em_dash_absent");
  }
  if (
    (code === "smart_quotes" || code === "straight_quotes_and_apostrophes") &&
    !SMART_QUOTE_RE.test(text)
  ) {
    flags.push("smart_quotes_absent");
  }
  if (code === "english_variant" && !BRITISH_SAMPLE_RE.test(probe) && !BRITISH_SAMPLE_RE.test(text)) {
    flags.push("english_variant_no_british_token");
  }
  if (code === "percentage_notation" && /\d[\d.,]*\s*%/.test(text) && !/\bper\s?cent\b/i.test(text)) {
    flags.push("percentage_already_uses_symbol");
  }
  if (!hasSpan) flags.push("no_span");
  return flags;
}

function p(s = "") {
  console.log(s);
}

function section(title) {
  p("");
  p("=".repeat(72));
  p(title);
  p("=".repeat(72));
}

// ---------------------------------------------------------------------------
// 1. THE MAP
// ---------------------------------------------------------------------------
section("1. THE MAP — live v4 rulebooks");

const liveStyleRc = resolveStyleGuide({ outputType: "reporting_commentary" });
const liveStyleIl = resolveStyleGuide({ outputType: "investor_letter" });
const liveStylePr = resolveStyleGuide({ outputType: "press_release" });
const liveStyleLi = resolveStyleGuide({ outputType: "linkedin_post" });

p(`Editorial rules: ${editorialRules.length}  file: lib/rulebook/editorialRules.js`);
p(`  ids: ${ids(editorialRules).join(", ")}`);
p("");
p(`Style rules LIVE v4: lib/qc/style-guide.mjs via resolveStyleGuide()`);
p(`  Layer 1 (${STYLE_GUIDE_LAYER_1.length}): ${ids(STYLE_GUIDE_LAYER_1).join(", ")}`);
p(`  Layer 2 CLIENT (${STYLE_GUIDE_LAYER_2_CLIENT.length}): ${ids(STYLE_GUIDE_LAYER_2_CLIENT).join(", ")}`);
p(`  reporting_commentary (${liveStyleRc.length}): ${ids(liveStyleRc).join(", ")}`);
p(`  investor_letter     (${liveStyleIl.length}): ${ids(liveStyleIl).join(", ")}`);
p(`  press_release       (${liveStylePr.length}): ${ids(liveStylePr).join(", ")}`);
p(`  linkedin_post       (${liveStyleLi.length}): ${ids(liveStyleLi).join(", ")}`);
p(`  first_person_plural applies_to: reporting_commentary only`);
p("");
p(`Style rules LEGACY v3: lib/rulebook/styleGuide.js (${styleGuideLegacy.length}) — not in the v4 combined prompt`);
p(`  ids: ${ids(styleGuideLegacy).join(", ")}`);
p("");
p(`Compliance rules: ${complianceRules.length}  file: lib/rulebook/complianceRules.js`);
p(`  ids: ${ids(complianceRules).join(", ")}`);
p("");
p("MODEL CALLS (lib/qc/model-config.mjs, all gpt-4o-2024-08-06 temp 0):");
p("  v4 Editorial+Style: ONE combined call  runEditorialStyleReview");
p("    prompt built in lib/qc/editorial-compliance-reviewer.mjs buildEditorialStyleSystemPrompt");
p("    editorial half: editorialRules.js filtered by output type");
p("    style half:     resolveStyleGuide() from style-guide.mjs");
p("  v4 Compliance:     SEPARATE call  runComplianceReview");
p("    prompt: buildComplianceSystemPrompt; rules from complianceRules.js");
p("  v3 (not production): runEditorialReview + runStyleGuideReview (styleGuide.js) + runComplianceReview");

const allLiveIds = [
  ...editorialRules.map((r) => ({ id: r.id, book: "editorial", category: "editorial" })),
  ...liveStyleRc.map((r) => ({ id: r.id, book: "style_v4", category: "style_guide" })),
  ...complianceRules.map((r) => ({ id: r.id, book: "compliance", category: "compliance" })),
];
const uniqueLive = [...new Map(allLiveIds.map((r) => [r.id, r])).values()];
p("");
p(`Unique live rule ids on reporting_commentary: ${uniqueLive.length}`);
p(`  editorial ${editorialRules.length} + style ${liveStyleRc.length} + compliance ${complianceRules.length} = ${editorialRules.length + liveStyleRc.length + complianceRules.length}`);

// ---------------------------------------------------------------------------
// 2. THE REFEREE AUDIT
// ---------------------------------------------------------------------------
section("2. THE REFEREE AUDIT");

p("DROP FILTERS (STYLE_RULE_DETERMINISTIC_FILTERS in editorial-compliance-reviewer.mjs):");
p("  Lookup is by rule id, not category. No span → filter skipped (concern kept).");
p("  Editorial ids therefore skip these filters unless they share a style id.");
p("");
const filterWhat = {
  oxford_comma: "drop if cited span has 'and'/'or' and no comma (two-item list)",
  english_variant: "drop if cited span has no British spelling token",
  date_format: "drop if cited span already matches DD FullMonthName YYYY",
  number_spelling: "drop if span is %, quarter notation, or spelled 0–12 (already correct)",
  percentage_notation: "drop if span or statement already uses % and not 'per cent'",
  thousand_separator: "drop if statement uses apostrophe thousands and no comma thousands",
  currency_format: "drop if statement uses ISO-code-before-amount and no symbol/suffix",
  first_person_plural: "drop if cited span / statement has no we/our/us pronoun",
  defined_term_capitalisation: "drop if term not defined in draft, or cited span already capitalised",
};
for (const k of DROP_FILTER_KEYS) p(`  ${k}: ${filterWhat[k]}`);

p("");
p("RESHAPE-ONLY (do not drop the raise):");
for (const [k, v] of Object.entries(RESHAPE_ONLY)) p(`  ${k}: ${v}`);
p("  first_person_plural also gets applyViewMarkerSubjectBounds (in addition to drop filter)");

p("");
p("UNIVERSAL post-model (not property referees):");
p("  verifyFidelity / applyFidelityGate: drop if a cued quote is not in statement/excerpt");
p("  suppressNoOpSuggestions: drop if suggestedRewrite === statement");
p("  deriveConcernSpan: locate quotes; missing span skips the drop-filter");
p("  R6.3 editorial-duplication-judge: MODEL call, only when evidence is conflicting — not a referee");

p("");
p("COMPLIANCE: fidelity gate only. No STYLE_RULE_DETERMINISTIC_FILTERS entries.");

const styleIds = ids(liveStyleRc);
const editorialIds = ids(editorialRules);
const complianceIds = ids(complianceRules);

function refereeKind(id, book) {
  if (DROP_FILTER_KEYS.includes(id)) return "drop_filter";
  if (RESHAPE_ONLY[id]) return "reshape_only";
  return "model_word_alone";
}

p("");
p("PER-RULE RAISE REFEREE (reporting_commentary live set):");
const tally = { drop_filter: 0, reshape_only: 0, model_word_alone: 0 };
for (const book of [
  ["editorial", editorialIds],
  ["style_v4", styleIds],
  ["compliance", complianceIds],
]) {
  p(`  -- ${book[0]} --`);
  for (const id of book[1]) {
    const kind = refereeKind(id, book[0]);
    tally[kind] += 1;
    p(`    ${id.padEnd(42)} ${kind}`);
  }
}
p("");
p(`HEADLINE: drop_filter=${tally.drop_filter}  reshape_only=${tally.reshape_only}  model_word_alone=${tally.model_word_alone}`);
p(`  Of ${editorialIds.length + styleIds.length + complianceIds.length} live rules, ${tally.drop_filter} have a keep/drop property referee.`);
p(`  ${tally.model_word_alone + tally.reshape_only} raises stand or fall on the model's word (reshape does not veto a false raise).`);
p(`  Style specifically: ${styleIds.filter((id) => DROP_FILTER_KEYS.includes(id)).length} of ${styleIds.length} have a drop filter; ${styleIds.length - styleIds.filter((id) => DROP_FILTER_KEYS.includes(id)).length} do not.`);
p(`  Editorial: 0 of ${editorialIds.length} have a drop filter.`);
p(`  Compliance: 0 of ${complianceIds.length} have a drop filter.`);

p("");
p("STRUCTURALLY CHECKABLE with NO drop filter:");
p("  voice_consistency     — pronoun + house-as-subject (B132); MUST be scoped by output type");
p("  em_dash               — character U+2014 / U+2013 present");
p("  smart_quotes          — curly quote characters present");
p("  sentence_length       — word count ≳ 40");
p("  cliche_and_filler     — closed phrase list in the rule");
p("  overreach_unsupported_causal — causal-lexicon PRESENCE is checkable; warrant is not");

// ---------------------------------------------------------------------------
// 3–4. FIRING RATES + CONCERN DUMP
// ---------------------------------------------------------------------------
section("3. FIRING RATES — stored Review artefacts");

const reviewRows = [];
for (const file of REVIEW_FILES) {
  const json = JSON.parse(await readFile(path.join(REVISE_DIR, file), "utf8"));
  reviewRows.push(...collectStatements(json, file));
}

p(`Files: ${REVIEW_FILES.join(", ")}`);
p(`Statements: ${reviewRows.length}`);
p(`  ${REVIEW_FILES.map((f) => `${f}=${reviewRows.filter((r) => r.file === f).length}`).join("  ")}`);

const fire = new Map();
function bump(map, key, n = 1) {
  map.set(key, (map.get(key) || 0) + n);
}

const allConcerns = [];
const pairs = [];
for (const row of reviewRows) {
  const codes = [];
  for (const c of row.editorialConcerns) {
    const code = codeOf(c) || "(missing)";
    bump(fire, `editorial:${code}`);
    const flags = heuristicFlags(row, c);
    const { cited, hasSpan, startChar, endChar } = citedFromFirstSpan(row.text, c);
    const asStyle = {
      ...c,
      concernCode: "first_person_plural",
      rule: "first_person_plural",
      span: c.span,
    };
    const keptIfPronounFilter = applyDeterministicStyleFilters([asStyle], row.text, row.text);
    allConcerns.push({
      book: "editorial+style",
      file: row.file,
      id: row.id,
      code,
      category: c.category || null,
      supportState: row.supportState,
      text: row.text,
      note: c.note || "",
      direction: c.suggestedDirection || "",
      cited,
      hasSpan,
      startChar,
      endChar,
      flags,
      pronounFilterWouldDrop:
        (code === "voice_consistency" || code === "first_person_plural") &&
        keptIfPronounFilter.length === 0,
    });
    codes.push(code);
  }
  for (const c of row.complianceConcerns) {
    const code = codeOf(c) || "(missing)";
    bump(fire, `compliance:${code}`);
    const flags = heuristicFlags(row, c);
    const { cited, hasSpan, startChar, endChar } = citedFromFirstSpan(row.text, c);
    allConcerns.push({
      book: "compliance",
      file: row.file,
      id: row.id,
      code,
      category: c.category || null,
      supportState: row.supportState,
      text: row.text,
      note: c.note || "",
      direction: c.suggestedDirection || "",
      cited,
      hasSpan,
      startChar,
      endChar,
      flags,
      pronounFilterWouldDrop: false,
    });
    codes.push(code);
  }
  if (codes.length >= 2) {
    pairs.push({ file: row.file, id: row.id, codes, text: row.text, supportState: row.supportState });
  }
}

const statementCount = reviewRows.length;
const liveIdSet = new Set([...editorialIds, ...styleIds, ...complianceIds]);

p("");
p("Per-rule fire count (concerns, not distinct statements). Rate = fires / statements.");
p("");
p("  BOOK            RULE                                       N    RATE");
const fireRows = [...fire.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
for (const [k, n] of fireRows) {
  const [book, code] = k.split(":");
  const rate = ((n / statementCount) * 100).toFixed(1);
  p(`  ${book.padEnd(15)} ${code.padEnd(42)} ${String(n).padStart(2)}   ${rate.padStart(5)}%`);
}

p("");
p("Rules that NEVER fired in this corpus:");
const firedIds = new Set([...fire.keys()].map((k) => k.split(":")[1]));
const never = [...liveIdSet].filter((id) => !firedIds.has(id)).sort();
p(`  ${never.length} of ${liveIdSet.size}: ${never.join(", ")}`);

p("");
p("Rules that fired on more than one in five statements:");
for (const [k, n] of fireRows) {
  if (n / statementCount >= 0.2) p(`  ${k}  ${n}/${statementCount}`);
}

p("");
p(`Statements with 2+ concerns: ${pairs.length}`);
for (const pair of pairs) {
  p(`  ${pair.file} S${pair.id} [${pair.supportState}] ${pair.codes.join(" + ")}`);
  p(`    ${JSON.stringify(pair.text).slice(0, 160)}`);
}

section("4. EVERY STORED CONCERN (for wrong-raise read)");
p(`Total concerns: ${allConcerns.length}`);
p("");
for (const c of allConcerns) {
  p(`--- ${c.file} S${c.id}  ${c.book}  ${c.code}  category=${c.category}  evidence=${c.supportState}`);
  p(`    stmt: ${JSON.stringify(c.text)}`);
  p(`    span: ${c.hasSpan ? `${JSON.stringify(c.cited)} [${c.startChar},${c.endChar}]` : "(none)"}`);
  p(`    note: ${c.note}`);
  p(`    dir:  ${c.direction}`);
  p(`    heuristic: ${c.flags.join(", ") || "(none)"}`);
  if (c.pronounFilterWouldDrop) p("    PRONOUN FILTER WOULD DROP if this were first_person_plural");
}

section("4b. HEURISTIC WRONG-RAISE CANDIDATES");
const flagged = allConcerns.filter((c) => c.flags.some((f) => f !== "no_span") || c.pronounFilterWouldDrop);
p(`Concerns with a property heuristic (excluding bare no_span): ${flagged.filter((c) => c.flags.some((f) => f !== "no_span") || c.pronounFilterWouldDrop).length}`);
for (const c of flagged) {
  const interesting = c.flags.filter((f) => f !== "no_span");
  if (interesting.length === 0 && !c.pronounFilterWouldDrop) continue;
  p(`  ${c.file} S${c.id} ${c.code}  ${interesting.join(", ") || ""}${c.pronounFilterWouldDrop ? " PRONOUN_FILTER_DROP" : ""}`);
  p(`    ${JSON.stringify(c.text).slice(0, 180)}`);
  p(`    dir: ${c.direction}`);
}

const voice = allConcerns.filter((c) => c.code === "voice_consistency" || c.code === "first_person_plural");
p("");
p(`Voice/first-person concerns: ${voice.length}`);
p(`  pronoun filter would drop: ${voice.filter((c) => c.pronounFilterWouldDrop).length}`);
p(`  keep (pronoun present in span/statement as filter sees it): ${voice.filter((c) => !c.pronounFilterWouldDrop).length}`);

const noSpan = allConcerns.filter((c) => c.flags.includes("no_span"));
p(`Concerns with no derived span (drop-filter would be skipped): ${noSpan.length}/${allConcerns.length}`);

section("4c. PRODUCTION-VERIFY FILES (sanity: editorial empty?)");
for (const name of ["r10-production-verify.json", "r3a-production-verify.json"]) {
  const fp = path.join(ABLATION_DIR, name);
  let json;
  try {
    json = JSON.parse(await readFile(fp, "utf8"));
  } catch (e) {
    p(`  ${name}: missing (${e.message})`);
    continue;
  }
  const rows = collectStatements(json, name);
  const ed = rows.reduce((n, r) => n + r.editorialConcerns.length, 0);
  const co = rows.reduce((n, r) => n + r.complianceConcerns.length, 0);
  p(`  ${name}: statements=${rows.length} editorialConcerns=${ed} complianceConcerns=${co}`);
}

section("DONE");
p("This harness is free and read-only. No model calls. No lib/ writes.");
