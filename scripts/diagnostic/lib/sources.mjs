import { readFile, copyFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { normalizePublicationState } from "../../../lib/source-publication-state.mjs";
import { SOURCES_DIR, SOURCES_EXTRACTED_DIR } from "./paths.mjs";

/**
 * @param {string | { file?: string, filename?: string, publicationState?: string }} entry
 * @returns {string}
 */
function sourceEntryFilename(entry) {
  if (typeof entry === "string") return entry;
  if (entry && typeof entry === "object") {
    const name =
      (typeof entry.file === "string" && entry.file.trim()) ||
      (typeof entry.filename === "string" && entry.filename.trim()) ||
      "";
    return name;
  }
  return "";
}

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
 * @param {Array<string | { file?: string, filename?: string, publicationState?: string }>} sourceEntries
 * @returns {Promise<Array<{ text: string, label: string, publicationState: string }>>}
 */
export async function loadPipelineSources(sourceEntries) {
  const rows = [];
  const entries = Array.isArray(sourceEntries) ? sourceEntries : [];
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const filename = sourceEntryFilename(entry);
    if (!filename) continue;
    const { text } = await resolveSourceText(filename);
    const label = filename.replace(/\.(txt|pdf)$/i, "");
    const publicationState = normalizePublicationState(
      entry && typeof entry === "object" ? entry.publicationState : undefined
    );
    rows.push({ text, label, publicationState });
  }
  return rows;
}

/**
 * @param {string} destDir
 * @param {Array<string | { file?: string, filename?: string, publicationState?: string }>} sourceEntries
 */
export async function copySourcesToRunDir(destDir, sourceEntries) {
  await mkdir(destDir, { recursive: true });
  const entries = Array.isArray(sourceEntries) ? sourceEntries : [];
  for (const entry of entries) {
    const filename = sourceEntryFilename(entry);
    if (!filename) continue;
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
