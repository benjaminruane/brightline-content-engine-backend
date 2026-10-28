/**
 * B442. Read editorial and style concerns on the B441 pass. No model calls.
 *
 *   node scripts/diagnostic/b442/read.mjs
 *
 * Prints the counts. Does not change the pass.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import editorialRules from "../../../lib/rulebook/editorialRules.js";
import {
  STYLE_GUIDE_LAYER_1,
  STYLE_GUIDE_LAYER_2_CLIENT,
} from "../../../lib/qc/style-guide.mjs";
import {
  joinKey,
  mapDisplayVerdict,
  mapGroupA,
  flattenStatements,
} from "../accuracy/lib.mjs";
import { normalizeLabelsDoc } from "../accuracy/load-labels.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ACCURACY = path.join(__dirname, "../accuracy");
const PASS = path.join(__dirname, "../b441/pass-1.json");

const NAME_STOP = new Set([
  "during", "group", "arr", "eur", "moic", "irr", "ebitda", "the", "and", "from", "with",
  "has", "will", "people", "million", "agreed", "acquire", "support", "continued", "growth",
]);

const EDITORIAL_FILTERS = new Set([
  "fidelity",
  "style_backstop",
  "no_op",
  "no_change",
  "evidence_language",
  "narrative_coherence",
  "source_awareness",
  "duplicate_merge",
]);

function norm(value) {
  return String(value ?? "").normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase();
}

function needles(span) {
  const full = norm(span);
  const tokens = [];
  for (const raw of String(span).split(/\s+/)) {
    const bare = raw.replace(/'s$/i, "").replace(/[^A-Za-z0-9.%]/g, "");
    if (!bare) continue;
    if (/\d/.test(bare)) tokens.push(bare.toLowerCase());
    else if (/^[A-Z]/.test(bare) && bare.length >= 3 && !NAME_STOP.has(bare.toLowerCase())) {
      tokens.push(bare.toLowerCase());
    }
  }
  return { full, tokens: [...new Set(tokens)] };
}

function wordsHit(span, text) {
  const { full, tokens } = needles(span);
  const hay = norm(text);
  const fullHit = full.length > 0 && hay.includes(full);
  const tokenHits = tokens.filter((token) => hay.includes(token));
  return { fullHit, tokenHits, named: fullHit || tokenHits.length > 0, tokens };
}

function bookCategory() {
  const editorial = new Map();
  for (const rule of editorialRules) editorial.set(rule.id, rule.category || "editorial");
  const style = new Map();
  for (const rule of [...STYLE_GUIDE_LAYER_1, ...STYLE_GUIDE_LAYER_2_CLIENT]) {
    style.set(rule.id, "style_guide");
  }
  return { editorial, style };
}

function evidenceRaised(card) {
  const mapped = mapDisplayVerdict(card?.displayVerdict);
  const notReviewed = String(card?.displayVerdict || "").toLowerCase() === "not reviewed";
  return (mapped != null && mapped !== "confirmed") || notReviewed;
}

function cardKey(card) {
  return joinKey(card.fixtureId, card.statement, card.occurrence);
}

async function main() {
  const { editorial, style } = bookCategory();
  const doc = JSON.parse(await readFile(PASS, "utf8"));
  const cards = Array.isArray(doc.cards) ? doc.cards : [];
  const labelsDoc = JSON.parse(await readFile(path.join(ACCURACY, "labels.json"), "utf8"));
  const design = JSON.parse(await readFile(path.join(ACCURACY, "group-a-design.json"), "utf8"));
  const statements = JSON.parse(await readFile(path.join(ACCURACY, "statements.json"), "utf8"));
  const labels = normalizeLabelsDoc({ labels: labelsDoc.labels });
  const mapped = mapGroupA(flattenStatements(statements), design);

  const labelByKey = new Map();
  const labelCounts = {};
  for (const row of labels) {
    if (row.kind && row.kind !== "statement") continue;
    const key = joinKey(row.fixtureId, row.statementText, row.occurrence);
    labelByKey.set(key, row.label);
    labelCounts[row.label] = (labelCounts[row.label] || 0) + 1;
  }

  const byRule = new Map();
  const silenceById = new Map();
  const silenceShapes = new Map();
  const unmatched = [];
  const verdictMismatch = [];
  let concernInstances = 0;
  let statementsWithConcern = 0;
  let cleanConcernInstances = 0;
  let cleanStatementsWithConcern = 0;
  let labelled = 0;
  let cleanCards = 0;
  let missingLabel = 0;

  const mechanicsOverlap = {
    mechanicsStatements: 0,
    mechanicsAndEvidence: 0,
    mechanicsOnClean: 0,
    mechanicsAndEvidenceOnClean: 0,
    pairs: [],
  };

  for (const card of cards) {
    const key = cardKey(card);
    const label = labelByKey.has(key) ? labelByKey.get(key) : null;
    if (label == null) missingLabel += 1;
    else labelled += 1;
    const clean = label === "confirmed";
    if (clean) cleanCards += 1;
    const concerns = Array.isArray(card.editorialConcerns) ? card.editorialConcerns : [];
    const verdict = card.editorialVerdict;
    if ((verdict === "concern") !== (concerns.length > 0)) {
      verdictMismatch.push({
        fixtureId: card.fixtureId,
        index: card.index,
        verdict,
        n: concerns.length,
      });
    }
    if (concerns.length > 0) {
      statementsWithConcern += 1;
      if (clean) cleanStatementsWithConcern += 1;
    }
    for (const concern of concerns) {
      concernInstances += 1;
      if (clean) cleanConcernInstances += 1;
      const id = concern?.concernCode || "(none)";
      if (!byRule.has(id)) {
        byRule.set(id, {
          ruleId: id,
          all: 0,
          statements: new Set(),
          cleanFirings: 0,
          cleanStatements: new Set(),
          inEditorial: editorial.has(id),
          inStyle: style.has(id),
          editorialCategoryField: editorial.get(id) || null,
          examples: [],
        });
      }
      const bucket = byRule.get(id);
      bucket.all += 1;
      bucket.statements.add(key);
      if (clean) {
        bucket.cleanFirings += 1;
        bucket.cleanStatements.add(key);
      }
      if (!editorial.has(id) && !style.has(id)) unmatched.push(id);
      if (bucket.examples.length < 12) {
        bucket.examples.push({
          fixtureId: card.fixtureId,
          index: card.index,
          clean,
          label,
          displayVerdict: card.displayVerdict,
          supportState: card.supportState,
          sentenceLabel: card.sentenceLabel,
          evidenceRaised: evidenceRaised(card),
          text: concern.text || "",
          quote: concern.quote || "",
          statement: card.statement,
        });
      }
    }

    for (const silence of Array.isArray(card.silences) ? card.silences : []) {
      const id = silence?.id || "(none)";
      const shape = Object.keys(silence || {}).sort().join(",");
      silenceShapes.set(id, shape);
      if (!silenceById.has(id)) {
        silenceById.set(id, { id, cards: 0, countSum: 0, reasons: {}, samples: [] });
      }
      const row = silenceById.get(id);
      row.cards += 1;
      const count = Number(silence.count);
      row.countSum += Number.isFinite(count) ? count : 1;
      const reason = silence.reason || "(none)";
      row.reasons[reason] = (row.reasons[reason] || 0) + 1;
      if (row.samples.length < 3) row.samples.push(silence);
    }

  }

  const rules = [...byRule.values()]
    .map((row) => ({
      ruleId: row.ruleId,
      fired: row.all,
      statements: row.statements.size,
      cleanFirings: row.cleanFirings,
      cleanStatements: row.cleanStatements.size,
      inEditorialBook: row.inEditorial,
      inStyleBook: row.inStyle,
      statedCategory: row.inEditorial && row.inStyle
        ? "BOTH"
        : row.inStyle
          ? "style_guide"
          : row.inEditorial
            ? (row.editorialCategoryField || "editorial")
            : "NOT_IN_EITHER_BOOK",
      examples: row.examples,
    }))
    .sort((a, b) => b.fired - a.fired || a.ruleId.localeCompare(b.ruleId));

  const faultRows = [];
  for (const fault of design.faults) {
    const row = mapped.mapping.find((item) => item.id === fault.id);
    const key = row?.keys?.[0] || null;
    const card = key ? cards.find((item) => cardKey(item) === key) : null;
    const concerns = Array.isArray(card?.editorialConcerns) ? card.editorialConcerns : [];
    const said = concerns.map((concern) => [concern.concernCode, concern.quote, concern.text].filter(Boolean).join("\n")).join("\n");
    const hit = wordsHit(fault.span, said);
    faultRows.push({
      id: fault.id,
      status: row?.status || "missing",
      span: fault.span,
      why: fault.why,
      fixtureId: card?.fixtureId || null,
      index: card?.index ?? null,
      displayVerdict: card?.displayVerdict || null,
      sentenceLabel: card?.sentenceLabel || null,
      statement: card?.statement || null,
      editorialCount: concerns.length,
      wordsHit: hit,
      concerns: concerns.map((concern) => ({
        concernCode: concern.concernCode,
        text: concern.text || "",
        quote: concern.quote || "",
        hit: wordsHit(fault.span, [concern.concernCode, concern.quote, concern.text].filter(Boolean).join("\n")),
      })),
    });
  }

  const co = [];
  for (const card of cards) {
    const key = cardKey(card);
    const label = labelByKey.has(key) ? labelByKey.get(key) : null;
    const clean = label === "confirmed";
    const concerns = Array.isArray(card.editorialConcerns) ? card.editorialConcerns : [];
    const codes = concerns.map((concern) => concern.concernCode || "(none)");
    if (codes.length === 0) continue;
    co.push({
      fixtureId: card.fixtureId,
      index: card.index,
      clean,
      label,
      displayVerdict: card.displayVerdict,
      supportState: card.supportState,
      sentenceLabel: card.sentenceLabel,
      evidenceRaised: evidenceRaised(card),
      evidenceFindings: Array.isArray(card.evidenceFindings) ? card.evidenceFindings.length : 0,
      codes,
      texts: concerns.map((concern) => ({ code: concern.concernCode, text: concern.text || "" })),
    });
  }

  const evidenceFindingsNonEmpty = cards.filter((card) => Array.isArray(card.evidenceFindings) && card.evidenceFindings.length > 0).length;

  const silences = [...silenceById.values()].sort((a, b) => b.countSum - a.countSum);
  const editorialSilences = silences.filter((row) => EDITORIAL_FILTERS.has(row.id));

  const census = {
    cards: cards.length,
    gitSha: doc.gitSha || null,
    labelCounts,
    labelledStatementCards: labelled,
    missingLabel,
    cleanCards,
    concernInstances,
    statementsWithConcern,
    cleanConcernInstances,
    cleanStatementsWithConcern,
    verdictMismatch,
    unmatchedRuleIds: [...new Set(unmatched)],
    evidenceFindingsNonEmpty,
    rules,
    faults: faultRows,
    concerns: co,
    silences,
    editorialSilences,
    silenceShapes: Object.fromEntries(silenceShapes),
  };

  const brief = {
    cards: census.cards,
    cleanCards,
    concernInstances,
    statementsWithConcern,
    cleanConcernInstances,
    cleanStatementsWithConcern,
    rules: rules.map((row) => ({
      ruleId: row.ruleId,
      fired: row.fired,
      statements: row.statements,
      cleanFirings: row.cleanFirings,
      cleanStatements: row.cleanStatements,
      statedCategory: row.statedCategory,
    })),
    editorialSilenceCounts: editorialSilences.map((row) => ({
      id: row.id,
      cards: row.cards,
      countSum: row.countSum,
      reasons: row.reasons,
      shape: silenceShapes.get(row.id),
    })),
    allSilenceIds: silences.map((row) => `${row.id} cards=${row.cards} count=${row.countSum}`),
    faults: faultRows.map((row) => ({
      id: row.id,
      editorialCount: row.editorialCount,
      namedByWords: row.wordsHit.named,
      tokenHits: row.wordsHit.tokenHits,
      codes: row.concerns.map((concern) => concern.concernCode),
    })),
    verdictMismatch: verdictMismatch.length,
    evidenceFindingsNonEmpty,
  };
  process.stdout.write(`${JSON.stringify(brief, null, 2)}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
