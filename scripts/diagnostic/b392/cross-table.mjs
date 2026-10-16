/**
 * B392 cross table. No model calls. ELEMENTS.md is not revised from here.
 *
 *   node scripts/diagnostic/b392/cross-table.mjs
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { tokensForTier } from "../b387/align.mjs";
import { elementFound, extractElements, normaliseName } from "./elements.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../../..");

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

const RANK = { conflicting: 3, partially_confirmed: 2, confirmed: 1 };
const STANCE = { conflicting: "contradicted", partially_confirmed: "partial", confirmed: "supported" };
const COLS = ["contradicted", "partial", "supported", "silent"];

function assertExamples() {
  const three = extractElements("three facilities", "three facilities");
  if (!three.some((item) => item.kind === "figure" && item.written === 3)) {
    throw new Error("example failed: three facilities");
  }
  const six = extractElements("over six billion", "over six billion");
  if (!six.some((item) => item.kind === "figure" && item.written === 6 && item.scale === "billion")) {
    throw new Error("example failed: over six billion");
  }
  const billion = extractElements("a return of £3.3 billion", "a return of £3.3 billion").find((item) => item.kind === "figure");
  if (!billion || !elementFound(billion, "total return of £3,291 million")) {
    throw new Error("example failed: £3.3 billion matches £3,291 million");
  }
  const date = extractElements("signed on 13 May 2026", "signed on 13 May 2026").find((item) => item.kind === "date");
  if (!date || !elementFound(date, "dated May 13, 2026")) throw new Error("example failed: date order");
  const year = extractElements("during 2025 the group", "during 2025 the group");
  if (year.some((item) => item.kind === "figure")) throw new Error("example failed: year counted as a figure");
  if (!year.some((item) => item.kind === "date" && item.key === "2025")) throw new Error("example failed: bare year");
  const hcil = extractElements("HCIL reported", "HCIL reported").find((item) => item.kind === "name");
  if (!hcil || elementFound(hcil, "HICL reported")) throw new Error("example failed: HCIL matched HICL");
  if (!elementFound(hcil, "results from HCIL today")) throw new Error("example failed: HCIL missed");
  const percent = extractElements("grew 13%", "grew 13%").find((item) => item.kind === "figure");
  if (!percent || elementFound(percent, "the count was 13")) throw new Error("example failed: percent matched a bare figure");
  const elsewhere = extractElements("Elsewhere the group grew.", "Elsewhere the group grew.");
  if (elsewhere.some((item) => item.surface === "Elsewhere")) throw new Error("example failed: Elsewhere kept");
  const onThe = extractElements("On the hill.", "On the hill.", "on the hill");
  if (onThe.some((item) => item.surface === "On" || item.surface === "On the")) {
    throw new Error("example failed: On the kept");
  }
  const pence = extractElements("a dividend of GBP 0.365 per share", "a dividend of GBP 0.365 per share").find((item) => item.kind === "figure");
  if (!pence || !elementFound(pence, "36.5 pence per share for the year")) throw new Error("example failed: pence");
  const november = extractElements("In November 2025, the group", "In November 2025, the group").find((item) => item.kind === "date");
  if (!november || !elementFound(november, "13 November 2025, Singapore")) throw new Error("example failed: month against full date");
  const fullDate = extractElements("signed on 13 November 2025 today", "signed on 13 November 2025 today").find((item) => item.kind === "date" && item.key === "2025-11-13");
  if (!fullDate || elementFound(fullDate, "met in November 2025 only")) throw new Error("example failed: full date matched a month");
  const range = extractElements("guidance of USD 52-56 million", "guidance of USD 52-56 million").filter((item) => item.kind === "figure");
  const high = range.find((item) => item.written === 56);
  if (!high || high.unit !== "USD" || high.scale !== "million") throw new Error("example failed: range currency");
  if (!elementFound(high, "between $52.0 million and $56.0 million")) throw new Error("example failed: 56 million");
  const channel = extractElements("cross-Channel operations", "cross-Channel operations").find((item) => item.kind === "name");
  if (!channel || !elementFound(channel, "intentions for crossChannel operations")) throw new Error("example failed: crossChannel");
  const pancras = extractElements("operations from St. Pancras.", "operations from St. Pancras.").find((item) => item.kind === "name" && item.surface.startsWith("St."));
  if (!pancras || pancras.surface !== "St. Pancras" || !elementFound(pancras, "from St. Pancras today")) {
    throw new Error("example failed: St. Pancras");
  }
  const eighty = extractElements("achieved 80% year-on-year growth", "achieved 80% year-on-year growth").find((item) => item.kind === "figure");
  if (!eighty || !elementFound(eighty, "increased 80% to $5.9 million for the three months")) {
    throw new Error("example failed: 80 percent");
  }
  const ebitda = extractElements("EBITDA grew.", "EBITDA grew.");
  if (!ebitda.some((item) => item.surface === "EBITDA")) throw new Error("example failed: EBITDA dropped");
  const ceo = extractElements("appointed a new CEO", "appointed a new CEO").find((item) => item.surface === "CEO");
  if (!ceo || !elementFound(ceo, "appointed Mark Garth as Chief Executive Officer")) throw new Error("example failed: CEO expansion");
  const cfo = extractElements("appointed a new CFO", "appointed a new CFO").find((item) => item.surface === "CFO");
  if (!cfo || elementFound(cfo, "appointed Mark Garth as Chief Executive Officer")) throw new Error("example failed: CFO matched CEO");
  const fda = extractElements("FDA cleared the device.", "FDA cleared the device.");
  if (!fda.some((item) => item.surface === "FDA")) throw new Error("example failed: FDA dropped");
  const lower = "action hicl hcil fortysouth johor switzerland 3i";
  for (const word of ["Action", "HICL", "HCIL", "Fortysouth", "Johor", "Switzerland", "3i"]) {
    const text = `${word} reported results.`;
    const kept = extractElements(text, text, lower).some((item) => item.kind === "name" && item.surface === word);
    if (!kept) throw new Error(`must-keep failed: ${word}`);
  }
}

function loadJson(rel) {
  return readFile(path.join(ROOT, rel), "utf8").then((text) => JSON.parse(text));
}

function statementsOf(review) {
  if (!Array.isArray(review?.statements)) throw new Error("review has no statements");
  return review.statements.map((statement, index) => {
    const text = statement?.text;
    const cardIndex = statement?.qcCard?.index;
    if (typeof text !== "string" || !text.trim()) throw new Error(`statement ${index} has no text`);
    if (cardIndex !== index) throw new Error(`statement ${index} qcCard.index is ${cardIndex}`);
    return text;
  });
}

function looseTokenEqual(left, right) {
  if (left.key === right.key) return true;
  const num = (token) => {
    const parsed = String(token.text).replace(/[$£€¥]/g, "").replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
    return parsed ? parsed[0].replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1") : null;
  };
  const leftNum = num(left);
  const rightNum = num(right);
  if (leftNum && rightNum && leftNum === rightNum) return true;
  const alias = { gbp: "gbp", "£": "gbp", usd: "usd", $: "usd", eur: "eur", "€": "eur" };
  return Boolean(alias[left.key] && alias[left.key] === alias[right.key]);
}

function locateAll(statement, written) {
  const pieces = written.split(/([£$€]|GBP|USD|EUR)/g);
  const pattern = pieces.map((piece) => {
    if (piece === "£" || piece === "GBP") return "(?:£|GBP)\\s*";
    if (piece === "$" || piece === "USD") return "(?:\\$|USD)\\s*";
    if (piece === "€" || piece === "EUR") return "(?:€|EUR)\\s*";
    return piece.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/'/g, "['\u2019]").replace(/\s+/g, "\\s+");
  }).join("");
  const hits = [];
  for (const match of statement.matchAll(new RegExp(pattern, "g"))) {
    if (!match[0]) break;
    hits.push([match.index, match.index + match[0].length]);
  }
  if (hits.length) return hits;
  const wanted = tokensForTier(written, 1, null).filter((token) => token.key);
  const have = tokensForTier(statement, 1, null).filter((token) => token.key);
  let cursor = 0;
  const matched = [];
  for (const token of wanted) {
    let found = -1;
    for (let index = cursor; index < have.length; index += 1) {
      if (looseTokenEqual(token, have[index])) {
        found = index;
        break;
      }
    }
    if (found >= 0) {
      matched.push(have[found]);
      cursor = found + 1;
    }
  }
  if (matched.length < 2 || matched.length / wanted.length < 0.6) return [];
  return [[matched[0].start, matched[matched.length - 1].end]];
}

function overlapsSpan(start, end, hits) {
  return hits.some(([from, to]) => start < to && end > from);
}

function stanceFor(element, claims) {
  const surface = normaliseName(element.surface);
  let best = null;
  for (const claim of claims) {
    if (!Object.hasOwn(RANK, claim.verdict)) continue;
    if (!normaliseName(claim.claim).includes(surface)) continue;
    if (!best || RANK[claim.verdict] > RANK[best.verdict]) best = claim;
  }
  if (!best) return { stance: "silent", claim: null };
  return { stance: STANCE[best.verdict], claim: best };
}

function emptyTable() {
  return {
    found: { contradicted: 0, partial: 0, supported: 0, silent: 0 },
    notFound: { contradicted: 0, partial: 0, supported: 0, silent: 0 },
    total: 0,
  };
}

function addCell(table, found, stance) {
  table[found ? "found" : "notFound"][stance] += 1;
  table.total += 1;
}

function pct(n, d) {
  if (!d) return "n/a";
  return `${((100 * n) / d).toFixed(1)}%`;
}

function printTable(title, table) {
  console.log(`\n${title}  n=${table.total}`);
  console.log("row | contradicted | partial | supported | silent");
  for (const row of ["found", "notFound"]) {
    const cells = COLS.map((col) => `${table[row][col]} (${pct(table[row][col], table.total)})`);
    console.log(`${row} | ${cells.join(" | ")}`);
  }
}

async function main() {
  assertExamples();
  const labels = await loadJson("scripts/diagnostic/b385/labels.json");
  const byRun = new Map(labels.runs.map((run) => [run.runId, run]));
  const passes = {};
  for (const name of ["ids-1", "ids-2"]) {
    const file = await loadJson(`scripts/diagnostic/b390/runs/${name}/cards.json`);
    const fixtures = new Map();
    for (const fixture of file.fixtures) {
      if (fixtures.has(fixture.fixtureId)) throw new Error(`${name} duplicate fixture ${fixture.fixtureId}`);
      if (fixture.parseOk !== true) throw new Error(`${name} ${fixture.fixtureId} did not parse`);
      fixtures.set(fixture.fixtureId, fixture);
    }
    const cards = new Map();
    for (const card of file.cards) {
      const key = `${card.fixtureId}:${card.index}`;
      if (cards.has(key)) throw new Error(`${name} duplicate card ${key}`);
      if (typeof card.displayVerdict !== "string") throw new Error(`${name} card ${key} has no displayVerdict`);
      cards.set(key, card);
    }
    passes[name] = { fixtures, cards };
  }

  const rows = [];
  const navHits = [];
  for (const doc of DOCS) {
    const source = await readFile(path.join(ROOT, doc.source), "utf8");
    if (!source.trim()) throw new Error(`empty source ${doc.source}`);
    let navigation = "";
    if (doc.doc === "ClearPoint") {
      const footerAt = source.indexOf("Products Company Resources");
      const loginAt = source.indexOf("Log In  Sign Up");
      if (footerAt < 0 || loginAt < 0) throw new Error("ClearPoint navigation text missing");
      navigation = `${source.split("\n")[0]}\n${source.slice(footerAt, loginAt + "Log In  Sign Up".length)}`;
    }
    const labelRun = byRun.get(doc.runId);
    if (!labelRun) throw new Error(`missing labels for ${doc.runId}`);
    for (const side of ["doctored", "clean"]) {
      const review = await loadJson(doc[side].review);
      const statements = statementsOf(review);
      if (side === "doctored" && statements.length !== labelRun.statements) {
        throw new Error(`${doc.doc} doctored statements ${statements.length} != labels ${labelRun.statements}`);
      }
      const draft = statements.join("\n");
      const subs = side === "doctored"
        ? labelRun.entries.flatMap((entry) => entry.substitutions.map((sub) => ({ ...sub, statementIndex: entry.statementIndex })))
        : [];
      const elements = [];
      statements.forEach((text, index) => {
        for (const element of extractElements(text, draft, source)) {
          const planted = subs.filter((sub) => sub.statementIndex === index && overlapsSpan(element.start, element.end, locateAll(text, sub.written)));
          elements.push({
            doc: doc.doc,
            side,
            fixtureId: doc[side].fixtureId,
            statementIndex: index,
            statement: text,
            kind: element.kind,
            surface: element.surface,
            key: element.key || null,
            found: elementFound(element, source),
            plantedIds: planted.map((sub) => sub.id),
          });
          if (navigation && elementFound(element, navigation)) {
            navHits.push({ side, statementIndex: index, kind: element.kind, surface: element.surface });
          }
        }
      });
      for (const sub of subs) {
        const text = statements[sub.statementIndex];
        if (!text) throw new Error(`${sub.id} statement ${sub.statementIndex} missing`);
        if (!locateAll(text, sub.written).length) throw new Error(`${sub.id} written text not in statement: ${sub.written}`);
      }
      rows.push({ doc: doc.doc, side, fixtureId: doc[side].fixtureId, statements, subs, elements });
    }
  }

  const planted = rows
    .filter((row) => row.side === "doctored")
    .flatMap((row) => row.subs);
  if (planted.length !== 37) throw new Error(`expected 37 substitutions, found ${planted.length}`);
  const role = (doc, side, surface) => rows
    .find((row) => row.doc === doc && row.side === side)
    .elements.filter((element) => element.surface === surface);
  const doctoredCfo = role("HICL", "doctored", "CFO");
  const cleanCeo = role("HICL", "clean", "CEO");
  if (!doctoredCfo.length || doctoredCfo.some((element) => element.found)) {
    throw new Error("HICL doctored CFO was not a not-found element");
  }
  if (!cleanCeo.length || cleanCeo.some((element) => !element.found)) {
    throw new Error("HICL clean CEO was not found");
  }
  console.log(`assert HICL doctored CFO not-found ${doctoredCfo.length}; HICL clean CEO found ${cleanCeo.length}`);
  console.log(`A4 navigation matches ${navHits.length}`);
  for (const hit of navHits) console.log(`  NAV ${hit.side} #${hit.statementIndex} ${hit.kind} [${hit.surface}]`);

  const report = { passes: {} };
  for (const name of ["ids-1", "ids-2"]) {
    const pass = passes[name];
    const tables = { doctored: emptyTable(), clean: emptyTable() };
    const cases = { c3: [], c4clean: [], c4doctored: [] };
    const worklists = [];
    for (const row of rows) {
      const fixture = pass.fixtures.get(row.fixtureId);
      if (!fixture) throw new Error(`${name} missing fixture ${row.fixtureId}`);
      const claimsByStatement = new Map();
      for (const claim of fixture.claims) {
        if (typeof claim.verdict !== "string" || typeof claim.claim !== "string") {
          throw new Error(`${name} ${row.fixtureId} claim missing verdict or text`);
        }
        const list = claimsByStatement.get(claim.statementIndex) || [];
        list.push(claim);
        claimsByStatement.set(claim.statementIndex, list);
      }
      const annotated = row.elements.map((element) => {
        const { stance, claim } = stanceFor(element, claimsByStatement.get(element.statementIndex) || []);
        return { ...element, stance, claim: claim ? { verdict: claim.verdict, claim: claim.claim } : null };
      });
      for (const element of annotated) addCell(tables[row.side], element.found, element.stance);
      if (row.side === "doctored") {
        for (const element of annotated) {
          if (!element.found && element.stance === "supported") cases.c3.push({ pass: name, ...element });
        }
        for (const sub of row.subs) {
          const covering = annotated.filter((element) => element.statementIndex === sub.statementIndex && element.plantedIds.includes(sub.id));
          const checkCaught = covering.some((element) => !element.found);
          const modelOnly = !checkCaught && covering.some((element) => element.found && element.stance === "contradicted");
          cases.c4doctored.push({
            pass: name,
            id: sub.id,
            doc: row.doc,
            statementIndex: sub.statementIndex,
            written: sub.written,
            covering: covering.map((element) => ({ kind: element.kind, surface: element.surface, found: element.found, stance: element.stance })),
            checkCaught,
            modelOnly,
            uncovered: covering.length === 0,
          });
        }
      } else {
        const perStatement = row.statements.map((text, index) => {
          const card = pass.cards.get(`${row.fixtureId}:${index}`);
          if (!card) throw new Error(`${name} missing card ${row.fixtureId}:${index}`);
          const elements = annotated.filter((element) => element.statementIndex === index);
          const elementItems = elements.filter((element) => !(element.found && element.stance === "supported"));
          const marked = card.displayVerdict !== "supported_full";
          const interpretive = marked && elementItems.length === 0;
          return {
            index,
            marked,
            displayVerdict: card.displayVerdict,
            elementItems: elementItems.length,
            interpretive,
            items: elementItems.length + (interpretive ? 1 : 0),
          };
        });
        worklists.push({
          pass: name,
          doc: row.doc,
          statements: row.statements.length,
          items: perStatement.reduce((sum, item) => sum + item.items, 0),
          elementItems: perStatement.reduce((sum, item) => sum + item.elementItems, 0),
          interpretive: perStatement.filter((item) => item.interpretive).length,
          perStatement,
        });
        for (const element of annotated) {
          if (!element.found && element.stance === "supported") cases.c3.push({ pass: name, ...element });
          if (element.found && element.stance === "contradicted") cases.c4clean.push({ pass: name, ...element });
        }
      }
    }
    report.passes[name] = { tables, cases, worklists };
    console.log(`\n======== ${name} ========`);
    printTable("doctored", tables.doctored);
    printTable("clean", tables.clean);
    const doctoredNotFound = COLS.reduce((sum, col) => sum + tables.doctored.notFound[col], 0);
    const cleanNotFound = COLS.reduce((sum, col) => sum + tables.clean.notFound[col], 0);
    console.log(`C1 doctored not-found contradicted ${tables.doctored.notFound.contradicted} of ${doctoredNotFound} (${pct(tables.doctored.notFound.contradicted, doctoredNotFound)})`);
    console.log(`C2 doctored not-found silent ${tables.doctored.notFound.silent}`);
    console.log(`C2 clean not-found silent ${tables.clean.notFound.silent}`);
    console.log(`C3 doctored ${tables.doctored.notFound.supported} of ${doctoredNotFound} not-found (${pct(tables.doctored.notFound.supported, doctoredNotFound)})`);
    console.log(`C3 clean ${tables.clean.notFound.supported} of ${cleanNotFound} not-found (${pct(tables.clean.notFound.supported, cleanNotFound)})`);
    const modelOnly = cases.c4doctored.filter((item) => item.modelOnly);
    const uncovered = cases.c4doctored.filter((item) => item.uncovered);
    const checkCaught = cases.c4doctored.filter((item) => item.checkCaught);
    console.log(`C4 planted check-caught ${checkCaught.length} model-only ${modelOnly.length} uncovered ${uncovered.length} of ${cases.c4doctored.length}`);
    if (modelOnly.length) console.log(`C4 model-only ids ${modelOnly.map((item) => item.id).join(", ")}`);
    if (uncovered.length) console.log(`C4 uncovered ids ${uncovered.map((item) => item.id).join(", ")}`);
    console.log(`C4 clean found+contradicted ${cases.c4clean.length}`);
    const cleanFoundSupported = tables.clean.found.supported;
    console.log(`C5 clean found+supported ${cleanFoundSupported} of ${tables.clean.total} (${pct(cleanFoundSupported, tables.clean.total)})`);
    console.log(`clean not-found ${cleanNotFound} of ${tables.clean.total} (${pct(cleanNotFound, tables.clean.total)})`);
    for (const list of worklists) {
      console.log(`worklist ${list.doc}: ${list.items} items / ${list.statements} statements (${list.elementItems} element, ${list.interpretive} interpretive)`);
    }
  }

  const cleanElements = rows
    .filter((row) => row.side === "clean")
    .flatMap((row) => row.elements.map((element) => ({
      doc: element.doc,
      statementIndex: element.statementIndex,
      kind: element.kind,
      surface: element.surface,
      found: element.found,
      statement: element.statement,
    })));
  console.log(`\nclean elements ${cleanElements.length}`);
  const bySurface = new Map();
  for (const element of cleanElements) {
    const key = `${element.kind}|${element.surface}`;
    bySurface.set(key, (bySurface.get(key) || 0) + 1);
  }
  for (const [key, count] of [...bySurface.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))) {
    console.log(`ELEM ${count}\t${key}`);
  }

  await mkdir(path.join(__dirname, "runs"), { recursive: true });
  const out = {
    cleanElements,
    passes: Object.fromEntries(Object.entries(report.passes).map(([name, value]) => [name, {
      tables: value.tables,
      c3: value.cases.c3.map((item) => ({
        doc: item.doc,
        side: item.side,
        statementIndex: item.statementIndex,
        kind: item.kind,
        surface: item.surface,
        statement: item.statement,
        claim: item.claim,
        plantedIds: item.plantedIds,
      })),
      c4clean: value.cases.c4clean.map((item) => ({
        doc: item.doc,
        statementIndex: item.statementIndex,
        kind: item.kind,
        surface: item.surface,
        statement: item.statement,
        claim: item.claim,
      })),
      c4doctored: value.cases.c4doctored,
      worklists: value.worklists.map((list) => ({
        doc: list.doc,
        statements: list.statements,
        items: list.items,
        elementItems: list.elementItems,
        interpretive: list.interpretive,
        perStatement: list.perStatement,
      })),
    }])),
  };
  await writeFile(path.join(__dirname, "runs", "cross-table.json"), `${JSON.stringify(out, null, 2)}\n`);
  console.log("\nwrote scripts/diagnostic/b392/runs/cross-table.json");
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
