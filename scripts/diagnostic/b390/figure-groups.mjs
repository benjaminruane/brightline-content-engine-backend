/**
 * B390 Part B. Group figures in source texts. No draft. No model call.
 *
 *   node scripts/diagnostic/b390/figure-groups.mjs
 *
 * Window is 8 content words each side. Distinct words. Stopwords below are
 * removed from the shared-word test. The time exclusion reads the raw tokens
 * in that same span, so by/from/to are visible even though they are stopwords.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { numberTokens } from "../b381/fabrication-checks.mjs";
import { accuracyJobs } from "../b381/run-draft-review.mjs";
import { dateKeys } from "../b389/gate.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../../..");
const CONTENT_WINDOW = 8;
const SHARED_MIN = 3;

const NUMBER_WORD = {
  zero: "0",
  one: "1",
  two: "2",
  three: "3",
  four: "4",
  five: "5",
  six: "6",
  seven: "7",
  eight: "8",
  nine: "9",
  ten: "10",
  eleven: "11",
  twelve: "12",
  thirteen: "13",
  fourteen: "14",
  fifteen: "15",
  sixteen: "16",
  seventeen: "17",
  eighteen: "18",
  nineteen: "19",
  twenty: "20",
};

const STOP = new Set(
  `a an the of and or to in on for with by from at as is are was were be been being that this these those it its their not but if than then into over under per via we our has have had will would can may also which who them his her she he you your i they`.split(
    /\s+/
  )
);

const PERIOD_WORD = new Set(["quarter", "half", "fy", "trailing", "forecast", "expected", "by", "from", "to"]);

const REAL_SOURCES = [
  ["real-3i", "tests/fixtures/real-runs-2026-09-29/source-3i-hy25-extracted.txt"],
  ["real-hicl", "tests/fixtures/real-runs-2026-10-04-hicl/source-hicl-interim-extracted.txt"],
  ["real-gpi", "tests/fixtures/real-runs-2026-10-06-gpi/source-gpi-press-release-extracted.txt"],
  ["real-clearpoint", "tests/fixtures/real-runs-2026-10-06-clearpoint/source-clearpoint-q1-2026-extracted.txt"],
];

function foldWithMap(text) {
  const re = new RegExp(`\\b(${Object.keys(NUMBER_WORD).join("|")})\\b`, "gi");
  let folded = "";
  const map = [];
  let last = 0;
  for (const match of String(text).matchAll(re)) {
    const start = match.index;
    for (let i = last; i < start; i += 1) {
      folded += text[i];
      map.push(i);
    }
    const digit = NUMBER_WORD[match[1].toLowerCase()];
    for (let k = 0; k < digit.length; k += 1) {
      folded += digit[k];
      map.push(start);
    }
    last = start + match[0].length;
  }
  for (let i = last; i < text.length; i += 1) {
    folded += text[i];
    map.push(i);
  }
  return { folded, map };
}

function lineOf(text, index) {
  let line = 1;
  for (let i = 0; i < index && i < text.length; i += 1) {
    if (text[i] === "\n") line += 1;
  }
  return line;
}

function isContent(token) {
  const word = token.toLowerCase();
  if (STOP.has(word)) return false;
  if (/^\d/.test(word)) return false;
  return /^[a-z][a-z'’-]+$/i.test(token) && word.length >= 2;
}

function tokenize(text) {
  return String(text).match(/[A-Za-z0-9][A-Za-z0-9'’%-]*/g) || [];
}

function windowFrom(tokens, contentSide) {
  const content = [];
  const raw = [];
  for (const token of tokens) {
    raw.push(token);
    if (isContent(token)) content.push(token.toLowerCase());
    if (content.length >= contentSide) break;
  }
  return { content, raw };
}

function contextOf(text, start, end) {
  const beforeTokens = tokenize(text.slice(0, start)).reverse();
  const afterTokens = tokenize(text.slice(end));
  const before = windowFrom(beforeTokens, CONTENT_WINDOW);
  const after = windowFrom(afterTokens, CONTENT_WINDOW);
  const content = [...before.content.reverse(), ...after.content];
  const raw = [...before.raw.reverse(), ...after.raw];
  return { content: [...new Set(content)], raw, text: raw.join(" ") };
}

function unitOf(token) {
  const scale = String(token.key).split("|")[1] || "";
  if (scale === "percent") return "percent";
  const raw = String(token.raw).toUpperCase();
  let currency = "";
  if (raw.includes("USD") || raw.includes("$")) currency = "USD";
  else if (raw.includes("GBP") || raw.includes("£")) currency = "GBP";
  else if (raw.includes("EUR") || raw.includes("€")) currency = "EUR";
  else if (raw.includes("SEK")) currency = "SEK";
  return currency ? `${currency}|${scale}` : `bare|${scale}`;
}

function valueOf(token) {
  return Number(String(token.key).split("|")[0]);
}

function markers(rawTokens, windowText) {
  const years = new Set();
  const periods = new Set();
  for (const token of rawTokens) {
    if (/^(19|20)\d{2}$/.test(token)) years.add(token);
    const word = token.toLowerCase().replace(/[^a-z]/g, "");
    if (PERIOD_WORD.has(word)) periods.add(word);
    if (/^fy(19|20)\d{2}$/i.test(token)) periods.add("fy");
  }
  return { years: [...years], periods: [...periods], dates: dateKeys(windowText) };
}

function symmetricDiff(a, b) {
  const left = new Set(a);
  const right = new Set(b);
  const out = [];
  for (const item of left) if (!right.has(item)) out.push(item);
  for (const item of right) if (!left.has(item)) out.push(item);
  return out;
}

function timeExcluded(a, b) {
  const years = symmetricDiff(a.markers.years, b.markers.years);
  const periods = symmetricDiff(a.markers.periods, b.markers.periods);
  const dates = symmetricDiff(a.markers.dates, b.markers.dates);
  return { excluded: years.length + periods.length + dates.length > 0, years, periods, dates };
}

function extractFigures(doc) {
  const { folded, map } = foldWithMap(doc.text);
  const figures = [];
  for (const token of numberTokens(folded)) {
    if (!token.key) continue;
    const origStart = map[token.index] ?? 0;
    const origEnd = token.end < map.length ? map[token.end] : doc.text.length;
    const ctx = contextOf(doc.text, origStart, origEnd);
    figures.push({
      source: doc.sourceKey,
      fixture: doc.id,
      label: doc.label,
      raw: token.raw,
      key: token.key,
      value: valueOf(token),
      unit: unitOf(token),
      line: lineOf(doc.text, origStart),
      content: ctx.content,
      rawTokens: ctx.raw,
      window: ctx.text,
      markers: markers(ctx.raw, ctx.text),
    });
  }
  return figures;
}

function pairsOf(figures) {
  const pairs = [];
  for (let i = 0; i < figures.length; i += 1) {
    for (let j = i + 1; j < figures.length; j += 1) {
      const a = figures[i];
      const b = figures[j];
      if (a.unit !== b.unit) continue;
      if (a.value === b.value) continue;
      const shared = a.content.filter((word) => b.content.includes(word));
      if (shared.length < SHARED_MIN) continue;
      const time = timeExcluded(a, b);
      pairs.push({
        source: a.source,
        fixture: a.fixture,
        label: a.label,
        shared,
        a: { raw: a.raw, key: a.key, line: a.line, window: a.window, content: a.content },
        b: { raw: b.raw, key: b.key, line: b.line, window: b.window, content: b.content },
        time,
      });
    }
  }
  return pairs;
}

function hasPair(pairs, pred) {
  return pairs.some(pred);
}

async function documents() {
  const docs = [];
  const jobs = await accuracyJobs();
  for (const job of jobs) {
    for (const source of job.sources) {
      docs.push({
        id: `fixture-${job.fixtureId}`,
        sourceKey: `fixture-${job.fixtureId}:${source.id}`,
        label: `${job.label} source ${source.id} ${source.label}`,
        text: source.text,
      });
    }
  }
  for (const [id, rel] of REAL_SOURCES) {
    docs.push({ id, sourceKey: id, label: rel, text: await readFile(path.join(ROOT, rel), "utf8") });
  }
  return docs;
}

async function main() {
  const docs = await documents();
  const allPairs = [];
  let figures = 0;
  for (const doc of docs) {
    if (!doc.text.trim()) throw new Error(`${doc.id} has an empty source.`);
    const found = extractFigures(doc);
    figures += found.length;
    allPairs.push(...pairsOf(found));
  }
  const kept = allPairs.filter((pair) => !pair.time.excluded);
  const f13 = allPairs.filter((pair) => pair.fixture === "fixture-13");
  const f13kept = kept.filter((pair) => pair.fixture === "fixture-13");
  const marginPair = f13.find((pair) => {
    const keys = [pair.a.key, pair.b.key].sort();
    return keys.includes("11.1|percent") && keys.includes("13|percent");
  });
  const staff = hasPair(f13, (pair) => {
    const values = [pair.a.value, pair.b.value].sort((x, y) => x - y);
    return values[0] === 285 && values[1] === 320;
  });
  const bySource = [];
  for (const doc of docs) {
    const rows = allPairs.filter((pair) => pair.source === doc.sourceKey);
    const live = rows.filter((pair) => !pair.time.excluded);
    bySource.push({
      id: doc.sourceKey,
      raw: rows.length,
      kept: live.length,
      sameLine: live.filter((pair) => pair.a.line === pair.b.line).length,
    });
  }
  const f13Figures = [];
  for (const doc of docs) {
    if (doc.id !== "fixture-13") continue;
    for (const figure of extractFigures(doc)) {
      if (figure.key === "11.1|percent" || figure.key === "13|percent" || figure.key === "320|" || figure.key === "285|") {
        f13Figures.push({
          raw: figure.raw,
          key: figure.key,
          line: figure.line,
          content: figure.content,
          window: figure.window,
        });
      }
    }
  }
  const summary = {
    window: CONTENT_WINDOW,
    sharedMin: SHARED_MIN,
    documents: docs.length,
    figures,
    rawPairs: allPairs.length,
    keptPairs: kept.length,
    sameLineKept: kept.filter((pair) => pair.a.line === pair.b.line).length,
    bySource,
    fixture13: {
      margin11vs13: Boolean(marginPair),
      marginExcluded: marginPair ? marginPair.time.excluded : null,
      marginTime: marginPair ? marginPair.time : null,
      marginPair: marginPair || null,
      staff320vs285: staff,
      raw: f13.length,
      kept: f13kept.length,
      figures: f13Figures,
      keptPairs: f13kept,
    },
  };
  const outDir = path.join(__dirname, "runs");
  await mkdir(outDir, { recursive: true });
  const outFile = path.join(outDir, "figure-groups.json");
  await writeFile(outFile, `${JSON.stringify(summary, null, 2)}\n`);
  console.log(
    `FIGURES ${figures} docs ${docs.length} RAW PAIRS ${allPairs.length} KEPT ${kept.length}`
  );
  console.log(`FIXTURE 13 margin 11.1 vs 13: ${marginPair ? "FOUND" : "NOT FOUND"} excluded=${marginPair ? marginPair.time.excluded : "n/a"}`);
  console.log(`FIXTURE 13 staff 320 vs 285: ${staff ? "FOUND" : "NOT FOUND"}`);
  console.log(`FIXTURE 13 raw ${f13.length} kept ${f13kept.length}`);
  for (const row of bySource) console.log(`SOURCE ${row.id} raw ${row.raw} kept ${row.kept} sameLine ${row.sameLine}`);
  console.log(`wrote ${outFile}`);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
