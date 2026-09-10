import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { FIXTURES_DIR } from "./paths.mjs";

/**
 * @param {string} [fixturesDir]
 * @returns {Promise<Array<{ filePath: string, data: object, sortKey: string }>>}
 */
export async function loadAllFixtures(fixturesDir = FIXTURES_DIR) {
  const dir = path.resolve(fixturesDir || FIXTURES_DIR);
  const names = await readdir(dir);
  const jsonFiles = names.filter((n) => n.endsWith(".json") && !n.startsWith("_")).sort();
  const out = [];
  for (const name of jsonFiles) {
    const filePath = path.join(dir, name);
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
 * Parse a comma-separated fixture id list into zero-padded ids.
 * @param {string} raw
 * @returns {string[]}
 */
export function parseIdsArg(raw) {
  return String(raw ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => String(s).padStart(2, "0"));
}

/**
 * @param {Array<{ data: object }>} fixtures
 * @param {{ ids?: string[], only?: string, range?: { from: string, to: string } }} filter
 * Precedence: ids > only > range.
 */
export function filterFixtures(fixtures, filter = {}) {
  const num = (id) => parseInt(String(id), 10);
  const pad = (id) => String(id ?? "").padStart(2, "0");
  if (Array.isArray(filter.ids) && filter.ids.length > 0) {
    const want = new Set(filter.ids.map(pad));
    return fixtures.filter((f) => want.has(pad(f.data.id)));
  }
  if (filter.only) {
    const want = pad(filter.only);
    return fixtures.filter((f) => pad(f.data.id) === want);
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
