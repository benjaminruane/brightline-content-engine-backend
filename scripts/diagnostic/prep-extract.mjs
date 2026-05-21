#!/usr/bin/env node
/**
 * D1.1 — One-time PDF → text extraction for diagnostic sources.
 * Reuses production extractTextFromSource (pdf-parse path in lib/extract-text-from-source.mjs).
 */

import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { extractTextFromSource } from "../../lib/extract-text-from-source.mjs";
import { loadLocalEnvFiles } from "./lib/env.mjs";
import { SOURCES_DIR, SOURCES_EXTRACTED_DIR } from "./lib/paths.mjs";

function preview(text, max = 80) {
  const oneLine = String(text ?? "").replace(/\s+/g, " ").trim();
  if (oneLine.length <= max) return oneLine;
  return `${oneLine.slice(0, max)}…`;
}

async function main() {
  loadLocalEnvFiles();
  await mkdir(SOURCES_EXTRACTED_DIR, { recursive: true });

  let names;
  try {
    names = await readdir(SOURCES_DIR);
  } catch (err) {
    console.error(`[prep-extract] cannot read sources dir: ${SOURCES_DIR}`);
    console.error(err?.message || err);
    process.exit(1);
  }

  const pdfs = names.filter((n) => n.toLowerCase().endsWith(".pdf")).sort();
  if (pdfs.length === 0) {
    console.log("[prep-extract] no PDF files in sources/ — nothing to extract.");
    return;
  }

  let failures = 0;
  for (const filename of pdfs) {
    const filePath = path.join(SOURCES_DIR, filename);
    try {
      const buffer = await readFile(filePath);
      const { text } = await extractTextFromSource(buffer, "application/pdf");
      const trimmed = String(text ?? "").trim();
      if (!trimmed) {
        console.error(`[prep-extract] FAIL empty text: ${filename}`);
        failures += 1;
        continue;
      }
      const outName = filename.replace(/\.pdf$/i, ".txt");
      const outPath = path.join(SOURCES_EXTRACTED_DIR, outName);
      await writeFile(outPath, trimmed, "utf8");
      console.log(
        `[prep-extract] ${filename} → ${outName} | chars=${trimmed.length} | preview="${preview(trimmed)}"`
      );
    } catch (err) {
      console.error(`[prep-extract] FAIL ${filename}: ${err?.message || err}`);
      failures += 1;
    }
  }

  if (failures > 0) {
    process.exit(1);
  }
  console.log(`[prep-extract] done — ${pdfs.length} file(s) written to sources-extracted/`);
}

main().catch((err) => {
  console.error("[prep-extract] fatal:", err?.message || err);
  process.exit(1);
});
