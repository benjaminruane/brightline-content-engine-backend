import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { FIXTURES_DIR } from "./paths.mjs";

/**
 * @returns {Promise<Array<{ filePath: string, data: object, sortKey: string }>>}
 */
export async function loadAllFixtures() {
  const names = await readdir(FIXTURES_DIR);
  const jsonFiles = names.filter((n) => n.endsWith(".json") && !n.startsWith("_")).sort();
  const out = [];
  for (const name of jsonFiles) {
    const filePath = path.join(FIXTURES_DIR, name);
    const raw = await readFile(filePath, "utf8");
    const data = JSON.parse(raw);
    const id = String(data?.id ?? name.slice(0, 2));
    out.push({
      filePath,
      data,
      sortKey: `${id.padStart(2, "0")}_${data?.label ?? name}`,
    });
  }
  out.sort((a, b) => a.sortKey.localeCompare(b.sortKey));
  return out;
}

/**
 * @param {Array<{ data: object }>} fixtures
 * @param {{ only?: string, range?: { from: string, to: string } }} filter
 */
export function filterFixtures(fixtures, filter = {}) {
  const num = (id) => parseInt(String(id), 10);
  if (filter.only) {
    const want = String(filter.only).padStart(2, "0");
    return fixtures.filter((f) => String(f.data.id).padStart(2, "0") === want);
  }
  if (filter.range) {
    const from = num(filter.range.from);
    const to = num(filter.range.to);
    return fixtures.filter((f) => {
      const n = num(f.data.id);
      return n >= from && n <= to;
    });
  }
  return fixtures;
}

/** @param {Array<{ data: object }>} fixtures @returns {Array<Array<{ data: object }>>} */
export function batchFixturesInFives(fixtures) {
  const batches = [];
  for (let i = 0; i < fixtures.length; i += 5) {
    batches.push(fixtures.slice(i, i + 5));
  }
  return batches;
}

export function fixtureRunDirName(fixture) {
  const id = String(fixture.data.id).padStart(2, "0");
  const label = String(fixture.data.label ?? "fixture").replace(/[^\w.-]+/g, "_");
  return `${id}_${label}`;
}
