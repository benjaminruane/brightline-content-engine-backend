import { readFile, copyFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { SOURCES_DIR, SOURCES_EXTRACTED_DIR } from "./paths.mjs";

/**
 * @param {string} filename
 * @returns {Promise<{ text: string, resolvedFrom: string }>}
 */
export async function resolveSourceText(filename) {
  const base = path.basename(filename);
  if (base.endsWith(".txt")) {
    const filePath = path.join(SOURCES_DIR, base);
    const text = await readFile(filePath, "utf8");
    return { text, resolvedFrom: filePath };
  }
  if (base.endsWith(".pdf")) {
    const txtName = base.replace(/\.pdf$/i, ".txt");
    const filePath = path.join(SOURCES_EXTRACTED_DIR, txtName);
    try {
      const text = await readFile(filePath, "utf8");
      return { text, resolvedFrom: filePath };
    } catch (err) {
      const hint = `Missing extracted text for PDF "${base}". Run: npm run qc:diag:prep`;
      const e = new Error(`${hint} (expected ${filePath})`);
      e.cause = err;
      throw e;
    }
  }
  throw new Error(`Unsupported source filename (expected .txt or .pdf): ${filename}`);
}

/**
 * @param {string[]} sourceFilenames
 * @returns {Promise<Array<{ text: string, label: string }>>}
 */
export async function loadPipelineSources(sourceFilenames) {
  const rows = [];
  for (let i = 0; i < sourceFilenames.length; i++) {
    const filename = sourceFilenames[i];
    const { text } = await resolveSourceText(filename);
    const label = filename.replace(/\.(txt|pdf)$/i, "");
    rows.push({ text, label });
  }
  return rows;
}

/**
 * @param {string} destDir
 * @param {string[]} sourceFilenames
 */
export async function copySourcesToRunDir(destDir, sourceFilenames) {
  await mkdir(destDir, { recursive: true });
  for (const filename of sourceFilenames) {
    const base = path.basename(filename);
    let from;
    if (base.endsWith(".txt")) {
      from = path.join(SOURCES_DIR, base);
    } else if (base.endsWith(".pdf")) {
      from = path.join(SOURCES_EXTRACTED_DIR, base.replace(/\.pdf$/i, ".txt"));
    } else {
      continue;
    }
    const destName = base.endsWith(".pdf") ? base.replace(/\.pdf$/i, ".txt") : base;
    await copyFile(from, path.join(destDir, destName));
  }
}
