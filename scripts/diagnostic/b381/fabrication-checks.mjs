/**
 * B381. Three checks on every claim, comment, assessment, strength,
 * and improvement the draft-review arm returned.
 *
 *   node scripts/diagnostic/b381/fabrication-checks.mjs
 *
 * Quotes: exact indexOf, then locatePassageInSource. Numbers: a
 * normalised token must occur in the draft or a source. Names: a
 * capitalised multi-word name must occur in the draft or a source.
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { locatePassageInSource } from "../../../lib/qc/excerpt-from-source.mjs";
import { accuracyJobs, realRunJobs } from "./run-draft-review.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RUNS = path.join(__dirname, "runs");
const PASSES = ["draft-1", "draft-2", "real-runs"];

const NUMBER_WORDS = {
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

const NUMBER_RE =
  /(?<![\w.])(-?)(?:(?:USD|GBP|EUR|SEK|\$|£|€)\s*)?(\d{1,3}(?:[,'\u2019]\d{3})+|\d+)(\.\d+)?(?:\s*(million|billion|percent|bn|mn|m)\b|\s*(%))?/gi;

const NAME_RE = /\b[A-Z][A-Za-z0-9.'’-]{1,}(?:\s+[A-Z][A-Za-z0-9.'’-]{1,})+\b/g;

function foldNumberWords(text) {
  return String(text).replace(
    /\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)\b/gi,
    (word) => NUMBER_WORDS[word.toLowerCase()]
  );
}

function scaleKey(raw) {
  const token = String(raw || "")
    .trim()
    .toLowerCase();
  if (token === "%" || token === "percent") return "percent";
  if (token === "m" || token === "mn" || token === "million") return "million";
  if (token === "bn" || token === "billion") return "billion";
  return "";
}

function numberKey(sign, body, frac, scale) {
    const digits = `${body}${frac || ""}`.replace(/[,'\u2019]/g, "");
  const value = Number(`${sign || ""}${digits}`);
  if (!Number.isFinite(value)) return null;
  return `${value}|${scaleKey(scale)}`;
}

export function numberTokens(text) {
  const folded = foldNumberWords(text);
  const matches = [];
  for (const match of folded.matchAll(NUMBER_RE)) {
    const scale = match[4] || match[5] || "";
    matches.push({
      index: match.index,
      end: match.index + match[0].length,
      raw: match[0],
      sign: match[1],
      body: match[2],
      frac: match[3],
      scale,
      key: numberKey(match[1], match[2], match[3], scale),
    });
  }
  for (let i = 1; i < matches.length; i += 1) {
    const prev = matches[i - 1];
    const curr = matches[i];
    if (prev.scale || !curr.scale) continue;
    const between = folded.slice(prev.end, curr.index);
    if (/^\s*(?:-|to)\s*$/i.test(between)) {
      prev.scale = curr.scale;
      prev.key = numberKey(prev.sign, prev.body, prev.frac, prev.scale);
    }
  }
  return matches.filter((match) => match.key);
}

export function numberKeySet(text) {
  return new Set(numberTokens(text).map((token) => token.key));
}

function sentencesOf(text) {
  const parts = String(text)
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.length ? parts : [String(text)];
}

function foldApostrophes(text) {
  return String(text).replace(/[\u2018\u2019]/g, "'");
}

export function capitalisedNames(text) {
  const names = [];
  for (const match of String(text).matchAll(NAME_RE)) {
    const raw = match[0].replace(/(?:'s|’s)$/i, "");
    names.push({ raw, index: match.index });
  }
  return names;
}

function nameInCorpus(name, corpus) {
  const needle = foldApostrophes(name).toLowerCase().replace(/\s+/g, " ").trim();
  const hay = foldApostrophes(corpus).toLowerCase().replace(/\s+/g, " ");
  return needle.length > 0 && hay.includes(needle);
}

function classifyPassage(sourceText, passage) {
  if (typeof sourceText !== "string" || typeof passage !== "string" || !passage) return "not_found";
  if (sourceText.indexOf(passage) !== -1) return "exact";
  const located = locatePassageInSource(sourceText, passage);
  if (located?.start != null && located?.end != null) return "normalised";
  return "not_found";
}

function findSource(sources, sourceId) {
  if (sourceId == null) return null;
  const id = String(sourceId).trim();
  return sources.find((source) => source.id === id || source.label === id) || null;
}

function corpusText(job) {
  return [job.draft, ...job.sources.map((source) => source.text)].join("\n");
}

function textUnits(record) {
  const units = [];
  for (const claim of record.claims || []) {
    if (typeof claim.comment === "string" && claim.comment.trim()) {
      units.push({
        kind: "comment",
        fixtureId: record.fixtureId,
        statementIndex: claim.statementIndex,
        text: claim.comment,
      });
    }
  }
  if (typeof record.assessment === "string" && record.assessment.trim()) {
    units.push({ kind: "assessment", fixtureId: record.fixtureId, statementIndex: null, text: record.assessment });
  }
  for (const text of record.strengths || []) {
    units.push({ kind: "strength", fixtureId: record.fixtureId, statementIndex: null, text });
  }
  for (const text of record.improvements || []) {
    units.push({ kind: "improvement", fixtureId: record.fixtureId, statementIndex: null, text });
  }
  return units;
}

function checkQuotes(record, job) {
  const counts = { passages: 0, exact: 0, normalised: 0, notFound: 0, nullPassage: 0 };
  const strikes = [];
  let commentsWithheld = 0;
  for (const claim of record.claims || []) {
    if (typeof claim.passage !== "string" || !claim.passage) {
      counts.nullPassage += 1;
      continue;
    }
    counts.passages += 1;
    const source = findSource(job.sources, claim.sourceId);
    const klass = source ? classifyPassage(source.text, claim.passage) : "not_found";
    if (klass === "exact") counts.exact += 1;
    else if (klass === "normalised") counts.normalised += 1;
    else {
      counts.notFound += 1;
      if (claim.comment.trim()) commentsWithheld += 1;
      strikes.push({
        fixtureId: record.fixtureId,
        statementIndex: claim.statementIndex,
        sourceId: claim.sourceId,
        sourceLabel: source?.label || null,
        claimedSourceMissing: !source,
        passage: claim.passage,
        comment: claim.comment,
      });
    }
  }
  return {
    counts,
    claimsLosingEvidence: counts.notFound,
    commentsWithheld,
    strikes,
  };
}

function checkNumbers(record, allowed) {
  const units = textUnits(record);
  const strikes = [];
  let unitsWithheld = 0;
  let claimsLosingEvidence = 0;
  for (const unit of units) {
    const absent = [];
    for (const sentence of sentencesOf(unit.text)) {
      for (const token of numberTokens(sentence)) {
        if (!allowed.has(token.key)) absent.push({ token, sentence });
      }
    }
    if (absent.length === 0) continue;
    unitsWithheld += 1;
    if (unit.kind === "comment") claimsLosingEvidence += 1;
    for (const hit of absent) {
      strikes.push({
        fixtureId: unit.fixtureId,
        statementIndex: unit.statementIndex,
        kind: unit.kind,
        key: hit.token.key,
        raw: hit.token.raw.trim(),
        sentence: hit.sentence,
      });
    }
  }
  return { unitsChecked: units.length, unitsWithheld, claimsLosingEvidence, commentsWithheld: unitsWithheld, strikes };
}

function checkNames(record, corpus) {
  const units = textUnits(record);
  const strikes = [];
  let unitsWithheld = 0;
  let claimsLosingEvidence = 0;
  for (const unit of units) {
    const absent = [];
    for (const sentence of sentencesOf(unit.text)) {
      for (const name of capitalisedNames(sentence)) {
        if (!nameInCorpus(name.raw, corpus)) absent.push({ name: name.raw, sentence });
      }
    }
    if (absent.length === 0) continue;
    unitsWithheld += 1;
    if (unit.kind === "comment") claimsLosingEvidence += 1;
    for (const hit of absent) {
      strikes.push({
        fixtureId: unit.fixtureId,
        statementIndex: unit.statementIndex,
        kind: unit.kind,
        name: hit.name,
        sentence: hit.sentence,
      });
    }
  }
  return { unitsChecked: units.length, unitsWithheld, claimsLosingEvidence, commentsWithheld: unitsWithheld, strikes };
}

function assertCanons() {
  const million = numberTokens("revenue of 5.9 million").map((token) => token.key);
  const short = numberTokens("revenue of $5.9m").map((token) => token.key);
  if (million.join(",") !== "5.9|million" || short.join(",") !== "5.9|million") {
    throw new Error(`5.9 million canon failed: ${million} vs ${short}`);
  }
  const word = numberTokens("three facilities").map((token) => token.key);
  const digit = numberTokens("3 facilities").map((token) => token.key);
  if (word.join(",") !== "3|" || digit.join(",") !== "3|") {
    throw new Error(`number word canon failed: ${word} vs ${digit}`);
  }
  const twenty = numberTokens("twenty").map((token) => token.key);
  if (twenty.join(",") !== "20|") throw new Error(`twenty canon failed: ${twenty}`);
  const range = numberTokens("48.0 to 52.0 million").map((token) => token.key);
  if (range.join(",") !== "48|million,52|million") {
    throw new Error(`range scale canon failed: ${range}`);
  }
  const names = capitalisedNames("Gold Peak Technology Group sold through outlets.");
  if (names.length !== 1 || names[0].raw !== "Gold Peak Technology Group") {
    throw new Error(`name scan failed: ${JSON.stringify(names)}`);
  }
}

function knownCases(clearpoint) {
  const corpus = corpusText(clearpoint);
  const allowed = numberKeySet(corpus);
  const samples = [
    {
      id: "biologics-4.1-against-4.1",
      text: "Biologics and drug delivery revenue was 4.1 million against 4.1 million.",
    },
    {
      id: "guidance-48.0-to-52.0-august-release",
      text: "The company guided to a range of 48.0 to 52.0 million in an August release.",
    },
    {
      id: "largest-on-an-invented-figure",
      text: "The neurosurgery segment is the largest, on an invented figure of 9.4 million.",
    },
  ];
  return samples.map((sample) => {
    const numbers = numberTokens(sample.text).map((token) => ({
      raw: token.raw.trim(),
      key: token.key,
      inDraftOrSource: allowed.has(token.key),
    }));
    const names = capitalisedNames(sample.text).map((name) => ({
      name: name.raw,
      inDraftOrSource: nameInCorpus(name.raw, corpus),
    }));
    return { ...sample, numbers, names };
  });
}

function printStrikes(title, strikes, render) {
  console.log(title);
  if (strikes.length === 0) {
    console.log("(none)");
    return;
  }
  for (const strike of strikes) console.log(render(strike));
}

async function readPass(name) {
  const file = path.join(RUNS, name, "cards.json");
  const doc = JSON.parse(await readFile(file, "utf8"));
  if (doc?.arm !== "b381-draft-review") throw new Error(`${file} is not a b381 draft review.`);
  return doc;
}

async function main() {
  assertCanons();
  const jobs = [...(await accuracyJobs()), ...(await realRunJobs())];
  const byId = new Map(jobs.map((job) => [job.fixtureId, job]));
  const report = { passes: {}, knownCases: null };
  for (const name of PASSES) {
    let doc;
    try {
      doc = await readPass(name);
    } catch (err) {
      if (err && err.code === "ENOENT") {
        console.log(`${name} missing, skipped`);
        continue;
      }
      throw err;
    }
    const quotes = { passages: 0, exact: 0, normalised: 0, notFound: 0, nullPassage: 0, claimsLosingEvidence: 0, commentsWithheld: 0, strikes: [] };
    const numbers = { unitsChecked: 0, unitsWithheld: 0, claimsLosingEvidence: 0, commentsWithheld: 0, strikes: [] };
    const names = { unitsChecked: 0, unitsWithheld: 0, claimsLosingEvidence: 0, commentsWithheld: 0, strikes: [] };
    for (const record of doc.fixtures || []) {
      const job = byId.get(record.fixtureId);
      if (!job) throw new Error(`No source reload for fixture ${record.fixtureId}.`);
      const quote = checkQuotes(record, job);
      const number = checkNumbers(record, numberKeySet(corpusText(job)));
      const name = checkNames(record, corpusText(job));
      quotes.passages += quote.counts.passages;
      quotes.exact += quote.counts.exact;
      quotes.normalised += quote.counts.normalised;
      quotes.notFound += quote.counts.notFound;
      quotes.nullPassage += quote.counts.nullPassage;
      quotes.claimsLosingEvidence += quote.claimsLosingEvidence;
      quotes.commentsWithheld += quote.commentsWithheld;
      quotes.strikes.push(...quote.strikes);
      for (const key of ["unitsChecked", "unitsWithheld", "claimsLosingEvidence", "commentsWithheld"]) {
        numbers[key] += number[key];
        names[key] += name[key];
      }
      numbers.strikes.push(...number.strikes);
      names.strikes.push(...name.strikes);
    }
    report.passes[name] = { quotes, numbers, names };
    console.log(
      `${name} QUOTES passages=${quotes.passages} exact=${quotes.exact} normalised=${quotes.normalised} notFound=${quotes.notFound} nullPassage=${quotes.nullPassage} claimsLosingEvidence=${quotes.claimsLosingEvidence} commentsWithheld=${quotes.commentsWithheld}`
    );
    console.log(
      `${name} NUMBERS units=${numbers.unitsChecked} withheld=${numbers.commentsWithheld} claimsLosingEvidence=${numbers.claimsLosingEvidence}`
    );
    console.log(
      `${name} NAMES units=${names.unitsChecked} withheld=${names.commentsWithheld} claimsLosingEvidence=${names.claimsLosingEvidence}`
    );
    printStrikes(`NOT FOUND ${name}`, quotes.strikes, (strike) =>
      [
        `NOT FOUND ${name} ${strike.fixtureId} statement ${strike.statementIndex} sourceId=${JSON.stringify(strike.sourceId)} label=${strike.sourceLabel || "MISSING"}`,
        strike.passage,
        "---",
      ].join("\n")
    );
    printStrikes(`NUMBER STRIKES ${name}`, numbers.strikes, (strike) =>
      `NUMBER ${name} ${strike.fixtureId} ${strike.kind} statement ${strike.statementIndex} ${strike.raw} (${strike.key})\n${strike.sentence}\n---`
    );
    printStrikes(`NAME STRIKES ${name}`, names.strikes, (strike) =>
      `NAME ${name} ${strike.fixtureId} ${strike.kind} statement ${strike.statementIndex} ${strike.name}\n${strike.sentence}\n---`
    );
  }
  const clearpoint = byId.get("2026-10-06-clearpoint");
  report.knownCases = knownCases(clearpoint);
  console.log("KNOWN CASES against the ClearPoint doctored draft and its source");
  for (const sample of report.knownCases) {
    console.log(sample.id);
    console.log(sample.text);
    for (const token of sample.numbers) {
      console.log(`  number ${token.raw} ${token.key} ${token.inDraftOrSource ? "occurs" : "ABSENT"}`);
    }
    if (sample.names.length === 0) console.log("  names: none");
    for (const name of sample.names) {
      console.log(`  name ${name.name} ${name.inDraftOrSource ? "occurs" : "ABSENT"}`);
    }
  }
  const outPath = path.join(RUNS, "fabrication.json");
  await writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`wrote ${outPath}`);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
