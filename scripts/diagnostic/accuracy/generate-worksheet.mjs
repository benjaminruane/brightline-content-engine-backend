#!/usr/bin/env node
/**
 * Blind worksheet. This file must not import pipeline output.
 * Sources and draft-order statements only.
 */

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { filterFixtures, loadAllFixtures } from "../lib/fixtures.mjs";
import { loadPipelineSources } from "../lib/sources.mjs";
import { padFixtureId } from "./lib.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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

Work fixture by fixture. Read the source once. Then label the listed statements in the order given (draft order).`;

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

export function buildWorksheetMarkdown({ fixtures, sourcesById, sampledByFixture }) {
  const parts = [COVER_PAGE, ""];
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

export async function generateWorksheet({ statementsDoc, manifest, loadFixtures, loadSources }) {
  const fixtures = filterFixtures(await loadFixtures(), { range: { from: "01", to: "20" } });
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
  return buildWorksheetMarkdown({ fixtures, sourcesById, sampledByFixture });
}

async function main() {
  const statementsDoc = JSON.parse(await readFile(path.join(__dirname, "statements.json"), "utf8"));
  const manifest = JSON.parse(await readFile(path.join(__dirname, "sample-manifest.json"), "utf8"));
  const md = await generateWorksheet({
    statementsDoc,
    manifest,
    loadFixtures: loadAllFixtures,
    loadSources: loadPipelineSources,
  });
  const outPath = path.join(__dirname, "worksheet.md");
  await writeFile(outPath, md, "utf8");
  console.log(`wrote ${outPath} chars=${md.length}`);
}

if (runningAsMain()) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
