#!/usr/bin/env node
/**
 * Blind worksheet. This file must not import pipeline output.
 * Sources and draft-order statements only.
 *
 *   node scripts/diagnostic/accuracy/generate-worksheet.mjs \
 *     --manifest path --statements path --out path [--ids 01,03]
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { filterFixtures, loadAllFixtures, parseIdsArg } from "../lib/fixtures.mjs";
import { loadPipelineSources } from "../lib/sources.mjs";
import { assertNotP29ProtectedWrite, padFixtureId, writeAccuracyFile } from "./lib.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const DEFAULT_STATEMENTS_PATH = path.join(__dirname, "statements.json");
export const DEFAULT_MANIFEST_PATH = path.join(__dirname, "sample-manifest.json");
export const DEFAULT_OUT_PATH = path.join(__dirname, "worksheet.md");
export const DEFAULT_RANGE = { from: "01", to: "20" };

export const COVER_PAGE = `ACCURACY LABELLING WORKSHEET

You are labelling 100 statements against the sources on this page. The pipeline's answers are not here. Do not try to remember what Review said.

Labels (pick one):
C  Confirmed. The sources support the statement.
P  Partially confirmed. The sources support some of it, not all.
X  Conflicting. A source contradicts the statement.
N  No support. The sources do not address it.
E  Cannot rate. This is not a proper statement, or you cannot tell from these sources. If you would be guessing, use E. A wrong guess is worse than E.

Conflict rule: if ANY uploaded source contradicts the statement, the label is X (Conflicting), even where another source or passage confirms it. A contradicting source is exactly what a reviewer must see. When a false red trades against a false green, keep the false red.

Older sources: if the draft matches the most recent source and only an older source disagrees, the label is C (Confirmed). Treat the older figure as out of date, not as a contradiction. If you cannot tell which source is more recent, label X.

Mixed statements: judge the whole sentence and let the most serious problem decide. If any part is contradicted by a source, label X even if the rest is fine. Otherwise, if some parts are supported and some are not, label P. If nothing in the statement is addressed at all, label N. If all of it is supported, label C.

Contradicted is not the same as quiet. A source that positions a transaction as still pending contradicts a claim that it is done. A source that simply never says what happened next does not: that is P, not X.

Intensifiers. An intensifier the source does not offer is unsupported, so P. An intensifier the source matches in strength is C.

Attribution. A correct figure credited to only some of the causes the source names is partly unsupported, so P.

Escalation and broadening. Raising the degree of a claim, or widening its scope, without source backing is unsupported rather than contradicted, so P.

Stripped alternatives. Dropping a source's stated either/or and asserting one branch as expected contradicts the source's own hedge, so X.

Severed antecedents. Where the split leaves a sentence unable to identify what it refers to, label P. Reserve E for sentences that are genuinely malformed.

Paraphrase. A fragment or reworded list item that carries the source's meaning is confirmed. Form is not the test.

Implied but not stated. A detail the source strongly implies but never states is not addressed.

Work fixture by fixture. Read the source once. Then label the listed statements in the order given (draft order).`;

export const COVER_PAGE_CORPUS2_EXTRA = `UNFALSIFIABLE FAULTS. Where a statement invents something the sources never address, the correct card is no support, not conflicting. Any verdict other than confirmed counts as a catch.

COMPOUND FAULTS. A statement carrying more than one error shape is assigned one owning shape. The second is tagged and counts in no denominator.

TABLE CELLS. Where a figure can only be settled by reading a row against a column in a flattened table, there is no C, P or X target. The pass condition is that the tool must not return confirmed.`;

export function coverPage({ corpus2 = false } = {}) {
  if (!corpus2) return COVER_PAGE;
  return `${COVER_PAGE}

${COVER_PAGE_CORPUS2_EXTRA}`;
}

export function parseWorksheetArgs(argv) {
  const out = { manifest: null, statements: null, out: null, ids: [], fixturesDir: null };
  const args = Array.isArray(argv) ? argv : [];
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === "--manifest" && args[i + 1]) out.manifest = args[++i];
    else if (args[i] === "--statements" && args[i + 1]) out.statements = args[++i];
    else if (args[i] === "--out" && args[i + 1]) out.out = args[++i];
    else if (args[i] === "--ids" && args[i + 1]) out.ids = parseIdsArg(args[++i]);
    else if (args[i] === "--fixtures-dir" && args[i + 1]) out.fixturesDir = args[++i];
  }
  return out;
}

function runningAsMain() {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return import.meta.url === pathToFileURL(path.resolve(entry)).href;
  } catch {
    return false;
  }
}

function fence(text) {
  return String(text ?? "").replace(/```/g, "'''");
}

function cell(text) {
  return String(text ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
}

export function buildWorksheetMarkdown({ fixtures, sourcesById, sampledByFixture, cover = COVER_PAGE }) {
  const parts = [cover, ""];
  const ids = [...sampledByFixture.keys()].sort();
  for (const id of ids) {
    const fx = fixtures.find((f) => padFixtureId(f.data.id) === id);
    const label = fx?.data?.label ?? "";
    const outputType = fx?.data?.config?.outputType ?? "";
    const visibility = fx?.data?.config?.requiredVersion ?? "";
    parts.push(`## F${id} ${label}`);
    parts.push("");
    parts.push(`Output type: ${outputType}. Visibility: ${visibility}.`);
    parts.push("");
    const sources = sourcesById.get(id) || [];
    for (const src of sources) {
      parts.push(`### Source: ${src.label}`);
      parts.push("");
      parts.push("```");
      parts.push(fence(src.text));
      parts.push("```");
      parts.push("");
    }
    parts.push("| # | Statement | Label | Note |");
    parts.push("| --- | --- | --- | --- |");
    const rows = sampledByFixture.get(id) || [];
    rows.sort((a, b) => a.index - b.index);
    let n = 1;
    for (const row of rows) {
      parts.push(`| ${n} | ${cell(row.statementText)} |  |  |`);
      n += 1;
    }
    parts.push("");
  }
  return `${parts.join("\n")}\n`;
}

export async function generateWorksheet({ statementsDoc, manifest, loadFixtures, loadSources, ids, cover }) {
  const filter =
    Array.isArray(ids) && ids.length > 0 ? { ids } : { range: DEFAULT_RANGE };
  const fixtures = filterFixtures(await loadFixtures(), filter);
  const sampledByFixture = new Map();
  const add = (row) => {
    const id = padFixtureId(row.fixtureId);
    if (!sampledByFixture.has(id)) sampledByFixture.set(id, []);
    sampledByFixture.get(id).push(row);
  };
  for (const row of manifest.groupA) add(row);
  for (const row of manifest.groupB) add(row);
  const sourcesById = new Map();
  for (const id of sampledByFixture.keys()) {
    const fx = fixtures.find((f) => padFixtureId(f.data.id) === id);
    const entries = fx?.data?.sources ?? [];
    sourcesById.set(id, await loadSources(entries));
  }
  return buildWorksheetMarkdown({
    fixtures,
    sourcesById,
    sampledByFixture,
    cover: cover ?? COVER_PAGE,
  });
}

export async function writeWorksheet({
  manifestPath,
  statementsPath,
  outPath,
  ids,
  fixturesDir,
  loadFixtures,
  loadSources = loadPipelineSources,
  cover,
}) {
  const resolvedOut = path.resolve(outPath);
  assertNotP29ProtectedWrite(resolvedOut);
  const statementsDoc = JSON.parse(await readFile(path.resolve(statementsPath), "utf8"));
  const manifest = JSON.parse(await readFile(path.resolve(manifestPath), "utf8"));
  const load = loadFixtures ?? (() => loadAllFixtures(fixturesDir));
  const corpus2 = String(fixturesDir ?? "").includes("accuracy2");
  const md = await generateWorksheet({
    statementsDoc,
    manifest,
    loadFixtures: load,
    loadSources,
    ids,
    cover: cover ?? coverPage({ corpus2 }),
  });
  await writeAccuracyFile(resolvedOut, md);
  return { outPath: resolvedOut, markdown: md };
}

async function main() {
  const args = parseWorksheetArgs(process.argv.slice(2));
  const { outPath } = await writeWorksheet({
    manifestPath: args.manifest ? path.resolve(args.manifest) : DEFAULT_MANIFEST_PATH,
    statementsPath: args.statements ? path.resolve(args.statements) : DEFAULT_STATEMENTS_PATH,
    outPath: args.out ? path.resolve(args.out) : DEFAULT_OUT_PATH,
    ids: args.ids,
    fixturesDir: args.fixturesDir,
  });
  console.log(`wrote ${outPath}`);
}

if (runningAsMain()) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
