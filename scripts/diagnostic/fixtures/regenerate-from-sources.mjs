#!/usr/bin/env node
/**
 * D1.1.1 — Build _inventory.mjs and fixture JSONs from scripts/diagnostic/sources/ only.
 */
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SOURCES_DIR = path.join(__dirname, "..", "sources");
const FIXTURES_DIR = __dirname;

const DEFAULT_CONFIG = {
  outputType: "investor_letter",
  requiredVersion: "complete",
  eventType: "new_investment",
};

const FIXTURE_18_LABEL = "synth_cross_source_pair";

/** @param {string} name */
function parseSourceFilename(name) {
  const m = name.match(/^(\d{2})([ab])?_(.+)\.(txt|pdf)$/i);
  if (!m) return null;
  return { id: m[1], suffix: m[2] || "", body: m[3], filename: name };
}

/**
 * @param {string[]} filenames
 */
function buildInventoryFromSources(filenames) {
  const parsed = filenames.map(parseSourceFilename);
  if (parsed.some((p) => p === null)) {
    const bad = filenames.filter((n) => !parseSourceFilename(n));
    throw new Error(`Unexpected source filename(s): ${bad.join(", ")}`);
  }

  /** @type {Map<string, { files: string[], bodies: string[] }>} */
  const byId = new Map();
  for (const p of parsed) {
    if (!byId.has(p.id)) byId.set(p.id, { files: [], bodies: [] });
    const row = byId.get(p.id);
    row.files.push(p.filename);
    row.bodies.push(p.body);
  }

  const ids = Array.from(byId.keys()).sort();
  if (ids.length !== 20) {
    throw new Error(`Expected 20 fixture IDs (01–20), found ${ids.length}: ${ids.join(", ")}`);
  }
  for (let n = 1; n <= 20; n++) {
    const want = String(n).padStart(2, "0");
    if (!byId.has(want)) {
      throw new Error(`Missing fixture ID ${want} in sources/`);
    }
  }
  if (filenames.length !== 21) {
    throw new Error(`Expected 21 source files, found ${filenames.length}`);
  }

  const inventory = [];
  for (let n = 1; n <= 20; n++) {
    const id = String(n).padStart(2, "0");
    const { files, bodies } = byId.get(id);
    files.sort();

    if (id === "18") {
      if (files.length !== 2) {
        throw new Error(`Fixture 18 must have exactly 2 sources; found ${files.length}`);
      }
      const hasA = files.some((f) => f.startsWith("18a_"));
      const hasB = files.some((f) => f.startsWith("18b_"));
      if (!hasA || !hasB) {
        throw new Error(`Fixture 18 must include 18a_* and 18b_* files; got ${files.join(", ")}`);
      }
      inventory.push({
        id,
        label: FIXTURE_18_LABEL,
        sources: files,
        config: { ...DEFAULT_CONFIG },
        notes: `Source pair: ${files.join(", ")}`,
      });
      continue;
    }

    if (files.length !== 1) {
      throw new Error(`Fixture ${id} must have exactly 1 source; found ${files.length}: ${files.join(", ")}`);
    }
    const label = bodies[0];
    inventory.push({
      id,
      label,
      sources: files,
      config: { ...DEFAULT_CONFIG },
      notes: `Source: ${files[0]}`,
    });
  }

  return inventory;
}

function inventoryToModuleSource(inventory) {
  const lines = [
    "/**",
    " * D1.1.1 — Generated from scripts/diagnostic/sources/ (do not edit by hand; run regenerate-from-sources.mjs).",
    " */",
    "export const FIXTURE_INVENTORY = " + JSON.stringify(inventory, null, 2) + ";",
    "",
  ];
  return lines.join("\n");
}

async function main() {
  const entries = await readdir(SOURCES_DIR);
  const filenames = entries
    .filter((n) => !n.startsWith(".") && (n.endsWith(".txt") || n.endsWith(".pdf")))
    .sort();

  console.log(`[regenerate] sources/: ${filenames.length} file(s)`);
  const inventory = buildInventoryFromSources(filenames);

  await writeFile(path.join(FIXTURES_DIR, "_inventory.mjs"), inventoryToModuleSource(inventory), "utf8");

  for (const row of inventory) {
    const body = {
      id: row.id,
      label: row.label,
      sources: row.sources,
      draft: "PLACEHOLDER",
      config: row.config,
      notes: row.notes,
    };
    const jsonName = `${row.id}_${row.label}.json`;
    await writeFile(path.join(FIXTURES_DIR, jsonName), `${JSON.stringify(body, null, 2)}\n`, "utf8");
    console.log(`[regenerate] wrote ${jsonName}`);
  }

  console.log(`[regenerate] done — ${inventory.length} fixtures from ${filenames.length} sources`);
}

main().catch((err) => {
  console.error("[regenerate] fatal:", err?.message || err);
  process.exit(1);
});
