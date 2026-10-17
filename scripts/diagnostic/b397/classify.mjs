/**
 * B397. Counts for the taxonomy in TAXONOMY.md.
 * The type of each planted substitution is the table below.
 * Catch is the rule in TAXONOMY.md, applied to the extracted source.
 * No model call.
 *
 *   node scripts/diagnostic/b397/classify.mjs
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { elementFound, extractElements } from "../b392/elements.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const OUT = path.join(ROOT, "scripts/diagnostic/b397/runs");

const DOCS = [
  {
    doc: "3i",
    runId: "3i-hy25-doctored",
    source: "tests/fixtures/real-runs-2026-09-29/source-3i-hy25-extracted.txt",
    doctored: { fixtureId: "2026-09-29", review: "tests/fixtures/real-runs-2026-09-29/doc-review.json" },
    clean: { fixtureId: "2026-09-29-clean", review: "tests/fixtures/real-runs-2026-09-29/clean-review.json" },
  },
  {
    doc: "HICL",
    runId: "hicl-interim-doctored",
    source: "tests/fixtures/real-runs-2026-10-04-hicl/source-hicl-interim-extracted.txt",
    doctored: { fixtureId: "2026-10-04-hicl", review: "tests/fixtures/real-runs-2026-10-04-hicl/doc-review.json" },
    clean: { fixtureId: "2026-10-04-hicl-clean", review: "tests/fixtures/real-runs-2026-10-04-hicl/clean-review.json" },
  },
  {
    doc: "GPI",
    runId: "gpi-press-release-doctored",
    source: "tests/fixtures/real-runs-2026-10-06-gpi/source-gpi-press-release-extracted.txt",
    doctored: { fixtureId: "2026-10-06-gpi", review: "tests/fixtures/real-runs-2026-10-06-gpi/doc-review.json" },
    clean: { fixtureId: "2026-10-06-gpi-clean", review: "tests/fixtures/real-runs-2026-10-06-gpi/clean-run2-review.json" },
  },
  {
    doc: "ClearPoint",
    runId: "clearpoint-q1-2026-doctored",
    source: "tests/fixtures/real-runs-2026-10-06-clearpoint/source-clearpoint-q1-2026-extracted.txt",
    doctored: { fixtureId: "2026-10-06-clearpoint", review: "tests/fixtures/real-runs-2026-10-06-clearpoint/dirty1-review.json" },
    clean: { fixtureId: "2026-10-06-clearpoint-clean", review: "tests/fixtures/real-runs-2026-10-06-clearpoint/clean1-review.json" },
  },
];

const TYPE = {
  "3i-S0-a": "quantity",
  "3i-S5-a": "date",
  "3i-S8-a": "name",
  "3i-S9-a": "name",
  "3i-S12-a": "ratio",
  "3i-S14-a": "name",
  "hicl-S0-a": "name",
  "hicl-S0-b": "date",
  "hicl-S1-a": "quantity",
  "hicl-S2-a": "benchmark",
  "hicl-S3-a": "name",
  "hicl-S4-a": "name",
  "hicl-S5-a": "name",
  "hicl-S5-b": "quantity",
  "hicl-S5-c": "open-wording",
  "hicl-S6-a": "polarity",
  "hicl-S7-a": "name",
  "hicl-S7-b": "name",
  "hicl-S7-c": "open-wording",
  "gpi-S0-a": "date",
  "gpi-S0-b": "quantity",
  "gpi-S0-c": "open-wording",
  "gpi-S1-a": "quantity",
  "gpi-S1-b": "set",
  "gpi-S2-a": "open-wording",
  "gpi-S3-a": "name",
  "gpi-S4-a": "rank",
  "gpi-S4-b": "quantity",
  "gpi-S4-c": "open-wording",
  "clearpoint-S0-a": "date",
  "clearpoint-S2-a": "quantity",
  "clearpoint-S3-a": "ratio",
  "clearpoint-S7-a": "polarity",
  "clearpoint-S8-a": "name",
  "clearpoint-S8-b": "polarity",
  "clearpoint-S9-a": "quantity",
  "clearpoint-S9-b": "date",
};

const CLASS = {
  quantity: "mechanical",
  date: "mechanical",
  name: "mechanical",
  ratio: "partly",
  rank: "partly",
  polarity: "partly",
  benchmark: "partly",
  set: "partly",
  causation: "not",
  evaluation: "not",
  "open-wording": "not",
};

const OPENERS = new Set("meanwhile looking across overall organic elsewhere separately".split(" "));
const FUNCTION = new Set(
  "with from that this have been will were into over than also which their about after before during such lead more most only same other".split(" ")
);
const POLES = [
  ["reduction", "increase"],
  ["reduced", "increased"],
  ["completed", "commenced"],
  ["completion", "commenced"],
  ["clearance", "submission"],
  ["step-down", "increase"],
];
const POLE_WORDS = new Set(POLES.flat());
const COMPARISONS = ["broadly flat", "in line", "outperforming", "outperform", "ahead", "behind", "flat"];
const BENCH_NOUNS = ["prior year", "budgets", "budget", "expectations", "expectation", "forecast"];
const RANKS = ["second-largest", "second largest", "third-largest", "largest", "biggest"];
const RATIO_PHRASES = ["vast majority", "essentially all", "virtually all", "majority"];
const CAUSATION = ["driven largely by", "driven primarily by", "driven by", "on account of", "benefitting from", "benefiting from", "supporting"];
const EVALUATION = ["well received", "healthy", "robust", "positive", "significant", "meaningful", "strongly", "cautious", "good"];
const GAIN_HOLDING_RE = /\b(?:uplift|gain|gains)\s+in\s+([A-Z]{2,}|\d[A-Za-z][A-Za-z0-9]*|[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g;
const RANGE_RES = [
  /\b(?:between|from)\s+((?:USD|GBP|EUR|SEK|\$|£|€)\s*[\d,.]+(?:\s*(?:thousand|million|billion|bn|mn))?)\s+(?:and|to)\s+((?:USD|GBP|EUR|SEK|\$|£|€)\s*[\d,.]+(?:\s*(?:thousand|million|billion|bn|mn))?)/gi,
  /((?:USD|GBP|EUR|SEK|\$|£|€)\s*[\d,.]+(?:\s*(?:thousand|million|billion|bn|mn))?)\s+to\s+((?:USD|GBP|EUR|SEK|\$|£|€)\s*[\d,.]+(?:\s*(?:thousand|million|billion|bn|mn))?)/gi,
];

function read(rel) {
  return readFileSync(path.join(ROOT, rel), "utf8");
}

function loadJson(rel) {
  return JSON.parse(read(rel));
}

function word(text, token) {
  const body = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/[- ]/g, "[-\\s]");
  return new RegExp(`(?:^|[^A-Za-z0-9])${body}(?=$|[^A-Za-z0-9])`, "i").test(text);
}

function sentencesOf(text) {
  const out = [];
  for (const part of String(text).split(/\n+/)) {
    for (const bit of part.split(/(?<=[.!?])\s+(?=[A-Z“"])/)) {
      const trimmed = bit.trim();
      if (trimmed) out.push(trimmed);
    }
  }
  return out;
}

function foldLocate(text) {
  return text.replace(/[\u2018\u2019]/g, "'").replace(/[\u2013\u2014]/g, "-");
}

function locate(statement, written) {
  const foldedStatement = foldLocate(statement);
  const variants = [
    written,
    written.replace(/£/g, "GBP ").replace(/\$/g, "USD ").replace(/€/g, "EUR ").replace(/\s+/g, " ").trim(),
    written.replace(/£/g, "GBP").replace(/\$/g, "USD").replace(/€/g, "EUR"),
  ];
  for (const variant of variants) {
    const at = foldedStatement.indexOf(foldLocate(variant));
    if (at >= 0) return { start: at, end: at + foldLocate(variant).length };
  }
  return null;
}

function overlaps(element, span) {
  return element.start < span.end && element.end > span.start;
}

function moneyFigures(text) {
  return extractElements(text, text).filter((item) => item.kind === "figure" && item.unit !== "percent" && item.unit !== "bare");
}

function largestMoney(text) {
  const figures = moneyFigures(text);
  if (!figures.length) return null;
  return figures.reduce((best, item) => (Math.abs(item.folded) > Math.abs(best.folded) ? item : best));
}

function longWords(text) {
  return (text.toLowerCase().match(/[a-z][a-z']{4,}/g) || []).map((item) => item.replace(/'/g, ""));
}

function holdings(source) {
  const found = new Set();
  const re = new RegExp(GAIN_HOLDING_RE.source, GAIN_HOLDING_RE.flags);
  let match;
  while ((match = re.exec(source))) found.add(match[1]);
  return [...found];
}

function rangePairs(source) {
  const pairs = [];
  for (const pattern of RANGE_RES) {
    const re = new RegExp(pattern.source, pattern.flags);
    let match;
    while ((match = re.exec(source))) pairs.push([match[1], match[2]]);
  }
  return pairs;
}

function rangeCollapse(statement, figure, source) {
  if (figure.unit === "percent" || figure.unit === "bare") return false;
  for (const [left, right] of rangePairs(source)) {
    const onLeft = elementFound(figure, left);
    const onRight = elementFound(figure, right);
    if (!onLeft && !onRight) continue;
    const other = onLeft ? right : left;
    const otherFigure = moneyFigures(other)[0];
    if (!otherFigure) continue;
    if (!elementFound(otherFigure, statement)) return true;
  }
  return false;
}

function firstContentWord(statement) {
  for (const token of longWords(statement)) {
    if (!OPENERS.has(token)) return token;
  }
  return null;
}

function ratioDetail(statement, source) {
  const phrase = RATIO_PHRASES.find((item) => word(statement, item));
  if (!phrase) return { present: false, catch: false, reason: "no ratio phrase" };
  if (phrase === "essentially all" || phrase === "virtually all") {
    const named = holdings(source);
    return {
      present: true,
      phrase,
      counterpart: named.length === 1,
      holdings: named,
      catch: named.length === 1,
      reason: named.length === 1 ? `one holding: ${named[0]}` : `holdings ${named.length}: ${named.join(", ") || "none"}`,
    };
  }
  const after = statement.split(/\bof\b/i).pop() || "";
  const head = longWords(after).pop() || null;
  const lead = firstContentWord(statement);
  const threshold = phrase === "vast majority" ? 2 / 3 : 1 / 2;
  let whole = null;
  let part = null;
  let wholeSentence = null;
  let partSentence = null;
  for (const sentence of sentencesOf(source)) {
    if (!head || !word(sentence, head)) continue;
    if (!word(sentence, "total") && !word(sentence, "overall")) continue;
    const money = largestMoney(sentence);
    if (!money) continue;
    if (!whole || Math.abs(money.folded) > Math.abs(whole.folded)) {
      whole = money;
      wholeSentence = sentence.slice(0, 180);
    }
  }
  for (const sentence of sentencesOf(source)) {
    if (sentence === wholeSentence) continue;
    if (!lead || !word(sentence, lead)) continue;
    const money = largestMoney(sentence);
    if (!money) continue;
    if (!part || Math.abs(money.folded) > Math.abs(part.folded)) {
      part = money;
      partSentence = sentence.slice(0, 180);
    }
  }
  if (!part || !whole || !whole.folded) {
    return {
      present: true,
      phrase,
      counterpart: false,
      head,
      lead,
      catch: false,
      reason: `counterpart missing head=${head || "none"} lead=${lead || "none"} part=${Boolean(part)} whole=${Boolean(whole)}`,
    };
  }
  const ratio = Math.abs(part.folded) / Math.abs(whole.folded);
  return {
    present: true,
    phrase,
    counterpart: true,
    head,
    lead,
    ratio: Number(ratio.toFixed(3)),
    threshold,
    part: part.surface,
    whole: whole.surface,
    catch: ratio < threshold,
    reason: `${part.surface} / ${whole.surface} = ${ratio.toFixed(3)} against ${threshold}`,
  };
}

function rankDetail(statement, source) {
  const draftRank = RANKS.find((item) => word(statement, item));
  if (!draftRank) return { present: false, catch: false, reason: "no rank word" };
  const noun = (new RegExp(`${draftRank.replace(/ /g, "[-\\s]")}\\s+(?:the\\s+|a\\s+)?([A-Za-z]+)`, "i").exec(statement) || [])[1];
  if (!noun) return { present: true, counterpart: false, catch: false, reason: "no noun after the rank" };
  for (const sentence of sentencesOf(source)) {
    const sourceRank = RANKS.find((item) => word(sentence, item));
    if (!sourceRank) continue;
    const sourceNoun = (new RegExp(`${sourceRank.replace(/ /g, "[-\\s]")}\\s+(?:the\\s+|a\\s+)?([A-Za-z]+)`, "i").exec(sentence) || [])[1];
    if (!sourceNoun || sourceNoun.toLowerCase() !== noun.toLowerCase()) continue;
    const same = sourceRank.replace(/\s+/g, "-") === draftRank.replace(/\s+/g, "-");
    return {
      present: true,
      counterpart: true,
      catch: !same,
      reason: same ? `${draftRank} ${noun} agrees` : `draft ${draftRank} ${noun}, source ${sourceRank} ${sourceNoun}`,
    };
  }
  return { present: true, counterpart: false, catch: false, reason: `no source rank before ${noun}` };
}

function nounsOf(text) {
  return new Set(longWords(text).filter((item) => !FUNCTION.has(item) && !POLE_WORDS.has(item) && item.length >= 4));
}

function polarityDetail(statement, source) {
  const draftPoles = POLES.filter(([left, right]) => word(statement, left) || word(statement, right));
  if (!draftPoles.length) return { present: false, catch: false, reason: "no pole" };
  const draftNouns = nounsOf(statement);
  for (const sentence of sentencesOf(source)) {
    for (const [left, right] of draftPoles) {
      const draftLeft = word(statement, left);
      const draftRight = word(statement, right);
      const sourceLeft = word(sentence, left);
      const sourceRight = word(sentence, right);
      const opposed = (draftLeft && sourceRight && !sourceLeft) || (draftRight && sourceLeft && !sourceRight);
      if (!opposed) continue;
      const shared = [...nounsOf(sentence)].filter((item) => draftNouns.has(item));
      if (!shared.length) continue;
      return {
        present: true,
        counterpart: true,
        catch: true,
        reason: `poles ${left}/${right}, shared ${shared.slice(0, 6).join(", ")}`,
      };
    }
  }
  const anyOppositeSentence = sentencesOf(source).some((sentence) =>
    draftPoles.some(([left, right]) => {
      const draftLeft = word(statement, left);
      const draftRight = word(statement, right);
      return (draftLeft && word(sentence, right)) || (draftRight && word(sentence, left));
    })
  );
  return {
    present: true,
    counterpart: false,
    catch: false,
    reason: anyOppositeSentence ? "opposite pole, no shared noun" : "no opposite pole in the source",
  };
}

function comparisonIn(text) {
  return COMPARISONS.find((item) => word(text, item)) || null;
}

function nounIn(text) {
  return BENCH_NOUNS.find((item) => word(text, item)) || null;
}

function benchmarkDetail(statement, source) {
  const comparison = comparisonIn(statement);
  const noun = nounIn(statement);
  if (!comparison || !noun) return { present: false, catch: false, reason: "no comparison with a benchmark noun" };
  for (const sentence of sentencesOf(source)) {
    if (!word(sentence, noun)) continue;
    const sourceComparison = comparisonIn(sentence);
    if (!sourceComparison) continue;
    const same = sourceComparison === comparison;
    return {
      present: true,
      counterpart: true,
      catch: !same,
      reason: same ? `${comparison} ${noun} agrees` : `draft ${comparison} ${noun}, source ${sourceComparison}`,
    };
  }
  return { present: true, counterpart: false, catch: false, reason: `no source sentence has ${noun} and a comparison word` };
}

function placesOf(text) {
  const skip = new Set("The This That These Those With From Into Over Also".split(" "));
  return [...text.matchAll(/\b([A-Z][a-z]{2,})\b/g)].map((match) => match[1]).filter((item) => !skip.has(item));
}

function setDetail(statement, source) {
  if (!word(statement, "only")) return { present: false, catch: false, reason: "no only" };
  const places = placesOf(statement);
  if (!places.length) return { present: true, counterpart: false, catch: false, reason: "only, no capitalised place" };
  for (const sentence of sentencesOf(source)) {
    if (!word(sentence, "and")) continue;
    for (const place of places) {
      if (!word(sentence, place)) continue;
      const others = placesOf(sentence).filter((item) => item.toLowerCase() !== place.toLowerCase());
      if (!others.length) continue;
      return {
        present: true,
        counterpart: true,
        catch: true,
        reason: `${place} only, source also ${others.slice(0, 4).join(", ")}`,
      };
    }
  }
  return { present: true, counterpart: false, catch: false, reason: "no source coordination" };
}

function elementCatch(kind, statement, draft, source, span) {
  const elements = extractElements(statement, draft, source).filter((item) => item.kind === kind && overlaps(item, span));
  if (!elements.length) {
    return { catch: false, reason: `no ${kind} in the written span`, elements: [] };
  }
  const rows = elements.map((item) => {
    const found = elementFound(item, source);
    const collapsed = kind === "figure" && found && rangeCollapse(statement, item, source);
    return {
      surface: item.surface,
      key: item.key || null,
      found,
      rangeCollapse: Boolean(collapsed),
      catch: kind === "figure" ? !found || collapsed : !found,
    };
  });
  return {
    catch: rows.some((item) => item.catch),
    reason: rows.map((item) => `${item.surface} found=${item.found}${item.rangeCollapse ? " range-collapse" : ""}`).join("; "),
    elements: rows,
  };
}

function detailFor(type, statement, draft, source, span) {
  if (type === "quantity") return elementCatch("figure", statement, draft, source, span);
  if (type === "date" || type === "name") return elementCatch(type, statement, draft, source, span);
  if (type === "ratio") return ratioDetail(statement, source);
  if (type === "rank") return rankDetail(statement, source);
  if (type === "polarity") return polarityDetail(statement, source);
  if (type === "benchmark") return benchmarkDetail(statement, source);
  if (type === "set") return setDetail(statement, source);
  return { catch: false, reason: "no deterministic rule" };
}

function containedTypes(statement, draft, source) {
  const elements = extractElements(statement, draft, source);
  const types = [];
  if (elements.some((item) => item.kind === "figure")) types.push("quantity");
  if (elements.some((item) => item.kind === "date")) types.push("date");
  if (elements.some((item) => item.kind === "name")) types.push("name");
  if (RATIO_PHRASES.some((item) => word(statement, item))) types.push("ratio");
  if (RANKS.some((item) => word(statement, item))) types.push("rank");
  if (POLES.some(([left, right]) => word(statement, left) || word(statement, right))) types.push("polarity");
  if (comparisonIn(statement) && nounIn(statement)) types.push("benchmark");
  if (word(statement, "only") && placesOf(statement).length) types.push("set");
  if (CAUSATION.some((item) => word(statement, item))) types.push("causation");
  if (EVALUATION.some((item) => word(statement, item))) types.push("evaluation");
  if (!types.length) types.push("open-wording");
  return types;
}

function cleanFlags(statement, draft, source) {
  const flags = [];
  for (const item of extractElements(statement, draft, source)) {
    const found = elementFound(item, source);
    const collapsed = item.kind === "figure" && found && rangeCollapse(statement, item, source);
    if (item.kind === "figure" && (!found || collapsed)) {
      flags.push({ type: "quantity", surface: item.surface, reason: collapsed ? "range collapse" : "not in the source" });
    }
    if ((item.kind === "date" || item.kind === "name") && !found) {
      flags.push({ type: item.kind, surface: item.surface, reason: "not in the source" });
    }
  }
  const ratio = ratioDetail(statement, source);
  if (ratio.catch) flags.push({ type: "ratio", surface: ratio.phrase, reason: ratio.reason });
  const rank = rankDetail(statement, source);
  if (rank.catch) flags.push({ type: "rank", surface: rank.reason, reason: rank.reason });
  const polarity = polarityDetail(statement, source);
  if (polarity.catch) flags.push({ type: "polarity", surface: polarity.reason, reason: polarity.reason });
  const benchmark = benchmarkDetail(statement, source);
  if (benchmark.catch) flags.push({ type: "benchmark", surface: benchmark.reason, reason: benchmark.reason });
  const set = setDetail(statement, source);
  if (set.catch) flags.push({ type: "set", surface: set.reason, reason: set.reason });
  return flags;
}

function commentsFor(cards, fixtureId, index) {
  const card = cards.find((item) => item.fixtureId === fixtureId && item.index === index);
  if (!card) return ["MISSING CARD"];
  const comments = (card.claims || []).map((claim) => claim.comment).filter(Boolean);
  return comments.length ? comments : ["NO COMMENT"];
}

function main() {
  const labels = loadJson("scripts/diagnostic/b385/labels.json");
  const labelIds = [];
  for (const run of labels.runs) {
    for (const entry of run.entries) {
      for (const sub of entry.substitutions) labelIds.push(sub.id);
    }
  }
  const missing = labelIds.filter((id) => !TYPE[id]);
  const extra = Object.keys(TYPE).filter((id) => !labelIds.includes(id));
  if (missing.length || extra.length || labelIds.length !== 37) {
    throw new Error(`label table mismatch missing=${missing.join(",")} extra=${extra.join(",")} count=${labelIds.length}`);
  }

  const byRun = new Map(DOCS.map((doc) => [doc.runId, doc]));
  const planted = [];
  for (const run of labels.runs) {
    const doc = byRun.get(run.runId);
    if (!doc) throw new Error(`no doc for ${run.runId}`);
    const review = loadJson(doc.doctored.review);
    const source = read(doc.source);
    const draft = review.statements.map((item) => item.text).join("\n");
    if (!source.trim()) throw new Error(`empty source ${doc.source}`);
    for (const entry of run.entries) {
      const statement = review.statements[entry.statementIndex]?.text;
      if (!statement) throw new Error(`missing statement ${doc.doc} ${entry.statementIndex}`);
      for (const sub of entry.substitutions) {
        const type = TYPE[sub.id];
        const span = locate(statement, sub.written);
        const detail = detailFor(type, statement, draft, source, span || { start: -1, end: -1 });
        if (!span) {
          detail.catch = false;
          detail.reason = `written span is not in the statement. ${detail.reason || ""}`.trim();
        }
        planted.push({
          id: sub.id,
          doc: doc.doc,
          fixtureId: doc.doctored.fixtureId,
          index: entry.statementIndex,
          written: sub.written,
          was: sub.was,
          statement,
          type,
          class: CLASS[type],
          spanFound: Boolean(span),
          catch: Boolean(detail.catch),
          counterpart: detail.counterpart === undefined ? null : Boolean(detail.counterpart),
          reason: detail.reason,
        });
      }
    }
  }

  const clean = [];
  for (const doc of DOCS) {
    const review = loadJson(doc.clean.review);
    const source = read(doc.source);
    const draft = review.statements.map((item) => item.text).join("\n");
    review.statements.forEach((item, index) => {
      const statement = item.text;
      if (!statement) throw new Error(`empty clean statement ${doc.doc} ${index}`);
      const types = containedTypes(statement, draft, source);
      const flags = cleanFlags(statement, draft, source);
      clean.push({
        doc: doc.doc,
        fixtureId: doc.clean.fixtureId,
        index,
        statement,
        types,
        flags,
      });
    });
  }
  if (clean.length !== 38) throw new Error(`clean count ${clean.length}`);

  const cardsDoc = loadJson("scripts/diagnostic/b390/runs/ids-1/cards.json");
  const cards = cardsDoc.cards || cardsDoc;
  if (!Array.isArray(cards)) throw new Error("ids-1 cards missing");
  for (const row of planted) {
    row.modelComments = commentsFor(cards, row.fixtureId, row.index);
  }

  const byType = {};
  for (const type of Object.keys(CLASS)) {
    byType[type] = planted.filter((row) => row.type === type).map((row) => row.id);
  }
  const mechanical = planted.filter((row) => row.class === "mechanical");
  const partly = planted.filter((row) => row.class === "partly");
  const partlyCaught = partly.filter((row) => row.catch);
  const partlyCounterpart = partly.filter((row) => row.counterpart);
  const unreached = planted.filter((row) => !row.catch);

  const factual = new Set(["quantity", "date", "name", "ratio", "rank", "polarity", "benchmark", "set"]);
  const residue = clean.filter((row) => row.types.every((type) => !factual.has(type)));
  const typeCounts = {};
  for (const type of Object.keys(CLASS)) {
    typeCounts[type] = clean.filter((row) => row.types.includes(type)).length;
  }
  const flagCounts = {};
  for (const type of ["quantity", "date", "name", "ratio", "rank", "polarity", "benchmark", "set"]) {
    flagCounts[type] = clean.filter((row) => row.flags.some((flag) => flag.type === type)).map((row) => ({
      doc: row.doc,
      index: row.index,
      statement: row.statement,
      flags: row.flags.filter((flag) => flag.type === type),
    }));
  }

  const report = {
    planted: planted.length,
    byType,
    mechanical: { count: mechanical.length, caught: mechanical.filter((row) => row.catch).length },
    partly: {
      count: partly.length,
      counterpart: partlyCounterpart.length,
      caught: partlyCaught.length,
    },
    reach: mechanical.filter((row) => row.catch).length + partlyCaught.length,
    unreached: unreached.map((row) => ({
      id: row.id,
      type: row.type,
      class: row.class,
      reason: row.reason,
      comments: row.modelComments,
      statement: row.statement,
    })),
    cleanTypeCounts: typeCounts,
    cleanFlags: flagCounts,
    residue: residue.map((row) => ({ doc: row.doc, index: row.index, types: row.types, statement: row.statement })),
    rows: planted,
    clean,
  };

  mkdirSync(OUT, { recursive: true });
  writeFileSync(path.join(OUT, "classify.json"), `${JSON.stringify(report, null, 2)}\n`);

  console.log(`PLANTED ${planted.length}`);
  for (const [type, ids] of Object.entries(byType)) {
    if (!ids.length) continue;
    const caught = planted.filter((row) => row.type === type && row.catch).length;
    console.log(`TYPE ${type} ${CLASS[type]} ${ids.length} caught ${caught}`);
  }
  console.log(
    `REACH mechanical caught ${report.mechanical.caught} of ${report.mechanical.count}; partly caught ${report.partly.caught} of ${report.partly.count}; counterpart ${report.partly.counterpart}; reach ${report.reach}`
  );
  console.log(`UNREACHED ${unreached.length}`);
  for (const row of unreached) console.log(`  ${row.id} ${row.type} ${row.reason}`);
  console.log(`CLEAN types ${JSON.stringify(typeCounts)}`);
  console.log(`RESIDUE ${residue.length}`);
  for (const row of residue) console.log(`  ${row.doc} S${row.index} ${row.types.join(",")} ${row.statement}`);
  for (const [type, rows] of Object.entries(flagCounts)) {
    console.log(`CLEAN FLAG ${type} ${rows.length}`);
    for (const row of rows) {
      console.log(`  ${row.doc} S${row.index} ${row.flags.map((flag) => flag.reason).join(" | ")}`);
      console.log(`    ${row.statement}`);
    }
  }
}

main();
