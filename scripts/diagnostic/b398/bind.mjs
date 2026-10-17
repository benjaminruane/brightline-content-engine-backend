/**
 * B398. Rule B1 from BINDING.md, beside the B397 catches.
 * Benchmark and set are dropped. No model call.
 *
 *   node scripts/diagnostic/b398/bind.mjs
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { elementFound, extractElements } from "../b392/elements.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const OUT = path.join(ROOT, "scripts/diagnostic/b398/runs");

const DOCS = [
  {
    doc: "3i",
    runId: "3i-hy25-doctored",
    source: "tests/fixtures/real-runs-2026-09-29/source-3i-hy25-extracted.txt",
    doctored: "tests/fixtures/real-runs-2026-09-29/doc-review.json",
    clean: "tests/fixtures/real-runs-2026-09-29/clean-review.json",
  },
  {
    doc: "HICL",
    runId: "hicl-interim-doctored",
    source: "tests/fixtures/real-runs-2026-10-04-hicl/source-hicl-interim-extracted.txt",
    doctored: "tests/fixtures/real-runs-2026-10-04-hicl/doc-review.json",
    clean: "tests/fixtures/real-runs-2026-10-04-hicl/clean-review.json",
  },
  {
    doc: "GPI",
    runId: "gpi-press-release-doctored",
    source: "tests/fixtures/real-runs-2026-10-06-gpi/source-gpi-press-release-extracted.txt",
    doctored: "tests/fixtures/real-runs-2026-10-06-gpi/doc-review.json",
    clean: "tests/fixtures/real-runs-2026-10-06-gpi/clean-run2-review.json",
  },
  {
    doc: "ClearPoint",
    runId: "clearpoint-q1-2026-doctored",
    source: "tests/fixtures/real-runs-2026-10-06-clearpoint/source-clearpoint-q1-2026-extracted.txt",
    doctored: "tests/fixtures/real-runs-2026-10-06-clearpoint/dirty1-review.json",
    clean: "tests/fixtures/real-runs-2026-10-06-clearpoint/clean1-review.json",
  },
];

const DROPPED = new Set(["benchmark", "set"]);
const PRESENCE = new Set(["quantity", "date", "name"]);
const OPENERS = new Set("meanwhile looking across overall organic elsewhere separately topline".split(" "));
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
const WEAK = new Set("company companies group business period year years".split(" "));
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

function longWords(text) {
  return (text.toLowerCase().match(/[a-z][a-z']{4,}/g) || []).map((item) => item.replace(/'/g, ""));
}

function anchorsOf(statement, nameSurfaces) {
  const banned = new Set();
  for (const surface of nameSurfaces) {
    for (const part of String(surface).toLowerCase().split(/[^a-z0-9']+/)) banned.add(part.replace(/'/g, ""));
  }
  return [...new Set(longWords(statement))].filter(
    (token) => !FUNCTION.has(token) && !OPENERS.has(token) && !POLE_WORDS.has(token) && !WEAK.has(token) && !banned.has(token)
  );
}

function scoreSentences(statement, source, nameSurfaces) {
  const anchors = anchorsOf(statement, nameSurfaces);
  let best = 0;
  const scored = sentencesOf(source).map((sentence) => {
    const shared = anchors.filter((token) => word(sentence, token));
    if (shared.length > best) best = shared.length;
    return { sentence, shared };
  });
  return { anchors, scored, best };
}

function windowFrom(scored, best, source, mode) {
  const chosen = mode === "b2"
    ? scored.filter((row) => row.shared.length >= 2)
    : scored.filter((row) => row.shared.length === best);
  if (best < 2 || !chosen.length) {
    return { bound: false, score: best, window: source, shared: [], sentence: "" };
  }
  const top = chosen.reduce((a, b) => (b.shared.length > a.shared.length ? b : a));
  return {
    bound: true,
    score: top.shared.length,
    window: chosen.map((row) => row.sentence).join("\n"),
    shared: top.shared,
    sentences: chosen.length,
    sentence: top.sentence.slice(0, 220),
  };
}

function bindWindow(statement, source, nameSurfaces, mode) {
  const { scored, best } = scoreSentences(statement, source, nameSurfaces);
  return windowFrom(scored, best, source, mode || "b1");
}

function moneyFigures(text) {
  return extractElements(text, text).filter((item) => item.kind === "figure" && item.unit !== "percent" && item.unit !== "bare");
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

function nounsOf(text) {
  return new Set(longWords(text).filter((item) => !FUNCTION.has(item) && !POLE_WORDS.has(item)));
}

function polarityOn(statement, source) {
  const draftPoles = POLES.filter(([left, right]) => word(statement, left) || word(statement, right));
  if (!draftPoles.length) return { catch: false, reason: "no pole" };
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
      return { catch: true, reason: `poles ${left}/${right}, shared ${shared.slice(0, 6).join(", ")}` };
    }
  }
  return { catch: false, reason: "no opposite pole in the bound window" };
}

function presenceAfter(kind, statement, draft, source, span, mode) {
  const elements = extractElements(statement, draft, source).filter((item) => item.kind === kind && overlaps(item, span));
  if (!elements.length) return { catch: false, reason: `no ${kind} in the written span`, bound: false };
  const rows = elements.map((item) => {
    const binding = bindWindow(statement, source, kind === "name" ? [item.surface] : [], mode);
    const hay = binding.window;
    const found = elementFound(item, hay);
    const collapsed = kind === "figure" && found && rangeCollapse(statement, item, hay);
    return {
      surface: item.surface,
      found,
      bound: binding.bound,
      score: binding.score,
      shared: (binding.shared || []).slice(0, 8).join(","),
      sentence: binding.bound ? binding.sentence : "",
      rangeCollapse: Boolean(collapsed),
      catch: kind === "figure" ? !found || collapsed : !found,
    };
  });
  const hit = rows.find((row) => row.catch) || rows[0];
  return {
    catch: rows.some((row) => row.catch),
    bound: hit.bound,
    reason: rows
      .map((row) => `${row.surface} bound=${row.bound} score=${row.score} found=${row.found}${row.rangeCollapse ? " range-collapse" : ""} shared=${row.shared}`)
      .join("; "),
    sentence: hit.sentence,
  };
}

function polarityAfter(statement, source, mode) {
  const binding = bindWindow(statement, source, [], mode);
  if (!binding.bound) return { catch: false, bound: false, reason: `no binding, score ${binding.score}` };
  const detail = polarityOn(statement, binding.window);
  return {
    catch: detail.catch,
    bound: true,
    reason: `${detail.reason}; score ${binding.score}; shared ${binding.shared.slice(0, 8).join(",")}`,
    sentence: binding.sentence,
  };
}

function cleanFlagsAfter(statement, draft, source, mode) {
  const flags = [];
  for (const item of extractElements(statement, draft, source)) {
    if (item.kind !== "figure" && item.kind !== "date" && item.kind !== "name") continue;
    const binding = bindWindow(statement, source, item.kind === "name" ? [item.surface] : [], mode);
    const hay = binding.window;
    const found = elementFound(item, hay);
    const collapsed = item.kind === "figure" && found && rangeCollapse(statement, item, hay);
    if (item.kind === "figure" && (!found || collapsed)) {
      flags.push({
        type: "quantity",
        surface: item.surface,
        reason: collapsed ? "range collapse" : "not in the bound window",
        bound: binding.bound,
        score: binding.score,
        window: binding.window,
      });
    }
    if ((item.kind === "date" || item.kind === "name") && !found) {
      flags.push({
        type: item.kind,
        surface: item.surface,
        reason: binding.bound ? "not in the bound window" : "not in the source",
        bound: binding.bound,
        score: binding.score,
        window: binding.window,
      });
    }
  }
  const polarity = polarityAfter(statement, source, mode);
  if (polarity.catch) {
    flags.push({
      type: "polarity",
      surface: polarity.reason,
      reason: polarity.reason,
      bound: true,
      window: polarity.sentence || "",
    });
  }
  return flags;
}

function nbspGate(hiclSource) {
  const count = (hiclSource.match(/\u00a0/g) || []).length;
  const raw = "1 October\u00a02025";
  const extracted = extractElements(raw, raw).find((item) => item.kind === "date");
  const figureRaw = "GBP\u00a03.3 million";
  const figure = extractElements(figureRaw, figureRaw).find((item) => item.kind === "figure");
  const dateFolds = Boolean(extracted && extracted.key === "2025-10-01" && elementFound(extracted, `from ${raw} to 28 February 2026`));
  const figureFolds = Boolean(figure && elementFound(figure, "a return of GBP\u00a03.3 million"));
  return {
    hiclNbsp: count,
    dateExtracted: extracted ? extracted.key : null,
    dateFolds,
    figureExtracted: figure ? figure.surface : null,
    figureFolds,
    folds: dateFolds && figureFolds,
  };
}

export function collectBinding(loadSource = read) {
  const beforeDoc = loadJson("scripts/diagnostic/b397/runs/classify.json");
  const beforeById = new Map(beforeDoc.rows.map((row) => [row.id, row]));
  if (beforeById.size !== 37) throw new Error(`B397 rows ${beforeById.size}`);
  const labels = loadJson("scripts/diagnostic/b385/labels.json");
  const byRun = new Map(DOCS.map((doc) => [doc.runId, doc]));
  const planted = [];

  for (const run of labels.runs) {
    const doc = byRun.get(run.runId);
    if (!doc) throw new Error(`no doc for ${run.runId}`);
    const review = loadJson(doc.doctored);
    const source = loadSource(doc.source);
    const draft = review.statements.map((item) => item.text).join("\n");
    for (const entry of run.entries) {
      const statement = review.statements[entry.statementIndex]?.text;
      if (!statement) throw new Error(`missing statement ${doc.doc} ${entry.statementIndex}`);
      for (const sub of entry.substitutions) {
        const prior = beforeById.get(sub.id);
        if (!prior) throw new Error(`missing B397 row ${sub.id}`);
        const span = locate(statement, sub.written);
        const apply = (mode) => {
          if (DROPPED.has(prior.type)) return { catch: false, bound: false, reason: "dropped" };
          if (PRESENCE.has(prior.type)) {
            const kind = prior.type === "quantity" ? "figure" : prior.type;
            return span
              ? presenceAfter(kind, statement, draft, source, span, mode)
              : { catch: false, bound: false, reason: "written span is not in the statement" };
          }
          if (prior.type === "polarity") return polarityAfter(statement, source, mode);
          return { catch: prior.catch, bound: null, reason: "unchanged from B397" };
        };
        const b1 = apply("b1");
        const b2 = apply("b2");
        planted.push({
          id: sub.id,
          doc: doc.doc,
          index: entry.statementIndex,
          type: prior.type,
          class: prior.class,
          written: sub.written,
          statement,
          beforeCatch: Boolean(prior.catch),
          afterCatch: Boolean(b1.catch),
          afterReason: b1.reason,
          b2Catch: Boolean(b2.catch),
          b2Reason: b2.reason,
          beforeReason: prior.reason,
          bound: b1.bound,
          b2Bound: b2.bound,
          sentence: b1.sentence || "",
          b2Sentence: b2.sentence || "",
        });
      }
    }
  }
  if (planted.length !== 37) throw new Error(`planted ${planted.length}`);

  const clean = [];
  for (const doc of DOCS) {
    const review = loadJson(doc.clean);
    const source = loadSource(doc.source);
    const draft = review.statements.map((item) => item.text).join("\n");
    const priorClean = beforeDoc.clean.filter((row) => row.doc === doc.doc);
    review.statements.forEach((item, index) => {
      const prior = priorClean.find((row) => row.index === index);
      if (!prior) throw new Error(`missing clean ${doc.doc} ${index}`);
      const flags = cleanFlagsAfter(item.text, draft, source, "b1");
      const flagsB2 = cleanFlagsAfter(item.text, draft, source, "b2");
      clean.push({
        doc: doc.doc,
        index,
        statement: item.text,
        beforeFlags: prior.flags,
        afterFlags: flags,
        b2Flags: flagsB2,
      });
    });
  }
  if (clean.length !== 38) throw new Error(`clean ${clean.length}`);

  const hicl = loadSource(DOCS[1].source);
  const nbsp = nbspGate(hicl);
  const changed = planted.filter((row) => row.beforeCatch !== row.afterCatch);
  const lost = planted.filter((row) => row.beforeCatch && !row.afterCatch);
  const gained = planted.filter((row) => !row.beforeCatch && row.afterCatch);
  const lostB2 = planted.filter((row) => row.beforeCatch && !row.b2Catch);
  const gainedB2 = planted.filter((row) => !row.beforeCatch && row.b2Catch);
  const five = ["3i-S8-a", "3i-S14-a", "hicl-S5-b", "clearpoint-S8-a", "clearpoint-S9-b"].map((id) => planted.find((row) => row.id === id));
  const s3 = planted.find((row) => row.id === "clearpoint-S3-a");

  const report = {
    beforeReach: planted.filter((row) => row.beforeCatch).length,
    b1Reach: planted.filter((row) => row.afterCatch).length,
    b2Reach: planted.filter((row) => row.b2Catch).length,
    changed,
    lost,
    gained,
    lostB2,
    gainedB2,
    five,
    clearpointS3: {
      beforeCatch: s3.beforeCatch,
      b1Catch: s3.afterCatch,
      b2Catch: s3.b2Catch,
      b2Reason: s3.b2Reason,
    },
    nbsp,
    planted,
    clean,
  };
  return report;
}

function main() {
  const report = collectBinding(read);
  const { planted, lost, gained, lostB2, gainedB2, five, clean, nbsp } = report;
  const s3 = planted.find((row) => row.id === "clearpoint-S3-a");
  mkdirSync(OUT, { recursive: true });
  writeFileSync(path.join(OUT, "bind.json"), `${JSON.stringify(report, null, 2)}\n`);

  const types = [...new Set(planted.map((row) => row.type))];
  console.log(`BEFORE ${report.beforeReach} B1 ${report.b1Reach} B2 ${report.b2Reach}`);
  for (const type of types) {
    const rows = planted.filter((row) => row.type === type);
    const b = rows.filter((row) => row.beforeCatch).length;
    const a = rows.filter((row) => row.afterCatch).length;
    const c = rows.filter((row) => row.b2Catch).length;
    console.log(`TYPE ${type} ${rows.length} before ${b} b1 ${a} b2 ${c}`);
  }
  console.log(`B1 LOST ${lost.length} GAINED ${gained.length}`);
  for (const row of lost) console.log(`  LOST ${row.id} ${row.afterReason}`);
  for (const row of gained) console.log(`  GAIN ${row.id} ${row.afterReason}`);
  console.log(`B2 LOST ${lostB2.length} GAINED ${gainedB2.length}`);
  for (const row of lostB2) console.log(`  LOST ${row.id} ${row.b2Reason}`);
  for (const row of gainedB2) console.log(`  GAIN ${row.id} ${row.b2Reason}`);
  console.log("FIVE");
  for (const row of five) console.log(`  ${row.id} b1=${row.afterCatch} b2=${row.b2Catch} ${row.b2Reason}`);
  console.log(`S3 b1=${s3.afterCatch} b2=${s3.b2Catch}`);
  console.log(`NBSP ${JSON.stringify(nbsp)}`);
  const b2Flags = clean.filter((row) => row.b2Flags.length);
  console.log(`CLEAN B1 ${clean.filter((row) => row.afterFlags.length).length} B2 ${b2Flags.length}`);
  for (const row of b2Flags) {
    console.log(`  ${row.doc} S${row.index} ${row.b2Flags.map((flag) => `${flag.type}:${flag.surface}:${flag.reason}`).join(" | ")}`);
    console.log(`    ${row.statement}`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
